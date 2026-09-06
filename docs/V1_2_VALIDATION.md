# Auctorail v1.2 validation record and current delta

This document preserves the v1.2 validation milestone that introduced stronger adaptive evidence, same-Intent distinct-Miner quorum and the generalized authorization core, then explains how current `main` has moved beyond that snapshot.

> **Status:** historical milestone with current-delta notes. For present-tense submission claims, use the latest green CI plus `docs/README.md`.

## Validated v1.2 milestone

The documented v1.2 architecture added or locked important security ideas including:

- consequence-derived LOW / MEDIUM / HIGH payment evidence plans;
- multi-Intent Telegraph routing;
- same-Intent distinct-Miner quorum;
- confidence-aware positive voting;
- high-confidence negative early veto plus stricter final explicit-negative handling;
- duplicate-Miner independence protection;
- canonical quorum summaries inside evidence bundles;
- x402 per-request and aggregate evidence budgets;
- x402 challenge-swap / TOCTOU controls;
- general action, Mandate, decision and permit envelopes;
- trusted Action Adapter Registry;
- exact adapter evidence-Intent coverage enforcement;
- authority-before-evidence-spend preflight;
- Mandate revalidation at permit/execution boundaries;
- fail-closed generic execution kill switch;
- atomic generic permit consumption/replay protection;
- ambiguous-effect handling.

## Historical validated code snapshot

Pre-documentation v1.2 code SHA:

`2e06cbb82e32fc8d8b516af3742b0a31c853c40f`

Historical GitHub Actions run:

`33723583899`

Historical branch:

`v1.2-general-quorum`

Those values are retained as provenance only. Current `main` is newer.

## Vendor reproducibility milestone

The v1.2 validation recorded:

```text
tracked vendor source/artifact/manifest verification: PASS
pinned native solc recompilation on Linux x64: PASS
compiler: 0.8.36+commit.8a079791
source SHA-256: afcb3e214b74e6b4fdbed034a3a517498228fb7d59e15fa7ed613bf776cb1b22
artifact SHA-256: 3c7bbca4b8d4970b89cd9507e913e004ddcfa9fb061a0468805f465b6220d291
creation bytecode: 258 bytes
runtime bytecode: 165 bytes
```

The historical `ProofGateVendor` name is preserved intentionally because it is part of deployment/artifact provenance.

## Historical deterministic test milestone

An earlier v1.2 code snapshot recorded:

```text
43 / 43 test files
225 / 225 tests
```

That count is now historical.

The later documentation-frozen v1.2 release candidate recorded:

```text
53 / 53 test files
268 / 268 tests
```

This demonstrates why test counts in milestone documents should not be treated as timeless current facts.

## Historical fuzz gates

### Exact-action fuzz

```text
Mutation families:        11
Cases per family:         100
Adversarial contained:    1100 / 1100
Valid controls:           100 / 100
Unauthorized executions: 0
Uncaught errors:          0
Telegraph requests:       0
x402 payments:            0
Blockchain writes:        0
```

### Adaptive + distinct-Miner quorum fuzz

```text
Mutation families:             32
Cases per family:              100
Adversarial contained:         3200 / 3200
Valid controls:                100 / 100
Unauthorized authorizations:  0
Uncaught errors:               0
Telegraph requests:            0
x402 payments:                 0
Blockchain writes:             0
```

### General authorization fuzz

```text
Mutation families:        31
Cases per family:         100
Adversarial contained:    3100 / 3100
Valid controls:           100 / 100
Unauthorized executions: 0
Uncaught errors:          0
Telegraph requests:       0
x402 payments:            0
Blockchain writes:        0
```

Combined deterministic result:

```text
7400 / 7400 adversarial cases contained
0 unauthorized executions / authorizations
0 uncaught fuzz errors
```

These remain the current fuzz totals as of the latest green `main` snapshot.

## What the adaptive/quorum suite attacks

Representative mutation families include:

- risk-tier downgrade;
- required-Intent removal;
- distinct-Miner downgrade;
- positive-vote downgrade;
- confidence-floor downgrade;
- negative-veto disable;
- attempt-limit expansion;
- evidence-budget expansion;
- evidence-latency expansion;
- duplicate-Miner Sybil counting;
- insufficient qualified positives;
- below-confidence positives;
- high-confidence negative veto;
- explicit-negative averaging;
- missing fraud/transaction evidence;
- stale evidence;
- missing signal commitment;
- x402 network/asset/amount mutation;
- evidence-bundle/quorum-summary tampering;
- Miner identity substitution;
- evidence subject/chain substitution;
- raw-response commitment tamper;
- undelegated Intent;
- action semantic mutation;
- valid bundle substitution from another action;
- attempted high-consequence bypass of the autonomous ceiling.

## What the general authorization suite attacks

Representative families include:

- action target/parameter/policy substitution;
- stale-hash semantic tamper;
- agent/Mandate identity substitution;
- target/action-scope substitution;
- Mandate revocation/expiry;
- forged decision semantics;
- evidence commitment substitution;
- permit signature/binding/expiry attacks;
- kill-switch disabled/unavailable;
- permit replay;
- ambiguous-effect replay;
- missing adapter evidence coverage;
- undelegated action/Intent;
- adapter freeze mismatch;
- unregistered adapter;
- malformed/non-finite parameters.

## Current adaptive policy delta

Current bands:

```text
LOW     <= 5 USDC
MEDIUM  > 5 to 50 USDC
HIGH    > 50 USDC
```

Current fraud quorum:

```text
LOW
  distinct Miners: 1
  qualified positives: 1
  confidence >= 0.70
  max attempts: 3

MEDIUM
  distinct Miners: 2
  qualified positives: 2
  confidence >= 0.75
  max attempts: 4

HIGH
  distinct Miners: 3
  qualified positives: >=2
  confidence >= 0.80
  max attempts: 5
```

Current evidence budgets/deadlines:

```text
LOW     0.035 USDC / 12 seconds
MEDIUM  0.060 USDC / 60 seconds
HIGH    0.100 USDC / 90 seconds
```

The current LOW deadline is **12 seconds**. Older v1.2 text mentioning 35 seconds is stale relative to current implementation.

## Current validation snapshot

Latest green current `main`:

```text
53 test files
268 / 268 tests passed
7400 / 7400 deterministic adversarial cases contained
0 unauthorized executions / authorizations
0 uncaught fuzz errors
0 production dependency vulnerabilities reported by npm audit
```

The redesigned browser product-flow QA is also green.

## Current browser/UI delta

The project has changed substantially since early v1.2 screenshots.

Current browser QA covers:

- Home;
- deterministic demo;
- live flow;
- SDK;
- Security Lab;
- local API integration;
- multiple viewport sizes.

Current UI work also includes mobile overflow fixes, technical-detail disclosures, reduced-motion terminal behavior and the broader Auctorail rebrand.

## Current runtime delta

The redesigned dependency set now contains development/browser packages that officially target Node 22/24.

**Node 24 is recommended for current local development.**

Some existing CI workflow configuration still exercises Node 20 with engine warnings. The green run demonstrates current compatibility in that runner, not a long-term Node 20 dependency guarantee.

## Real-world proof boundary

The canonical historical public execution remains:

```text
transaction:
0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc

Base Sepolia block:
46301208

protected amount:
1 USDC
```

with genuine `FRAUD_DETECTION` evidence.

Current public real totals:

```text
2 genuine Telegraph Miner acquisitions
$0.02 committed x402 evidence cost
1 protected Base Sepolia execution
```

Deterministic tests/fuzzing are not counted as live Telegraph usage.

## Claims this validation supports

Safe claims:

- distinct-Miner quorum semantics are implemented/tested;
- evidence-plan downgrade attacks are covered;
- general Action/Mandate/Decision/Permit architecture is tested;
- replay/kill-switch/ambiguity controls are exercised deterministically;
- current fuzz suites report no unauthorized execution/authorization in their tested cases.

## Claims it does not support

Do not infer:

- the historical 1-USDC transaction itself used the later v1.2 quorum path;
- a successful public HIGH three-Miner artifact exists merely because the code/tests support the policy;
- arbitrary third-party adapters are sandboxed automatically;
- the project has an independent production security audit;
- deterministic fuzz counts are live Telegraph requests.

## Trusted Action Adapter note

Adapters are trusted deployment code.

The generic authorization SDK can enforce frozen-action, Mandate, evidence-coverage, decision, permit and replay boundaries around an adapter, but it does not make arbitrary malicious adapter code safe.

A real adapter must still:

- authenticate its source-specific evidence;
- derive external-effect parameters from the frozen action;
- keep protected credentials away from the agent;
- execute only through the controlled boundary.

## Re-running current validation

```bash
npm ci
npm run ci
npm run audit:prod
npm run attack:lab
npm run security:fuzz
npm run security:fuzz:adaptive
npm run security:fuzz:general
npm run vendor:verify
```

Use current source and exact command output if counts change after an intentional future update.

## Final validation principle

**v1.2 established that the evidence plan itself is part of the authorization contract. Current Auctorail preserves that principle: risk tier, required Intents, provider diversity, confidence rules, attempts, spend and latency cannot be downgraded just because the agent wants execution to succeed.**
