# ProofGate Architecture

## Product definition

ProofGate is a **risk-adaptive pre-execution authorization firewall for autonomous agents**.

It separates an agent's ability to decide from its ability to create an irreversible external effect.

> **Agent confidence is not permission to act.**

The v1.1 authorization sequence is:

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

The system is fail-closed. Missing, stale, mismatched, ambiguous, under-confidence, over-budget or explicitly negative proof never becomes authority.

## 1. Trust model

ProofGate deliberately separates six roles.

### Principal

Defines standing authority before an agent acts.

### Agent

May reason and propose actions. It cannot expand its own Mandate, decide its own risk tier, reduce required evidence, mint its own permission or bypass the controlled executor.

### Telegraph

Routes external intelligence requests to Miners. Telegraph evidence informs policy; it does not mint ProofGate authority.

### ProofGate policy

Deterministically decides whether the exact Mandate + exact Action Contract + required independent evidence are sufficient.

### Permit authority

Cryptographically commits a successful decision to one exact action and one exact evidence context for a short time.

### Controlled executor

Is the enforcement boundary immediately before the external side effect. The agent must not have another direct path to the wallet/tool.

## 2. Standing Mandate

A principal delegates bounded authority through `proofgate.mandate.v1`.

A Mandate includes:

- mandate ID
- principal ID
- agent ID
- allowed action types
- allowed chains
- allowed assets
- allowed destinations
- maximum amount per action
- optional maximum cumulative amount
- required Telegraph Intents
- policy ID/version
- lifecycle state
- issue/expiry timestamps
- version

It is canonicalized and SHA-256 committed as `mandateHash`.

Lifecycle states are:

- `ACTIVE`
- `REVOKED`
- `EXPIRED`

Changing security-sensitive authority changes the hash.

The adaptive policy also requires every risk-derived Intent to exist inside the principal's `requiredIntents`. The system cannot silently buy/use a new evidence class outside the standing delegation.

## 3. Action Contract

The agent's proposal is normalized into an exact Action Contract before external evidence is requested.

Current protected action scope is deliberately narrow:

- action: payment
- network: Base Sepolia (`84532`)
- asset: canonical Base Sepolia USDC
- positive amount in minor units
- exact EVM destination
- bounded reason
- explicit policy ID/version

The normalized semantic payload is canonicalized and hashed as `actionHash`.

Examples:

```text
1 USDC → Vendor A     = hash A
7 USDC → Vendor A     = hash B
1 USDC → Vendor B     = hash C
```

Permit verification recomputes the hash from the current semantic payload. It does not trust a stale caller-supplied `actionHash`.

Any protected semantic mutation requires a new authorization cycle.

## 4. Consequence-adaptive evidence planning

`payments.adaptive.v1` adds a deterministic planner in `src/telegraph/adaptive-evidence-plan.ts`.

The exact payment amount determines the verification tier:

| Tier | Amount | Required Intents | Fraud confidence | Evidence budget | Latency budget |
| --- | ---: | --- | ---: | ---: | ---: |
| LOW | `<= 1 USDC` | `FRAUD_DETECTION` | `>= 0.70` | `0.015 USDC` | `15 s` |
| MEDIUM | `>1 <=5 USDC` | `FRAUD_DETECTION`, `ONCHAIN_TX_LOOKUP` | `>= 0.75` | `0.030 USDC` | `25 s` |
| HIGH | `>5 <=10 USDC` | `FRAUD_DETECTION`, `ONCHAIN_TX_LOOKUP`, `WALLET_BALANCE_CHECK` | `>= 0.80` | `0.050 USDC` | `40 s` |

The critical rule is:

> **The agent does not supply the authoritative risk tier. ProofGate recomputes it.**

Before policy can `ALLOW`, ProofGate recreates the expected plan from the frozen Action Contract and requires an exact canonical match. A caller cannot submit a `7 USDC` action with a fabricated LOW-risk plan.

## 5. Telegraph Intent routing

v1.1 is provider-neutral for adaptive evidence acquisition.

ProofGate declares what it needs:

```text
Intent: FRAUD_DETECTION
Exact subject: 0x...
Exact chain: 84532
```

It does not select a provider merely because the application prefers that provider.

The live registry is used to establish active coverage for each risk-required Intent. If a required Intent has no active Miner coverage, the adaptive workflow fails closed.

After Telegraph responds, ProofGate resolves the Miner that actually served the request and verifies:

- Miner identity is resolvable
- Miner is active
- Miner advertises the exact requested Intent
- returned subject is explicitly bound to the exact action destination
- returned chain is explicitly bound to the exact action chain

Request context is only a routing/request hint. It is never substituted for evidence returned by the Miner.

## 6. x402 intelligence-purchase boundary

Purchasing evidence is itself a machine side effect, so ProofGate gives it a separate safety boundary.

For a paid Telegraph request, the live adaptive client:

1. freezes the protected action first;
2. preflights the Telegraph request;
3. parses the live x402 challenge;
4. validates scheme/network/asset/amount policy;
5. preserves Telegraph's dynamic payment recipient;
6. checks the quoted price against the **remaining aggregate risk-tier evidence budget before paying**;
7. performs one paid attempt;
8. requires provable settlement;
9. never blindly retries a paid request after transport ambiguity;
10. accepts evidence only after returned Intent/Miner/subject/chain checks pass.

The orchestrator also enforces the total evidence latency budget.

This makes verification economics explicit:

```text
protected action value
        ↓
risk tier
        ↓
maximum verification spend
        ↓
actual x402 evidence purchases
```

## 7. Evidence normalization

Raw Miner response shapes differ.

ProofGate normalizes security-relevant fields while preserving raw-response integrity metadata. Relevant normalized fields include:

- source
- Intent
- Miner ID/name/slug
- exact subject
- exact chain
- verdict/label
- confidence when supplied
- applicability
- signal hash
- raw-response hash
- timestamp
- cost/duration metadata

Synthetic evidence is permitted only inside deterministic tests/fuzzing and must never be presented as live Telegraph activity.

## 8. Canonical Evidence Bundle

Adaptive authorization introduces `proofgate.evidence-bundle.v1`.

Every required routed signal becomes an Evidence Item containing:

- Intent
- actual serving Miner
- exact subject/chain
- result label
- confidence
- applicability
- signal hash
- raw-response hash
- received timestamp
- x402 payment amount/network/asset when paid

The bundle additionally commits:

- action ID
- action hash
- payment amount
- risk tier
- adaptive-plan hash
- maximum evidence spend
- actual aggregate evidence spend
- creation time

The complete body is canonicalized and hashed as `bundleHash`.

Bundle verification detects:

- item mutation
- payment amount mutation
- aggregate spend mutation
- duplicate Intents
- wrong subject/chain
- body/hash mismatch

The permit's `decisionHash` commits the bundle. Swapping in a different but internally valid bundle after permit mint fails permit verification.

## 9. Deterministic policy semantics

Every policy check returns:

- `PASS`
- `HOLD`
- `BLOCK`

Final decisions are:

### ALLOW

Every required authority, evidence and security check passes. A permit may be minted.

### HOLD

Sufficient current proof cannot be established. Examples:

- required Intent missing
- required signal hash missing
- stale evidence
- non-applicable evidence
- required confidence below floor
- acquisition/infrastructure uncertainty

No permit is created.

### BLOCK

A known security or authority invariant failed. Examples:

- Mandate invalid/revoked/expired
- wrong agent/destination/asset/chain
- amount outside delegated authority
- adaptive risk-plan downgrade
- Evidence Bundle integrity failure
- aggregate evidence spend above budget
- evidence for another subject/chain
- required Intent not delegated by principal
- explicit negative routed signal

`BLOCK` dominates `HOLD`.

## 10. Conflict engine

v1.1 makes evidence conflict a first-class policy state.

An explicit negative result such as:

- `BLOCK`
- `DENY`
- `MALICIOUS`
- `SUSPICIOUS`
- `FRAUD`
- `RISKY`
- `HIGH_RISK`

causes `BLOCK` for required evidence.

ProofGate does **not** use a naive majority vote such as “two positive Miners beat one negative Miner.” A known negative condition cannot be averaged away.

For `FRAUD_DETECTION`, a positive/acceptable classified verdict is additionally required.

## 11. Policy profiles

### `payments.strict.v1`

Original strict single-Telegraph-evidence policy with exact subject/chain, confidence, applicability, freshness and signal-hash requirements.

### `payments.attested-vendor.v1`

Policy used by the canonical v1.0 real execution. It combines real `FRAUD_DETECTION` evidence with a fresh exact runtime attestation of the deployed canonical vendor.

### `payments.adaptive.v1`

v1.1 risk-adaptive policy. It adds:

- deterministic tier derivation
- provider-neutral multi-Intent evidence
- plan downgrade prevention
- canonical Evidence Bundle
- aggregate x402 spend budget
- latency budget
- conflict semantics
- principal-delegated Intent enforcement

All three policies fail closed.

## 12. Decision commitment

A mutable string `ALLOW` is not sufficient authority.

`decisionHash` commits:

- Mandate identity/hash
- Action identity/hash
- single evidence commitment **or** adaptive Evidence Bundle commitment
- policy ID/version
- checks
- final decision/reason
- timestamps and evidence references

Changing committed evidence or decision material invalidates the permit.

## 13. Permit and signing

Only `ALLOW` may mint a permit.

Permit payload includes:

- permit ID
- mandate hash
- action hash
- decision hash
- nonce
- policy ID/version
- signing key ID/algorithm/version
- issued time
- expiry time

Properties:

- exact-action bound
- exact-Mandate bound
- exact-evidence/decision bound
- short lived
- single use
- replay protected
- authenticated

Local/test/demo signing can use HMAC. `NODE_ENV=production` rejects the development HMAC signer.

Production-oriented signing uses Ed25519 with `ACTIVE`, `VERIFY_ONLY` and `REVOKED` key lifecycle states.

## 14. Controlled executor

The executor independently verifies authorization immediately before the protected callback.

It verifies:

1. permit signature/metadata;
2. exact Mandate binding and current structured constraints;
3. policy binding;
4. single evidence or Evidence Bundle binding;
5. permit issue/expiry time;
6. recomputed semantic action hash;
7. decision commitment;
8. atomic single-use permit claim.

A permit is consumed before the protected side effect.

If the claim store is unavailable, execution fails closed.

## 15. Shared replay protection and durable execution

`FilePermitConsumptionStore` is for local/single-host tests and demos.

`PostgresPermitConsumptionStore` provides shared multi-worker atomic claims.

The production-oriented durable execution path also supports:

- durable execution records
- transaction-intent commitment
- authoritative Mandate status checks
- cumulative spend authority/reservations
- execution kill switch
- pre-submit failure vs post-submit ambiguity distinction

An unknown post-broadcast outcome is `AMBIGUOUS`, not automatic failure and not permission to broadcast a duplicate transaction.

## 16. Cumulative spend authority

A per-action ceiling alone can be defeated economically by repeated valid actions.

ProofGate supports optional cumulative authority bound to:

- Mandate hash
- policy ID/version
- chain
- token
- maximum cumulative amount

Concurrent reservations use database locking/transactions so multi-worker races cannot exceed the standing limit.

## 17. Proof Receipt v2 and v3

### v2

Records the original single-evidence authorization path.

### v3

Records adaptive Evidence Bundles.

A v3 receipt can expose/protect:

- Mandate and hash
- Action Contract and hash
- risk tier
- adaptive plan hash
- Evidence Bundle and bundle hash
- each routed Intent/Miner/signal hash
- each evidence-payment amount
- aggregate evidence spend
- deterministic policy result/checks
- permit
- execution result
- transaction hash when present
- timestamps
- receipt hash

Receipt verification checks the Evidence Bundle itself as well as the outer receipt commitment.

## 18. Developer integration surface

ProofGate exposes an SDK in `src/sdk/proofgate.ts` so another agent application can:

1. propose a Base Sepolia USDC payment;
2. receive the deterministic adaptive plan;
3. apply a principal-created Mandate;
4. collect Telegraph evidence;
5. evaluate `ALLOW/HOLD/BLOCK`;
6. mint a permit only on `ALLOW`;
7. execute only through the controlled boundary.

An evaluate-only HTTP gateway is also available:

```bash
npm run gateway:serve
```

It intentionally does not accept private keys, buy evidence, mint permits or execute funds.

See `docs/DEVELOPER_INTEGRATION.md`.

## 19. Live adaptive demonstration boundary

`npm run proof:adaptive -- <AMOUNT_USDC>` performs live adaptive **authorization only**.

It may make real Telegraph/x402 evidence requests. It does not broadcast the protected vendor payment.

This separation is intentional:

```text
buy intelligence != authorization

authorization != execution
```

A real multi-Intent output should only be claimed after an actual saved run exists. Until then, deterministic tests/fuzzing demonstrate the architecture and the v1.0 transaction remains the canonical real execution proof.

## 20. Security validation

CI gates:

- pinned vendor artifact verification
- pinned native x64 vendor recompilation + reproducibility diff
- TypeScript typecheck
- full Vitest suite
- original 1,100-case authorization fuzz harness
- adaptive 1,800-case Evidence Bundle/policy fuzz harness
- production dependency audit

Adaptive mutation classes include tier downgrade, missing Intents, explicit negative evidence, confidence/freshness failure, budget bypass, bundle mutation/substitution, evidence subject substitution, permit forgery/expiry, action mutation and un-delegated Intents.

The required invariant is:

> **Unauthorized or incorrectly bound input must never acquire executable authority.**

## 21. Canonical real execution vs v1.1

The committed Base Sepolia transaction in `docs/LIVE_EXECUTION.md` is real and publicly verifiable, but it belongs to the v1.0 single-Intent `payments.attested-vendor.v1` flow.

Do not claim that historical transaction exercised v1.1 multi-Intent routing.

The v1.1 architecture extends the authorization layer without rewriting or falsifying the proven baseline.

## Final principle

**Telegraph answers what the outside world says. The principal defines what the agent may do. ProofGate decides how much intelligence the consequence deserves and whether that exact evidence plus that exact authority is enough to permit this exact action.**
