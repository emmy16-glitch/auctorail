# Auctorail Attack Lab and adversarial validation

This document explains the deterministic adversarial testing used to validate Auctorail's authorization invariants.

Attack Lab is not a penetration-test certification and it is not real Telegraph usage. It is a reproducible way to show that known classes of action, evidence, authority and execution tampering do not silently become authorized.

## Why Attack Lab exists

Happy-path tests answer:

> Does a valid action work?

Security tests must also answer:

> What happens when an attacker changes one security-relevant thing while trying to preserve the rest of the authorization context?

Auctorail protects consequential external effects, so mutation/replay/fail-closed behavior is part of the product, not only a test concern.

## Core invariant under test

```text
A valid authorization for action A
must not become authority for action B
```

Related invariants:

```text
missing proof must not become ALLOW
forged proof must not become ALLOW
duplicate providers must not fake quorum
expired/revoked authority must not execute
consumed authority must not replay
ambiguous external effects must not be blindly duplicated
```

## Deterministic vs live testing

The attack/fuzz suites are intentionally offline/deterministic.

They do not count toward the real Telegraph/x402 usage ledger.

Expected properties:

```text
Telegraph requests:   0
x402 payments:        0
blockchain writes:    0
```

This keeps adversarial validation repeatable and avoids spending funds to test every mutation family.

## Current validation snapshot

Latest green `main`:

```text
53 test files
268 / 268 tests passed
```

Fuzz suites:

```text
1100 payment-authorization adversarial cases
3200 adaptive + quorum adversarial cases
3100 general-authorization adversarial cases
----
7400 total adversarial cases contained

0 unauthorized executions / authorizations
0 uncaught fuzz errors
```

Production dependency audit:

```text
0 vulnerabilities reported
```

## Run the validation

```bash
npm ci
npm run ci
npm run security:fuzz
npm run security:fuzz:adaptive
npm run security:fuzz:general
npm run audit:prod
```

If the attack-lab script is needed separately:

```bash
npm run attack:lab
```

## Mutation families: payment authorization

The deterministic payment fuzz harness attacks the relationship between exact action, evidence, decision and permit.

Representative families include:

### Amount mutation with stale hash

An attacker changes the amount while trying to reuse an authorization commitment.

Expected:

```text
BLOCK / validation failure
```

### Destination swap

The recipient is changed after authorization.

Expected: old authority does not apply.

### Chain confusion

Evidence or action semantics are moved to another chain while preserving other fields.

Expected: binding failure.

### Asset substitution

The token/asset changes after authorization.

Expected: action mismatch / block.

### Reason/semantic mutation

A security-relevant action field changes while stale commitments are retained.

Expected: mismatch detected.

### Permit-signature forgery

The permit is altered or replaced without trusted signing authority.

Expected: signature/integrity failure.

### Evidence subject swap

Valid-looking evidence for another subject is substituted.

Expected: evidence cannot satisfy current action.

### Evidence chain swap

Evidence for another chain is substituted.

Expected: evidence rejected.

### Decision commitment tamper

A decision is modified while attempting to retain stale downstream authority.

Expected: decision/permit binding failure.

### Mandate-version substitution

A different authority version is inserted.

Expected: exact authority/version validation failure.

### Expired permit

A valid but expired permit is submitted.

Expected: no execution.

## Mutation families: adaptive evidence and quorum

The adaptive fuzz harness targets evidence-plan and quorum downgrades.

Representative families:

### Risk-tier downgrade

Attempt to make a higher-consequence action use a weaker evidence tier.

Expected: rejected plan/policy binding.

### Required-Intent removal

Remove an Intent required by the frozen plan.

Expected: insufficient evidence / no authorization.

### Distinct-Miner downgrade

Reduce the required provider diversity.

Expected: policy detects mismatched quorum rule.

### Positive-vote downgrade

Lower the number of required qualified positives.

Expected: rejected.

### Confidence-floor downgrade

Lower the policy confidence requirement after the plan is frozen.

Expected: rejected.

### Negative-veto disable

Attempt to alter negative evidence semantics.

Expected: rejected.

### Attempt-limit expansion

Increase the allowed attempts beyond the frozen plan.

Expected: plan mismatch/rejection.

### Evidence-budget expansion

Increase allowed x402 evidence spend.

Expected: rejected.

### Evidence-latency expansion

Increase the maximum evidence window beyond the frozen plan.

Expected: rejected.

This test is especially important after the current LOW deadline changed from 35 seconds to **12 seconds**.

### Duplicate-Miner Sybil count

Count repeated responses from one Miner as multiple independent providers.

Expected: distinct-provider quorum remains unsatisfied.

### Insufficient positive quorum

Required provider count exists but too few positives qualify.

Expected: no ALLOW.

### Below-confidence positives

Positive verdicts below the tier threshold try to count as quorum.

Expected: do not count.

### High-confidence negative veto

A qualifying negative appears.

Expected: fail closed according to policy.

### Explicit negative averaged away

Positive responses attempt to overpower known explicit negative evidence.

Expected: negative cannot be silently averaged away.

### Missing required evidence

A required fraud/transaction Intent is absent.

Expected: `HOLD`/no execution authority.

### Stale evidence

Expired evidence tries to satisfy current policy.

Expected: rejected/insufficient.

### Missing signal hash

A required commitment is absent.

Expected: evidence unusable.

### x402 network / asset / price mutation

Payment challenge tries to move outside the approved evidence-payment lane.

Expected: no uncontrolled evidence payment.

### Evidence-bundle tamper

Signal/quorum/raw-response commitments are modified.

Expected: bundle integrity failure.

### Subject / chain substitution

Evidence for another action context is inserted.

Expected: binding failure.

### Valid bundle from another action

A completely valid bundle is reused for a different action.

Expected: exact-action binding rejects it.

### High consequence bypass

Strong evidence tries to override the 10-USDC autonomous execution ceiling.

Expected: still blocked.

Evidence cannot create authority.

## Mutation families: general authorization

The general fuzz harness targets the reusable Action/Mandate/Decision/Permit architecture.

Representative families include:

- target substitution;
- parameter substitution;
- stale action-hash tamper;
- policy substitution;
- agent substitution;
- Mandate target/action scope mutation;
- Mandate revocation/expiry;
- decision agent/status/check tampering;
- evidence commitment substitution;
- permit signature forgery;
- permit action/decision/evidence binding tamper;
- permit expiry;
- kill-switch disabled/unavailable;
- permit replay;
- ambiguous-effect replay;
- missing required Intent coverage;
- unrequested Intent claims;
- missing trusted checks;
- undelegated action/Intent;
- adapter freeze-contract mismatch;
- unregistered adapter;
- non-finite parameter rejection.

## Guided Demo relationship

The Watch Demo exposes four attack/security cases in product form:

```text
valid request       → allowed/executed demo
modified amount     → BLOCK
permit replay       → BLOCK
missing evidence    → HOLD
```

The fuzz harnesses go much deeper, but the Guided Demo makes the underlying invariants understandable to a non-security reviewer.

## Security Lab relationship

Security Lab provides an interactive deterministic surface for selected adversarial cases.

Do not describe Security Lab traffic as genuine Telegraph usage.

Its value is reproducible policy demonstration.

## What a passing attack test means

It means the tested implementation rejected/contained that mutation under the deterministic scenario.

It does **not** prove:

- no undiscovered bugs exist;
- no deployment misconfiguration can weaken the system;
- external providers are always trustworthy/available;
- the trusted host cannot be compromised;
- the project has received an independent professional security audit.

## How to add a new attack test

When a security-relevant feature is added:

1. identify what the attacker controls;
2. identify the trusted value the attacker wants to substitute;
3. create a valid baseline control;
4. mutate one semantic at a time;
5. assert no unauthorized `ALLOW`/execution occurs;
6. test both stale-hash and self-consistent malicious variants where relevant;
7. add a fuzz family if the input space is meaningful;
8. keep the test offline unless live external interaction is essential to the invariant.

## Recommended review questions

A reviewer should challenge the system with questions such as:

- Can I change the amount after approval?
- Can I change the recipient?
- Can I reuse evidence for another wallet?
- Can I make Base mainnet evidence satisfy Base Sepolia?
- Can I remove a required Intent?
- Can I count one Miner three times?
- Can I lower the confidence floor?
- Can I raise the evidence budget?
- Can I reuse a consumed permit?
- Can I bypass the kill switch?
- Can I repeat an ambiguous external effect?
- Can strong evidence let me exceed delegated authority?

The expected answer should be no.

## Final adversarial-testing principle

**Auctorail's security value is visible when changing one protected semantic breaks the old authorization. The system should fail closed around uncertainty, reject replay, and never allow evidence or client input to expand principal authority.**
