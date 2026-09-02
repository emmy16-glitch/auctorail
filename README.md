# ProofGate

**Agent confidence is not permission to act.**

ProofGate is a pre-execution authorization control plane for autonomous AI agents. An agent may decide what it wants to do, but it cannot authorize its own irreversible action.

ProofGate binds delegated authority, independently obtained Telegraph evidence, deterministic policy, a short-lived permit, durable replay protection, exact transaction intent, and a tamper-evident receipt around one proposed action.

`MANDATE → PROPOSE → PROVE → POLICY → PERMIT → EXECUTE → RECEIPT`

Built for the **Telegraph Protocol Application Track**.

## Why ProofGate exists

Autonomous agents can reason, plan and choose actions, but a high-confidence model output is not an authorization boundary. For consequential actions such as payments, the system needs an enforceable answer to a different question:

> Is this exact action currently permitted under the authority that was delegated to this agent, using sufficient independent evidence?

ProofGate answers that question before execution.

Telegraph provides external intelligence. ProofGate decides whether that evidence satisfies policy for one exact action. A Miner verdict such as `ALLOW`, `SAFE` or `VALID` is evidence only; it never directly becomes permission.

## Flagship demonstration

The hackathon demo protects an autonomous treasury payment of **1 Base Sepolia USDC** to the deployed `ProofGateVendor` contract.

Canonical vendor:

`0xB38d0405DF1b15961aEf29C7c45f2ED285822c14`

The vendor is intentionally minimal: no owner, admin, pause, proxy, upgrade authority, privileged withdrawal path or mutable configuration.

The contract deployment is tracked in:

`data/deployments/base-sepolia-vendor.json`

The intended final flow is:

1. a principal delegates a bounded Mandate to an agent;
2. the agent proposes the exact 1 USDC payment;
3. ProofGate freezes and hashes the Action Contract;
4. ProofGate obtains live Telegraph evidence for that exact destination and chain;
5. deterministic policy returns `ALLOW`, `HOLD` or `BLOCK`;
6. only `ALLOW` may mint a short-lived action-bound permit;
7. the executor independently re-verifies the permit, mandate, evidence, decision and transaction intent;
8. shared durable state prevents replay and enforces cumulative authority;
9. the transaction is submitted only through the controlled execution path; and
10. ProofGate produces a verifiable receipt of the decision and outcome.

## Core security properties

- Canonical Action Contracts with SHA-256 exact-action binding
- Cryptographically committed Mandate Contracts for delegated authority
- Mandate lifecycle controls: `ACTIVE`, `REVOKED`, `EXPIRED`
- Per-action and optional cumulative spending limits
- Real Telegraph Miner evidence in the live path; synthetic evidence is confined to tests
- Exact evidence subject and chain binding
- Evidence intent, applicability, confidence, signal-hash and freshness checks
- Deterministic `ALLOW / HOLD / BLOCK` policy evaluation
- Decision hashing so permit authority is bound to the evaluated evidence and policy result
- Short-lived, single-use permits with key and policy-version metadata
- Ed25519 production signing support with key rotation/revocation semantics
- HMAC signing restricted to local/test/demo environments
- Shared PostgreSQL permit claims for multi-worker replay protection
- Durable execution state and exact transaction-intent binding
- Cumulative spend reservations bound to mandate, policy, chain and token
- Execution kill-switch support
- Explicit `AMBIGUOUS` handling for uncertain irreversible writes
- Operation journaling before external side effects
- Tamper-evident Proof Receipts
- Fail-closed x402 proof-payment policy locked to Base Sepolia USDC

## Authority model

ProofGate separates **delegation** from **decision-making**.

A Mandate may constrain:

- principal and agent identity
- allowed action types
- allowed chains
- allowed assets
- allowed destinations
- maximum amount per action
- optional maximum cumulative spend
- required Telegraph proof intents
- policy ID and policy version
- activation, expiry and revocation state

The agent can act autonomously only inside that pre-delegated envelope. A valid model decision cannot expand the Mandate.

## Policies

The repository currently includes two payment policy profiles:

### `payments.strict.v1`

A general strict payment policy that requires exact subject/chain binding, `FRAUD_DETECTION` evidence, applicability, signal hash, freshness and a minimum confidence threshold in addition to mandate and payment constraints.

### `payments.attested-vendor.v1`

A composite policy for the canonical ProofGate vendor. It combines Telegraph evidence with an exact live runtime attestation of the deployed vendor contract. The runtime proof is supplemental evidence; it does not replace Telegraph and it does not weaken negative Miner results.

Both policies fail closed.

## Permit and signing model

Only an `ALLOW` decision may mint a permit.

A permit commits to security-sensitive context including:

- mandate hash
- action hash
- decision hash
- nonce
- policy ID/version
- signing key ID/algorithm/version
- issue time
- expiry time

For local development and deterministic tests, ProofGate provides an HMAC-based development signer. It is explicitly rejected in `NODE_ENV=production`.

Production-oriented signing uses Ed25519 and supports verification-key lifecycle states including `ACTIVE`, `VERIFY_ONLY` and `REVOKED`.

## Durable execution

The simple executor demonstrates the core authorization boundary. The production-oriented path adds durable state for multi-worker and failure-aware execution.

That path includes:

- PostgreSQL-backed single-use permit claims
- durable execution records
- transaction-intent hashing and verification before submission
- mandate status authority checks
- optional cumulative spend authority
- an execution kill switch
- explicit failure vs post-submission ambiguity semantics

An unknown database claim result is never treated as success. An unknown blockchain result after possible broadcast is never blindly retried as though nothing happened.

See:

- `docs/ARCHITECTURE.md`
- `docs/RESILIENCE_INVARIANTS.md`
- `docs/permit-consumption-store.md`

## Local verification

```bash
npm ci
npm run ci
npm run audit:prod
```

`npm run ci` runs strict TypeScript checking and the full Vitest suite.

CI also recompiles the vendor contract with the pinned native Solidity compiler and fails if the tracked build artifacts change unexpectedly.

The Solidity compiler is development-only tooling. Production installations should use:

```bash
npm ci --omit=dev
```

## Deterministic defensive Attack Lab

Run:

```bash
npm run attack:lab
```

The Attack Lab is intentionally offline. It does not call Telegraph, pay x402 challenges or broadcast blockchain transactions.

It exercises authorization-boundary attacks such as replay, amount mutation, evidence substitution, forged signatures, permit expiry, decision tampering, mandate rebinding, negative Miner verdicts, runtime-attestation tampering and Proof Receipt tampering.

See `docs/ATTACK_LAB.md`.

## Live Telegraph proof

Refresh the live Telegraph registry:

```bash
bash scripts/discover-telegraph.sh
```

Then request proof for the exact canonical vendor:

```bash
npm run proof:live -- 0xB38d0405DF1b15961aEf29C7c45f2ED285822c14
```

The live proof path:

1. freezes the Action Contract before requesting evidence;
2. journals the operation before a paid attempt;
3. obtains the actual Telegraph x402 challenge;
4. accepts only the permitted Base Sepolia USDC payment lane and configured proof-price cap;
5. does not hardcode Telegraph's dynamic `payTo` address;
6. does not begin the paid attempt until the x402 lane passes policy;
7. does not blindly retry an ambiguous paid request;
8. stores evidence only after a genuine successful Miner response;
9. evaluates the returned evidence against the already-frozen action; and
10. emits an auditable `HOLD` when sufficient proof cannot be established.

A facilitator-side error such as `insufficient_credits` is an external proof failure and is handled fail-closed; it is not treated as permission to retry indefinitely.

## Important live-evidence status

The repository contains a historical real Telegraph/x402 evidence artifact captured during integration work. That artifact is retained for provenance and regression/reference purposes.

It is **not authorization for the current flagship vendor payment** because ProofGate requires exact target, chain, policy and freshness binding. Evidence obtained for another address must never be substituted for the canonical vendor merely because it is newer or returned an `ALLOW` label.

The final flagship execution therefore requires fresh Telegraph evidence for:

`0xB38d0405DF1b15961aEf29C7c45f2ED285822c14`

ProofGate must `HOLD` or `BLOCK` rather than weaken policy when that proof is unavailable or insufficient.

## Inspect an existing decision

```bash
npm run policy -- \
  0xB38d0405DF1b15961aEf29C7c45f2ED285822c14
```

Evidence lookup is exact-target and exact-chain.

## Security assessment artifacts

`audit-artifacts/` contains an authorized defensive assessment performed against an earlier assessed revision, including adversarial fuzzing, coverage, stress output and dependency-audit material.

Those artifacts are evidence for the revision they name; they must not be presented as an independent audit of every later commit. Final hackathon validation should be regenerated against the exact submission SHA after the implementation is frozen.

## Runtime state and secrets

`.env` and `.proofgate/` are ignored by Git.

Never commit:

- private keys
- permit-signing secrets
- wallet recovery material
- payment signatures
- database credentials
- Telegraph credentials
- production signing keys

## Repository map

```text
contracts/          Minimal ProofGateVendor smart contract
src/core/           Action and Mandate Contracts
src/telegraph/      Telegraph routing, evidence and x402 policy
src/evidence/       Evidence normalization/storage/runtime attestation
src/policy/         Deterministic payment policies
src/permit/         Permit creation, verification and signing
src/executor/       Replay protection, durable execution and spend authority
src/gateway/        End-to-end payment authorization gateway
src/receipt/        Proof Receipt creation and verification
src/security/       Attack Lab, audit logging and execution kill switch
migrations/         PostgreSQL durability/replay/spend schemas
scripts/            Live proof, execution, deployment and defensive tooling
tests/              Deterministic regression/security tests
docs/               Architecture, resilience and security documentation
```

## Principle

**Telegraph provides the evidence. ProofGate turns sufficient evidence plus delegated authority into permission for one exact action.**

The innovation is the enforceable boundary between an autonomous agent's decision and an irreversible external effect.
