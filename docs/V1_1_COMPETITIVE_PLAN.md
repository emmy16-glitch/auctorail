# Auctorail v1.1 competitive plan — historical record

> **Status: HISTORICAL.** This document records the product/security thinking that shaped an earlier ProofGate/Auctorail milestone. It is retained for project history. For current architecture, thresholds, validation counts and product positioning, use `../README.md`, `PRODUCT_STORY.md`, `ARCHITECTURE.md` and `RISK_POLICY.md`.

## Why preserve this document

The project evolved through several stages:

1. prove exact-action authorization for one payment lane;
2. add stronger evidence and replay protections;
3. add adaptive consequence tiers and distinct-Miner quorum;
4. generalize the authorization model;
5. rebrand/redesign as Auctorail.

A historical competitive plan helps explain why later architecture exists, but it should not be mistaken for the current source of truth.

## Original competitive insight

The core insight that remains valid was:

> An AI agent needs more than intelligence and tool access. It needs an enforceable authorization boundary between what it proposes and what it is permitted to execute.

That insight ultimately became the current Auctorail product thesis.

## Problems the earlier plan aimed to solve

### Excessive agency

An agent with direct access to a wallet or protected API could exceed user intent because of prompt injection, hallucination, compromised tools or logic errors.

### Weak action binding

A system could approve a general intention such as “pay vendor” while the actual amount/recipient changed later.

### Evidence substitution

A favorable signal for one subject could be reused for another if context binding was weak.

### Replay

A valid approval could be reused unless execution authority was explicitly one-use.

### Availability vs safety

External intelligence could be unavailable. The system needed a fail-closed outcome rather than optimistic execution.

These remain relevant current concerns.

## Earlier differentiation strategy

The project deliberately avoided positioning itself as only:

- a wallet-risk dashboard;
- a chatbot;
- a transaction explorer;
- a generic AI safety score;
- a single Miner wrapper.

Instead it focused on the enforcement layer:

```text
agent proposal
→ explicit authorization checks
→ external evidence
→ exact decision
→ controlled execution
```

That positioning is even clearer in current Auctorail.

## Features that emerged from this plan

The earlier plan contributed to features now present in stronger form:

- canonical action hashing;
- principal Mandates;
- evidence binding;
- Telegraph/x402 acquisition;
- policy decisions;
- one-use permits;
- replay prevention;
- controlled execution;
- proof receipts;
- attack/fuzz validation.

## What changed after v1.1

### Adaptive evidence bands

Current:

```text
LOW     <=5 USDC
MEDIUM  >5 to 50 USDC
HIGH    >50 USDC
```

### LOW deadline

Current LOW overall evidence deadline is **12 seconds**.

Any older 35-second or older tier wording in historical planning is stale.

### Distinct-Miner quorum

Current architecture counts independent providers by Miner ID and can require multiple confidence-qualified providers for higher consequence.

### General authorization core

Current architecture is no longer only payment-specific. Generic Action/Mandate/Decision concepts support additional lanes such as Content Trust.

### Product redesign

Current UI has Home, deterministic demo, Live/Check, Verify, Content Trust, Security Lab, Activity, Permissions and SDK/docs surfaces.

### Validation scale

Current validated snapshot:

```text
268 / 268 tests
7400 / 7400 deterministic adversarial cases contained
```

Older v1.1 counts are historical.

## Current competitive positioning

The strongest current positioning is:

> **Intelligence tells an agent what it knows. Auctorail determines what it is allowed to do.**

Auctorail can consume specialist Miner intelligence rather than trying to replace specialist Miners.

This creates a composable stack:

```text
specialist intelligence providers
        ↓
Auctorail authorization policy
        ↓
protected execution
```

## Current proof advantage

Auctorail's strongest evidence is not only conceptual.

The repository currently contains:

- genuine Telegraph/x402 payment evidence;
- two publicly committed real Miner acquisitions;
- one protected Base Sepolia USDC execution;
- public transaction reference;
- proof receipt;
- deterministic attack/fuzz suites;
- browser product QA.

See `REAL_USAGE_LOG.md` and `LIVE_EXECUTION.md`.

## What the historical plan should not be used to claim

Do not use old milestones to claim current:

- thresholds;
- exact policy versions;
- test counts;
- UI structure;
- branch/tag names;
- runtime requirements;
- real-usage totals.

For those, check current code/docs.

## Lessons retained from v1.1

1. A clear security primitive is stronger than a broad AI feature list.
2. Exact-action mutation is a compelling demo.
3. Replay protection makes authorization tangible.
4. Evidence must be bound, not merely displayed.
5. External intelligence should not become delegated authority.
6. Real proof artifacts matter for hackathon credibility.
7. Deterministic demo and live usage should be labeled separately.
8. Fail-closed behavior is a feature, not a demo failure.

## Current roadmap lens

Auctorail should continue improving around its authorization primitive rather than becoming a generic intelligence dashboard.

Good future directions include:

- more protected action adapters;
- step-up/human approval paths;
- stronger operational policy administration;
- richer evidence-provider ecosystems;
- production-grade durable state/observability;
- easier agent/MCP/SDK integration.

Each should preserve the same trust boundary.

## Final historical takeaway

**The v1.1 competitive plan was valuable because it identified the durable product wedge: autonomous agents need an enforceable authorization layer between intelligence and external action. Current Auctorail is the more complete expression of that idea.**
