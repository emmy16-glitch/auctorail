# Residual-Risk Analysis and Production Hardening Strategy

**System:** ProofGate authorization and controlled-execution repository
**Source assessment:** `security-audit-report.md`
**Assessment context:** Local, offline-first testing; no live funds, production infrastructure, or blockchain writes
**Purpose:** Translate residual audit findings into production deployment controls and objective release gates

> The audit demonstrates that the tested authorization paths contained the tested mutations and replay attempts. It does **not** establish production readiness by itself, because the highest-impact residual risks concern topology, durable state, dependency supply chain, operational recovery, external-network ambiguity, and deployment governance.

## 1. Risk posture

The current implementation should be treated as a **security-strong prototype or single-node testnet component**, not as a production treasury authorization service. The cryptographic and semantic binding improvements address the most direct authorization bypasses found during testing. Production risk now shifts from basic permit correctness toward **availability, consistency, key custody, recovery, observability, and operational misuse**.

| Risk | Current state | Production impact | Priority |
|---|---|---|---|
| Distributed permit-consumption state | Local filesystem store; one-host concurrency tested | Split-brain or replay exposure if workers do not share one atomic durable store | **P0** |
| Crash recovery and ambiguous writes | Local semantics tested; live reconciliation not tested | Duplicate payments or unresolved authorization state after process/provider failure | **P0** |
| Signing-secret custody | HMAC secret loaded by application configuration | Compromise can mint valid permits for any otherwise accepted action | **P0** |
| External RPC and x402 dependency integrity | Offline mocks/tests | Incorrect network, token, recipient, or settlement interpretation can cause loss | **P0** |
| Smart-contract/deployment assurance | Minimal vendor contract spot-reviewed only | Deployed-address or bytecode mismatch can invalidate assumptions | **P1** |
| Dependency vulnerabilities | `solc`/`tmp` audit findings remain | Build compromise or developer-environment exposure | **P1** |
| Observability and incident response | Test evidence exists; production SLOs/runbooks not established | Delayed detection and unsafe manual recovery | **P1** |
| Lint and secure CI gates | No dedicated lint gate | Preventable code-quality and review regressions | **P2** |

## 2. P0 hardening requirements before production

### 2.1 Replace the local file store with a shared atomic claim service

The current `FilePermitConsumptionStore` uses exclusive file creation and behaved correctly under the eight-worker, shared-filesystem test. That result should not be generalized to multiple hosts, containers with separate volumes, network filesystems with weak locking semantics, or autoscaled workers.

Implement a production store with one authoritative datastore and a unique constraint over the permit identity. The claim operation should be a single atomic transaction, for example:

```sql
CREATE TABLE permit_consumptions (
  permit_id       TEXT        NOT NULL,
  nonce           TEXT        NOT NULL,
  consumed_at     TIMESTAMPTZ NOT NULL,
  execution_id    UUID        NOT NULL,
  PRIMARY KEY (permit_id, nonce)
);
```

The executor should perform an insert and interpret a uniqueness conflict as replay. It should distinguish a conflict from infrastructure failure. A storage timeout, unavailable primary, serialization failure after an unknown commit result, or connection loss must not be silently treated as replay or success.

Use a single-writer or strongly consistent transactional topology for this table. If Redis is selected, use a durable deployment with replication, persistence, bounded TTL policy, and a carefully reviewed atomic `SET NX` or Lua-based claim; do not use an ephemeral cache as the sole authority. If a relational database is selected, require synchronous durability appropriate to the value at risk and test failover behavior.

**Release gates:** demonstrate that 2, 5, 10, 25, 50, and 100 concurrent requests for one permit produce exactly one successful claim across multiple application instances; demonstrate that a datastore failover never causes two claims; and verify that restart does not erase consumption state.

### 2.2 Make execution state a durable state machine

Permit consumption alone does not fully describe payment lifecycle. Add a durable execution record keyed by a unique `execution_id` and bind it to the permit ID, action hash, mandate hash, decision hash, and intended chain/network. Use explicit monotonic states such as:

```text
AUTHORIZED → CLAIMED → SUBMITTING → BROADCAST
BROADCAST → CONFIRMED | REJECTED | AMBIGUOUS
CLAIMED → FAILED
AMBIGUOUS → RECONCILING → CONFIRMED | REJECTED | AMBIGUOUS
```

Disallow terminal-state reopening and disallow a second submission for an execution that is `BROADCAST`, `AMBIGUOUS`, or `RECONCILING` unless a reconciliation policy explicitly proves that no transaction was accepted. Manual operators should not be able to transition directly from `AMBIGUOUS` to `SUBMITTING`.

Persist the provider request identifier, transaction hash when known, chain ID, nonce, sender address, gas parameters, and receipt observations. The system should be able to answer whether a payment was never submitted, submitted once, confirmed, rejected, or remains unknown without relying on process memory.

**Release gates:** kill workers at every state boundary, restart them, and prove that recovery resumes reconciliation instead of blindly re-submitting. Inject timeouts immediately before and after broadcast, provider disconnects, delayed receipts, contradictory provider answers, and nonce conflicts.

### 2.3 Move permit signing to a dedicated key boundary

The HMAC secret is a root authorization capability. Anyone who obtains it can generate a valid signature over a permit payload. Do not expose it to browser code, agent prompts, logs, crash dumps, general-purpose application workers, or CI output.

For a stronger production boundary, replace application-held HMAC signing with a dedicated signing service or HSM/KMS-backed asymmetric key. The signer should accept a structured, policy-approved authorization request and return a signature only after server-side validation. Separate the **policy decision service**, **permit signer**, and **executor** privileges where practical so compromise of one component does not automatically grant all capabilities.

At minimum, use a secret manager with automatic rotation, versioned key identifiers, access policies, audit logs, startup validation, and emergency revocation. Avoid logging serialized permits if they contain reusable signed authorization material. Use a distinct key per environment and, preferably, per authorization domain or asset/chain lane.

**Release gates:** prove that secrets are absent from client bundles, logs, telemetry, test fixtures, and container images; rotate the key in a staging environment; revoke a compromised key; and verify that old permits are rejected according to the documented rotation policy.

### 2.4 Introduce independent transaction-intent verification

The executor should independently validate the final transaction request against the Action Contract immediately before submission. Do not rely only on a higher-level payment gateway to construct the transaction. Validate chain ID, sender account, token contract, token decimals, recipient, raw amount, calldata selector, and any fee or gas policy.

For ERC-20 transfers, decode the calldata and compare the decoded recipient and amount with the Action Contract. Verify that the configured token address has the expected runtime bytecode and, where applicable, a known code hash. Verify the sender identity and network returned by the provider. Reject chain-ID mismatches even if the RPC endpoint responds successfully.

**Release gates:** test calldata mutation, wrong-token substitution, wrong-decimal conversion, chain confusion, recipient checksum/case changes, provider misconfiguration, and a malicious or incorrect RPC response in a controlled integration environment.

## 3. P1 hardening requirements

### 3.1 Add live reconciliation and provider-failover controls

The audit’s simulated `FAILED` and `AMBIGUOUS` distinctions are correct, but production providers can fail in ways that are not observable at the moment of broadcast. Use at least two independently operated RPC providers for read reconciliation, but do not treat provider disagreement as permission to retry. Provider failover should preserve the same semantic action and execution ID.

Record the exact RPC endpoint class, request ID, response timestamps, and block references. Reconcile by transaction hash and sender nonce, not only by an application-level response. If the transaction hash is unknown, query by sender and nonce where safe, then retain `AMBIGUOUS` until the evidence is sufficient. Set explicit operator escalation thresholds for unresolved ambiguity.

### 3.2 Harden evidence provenance and freshness

Persist raw evidence, normalized evidence, signal hash, source identity, received time, and decision hash together. Require the production policy to enforce freshness, applicability, confidence, required intent, and provenance rather than assuming that a syntactically valid decision object is trustworthy.

Use an allowlist of accepted evidence schemas and miner identities. Reject unknown schema versions and unrecognized miners. Bind the evidence set to an immutable decision record and prevent later evidence replacement under the same decision ID. Keep clock synchronization monitored; use a trusted time source for freshness checks.

### 3.3 Add deployment and contract attestation

The vendor contract is intentionally minimal, but production assurance still requires proving that the deployed address contains the reviewed bytecode. Record the deployment chain ID, address, compiler version, optimizer configuration, source hash, bytecode hash, constructor arguments, and verification status. Make the executor reject an address that is not in an approved deployment manifest.

If the destination contract is expected to be non-upgradeable, verify that the deployed bytecode and code hash match the reviewed artifact. Monitor for unexpected code changes at configured destinations and fail closed if the runtime code changes.

### 3.4 Improve dependency and build supply-chain controls

Treat the `solc`/`tmp` findings as a build-pipeline issue even if the vulnerable path is not used at runtime. Separate compiler/deployment tooling from the production execution image. Pin dependencies with a reviewed lockfile, generate an SBOM, scan direct and transitive dependencies in CI, and define an exception process with owner, rationale, expiration, and compensating controls.

Use reproducible builds where feasible. Verify package provenance and signatures, restrict install scripts in build environments unless required, and make production images contain only runtime dependencies. Add a CI job that fails on newly introduced high or critical vulnerabilities and reports lower-severity findings for triage.

### 3.5 Establish observability and incident response

Emit structured, privacy-safe audit events for proposal, evidence receipt, policy decision, permit issuance, claim, submission, provider response, reconciliation, receipt creation, and operator intervention. Correlate all events with an execution ID and action hash. Never log HMAC secrets, private keys, full authorization tokens, or sensitive raw provider payloads without redaction.

Create alerts for repeated invalid permits, replay spikes, storage failures, ambiguous executions, provider disagreement, unexpected chain/token addresses, signing-key use outside normal volume, and any execution without a matching durable decision record. Define runbooks for key compromise, provider compromise, database failover, duplicate-payment suspicion, and stuck ambiguity.

## 4. P2 engineering and governance hardening

Add a dedicated lint and formatting gate, strict dependency review, mutation testing for authorization modules, and code-owner approval for changes to hashing, permit verification, policy evaluation, stores, gateways, and transaction construction. Require security-sensitive changes to include a regression test and a negative test demonstrating that the protected callback is not reached.

Set explicit coverage thresholds for security-critical modules rather than relying only on repository-wide coverage. The current report shows 75.45% line/statement coverage, 88.95% function coverage, and 70.90% branch coverage. The branch figure is especially relevant for failure paths; raise thresholds incrementally for `permit.ts`, `controlled-executor.ts`, `permit-store.ts`, `payment-gateway.ts`, and transaction construction code.

Use independent review for production policy changes. A policy change that expands allowed destinations, chains, assets, amount limits, confidence thresholds, or evidence freshness should require approval, versioned migration, and a rollback plan. Never silently interpret an older permit under a newer policy.

## 5. Recommended production architecture

A defensible production topology separates responsibilities into the following components:

| Component | Responsibility | Must not do |
|---|---|---|
| Proposal service | Construct candidate Action Contracts | Authorize or sign permits |
| Evidence gateway | Fetch, authenticate, normalize, and store evidence | Convert miner output directly into permission |
| Policy service | Produce immutable versioned decisions | Submit blockchain transactions |
| Permit signer | Sign only validated, exact-action authorization payloads | Accept arbitrary client-supplied signatures |
| Shared claim store | Atomically consume permits and execution IDs | Serve as an eventually consistent cache |
| Executor | Re-verify, claim, construct, and submit exact transaction | Retry ambiguous writes blindly |
| Reconciler | Resolve broadcast/receipt uncertainty | Create new authorization implicitly |
| Audit store | Immutable event and receipt retention | Be mutable application scratch space |
| Operator control plane | Approve exceptional recovery actions | Bypass permit, policy, or state-machine checks |

## 6. Prioritized implementation sequence

| Phase | Work | Exit criterion |
|---|---|---|
| 0 — Release hold | Keep production funds disabled; use testnet or zero-value canaries | No P0 risk accepted without a documented exception |
| 1 — State authority | Implement shared atomic claim store and durable execution state machine | Multi-host race, restart, failover, and crash tests pass |
| 2 — Key boundary | Integrate KMS/HSM-backed signing, rotation, revocation, and access audit | Key compromise and rotation drills pass |
| 3 — Transaction integrity | Add independent calldata, chain, token, sender, and destination verification | Mutation and provider-confusion integration tests pass |
| 4 — Reconciliation | Add multi-provider read reconciliation and ambiguity runbooks | No blind retry under any injected uncertainty |
| 5 — Evidence and deployment | Add provenance enforcement, deployment manifests, code-hash checks, and freshness monitoring | Invalid evidence/deployment states fail closed |
| 6 — Supply chain and operations | Isolate compiler tools, add SBOM/scanning/lint, alerts, and incident drills | CI and operational readiness review approved |
| 7 — Controlled rollout | Use capped limits, allowlisted destinations, canaries, and staged expansion | Observed SLOs and zero unauthorized executions over the canary period |

## 7. Production acceptance checklist

Before enabling any consequential production action, obtain affirmative evidence for each item below:

- A shared strongly consistent permit-claim store exists and has been tested across independent hosts.
- Permit consumption and execution lifecycle are durable, queryable, and restart-safe.
- The signing secret is isolated in KMS/HSM or an equivalently controlled signing boundary.
- Key rotation, revocation, and emergency disablement have been rehearsed.
- The executor independently verifies chain, sender, token, calldata, recipient, amount, and deployment code hash.
- Ambiguous writes enter reconciliation and cannot be automatically retried as new submissions.
- Evidence schemas, miner identities, freshness, applicability, and confidence thresholds are enforced in production policy.
- Production dependencies are pinned, scanned, minimized, and accompanied by an SBOM.
- Alerts and incident runbooks exist for replay, storage outage, ambiguous transactions, key compromise, provider disagreement, and policy drift.
- Security-critical modules have explicit branch-coverage and mutation-testing gates.
- An independent reviewer has approved the smart contract deployment and production configuration.
- Initial limits are materially below the maximum authorized amount, with allowlisted destinations and a rapid kill switch that does not create a bypass path.

## Final assessment

The implemented fixes materially improve ProofGate’s direct authorization integrity. The remaining production blockers are primarily **state authority, key custody, transaction reconciliation, and operational control** rather than the basic permit-hash logic. Production deployment should therefore be gated on P0 controls, not merely on the current green unit-test and fuzzing results.

The safest next engineering step is to implement a shared durable claim store plus a durable execution state machine, then run the existing adversarial corpus against multiple worker instances and injected datastore/provider failures. Until that work is complete, keep the system single-node, capped, allowlisted, and testnet-only.

## References

[1]: https://github.com/emmy16-glitch/proof-gate "ProofGate repository"
[2]: https://vitest.dev/guide/coverage.html "Vitest coverage documentation"
[3]: https://docs.npmjs.com/cli/v10/commands/npm-audit "npm audit documentation"
