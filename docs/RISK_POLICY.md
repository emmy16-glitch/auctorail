# Auctorail adaptive payment risk policy

This document explains how `payments.adaptive.v1` decides **how much external evidence a proposed payment requires before it can be authorized**.

It does not define the principal's spending authority by itself.

The core separation is:

```text
Risk tier / evidence plan
  = how much proof Auctorail requires

Mandate + policy ceiling
  = what the agent is actually allowed to execute
```

A stronger evidence result can satisfy requirements inside delegated authority. It can never expand authority that does not exist.

## Source of truth

The authoritative implementation is:

- `src/telegraph/adaptive-evidence-plan.ts`
- `src/policy/payments-adaptive-v1.ts`

Tests that lock the policy include the adaptive-evidence-plan and adaptive-payment suites plus the adaptive/quorum fuzz harness.

Historical `proofgate.*` schema identifiers may remain in source for compatibility/provenance even though the product is now Auctorail.

## Current consequence bands

| Proposed amount | Tier | Fraud requirement | Additional Intents | Max fraud attempts | Max evidence spend | Overall evidence deadline |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `<= 5 USDC` | `LOW` | 1 distinct positive `FRAUD_DETECTION` Miner at `>= 0.70` | none | 3 | `0.035 USDC` | **12s** |
| `> 5 to 50 USDC` | `MEDIUM` | 2 distinct positive `FRAUD_DETECTION` Miners at `>= 0.75` | `ONCHAIN_TX_LOOKUP` | 4 | `0.060 USDC` | `60s` |
| `> 50 USDC` | `HIGH` | 3 distinct fraud Miners, at least 2 positives at `>= 0.80` | `ONCHAIN_TX_LOOKUP` + `WALLET_BALANCE_CHECK` | 5 | `0.100 USDC` | `90s` |

These are Auctorail's current product defaults, not universal financial-risk thresholds.

Older documentation that says LOW is `<=1 USDC`, or that the LOW deadline is `35s`, is stale relative to the current implementation.

## LOW risk in detail

The public demo/live payment typically exercises LOW risk.

A LOW request still requires all of the following before the fraud requirement is satisfied:

```text
required Intent:      FRAUD_DETECTION
subject:              exact frozen recipient
chain:                exact Base Sepolia chain (84532)
applicability:        exact subject/action
positive confidence: >= 0.70
signal commitment:    required
explicit negative:    must not be present
attempts:             <= 3
combined spend:       <= 0.035 USDC
combined deadline:    <= 12 seconds
```

The shorter 12-second deadline is a liveness change, not a security downgrade. If usable evidence cannot be obtained within the bound, the request fails closed as `HOLD`.

## Why LOW allows up to three attempts

A network response can succeed technically while still being unusable as authorization evidence.

Examples:

- Telegraph routes a different Intent;
- serving Miner identity cannot be established;
- serving Miner is not capable of the required Intent;
- returned subject does not explicitly match the frozen recipient;
- returned chain does not explicitly match Base Sepolia;
- confidence is below `0.70`;
- signal hash is absent;
- route is temporarily unavailable;
- schema/transport behavior makes the result unusable.

Auctorail therefore permits bounded retry rather than converting one bad route into permanent unavailability.

But retries cannot relax the evidence rules.

## Per-request upstream timeout

The deployed API additionally applies a bounded timeout to Telegraph HTTP calls. This protects the interactive authorization path from a single upstream call consuming the entire user-visible lifecycle.

The overall policy deadline remains authoritative. Per-request timeout handling is an availability mechanism, not proof that evidence is safe.

## Distinct-provider quorum

Provider diversity is counted by **Telegraph Miner ID**.

```text
request 1 → Miner 95822412
request 2 → Miner 95822412
request 3 → Miner 95822412

Distinct Miners = 1
```

Three responses from the same source are not three independent opinions.

When the plan requires multiple providers, Auctorail tracks prior Miner IDs and attempts to acquire independent corroboration within the bounded plan.

If required diversity is not reached, the requirement is not satisfied.

## Confidence-qualified positives

A positive fraud result counts only if it satisfies the tier's confidence floor:

```text
LOW     >= 0.70
MEDIUM  >= 0.75
HIGH    >= 0.80
```

A response labeled positive but below the confidence floor is not silently promoted into a qualified positive vote.

## Negative evidence

The fraud quorum rules include a high-confidence negative-veto threshold of `0.90` for early termination behavior.

The final adaptive payment policy is intentionally conservative: **explicit negative evidence blocks**. Known negative evidence is not averaged away because other providers are positive.

This is appropriate because the output gates an external side effect rather than merely ranking information.

## Evidence binding

Evidence is useful only if it applies to the exact action under review.

The policy/evidence stack binds important fields including:

- action ID;
- action hash;
- exact destination/subject;
- exact chain;
- amount;
- required Intent;
- Miner identity;
- confidence;
- applicability;
- signal commitment;
- quorum summary/rule;
- consequence-derived plan.

A response about another wallet or chain cannot be accepted just because its verdict is favorable.

## Structured Telegraph request context

The current live request includes structured routing hints for the exact payment identity, including:

```text
intent
address / wallet / target
chainId
network
amountRaw
actionHash
applicability
```

Those values improve routing precision.

They are **not treated as returned evidence**. Auctorail must still validate what the serving provider actually asserts.

This distinction prevents Auctorail from “proving” its own request by repeating the metadata it sent.

## Authority preflight before paid evidence

Telegraph evidence can cost money through x402. Evidence acquisition is therefore itself a side effect.

Auctorail follows this order:

```text
1. freeze exact action
2. check principal/Mandate authority
3. enforce hard policy eligibility
4. derive evidence plan
5. purchase/acquire required evidence
6. verify evidence
7. decide
```

If an action is already outside authority, Auctorail should not spend evidence budget on it.

## Autonomous execution ceiling

The current adaptive payment policy has a separate hard ceiling:

```text
10 USDC per autonomous action
```

Examples:

| Proposal | Evidence tier | Autonomous execution eligibility |
| --- | --- | --- |
| `1 USDC` | LOW | May be eligible if Mandate/evidence pass. |
| `5 USDC` | LOW | May be eligible if Mandate/evidence pass. |
| `7 USDC` | MEDIUM | May be eligible if Mandate/evidence pass. |
| `20 USDC` | MEDIUM | **Blocked by 10-USDC autonomous ceiling.** |
| `75 USDC` | HIGH | **Blocked by 10-USDC autonomous ceiling.** |

The HIGH evidence plan describes how stronger evidence would be required for higher consequence. It does not grant the right to execute above the current autonomous ceiling.

A future human-approved/step-up policy would have to raise authority explicitly.

## Relationship between Mandate limit and policy ceiling

There can be multiple simultaneous caps.

Example:

```text
Principal Mandate limit: 5 USDC
Policy autonomous ceiling: 10 USDC
Proposal: 7 USDC

Result: outside Mandate → BLOCK
```

Or:

```text
Principal Mandate limit: 50 USDC
Policy autonomous ceiling: 10 USDC
Proposal: 20 USDC

Result: policy ceiling → BLOCK
```

The effective authority is constrained by all applicable trusted limits.

## `HOLD` semantics

`HOLD` means the request is not authorized to execute with the evidence currently available.

Typical reasons:

- insufficient distinct Miners;
- insufficient confidence-qualified positives;
- missing required Intent;
- route unavailable;
- evidence deadline reached;
- evidence budget exhausted;
- stale evidence;
- missing signal commitment;
- subject/chain applicability cannot be established.

A `HOLD` produces **no execution permission**.

It is not an optimistic fallback.

## `BLOCK` semantics

`BLOCK` is appropriate when a hard rule fails.

Examples:

- outside Mandate;
- over autonomous ceiling;
- action/plan binding mismatch;
- explicit negative evidence;
- wrong policy/version;
- evidence violates a non-recoverable requirement;
- revoked/expired authority.

## Risk policy is not truth scoring

Auctorail does not attempt to compute an abstract universal “safety score.”

The policy asks a narrower question:

> Given this principal's authority, this exact proposed action, and these evidence requirements, may protected execution proceed?

That makes the decision explainable and enforceable.

## Current canonical LOW example

For a `1.00 USDC` request to the pinned Auctorail vendor on Base Sepolia:

```text
Action amount:       1.00 USDC
Risk tier:           LOW
Intent:              FRAUD_DETECTION
Positive floor:      0.70
Distinct providers:  1 required
Attempts:            up to 3
Evidence budget:     0.035 USDC
Evidence deadline:   12 seconds
```

The repository contains historical real evidence from `Refut On-Chain Risk` (`95822412`) for the canonical vendor with verdict `ALLOW`, confidence `0.70` and a signal hash. That artifact proves the lane has worked, but runtime authorization still validates current evidence rather than hard-coding historical success as permission.

## Security rationale

The policy follows these principles:

1. **Least privilege** — principal authority remains the upper bound.
2. **Consequence-adaptive evidence** — more consequence can require broader evidence.
3. **Exact binding** — evidence must belong to the action being authorized.
4. **Real provider diversity** — independent Miners, not duplicate requests.
5. **Bounded machine spending** — x402 evidence budget is explicit.
6. **Bounded waiting** — acquisition deadlines prevent indefinite authorization stalls.
7. **Fail closed** — missing proof means `HOLD`, not permission.
8. **Negative evidence matters** — known negative evidence is not averaged away.
9. **No self-authorization** — evidence never expands delegated authority.
10. **Permit only after final policy ALLOW** — evidence acquisition itself is not execution authority.

## Validation coverage

Current tests/fuzzing cover attempts to tamper with:

- risk tier;
- required Intents;
- distinct-provider requirements;
- positive-vote thresholds;
- confidence floors;
- negative-veto rules;
- attempt limits;
- evidence budgets;
- evidence deadlines;
- duplicate Miner counting;
- subject/chain binding;
- signal commitments;
- x402 network/asset/payment constraints;
- bundle commitments;
- action substitution.

The latest green suite reports 268/268 tests and 7400/7400 deterministic adversarial fuzz cases contained across the three fuzz harnesses.

## Change-control checklist

When this policy changes, update together:

1. `src/telegraph/adaptive-evidence-plan.ts`;
2. `src/policy/payments-adaptive-v1.ts`;
3. exact unit tests;
4. relevant fuzz expectations;
5. root `README.md`;
6. `docs/README.md` current-facts section;
7. this document;
8. demo/submission docs if public behavior changed;
9. operational monitoring/timeout configuration if the change affects latency.

Do not change prose alone and assume the system changed.

## Final rule

**Risk determines how much evidence Auctorail requires. The principal and policy determine what the agent is authorized to do. Evidence can satisfy authorization conditions; it cannot manufacture authority.**
