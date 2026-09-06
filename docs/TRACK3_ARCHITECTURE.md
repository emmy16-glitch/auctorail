# Auctorail Telegraph-track architecture

This document explains how Auctorail uses Telegraph within the authorization architecture and records the evolution from the earlier ProofGate hackathon design to the current Auctorail implementation.

It is partly historical, but the current-state sections are aligned with `main`.

## Current product thesis

Auctorail is not primarily a Miner-query frontend.

Its role is:

> **Use specialist external intelligence as evidence inside a trusted authorization boundary for autonomous execution.**

Telegraph answers intelligence questions. Auctorail combines those answers with principal authority and exact-action policy before execution.

## Current high-level Telegraph path

```text
Agent proposes exact action
        ↓
Auctorail freezes action
        ↓
Mandate / authority preflight
        ↓
Adaptive evidence plan
        ↓
Telegraph Intent request
        ↓
x402 evidence payment when required
        ↓
Serving Miner result
        ↓
Intent + subject + chain + confidence + signal verification
        ↓
Distinct-Miner quorum
        ↓
ALLOW / HOLD / BLOCK
        ↓
One-use execution authority on executable ALLOW
```

## Why Telegraph is useful to Auctorail

An authorization system should not rely only on the agent's own reasoning about whether an external target is safe.

Telegraph allows Auctorail to request specialized evidence from purpose-built Miners.

Current adaptive payment Intents include:

- `FRAUD_DETECTION`;
- `ONCHAIN_TX_LOOKUP`;
- `WALLET_BALANCE_CHECK`.

The evidence plan decides which Intents are required based on consequence.

## Historical architecture evolution

### Phase 1 — single real fraud evidence

The earliest live path demonstrated that Auctorail/ProofGate could:

- call Telegraph;
- receive a real `FRAUD_DETECTION` result;
- pay through x402;
- bind the result to a payment subject/chain;
- use that evidence inside a protected execution chain.

The canonical 2026-09-02 run used Refut On-Chain Risk and produced a protected 1-USDC Base Sepolia execution.

### Phase 2 — adaptive consequence tiers

The payment architecture evolved from a single fixed evidence requirement to consequence-derived plans.

Current bands:

```text
LOW     <= 5 USDC
MEDIUM  > 5 to 50 USDC
HIGH    > 50 USDC
```

### Phase 3 — distinct-Miner quorum

Higher consequence introduced true provider diversity.

Repeated calls to one Miner no longer count as multiple providers.

### Phase 4 — generalized authorization architecture

The project expanded beyond one payment-specific flow into generic Action/Mandate/Decision/Permit/Executor concepts, later reused by Content Trust.

### Phase 5 — product redesign

The UI evolved into a clearer Auctorail product with:

- plain-language Home;
- deterministic Watch Demo;
- Live/Check flow;
- Verify;
- Content Trust;
- Security Lab;
- SDK/docs;
- responsive browser QA.

## Current adaptive evidence plans

### LOW

```text
Amount: <= 5 USDC
Intent: FRAUD_DETECTION
Distinct Miners: 1
Qualified positives: 1
Confidence floor: 0.70
Max fraud attempts: 3
Max evidence spend: 0.035 USDC
Overall evidence deadline: 12 seconds
```

### MEDIUM

```text
Amount: >5 to 50 USDC
FRAUD_DETECTION:
  distinct Miners: 2
  qualified positives: 2
  confidence floor: 0.75
  max attempts: 4
Additional Intent: ONCHAIN_TX_LOOKUP
Max evidence spend: 0.060 USDC
Overall deadline: 60 seconds
```

### HIGH

```text
Amount: >50 USDC
FRAUD_DETECTION:
  distinct Miners: 3
  qualified positives: at least 2
  confidence floor: 0.80
  max attempts: 5
Additional Intents:
  ONCHAIN_TX_LOOKUP
  WALLET_BALANCE_CHECK
Max evidence spend: 0.100 USDC
Overall deadline: 90 seconds
```

The current autonomous payment execution ceiling is still `10 USDC`. Evidence tier does not override authority.

## Telegraph request construction

The current verification planner makes the required semantics explicit.

For LOW payment fraud checks, the request identifies:

- required `FRAUD_DETECTION` Intent;
- exact destination/subject;
- exact Base Sepolia chain ID `84532`;
- exact payment amount;
- exact action hash;
- exact applicability requirement.

Structured routing context includes the payment identity so the Telegraph router is less likely to answer a different question.

## Routing hints are not proof

Auctorail must not treat its own request as returned evidence.

Example:

```text
Auctorail sends chainId=84532
```

This does not allow Auctorail to pretend the Miner explicitly asserted chain `84532` if the returned evidence does not.

Provider response binding remains mandatory.

## Auto-routing

The first request can use Telegraph's ranked `/v1/ask` route.

The authorization architecture is provider-neutral at the policy layer. It does not grant permanent authority to one hard-coded Miner because one historical request succeeded.

## Direct corroboration

When a requirement needs additional distinct providers, the transport layer can choose another ranked unused Miner and target it directly.

This improves liveness/provider diversity while preserving the original quorum.

## Route failures

Some route failures are retryable within the frozen plan.

Examples:

- route unavailable;
- wrong Intent;
- missing explicit subject assertion;
- missing explicit chain assertion;
- direct corroboration endpoint unavailable.

Rejected evidence can be recorded for diagnostics without counting toward authorization.

## Bounded LOW liveness

The interactive LOW path now uses:

```text
12-second overall evidence window
```

instead of the older 35-second value.

The deployed API also bounds individual Telegraph HTTP calls.

This means external provider slowness should become a timely fail-closed `HOLD`, not a long unexplained spinner.

## x402 architecture

Telegraph evidence may require payment.

Auctorail constrains x402 with:

- approved network;
- approved asset;
- per-plan total evidence budget;
- actual payment requirement validation;
- settlement evidence/reconciliation;
- special handling for ambiguous paid transport.

Auctorail intentionally does not enable arbitrary agent-controlled x402 spending.

## Serving-Miner validation

The system must establish which Miner actually served the response.

This matters because authorization policy can require provider capability and provider diversity.

A generic “request succeeded” response without trustworthy serving-Miner identity is not enough for a provider-counted quorum.

## Intent validation

A returned response for another Intent should not satisfy the required Intent simply because the data looks useful.

For example:

```text
Required: FRAUD_DETECTION
Returned: transaction lookup result
```

must not become a valid fraud vote.

## Exact binding

Evidence must apply to the exact subject and chain.

The payment lane currently requires explicit binding to:

```text
subject = exact destination
chain   = Base Sepolia / 84532
```

This prevents chain confusion and wallet substitution.

## Signal commitments

Required evidence includes a usable signal hash/commitment.

The commitment helps bind the evidence artifact rather than relying only on displayed verdict text.

## Real public Telegraph evidence

The repository currently has two publicly committed genuine Telegraph acquisitions.

Canonical one:

```text
Intent: FRAUD_DETECTION
Miner: Refut On-Chain Risk
Miner ID: 95822412
Target: 0xB38d0405DF1b15961aEf29C7c45f2ED285822c14
Chain: 84532
Verdict: ALLOW
Confidence: 0.70
Cost: $0.01
Signal hash: 0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c
```

See `REAL_USAGE_LOG.md`.

## Real execution relationship

The canonical evidence belongs to the historical protected Base Sepolia payment described in `LIVE_EXECUTION.md`.

That transaction predates the later adaptive/multi-Miner architecture and should not be presented as if it retroactively exercised every current control.

## Track-usage discipline

Real Telegraph usage:

```text
counted only when genuine external evidence is preserved safely
```

Not counted:

```text
Guided Demo
Security Lab
unit tests
fuzzing
mocked Content Trust output
browser QA
```

Current conservative public totals:

```text
2 real Telegraph acquisitions
$0.02 committed x402 evidence cost
1 protected Base Sepolia execution
```

## Differentiation from an intelligence UI

A Telegraph app can make Miners easier for humans/agents to query.

Auctorail operates one layer later:

```text
intelligence service → answers a question
Auctorail → determines whether the answer is sufficient inside delegated authority to unlock a protected action
```

This makes Auctorail complementary to specialist Miners and MCP intelligence tools.

## Current validation of Telegraph-related security

Tests cover:

- auto-route behavior;
- route resilience;
- direct diversity;
- exact-chain diversity;
- request-binding priority;
- serving-Miner/Intent semantics;
- evidence binding;
- x402 policy;
- x402 reconciliation;
- adaptive orchestration;
- low-risk liveness;
- quorum invariants.

The adaptive/quorum fuzz harness adds 3200 deterministic adversarial cases.

## Planned evolution

Potential future improvements include:

- stronger provider-health/routing observability;
- durable evidence acquisition operation state;
- additional verified Intents;
- richer policy composition;
- step-up/human approval for actions above autonomous ceilings;
- more protected adapters that consume Telegraph evidence.

These should be presented as future direction unless implemented and validated.

## Final Telegraph-track principle

**Auctorail's use of Telegraph is not “ask a Miner, then trust it.” It is “derive the proof required for this exact action, acquire that proof through bounded paid routing, verify the real serving evidence, and use deterministic policy to decide whether execution authority may exist.”**
