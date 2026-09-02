# ProofGate Architecture

## Product definition

ProofGate is a **pre-execution authorization control plane for autonomous agents**.

It separates an agent's ability to decide from its ability to cause an irreversible external effect.

> Agent confidence is not permission to act.

The current authorization sequence is:

`MANDATE → PROPOSE → PROVE → POLICY → PERMIT → EXECUTE → RECEIPT`

The system is intentionally fail-closed. Missing, stale, mismatched, ambiguous or insufficient proof does not become authority.

---

## 1. Principal and Mandate

The human or upstream principal delegates bounded standing authority before the agent acts.

The Mandate Contract defines the envelope inside which the agent may operate, including:

- mandate ID
- principal ID
- agent ID
- allowed action types
- allowed chains
- allowed assets
- allowed destinations
- maximum amount per action
- optional maximum cumulative spend
- required proof intents
- policy ID and version
- lifecycle status
- issue and expiry timestamps
- mandate version

A Mandate is canonicalized and SHA-256 committed as `mandateHash`.

Changing security-sensitive authority changes the commitment.

The lifecycle may be:

- `ACTIVE`
- `REVOKED`
- `EXPIRED`

The agent cannot expand its own Mandate.

---

## 2. Agent proposal

The autonomous agent proposes a consequential action.

Example:

```json
{
  "type": "payment",
  "chainId": 84532,
  "token": "Base Sepolia USDC",
  "amountRaw": "1000000",
  "destination": "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
  "reason": "Pay approved vendor",
  "policyId": "payments.strict.v1",
  "policyVersion": 1
}
```

The proposal is not permission.

---

## 3. Action Contract

ProofGate validates and normalizes the proposed action into a canonical Action Contract before requesting external proof.

The current payment implementation is deliberately narrow:

- action type: `payment`
- chain: Base Sepolia (`84532`)
- asset: canonical Base Sepolia USDC
- positive integer amount in minor units
- exact EVM destination
- bounded reason text
- explicit policy ID/version

The normalized semantic payload is canonicalized and SHA-256 hashed into `actionHash`.

Changing any security-sensitive field produces a different authorization target.

Examples:

- `1 USDC → 10 USDC` = different action hash
- `Vendor A → Vendor B` = different action hash
- policy/version mutation = different action hash

Permit verification recomputes the canonical action hash from the current semantic payload. It does not trust a stale caller-supplied derived hash.

---

## 4. Verification planning and Telegraph

ProofGate determines what independent evidence is required for the frozen Action Contract.

The Telegraph integration includes:

- capability-constrained Miner routing
- Engine Ask support
- x402 challenge/payment policy
- response normalization
- raw evidence preservation
- signal-hash preservation
- target and chain provenance

Useful evidence fields include:

- intent
- Miner ID/name/slug
- result/verdict
- confidence when supplied
- applicability
- reasoning when supplied
- signal hash
- cost
- duration
- timestamp
- x402 settlement evidence when available
- original raw response

### Trust boundary

A Telegraph Miner produces **evidence**, not a ProofGate authorization.

A response containing `ALLOW`, `SAFE`, `VALID` or a high confidence value cannot directly mint a permit.

ProofGate does not fabricate missing evidence, manufacture Miner consensus or invent confidence values.

---

## 5. Evidence normalization and storage

Different Miner responses can have different shapes.

ProofGate normalizes security-relevant fields into `TelegraphEvidenceRecord` while retaining the original raw response for auditability.

Evidence lookup is bound to the exact action target and chain. Evidence from a different address must never be substituted merely because it is newer or favorable.

Synthetic fixtures are permitted only in deterministic tests and the offline Attack Lab. The live path must use genuine Telegraph responses.

---

## 6. Deterministic policy engine

ProofGate policy evaluates the current Mandate, Action Contract and evidence.

Every check results in one of:

- `PASS`
- `HOLD`
- `BLOCK`

The final policy decision is:

### `ALLOW`

All required authority and evidence checks pass.

A permit may be minted.

### `HOLD`

ProofGate cannot establish sufficient current proof.

Typical causes:

- missing evidence
- stale evidence
- insufficient confidence
- unsupported or non-applicable evidence
- unavailable external proof
- incomplete attestation

No permit is created.

### `BLOCK`

A known authorization/security invariant failed.

Typical causes:

- revoked/expired mandate
- wrong agent
- prohibited destination/asset/chain
- amount outside delegated authority
- exact action mismatch
- evidence for another destination/chain
- negative Miner result
- invalid runtime attestation

No permit is created.

`BLOCK` dominates `HOLD`; known violations are not softened into uncertainty.

---

## 7. Current payment policy profiles

### `payments.strict.v1`

The general strict payment policy evaluates:

- Mandate integrity and lifecycle
- agent delegation
- action type
- allowed chain
- allowed asset
- allowed destination
- delegated per-action amount
- policy ID/version
- required proof intent
- global autonomous amount limit
- real Telegraph evidence presence
- `FRAUD_DETECTION` intent
- exact subject binding
- exact chain binding
- evidence applicability
- minimum confidence
- Miner verdict classification
- Telegraph signal hash
- evidence freshness

It fails closed.

### `payments.attested-vendor.v1`

The canonical-vendor policy adds independent live runtime attestation of the deployed `ProofGateVendor`.

It pins:

- Base Sepolia
- Base Sepolia USDC
- canonical vendor destination
- Refut on-chain risk Miner profile
- `FRAUD_DETECTION`
- corroborative confidence floor
- Telegraph freshness
- exact runtime attestation
- runtime-attestation freshness

The runtime attestation is supplemental evidence. It does not override a negative Telegraph result and does not convert insufficient Telegraph proof into authority.

---

## 8. Decision commitment

An `ALLOW` decision is not represented only by a mutable string.

ProofGate commits the decision context into a `decisionHash` used by the permit layer.

This binds the permit to the specific evaluated context rather than trusting an arbitrary reconstructed `ALLOW` object later.

Mutating committed decision/evidence material invalidates verification.

---

## 9. Action Permit

Only an `ALLOW` decision can mint a permit.

Permit payload includes security-sensitive metadata such as:

- `permitId`
- `mandateHash`
- `actionHash`
- `decisionHash`
- nonce
- policy ID/version
- key ID
- signing algorithm
- signing version
- `issuedAt`
- `expiresAt`

The permit is:

- bound to one exact Mandate
- bound to one exact Action Contract
- bound to one exact policy decision
- short lived
- single use
- replay protected
- tamper evident

### Signing model

`LocalDevelopmentSigner` uses HMAC-SHA256 only for local/test/demo environments and refuses to operate in `NODE_ENV=production`.

Production-oriented signing uses Ed25519.

The key registry supports lifecycle states:

- `ACTIVE`
- `VERIFY_ONLY`
- `REVOKED`

This allows signing-key rotation while retaining explicit verification semantics for previously issued permits.

---

## 10. Controlled executor

The protected action must only be reachable through the controlled execution boundary.

Before protected execution, ProofGate independently verifies at least:

1. permit signature and signing metadata
2. Mandate hash and current delegated constraints
3. policy ID/version
4. decision binding
5. evidence subject/chain binding
6. permit issue/expiry times
7. recomputed canonical Action Contract hash
8. single-use consumption state

A permit is consumed/claimed before invoking the protected action.

If claim state is unavailable or unknown, execution fails closed.

---

## 11. Shared permit-consumption authority

`FilePermitConsumptionStore` remains useful for local development, deterministic tests and single-host demonstrations.

It is not the production multi-host authority.

`PostgresPermitConsumptionStore` provides the shared durable claim primitive for multi-worker deployments. The database enforces unique consumption semantics so two executor replicas cannot both successfully claim the same permit.

All production executor replicas must use the same authoritative strongly consistent claim store.

See `docs/permit-consumption-store.md`.

---

## 12. Durable execution state

For irreversible actions, permit consumption alone is not sufficient to describe operational reality.

The durable execution path records state before and through transaction submission so crashes and network ambiguity can be reconciled instead of blindly retried.

The execution model distinguishes:

- authorization/claim state
- pre-submission failure
- submission in progress
- broadcast
- confirmed execution
- rejected execution
- ambiguous post-submission outcome

The key rule is:

> A failure before possible broadcast is not the same as uncertainty after possible broadcast.

An ambiguous outcome is not automatically retried because the original transaction may already exist on-chain.

See `docs/RESILIENCE_INVARIANTS.md`.

---

## 13. Exact transaction-intent binding

A valid Action Contract and permit must not authorize an arbitrary wallet transaction.

Before submission, ProofGate verifies the transaction intent that will actually be signed/broadcast.

For the ERC-20 payment path, intent binding protects fields such as:

- chain
- sender
- token contract
- transfer destination
- transfer amount
- transaction data semantics

The durable record commits a transaction-intent hash so the submission path cannot silently swap the action after authorization.

---

## 14. Cumulative spend authority

A per-action maximum can be bypassed economically if an agent submits many individually valid transactions.

ProofGate therefore supports optional cumulative authority tied to a Mandate.

The PostgreSQL spend-authority record binds:

- authority ID
- Mandate hash
- policy ID/version
- chain
- token
- maximum cumulative amount

Each durable execution reserves spend before submission.

Concurrent reservations use database transactions/row locking so competing workers cannot exceed the standing cumulative limit through a race.

Rejected pre-confirmation reservations may be released. Confirmed executions consume their reservation.

If a Mandate declares cumulative authority but a correctly bound spend authority is unavailable, execution is blocked/fails closed rather than silently ignoring the limit.

---

## 15. Mandate status authority

A signed permit must not keep a revoked Mandate alive indefinitely.

The durable execution path can consult an authoritative Mandate status source immediately before execution.

In production, durable execution requires this external lifecycle authority.

If current Mandate status cannot be established, execution fails closed.

---

## 16. Execution kill switch

ProofGate supports an execution kill switch at the controlled executor boundary.

Its purpose is operational containment: if the protected execution service is disabled, the system must stop before external side effects.

A kill switch is not a replacement for Mandates, policy or permits; it is an additional operational safety boundary.

---

## 17. Real action

Only after all relevant pre-execution checks pass may ProofGate submit the external action.

Hackathon flagship:

- asset: Base Sepolia USDC
- amount: 1 USDC
- destination: deployed `ProofGateVendor`
- canonical vendor: `0xB38d0405DF1b15961aEf29C7c45f2ED285822c14`

The contract deployment is real and tracked in the repository.

The final hackathon payment should likewise be demonstrated with genuine Telegraph proof and a real Base Sepolia transaction, not a visual simulation.

---

## 18. Proof Receipt

Every gateway decision produces an audit artifact.

A Proof Receipt can commit/reference:

- receipt ID
- Mandate identity/hash
- Action Contract
- action hash
- Telegraph evidence and signal hash
- supplemental evidence
- policy decision
- permit identity/state
- execution result
- chain/transaction hash when applicable
- operation ID
- timestamps

ProofGate verifies a generated receipt before returning it.

Receipt tampering must fail verification.

Post-execution chain lookup can enrich the record but does not replace the pre-execution authorization boundary.

---

## 19. x402 proof-payment safety

Live Telegraph proof may itself require a paid x402 request.

ProofGate treats that proof purchase as another consequential external side effect.

The x402 path therefore:

- freezes the target action first
- journals before the paid attempt
- validates network/scheme/asset
- enforces the configured proof-price cap
- uses Telegraph's current dynamic `payTo` value rather than a hardcoded recipient
- avoids blind retry after ambiguous paid attempts
- stores evidence only after genuine successful Miner response

A proof-payment failure results in `HOLD`; it does not justify weakening the protected payment policy.

---

## 20. Security demonstrations

### Amount mutation

Authorized:

`1 USDC → Vendor A`

Attempted:

`10 USDC → Vendor A`

Expected:

`BLOCK / action_hash_mismatch` or an earlier delegated/policy amount violation, depending on where mutation is introduced.

### Recipient mutation

Authorized:

`1 USDC → Vendor A`

Attempted:

`1 USDC → Vendor B`

Expected:

`BLOCK`.

### Replay

Reuse a successfully claimed permit.

Expected:

`BLOCK / permit_already_consumed`.

### Expiry

Use an expired permit.

Expected:

`BLOCK / permit_expired`.

### Evidence substitution

Use evidence for another address or chain.

Expected:

`BLOCK`.

### Missing or stale evidence

Required current Telegraph evidence cannot be established.

Expected:

`HOLD` and no permit.

### Mandate revocation

Attempt execution after current mandate authority is revoked.

Expected:

`BLOCK`.

### Cumulative-spend race

Two workers attempt reservations that together exceed the delegated cumulative maximum.

Expected:

At most the amount permitted by the shared authority is reserved; excess execution is denied.

### Post-submit RPC uncertainty

Submission may have occurred but confirmation cannot be established.

Expected:

`AMBIGUOUS`, not a blind retry.

---

## Architectural trust boundaries

### Agent

May propose actions. Cannot authorize itself.

### Principal / Mandate authority

Defines and can revoke the agent's delegated envelope.

### Telegraph

Produces/routs external intelligence. Does not mint ProofGate permits.

### ProofGate policy

Determines whether current authority plus evidence is sufficient for one exact action.

### Permit signer/verifier

Authenticates the committed authorization context.

### Shared state stores

Provide authoritative replay, execution and cumulative-spend state.

### Controlled executor

Enforces authorization immediately before external side effects.

### Blockchain/RPC

Executes or reports the external action. Network uncertainty is treated explicitly rather than equated with failure.

### Receipt service

Produces tamper-evident audit evidence of the authorization path and outcome.

---

## Flagship principle

Telegraph provides independent evidence.

The principal provides bounded authority.

ProofGate requires both, binds them to one exact proposed action, and enforces the resulting permission at execution time.

The core innovation is not another fraud classifier. It is the enforceable authorization boundary between an autonomous agent's decision and an irreversible action.
