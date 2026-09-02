# ProofGate v1.1 — Adaptive Evidence Authorization

## Status

**Architecture: implemented.**  
**Deterministic tests: passing.**  
**Adaptive adversarial fuzzing: 1,800 / 1,800 contained on the validated implementation snapshot.**  
**Live multi-Intent Telegraph artifact: not yet claimed; it must be captured by an actual `proof:adaptive` run before submission claims are upgraded.**

The frozen `v1.0.0-hackathon` tag remains the proven real execution baseline. v1.1 is developed separately on `v1.1-adaptive-evidence`.

## Competitive thesis

ProofGate is not another application that asks one Miner whether something is safe and displays the answer.

It is a **risk-adaptive authorization firewall for autonomous agents**:

> The higher the consequence of an action, the more independent Telegraph intelligence ProofGate requires before it can mint permission to execute.

That makes Telegraph intelligence, routing and x402 economics part of the actual authorization boundary rather than decorative API output.

## Locked v1.1 flow

```text
Principal Mandate
        |
        v
Agent proposes action
        |
        v
Exact Action Contract + actionHash
        |
        v
Deterministic consequence/risk tier
        |
        v
Adaptive Evidence Plan
        |
        +--> Intent A --Telegraph routing--> actual Miner A
        +--> Intent B --Telegraph routing--> actual Miner B
        +--> Intent C --Telegraph routing--> actual Miner C
        |
        v
Canonical Evidence Bundle + bundleHash
        |
        v
Budget + freshness + confidence + conflict policy
        |
    ALLOW / HOLD / BLOCK
        |
        v
one-use permit -> controlled executor -> Proof Receipt
```

The agent is never allowed to choose its own risk tier, remove an Intent, lower the confidence floor or expand the evidence-payment budget. The adaptive policy recomputes the expected plan from the frozen Action Contract and blocks a mismatch.

## Locked risk tiers

| Tier | Protected payment | Required Telegraph Intents | Fraud confidence | Max x402 evidence spend | Max evidence latency |
| --- | ---: | --- | ---: | ---: | ---: |
| LOW | `<= 1 USDC` | `FRAUD_DETECTION` | `>= 0.70` | `0.015 USDC` | `15 s` |
| MEDIUM | `>1` and `<=5 USDC` | `FRAUD_DETECTION`, `ONCHAIN_TX_LOOKUP` | `>= 0.75` | `0.030 USDC` | `25 s` |
| HIGH | `>5` and `<=10 USDC` | `FRAUD_DETECTION`, `ONCHAIN_TX_LOOKUP`, `WALLET_BALANCE_CHECK` | `>= 0.80` | `0.050 USDC` | `40 s` |

The current autonomous payment ceiling remains `10 USDC` on Base Sepolia.

## Implemented components

### 1. Deterministic adaptive planner — complete

`src/telegraph/adaptive-evidence-plan.ts`

It derives:

- risk tier
- required Intents
- confidence floor
- signal/applicability requirements
- total evidence-payment budget
- evidence latency budget
- fail-closed conflict/missing-evidence semantics

### 2. Provider-neutral Intent routing — complete

`src/telegraph/verification-planner.ts` and `src/telegraph/intent-route.ts`

v1.1 asks for an **Intent**, not a preferred Miner. ProofGate records and verifies the Miner Telegraph actually routes to.

Before live acquisition, required Intent coverage can be checked against the current Telegraph registry. If an Intent has no active Miner, the workflow fails closed rather than silently reducing verification.

### 3. Canonical Evidence Bundle — complete

`src/telegraph/evidence-bundle.ts`

Each item binds:

- Intent
- actual serving Miner ID/name/slug
- exact subject
- exact chain
- verdict/label when supplied
- confidence when supplied
- applicability
- signal hash
- raw-response hash
- received time
- duration/cost metadata
- exact x402 amount/network/asset when paid

The bundle commits:

- action ID/hash
- payment amount
- risk tier
- adaptive-plan hash
- max evidence budget
- actual aggregate evidence spend
- canonical `bundleHash`

A different but internally valid bundle cannot be substituted after permit mint because the decision commitment binds the bundle.

### 4. Budgeted multi-Intent orchestrator — complete

`src/telegraph/adaptive-orchestrator.ts`

The orchestrator:

- requests only the Intents derived by the plan
- tracks remaining aggregate evidence budget
- tracks the risk-tier deadline
- rejects routed Intent mismatch
- returns an incomplete bundle + `HOLD` state on acquisition failure
- does not silently fall back to weaker evidence

### 5. Live Telegraph Intent client — complete

`src/telegraph/live-intent-client.ts`

For each paid request it:

1. preflights Telegraph;
2. parses the live x402 challenge;
3. validates the approved Base Sepolia USDC lane;
4. checks the price against the remaining aggregate budget **before payment**;
5. makes exactly one paid attempt;
6. refuses blind retry after paid transport ambiguity;
7. requires provable settlement;
8. resolves the Miner actually routed by Telegraph;
9. verifies that Miner is active and supports the requested Intent;
10. requires explicit exact subject/chain evidence binding;
11. normalizes and saves the real response.

### 6. Adaptive conflict policy — complete

`src/policy/payments-adaptive-v1.ts`

The policy is deterministic.

- explicit required negative evidence → `BLOCK`
- required evidence missing → `HOLD`
- stale evidence → `HOLD`
- required signal hash missing → `HOLD`
- fraud confidence below risk-tier floor → `HOLD`
- wrong subject/chain → `BLOCK`
- required Intent outside the principal Mandate → `BLOCK`
- evidence budget exceeded → `BLOCK`
- bundle integrity failure → `BLOCK`
- adaptive-plan downgrade/mismatch → `BLOCK`
- all required checks pass → `ALLOW`

A negative signal cannot be averaged away by favorable signals.

### 7. Bundle-aware permit and executor — complete

The existing permit/controlled-executor boundary now accepts either the original single Telegraph evidence record or a v1.1 Evidence Bundle.

The decision hash commits the bundle. Existing exact-action hash recomputation, TTL, signature verification, atomic consumption and replay behavior remain in place.

### 8. Proof Receipt v3 — complete

Adaptive receipts use `proofgate.receipt.v3` and embed the canonical Evidence Bundle. Receipt verification checks both receipt integrity and bundle integrity/action binding.

The original `proofgate.receipt.v2` format remains supported for the v1.0 single-evidence flow.

### 9. External developer SDK — complete

`src/sdk/proofgate.ts`

Public integration helpers include:

- `planPaymentAuthorization`
- `createAdaptivePaymentMandate`
- `evaluatePaymentAuthorization`
- `mintPaymentPermit`

See `docs/DEVELOPER_INTEGRATION.md`.

### 10. Evaluate-only HTTP gateway — complete

```bash
npm run gateway:serve
```

The local gateway exposes planning/evaluation without accepting wallet secrets or executing funds. It is intentionally a narrow integration surface for another agent application.

### 11. Live adaptive check command — complete

```bash
npm run proof:adaptive -- 1
npm run proof:adaptive -- 7
```

The `7` USDC path derives three required Intents. The command may purchase real Telegraph evidence but is deliberately **check-only** for the protected payment.

A successful real multi-Intent run must be preserved before we claim a live multi-Intent result publicly.

## Verification economics

ProofGate makes verification cost visible rather than treating x402 as hidden plumbing.

A HIGH-risk bundle can answer:

```text
Protected action value: 7 USDC
Risk tier:              HIGH
Required Intents:       3
Maximum evidence spend: 0.05 USDC
Actual evidence spend:  <recorded in bundle>
Decision:               ALLOW / HOLD / BLOCK
```

This demonstrates a real machine-security question:

> How much independent intelligence should an autonomous system buy before allowing an irreversible action?

## Counterfactual explanations

The SDK exposes a deterministic counterfactual for non-ALLOW results, derived from policy checks rather than LLM reasoning.

Examples:

```text
HOLD: Required ONCHAIN_TX_LOOKUP evidence is missing.
HOLD: Confidence 0.61 is below required floor 0.80.
BLOCK: Routed evidence returned explicit negative label MALICIOUS.
BLOCK: Adaptive evidence plan differs from the deterministic plan required for this action.
```

## Security validation

The v1.1 CI gate includes the old authorization fuzz suite **and** a dedicated adaptive-evidence suite.

Current validated adaptive fuzz structure:

- 18 mutation families
- 100 generated cases per family
- 1,800 adversarial cases
- 100 valid controls
- zero live Telegraph requests
- zero x402 payments
- zero blockchain writes

Families cover:

- risk-tier downgrade
- each required Intent missing
- fraud negative signal
- secondary negative signal
- confidence-floor bypass
- stale evidence
- missing signal hash
- evidence-budget overrun
- bundle signal-hash tampering
- bundle raw-response-hash tampering
- evidence subject substitution
- substitution of a different valid bundle after permit mint
- permit signature forgery
- permit expiry
- action semantic mutation
- un-delegated Intent

The exact final submission SHA must still pass CI after all documentation/freeze commits; do not inherit a result across later code changes without rechecking.

## Standout demo

1. Start with the real v1.0 transaction already captured on Base Sepolia.
2. Show a `1 USDC` proposal deriving LOW risk and one Intent.
3. Change only the amount to `7 USDC`.
4. Show ProofGate automatically derive HIGH risk and three Intents.
5. Show the x402 verification budget increase from `0.015` to `0.050 USDC`.
6. Show a synthetic defensive disagreement fixture where one required signal becomes `SUSPICIOUS` → deterministic `BLOCK`.
7. Show adaptive fuzz containment.
8. Show the SDK/gateway another developer can put in front of their agent.
9. If live Telegraph multi-Intent acquisition has been captured successfully, show its real routed Miners and signal hashes. Otherwise do not fabricate the step.

## Non-negotiable locks

- `v1.0.0-hackathon` is immutable and remains the real execution baseline.
- v1.0's real transaction must not be described as multi-Intent.
- `payments.adaptive.v1` derives its own risk requirements from the action.
- Agent/model output cannot lower the tier or evidence requirements.
- Adaptive routing is Intent-first and provider-neutral.
- Telegraph Miner output remains evidence, not authority.
- Explicit required negative evidence cannot be averaged away.
- Aggregate x402 evidence spend is bounded before paid requests.
- Paid transport ambiguity is never blindly retried.
- Synthetic fixtures are tests/demos only and must never be presented as live Telegraph evidence.
- A live adaptive command does not broadcast the protected vendor payment.
- Existing exact action, Mandate, permit replay, ambiguity, durable execution and receipt controls remain intact.

## Remaining proof milestone

The only deliberately unclaimed milestone is a **captured real multi-Intent Telegraph Evidence Bundle** from `npm run proof:adaptive -- 7` (or another derived tier). Once that run succeeds, save only the non-secret public artifacts, rerun all checks, and update the live-adaptive proof documentation with the exact routed Miners, signal hashes, x402 spend and bundle hash.
