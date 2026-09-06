# Auctorail documentation

This directory is the canonical documentation set for **Auctorail**, a pre-execution authorization layer for autonomous agents.

The project was previously called ProofGate, so some historical schema identifiers, audit artifacts, filenames and the already-deployed `ProofGateVendor` contract still retain the old name. Those are compatibility/provenance details, not a second product.

## Read this first

If you remember only one rule from the documentation, use this:

```text
CURRENT SOURCE CODE
        ↓
CURRENT GREEN TEST / QA RESULTS
        ↓
COMMITTED REAL EVIDENCE + RECEIPTS
        ↓
CURRENT README / ARCHITECTURE / RISK DOCS
        ↓
HISTORICAL MILESTONE DOCS
```

When prose and implementation disagree, the current implementation and its passing tests are authoritative.

## Auctorail in one paragraph

Auctorail sits between an AI agent and a protected external effect. The principal defines bounded standing authority. The agent proposes one exact action. Auctorail freezes the action, checks whether it is inside the principal's Mandate, derives any evidence requirements from the consequence, acquires and verifies Telegraph Miner evidence when needed, and returns deterministic `ALLOW`, `HOLD`, or `BLOCK`. Only an executable `ALLOW` can produce short-lived one-use authority for the protected executor. Telegraph intelligence informs authorization but cannot create authority the principal never delegated.

## Start here by audience

### Judges / hackathon reviewers

1. [`../README.md`](../README.md) — canonical project overview.
2. [`PRODUCT_STORY.md`](PRODUCT_STORY.md) — simplest explanation of the problem and product differentiation.
3. [`HACKATHON_DEMO.md`](HACKATHON_DEMO.md) — exact judge-facing demonstration sequence.
4. [`REAL_USAGE_LOG.md`](REAL_USAGE_LOG.md) — conservative ledger of genuine Telegraph/x402 usage.
5. [`LIVE_EXECUTION.md`](LIVE_EXECUTION.md) — canonical protected Base Sepolia proof.
6. [`FINAL_SUBMISSION.md`](FINAL_SUBMISSION.md) — claim boundaries and submission copy.
7. [`JUDGING_CRITERIA.md`](JUDGING_CRITERIA.md) — evidence mapped to judging criteria.

### Developers integrating an agent or protected tool

1. [`../README.md`](../README.md)
2. [`ARCHITECTURE.md`](ARCHITECTURE.md)
3. [`DEVELOPER_INTEGRATION.md`](DEVELOPER_INTEGRATION.md)
4. [`RISK_POLICY.md`](RISK_POLICY.md)
5. [`V1_2_GENERAL_QUORUM.md`](V1_2_GENERAL_QUORUM.md)
6. [`../packages/sdk/README.md`](../packages/sdk/README.md)
7. [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)

### Security reviewers

1. [`SECURITY_MODEL.md`](SECURITY_MODEL.md)
2. [`ARCHITECTURE.md`](ARCHITECTURE.md)
3. [`RESILIENCE_INVARIANTS.md`](RESILIENCE_INVARIANTS.md)
4. [`ATTACK_LAB.md`](ATTACK_LAB.md)
5. [`permit-consumption-store.md`](permit-consumption-store.md)
6. [`V1_2_GENERAL_QUORUM.md`](V1_2_GENERAL_QUORUM.md)
7. [`V1_2_VALIDATION.md`](V1_2_VALIDATION.md)
8. current code under `src/`.

### Demo / recording operators

1. [`DEMO_TODAY.md`](DEMO_TODAY.md)
2. [`HACKATHON_DEMO.md`](HACKATHON_DEMO.md)
3. [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)
4. [`LIVE_EXECUTION.md`](LIVE_EXECUTION.md)

### AI assistants analyzing the repository

Read [`GLOSSARY.md`](GLOSSARY.md), then apply the source-of-truth order at the top of this page. Do not infer current behavior from stale test counts, old screenshots, old ProofGate branding or historical threshold values.

## Current facts — September 2026

These are the facts most likely to become stale or be misstated.

### Product and repository name

```text
Current product:     Auctorail
Current repository:  emmy16-glitch/auctorail
Historical name:     ProofGate
```

Legacy identifiers can intentionally remain in:

- `proofgate.*` schema/wire-format names;
- `ProofGateVendor` contract and artifacts;
- historical audit artifact filenames;
- compatibility SDK exports;
- historical validation headings/logs.

Public product copy should use **Auctorail**.

### Current payment evidence tiers

The authoritative implementation is `src/telegraph/adaptive-evidence-plan.ts`.

| Tier | Proposed amount | Fraud requirement | Extra Intents | Attempts | Max evidence spend | Overall deadline |
| --- | --- | --- | --- | ---: | ---: | ---: |
| LOW | `<= 5 USDC` | 1 distinct positive Miner at `>=0.70` | none | 3 | `0.035 USDC` | **12s** |
| MEDIUM | `>5 to 50 USDC` | 2 distinct positives at `>=0.75` | `ONCHAIN_TX_LOOKUP` | 4 | `0.060 USDC` | `60s` |
| HIGH | `>50 USDC` | 3 distinct Miners, at least 2 positives at `>=0.80` | `ONCHAIN_TX_LOOKUP` + `WALLET_BALANCE_CHECK` | 5 | `0.100 USDC` | `90s` |

The LOW window used to be documented as `35s`; that is stale. It is now **12 seconds**.

### Autonomous execution ceiling

The current adaptive payment policy has a separate hard ceiling:

```text
10 USDC per autonomous action
```

Evidence tier and spending authority are different concepts.

```text
risk tier → how much evidence is required
Mandate/policy → what the agent is actually permitted to execute
```

### LOW evidence requirements

For the current Base Sepolia payment lane, LOW still requires:

- required Intent `FRAUD_DETECTION`;
- exact subject/recipient applicability;
- exact chain binding (`84532`);
- confidence `>= 0.70`;
- usable signal commitment/hash;
- no explicit negative evidence;
- bounded attempts/spend/deadline;
- final deterministic policy `ALLOW`.

The shorter latency window does **not** weaken those requirements.

### Live upstream timeout protection

The deployed API path additionally bounds individual Telegraph HTTP calls so one slow upstream request cannot leave the interactive LOW-risk flow waiting indefinitely.

### Current validation snapshot

The latest green `main` validation for the redesigned version completed:

```text
53 test files
268 / 268 tests passed
```

Deterministic fuzz suites:

```text
1100 payment authorization cases
3200 adaptive + quorum cases
3100 general authorization cases
----
7400 adversarial cases contained

0 unauthorized executions / authorizations
0 uncaught fuzz errors
```

Production dependency audit:

```text
0 vulnerabilities reported
```

The current browser/Playwright product-flow audit also passed.

Older docs mentioning 225 or 267 tests are historical snapshots unless explicitly marked current.

### Current Node recommendation

The redesigned dependency set includes browser/DOM development packages that officially require Node 22/24.

**Node 24 is recommended for current local development.**

Some existing workflow configuration still exercises Node 20 and currently passes, but its `EBADENGINE` warnings should not be interpreted as a long-term supported dependency baseline.

### Public real usage

Conservative committed totals:

```text
Real Telegraph Miner acquisitions: 2
Committed x402 evidence cost:       $0.02
Protected Base Sepolia executions:  1
```

Do not include deterministic demo, Security Lab, unit tests, fuzz tests or mocked Content Trust output in these numbers.

## The most important conceptual distinction

```text
proposal ≠ authority
Miner result ≠ authority
confidence ≠ authority
stronger evidence ≠ expanded authority
```

A favorable evidence result can satisfy a policy requirement only **inside existing delegated authority**.

## Current product surfaces

- **Home** — plain-language explanation and interactive product story.
- **Watch Demo** — deterministic valid/mutated/replay/missing-evidence scenarios.
- **Check / Live** — real payment authorization path when live mode is configured.
- **Permissions** — principal-facing public demo settings.
- **Activity** — decisions and execution/receipt details.
- **Verify** — proof/receipt verification.
- **Content Trust** — generic content authorization lane.
- **Security Lab** — deterministic adversarial scenarios.
- **SDK / Docs** — repository-local integration surface.

## Documentation map

| Document | Purpose | Authority level |
| --- | --- | --- |
| [`../README.md`](../README.md) | Canonical overview, current facts, proof and scope. | Current |
| [`PRODUCT_STORY.md`](PRODUCT_STORY.md) | Product narrative, differentiation and judge pitch. | Current |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Components, data/trust flow and protected execution architecture. | Current |
| [`SECURITY_MODEL.md`](SECURITY_MODEL.md) | Threat model, trust boundaries and security invariants. | Current |
| [`RISK_POLICY.md`](RISK_POLICY.md) | Adaptive payment evidence thresholds and rationale. | Current |
| [`DEVELOPER_INTEGRATION.md`](DEVELOPER_INTEGRATION.md) | How to integrate a new agent/protected adapter safely. | Current |
| [`REAL_USAGE_LOG.md`](REAL_USAGE_LOG.md) | Only publicly committed genuine Telegraph/x402 usage. | Current ledger |
| [`LIVE_EXECUTION.md`](LIVE_EXECUTION.md) | Canonical real Telegraph + Base Sepolia execution proof. | Current proof |
| [`HACKATHON_DEMO.md`](HACKATHON_DEMO.md) | Judge-facing demo structure and narration. | Current presentation |
| [`DEMO_TODAY.md`](DEMO_TODAY.md) | Recording/demo operational checklist. | Current operations |
| [`FINAL_SUBMISSION.md`](FINAL_SUBMISSION.md) | Submission claims, boundaries and checklist. | Current submission |
| [`JUDGING_CRITERIA.md`](JUDGING_CRITERIA.md) | Evidence mapped to evaluation criteria. | Current judge aid |
| [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) | Live/demo/deployment diagnosis. | Current operations |
| [`GLOSSARY.md`](GLOSSARY.md) | Exact project terminology. | Current reference |
| [`RESILIENCE_INVARIANTS.md`](RESILIENCE_INVARIANTS.md) | Failure/recovery invariants. | Current security |
| [`ATTACK_LAB.md`](ATTACK_LAB.md) | Deterministic adversarial scenarios. | Current validation |
| [`permit-consumption-store.md`](permit-consumption-store.md) | Replay-prevention persistence model. | Current design |
| [`V1_2_GENERAL_QUORUM.md`](V1_2_GENERAL_QUORUM.md) | Detailed distinct-provider quorum semantics. | Current technical context |
| [`RESPONSIVE_UI_NOTES.md`](RESPONSIVE_UI_NOTES.md) | Responsive redesign notes and QA expectations. | Current UI |
| [`TERMUX.md`](TERMUX.md) | Environment-specific local setup notes. | Operational |
| [`LOCKED_DECISIONS.md`](LOCKED_DECISIONS.md) | Historical locked decisions with current status notes. | Historical/current mix |
| [`TRACK3_ARCHITECTURE.md`](TRACK3_ARCHITECTURE.md) | Telegraph-track architecture evolution. | Historical context |
| [`V1_1_COMPETITIVE_PLAN.md`](V1_1_COMPETITIVE_PLAN.md) | Earlier competitive/product planning. | Historical |
| [`V1_1_VALIDATION.md`](V1_1_VALIDATION.md) | Earlier validation snapshot. | Historical |
| [`V1_2_VALIDATION.md`](V1_2_VALIDATION.md) | Later validation snapshot plus current delta. | Historical/current context |

## Code map for documentation verification

```text
src/core/
  Action and Mandate primitives.

src/policy/
  Deterministic payment/content authorization policies.

src/telegraph/
  Telegraph routing, x402 controls, evidence planning,
  normalization, exact binding and quorum.

src/permit/
  Decision commitments and signed execution authority.

src/executor/
  Protected execution, durable state, replay and ambiguity controls.

src/receipt/
  Payment/content proof receipts.

src/sdk/
  Trusted integration/adaptor logic.

packages/sdk/
  Thin repository-local JavaScript client.

web/
  Product UI and HTTP API surfaces.

qa/
  Browser automation and product-flow validation.

data/evidence/
  Sanitized real evidence artifacts.

data/receipts/
  Stored receipt artifacts.
```

## Deterministic vs live activity

### Deterministic / no intentional live evidence purchase

- Watch Demo;
- Security Lab;
- unit tests;
- fuzz harnesses;
- repository SDK examples using `live:false`;
- Content Trust demo mode.

### Live / potentially paid or consequential

- payment Live Mode;
- live Telegraph/x402 evidence acquisition;
- protected Base Sepolia execution;
- Content Trust live client when explicitly enabled.

A live evidence request can spend funds through x402. A protected execution can create a real testnet transaction. Keep demo polish separate from live-value operations.

## Claim discipline

### Good language

- “pre-execution authorization layer”
- “authorization rail for autonomous agents”
- “evidence is not authority”
- “distinct-Miner quorum”
- “exact-action binding”
- “one-use permit”
- “fail-closed HOLD”
- “publicly committed real Telegraph/x402 evidence”
- “protected Base Sepolia execution”
- “deterministic adversarial validation”
- “repository-local SDK”

### Avoid unless independently established

- “unhackable”
- “military-grade”
- “production certified”
- “independently audited”
- “guarantees safe AI”
- “fully decentralized”
- “first ever”
- “every product lane is live through Telegraph”
- “AI detection proves truth”
- “public npm SDK” before publication

## How to update documentation correctly

When implementation behavior changes:

1. Change code first.
2. Add/update tests that lock the intended behavior.
3. Run typecheck/tests/fuzz/browser QA.
4. Update the owning technical document.
5. Update root README if the public mental model changed.
6. Update this current-facts index for thresholds/counts/runtime changes.
7. Update demo/submission docs if the public claim changed.
8. Update `REAL_USAGE_LOG.md` only for genuine preserved external activity.
9. Preserve historical cryptographic/protocol identifiers unless migration is intentional.
10. Clearly separate **implemented**, **demonstrated**, and **planned**.

## Compact summary for another AI

> Auctorail is a pre-execution authorization layer for autonomous agents. A principal creates bounded standing authority. An agent proposes an exact action. Auctorail freezes the action, checks authority before paying for external evidence, derives consequence-based Telegraph requirements, verifies the actual serving Miner/evidence binding, and returns `ALLOW`, `HOLD`, or `BLOCK`. Only executable `ALLOW` decisions can create short-lived one-use authority for a protected executor. Evidence informs policy but never manufactures authority. The repository contains genuine Telegraph/x402 payment evidence, a protected Base Sepolia execution, deterministic attack/fuzz validation, Content Trust, proof verification, a repository-local SDK, and a redesigned responsive web product. Current branding is Auctorail; some `proofgate.*` and `ProofGateVendor` identifiers remain intentionally for compatibility and provenance.
