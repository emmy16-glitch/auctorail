# Auctorail Mandate implementation notes

This document explains the role of the **Mandate** in Auctorail's authorization architecture and records the security properties the implementation is expected to preserve.

The Mandate is the principal-controlled standing authority boundary. It answers:

> **What is this agent allowed to do before any external evidence is considered?**

It is deliberately separate from Telegraph Miner evidence.

## Core rule

```text
Agent proposal ≠ authority
Miner result    ≠ authority
Mandate         = principal-defined authority boundary
```

A favorable evidence result cannot authorize an action that the Mandate forbids.

## Why the Mandate exists

Without a trusted standing-authority object, an autonomous agent could effectively define its own permissions by placing values such as:

```text
limit = 1000 USDC
recipient = any wallet
expires = never
```

inside its own request.

Auctorail instead expects authoritative permission to exist on the trusted side.

The public hackathon UI may expose convenient permission fields, but a production integration should persist authoritative Mandate state independently from the agent's proposal.

## Canonical Mandate binding

Auctorail's Mandate model is designed to be canonical and hashable.

A Mandate commitment can cover security-relevant fields such as:

- Mandate ID/version;
- principal identity;
- agent identity;
- allowed action types;
- allowed targets/destinations;
- chain/asset constraints;
- amount/parameter ceilings;
- allowed policy/version;
- delegated evidence Intents;
- activation/expiry;
- status/revocation state.

Set-like values are normalized/deduplicated before hashing where appropriate so the commitment represents deterministic semantics rather than incidental ordering.

## Integer amount semantics

Financial limits should use integer minor units rather than floating-point values.

Example:

```text
1.00 USDC → 1000000 minor units
```

This avoids floating-point ambiguity in security comparisons.

## Mandate integrity

The Mandate hash/commitment exists so a post-authorization mutation cannot silently change the authority that was evaluated.

Conceptually:

```text
Mandate M1
  ↓ canonicalize + hash
mandateHash H1
  ↓
authorization decision binds H1
```

If security-relevant Mandate semantics change, the old binding no longer represents the new authority state.

## Authority checks

The trusted authorization path can enforce Mandate constraints including:

- active time window;
- agent identity;
- action type;
- chain;
- asset;
- exact/allowed destination;
- amount limit;
- policy/version;
- required/delegated Telegraph Intents;
- status/revocation.

A violation is a hard authorization failure and should produce `BLOCK` rather than purchasing evidence in the hope that external intelligence will override the principal.

## Authority-before-evidence-spend

Telegraph/x402 evidence acquisition can cost money.

Auctorail therefore checks whether the action is inside the Mandate before intentionally purchasing required evidence.

Desired order:

```text
1. parse proposal
2. freeze exact action
3. validate Mandate
4. enforce hard policy eligibility
5. derive evidence plan
6. purchase/acquire evidence only if still eligible
```

This protects both authority and evidence budget.

## Strong evidence cannot override the Mandate

Example:

```text
Mandate maximum: 5 USDC
Agent requests:  7 USDC
Miner verdict:   ALLOW, confidence 0.99
```

Expected:

```text
BLOCK
```

The Miner is answering an intelligence question, not granting spending authority.

## Mandate and adaptive risk policy are separate

Auctorail has consequence-derived evidence tiers and a separate autonomous execution ceiling.

Example:

```text
Mandate max:             50 USDC
Adaptive policy ceiling: 10 USDC
Proposal:                20 USDC
```

Even though the Mandate might allow 20 USDC, the current autonomous policy ceiling still blocks execution.

Effective authority is the intersection of all trusted constraints.

## Decision binding

Authorization decisions should commit to the Mandate context used during evaluation.

That prevents a valid decision under one Mandate from being presented as though it were produced under another, broader Mandate.

Conceptually:

```text
decision commitment =
  action binding
  + mandate binding
  + evidence commitment
  + policy result
```

## Permit binding

Executable permits must authenticate the Mandate binding used by the authorization decision.

A permit produced under Mandate A must not be usable as authority under Mandate B.

## Execution-time revalidation

The Mandate can change between authorization and execution.

Examples:

- principal revokes the agent;
- Mandate expires;
- Mandate version changes;
- target scope changes;
- kill switch is disabled.

The protected executor therefore re-checks current trusted authorization state rather than assuming a previously valid permit can ignore all later revocation.

## Receipt binding

Proof receipts should preserve the authority context that supported the action.

A receipt can commit to the canonical Mandate/hash so later inspection can establish which standing authority was used.

Historical receipt/schema identifiers may still use `proofgate.*` names for compatibility/provenance.

## Operation journal behavior

Deterministic security failures should be recorded as terminal blocked outcomes rather than disappearing as generic exceptions.

This makes it possible to distinguish:

```text
BLOCKED by authority
HOLD due to insufficient evidence
EXECUTED
FAILED / AMBIGUOUS execution
```

## Agent-controlled `limit` field warning

The repository-local SDK/public API currently accepts a `limit` parameter because it is useful for the hackathon control surface.

That must not be misunderstood as the recommended production trust model.

Unsafe production design:

```text
agent sends limit=1000
server treats it as principal authorization
```

Preferred design:

```text
trusted principal policy store
  ↓
Mandate
  ↓
agent request evaluated against Mandate
```

## Mandate lifecycle

A robust deployment should support:

```text
ACTIVE
REVOKED
EXPIRED
SUPERSEDED / VERSIONED
```

Revocation or expiry should fail closed.

## Versioning

Changing authority semantics should create a new version/commitment instead of mutating an old authority object invisibly.

Permits and decisions can then bind to the exact version evaluated.

## Concurrency and durable storage

In a multi-instance deployment, authoritative Mandate state should come from shared trusted storage rather than per-process memory.

Execution-time revalidation must observe the current authoritative state consistently enough that revoked authority cannot survive merely because another server instance has stale local memory.

## Security tests

Relevant test families cover cases such as:

- Mandate canonicalization;
- post-hash Mandate mutation;
- wrong agent;
- target/action-scope substitution;
- amount/parameter escape;
- policy substitution;
- revocation/expiry;
- different-Mandate permit use;
- strong evidence attempting to override authority;
- receipt Mandate tampering;
- execution after Mandate expiry;
- undelegated action or evidence Intent.

The current broader validation snapshot is:

```text
53 test files
268 / 268 tests passed
7400 / 7400 deterministic adversarial cases contained
```

## Implementation references

Relevant areas include:

```text
src/core/
src/policy/
src/permit/
src/executor/
src/receipt/
src/sdk/
tests/
```

For the full trust model, read:

- `docs/ARCHITECTURE.md`
- `docs/SECURITY_MODEL.md`
- `docs/DEVELOPER_INTEGRATION.md`
- `docs/RISK_POLICY.md`
- `docs/permit-consumption-store.md`

## Change checklist

When Mandate semantics change:

1. update canonical schema/validation;
2. update hashing/binding logic;
3. update decision/permit/receipt commitments;
4. update execution-time revalidation;
5. add mutation/revocation/version tests;
6. update adapter/SDK documentation;
7. review compatibility with stored artifacts;
8. run full unit/fuzz suites;
9. update architecture/security docs.

## Final Mandate principle

**The Mandate is the principal's authority, not the agent's suggestion. Telegraph evidence can help Auctorail decide whether an action inside that authority is safe enough to execute, but no amount of external confidence should manufacture permission the principal never delegated.**
