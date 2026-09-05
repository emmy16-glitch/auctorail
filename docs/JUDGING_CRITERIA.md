# Auctorail — Telegraph Track 3 Judging Map

This document maps Auctorail to the official Application Track priorities so the submission stays focused on what judges are actually scoring.

## 1. Users acquired & activity

Do not invent user counts.

Current verifiable activity in the repository includes:

- real Telegraph/x402 Miner acquisitions;
- a real protected Base Sepolia execution;
- deterministic product demo activity;
- Security Lab adversarial validation;
- SDK/integration examples.

Publicly committed real-Telegraph totals are tracked in `docs/REAL_USAGE_LOG.md`.

If additional people test the app before submission, record only real usage that can be supported by logs/screenshots/artifacts. Do not manufacture adoption numbers.

## 2. Usage and adoption

Strongest current proof:

```text
2 publicly committed real Telegraph Miner acquisitions
$0.02 committed x402 evidence cost
1 protected Base Sepolia execution
```

A later HIGH-risk multi-Miner live run is documented but its raw adaptive artifacts were local/untracked at the time of the finalization pass, so it is not counted in those public totals until safe artifacts are committed.

The deterministic demo, Security Lab and fuzz suites are excluded from real-usage totals.

## 3. Creativity and usefulness

Auctorail is not a Miner-response viewer.

The product uses Telegraph to solve an authorization problem for autonomous agents:

```text
agent proposes an action
→ exact action is frozen
→ consequence determines required intelligence
→ Telegraph routes to Miners
→ Auctorail validates exact evidence bindings
→ delegated authority + sufficient evidence required
→ one-use permit
→ controlled execution
```

Key differentiation:

- higher consequence requires more intelligence;
- multi-Intent evidence can be required;
- higher-risk fraud checks require distinct-Miner corroboration;
- duplicate Miner routing cannot fake consensus;
- wrong-chain evidence is rejected;
- insufficient confidence results in `HOLD`;
- a Miner `ALLOW` is evidence, not permission;
- x402 evidence spending is bounded;
- exact action mutation and permit replay are blocked.

## 4. Must use Telegraph Miners

Auctorail has publicly committed genuine Telegraph evidence artifacts:

- `data/evidence/telegraph-2026-09-01T17-00-18-634Z.json`
- `data/evidence/telegraph-2026-09-02T17-36-12-826Z.json`

The canonical protected execution used `Refut On-Chain Risk` (`95822412`) for `FRAUD_DETECTION` and recorded successful x402 settlement.

The application also implements consequence-adaptive routing and distinct-Miner quorum logic for higher-risk checks.

Important presentation rule:

```text
GUIDED DEMO / SECURITY LAB / FUZZ
= deterministic, zero-payment, not claimed as live Miner data

LIVE MODE / SAVED TELEGRAPH ARTIFACTS
= genuine Telegraph/x402 activity
```

## 5. Engagement on posts showcasing the project

All hackathon update/submission posts should tag:

`@Telegraphprotoc`

Use the ready-to-post copy in `docs/FINAL_SUBMISSION.md`.

Post material that shows real progress rather than generic marketing:

- real Telegraph evidence artifact;
- Basescan transaction;
- HIGH-risk `HOLD` explanation once its safe artifacts are public;
- Security Lab mutation/replay containment;
- short SDK integration clip;
- final 3-minute product demo.

## High-value Telegraph areas Auctorail already covers

The official rules emphasize deeper integrations such as on-chain intelligence pipelines, autonomous workflows, multi-Intent intelligence, confidence thresholds/routing behavior and signal quality/verification.

Auctorail maps directly to those areas:

```text
ON-CHAIN PIPELINE
Telegraph evidence → authorization → Base Sepolia execution

AUTONOMOUS WORKFLOW
agent proposal → automatic evidence/policy/permit/execution boundary

MULTI-INTENT
risk tier can require FRAUD_DETECTION + ONCHAIN_TX_LOOKUP + WALLET_BALANCE_CHECK

CONFIDENCE THRESHOLDS
LOW / MEDIUM / HIGH use different confidence floors

ROUTING / PROVIDER DIVERSITY
actual serving Miner recorded; duplicate identity does not count twice

SIGNAL VERIFICATION
subject, chain, Intent, confidence, applicability and provenance checked before acceptance
```

## Final presentation priority

Do not lead with UI polish.

Lead with:

1. real Telegraph Miner evidence;
2. real Base Sepolia protected execution;
3. the rule that Miner output is evidence, not authority;
4. consequence-adaptive multi-Intent/distinct-Miner policy;
5. real refusal/HOLD behavior;
6. attack containment;
7. SDK/adaptability;
8. public progress posts.
