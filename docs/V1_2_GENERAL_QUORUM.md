# Auctorail distinct-Miner quorum semantics

This document defines the evidence-quorum rules used by Auctorail's adaptive authorization architecture.

The central idea is simple:

> **Multiple requests are not multiple independent opinions unless they came from distinct evidence providers.**

For Telegraph evidence, provider identity is counted by **Miner ID**.

## Why quorum exists

A single external provider can be:

- unavailable;
- wrong;
- stale;
- misconfigured;
- routed for the wrong Intent;
- unable to make the exact subject/chain assertions policy requires.

Higher-consequence actions can therefore require evidence from more than one distinct Miner.

Quorum is not an attempt to create absolute truth. It is a deterministic rule for how much independent evidence the policy requires before execution can be authorized.

## Quorum rule structure

A fraud-evidence quorum can contain:

```text
minimumDistinctMiners
minimumPositiveResults
minimumPositiveConfidence
maxAttempts
negativeVetoConfidence
```

These values are part of the frozen evidence plan and cannot be silently relaxed after acquisition begins.

## Current adaptive fraud quorum

### LOW

```text
minimum distinct Miners:     1
minimum positive results:    1
minimum positive confidence: 0.70
max fraud attempts:          3
negative veto confidence:    0.90
```

### MEDIUM

```text
minimum distinct Miners:     2
minimum positive results:    2
minimum positive confidence: 0.75
max fraud attempts:          4
negative veto confidence:    0.90
```

### HIGH

```text
minimum distinct Miners:     3
minimum positive results:    2
minimum positive confidence: 0.80
max fraud attempts:          5
negative veto confidence:    0.90
```

Higher tiers can also require additional non-fraud Intents.

## Distinctness

Consider these responses:

```text
Attempt 1 → Miner 95822412 → positive
Attempt 2 → Miner 95822412 → positive
Attempt 3 → Miner 95822412 → positive
```

The distinct-provider count is:

```text
1
```

not `3`.

Now:

```text
Miner 95822412
Miner 12345678
Miner 87654321
```

can represent three distinct providers if each identity is verified and the evidence is otherwise usable.

## A response must be usable before it can count

A response is not a quorum vote merely because it came from a new Miner.

It must satisfy the requirement's evidence conditions, such as:

- correct required Intent;
- valid serving-Miner identity;
- Miner capability for the Intent;
- exact subject binding;
- exact chain binding;
- applicability;
- signal commitment where required;
- freshness;
- valid positive/negative semantics.

A distinct but unusable response does not satisfy the policy.

## Qualified positive result

A positive result counts only when its confidence reaches the tier's floor.

Example for MEDIUM:

```text
Miner A → ALLOW, confidence 0.82 → qualified positive
Miner B → ALLOW, confidence 0.61 → not a qualified positive
```

Distinct provider count may be 2, but qualified-positive count is only 1.

If the rule requires 2 qualified positives, quorum is not satisfied.

## Negative veto

The quorum definition includes `negativeVetoConfidence`.

A sufficiently confident negative can terminate the acquisition/evaluation path early according to the rule.

The final adaptive payment policy is also intentionally conservative about explicit negative evidence: known explicit negative evidence is not simply averaged away by positive votes.

## Quorum status

Conceptually a requirement can be:

```text
SATISFIED
UNSATISFIED / insufficient
BLOCKED by negative evidence
```

The final authorization policy maps missing/insufficient required proof to fail-closed behavior rather than optimistic execution.

For required evidence that cannot reach threshold within bounds, the user-visible result is normally `HOLD`.

## Attempts are not votes

`maxAttempts` controls acquisition effort.

It does not mean every attempt must or can count.

Example:

```text
attempt 1 → wrong Intent        → rejected
attempt 2 → correct Miner, 0.55 → below confidence
attempt 3 → correct, 0.80       → one qualified positive
```

For LOW this may satisfy the one-provider requirement.

For MEDIUM it would still be insufficient because a second distinct qualified positive is required.

## Provider routing vs policy quorum

Transport routing and authorization quorum are separate.

Auctorail may use:

- Telegraph ranked auto-route for the first request;
- direct selection of another ranked unused Miner for corroboration.

That transport choice must not change the original policy requirement.

A route fallback is not permission to lower `minimumDistinctMiners`.

## Prior Miner tracking

During acquisition, Auctorail tracks prior Miner IDs.

This helps the route planner prefer an unused provider when independent corroboration is required.

The prior list is a transport/input constraint. The final bundle still verifies actual provider identities.

## Duplicate Miner example

MEDIUM requires 2 distinct positives.

```text
Attempt 1
Miner 100
ALLOW 0.90

Attempt 2
Miner 100
ALLOW 0.94

Result:
Distinct Miners = 1
Qualified positives = 1 provider
Quorum = not satisfied
```

The second response can add information but does not create an independent second provider.

## Below-confidence example

```text
Miner 100 → ALLOW 0.80
Miner 200 → ALLOW 0.60
```

MEDIUM:

```text
Distinct Miners = 2
Qualified positives >=0.75 = 1
Quorum = not satisfied
```

## Negative example

```text
Miner 100 → ALLOW 0.90
Miner 200 → BLOCK/RISK 0.95
```

A high-confidence negative is material. The system must not continue as though two positive votes are merely waiting to overpower it.

## Wrong subject example

```text
Required subject: Wallet A
Miner result:     Wallet B
```

Even if verdict/confidence look good:

```text
usable vote = no
```

## Wrong chain example

```text
Required chain: Base Sepolia 84532
Result chain:   Base mainnet 8453
```

The response does not satisfy exact-chain policy.

## Missing signal commitment

When `requireSignalHash` is true, a response with no usable signal commitment cannot count as valid required evidence.

## Quorum and time/spend bounds

Quorum must be reached inside the frozen acquisition envelope.

Current payment defaults:

```text
LOW:     3 fraud attempts, 0.035 USDC, 12s
MEDIUM:  4 fraud attempts, 0.060 USDC, 60s
HIGH:    5 fraud attempts, 0.100 USDC, 90s
```

Auctorail does not continue indefinitely until it eventually finds enough positive providers.

## Quorum and authority

Even perfect quorum cannot expand authority.

Example:

```text
HIGH plan obtains 3 excellent Miners
Payment amount: 75 USDC
Current autonomous policy ceiling: 10 USDC

Result: still not authorized for autonomous execution
```

Quorum answers “is required evidence sufficient?”

It does not answer “did the principal delegate this action?”

## Bundle integrity

The final evidence bundle/summary should commit to the rule used for evaluation.

An attacker should not be able to acquire evidence under one rule and then present a weaker rule at decision time.

Fuzz tests target:

- distinct-Miner downgrade;
- positive-vote downgrade;
- confidence-floor downgrade;
- negative-veto disable;
- attempt-limit expansion;
- duplicate-Miner counting;
- insufficient-positive quorum;
- quorum summary tampering;
- Miner identity substitution.

## Current validation

The adaptive/quorum fuzz harness currently contains:

```text
3200 deterministic adversarial cases
```

The complete current validation snapshot is:

```text
268 / 268 tests
7400 / 7400 total deterministic adversarial cases contained
0 unauthorized executions / authorizations in the fuzz suites
```

## Designing a new quorum

When adding a new evidence requirement, explicitly define:

1. provider identity key;
2. what counts as distinct;
3. positive semantics;
4. confidence semantics;
5. negative/veto semantics;
6. minimum providers;
7. minimum qualified positives;
8. max attempts;
9. evidence budget;
10. latency deadline;
11. subject/context binding;
12. freshness;
13. signal/provenance requirements.

Do not use “majority” as an informal word without defining these details.

## Final quorum rule

**A quorum is a policy commitment over verified, action-bound evidence from distinct providers—not a count of how many HTTP requests returned something favorable.**
