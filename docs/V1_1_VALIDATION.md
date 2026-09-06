# Auctorail v1.1 validation — historical snapshot

> **Status: HISTORICAL.** This file preserves the validation mindset and milestone context from an earlier ProofGate/Auctorail revision. It is not the source of truth for current test counts or current policy thresholds.

## Why keep historical validation

Security-sensitive projects benefit from knowing not only what passes today, but how validation evolved.

This document records that the project already treated mutation, replay, evidence binding and protected execution as first-class validation concerns before the later v1.2/generalized architecture.

## Historical milestone focus

The v1.1 stage concentrated on payment authorization and stronger evidence/execution controls.

Representative concerns included:

- exact action binding;
- stale hash detection;
- destination/amount mutation;
- evidence subject/chain binding;
- permit signature integrity;
- permit expiry;
- permit replay;
- controlled execution;
- deterministic security scenarios;
- genuine Telegraph evidence proof.

## Historical validation categories

### Unit/integration tests

The project validated the relationships among:

```text
Action
Mandate
Evidence
Decision
Permit
Executor
Receipt
```

### Attack Lab

Deterministic attack scenarios demonstrated that known tampering did not become authorization.

### Fuzzing

Mutation families exercised many automatically generated adversarial variations.

### Live proof

Separately from deterministic tests, the project preserved genuine Telegraph/x402 evidence and a real protected Base Sepolia execution.

This distinction remains important today.

## Current validation supersedes old counts

Do not quote an old v1.1 test/fuzz count as the current state.

The latest green current `main` snapshot is:

```text
53 test files
268 / 268 tests passed
```

Current deterministic fuzzing:

```text
1100 payment authorization cases
3200 adaptive + quorum cases
3100 general authorization cases
----
7400 total adversarial cases contained

0 unauthorized executions / authorizations
0 uncaught fuzz errors
```

Production dependency audit currently reports zero vulnerabilities in the latest green CI snapshot.

## What was added after v1.1

Current Auctorail includes controls and surfaces that were not necessarily part of the original v1.1 milestone, including:

- adaptive LOW/MEDIUM/HIGH evidence plans;
- distinct-Miner quorum;
- LOW 12-second evidence deadline;
- generalized authorization adapters;
- Content Trust;
- redesigned responsive UI;
- expanded browser QA;
- broader fuzz families;
- stronger deployment/ambiguity handling.

Do not retroactively attribute those current features to an older validation run.

## Current policy facts for comparison

Current adaptive payment evidence tiers:

```text
LOW     <=5 USDC
MEDIUM  >5 to 50 USDC
HIGH    >50 USDC
```

Current LOW:

```text
FRAUD_DETECTION
1 distinct positive Miner
confidence >=0.70
max attempts 3
max evidence spend 0.035 USDC
overall deadline 12 seconds
```

Current autonomous payment execution ceiling:

```text
10 USDC
```

## Validation philosophy that remains current

The following principles survived the milestone:

1. Test the exact security binding, not only UI success.
2. Keep deterministic fuzzing offline and reproducible.
3. Do not count deterministic traffic as real Telegraph usage.
4. Preserve real live artifacts separately.
5. Test mutation of one semantic at a time.
6. Test replay and expiration explicitly.
7. Treat missing evidence as non-executable.
8. Verify external evidence belongs to the exact subject/context.
9. Keep protected credentials behind the executor.
10. Avoid overstating what one historical run proved.

## Current references

Use these for current validation:

- root `README.md`;
- `docs/README.md`;
- `docs/ATTACK_LAB.md`;
- `docs/SECURITY_MODEL.md`;
- current GitHub Actions runs;
- current `tests/` and fuzz scripts.

For genuine external proof:

- `docs/REAL_USAGE_LOG.md`;
- `docs/LIVE_EXECUTION.md`.

## Reproducing current validation

Current `main` requires **Node `>=24.15.0`**. `.nvmrc` selects Node 24 and current GitHub Actions workflows run Node 24.

```bash
node -v
npm ci
npm run ci
npm run audit:prod
npm run security:fuzz
npm run security:fuzz:adaptive
npm run security:fuzz:general
npm run vendor:verify
```

Historical v1.1 environments may have used older Node versions; that does not define the runtime contract of current `main`.

## Historical interpretation rule

A historical green run proves that the tested revision satisfied the tests present at that time.

It does not prove:

- current `main` automatically has the same behavior;
- new features were covered before they existed;
- the application is universally secure;
- deployment configuration cannot weaken controls.

## Final note

**Keep this file as evidence of validation evolution, but use the latest green current source/tests for any present-tense security or submission claim.**
