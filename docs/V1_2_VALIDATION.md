# Auctorail v1.2 Validation Record

This document records the strict validation performed after the v1.2 same-Intent Miner-quorum architecture, generic authorization core and final security hardening were implemented.

## Validated code snapshot

Pre-documentation code SHA:

`2e06cbb82e32fc8d8b516af3742b0a31c853c40f`

GitHub Actions run:

`33723583899`

Branch:

`v1.2-general-quorum`

This code snapshot includes:

- consequence-derived LOW / MEDIUM / HIGH payment evidence plans;
- multi-Intent Telegraph routing;
- same-Intent distinct-Miner quorum;
- confidence-aware positive voting;
- high-confidence negative early veto + final explicit-negative BLOCK semantics;
- duplicate-Miner independence protection;
- canonical quorum summaries inside Evidence Bundles;
- x402 per-request + aggregate evidence budgets;
- x402 challenge-swap / TOCTOU protection;
- `proofgate.action.v2` general action envelope;
- `proofgate.mandate.v2` general standing authority;
- `proofgate.decision.v2` semantic decision commitment;
- `proofgate.permit.v2` signed one-use authority;
- trusted Action Adapter Registry;
- exact adapter evidence-Intent coverage enforcement;
- authority-before-evidence-spend preflight;
- Permit-mint/current-execution Mandate revalidation;
- fail-closed generic execution kill switch;
- atomic generic Permit consumption/replay protection;
- generic post-claim `AMBIGUOUS` handling.

## Code CI result

**PASS**

### Vendor reproducibility

- tracked vendor source/artifact/manifest verification: PASS
- pinned native `solc 0.8.36+commit.8a079791` recompilation on Linux x64: PASS
- source SHA-256: `afcb3e214b74e6b4fdbed034a3a517498228fb7d59e15fa7ed613bf776cb1b22`
- artifact SHA-256: `3c7bbca4b8d4970b89cd9507e913e004ddcfa9fb061a0468805f465b6220d291`
- creation bytecode: `258 bytes`
- runtime bytecode: `165 bytes`
- generated-artifact diff check: PASS

### TypeScript and deterministic tests

```text
Test Files: 43 passed / 43
Tests:      225 passed / 225
```

The added general-authorization regression suite covers:

- arbitrary action canonicalization/tamper detection;
- exact agent/action-type/target/policy Mandate checks;
- authority failure before trusted evidence acquisition;
- missing required Intent coverage;
- missing evidence commitment;
- unrequested evidence-Intent claims;
- successful authorize/execute-once/replay-block flow;
- Mandate expiry after Permit mint but before execution;
- kill switch disabled/unavailable;
- ambiguous external effect with consumed authority;
- wrong-agent self-consistent decision forgery.

### Original exact-action fuzz gate

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

### Adaptive + distinct-Miner quorum fuzz gate

```text
Mutation families:             31
Cases per family:              100
Adversarial contained:         3100 / 3100
Valid controls:                100 / 100
Unauthorized authorizations:  0
Uncaught errors:               0
Telegraph requests:            0
x402 payments:                 0
Blockchain writes:             0
```

This suite attacks risk/quorum threshold downgrade, fake provider diversity, low-confidence positive votes, negative-veto suppression, required-Intent deletion, stale/missing evidence, x402 provenance/cap bypasses, Evidence Bundle/quorum-summary/Miner-identity tampering, valid-bundle substitution, Permit forgery/expiry and action/Intent substitution.

### General authorization fuzz gate

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

This separate gate attacks valid action target/parameter/policy substitution, Mandate identity/scope/lifecycle substitution, self-consistent forged decision semantics, evidence-commitment substitution, Permit binding/signature/expiry attacks, kill-switch failures, replay, ambiguous-effect replay, adapter evidence-coverage bypasses, undelegated evidence acquisition, adapter freeze mismatch and malformed action parameters.

## Combined deterministic security result

```text
Original adversarial cases:        1100 / 1100
Adaptive/quorum adversarial cases: 3100 / 3100
General adversarial cases:         3100 / 3100

Total adversarial cases:           7300 / 7300

Original valid controls:           100 / 100
Adaptive valid controls:           100 / 100
General valid controls:            100 / 100

Unauthorized executions:           0
Unauthorized authorizations:       0
Uncaught fuzz errors:               0
```

These deterministic fuzz harnesses are intentionally offline. Their numbers are not presented as live Telegraph requests or an independent production security audit.

## Production dependency audit

```text
npm audit --omit=dev
found 0 vulnerabilities
```

This is a dependency-audit result, not a claim of an independent production application audit.

## Important trust statements

### Miner quorum

Request count is not provider diversity.

Auctorail counts distinct serving Miner IDs. Repeated routes to the same Miner do not create independent votes.

A positive fraud vote counts only if its confidence meets the configured quorum floor.

The MEDIUM/HIGH `0.90` negative threshold is an **early collection veto**. Final policy remains stricter: any explicit known-negative result blocks authorization.

### Evidence integrity vs authenticity

Evidence/quorum hashes prove integrity after construction. They do not prove arbitrary JSON is authentic Telegraph evidence.

Live provenance must be established inside the trusted acquisition boundary.

### General Action Adapters

Action Adapters are trusted deployment code. v1.2 does not sandbox arbitrary third-party adapters.

An adapter is responsible for authenticating its source-specific evidence and deriving external effect fields from the frozen action.

Auctorail's generic SDK then enforces action/Mandate/evidence-coverage/decision/Permit/replay/kill-switch boundaries around it.

## Real-world proof boundary

The frozen v1.0 artifact remains the canonical public real transaction proof:

- transaction: `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc`
- Base Sepolia block: `46301208`
- genuine Telegraph `FRAUD_DETECTION` evidence
- protected `1 USDC` execution

v1.2's same-Intent quorum and general authorization architecture are implemented/tested, but this validation record does **not** claim:

- the historical transaction used v1.2 quorum;
- a successful real three-Miner Telegraph quorum artifact has already been captured;
- example GitHub/cloud/database adapters are live production integrations;
- the historical transaction used Ed25519/PostgreSQL production paths;
- Auctorail has undergone an independent production audit.

## Release gate

Before creating the v1.2 tag, the exact final SHA must pass:

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

GitHub CI must also pass the pinned native vendor recompilation/reproducibility check.

## Documentation-frozen release candidate

All v1.2 architecture, developer, demo, resilience, security and validation documentation was present at:

```text
Candidate SHA:    db49089d5f510ef2aa39ebf9e953fb5ba560c356
Candidate CI run: 33724529325
Result:           SUCCESS
```

That exact candidate passed:

```text
43/43 test files
225/225 tests
1100/1100 original fuzz
3100/3100 adaptive + quorum fuzz
3100/3100 general authorization fuzz
0 unauthorized executions/authorizations
0 uncaught fuzz errors
0 production dependency vulnerabilities
vendor native reproducibility PASS
```

This validation-record update itself is documentation-only and intentionally creates one later commit than the candidate SHA above. The **release tag must point to the resulting validation-record commit only after GitHub CI also passes on that exact final commit**.

If any code or committed live evidence artifact changes after the final tag point, every gate must run again and a new release SHA/tag must be used. Existing v1.0/v1.1 tags must never be moved.
