# Auctorail judging-criteria evidence map

This document maps Auctorail's strongest implemented and publicly verifiable evidence to the kinds of criteria commonly used in the Telegraph hackathon: usefulness, real Telegraph integration, technical depth, security/robustness, product quality, originality and completeness.

It is written to help reviewers find evidence quickly without relying on marketing language.

## One-sentence project description

> **Auctorail is a pre-execution authorization rail for autonomous agents: the agent proposes an exact action, Auctorail verifies delegated authority and required Telegraph evidence, and only an `ALLOW` decision can produce one-use execution authority for a protected executor.**

## Why the project matters

Most agent tooling focuses on helping models know more or do more.

Auctorail focuses on a different question:

> **What should an agent actually be allowed to execute?**

That makes Auctorail an enforcement layer rather than another intelligence-query UI.

## Criterion: usefulness / real problem

### Problem

AI agents increasingly control tools that can create real external effects. Prompt instructions alone are not a strong security boundary for spending limits, recipient restrictions, replay prevention, evidence requirements or execution credentials.

### Auctorail's answer

- keep authority outside the agent;
- define principal-controlled standing Mandates;
- freeze the exact action before authorization;
- require consequence-appropriate evidence;
- fail closed with `HOLD` when proof is insufficient;
- produce one-use execution authority only on `ALLOW`;
- keep the protected credential behind a trusted executor.

### Evidence to inspect

- `README.md`
- `docs/PRODUCT_STORY.md`
- `docs/SECURITY_MODEL.md`
- `docs/ARCHITECTURE.md`

## Criterion: Telegraph integration

Auctorail does not merely mention Telegraph in the UI.

The payment lane contains genuine Telegraph/x402 evidence acquisition.

Current public proof set includes:

```text
2 publicly committed genuine Telegraph Miner acquisitions
$0.02 committed x402 evidence cost
1 protected Base Sepolia execution
```

Canonical fraud evidence:

```text
Intent: FRAUD_DETECTION
Miner: Refut On-Chain Risk
Miner ID: 95822412
Subject: canonical vendor
Chain: Base Sepolia / 84532
Verdict: ALLOW
Confidence: 0.70
Signal hash: present
Evidence cost: $0.01
```

### Evidence to inspect

- `docs/REAL_USAGE_LOG.md`
- `docs/LIVE_EXECUTION.md`
- `data/evidence/telegraph-2026-09-02T17-36-12-826Z.json`
- `src/telegraph/`

## Criterion: meaningful use of Miners

Auctorail uses Miner intelligence as an authorization input with strict semantics.

It verifies or reasons about:

- required Intent;
- actual serving Miner;
- Miner capability;
- exact subject binding;
- exact chain binding;
- confidence threshold;
- signal commitment;
- provider diversity;
- negative evidence;
- evidence freshness/plan binding.

The project does not convert “Miner said ALLOW” directly into execution permission.

That is an important architectural use of Miner intelligence rather than a thin wrapper around a query endpoint.

## Criterion: x402 usage

Evidence acquisition can be paid through x402.

Auctorail treats that payment as a bounded machine side effect.

Controls include:

- approved network/asset lane;
- remaining evidence budget;
- payment challenge handling;
- settlement validation/reconciliation;
- ambiguous paid-transport handling.

This demonstrates not only querying but also safe economic integration around agent-initiated evidence acquisition.

## Criterion: technical depth

Auctorail includes several layers that interact:

```text
canonical action contract
principal Mandate
adaptive evidence plan
Telegraph Intent routing
x402 payment controls
explicit evidence binding
distinct-Miner quorum
deterministic policy
signed permit
durable permit consumption
protected executor
ambiguity/reconciliation controls
proof receipts
public verification
repository SDK
web product
```

This is broader than a single endpoint demo.

### Key technical docs

- `docs/ARCHITECTURE.md`
- `docs/RISK_POLICY.md`
- `docs/V1_2_GENERAL_QUORUM.md`
- `docs/permit-consumption-store.md`
- `docs/DEVELOPER_INTEGRATION.md`

## Criterion: security / robustness

Auctorail intentionally assumes the agent can be wrong or adversarial.

Security invariants include:

- agent cannot mint its own authority;
- action mutation invalidates old authorization;
- evidence must belong to the exact subject/chain;
- duplicate Miners cannot fake quorum;
- missing proof means `HOLD`;
- explicit negative evidence is not ignored;
- permits are short-lived and one-use;
- execution revalidates authority;
- permit replay is rejected;
- ambiguous external effects are not blindly retried;
- x402 evidence spending is bounded.

### Current deterministic validation

```text
53 test files
268 / 268 tests passed
```

Fuzz suites:

```text
1100 payment authorization cases
3200 adaptive + quorum cases
3100 general authorization cases
----
7400 adversarial cases contained

0 unauthorized executions / authorizations
0 uncaught fuzz errors
```

Production dependency audit reports `0 vulnerabilities` in the latest green CI snapshot.

### Evidence to inspect

- `docs/SECURITY_MODEL.md`
- `docs/ATTACK_LAB.md`
- `docs/RESILIENCE_INVARIANTS.md`
- tests under `tests/`
- fuzz scripts under `scripts/`

## Criterion: product quality

The redesigned web product separates:

- plain-language Home explanation;
- deterministic Watch Demo;
- live authorization;
- Permissions;
- Activity;
- Verify;
- Content Trust;
- Security Lab;
- SDK/docs.

The latest browser QA workflow passes the landing/demo/live/SDK/Security Lab product-flow audit.

Mobile overflow fixes are included for common narrow widths and long technical values.

## Criterion: demo clarity

Auctorail has a deterministic four-scenario demonstration:

```text
valid action        → allowed/executed demo
amount mutation     → BLOCK
permit replay       → BLOCK
missing evidence    → HOLD
```

This makes the enforcement layer visible in less than a minute.

Then the public real proof demonstrates that the architecture is connected to genuine Telegraph/x402 and Base Sepolia activity.

See:

- `docs/HACKATHON_DEMO.md`
- `docs/DEMO_TODAY.md`

## Criterion: originality / differentiation

Auctorail is not primarily a Miner marketplace, chatbot, dashboard or query wrapper.

Its differentiating proposition is:

```text
specialist intelligence
        is not
execution authority
```

Auctorail creates the authorization layer between intelligence and consequential action.

That means it can complement other Telegraph products. A wallet-risk Miner, price Miner or transaction-intelligence service can become an evidence provider inside Auctorail policy without becoming the component that controls the principal's permission.

## Criterion: extensibility

The generic Action/Mandate/Decision architecture is designed to support more than payments.

The repository already includes a Content Trust lane to demonstrate reuse of the authorization model.

Future adapters could protect:

- DeFi actions;
- infrastructure changes;
- SaaS/API mutations;
- account administration;
- content publication;
- purchases;
- smart-contract calls.

A new adapter still needs exact action semantics, trusted authority, evidence semantics, deterministic policy and a protected executor.

## Criterion: proof / reproducibility

Auctorail separates three evidence categories.

### Current implementation proof

Passing tests, fuzz harnesses and browser QA.

### Real external proof

Committed Telegraph/x402 evidence and public Base Sepolia transaction.

### Deterministic presentation proof

Guided Demo and Security Lab.

This separation makes it harder to accidentally present simulations as real usage.

## Criterion: honesty / scope discipline

The project deliberately does not claim:

- independent audit;
- production certification;
- guaranteed safe AI;
- a public npm SDK release;
- real live Telegraph proof for every product lane;
- a publicly committed successful HIGH three-distinct-Miner quorum;
- objective truth from AI/Miner evidence.

Precise claim boundaries are documented in `FINAL_SUBMISSION.md`.

## Fast judge-review path

If a reviewer has five minutes:

1. Read the first half of `README.md`.
2. Run/watch the deterministic demo.
3. Inspect `docs/LIVE_EXECUTION.md`.
4. Open the Base Sepolia transaction.
5. Inspect the canonical Telegraph evidence JSON.
6. Review the current CI/fuzz totals.

## Evidence table

| Claim | Best evidence |
| --- | --- |
| Auctorail is a pre-execution authorization layer | `README.md`, `PRODUCT_STORY.md` |
| Real Telegraph use exists | `REAL_USAGE_LOG.md`, committed evidence JSON |
| Real x402 spend exists | canonical evidence JSON / usage ledger |
| Real protected execution exists | `LIVE_EXECUTION.md`, BaseScan transaction |
| Exact-action mutation is blocked | tests + Guided Demo + Security Lab |
| Permit replay is blocked | tests + Guided Demo |
| Missing evidence fails closed | adaptive tests + Guided Demo |
| Distinct-Miner quorum exists | `V1_2_GENERAL_QUORUM.md`, tests/fuzz |
| Evidence is bound to subject/chain | evidence-binding tests + architecture |
| Current suite is healthy | latest GitHub CI / browser QA |
| SDK integration exists | `packages/sdk/README.md` |
| Product is responsive | browser QA + responsive notes |

## Strong closing statement

> Auctorail's contribution is not merely that an agent can ask Telegraph for intelligence. It is that external intelligence can be converted into **bounded, exact, one-use execution authority without giving the agent or the intelligence provider control of the principal's permission boundary**.
