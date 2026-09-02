# ProofGate Architecture

## Product definition

ProofGate is a **risk-adaptive pre-execution authorization firewall for autonomous agents**.

It separates an agent's ability to decide from its ability to create a consequential external effect.

> **Agent confidence is not permission to act.**

```text
MANDATE
  → PROPOSE
  → FREEZE ACTION
  → DERIVE RISK
  → ROUTE TELEGRAPH INTENTS
  → EVIDENCE BUNDLE
  → DETERMINISTIC POLICY
  → ONE-USE PERMIT
  → CONTROLLED EXECUTION
  → PROOF RECEIPT
```

The system is fail-closed. Missing, stale, mismatched, ambiguous, under-confidence, uncertain, over-budget or explicitly negative proof never becomes authority.

## 1. Trust boundaries

ProofGate separates the following roles.

### Principal / Mandate authority
Defines standing authority before the agent acts and can revoke it.

### Autonomous agent
May reason and propose. It cannot expand its Mandate, choose its authoritative risk tier, remove required Intents, lower confidence floors, increase verification budgets, mint a permit or bypass the executor.

### Trusted evidence-acquisition boundary
Owns live Telegraph acquisition. It sends Intent requests, validates serving-Miner/Intent/subject/chain provenance, validates x402 payment constraints and settlement, normalizes the response, and constructs Evidence Bundles.

### Telegraph
Routes external intelligence requests to Miners. Telegraph/Miners produce evidence; they do not mint ProofGate permission.

### Deterministic policy
Evaluates the exact Mandate + Action Contract + required evidence and returns `ALLOW`, `HOLD` or `BLOCK`.

### Permit authority
Cryptographically commits an `ALLOW` decision to one exact Mandate, action and evidence context for a short time.

### Shared state authority
Provides replay, durable execution, Mandate-lifecycle and cumulative-spend state when used in production-oriented deployments.

### Controlled executor
Is the final enforcement boundary immediately before the external side effect. The agent must not have another direct route to the protected tool/wallet.

## 2. Standing Mandate

`proofgate.mandate.v1` defines the envelope within which an agent may act, including:

- mandate/principal/agent identity
- allowed action types
- allowed chains/assets/destinations
- maximum per-action amount
- optional maximum cumulative amount
- allowed/required Telegraph Intents
- policy ID/version
- lifecycle state
- issue/expiry timestamps
- version

The Mandate is canonicalized and SHA-256 committed as `mandateHash`.

Lifecycle states are `ACTIVE`, `REVOKED` and `EXPIRED`.

For adaptive authorization, every risk-derived Intent must also be delegated by the Mandate. ProofGate cannot silently introduce a new evidence class outside the principal's authority model.

## 3. Exact Action Contract

The proposal is normalized before external evidence is requested.

Current protected scope:

- action: payment
- network: Base Sepolia (`84532`)
- asset: canonical Base Sepolia USDC
- positive amount in minor units
- exact EVM destination
- bounded reason
- explicit policy ID/version

The normalized semantic payload is hashed as `actionHash`.

```text
1 USDC → Vendor A = hash A
7 USDC → Vendor A = hash B
1 USDC → Vendor B = hash C
```

Permit verification recomputes this semantic hash; it does not trust a stale caller-supplied derived hash.

## 4. Consequence-adaptive evidence plan

`payments.adaptive.v1` derives the security plan from the exact action.

| Tier | Amount | Required Intents | Fraud confidence | Evidence budget | Deadline |
| --- | ---: | --- | ---: | ---: | ---: |
| LOW | `<=1 USDC` | `FRAUD_DETECTION` | `>=0.70` | `0.015 USDC` | `15 s` |
| MEDIUM | `>1 <=5 USDC` | `FRAUD_DETECTION`, `ONCHAIN_TX_LOOKUP` | `>=0.75` | `0.030 USDC` | `25 s` |
| HIGH | `>5 <=10 USDC` | `FRAUD_DETECTION`, `ONCHAIN_TX_LOOKUP`, `WALLET_BALANCE_CHECK` | `>=0.80` | `0.050 USDC` | `40 s` |

The caller does not supply the authoritative tier. Policy recreates the expected plan and requires an exact canonical match. A HIGH action paired with a caller-forged LOW plan is `BLOCK`.

## 5. Telegraph Intent routing

Adaptive acquisition is Intent-first and provider-neutral.

ProofGate requests a capability such as:

```text
Intent: FRAUD_DETECTION
Exact subject: 0x...
Exact chain: 84532
```

It then verifies the Miner Telegraph actually served:

- resolvable Miner identity
- active Miner status
- support for the exact requested Intent
- explicit exact-subject evidence binding
- explicit exact-chain evidence binding

The current live Miner registry is checked before acquisition. Zero active coverage for a required Intent fails closed.

Request metadata is not substituted for returned evidence bindings.

## 6. x402 intelligence-purchase boundary

Buying intelligence is itself a machine side effect.

For each paid Telegraph request, ProofGate:

1. freezes the protected action first;
2. preflights the request;
3. parses the live x402 challenge;
4. validates version/scheme/network/asset/payment recipient/amount;
5. keeps the global per-request ceiling at `0.01 USDC`;
6. checks the quote against the **remaining aggregate tier budget before paying**;
7. performs exactly one paid attempt;
8. requires provable settlement;
9. never blindly retries a paid request after transport ambiguity;
10. accepts evidence only after the routed response passes provenance checks.

The adaptive Evidence Bundle verifier independently rejects committed paid-evidence metadata outside the approved Base Sepolia USDC x402 lane or per-request cap.

## 7. Telegraph normalization and provenance

Raw Miner response schemas may differ. The trusted live client normalizes security-relevant fields while preserving the raw-response commitment.

Normalized evidence includes:

- source
- Intent
- Miner ID/name/slug
- exact subject/chain
- label/verdict when available
- confidence when available
- applicability
- signal hash
- raw-response hash
- received timestamp
- cost/duration metadata

Normalization validates signal-hash shape, confidence range and nonnegative cost/duration metadata.

### Integrity vs authenticity

This is a deliberate boundary:

- **Evidence Bundle hash** proves bundle integrity after construction.
- **Trusted live acquisition** establishes that the evidence came through the intended Telegraph path and satisfied serving-Miner/Intent/binding/x402 checks.

A self-consistent arbitrary JSON bundle is not automatically authentic Telegraph evidence.

Therefore a production permit-minter must not accept an arbitrary agent-supplied Evidence Bundle. The recommended SDK path creates the bundle internally through a trusted `IntentAcquirer`.

Synthetic evidence is allowed only in deterministic tests/fuzzing and must never be presented as live Telegraph activity.

## 8. Canonical Evidence Bundle

Adaptive authorization uses `proofgate.evidence-bundle.v1`.

Each item commits:

- required Intent
- actual serving Miner
- exact subject/chain
- label/confidence/applicability
- signal hash
- raw-response hash
- received timestamp
- cost/duration metadata
- evidence payment amount/network/asset

The bundle commits:

- action ID/hash
- protected amount
- risk tier
- adaptive-plan hash
- maximum evidence spend
- actual aggregate evidence spend
- creation time
- `bundleHash`

Verification rejects:

- body/hash mismatch
- malformed cryptographic hashes
- duplicate/unsupported Intents
- wrong subject/chain
- invalid timestamps/metadata
- invalid paid-evidence provenance
- aggregate-spend inconsistency

The decision hash commits the Evidence Bundle. Replacing it with another valid bundle after permit mint fails permit verification.

## 9. Adaptive policy semantics

Every check produces `PASS`, `HOLD` or `BLOCK`.

### ALLOW
All required authority and evidence checks pass. A permit may be minted.

### HOLD
Sufficient current proof cannot be established. Examples:

- missing required Intent
- missing signal hash
- stale evidence
- non-applicable evidence
- fraud confidence below the risk-tier floor
- secondary status such as `UNKNOWN` or `UNAVAILABLE`
- acquisition/infrastructure uncertainty

### BLOCK
A known security or authority invariant failed. Examples:

- invalid/revoked/expired Mandate
- wrong agent/destination/asset/chain
- amount outside delegated authority
- adaptive-plan downgrade
- bundle integrity/provenance failure
- evidence budget violation
- wrong evidence subject/chain
- un-delegated required Intent
- explicit negative evidence

`BLOCK` dominates `HOLD`.

## 10. Conflict semantics

A required explicit negative result such as `MALICIOUS`, `SUSPICIOUS`, `DENY`, `BLOCK`, `FRAUD`, `RISKY` or `HIGH_RISK` causes `BLOCK`.

ProofGate does not use naive majority voting. Positive evidence cannot average away a known negative signal.

For `FRAUD_DETECTION`, a classified positive verdict is additionally required. For secondary informational Intents, no label is acceptable when the evidence is otherwise applicable/fresh/bound; an explicit uncertain status label becomes `HOLD` rather than being treated as positive.

## 11. Policy profiles

### `payments.strict.v1`
Original strict single-Telegraph-evidence payment policy.

### `payments.attested-vendor.v1`
Policy used by the canonical v1.0 real execution: fresh real `FRAUD_DETECTION` evidence + exact live vendor-runtime attestation.

### `payments.adaptive.v1`
Risk-adaptive provider-neutral multi-Intent policy with tier derivation, canonical Evidence Bundles, verification economics, conflict semantics and principal-delegated Intent enforcement.

All policies fail closed.

## 12. Decision commitment and permit

A mutable `ALLOW` string is not authority.

`decisionHash` commits the evaluated Mandate, Action Contract, evidence/bundle, policy checks and final decision context.

Only `ALLOW` may mint a permit.

Permit payload includes:

- permit ID
- mandate hash
- action hash
- decision hash
- nonce
- policy ID/version
- signing key ID/algorithm/version
- issued/expiry timestamps

Properties:

- exact-Mandate bound
- exact-action bound
- exact-evidence/decision bound
- short lived
- single use
- replay protected
- authenticated

Local/test/demo signing may use HMAC; `NODE_ENV=production` rejects that development signer. Production-oriented signing uses Ed25519 and key lifecycle states `ACTIVE`, `VERIFY_ONLY`, `REVOKED`.

## 13. Controlled execution

The executor independently verifies authorization immediately before the side effect, including:

1. permit signature/metadata;
2. Mandate binding/current constraints;
3. policy binding;
4. Evidence Bundle/action binding;
5. permit times;
6. recomputed semantic action hash;
7. decision commitment;
8. atomic single-use permit claim.

The permit is claimed before the protected callback. Unknown/unavailable claim state fails closed.

The transaction fields must be derived from the authorized Action Contract, not fresh agent-supplied values.

## 14. Shared replay and durable execution

`FilePermitConsumptionStore` is local/single-host tooling.

`PostgresPermitConsumptionStore` provides shared atomic claims for multi-worker deployments.

The production-oriented durable path also supports:

- durable execution records
- exact transaction-intent commitment
- authoritative Mandate status checks
- cumulative spend reservations
- execution kill switch
- explicit pre-submit failure vs post-submit ambiguity

An unknown outcome after possible broadcast is `AMBIGUOUS`, not a reason to blindly broadcast a duplicate.

## 15. Cumulative spend authority

Per-action limits alone do not stop repeated individually valid actions from exceeding an economic budget.

Optional cumulative authority is bound to Mandate hash, policy, chain, token and maximum cumulative amount. Database transactions/locking protect concurrent reservations.

## 16. Proof Receipt v2 / v3

### v2
Records the original single-evidence path.

### v3
Records adaptive authorization and embeds the Evidence Bundle.

A v3 receipt can prove/reference:

- Mandate/hash
- Action Contract/hash
- risk tier and plan hash
- Evidence Bundle/hash
- routed Intents/Miners/signal hashes
- evidence-payment metadata and aggregate spend
- deterministic policy checks
- permit
- execution result
- transaction hash when present
- timestamps
- receipt hash

Receipt verification checks both the outer receipt and the embedded bundle/action binding.

## 17. Developer integration surface

`src/sdk/proofgate.ts` exposes two levels.

### Recommended trusted-host path

`authorizePaymentWithEvidence(...)` accepts only the proposal from the agent; the trusted host supplies the Mandate, `IntentAcquirer` and signer. It plans, collects, evaluates and mints a permit only on complete `ALLOW`.

### Lower-level composition

Advanced integrations may use planning, collection, evaluation and permit helpers separately, but the same trust boundary applies.

An evaluate-only HTTP gateway is available with:

```bash
npm run gateway:serve
```

It intentionally does not accept wallet secrets, buy evidence, mint permits or execute funds.

See `docs/DEVELOPER_INTEGRATION.md`.

## 18. Live adaptive command

```bash
npm run proof:adaptive -- <AMOUNT_USDC>
```

This may make real Telegraph/x402 evidence requests but is **check-only for the protected payment**.

```text
buy intelligence != authorization
authorization != execution
```

A real multi-Intent output should only be claimed after an actual successful saved run exists.

## 19. Security validation

The hardened v1.1 code has passed:

- vendor artifact verification
- pinned native x64 vendor recompilation + reproducibility diff
- TypeScript typecheck
- `42/42` Vitest files
- `210/210` tests
- original fuzz: `1100/1100`, `100/100` controls, `0` unauthorized executions
- adaptive fuzz: `1800/1800`, `100/100` controls, `0` unauthorized authorizations
- `0` fuzz uncaught errors
- production dependency audit: `0` vulnerabilities

Both fuzz harnesses are offline and perform zero Telegraph requests, x402 payments or blockchain writes.

## 20. Canonical real execution vs v1.1

The public Base Sepolia transaction in `docs/LIVE_EXECUTION.md` belongs to the frozen v1.0 single-Intent `payments.attested-vendor.v1` flow.

It proves the real end-to-end authorization/execution concept, but it must not be described as having exercised v1.1 multi-Intent routing.

Likewise, v1.1 currently implements **multiple Intents routed to serving Miners**, not a same-Intent 2-of-3 Miner-consensus protocol.

## Final principle

**Telegraph answers what the outside world says. The principal defines what the agent may do. ProofGate decides how much intelligence the consequence deserves and whether that exact evidence plus that exact authority is enough to permit this exact action.**
