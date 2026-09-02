# ProofGate v1.1 — Adaptive Evidence Authorization

## Status

**Architecture: implemented.**  
**Trusted developer SDK: implemented.**  
**Provider-neutral live Intent client: implemented.**  
**Deterministic tests: passing (`210/210` on the hardened code snapshot).**  
**Original adversarial fuzz: `1,100/1,100` contained.**  
**Adaptive adversarial fuzz: `1,800/1,800` contained.**  
**Unauthorized executions/authorizations in those fuzz gates: `0`.**  
**Production dependency audit: `0` known vulnerabilities.**  
**Real multi-Intent Telegraph artifact: deliberately not claimed until an actual `proof:adaptive` run is captured.**

The frozen `v1.0.0-hackathon` tag remains the publicly verifiable real execution baseline. v1.1 is developed separately on `v1.1-adaptive-evidence`.

## Competitive thesis

ProofGate is not another app that asks one Miner whether something is safe and displays the answer.

It is a **risk-adaptive authorization firewall for autonomous agents**:

> **The higher the consequence of an action, the more independent Telegraph intelligence ProofGate requires before executable authority can exist.**

That makes Telegraph Intents, routing and x402 economics part of the authorization boundary rather than decorative API output.

## Locked v1.1 flow

```text
Principal Mandate
        |
        v
Agent proposal
        |
        v
Exact Action Contract + actionHash
        |
        v
Deterministic consequence tier
        |
        v
Adaptive Evidence Plan
        |
        +--> Intent A --Telegraph--> serving Miner A
        +--> Intent B --Telegraph--> serving Miner B
        +--> Intent C --Telegraph--> serving Miner C
        |
        v
Canonical Evidence Bundle + bundleHash
        |
        v
Budget + provenance + freshness + confidence + conflicts
        |
    ALLOW / HOLD / BLOCK
        |
        v
one-use Permit
        |
        v
controlled executor
        |
        v
Proof Receipt
```

The agent cannot choose its authoritative risk tier, remove an Intent, lower a confidence floor or enlarge the verification budget. Policy recomputes the expected plan from the exact frozen Action Contract.

## Locked risk tiers

| Tier | Protected payment | Required Telegraph Intents | Fraud confidence | Max x402 evidence spend | Deadline |
| --- | ---: | --- | ---: | ---: | ---: |
| LOW | `<= 1 USDC` | `FRAUD_DETECTION` | `>= 0.70` | `0.015 USDC` | `15 s` |
| MEDIUM | `>1 <=5 USDC` | `FRAUD_DETECTION`, `ONCHAIN_TX_LOOKUP` | `>= 0.75` | `0.030 USDC` | `25 s` |
| HIGH | `>5 <=10 USDC` | `FRAUD_DETECTION`, `ONCHAIN_TX_LOOKUP`, `WALLET_BALANCE_CHECK` | `>= 0.80` | `0.050 USDC` | `40 s` |

Current adaptive protected-payment ceiling: `10 USDC` on Base Sepolia.

## Implemented components

### 1. Deterministic adaptive planner

`src/telegraph/adaptive-evidence-plan.ts`

Derives:

- LOW / MEDIUM / HIGH tier
- required Intents
- fraud confidence floor
- applicability/signal/binding requirements
- aggregate evidence-payment budget
- evidence latency budget
- conflict and missing-evidence semantics

The policy recreates the plan before authorization, preventing caller-supplied downgrade.

### 2. Provider-neutral Intent routing

`src/telegraph/verification-planner.ts`  
`src/telegraph/intent-route.ts`

ProofGate asks for an **Intent**, not a preferred provider. The actual routed Miner is recorded and verified against the live registry.

Required Intent coverage can be checked before paid acquisition. Zero coverage fails closed.

### 3. Live Telegraph acquisition boundary

`src/telegraph/live-intent-client.ts`

For each paid request it:

1. preflights Telegraph;
2. parses the live x402 challenge;
3. validates Base Sepolia USDC/version/scheme/recipient/price policy;
4. checks the price against remaining aggregate evidence budget before payment;
5. makes exactly one paid attempt;
6. refuses blind retry after transport ambiguity;
7. requires provable settlement;
8. resolves the actual serving Miner;
9. verifies the Miner is active and supports the requested Intent;
10. requires explicit exact subject/chain evidence binding;
11. validates normalized signal/cost/duration metadata;
12. preserves raw-response integrity and saves the real artifact.

### 4. Canonical Evidence Bundle

`src/telegraph/evidence-bundle.ts`

Each item commits:

- Intent
- actual serving Miner
- exact subject/chain
- label/confidence/applicability
- signal hash
- raw-response hash
- received time
- cost/duration metadata
- evidence-payment amount/network/asset

The bundle commits action/amount/tier/plan/budget/aggregate spend and `bundleHash`.

The hardened verifier rejects:

- changed body/hash
- malformed cryptographic hashes
- duplicate/unsupported Intents
- wrong subject/chain
- invalid timestamp/metadata
- inconsistent aggregate spend
- paid evidence outside the approved Base Sepolia USDC x402 provenance rules
- per-request evidence payment above the global cap

### 5. Integrity vs authenticity boundary

A bundle hash proves integrity after construction. It does **not** make arbitrary agent-generated JSON authentic Telegraph evidence.

Authenticity/provenance is established by the trusted live acquisition boundary before bundle construction.

This is why the recommended production integration never exposes a permit-minting endpoint that accepts an arbitrary agent-supplied bundle.

### 6. Budgeted multi-Intent orchestrator

`src/telegraph/adaptive-orchestrator.ts`

It:

- requests exactly the plan-derived Intents
- tracks remaining aggregate budget
- tracks deadline
- rejects Intent mismatch
- returns incomplete/HOLD state on acquisition failure
- never silently falls back to a weaker Intent set

### 7. Adaptive conflict policy

`src/policy/payments-adaptive-v1.ts`

Deterministic semantics:

- explicit negative required evidence → `BLOCK`
- missing required evidence → `HOLD`
- stale/non-applicable evidence → `HOLD`
- required signal hash missing → `HOLD`
- fraud confidence below tier floor → `HOLD`
- secondary `UNKNOWN` / `UNAVAILABLE` status → `HOLD`
- wrong subject/chain → `BLOCK`
- required Intent not delegated → `BLOCK`
- evidence/bundle provenance failure → `BLOCK`
- evidence budget violation → `BLOCK`
- adaptive-plan downgrade → `BLOCK`
- all required checks pass → `ALLOW`

A known negative cannot be averaged away by favorable signals.

### 8. Bundle-aware permit + executor

The permit/controlled-executor boundary supports the original single Telegraph evidence record and the adaptive Evidence Bundle.

Decision commitment binds the entire bundle. Existing exact-action hash recomputation, signature verification, TTL, atomic consumption and replay semantics remain enforced.

A different internally valid bundle substituted after permit mint is rejected.

### 9. Proof Receipt v3

Adaptive receipts use `proofgate.receipt.v3` and embed the Evidence Bundle. Receipt verification checks both bundle integrity/action binding and the outer authorization/execution commitment.

`proofgate.receipt.v2` remains available for the v1.0 single-evidence path.

### 10. Trusted external-developer SDK

`src/sdk/proofgate.ts`

Recommended high-level integration:

- `authorizePaymentWithEvidence`

The autonomous agent supplies only its proposed payment. The trusted host supplies:

- principal-created Mandate
- trusted `IntentAcquirer`
- permit signer

Inside one boundary ProofGate plans, collects, evaluates and returns a permit only if collection is complete and policy is `ALLOW`.

Lower-level helpers remain available:

- `planPaymentAuthorization`
- `createAdaptivePaymentMandate`
- `evaluatePaymentAuthorization`
- `mintPaymentPermit`

See `docs/DEVELOPER_INTEGRATION.md`.

### 11. Evaluate-only HTTP gateway

```bash
npm run gateway:serve
```

The gateway exposes planning/evaluation for integration/debugging but deliberately does not accept wallet secrets, buy evidence, mint permits or execute funds.

Its decision output is not an executable permission object.

### 12. Live adaptive check command

```bash
npm run proof:adaptive -- 1
npm run proof:adaptive -- 7
```

The HIGH path derives three required Intents. The command may purchase real Telegraph evidence but remains **check-only** for the protected vendor payment.

A real multi-Intent run must be saved before public claims are upgraded from “implemented/tested” to “live multi-Intent proof captured.”

## Verification economics

ProofGate makes machine-verification cost visible:

```text
Protected value:         7 USDC
Risk tier:               HIGH
Required Intents:        3
Maximum evidence spend:  0.050 USDC
Actual evidence spend:   committed in Evidence Bundle
Decision:                ALLOW / HOLD / BLOCK
```

The product question is:

> **How much independent intelligence should an autonomous system purchase before it is allowed to take this consequence?**

## Counterfactual explanations

Non-ALLOW output is derived from deterministic checks rather than model prose.

Examples:

```text
HOLD: Required ONCHAIN_TX_LOOKUP evidence is missing.
HOLD: Confidence 0.61 is below required floor 0.80.
HOLD: Secondary evidence label UNAVAILABLE is uncertain.
BLOCK: Routed evidence returned explicit negative label MALICIOUS.
BLOCK: Adaptive evidence plan differs from the deterministic required plan.
```

## Security validation

Hardened v1.1 validation has passed:

```text
42/42 test files
210/210 tests

Original fuzz:
1100/1100 adversarial cases contained
100/100 valid controls
0 unauthorized executions
0 uncaught errors

Adaptive fuzz:
1800/1800 adversarial cases contained
100/100 valid controls
0 unauthorized authorizations
0 uncaught errors

Production dependency audit:
0 vulnerabilities
```

Adaptive fuzz covers:

- risk-tier downgrade
- missing required Intents
- negative fraud/secondary evidence
- confidence/freshness bypass
- missing signal hashes
- aggregate verification-budget bypass
- bundle signal/raw-response tampering
- evidence subject substitution
- different valid bundle substitution after permit mint
- permit signature forgery/expiry
- action semantic mutation
- un-delegated Intents

The direct test suite additionally covers uncertain secondary status and x402 evidence-payment provenance/malformed-hash rules.

Both fuzz harnesses are offline: zero Telegraph requests, zero x402 payments and zero blockchain writes.

## Standout judge demo

1. Start with the real frozen v1.0 Base Sepolia transaction.
2. Show `1 USDC` → LOW → one Intent.
3. Change only the amount to `7 USDC`.
4. Show HIGH → three Intents + stronger confidence + larger bounded evidence budget.
5. Show the agent cannot submit a LOW plan for the HIGH action.
6. Show an explicit negative required signal → deterministic `BLOCK`.
7. Show `UNKNOWN` / `UNAVAILABLE` → `HOLD`, not a false positive.
8. Show Evidence Bundle + bundle hash + verification spend.
9. Show both fuzz suites.
10. Show `authorizePaymentWithEvidence(...)` as the reusable safety layer another agent developer can adopt.
11. If a live multi-Intent run has been captured, show the real routed Miners/signal hashes/bundle hash. Otherwise say clearly that the live multi-Intent artifact is the remaining proof milestone.

## Non-negotiable locks

- frozen `v1.0.0-hackathon` remains immutable;
- v1.0 real transaction is not described as multi-Intent;
- agent cannot choose/downgrade adaptive requirements;
- routing remains Intent-first/provider-neutral;
- Miner output remains evidence, not authority;
- bundle integrity is not confused with source authenticity;
- production permit minting must not trust arbitrary agent-supplied bundles;
- explicit negative evidence cannot be averaged away;
- uncertain secondary status cannot be treated as positive;
- per-request and aggregate x402 budgets remain enforced;
- paid ambiguity is never blindly retried;
- synthetic fixtures remain tests only;
- live adaptive proof does not broadcast the protected vendor payment;
- current implementation uses multiple Intents, not same-Intent 2-of-3 Miner consensus.

## Remaining proof milestone

The only deliberately unclaimed competitive milestone is a **captured real multi-Intent Telegraph Evidence Bundle** from `npm run proof:adaptive -- 7` (or another derived tier).

Once a successful live run is captured, preserve only non-secret public artifacts, verify signal/bundle/receipt details, rerun the full security gate, and document the exact routed Miners, signal hashes, evidence spend and bundle hash.
