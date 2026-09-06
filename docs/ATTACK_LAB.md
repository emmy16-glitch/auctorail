# Auctorail Defensive Security Harnesses

Auctorail v1.2 uses **four deterministic offline security layers**:

1. the focused **Attack Lab**;
2. the original **1,100-case exact-action authorization fuzz gate**;
3. the **3,100-case adaptive + distinct-Miner quorum fuzz gate**;
4. the **3,100-case general action authorization fuzz gate**.

All security harnesses are intentionally isolated from live side effects:

```text
Telegraph requests: 0
x402 payments:      0
blockchain writes:  0
```

Synthetic evidence in these harnesses is test material only. It must never be represented as live Telegraph/Miner activity.

## 1. Focused Attack Lab

Run:

```bash
npm run attack:lab
```

The Attack Lab contains one valid baseline plus ten adversarial scenarios:

1. valid exact Permit executes once;
2. consumed Permit replay is blocked;
3. amount mutation breaks action binding;
4. evidence-subject substitution breaks binding;
5. forged Permit signature fails;
6. expired Permit fails;
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

The valid baseline is not counted as an attack.

## 2. Original exact-action fuzz gate

Run:

```bash
npm run security:fuzz
```

Current validated result:

```text
Mutation families:        11
Cases per family:         100
Adversarial contained:    1100/1100
Valid controls:           100/100
Unauthorized executions: 0
Uncaught errors:          0
```

Families include:

- stale amount/action hash
- destination substitution
- chain confusion
- asset substitution
- reason mutation
- Permit signature forgery
- evidence subject swap
- evidence chain swap
- decision commitment tampering
- Mandate version substitution
- Permit expiry

This remains the original exact-action/evidence/Permit security gate used by the proven payment flow.

## 3. Adaptive + distinct-Miner quorum fuzz gate

Run:

```bash
npm run security:fuzz:adaptive
```

Current validated result:

```text
Mutation families:             31
Cases per family:              100
Adversarial contained:         3100/3100
Valid controls:                100/100
Unauthorized authorizations:  0
Uncaught errors:               0
```

The v1.2 adaptive suite attacks both vertical multi-Intent evidence and horizontal same-Intent provider diversity.

Families include:

- risk-tier downgrade
- distinct-Miner quorum downgrade
- positive-vote threshold downgrade
- positive-confidence-floor downgrade
- disabling high-confidence negative veto
- expanding the bounded attempt limit
- duplicate-Miner / fake-provider-diversity counting
- insufficient positive quorum
- below-confidence positive votes
- high-confidence negative veto suppression
- lower-confidence explicit negative suppression
- missing `FRAUD_DETECTION`
- missing `ONCHAIN_TX_LOOKUP`
- missing `WALLET_BALANCE_CHECK`
- negative secondary signal
- stale required evidence
- missing signal hash
- x402 wrong network
- x402 asset substitution
- x402 per-request over-cap
- Evidence Bundle signal tampering
- quorum-summary tampering
- Miner-identity substitution
- quorum-attempt collision/tampering
- evidence subject substitution
- substitution of another internally valid bundle after Permit mint
- Permit signature forgery
- Permit expiry
- action semantic mutation
- un-delegated Intent
- raw-response-hash tampering

### Important quorum invariants

The harness verifies that:

- repeated responses from one Miner do not become multiple independent providers;
- a positive fraud vote only counts if it meets the tier confidence floor;
- HIGH risk cannot be downgraded from 3 distinct providers / 2 positive votes;
- an explicit known-negative signal cannot be averaged away;
- an attacker cannot alter the committed quorum summary while keeping authorization valid;
- changing a serving Miner identity invalidates the committed evidence context.

## 4. General action authorization fuzz gate

Run:

```bash
npm run security:fuzz:general
```

Current validated result:

```text
Mutation families:        31
Cases per family:         100
Adversarial contained:    3100/3100
Valid controls:           100/100
Unauthorized executions: 0
Uncaught errors:          0
```

This is a separate gate for `proofgate.action.v2`, `mandate.v2`, `decision.v2`, `permit.v2` and the trusted Action Adapter execution path.

Families include:

- valid target substitution
- valid parameter substitution
- stale action hash after semantic mutation
- policy substitution
- Mandate agent substitution
- Mandate target-scope substitution
- Mandate action-type substitution
- revoked Mandate substitution
- Mandate expiry while Permit is still alive
- self-consistent wrong-agent decision forgery
- forged `ALLOW` inconsistent with decision checks
- stale decision hash after check mutation
- evidence-commitment substitution
- Permit signature forgery
- Permit action-binding tampering
- Permit decision-binding tampering
- Permit evidence-binding tampering
- Permit expiry
- disabled execution kill switch
- unavailable kill-switch state
- Permit replay
- replay after ambiguous external effect
- missing required Intent coverage from trusted adapter
- adapter claiming unrequested Intent coverage
- missing required evidence commitment
- missing trusted evidence checks
- undelegated action attempting to reach evidence acquisition
- undelegated required Intent attempting to reach evidence acquisition
- adapter freeze-contract mismatch
- unregistered adapter
- non-finite/malformed action parameter rejection

### Generic boundary invariants

The general harness specifically proves the tested path fails closed when:

- the agent/action is outside standing authority;
- current Mandate authority disappears after Permit mint;
- an adapter cannot account for every required evidence class;
- the evidence commitment is missing/substituted;
- the execution kill switch cannot be trusted;
- Permit replay is attempted;
- an external effect becomes ambiguous after the Permit has already been consumed.

## Combined current deterministic result

On the validated v1.2 code snapshot:

```text
Original fuzz:              1100/1100
Adaptive + quorum fuzz:     3200/3200
General authorization fuzz: 3100/3100

Total adversarial cases:    7400/7400

Valid controls:
  original: 100/100
  adaptive: 100/100
  general:  100/100

Unauthorized executions:      0
Unauthorized authorizations:  0
Uncaught fuzz errors:          0
```

The normal deterministic suite additionally passed:

```text
53/53 test files
268/268 tests
```

## Additional direct regression coverage

Some invariants are clearer as focused deterministic tests rather than fuzz mutation families. The normal suite covers, among other things:

- x402 challenge-swap/TOCTOU prevention;
- wrong paid-evidence network/asset rejection;
- per-request evidence payment cap;
- malformed signal/raw-response hashes even after outer bundle rehash;
- `UNKNOWN` / `UNAVAILABLE` secondary status becoming `HOLD`;
- valid alternate Evidence Bundle rejected after Permit mint;
- bundle-aware single-use Permit behavior;
- Proof Receipt v3 tamper rejection;
- generic exact target/agent/action/policy Mandate enforcement;
- authority rejected before trusted evidence acquisition;
- missing/custom adapter Intent coverage rejected;
- execution-time Mandate expiry rejection;
- kill switch disabled/unavailable rejection;
- ambiguous generic effect consumes authority and cannot be blindly retried;
- wrong-agent self-consistent decision cannot mint a Permit.

## What these harnesses prove

They prove that the **tested authorization invariants** fail closed under the covered deterministic mutations while valid controls continue to execute/authorize correctly.

The central security criterion is:

> **Unauthorized, incorrectly bound or insufficiently evidenced input must never reach executable authority or the protected external callback.**

## What they do not prove

These harnesses are not a substitute for:

- live Telegraph availability/reliability testing;
- a successful real multi-Miner quorum artifact;
- live x402 facilitator reliability testing;
- independent smart-contract audit;
- independent production application audit;
- production key-management review;
- PostgreSQL infrastructure/failover review;
- full distributed-systems chaos testing;
- security review/sandboxing of arbitrary third-party Action Adapters.

The repository contains older authorized assessment artifacts. Those reports apply to the exact revisions they identify and must not be represented as an independent audit of v1.2.

## Current release validation

See `docs/V1_2_VALIDATION.md` for the exact v1.2 release snapshot, GitHub CI run, vendor reproducibility result, deterministic tests, all three fuzz gates and production dependency audit.
