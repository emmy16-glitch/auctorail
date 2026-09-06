# Auctorail real Telegraph/x402 usage ledger

This file records only **publicly committed, directly inspectable real external activity**.

It intentionally excludes deterministic demonstrations, mocked flows, Security Lab scenarios, unit tests, browser QA and fuzz traffic.

The purpose is simple: a judge or reviewer should be able to distinguish what Auctorail **implemented**, what it **simulated deterministically**, and what it has **actually exercised against Telegraph/x402 and Base Sepolia**.

## Counting rules

An event is counted here only when:

1. it involved a genuine external Telegraph/x402 or protected execution path;
2. a safe artifact/reference is committed or publicly inspectable;
3. the artifact does not expose private keys, authentication secrets or unrelated sensitive data;
4. the event can be described precisely without extrapolating beyond what the artifact proves.

Do not count:

```text
Guided Demo
Security Lab
unit tests
fuzz harnesses
mocked/live-simulation responses
browser QA
local experiments without preserved safe evidence
```

## Publicly committed real Telegraph Miner acquisitions

### Acquisition 1 — 2026-09-01

Artifact:

`data/evidence/telegraph-2026-09-01T17-00-18-634Z.json`

Verified fields:

| Field | Value |
| --- | --- |
| Source | Telegraph |
| Intent | `FRAUD_DETECTION` |
| Miner | `Refut On-Chain Risk` |
| Miner ID | `95822412` |
| Target | `0xaFb077A0869c6B5bD3DC2aAF7aBb2f971Eb53d08` |
| Chain | Base Sepolia `84532` |
| Verdict | `ALLOW` |
| Confidence | `0.50` |
| Telegraph cost | `$0.01` |
| Signal hash | `0x28c002c52731ed59f12573408aa2c918ba0dd6cf7691535c7699f54d4fc8f12c` |
| x402 settlement | present |
| Captured | `2026-09-01T17:00:18.634Z` |

### What this proves

This proves Auctorail successfully performed a genuine Telegraph fraud-intelligence acquisition through the external paid evidence path.

### What this does not prove

This artifact is **not** the canonical protected execution evidence because its confidence is `0.50`, below the current LOW adaptive policy floor of `0.70`.

It should therefore be described as real Telegraph usage, not as current LOW-policy authorization proof.

## Acquisition 2 — 2026-09-02 canonical payment evidence

Artifact:

`data/evidence/telegraph-2026-09-02T17-36-12-826Z.json`

Verified fields:

| Field | Value |
| --- | --- |
| Source | Telegraph |
| Intent | `FRAUD_DETECTION` |
| Miner | `Refut On-Chain Risk` |
| Miner ID | `95822412` |
| Target | `0xB38d0405DF1b15961aEf29C7c45f2ED285822c14` |
| Chain | Base Sepolia `84532` |
| Verdict | `ALLOW` |
| Confidence | `0.70` |
| Telegraph cost | `$0.01` |
| Signal hash | `0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c` |
| x402 payment amount | `10000` minor units |
| x402 settlement success | `true` |
| x402 settlement tx | `0xc135d16a7abf5fdfc9f9dcaec001e5369865c5004224cd6bb9a822fb900daef0` |
| Captured | `2026-09-02T17:36:12.826Z` |

### What this proves

This is the canonical committed external evidence used in the protected payment story:

- real Telegraph acquisition;
- correct `FRAUD_DETECTION` Intent;
- canonical vendor subject;
- Base Sepolia context;
- confidence exactly at the current LOW floor (`0.70`);
- signal commitment present;
- x402 settlement present.

This artifact is linked to the canonical protected execution described in `LIVE_EXECUTION.md`.

## Publicly committed protected external effect

### 2026-09-02 — protected Base Sepolia vendor payment

| Field | Value |
| --- | --- |
| Network | Base Sepolia (`84532`) |
| Protected amount | `1 USDC` |
| Destination | `0xB38d0405DF1b15961aEf29C7c45f2ED285822c14` |
| Transaction | `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc` |
| Block | `46301208` |
| Proof Receipt hash | `0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3` |

BaseScan:

https://sepolia.basescan.org/tx/0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc

### What this proves

Auctorail's payment authorization architecture crossed the boundary from policy/evidence processing into a genuine protected testnet side effect.

The transaction can be inspected independently on Base Sepolia.

### What this does not prove

One successful testnet payment is not a claim of production-scale operational readiness, universal safety, or independent audit.

## Current conservative public totals

Only committed, inspectable artifacts are counted:

```text
Real Telegraph Miner acquisitions:  2
Committed x402 evidence cost:        $0.02 total
Protected Base Sepolia executions:   1
Deterministic demo requests:          excluded
Security Lab requests:                excluded
Unit/browser tests:                   excluded
Fuzz cases:                           excluded
```

These totals are intentionally conservative.

## Relationship to the current adaptive policy

The canonical 2026-09-02 fraud result has confidence `0.70`, which matches the current LOW positive floor.

Current LOW policy:

```text
amount:              <= 5 USDC
Intent:              FRAUD_DETECTION
distinct providers:  1
positive results:    1
confidence:          >= 0.70
max fraud attempts:  3
max evidence spend:  0.035 USDC
overall deadline:    12 seconds
```

The historical real artifact remains useful proof of the lane, but **current runtime authorization still evaluates current action/evidence**. A historical success is never hard-coded as permanent permission.

## Historical HIGH-risk / multi-Miner experiments

Project history may refer to later HIGH-risk or multi-Miner live experiments that produced `HOLD` after evidence failed to satisfy the frozen policy.

Unless safe, sanitized evidence from those runs is committed and directly inspectable, **do not include them in the public totals above**.

This is deliberate claim discipline.

A local file existing on one developer machine is not equivalent to a public submission artifact.

## Content Trust real-usage boundary

A bounded Content Trust live Telegraph client exists behind explicit configuration.

However, this ledger does **not** currently claim a publicly committed genuine Content Trust Miner acquisition.

Deterministic Content Trust output remains excluded from real Telegraph counts.

## When adding a new real event

For each new genuine external acquisition, record:

- date/time;
- Intent;
- serving Miner name/ID;
- exact subject/context safe for publication;
- verdict/result classification;
- confidence where applicable;
- signal hash/commitment where applicable;
- x402 cost;
- settlement reference where safe;
- artifact path;
- whether it contributed to an authorization/execution;
- claim limitations.

For each protected execution, record:

- network/system;
- action type;
- bounded public parameters;
- transaction/external reference;
- proof receipt reference;
- relationship to the authorization evidence.

## Artifact hygiene

Before committing real evidence:

1. inspect for private keys;
2. inspect for auth headers/tokens;
3. inspect for wallet secrets;
4. inspect for unrelated personal information;
5. preserve enough raw structure to verify the claim;
6. do not rewrite evidence to make it look stronger than it was;
7. hash/reference the exact sanitized artifact where possible.

## Judge-facing summary

Safe summary:

> Auctorail's repository contains two publicly committed genuine Telegraph Miner acquisitions with a total committed x402 evidence cost of $0.02, plus one protected 1-USDC Base Sepolia execution. Deterministic demo, tests and fuzz traffic are excluded from those counts.

## Final ledger rule

**Count only what a reviewer can inspect. Real usage is stronger when it is conservative, attributable and reproducible than when it is inflated with simulations.**
