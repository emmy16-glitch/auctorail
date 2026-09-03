# ProofGate Architecture

## Product definition

ProofGate is a **pre-execution authorization firewall for autonomous agents**.

> **Agent confidence is not permission to act.**

The system separates reasoning, evidence and authority:

```text
PRINCIPAL MANDATE
      ↓
AGENT PROPOSAL
      ↓
CANONICAL ACTION
      ↓
CONSEQUENCE / EVIDENCE PLAN
      ↓
TELEGRAPH ROUTING + MINER DIVERSITY
      ↓
EVIDENCE COMMITMENT
      ↓
DETERMINISTIC DECISION
      ↓
SIGNED ONE-USE PERMIT
      ↓
CONTROLLED EXECUTOR
      ↓
EXTERNAL EFFECT / RECEIPT
```

The core invariant is:

**The component that proposes an action must not be able to create, expand or bypass the authority required to execute it.**

## 1. Trust boundaries

### Principal
Creates standing authority before the agent acts. The principal decides what action types, targets, policy versions and evidence classes the agent may use.

### Autonomous agent
May reason and propose. It does not own the authoritative Mandate, evidence acquisition, Permit signer, replay store, kill switch or protected executor.

### Telegraph / Miners
Supply external intelligence. A Miner result is evidence, not permission.

### Trusted evidence boundary
Owns live Telegraph/x402 requests, validates serving-Miner identity and evidence provenance, and creates the cryptographic evidence commitment used by policy.

### ProofGate policy / decision authority
Returns `ALLOW`, `HOLD` or `BLOCK` deterministically from committed authority + action + evidence context.

### Permit authority
Signs a short-lived single-use capability bound to one exact successful decision.

### Controlled executor
Re-verifies authority immediately before the external effect, claims the Permit atomically, and is the only supported path to the protected tool.

### Trusted Action Adapter
In the generic v1.2 core, an adapter is trusted deployment code that knows how to freeze one external action, define required evidence, evaluate trusted evidence and execute the frozen action. It is **not** an untrusted plugin sandbox.

## 2. Two action models

ProofGate preserves the proven payment path and adds a general action path.

### Payment Action Contract — v1

The original payment contract remains deliberately narrow:

- Base Sepolia (`84532`)
- canonical Base Sepolia USDC
- positive minor-unit amount
- exact EVM destination
- reason
- policy ID/version

Its canonical semantic payload is SHA-256 committed as `actionHash`.

### General Action Envelope — v2

`proofgate.action.v2` allows the authorization core to protect non-payment actions without pretending all tools share payment semantics.

A general action commits:

- namespaced action `type`, for example `github.merge`
- exact `target`
- bounded JSON-safe `parameters`
- namespaced policy ID/version
- creation timestamp
- canonical payload
- `actionHash`

The constructor rejects malformed/non-finite/deep/oversized parameter structures. `verifyGeneralActionIntegrity()` recomputes the canonical payload/hash rather than trusting derived caller fields.

Changing type, target, parameters or policy creates a different action hash and requires fresh authorization.

## 3. Two Mandate models

### `proofgate.mandate.v1`

Used by the payment path. It binds principal/agent identity, payment scope, destinations, amount limits, required Intents, policy and lifecycle.

### `proofgate.mandate.v2`

Used by the general action core. It commits:

- mandate/principal/agent identity
- allowed action types
- exact allowed targets
- required/delegated evidence Intents
- policy ID/version
- status
- issued/expiry times
- version
- canonical `mandateHash`

A general action outside type/target/policy scope is blocked **before trusted evidence acquisition**, so an undelegated agent cannot spend the principal's Telegraph/x402 evidence budget.

The Mandate is evaluated again at Permit mint and again immediately before generic execution. A Permit that is still temporally valid cannot outlive a Mandate that has expired or become invalid.

## 4. Consequence-adaptive payment evidence

`payments.adaptive.v1` derives its evidence plan from the frozen payment amount.

| Tier | Amount | FRAUD_DETECTION quorum | Other Intents | Fraud positive confidence | Max evidence spend | Deadline |
| --- | ---: | --- | --- | ---: | ---: | ---: |
| LOW | `<=1 USDC` | 1 distinct / 1 positive | none | `>=0.70` | `0.015 USDC` | `15s` |
| MEDIUM | `>1 <=5 USDC` | 2 distinct / 2 positive, max 4 attempts | `ONCHAIN_TX_LOOKUP` | `>=0.75` | `0.050 USDC` | `35s` |
| HIGH | `>5 <=10 USDC` | 3 distinct / 2 positive, max 5 attempts | `ONCHAIN_TX_LOOKUP`, `WALLET_BALANCE_CHECK` | `>=0.80` | `0.070 USDC` | `60s` |

MEDIUM/HIGH fraud quorum has a `0.90` high-confidence early negative veto.

The caller does not supply the authoritative risk tier or quorum thresholds. Policy recreates the complete expected plan from the exact action and requires canonical equality.

## 5. Horizontal and vertical evidence diversity

### Vertical diversity

Different questions are asked:

```text
FRAUD_DETECTION
+ ONCHAIN_TX_LOOKUP
+ WALLET_BALANCE_CHECK
```

### Horizontal diversity

The same critical question may require multiple independent serving Miners:

```text
FRAUD_DETECTION
   ├─ route → Miner A
   ├─ route → Miner B
   └─ route → Miner C
```

Provider independence is measured by **distinct Miner ID**, not request count.

If Telegraph returns the same Miner repeatedly:

```text
attempt 1 → Miner A
attempt 2 → Miner A  (duplicate, not another independent vote)
attempt 3 → Miner B
```

then distinct provider count is only two.

ProofGate uses bounded attempts, evidence spend and deadline. Failure to obtain the required diversity is `HOLD`, not fabricated consensus.

## 6. Evidence quorum semantics

Every quorum rule commits:

- `minimumDistinctMiners`
- `minimumPositiveResults`
- `minimumPositiveConfidence`
- `maxAttempts`
- `negativeVetoConfidence`

The canonical summary commits:

- observed attempt count
- distinct Miner IDs
- positive Miner IDs
- negative Miner IDs
- uncertain Miner IDs
- veto Miner IDs
- duplicate-Miner attempts
- final quorum status

Possible status includes:

- `SATISFIED`
- `INSUFFICIENT_DIVERSITY`
- `INSUFFICIENT_POSITIVES`
- `VETOED`
- `ATTEMPT_LIMIT_EXCEEDED`

A positive vote only counts when its confidence meets the quorum's positive-confidence floor.

The early-veto threshold optimizes fail-closed collection. Final payment policy is stricter: **any explicit negative evidence blocks**, so lower-confidence known-negative evidence is not averaged away either.

## 7. Telegraph routing

ProofGate remains Intent-first and provider-neutral.

It asks Telegraph for a capability such as `FRAUD_DETECTION`; Telegraph determines the serving Miner. ProofGate then records/verifies the actual provider.

For quorum, ProofGate may perform additional bounded requests for the same Intent. Prior Miner IDs are tracked for diversity accounting, but a repeated provider never counts as a new independent source.

The acquisition boundary verifies:

- requested Intent
- actual serving Miner identity
- active/capable Miner where registry data is used
- exact subject
- exact chain for the payment evidence contract
- signal metadata
- response commitment
- x402 provenance when paid

## 8. x402 evidence-purchase boundary

Evidence purchasing is also a machine side effect.

The live payment evidence client:

1. freezes the protected action;
2. preflights the Telegraph request;
3. validates the returned x402 challenge;
4. enforces scheme/network/asset/payee/amount rules;
5. enforces `0.01 USDC` maximum per evidence request;
6. enforces the remaining aggregate risk-tier budget;
7. reuses the already validated challenge rather than fetching an unvalidated replacement;
8. independently filters the exact `PaymentRequirements` used for signing;
9. sends one payment-bearing attempt;
10. requires provable settlement;
11. refuses blind retries after paid transport ambiguity.

This closes the x402 challenge-swap/TOCTOU gap found during v1.1 hardening.

## 9. Evidence Bundle

Adaptive payments use `proofgate.evidence-bundle.v1`.

Each attempt commits:

- Intent
- serving Miner ID/name/slug
- subject/chain
- label/confidence/applicability
- signal hash
- raw-response hash
- received timestamp
- attempt number
- cost/duration
- payment amount/network/asset

The bundle commits:

- action ID/hash
- subject/chain/amount
- risk tier
- plan hash
- max and actual evidence spend
- every attempt
- every canonical quorum summary
- creation timestamp
- `bundleHash`

Tampering with a vote, Miner identity, attempt, payment field or quorum summary invalidates the bundle.

### Integrity is not provenance

A valid bundle hash proves integrity after construction. It does not make arbitrary JSON authentic Telegraph evidence.

Live provenance is established by the trusted acquisition process. A production Permit service must not treat agent-submitted arbitrary bundles as authenticated Telegraph proof.

## 10. Decision semantics

Every authorization check has one of three statuses:

### `ALLOW`
All authority/evidence checks pass. Permit minting may proceed.

### `HOLD`
Authority is not disproven, but sufficient current evidence cannot be established. Examples: missing evidence, insufficient Miner diversity, insufficient positives, low confidence, stale evidence, uncertain result, provider unavailability or bounded deadline exhaustion.

### `BLOCK`
A known invariant failed. Examples: wrong action scope, invalid Mandate, plan downgrade, tampered evidence, un-delegated Intent, explicit negative evidence or prohibited payment provenance.

`BLOCK` dominates `HOLD`.

## 11. General trusted adapter contract

A `ProofGateActionAdapter` declares:

```text
type + policy ID/version
freeze(proposal)
requiredIntents(action)
evaluateTrusted(action, requiredIntents)
execute(action)
```

The SDK requires `evaluateTrusted()` to return:

- `evidenceCommitmentHash`
- exact `coveredIntents`
- trusted deterministic checks

Enforcement rules:

1. adapter registration metadata must be valid;
2. `freeze()` must return the registered action type/policy/version;
3. the Mandate must authorize the action before evidence work;
4. each adapter-required Intent must be delegated;
5. trusted coverage must include every required Intent;
6. claimed unrequested Intents are `BLOCK`;
7. required evidence without a commitment is `HOLD`;
8. required evidence without trusted checks is `HOLD`;
9. only all-PASS `ALLOW` can mint a Permit.

The evidence commitment can point to a Telegraph Evidence Bundle or another adapter-specific trusted evidence structure. The adapter is responsible for verifying source-specific authenticity before producing its commitment/checks.

## 12. General decision + Permit

`proofgate.decision.v2` commits:

- mandate hash
- action hash
- exact agent ID
- policy ID/version
- evidence commitment hash
- all checks
- final decision/reason
- decision timestamp
- `decisionHash`

Decision verification recomputes the hash **and** checks semantic consistency: wrong agent, empty checks or an `ALLOW` whose checks contain `HOLD/BLOCK` is invalid even if an attacker recomputes the outer decision hash.

`proofgate.permit.v2` commits:

- permit ID
- mandate hash
- action hash
- decision hash
- evidence commitment hash
- policy ID/version
- nonce
- issue/expiry times
- signer metadata
- signature

Only a valid all-PASS `ALLOW` may mint it.

Production mode rejects the local HMAC development signer; the production-oriented signer is Ed25519/KMS-compatible.

## 13. Generic controlled execution

Before any generic adapter callback, ProofGate:

1. checks the operational execution kill switch;
2. fails closed if kill-switch state is unavailable;
3. verifies the decision and Permit;
4. re-evaluates the current Mandate at execution time;
5. verifies Permit/action/decision/evidence bindings and time window;
6. atomically claims `permitId + nonce` in the replay store;
7. calls the trusted adapter only after successful claim.

The agent must not have another direct path to the protected tool.

If the callback throws after claim, ProofGate returns `AMBIGUOUS` because the external effect may already have happened. The Permit remains consumed and is never automatically replayed.

## 14. Replay and shared state

- `FilePermitConsumptionStore` — local/single-host tooling.
- `PostgresPermitConsumptionStore` — shared atomic replay protection for multi-worker deployments.

One Permit may cause at most one protected callback attempt.

For irreversible integrations, adapter-specific reconciliation should determine the real external state after `AMBIGUOUS` rather than submitting a duplicate.

## 15. Existing payment execution controls

The original Base Sepolia executor still provides the stronger chain-specific path for the proven payment use case:

- exact chain/token/action validation
- local tx hash before broadcast
- transaction-intent journaling
- one irreversible broadcast attempt
- RPC reconciliation
- explicit `AMBIGUOUS` post-submit semantics
- optional shared replay/durable execution/spend controls

The general executor does not pretend it can automatically reconcile every arbitrary external service; reconciliation belongs to the adapter/integration.

## 16. Proof Receipts

- `proofgate.receipt.v2` — original single-evidence payment path.
- `proofgate.receipt.v3` — adaptive Evidence Bundle payment path.

The general action core currently commits its evidence/decision/Permit and returns a controlled execution result. A universal generic receipt schema is not falsely claimed until the adapter-independent receipt design is implemented.

## 17. Security gates

Current v1.2 validation on the pre-documentation code snapshot:

```text
Vitest:                       43/43 files
Tests:                        225/225
Original fuzz:                1100/1100
Adaptive + quorum fuzz:       3100/3100
General authorization fuzz:   3100/3100
Total adversarial cases:      7300/7300
Unauthorized executions:     0
Unauthorized authorizations: 0
Uncaught fuzz errors:         0
Production dependency audit: 0 vulnerabilities
```

All fuzzing is offline: no Telegraph requests, x402 payments or blockchain writes.

GitHub CI also reproducibly recompiles the pinned Solidity vendor artifact with native `solc 0.8.36+commit.8a079791` on Linux x64.

## 18. Proven vs generalized scope

### Publicly proven live side effect

The frozen v1.0 artifact contains a genuine Telegraph proof and one real protected **Base Sepolia USDC** transfer. See `LIVE_EXECUTION.md`.

### Implemented/tested v1.2 architecture

- adaptive multi-Intent evidence
- same-Intent distinct-Miner quorum
- generic Action/Mandate/Decision/Permit core
- trusted Action Adapter Registry
- generic controlled executor

### Not claimed without a live artifact

- a real saved three-Miner Telegraph quorum run
- production GitHub/cloud/database adapters
- independent production security audit
- sandbox safety for arbitrary untrusted adapter code

## Final principle

**Telegraph answers what the outside world says. The principal defines what the agent may do. ProofGate determines how much breadth and provider independence the consequence deserves, then turns sufficient evidence plus standing authority into one-use permission for one exact action.**
