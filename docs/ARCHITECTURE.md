# Auctorail architecture

This document describes the current Auctorail architecture, trust boundaries, authorization lifecycle, evidence acquisition path, permit model and protected execution flow.

Auctorail is a **pre-execution authorization rail for autonomous agents**. Its purpose is to keep the authority to cause external effects outside the agent's direct control.

## Architecture principle

```text
agent capability ≠ execution authority
```

The agent may propose an action. The protected effect happens only when trusted authorization components conclude that the exact action is permitted.

## High-level architecture

```text
┌───────────────────────────────┐
│ Human / Principal             │
│                               │
│ creates bounded Mandate       │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ Agent / Application           │
│                               │
│ proposes exact action         │
└───────────────┬───────────────┘
                │ untrusted request
                ▼
┌───────────────────────────────┐
│ Auctorail Authorization API   │
│                               │
│ freeze action                 │
│ authority preflight           │
│ evidence planning             │
│ policy evaluation             │
└───────────────┬───────────────┘
                │ evidence needed
                ▼
┌───────────────────────────────┐
│ Telegraph / x402              │
│                               │
│ route to Miners               │
│ purchase evidence             │
└───────────────┬───────────────┘
                │ returned evidence
                ▼
┌───────────────────────────────┐
│ Evidence Verification         │
│                               │
│ Miner identity                │
│ Intent                        │
│ subject + chain binding       │
│ confidence                    │
│ signal hash                   │
│ quorum                        │
└───────────────┬───────────────┘
                │
                ▼
        ALLOW / HOLD / BLOCK
                │
                │ ALLOW + executable lane only
                ▼
┌───────────────────────────────┐
│ Permit Authority              │
│ signed short-lived one-use    │
│ execution authority           │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ Protected Executor            │
│                               │
│ revalidate authority          │
│ consume permit                │
│ perform external effect       │
│ reconcile ambiguity           │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ Proof Receipt / Activity      │
└───────────────────────────────┘
```

## Main architectural domains

### `src/core/`

Contains canonical action and authority primitives.

Responsibilities include:

- input validation;
- canonical representation;
- action hashing;
- chain/asset normalization;
- Mandate semantics.

The action model is intentionally deterministic. Security-sensitive meaning should not depend on free-form model interpretation at execution time.

### `src/telegraph/`

Contains the external evidence subsystem.

Responsibilities include:

- consequence-derived evidence plans;
- Intent routing;
- Telegraph Miner capability handling;
- x402 payment-lane policy;
- live evidence acquisition;
- exact subject/chain binding;
- signal commitment handling;
- distinct-Miner diversity planning;
- evidence bundle construction;
- quorum evaluation;
- bounded retries and failure handling.

### `src/policy/`

Contains deterministic authorization policies.

The current payment policies include strict, attested-vendor and adaptive variants. The adaptive policy combines the frozen action, Mandate and verified evidence bundle.

A policy is not an LLM opinion. It is trusted code that returns an explicit decision.

### `src/permit/`

Contains permit creation/validation primitives and local secret handling.

Permits are not generic bearer credentials. They are designed to be bound to the exact authorization context.

### `src/executor/`

Contains protected execution logic.

Responsibilities include:

- permit verification;
- Mandate revalidation;
- kill-switch checks;
- permit consumption;
- replay prevention;
- idempotency/durable execution state;
- ambiguous-effect handling;
- protected external execution.

### `src/receipt/`

Contains proof-receipt generation/verification.

Receipts preserve important authorization/execution commitments so decisions can be inspected and tampering can be detected.

### `src/sdk/` and `packages/sdk/`

`src/sdk/` contains trusted integration/adaptor logic used by the core architecture.

`packages/sdk/` contains a thin repository-local JavaScript client that lets an application request authorization and submit returned execution authority without holding protected signing/execution secrets.

### `web/`

Contains the product UI and local HTTP API surfaces.

Important product screens include:

- Home;
- Guided Demo;
- Checking/Live authorization;
- Execution;
- Permissions;
- Activity;
- Verify;
- Content Trust;
- Security Lab;
- SDK/docs.

### `qa/`

Contains browser-level validation for responsive layout and product flow.

### `data/`

Contains sanitized committed evidence, deployment references and receipts used by the proof/verification surfaces.

## Trust-boundary model

### Trust boundary A — Agent vs authorization service

The agent controls its proposal but not the trusted Mandate, signing authority or protected credential.

The authorization service must treat client-provided values as claims to validate, not trusted policy state.

### Trust boundary B — Auctorail vs Telegraph

Telegraph is an external evidence source.

Auctorail trusts neither routing metadata nor a favorable label automatically. Returned evidence is normalized and validated against the exact requirement.

### Trust boundary C — Authorization vs protected executor

An `ALLOW` decision is not equivalent to an external effect.

The executor receives only explicit signed execution authority and independently verifies it before acting.

### Trust boundary D — Executor vs external system

The external chain/API may fail, delay or return ambiguous transport state.

Auctorail therefore needs durable state and reconciliation behavior around side effects.

## Action contract

Auctorail first creates a canonical exact action.

For the current payment adapter, important semantics include:

```text
type
chainId
token
amountRaw
destination
reason
policyId
policyVersion
```

Values such as EVM addresses are normalized before hashing.

The action hash becomes a stable commitment to the intended effect.

### Why canonicalization matters

Without canonicalization, semantically equivalent values could hash differently or semantically different requests could be compared loosely.

Auctorail's security model prefers exact structured values over free-form natural-language matching.

## Mandate architecture

The principal's Mandate defines standing authority.

A Mandate can restrict:

- agent identity;
- action types;
- destinations/targets;
- parameter ranges and amount ceilings;
- policy/version;
- evidence Intents;
- validity period;
- version and status.

The agent must not be able to convert a request field such as `limit` into authoritative self-delegation. In a production integration, authoritative limits live on the trusted side.

## Authorization lifecycle

### Step 1 — Receive proposal

The agent/application submits a structured request.

### Step 2 — Freeze exact action

Auctorail validates and canonicalizes the action and computes its action hash.

### Step 3 — Authority preflight

Auctorail checks whether the action is inside the principal's authority and hard policy bounds.

If it is already impossible to authorize, return `BLOCK` before buying external evidence.

### Step 4 — Derive evidence plan

The action consequence determines which evidence requirements apply.

For `payments.adaptive.v1`:

```text
LOW     <= 5 USDC
MEDIUM  > 5 to 50 USDC
HIGH    > 50 USDC
```

See `RISK_POLICY.md` for exact current values.

### Step 5 — Acquire external evidence

When required, Auctorail asks Telegraph for the required Intent and can pay through x402.

The request carries structured routing context for the exact action.

### Step 6 — Verify returned evidence

Auctorail checks:

- serving Miner identity;
- supported Intent;
- returned Intent;
- subject binding;
- chain binding;
- confidence;
- applicability;
- signal commitment;
- freshness;
- x402 settlement/provenance where relevant.

### Step 7 — Build evidence bundle and quorum summary

Only usable evidence enters the authorization bundle.

Distinct-provider quorum is counted by unique Miner IDs.

### Step 8 — Deterministic policy decision

The policy returns:

```text
ALLOW
HOLD
BLOCK
```

### Step 9 — Mint execution authority

Only an executable `ALLOW` can produce a signed short-lived permit.

### Step 10 — Protected execution

The executor revalidates authority, checks/consumes the permit and performs the external effect.

### Step 11 — Record proof

Receipts/activity records preserve the binding between action, evidence, decision, permit and execution outcome.

## Telegraph routing architecture

The payment lane uses Intent-based routing rather than treating one fixed Miner as the sole authorization source.

The request planner builds a precise query and structured context around:

- required Intent;
- exact target/recipient;
- exact chain/network;
- exact amount;
- exact action hash;
- exact applicability expectations.

The canonical historical Refut result demonstrates that the lane has worked, but runtime policy does not grant permission merely because that Miner succeeded historically.

## Auto-route and corroboration

The first attempt can use Telegraph's ranked auto-route.

When policy requires additional distinct providers, Auctorail can target another ranked unused Miner for corroboration.

The transport mechanism must not weaken the authorization quorum.

## Evidence rejection vs action rejection

These are different.

A piece of evidence can be rejected as unusable while the action remains eligible for another bounded acquisition attempt.

Examples:

```text
wrong returned Intent
missing explicit subject assertion
missing explicit chain assertion
route unavailable
```

After bounded attempts/deadline/budget are exhausted, missing required proof normally becomes `HOLD`.

## x402 architecture

Evidence acquisition can spend funds.

The x402 path therefore:

- inspects the payment challenge;
- selects only approved network/asset lanes;
- checks remaining evidence budget;
- creates payment payload only within policy;
- validates settlement or reconciles missing settlement evidence;
- treats ambiguous paid transport carefully.

Auctorail does not enable generic uncontrolled x402 spending.

## Adaptive evidence limits

Current defaults:

| Tier | Max spend | Deadline |
| --- | ---: | ---: |
| LOW | `0.035 USDC` | **12s** |
| MEDIUM | `0.060 USDC` | `60s` |
| HIGH | `0.100 USDC` | `90s` |

LOW also has deployed per-request Telegraph timeout protection to keep the interactive path responsive.

## Policy architecture

The adaptive payment policy verifies both the plan and evidence bundle rather than trusting a loosely assembled collection of responses.

Checks include exact plan/action matching and evidence/quorum invariants.

This prevents an attacker from constructing an easier plan after seeing the action.

## One-use permit architecture

A permit represents execution authority derived from one final authorization.

It is bound to the security context and is short-lived.

The executor checks that authority again and consumes it.

This creates separation between:

```text
decision to authorize
and
actual external execution
```

## Durable execution and replay

Protected side effects require persistence.

A naive in-memory “used” flag is insufficient for a robust deployment because process restarts or concurrent execution could undermine replay resistance.

The repository includes durable permit-store concepts and tests around consumption and ambiguous execution.

See `permit-consumption-store.md`.

## Receipt architecture

Proof receipts are built from stable commitments rather than presentation text alone.

The verifier can recompute important hashes/bindings to establish that the receipt is internally consistent under Auctorail's rules.

For the canonical payment proof, the recorded transaction can also be inspected independently on Base Sepolia.

## Content Trust architecture

Content Trust reuses the generic authorization model for a non-payment subject.

The pattern remains:

```text
freeze exact content/action
→ bind evidence to the content subject
→ deterministic policy
→ ALLOW / HOLD / BLOCK
→ content receipt
```

The current public claim carefully distinguishes deterministic Content Trust demo support from real live Telegraph evidence already preserved for the payment lane.

## Browser/product architecture

The redesigned UI intentionally separates:

- explanation;
- deterministic demonstration;
- live authorization;
- proof verification;
- adversarial testing;
- SDK/integration documentation.

This reduces the risk that a deterministic demo is visually confused with a paid live Telegraph run.

## Runtime architecture

Local development currently starts:

```text
port 8787  payment authorization API
port 8788  utility / Security Lab / Content Trust / Verify API
port 5173  Vite web UI
```

Current `main` requires **Node `>=24.15.0`**. The repository `.nvmrc` selects Node 24 and current GitHub Actions workflows run Node 24. Node 20 is not a supported current baseline.

## Failure model

Auctorail intentionally distinguishes:

- invalid proposal;
- authority denial;
- evidence acquisition failure;
- unusable evidence;
- insufficient quorum;
- policy block;
- permit failure;
- execution failure;
- ambiguous external effect.

Collapsing all of those into a generic “error” would make unsafe retry and debugging mistakes more likely.

See `TROUBLESHOOTING.md`.

## Security invariants

The architecture is intended to maintain:

1. The agent cannot mint its own authority.
2. The principal controls standing permission.
3. Paid evidence happens only after eligibility preflight.
4. Evidence must bind to the exact action/subject.
5. Required Intent cannot be silently substituted.
6. Duplicate providers cannot fake diversity.
7. Evidence spending and latency remain bounded.
8. Missing evidence fails closed.
9. Explicit negative evidence is not ignored.
10. Permit authority is short-lived and one-use.
11. Execution revalidates authority.
12. Replay is rejected.
13. Ambiguous effects are reconciled rather than blindly repeated.
14. Receipts preserve important commitments.

## Current validation

Latest green `main`:

```text
53 test files
268 / 268 tests passed
7400 / 7400 deterministic adversarial fuzz cases contained
0 unauthorized executions / authorizations in those fuzz suites
0 production dependency vulnerabilities reported by npm audit
```

Browser product-flow QA also passed for the current redesign.

## Architectural limitations

The current system should not be described as universally production complete.

Important limitations/assumptions include:

- trusted host compromise remains powerful;
- external Miner truth/availability is not guaranteed;
- the public UI's permission fields are a hackathon/demo interface, not a complete enterprise policy administration system;
- the repository-local SDK is not yet a public package release;
- Content Trust live-client capability exists but does not imply a publicly preserved real Content Trust run;
- higher-risk evidence plans do not override the 10-USDC autonomous payment ceiling.

## Naming compatibility

Current product: **Auctorail**.

Historical stable names such as `proofgate.action.v2`, `proofgate.*` evidence/receipt schemas and `ProofGateVendor` may remain because they are part of deployed or hashed provenance.

Do not rename those without a deliberate migration plan.

## Final architecture rule

**The protected credential belongs behind Auctorail, not inside the agent. The agent proposes; the principal delegates; evidence informs; deterministic policy decides; one-use authority enables; the protected executor acts.**
