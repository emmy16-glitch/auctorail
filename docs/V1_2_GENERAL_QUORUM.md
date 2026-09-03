# ProofGate v1.2 — General Authorization + Telegraph Miner Quorum

## Why v1.2 exists

v1.0 proved that ProofGate could use genuine Telegraph evidence to control one real Base Sepolia USDC payment.

v1.1 made the verification effort consequence-adaptive and added multiple Telegraph Intents.

v1.2 asks two deeper questions:

1. **For a critical claim, how many independent providers should the consequence require?**
2. **Can the same authorization model protect consequential agent actions that are not payments?**

The result is:

> **A general authorization core plus consequence-adaptive horizontal and vertical evidence diversity.**

## The two-dimensional evidence model

### Vertical diversity — different questions

A HIGH-risk payment requires multiple kinds of intelligence:

```text
FRAUD_DETECTION
+ ONCHAIN_TX_LOOKUP
+ WALLET_BALANCE_CHECK
```

### Horizontal diversity — independent providers for one question

The highest-value security question, `FRAUD_DETECTION`, can require independent corroboration:

```text
FRAUD_DETECTION
      │
      ├─ Telegraph route → Miner A
      ├─ Telegraph route → Miner B
      └─ Telegraph route → Miner C
```

ProofGate records who Telegraph actually served. It does not pre-label three calls as independent.

## Exact current quorum policy

### LOW — `<= 1 USDC`

```text
Required Intents:
  FRAUD_DETECTION

Fraud quorum:
  minimumDistinctMiners:      1
  minimumPositiveResults:     1
  minimumPositiveConfidence:  0.70
  maxAttempts:                1
  negativeVetoConfidence:     none

Evidence budget: 0.015 USDC
Deadline:        15 seconds
```

### MEDIUM — `>1 <=5 USDC`

```text
Required Intents:
  FRAUD_DETECTION
  ONCHAIN_TX_LOOKUP

Fraud quorum:
  minimumDistinctMiners:      2
  minimumPositiveResults:     2
  minimumPositiveConfidence:  0.75
  maxAttempts:                4
  negativeVetoConfidence:     0.90

Evidence budget: 0.050 USDC
Deadline:        35 seconds
```

### HIGH — `>5 <=10 USDC`

```text
Required Intents:
  FRAUD_DETECTION
  ONCHAIN_TX_LOOKUP
  WALLET_BALANCE_CHECK

Fraud quorum:
  minimumDistinctMiners:      3
  minimumPositiveResults:     2
  minimumPositiveConfidence:  0.80
  maxAttempts:                5
  negativeVetoConfidence:     0.90

Evidence budget: 0.070 USDC
Deadline:        60 seconds
```

The plan is deterministically recreated from the frozen payment action. The autonomous agent cannot choose or downgrade these values.

## Why distinct Miner identity matters

Suppose Telegraph routes three attempts like this:

```text
attempt 1 → Miner A
attempt 2 → Miner A
attempt 3 → Miner B
```

ProofGate records:

```text
observed attempts: 3
distinct providers: 2
duplicate attempts: 1
```

A HIGH-risk requirement for three distinct Miners is **not satisfied**.

This prevents a routing coincidence or repeated provider from masquerading as a three-provider consensus.

## Why the quorum is not naive 2-of-3 voting

A naive majority rule could allow:

```text
Miner A  ALLOW      0.91
Miner B  ALLOW      0.86
Miner C  MALICIOUS  0.97
```

because two providers are positive.

ProofGate does not do that.

Two layers apply:

1. MEDIUM/HIGH collection has a `0.90` high-confidence negative **early veto** so collection can fail closed without wasting more evidence budget.
2. Final adaptive policy blocks on **any explicit negative result**, even below the early-veto threshold.

Therefore a known-danger signal cannot be averaged away.

## Positive-confidence rule

A positive label does not automatically count as a quorum vote.

For HIGH risk:

```text
ALLOW 0.40
```

is not one of the required positive votes because the positive confidence floor is `0.80`.

This prevents weak positive outputs from being used to manufacture quorum.

## Bounded acquisition

Provider diversity is not permission to spend indefinitely.

Each requirement has a bounded attempt count, and the full evidence plan has:

- aggregate x402 evidence-spend limit;
- deadline;
- per-request global payment cap (`0.01 USDC`).

If the required provider diversity cannot be obtained within those bounds:

```text
HOLD
```

not:

```text
keep paying until something says yes
```

## Canonical quorum commitment

`src/telegraph/evidence-quorum.ts` calculates a deterministic summary for a quorum-protected Intent.

The summary includes:

- rule thresholds;
- observed attempt count;
- sorted distinct Miner IDs;
- sorted positive Miner IDs;
- negative Miner IDs;
- uncertain Miner IDs;
- veto Miner IDs;
- duplicate-Miner attempt count;
- final quorum status.

`proofgate.evidence-bundle.v1` commits both every raw normalized attempt and these canonical quorum summaries.

That means changing any of these after authorization changes the bundle commitment:

- Miner identity;
- response label/confidence;
- signal/raw-response hash;
- attempt number;
- payment metadata;
- quorum thresholds;
- summary membership/status.

A different internally valid Evidence Bundle also cannot replace the one used for Permit minting because the decision/Permit chain commits the original bundle.

## Provider-neutral routing

v1.2 quorum does not hardcode “ask Miner A, then B, then C.”

The application asks Telegraph for an **Intent**. Telegraph determines the serving provider. ProofGate records the actual provider and decides whether enough distinct identities have been observed.

Conceptually:

```text
ProofGate: FRAUD_DETECTION needed
        ↓
Telegraph routes → Miner X
        ↓
Need more independent corroboration?
        ↓ yes
Telegraph routes again → Miner Y or maybe Miner X again
        ↓
ProofGate counts actual distinct provider identities
```

This keeps Telegraph routing central to the application rather than replacing it with a local API aggregator.

## General authorization architecture

The second v1.2 extension removes “Base Sepolia payment” as the architectural definition of ProofGate.

The original payment path remains the concrete live demonstration. A new generic core adds:

```text
proofgate.action.v2
proofgate.mandate.v2
proofgate.decision.v2
proofgate.permit.v2
ActionAdapterRegistry
controlled generic executor
```

### Generic Action Envelope

A generic action has:

```text
type
exact target
bounded JSON parameters
policy ID/version
canonical payload/hash
```

Example:

```json
{
  "type": "github.merge",
  "target": "github:acme/production#42",
  "parameters": {
    "branch": "main",
    "sha": "abc123..."
  },
  "policyId": "github.merge.v1"
}
```

This is an example action shape, not a claim that ProofGate ships a live GitHub integration.

### Generic Mandate

A principal can authorize:

```text
agent: coding-agent
action type: github.merge
target: github:acme/production#42
required evidence: CI_STATUS + SECURITY_SCAN
policy: github.merge.v1
expiry: ...
```

The autonomous agent cannot replace this standing authority.

### Trusted Action Adapter

An adapter is reviewed/trusted deployment code that implements:

```text
freeze(proposal)
requiredIntents(action)
evaluateTrusted(...)
execute(action)
```

It bridges ProofGate's generic authorization model to one real external tool.

The adapter must report:

- cryptographic evidence commitment;
- exact `coveredIntents`;
- deterministic checks.

The SDK verifies coverage before Permit minting.

## Why evidence coverage is explicit

Without explicit accounting, a buggy/malicious adapter might claim:

```text
requiredIntents:
  CI_STATUS
  SECURITY_SCAN

checks:
  PASS
```

without proving which required evidence it actually evaluated.

v1.2 requires:

```text
coveredIntents:
  CI_STATUS
  SECURITY_SCAN
```

and enforces:

- missing required coverage → HOLD;
- extra/unrequested coverage → BLOCK;
- required evidence with no commitment → HOLD;
- required evidence with no trusted checks → HOLD.

This does not magically authenticate the evidence source. Source authenticity remains the trusted adapter/evidence-acquisition responsibility.

## Authority before evidence spend

Before calling `evaluateTrusted()`, the generic SDK checks:

- Mandate integrity/lifecycle;
- exact agent;
- action type;
- target;
- policy;
- required Intent delegation.

If that preflight blocks, trusted evidence acquisition is skipped.

This prevents an unauthorized agent from using a deliberately invalid action merely to consume the principal's paid intelligence budget.

## Decision semantics hardening

A hash alone is not enough.

`verifyGeneralDecision()` also verifies semantics:

- decision agent must equal Mandate agent;
- checks must be nonempty;
- `ALLOW` is valid only when every check is PASS;
- a HOLD/BLOCK check cannot be wrapped inside a self-consistent recomputed `ALLOW` hash;
- decision timestamp must be valid;
- action/Mandate/policy bindings must match.

## Permit + current authority

`proofgate.permit.v2` is signed and short lived.

Before minting, current Mandate authority is evaluated again.

Before execution, the Mandate is evaluated **again**.

This closes the case where:

```text
06:30:00  Permit minted, expires 06:30:30
06:30:10  Mandate expires
06:30:20  agent attempts execution
```

Expected:

```text
BLOCK / general_mandate_execution_invalid
```

The Permit is subordinate to current principal authority.

## Kill switch + replay + ambiguity

The generic executor:

1. checks the fail-closed execution kill switch;
2. verifies current authority/decision/Permit;
3. atomically consumes `permitId + nonce`;
4. calls the trusted adapter once.

If the kill switch is disabled or unreadable, execution is blocked before Permit consumption.

If the adapter callback throws after claim:

```text
AMBIGUOUS
```

The Permit remains consumed and ProofGate never blindly retries. The integration must reconcile the external system.

## What is real vs generalized

### Real public proof

v1.0 contains:

- genuine Telegraph/x402 evidence;
- a real 1-USDC protected Base Sepolia transaction;
- a public transaction hash and Proof Receipt.

### Implemented/tested in v1.2

- same-Intent distinct-Miner quorum;
- adaptive multi-Intent evidence;
- canonical quorum Evidence Bundles;
- generic Action/Mandate/Decision/Permit core;
- trusted Action Adapter Registry;
- generic kill-switch/replay/ambiguity enforcement.

### Not claimed yet

- a saved successful live three-Miner quorum artifact;
- live production GitHub/cloud/database adapters;
- sandboxed arbitrary third-party adapters;
- independent production audit.

## Current deterministic validation

The pre-documentation v1.2 code snapshot passed:

```text
43/43 test files
225/225 tests

1100/1100 original adversarial cases
3100/3100 adaptive + quorum adversarial cases
3100/3100 general authorization adversarial cases

7300/7300 total deterministic adversarial cases
0 unauthorized executions/authorizations
0 uncaught fuzz errors
0 production dependency vulnerabilities
```

All fuzzing is offline with zero Telegraph requests, x402 payments and blockchain writes.

See `V1_2_VALIDATION.md` for the exact release snapshot/run.

## v1.2 differentiator

The compact story is:

> **ProofGate dynamically scales both the breadth and independence of external intelligence with consequence, while keeping the final authorization decision separate from the agent and from the evidence providers themselves.**

And the platform story is:

> **The Base Sepolia payment is ProofGate's first proven adapter, not its architectural limit.**
