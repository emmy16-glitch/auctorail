# Auctorail locked decisions and design record

This file records important product/security decisions that should not be casually changed because they define the trust model.

Some decisions originated when the project was named ProofGate. The current product name is **Auctorail**. Historical protocol identifiers are preserved where compatibility/provenance requires it.

## How to read this document

Each item is labeled:

- **CURRENT** — still aligned with current implementation.
- **HISTORICAL** — records an earlier milestone and should not be treated as current behavior without checking source.
- **COMPATIBILITY** — old naming/format retained intentionally.

Current source and tests remain authoritative.

## D1 — Agent proposals are not authority

**Status: CURRENT**

The agent may propose an action but cannot grant itself permission to execute the protected effect.

Reason:

A compromised or manipulated agent must not be the root of trust for its own permissions.

## D2 — Principal-controlled Mandate is the standing authority boundary

**Status: CURRENT**

Authority originates from trusted principal configuration/Mandate state.

Client fields may describe a request but must not become authoritative merely because the agent supplied them.

## D3 — Freeze exact action before authorization

**Status: CURRENT**

Security-relevant semantics are normalized/canonicalized and committed before evidence acquisition/final policy.

Reason:

An authorization for one action must not silently become authority for a modified action.

## D4 — Evidence is not authority

**Status: CURRENT**

A Miner response is evidence evaluated inside the authority boundary.

A favorable verdict cannot increase the agent's spending limit, change the permitted recipient or bypass another principal/policy constraint.

## D5 — Authority preflight occurs before paid evidence

**Status: CURRENT**

If the action is already outside authority, Auctorail should not pay for evidence that cannot make the request authorized.

This protects security and x402 budget.

## D6 — Missing required evidence fails closed

**Status: CURRENT**

Insufficient or unavailable required proof returns `HOLD` rather than optimistic permission.

`HOLD` is non-executable.

## D7 — Explicit hard policy failure returns BLOCK

**Status: CURRENT**

Examples:

- outside Mandate;
- action binding mismatch;
- explicit negative evidence when policy says block;
- revoked/expired authority;
- invalid/replayed permit;
- autonomous ceiling exceeded.

## D8 — Evidence must be explicitly bound to the exact context

**Status: CURRENT**

For the payment lane this includes exact subject/destination and chain.

Request metadata sent to Telegraph is routing context, not substitute proof of what the Miner asserted.

## D9 — Provider diversity is counted by Miner ID

**Status: CURRENT**

Repeated responses from one Miner cannot fake independent quorum.

## D10 — Consequence can raise evidence requirements

**Status: CURRENT**

Current adaptive tiers:

```text
LOW     <= 5 USDC
MEDIUM  > 5 to 50 USDC
HIGH    > 50 USDC
```

Current LOW deadline is **12 seconds**, not the older 35-second value.

## D11 — Stronger evidence cannot bypass execution ceiling

**Status: CURRENT**

Current adaptive payment autonomous ceiling:

```text
10 USDC per action
```

A HIGH evidence plan does not grant higher authority.

## D12 — x402 spending is bounded

**Status: CURRENT**

Evidence payment is a side effect and must use an approved lane within a frozen evidence budget.

Current maximum evidence budgets:

```text
LOW     0.035 USDC
MEDIUM  0.060 USDC
HIGH    0.100 USDC
```

## D13 — Evidence latency is bounded

**Status: CURRENT**

Current overall deadlines:

```text
LOW     12s
MEDIUM  60s
HIGH    90s
```

The deployed live payment API also bounds individual Telegraph calls.

## D14 — Retry does not weaken policy

**Status: CURRENT**

Bounded retry may seek usable evidence for the same frozen action and requirement.

Retry must not change:

- Intent;
- target;
- chain;
- confidence floor;
- quorum;
- budget;
- deadline;
- action semantics.

## D15 — Paid ambiguity requires reconciliation

**Status: CURRENT**

If x402 payment state is ambiguous, do not blindly purchase again.

## D16 — Protected execution ambiguity requires reconciliation

**Status: CURRENT**

An external timeout is not proof that the side effect failed.

Auctorail does not use blind retry for potentially irreversible effects.

## D17 — Executable ALLOW uses short-lived one-use authority

**Status: CURRENT**

The authorization decision and the external effect remain separate stages.

The agent does not receive a reusable protected credential.

## D18 — Executor revalidates security state

**Status: CURRENT**

Execution-time checks can include:

- permit integrity;
- action/decision/evidence binding;
- expiration;
- Mandate status/version;
- permit consumption;
- kill switch.

## D19 — Permit replay is rejected

**Status: CURRENT**

Consumed one-use authority cannot be used again.

Durable deployments require shared persistent consumption state.

## D20 — Kill-switch failure is fail-closed

**Status: CURRENT**

If trusted execution-enable state is unavailable, protected execution should not proceed.

## D21 — Proof receipts are evidence of integrity/binding, not universal truth

**Status: CURRENT**

A valid Auctorail receipt can prove that the artifact matches Auctorail's recorded commitments.

It does not prove a Miner conclusion is objectively true.

## D22 — Deterministic demo is distinct from live usage

**Status: CURRENT**

Guided Demo, Security Lab, tests and fuzzing are not counted as genuine Telegraph usage.

The public usage ledger counts only inspectable real external artifacts.

## D23 — Canonical public real proof remains historical and immutable

**Status: CURRENT / COMPATIBILITY**

The 2026-09-02 Base Sepolia payment and related evidence/receipt are preserved with their historical identifiers.

Do not rewrite the old artifact just to rename ProofGate to Auctorail.

## D24 — Product branding is Auctorail

**Status: CURRENT**

Public product/interface/documentation copy should say Auctorail.

Stable historical identifiers can remain:

- `proofgate.*` schemas;
- `ProofGateVendor` contract/artifacts;
- compatibility exports;
- old immutable proof strings.

## D25 — SDK remains thin and unprivileged

**Status: CURRENT**

The repository-local SDK requests authorization and submits returned execution authority.

It does not hold protected private keys or permit-signing authority.

## D26 — Public SDK is not claimed as published npm release

**Status: CURRENT**

The package remains repository-local/private unless publication status changes explicitly.

## D27 — Content Trust reuses generic authorization model

**Status: CURRENT**

Content Trust demonstrates reuse of Action/Mandate/Decision semantics outside payments.

The project does not claim a publicly committed genuine live Content Trust Miner artifact unless one is actually preserved.

## D28 — AI-generation evidence is not automatically malicious evidence

**Status: CURRENT**

Content policy must interpret evidence semantically. “AI-generated” alone is not equivalent to phishing/scam/malicious.

## D29 — Browser/UI is not the security boundary

**Status: CURRENT**

Disabled buttons, hidden fields, client limits and routing guards are usability controls, not authoritative permission enforcement.

Server/trusted code revalidates protected semantics.

## D30 — Mobile/responsive quality is part of release validation

**Status: CURRENT**

The redesigned product is checked at desktop and narrow/mobile viewports. Long hashes, grids and technical content must not create horizontal overflow.

## D31 — Reduced-motion should preserve information, not freeze the product

**Status: CURRENT**

Home terminal animations use a calmer reduced-motion mode while continuing to progress rather than becoming permanently static.

## D32 — Node 24 is the current runtime baseline

**Status: CURRENT operational guidance**

Current `main` requires **Node `>=24.15.0`** through `package.json`. `.nvmrc` selects Node 24 and current GitHub Actions workflows run Node 24.

Node 20 is not a supported current baseline. Historical logs that show Node 20 belong to older revisions and should not be used as current runtime guidance.

## D33 — Honest claim boundaries are a product requirement

**Status: CURRENT**

Auctorail should not claim:

- unhackable;
- guaranteed safe AI;
- independent audit without one;
- production certification without one;
- live proof that is only deterministic demo;
- public package release before publication.

## Historical decisions

Earlier planning docs may include temporary choices that were later superseded, including older evidence tier boundaries, old test counts, older UI architecture and ProofGate branding.

Those documents are kept for development history but should include a historical-status warning.

## Change process for a locked decision

A locked decision can change, but not accidentally.

Before changing one:

1. state why the threat/product assumptions changed;
2. update implementation;
3. add/update tests and fuzz cases;
4. review security consequences;
5. update architecture/risk/security docs;
6. update public demo/submission copy if behavior changes;
7. preserve compatibility/migration where old artifacts depend on the previous rule.

## Final decision principle

**Auctorail should optimize availability and product clarity around the security boundary, not by weakening the boundary. The agent remains a requester; the trusted authorization/execution path remains the authority.**
