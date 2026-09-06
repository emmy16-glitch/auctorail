# Auctorail resilience invariants

This document defines the reliability and failure-handling properties Auctorail should preserve even when upstream services, networks, storage or external executors behave imperfectly.

Security and resilience are linked. A system that handles failures badly can accidentally turn timeouts, retries or partial state into unauthorized effects.

## Core resilience rule

> **Failure should reduce capability before it reduces authorization safety.**

When required proof or trusted state is unavailable, Auctorail should fail closed rather than invent permission.

## Invariant 1 — missing evidence never becomes implicit ALLOW

If required evidence cannot be acquired, parsed, bound or qualified, the action must not execute.

Typical safe result:

```text
HOLD
```

Examples:

- Telegraph unavailable;
- route not currently routable;
- wrong returned Intent;
- subject not asserted;
- chain not asserted;
- confidence below floor;
- signal commitment missing;
- required provider diversity unavailable;
- deadline reached;
- evidence budget exhausted.

## Invariant 2 — upstream latency is bounded

External evidence providers should not be able to leave an authorization request waiting indefinitely.

Current adaptive deadlines:

```text
LOW:     12 seconds
MEDIUM:  60 seconds
HIGH:    90 seconds
```

The deployed payment API also applies bounded Telegraph HTTP timeouts so a single upstream request does not monopolize the LOW interactive flow.

A timeout is not positive evidence.

## Invariant 3 — retries cannot weaken policy

Retrying evidence acquisition must not alter:

- required Intent;
- subject;
- chain;
- action hash;
- confidence floor;
- quorum requirement;
- evidence budget;
- overall deadline.

Retries are an availability mechanism, not a way to search for an easier policy.

## Invariant 4 — retry spend is bounded

Paid evidence attempts must remain inside the frozen evidence budget.

Current maxima:

```text
LOW:     0.035 USDC
MEDIUM:  0.060 USDC
HIGH:    0.100 USDC
```

A retry path must account for prior paid attempts rather than resetting the budget.

## Invariant 5 — paid ambiguity is reconciled

If an x402 payment payload may have been created/sent but the transport outcome is unclear, Auctorail must not assume no payment occurred and immediately pay again.

The correct model is:

```text
known not paid   → safe retry may be possible
known paid       → continue/reconcile result
ambiguous paid   → reconcile before retry
```

## Invariant 6 — external execution ambiguity is reconciled

The same rule applies even more strongly to protected external effects.

A failed HTTP/RPC response does not prove the side effect failed.

For a payment:

```text
broadcast may have succeeded
response may have been lost
```

Blind retry could create a duplicate payment.

Auctorail treats ambiguous effects as durable state/reconciliation problems.

## Invariant 7 — failover cannot change action semantics

RPC or transport failover may change which provider is used for confirmation or read operations.

It must never change:

- amount;
- recipient;
- chain;
- asset;
- encoded transaction semantics;
- action commitment.

Availability failover must not become semantic failover.

## Invariant 8 — duplicate evidence sources do not become independent quorum

Repeated routing to one Miner is still one independent source.

Provider diversity is counted by Miner ID.

This protects quorum semantics when the routing layer has limited provider availability.

## Invariant 9 — evidence rejection is not action mutation

If a particular Miner result is unusable, Auctorail may perform another bounded attempt for the **same frozen action and same requirement**.

It must not change the action to fit available evidence.

## Invariant 10 — authority is checked before paid evidence

An action that is already outside delegated authority should be rejected before Auctorail spends evidence budget.

This prevents denial-of-wallet behavior where an agent repeatedly requests impossible actions merely to force paid external queries.

## Invariant 11 — an unavailable kill switch fails closed

If the executor relies on a trusted execution-enable/kill-switch state and that state cannot be established safely, execution should not proceed.

Availability of the protected effect is less important than avoiding unauthorized execution.

## Invariant 12 — permit consumption survives process behavior

Replay resistance should not depend only on in-memory process state.

Durable deployments need persistent permit-consumption/execution state so process restart or concurrency does not recreate unused authority.

See `permit-consumption-store.md`.

## Invariant 13 — concurrent execution does not duplicate side effects

Two requests racing to execute the same permit should not both win.

Permit consumption and execution state need atomic/transactional semantics appropriate to the protected effect.

## Invariant 14 — idempotency does not replace authorization

Idempotency keys help identify repeated requests, but they are not permission.

A request with the same idempotency key still needs valid authority and execution-state handling.

## Invariant 15 — restart/recovery does not mint new authority

After application restart:

- consumed permits remain consumed;
- expired permits remain invalid;
- Mandate revocation remains effective;
- ambiguous executions remain unresolved until reconciliation;
- evidence budget/accounting state should not be incorrectly reset for the same operation.

## Invariant 16 — stale evidence does not become valid because providers are unavailable

Availability pressure must not cause freshness requirements to be bypassed.

If current policy requires fresh evidence and only stale evidence exists, the result remains non-executable.

## Invariant 17 — external evidence cannot expand standing authority

If the principal allows 5 USDC, a perfect fraud score cannot authorize 7 USDC.

If current policy ceiling is 10 USDC, a HIGH evidence plan cannot authorize 75 USDC.

This must remain true during degraded-mode operation.

## Invariant 18 — explicit negative evidence is not discarded during retry

A system must not continue retrying merely to find a positive provider and forget a blocking negative result that policy says is material.

Negative evidence semantics remain part of the frozen policy.

## Invariant 19 — diagnostics never become authority

Logs, UI progress messages and routing metadata can explain what happened.

They must not be read back as proof that missing evidence existed.

For example:

```text
request context says target=Wallet A
```

is not equivalent to:

```text
Miner response explicitly asserts subject=Wallet A
```

## Invariant 20 — demo mode and live mode remain distinguishable

A deterministic demo should not accidentally call live paid evidence merely because the UI looks similar.

Live external-effect features should remain explicit and bounded.

## Current LOW failure envelope

For a `<=5 USDC` adaptive payment:

```text
max fraud attempts:  3
max evidence spend:  0.035 USDC
overall deadline:    12 seconds
positive confidence: 0.70
```

If valid evidence is not obtained within that envelope:

```text
HOLD
no execution authority
```

## Example failure scenarios

### Scenario A — Telegraph route unavailable

```text
Attempt 1: route unavailable
Attempt 2: route unavailable / timeout
Attempt 3: no usable evidence or deadline reached
Result: HOLD
```

### Scenario B — wrong Intent returned

```text
Required: FRAUD_DETECTION
Returned: unrelated Intent
Evidence: rejected
Retry: bounded
Final: HOLD unless valid evidence arrives
```

### Scenario C — paid response lost

```text
Payment payload created
Transport response lost
Settlement state unclear
Result: reconcile payment before any new paid attempt
```

### Scenario D — transaction broadcast ambiguous

```text
Signed transaction submitted
RPC connection fails
Do not re-broadcast a new semantic action blindly
Reconcile chain/execution state first
```

### Scenario E — datastore unavailable during execution

If permit-consumption/kill-switch state cannot be established safely, fail closed rather than executing without replay protection.

## Operational monitoring suggestions

A production-oriented deployment should monitor:

- authorization decision counts by `ALLOW/HOLD/BLOCK`;
- HOLD reasons;
- Telegraph route failures;
- evidence acquisition latency;
- evidence spend per authorization;
- repeated Miner routing;
- x402 ambiguous settlement events;
- permit replay attempts;
- kill-switch failures;
- ambiguous protected executions;
- reconciliation backlog;
- receipt persistence failures.

Monitoring should never log secrets/private keys.

## Backoff and circuit-breaker guidance

External provider outages should not create request storms.

A production deployment may add:

- bounded exponential backoff;
- circuit breakers;
- provider-health caching;
- route availability metrics;
- operator alerts.

Any such availability optimization must preserve the frozen security plan.

## What resilience does not mean

Resilience does not mean:

- always returning ALLOW;
- retrying until a positive provider appears;
- ignoring evidence deadlines;
- increasing evidence budget automatically;
- falling back to a weaker chain/Intent;
- skipping replay persistence when storage is down.

A secure system can be temporarily unavailable while still preserving authority boundaries.

## Validation coverage

Current tests/fuzzing cover resilience-related families including:

- bounded route retries;
- direct-route unavailability;
- duplicate-provider handling;
- evidence-plan mutation;
- evidence-budget expansion attempts;
- evidence-latency expansion attempts;
- x402 settlement ambiguity;
- executor ambiguity;
- permit replay;
- kill-switch unavailable;
- durable execution behavior.

Current overall validation:

```text
268 / 268 tests
7400 / 7400 deterministic adversarial cases contained
```

## Final resilience rule

**When something external is slow, missing or ambiguous, Auctorail should become less willing to act—not more willing to guess.**
