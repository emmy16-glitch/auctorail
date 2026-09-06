# Auctorail documentation

This folder contains the deeper technical and hackathon documentation for Auctorail.

If you are new to the project, do **not** try to read every file from top to bottom. Some documents record older milestones, old ProofGate naming, or validation snapshots that were correct at the time they were written. This page tells you what to read first and which facts are current.

---

## Start here

### If you are a judge or reviewer

Read these in order:

1. [`../README.md`](../README.md) — plain-English project overview.
2. [`REAL_USAGE_LOG.md`](REAL_USAGE_LOG.md) — public, committed real Telegraph/x402 usage only.
3. [`LIVE_EXECUTION.md`](LIVE_EXECUTION.md) — canonical protected Base Sepolia execution.
4. [`HACKATHON_DEMO.md`](HACKATHON_DEMO.md) — judge-facing demo path.
5. [`FINAL_SUBMISSION.md`](FINAL_SUBMISSION.md) — claim boundaries and submission copy.

### If you are a developer

Read:

1. [`../README.md`](../README.md)
2. [`ARCHITECTURE.md`](ARCHITECTURE.md)
3. [`RISK_POLICY.md`](RISK_POLICY.md)
4. [`DEVELOPER_INTEGRATION.md`](DEVELOPER_INTEGRATION.md)
5. [`V1_2_GENERAL_QUORUM.md`](V1_2_GENERAL_QUORUM.md)
6. [`../packages/sdk/README.md`](../packages/sdk/README.md)

### If you are reviewing security

Read:

1. [`ARCHITECTURE.md`](ARCHITECTURE.md)
2. [`RESILIENCE_INVARIANTS.md`](RESILIENCE_INVARIANTS.md)
3. [`ATTACK_LAB.md`](ATTACK_LAB.md)
4. [`permit-consumption-store.md`](permit-consumption-store.md)
5. [`V1_2_VALIDATION.md`](V1_2_VALIDATION.md)
6. the current source under `src/`, because code is authoritative when an older document and the implementation differ.

### If you are an AI assistant trying to understand the repository

Use this order of trust:

```text
CURRENT SOURCE CODE / CONSTANTS
        ↓
COMMITTED REAL EVIDENCE + RECEIPTS
        ↓
CURRENT GREEN CI / QA RESULTS
        ↓
ROOT README + THIS DOC INDEX
        ↓
CURRENT ARCHITECTURE / RISK DOCS
        ↓
OLDER MILESTONE / VALIDATION DOCS
```

Do not infer current behavior from an old README paragraph, an old test count, or a historical Auctorail filename when the implementation says something else.

---

## Current facts that are easy to get wrong

These are the main places where older write-ups can mislead a human or an AI.

### 1. Current product name vs historical name

**Current product name:** `Auctorail`

Historical names still intentionally exist in the repository:

- repository slug: `proof-gate`;
- contract: `ProofGateVendor`;
- wire/schema identifiers such as `proofgate.action.v2`;
- some older documentation headings and generated audit artifacts;
- compatibility exports such as `legacy-proofgate`.

Do not rename cryptographic/deployed identifiers casually. They may be part of a hash, stored artifact, historical deployment, or compatibility path.

The correct interpretation is:

```text
Auctorail = current product/brand
ProofGate = historical repository/identifier lineage
```

---

### 2. Current payment evidence tiers

The current implementation in `src/telegraph/adaptive-evidence-plan.ts` uses:

```text
LOW     <= 5 USDC
MEDIUM  > 5 to 50 USDC
HIGH    > 50 USDC
```

Current default requirements:

| Tier | Fraud quorum | Extra Intents | Confidence | Max evidence spend | Deadline |
| --- | --- | --- | ---: | ---: | ---: |
| LOW | 1 distinct / 1 positive | none | `>= 0.70` | `0.035 USDC` | `35s` |
| MEDIUM | 2 distinct / 2 positive | `ONCHAIN_TX_LOOKUP` | `>= 0.75` | `0.060 USDC` | `60s` |
| HIGH | 3 distinct / 2 positive | `ONCHAIN_TX_LOOKUP` + `WALLET_BALANCE_CHECK` | `>= 0.80` | `0.100 USDC` | `90s` |

Older text that says `<=1`, `1–5`, `5–10` as LOW/MEDIUM/HIGH is stale relative to the current implementation.

---

### 3. Evidence tier is not execution authority

The current adaptive payment policy has a hard **10 USDC autonomous execution ceiling**.

So a HIGH evidence plan does not mean an autonomous agent may execute a payment above 10 USDC.

```text
risk tier → how much evidence is required
authority → what the principal actually permits
```

Stronger evidence cannot create authority that does not already exist.

---

### 4. Current validation snapshot

Older documentation may mention:

```text
225 tests
7300 fuzz cases
```

Those numbers were valid historical snapshots, but the latest green feature-branch CI at the time this index was added completed:

```text
267 / 267 tests across 53 files
7400 / 7400 deterministic adversarial fuzz cases
0 unauthorized executions / authorizations in the fuzz suites
0 production dependency vulnerabilities reported by npm audit
```

Fuzz breakdown:

```text
1100 payment authorization
3200 adaptive + quorum
3100 general authorization
----
7400 total
```

Always prefer the newest green CI run over a frozen number in an older milestone document.

---

### 5. Real usage vs deterministic demo

Keep these categories separate.

#### Publicly committed real activity

Current conservative public totals:

```text
2 genuine Telegraph Miner acquisitions
$0.02 committed x402 evidence spend
1 protected Base Sepolia execution
```

See [`REAL_USAGE_LOG.md`](REAL_USAGE_LOG.md).

#### Deterministic / offline activity

These do **not** count as real Telegraph usage:

- Guided Demo;
- Security Lab;
- unit tests;
- fuzz harnesses;
- deterministic SDK examples;
- Content Trust demo evidence.

#### Content Trust live path

A bounded live Telegraph/x402 Content Trust client exists, but the project should not claim a real Content Trust Miner run until such a run has actually been performed, reviewed and preserved as a safe artifact.

---

## Documentation map

| File | What it is for | Notes |
| --- | --- | --- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Trust boundaries, Action/Mandate models, evidence planning, quorum, permits and execution. | Some headings still use the historical Auctorail name. The technical identifiers remain relevant. |
| [`RISK_POLICY.md`](RISK_POLICY.md) | Current payment consequence bands and why evidence tiers are separate from authority. | Use this with the source code for current thresholds. |
| [`REAL_USAGE_LOG.md`](REAL_USAGE_LOG.md) | Conservative ledger of only publicly committed real Telegraph/x402 usage. | Best source for judge-facing real-usage counts. |
| [`LIVE_EXECUTION.md`](LIVE_EXECUTION.md) | Canonical protected Base Sepolia transaction and its evidence chain. | Public proof artifact. |
| [`DEVELOPER_INTEGRATION.md`](DEVELOPER_INTEGRATION.md) | Guidance for adding trusted protected-action integrations. | Read before building an adapter. |
| [`V1_2_GENERAL_QUORUM.md`](V1_2_GENERAL_QUORUM.md) | Exact distinct-Miner quorum semantics. | Useful when reasoning about duplicate providers, positives and vetoes. |
| [`ATTACK_LAB.md`](ATTACK_LAB.md) | Deterministic attack scenarios and what each scenario proves. | Offline; not real Telegraph usage. |
| [`RESILIENCE_INVARIANTS.md`](RESILIENCE_INVARIANTS.md) | Failure and recovery invariants. | Useful for security/reliability review. |
| [`permit-consumption-store.md`](permit-consumption-store.md) | Replay-prevention/permit-consumption persistence model. | Deployment-oriented. |
| [`HACKATHON_DEMO.md`](HACKATHON_DEMO.md) | Short judge-facing presentation sequence. | Presentation document, not architecture source of truth. |
| [`DEMO_TODAY.md`](DEMO_TODAY.md) | Operational demo checklist. | Useful immediately before recording/presenting. |
| [`FINAL_SUBMISSION.md`](FINAL_SUBMISSION.md) | Submission wording, public claim discipline and checklist. | Keep claims aligned with committed artifacts. |
| [`JUDGING_CRITERIA.md`](JUDGING_CRITERIA.md) | Mapping between the project and hackathon criteria. | Judge-oriented. |
| [`TERMUX.md`](TERMUX.md) | Running the project in the developer's Termux environment. | Environment-specific. |
| [`RESPONSIVE_UI_NOTES.md`](RESPONSIVE_UI_NOTES.md) | Small UI/responsive notes. | Not a product architecture document. |
| [`V1_1_COMPETITIVE_PLAN.md`](V1_1_COMPETITIVE_PLAN.md) | Historical planning document. | Treat as project history, not current source of truth. |
| [`V1_1_VALIDATION.md`](V1_1_VALIDATION.md) | Historical validation snapshot. | Counts may be stale. |
| [`V1_2_VALIDATION.md`](V1_2_VALIDATION.md) | Later validation snapshot. | Prefer latest CI for current counts. |
| [`LOCKED_DECISIONS.md`](LOCKED_DECISIONS.md) | Earlier locked product/security decisions. | Check against current code before treating every item as current. |
| [`TRACK3_ARCHITECTURE.md`](TRACK3_ARCHITECTURE.md) | Telegraph-track architecture notes. | Useful historical/context document. |

---

## Main code map

A human or AI that wants to verify documentation should check these implementation areas.

```text
src/core/
  Action and Mandate models.

src/telegraph/
  Telegraph routing, adaptive evidence plans, x402 acquisition controls,
  evidence bundles and distinct-Miner quorum logic.

src/policy/
  Payment and Content Trust policies.

src/permit/
  Decision commitments and signed one-use authority.

src/executor/
  Protected execution, replay prevention, durable execution and spend controls.

src/receipt/
  Payment and content proof receipts.

src/sdk/
  Trusted internal integration/adaptor layer.

packages/sdk/
  Small repository-local JS SDK exposed in the product Docs surface.

web/
  Product UI.

qa/
  Browser/Playwright checks.

data/evidence/
  Sanitized real Telegraph evidence artifacts.

data/receipts/
  Stored receipts used by verification flows.
```

---

## Demo mode and live mode

This distinction should be explicit in any documentation, screenshot, tweet or AI-generated summary.

### Deterministic / zero protected side effects

```text
Guided Demo
Security Lab
most tests/fuzz harnesses
SDK examples when live:false
Content Trust demo mode
```

These are used to explain or test policy behavior.

### Live / paid or externally consequential

```text
payment Live Mode
proof:live / proof:adaptive runs
Telegraph/x402 acquisitions
protected Base Sepolia execution
Content Trust live mode when explicitly enabled
```

A live Telegraph acquisition can spend funds through x402. A protected execution can create an on-chain effect. Do not trigger these paths just for visual polish.

---

## Words to use carefully

To keep the project credible and avoid AI-generated overclaiming:

### Good

- “pre-execution authorization layer”
- “authorization rail”
- “evidence is not authority”
- “distinct-Miner quorum”
- “one-use permit”
- “publicly committed real Telegraph evidence”
- “deterministic attack/fuzz validation”
- “repository-local SDK”
- “bounded live Content Trust client exists”

### Avoid unless independently proved

- “the first ever”
- “unhackable”
- “military-grade”
- “production ready”
- “independently audited”
- “fully decentralized”
- “guarantees safe AI”
- “AI detection proves truth”
- “live Content Trust proof” when only demo output exists
- “public npm SDK” before the package is actually published

Clear, specific evidence is stronger than hype.

---

## How to document a new feature correctly

When behavior changes:

1. Update the code and tests first.
2. Re-run CI/security checks.
3. Update the root README if the user-facing model changed.
4. Update the specific technical doc that owns the behavior.
5. Update this index if a new major doc or product lane was added.
6. If real Telegraph/x402 activity occurred, preserve only safe/sanitized artifacts and update `REAL_USAGE_LOG.md`.
7. Do not turn deterministic test traffic into a “real usage” number.
8. Do not keep old thresholds/test counts in judge-facing copy once the code changed.
9. Preserve historical cryptographic/deployment identifiers when changing branding.
10. Record exactly what is implemented, what has been demonstrated live, and what is still planned.

---

## A compact explanation for another AI

If another AI assistant needs a minimal project summary, use this:

> Auctorail is a pre-execution authorization layer for autonomous agents. The principal defines bounded authority through a Mandate. The agent proposes an exact action. Auctorail freezes that action, checks authority before paid evidence acquisition, derives a consequence-based Telegraph evidence plan, verifies the actual serving Miners and evidence bindings, and returns `ALLOW`, `HOLD`, or `BLOCK`. Executable `ALLOW` decisions can produce short-lived one-use authority for a protected executor. Telegraph evidence informs authorization but never creates authority. The repository has a real Base Sepolia payment proof, publicly committed real Telegraph/x402 evidence, deterministic attack/fuzz validation, Content Trust, receipt verification, and a repository-local SDK. Current product branding is Auctorail; ProofGate remains in historical repository/deployment/schema identifiers.

That summary is intentionally factual and avoids claims that are not supported by committed artifacts.
