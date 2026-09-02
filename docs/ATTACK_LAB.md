# ProofGate Defensive Security Harnesses

ProofGate uses three deterministic offline security layers:

1. the focused **Attack Lab**;
2. the original **1,100-case authorization fuzz gate**;
3. the v1.1 **1,800-case adaptive-evidence fuzz gate**.

All are intentionally isolated from live side effects:

- no Telegraph requests
- no x402 payments
- no blockchain writes
- no real wallet spending

Synthetic evidence in these harnesses is test material only and must never be presented as live Miner activity.

## 1. Focused Attack Lab

Run:

```bash
npm run attack:lab
```

The Attack Lab contains one valid baseline plus ten adversarial scenarios.

1. valid exact permit executes once;
2. consumed permit replay is blocked;
3. amount mutation breaks action binding;
4. evidence-subject substitution breaks binding;
5. forged permit signature fails;
6. expired permit fails;
7. decision tampering breaks commitment;
8. Mandate substitution breaks binding;
9. negative Telegraph result still blocks despite supplemental runtime proof;
10. runtime-attestation tampering blocks;
11. Proof Receipt tampering fails verification.

Expected summary:

```text
RESULT: 10/10 attacks contained
Telegraph requests: 0
x402 payments: 0
Blockchain writes: 0
```

The baseline is not counted as an attack.

## 2. Original authorization fuzz gate

Run:

```bash
npm run security:fuzz
```

Validated structure:

```text
11 mutation families
100 cases per family
1100/1100 adversarial cases contained
100/100 valid controls
0 unauthorized executions
0 uncaught errors
```

Families cover:

- stale amount/action hash
- destination mutation
- chain confusion
- asset mutation
- reason mutation
- signature forgery
- evidence subject swap
- evidence chain swap
- decision commitment tampering
- Mandate version substitution
- permit expiry

This gate protects the original exact-action/permit/evidence boundary.

## 3. Adaptive-evidence fuzz gate

Run:

```bash
npm run security:fuzz:adaptive
```

Validated structure:

```text
18 mutation families
100 cases per family
1800/1800 adversarial cases contained
100/100 valid controls
0 unauthorized authorizations
0 uncaught errors
```

Families cover:

- risk-tier downgrade
- missing `FRAUD_DETECTION`
- missing `ONCHAIN_TX_LOOKUP`
- missing `WALLET_BALANCE_CHECK`
- negative fraud signal
- negative secondary signal
- fraud confidence below floor
- stale required evidence
- missing signal hash
- aggregate evidence-budget overrun
- Evidence Bundle signal-hash tampering
- Evidence Bundle raw-response-hash tampering
- evidence subject substitution
- substitution of a different valid bundle after permit mint
- permit signature forgery
- permit expiry
- action semantic mutation
- un-delegated Intent

The bundle-tamper families explicitly require both bundle verification failure and policy non-authorization where applicable.

## Additional direct regression coverage

Some important invariants are clearer as direct deterministic tests than as randomized mutation families. The normal test suite also covers:

- paid adaptive evidence with the wrong x402 network is rejected;
- paid adaptive evidence with the wrong asset is rejected;
- per-request evidence payment above the global Telegraph cap is rejected;
- malformed signal/raw-response hashes remain invalid even if an attacker recomputes the outer bundle hash;
- secondary `UNKNOWN` / `UNAVAILABLE` status cannot create authority;
- a different internally valid Evidence Bundle is rejected after permit mint;
- the high-level trusted SDK returns no permit on incomplete acquisition;
- bundle-aware permits remain single-use;
- Receipt v3 tampering fails verification.

## What these harnesses prove

They prove that the tested authorization invariants fail closed under the covered deterministic mutations and that valid controls continue to work.

The key criterion is:

> **Unauthorized or incorrectly bound input must never reach executable authority or the protected external action.**

## What they do not prove

They are not a substitute for:

- live Telegraph availability testing;
- live x402 facilitator reliability testing;
- independent smart-contract audit;
- independent production application audit;
- production key-management review;
- PostgreSQL infrastructure/failover review;
- full distributed-systems chaos testing.

The repository includes older authorized assessment artifacts under `audit-artifacts/`. Those artifacts apply to the revision they identify and must not be presented as an independent audit of later v1.1 commits.

## Current release validation

See `docs/V1_1_VALIDATION.md` for the exact hardened snapshot and CI results combining:

- vendor reproducibility checks;
- TypeScript + full Vitest suite;
- both fuzz gates;
- production dependency audit.
