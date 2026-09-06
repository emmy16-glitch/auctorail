# Auctorail Locked Decisions

This document prevents architecture drift during the Telegraph hackathon.

If a new feature conflicts with this document or `ARCHITECTURE.md`, do not weaken an existing authorization invariant just to make the feature easier to demo.

## Product thesis

**Agent confidence is not permission to act.**

Auctorail is a pre-execution authorization runtime for autonomous agents.

A principal defines bounded standing authority. The agent may propose an action. Telegraph/other trusted evidence sources provide intelligence. Auctorail deterministically decides whether the exact authority + exact evidence are sufficient. Only a short-lived, single-use Permit may authorize the protected effect.

## Public flow

```text
MANDATE
→ PROPOSE
→ FREEZE EXACT ACTION
→ DETERMINE REQUIRED EVIDENCE
→ COLLECT / COMMIT EVIDENCE
→ ALLOW / HOLD / BLOCK
→ PERMIT
→ CONTROLLED EXECUTION
→ RECEIPT / RESULT
```

The public story remains simple even when the evidence graph is more sophisticated.

## Authority model

Locked rules:

- the agent cannot authorize itself;
- a Miner cannot authorize an action by itself;
- an LLM confidence score cannot authorize an action by itself;
- the agent cannot create or expand the principal's Mandate;
- the agent cannot lower the authoritative risk tier/quorum/evidence requirements;
- the protected executor cannot run without a valid Permit;
- the protected tool must not have a second agent-accessible bypass around Auctorail.

Normal successful operation does **not** require a human approval click for every action. Human/principal authority is expressed in the standing Mandate ahead of time.

## Canonical action rule

All protected effects begin with an exact canonical action.

### Payment path

The v1 payment Action Contract remains Base Sepolia USDC-specific and is preserved as the concrete live-proven adapter.

### General path

`proofgate.action.v2` binds:

- namespaced action type;
- exact target;
- bounded JSON-safe parameters;
- policy ID/version;
- canonical payload/hash.

Any protected semantic change creates a different action hash and requires fresh authorization.

Infrastructure may vary; protected effect semantics may not.

## Mandate rule

The standing Mandate is principal authority, not agent metadata.

Payment uses `proofgate.mandate.v1`.

General actions use `proofgate.mandate.v2`, which binds:

- principal/agent identity;
- allowed action types;
- exact allowed targets;
- delegated evidence Intents;
- policy ID/version;
- lifecycle/timestamps/version;
- canonical mandate hash.

Authority must be checked **before potentially paid evidence acquisition** so an unauthorized action cannot spend the principal's evidence budget.

Authority must also be rechecked at Permit mint and immediately before generic execution. A Permit cannot outlive an invalid/expired Mandate.

## Decision semantics

Only three outcomes exist:

### ALLOW
Every required authority and evidence check passes. Permit minting may proceed.

### HOLD
Proof is insufficient/uncertain but a known authorization violation is not established. Examples:

- missing evidence;
- stale evidence;
- insufficient Miner diversity;
- insufficient positive quorum;
- confidence below floor;
- unavailable/unknown provider result;
- bounded deadline/attempt exhaustion;
- required evidence commitment missing.

No Permit. No execution.

### BLOCK
A known authority/security invariant failed. Examples:

- wrong agent/action/target/policy;
- invalid/revoked/expired Mandate;
- adaptive-plan downgrade;
- un-delegated Intent;
- explicit negative evidence;
- tampered commitment/bundle/Permit;
- prohibited x402 payment provenance;
- execution kill switch disabled/unavailable.

No Permit. No execution.

`BLOCK` dominates `HOLD`.

## Telegraph boundary

Telegraph provides intelligence.

A Miner result is **evidence**, not permission.

The adaptive/quorum path is **Intent-first and provider-neutral**. Auctorail asks for a capability; Telegraph determines the serving Miner. Auctorail records the actual provider and validates the returned evidence.

Historical v1 capability/direct-routing behavior remains part of the old canonical real execution path where the evidence contract required a specific compatible provider profile. It is not the design of the v1.2 quorum path.

## Multi-Miner quorum rule

v1.2 implements real same-Intent provider-diversity logic; it does **not** fabricate consensus.

Locked rules:

1. quorum counts **distinct serving Miner IDs**, not request count;
2. repeated responses from the same Miner do not create independent votes;
3. positive votes count only if they meet the configured positive-confidence floor;
4. quorum requirements are deterministically derived from the frozen action;
5. the agent cannot lower distinct-Miner/positive-vote/confidence/attempt/veto thresholds;
6. additional same-Intent requests remain bounded by max attempts, total evidence budget and deadline;
7. inability to obtain required diversity becomes `HOLD`;
8. MEDIUM/HIGH have a `0.90` high-confidence negative early-veto threshold;
9. final policy is stricter: **any explicit known-negative result blocks**, even below the early-veto threshold;
10. the canonical Evidence Bundle commits every attempt and quorum summary.

### Current adaptive payment quorum

```text
LOW
FRAUD_DETECTION
  1 distinct Miner
  1 positive
  positive confidence >= 0.70

MEDIUM
FRAUD_DETECTION
  2 distinct Miners
  2 positives
  positive confidence >= 0.75
  max 4 attempts
+ ONCHAIN_TX_LOOKUP

HIGH
FRAUD_DETECTION
  3 distinct Miners
  2 positives
  positive confidence >= 0.80
  max 5 attempts
+ ONCHAIN_TX_LOOKUP
+ WALLET_BALANCE_CHECK
```

MEDIUM/HIGH early negative veto confidence is `0.90`.

## Evidence Bundle rule

Adaptive payment authorization uses a canonical Evidence Bundle.

It commits:

- exact action and plan;
- every routed attempt;
- exact serving Miner identity;
- Intent/result/confidence/applicability;
- signal/raw-response hashes;
- x402 evidence-payment provenance/cost;
- attempt number;
- canonical quorum summaries;
- aggregate evidence spend;
- bundle hash.

A self-consistent hash proves integrity, not source authenticity.

Live provenance must be established inside the trusted acquisition boundary. Arbitrary agent-supplied JSON must not be treated as authenticated Telegraph evidence at a Permit-minting boundary.

## x402 evidence-spend rule

Buying intelligence is a consequential machine side effect and therefore bounded.

Locked rules:

- validate the actual 402 challenge before signing;
- use the approved Base Sepolia USDC evidence-payment lane;
- maximum per evidence request: `0.01 USDC`;
- enforce the remaining aggregate tier budget before each payment;
- signing must remain bound to the validated challenge/requirements;
- one payment-bearing attempt per challenge;
- require provable settlement;
- never blindly retry an ambiguous paid request;
- if the paid outcome is uncertain, reconcile rather than guessing.

Current aggregate adaptive budgets:

```text
LOW    0.015 USDC
MEDIUM 0.050 USDC
HIGH   0.070 USDC
```

## General Action Adapter rule

v1.2 generalizes the authorization core through **trusted Action Adapters**.

An adapter is trusted deployment code, not arbitrary agent-controlled/plugin code.

It must define:

- action type + policy ID/version;
- `freeze(proposal)`;
- `requiredIntents(action)`;
- `evaluateTrusted(...)`;
- `execute(action)`.

Locked SDK rules:

- `freeze()` output must match registered type/policy/version;
- Mandate scope is checked before evidence acquisition;
- every adapter-required Intent must be delegated by the principal;
- trusted evaluation must explicitly declare exact `coveredIntents`;
- missing required coverage → HOLD;
- unrequested coverage → BLOCK;
- required evidence with no cryptographic commitment → HOLD;
- required evidence with no trusted checks → HOLD;
- only all-PASS ALLOW can mint a Permit.

Auctorail does not claim arbitrary third-party adapters are safe/sandboxed. Adapter code must be reviewed and must not accept replacement execution semantics from the agent.

## General decision/Permit rule

`proofgate.decision.v2` must bind:

- Mandate hash;
- action hash;
- exact agent;
- policy ID/version;
- evidence commitment hash;
- checks;
- final decision/reason/time;
- decision hash.

Decision verification checks semantics as well as hashes. An attacker cannot recompute a self-consistent hash around a wrong agent or an `ALLOW` whose checks contain HOLD/BLOCK.

`proofgate.permit.v2` binds:

- Permit ID;
- Mandate hash;
- action hash;
- decision hash;
- evidence commitment hash;
- policy ID/version;
- nonce;
- issue/expiry timestamps;
- signer metadata/signature.

Production mode rejects the HMAC development signer. Production-oriented signing is asymmetric (Ed25519/KMS/HSM-compatible).

## Controlled execution rule

Before a generic external effect:

1. read the fail-closed execution kill switch;
2. verify decision and Permit;
3. re-evaluate the current Mandate;
4. verify time/bindings/signature;
5. atomically consume the Permit;
6. only then call the trusted adapter.

Kill-switch read failure is not interpreted as permission.

The Permit is claimed before the protected callback.

## Ambiguous effects rule

An external-effect exception after Permit consumption may mean the remote system already performed the action.

Therefore:

```text
callback throws after claim
→ AMBIGUOUS
→ Permit remains consumed
→ no automatic replay
→ integration reconciles external state
```

This applies to general adapters and is consistent with the existing stricter transaction-specific ambiguity handling.

## Replay rule

`permitId + nonce` identify one authorization use.

One Permit may cause at most one protected callback attempt.

Multi-worker deployments should use the shared PostgreSQL replay store, not separate local filesystem stores.

## Real proof vs architecture claims

Locked claim boundaries:

### We may say

- v1.0 contains a real Telegraph/x402-backed Base Sepolia USDC execution;
- v1.2 implements/tests same-Intent distinct-Miner quorum;
- v1.2 implements/tests a general Action/Mandate/Decision/Permit/Executor core;
- developers can register trusted custom adapters;
- deterministic security harnesses cover the implemented invariants.

### We must not say without evidence

- a successful real 3-Miner Telegraph quorum has already been captured;
- the historical v1.0 transaction exercised v1.2 quorum/general code;
- GitHub/cloud/database example adapters are shipped live production integrations;
- arbitrary untrusted adapters are sandboxed;
- the historical transaction used Ed25519/PostgreSQL production paths;
- Auctorail has undergone an independent production security audit.

## Security validation rule

Every release/freeze SHA must pass:

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

GitHub CI must also perform the pinned native Solidity reproducibility check on Linux x64.

Do not move an existing release tag. Create a new immutable tag for a new frozen SHA.

## Final principle

**Telegraph tells autonomous software what the outside world says. The principal defines what the agent may do. Auctorail determines how much breadth and provider independence the consequence deserves, then turns sufficient evidence plus standing authority into one-use permission for one exact action.**
