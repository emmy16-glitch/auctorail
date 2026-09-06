# Auctorail final submission guide

This document is the final claim-control and submission-preparation guide for Auctorail.

Its purpose is to keep the hackathon submission **clear, technically specific and evidence-backed** without overstating what the repository proves.

## Recommended project title

**Auctorail — Prove authority before execution**

## One-line description

> Auctorail is a pre-execution authorization rail for autonomous agents: it checks delegated authority and exact-action Telegraph evidence before issuing one-use execution authority.

## Short submission description

> AI agents are becoming capable of moving value and calling powerful tools, but capability is not authority. Auctorail sits between the agent and a protected executor. The principal defines bounded authority; the agent proposes an exact action; Auctorail freezes that action, verifies required Telegraph Miner evidence, and returns deterministic ALLOW, HOLD, or BLOCK. Only an executable ALLOW can produce short-lived one-use authority. The repository includes genuine Telegraph/x402 payment evidence, a protected Base Sepolia USDC execution, public proof receipts, deterministic attack/fuzz validation, a responsive web product and a repository-local SDK.

## Longer submission description

> Auctorail is an authorization layer for autonomous AI agents. Instead of giving an agent a powerful credential and relying on prompt instructions, the protected credential stays behind a trusted executor. A human or organization creates bounded standing authority through a Mandate. When the agent proposes an action, Auctorail canonicalizes and freezes the exact semantics, checks that the request is inside delegated authority, derives consequence-appropriate evidence requirements, and acquires specialized intelligence through Telegraph/x402 when needed. Returned evidence is verified for the required Intent, serving Miner, exact subject and chain, confidence, signal commitment and distinct-provider quorum. Deterministic policy returns ALLOW, HOLD or BLOCK. Only an executable ALLOW can produce a signed short-lived one-use permit, and the executor revalidates authority before causing the external effect. Auctorail has publicly committed real Telegraph/x402 fraud evidence and one protected 1-USDC Base Sepolia execution, while deterministic demos and fuzz traffic are explicitly excluded from real-usage claims.

## Core innovation statement

Use this framing:

> **Telegraph can tell an agent what the world looks like. Auctorail turns that intelligence into bounded authorization without allowing the agent or the intelligence provider to manufacture the principal's authority.**

## Problem statement

Agents can now:

- move money;
- call APIs;
- interact with smart contracts;
- publish content;
- manage software/infrastructure;
- make purchases;
- modify external state.

Traditional agent designs often put the protected credential close to the model and rely on instructions such as:

```text
"Never spend more than $5."
```

That is not a strong security boundary.

Auctorail moves important enforcement into deterministic trusted code outside the agent.

## Product behavior

```text
Principal defines authority
        ↓
Agent proposes exact action
        ↓
Auctorail freezes action
        ↓
Authority preflight
        ↓
Required Telegraph evidence
        ↓
Evidence binding + quorum
        ↓
ALLOW / HOLD / BLOCK
        ↓
One-use permit on executable ALLOW
        ↓
Protected executor
        ↓
Proof receipt
```

## Key demonstrated security properties

### Exact-action binding

An authorization for `1 USDC` cannot silently authorize `2 USDC`.

### Principal authority is separate from evidence

A safe-looking wallet does not let an agent exceed the principal's Mandate.

### Missing evidence fails closed

Insufficient proof returns `HOLD`, not optimistic permission.

### Distinct provider semantics

Duplicate responses from one Miner do not fake independent quorum.

### Permit replay resistance

Consumed one-use authority cannot be reused.

### Execution ambiguity handling

Unclear external outcomes are reconciled rather than blindly retried.

## Current adaptive LOW policy

For public LOW-risk payments (`<= 5 USDC`):

```text
Intent:               FRAUD_DETECTION
required providers:   1 distinct Miner
positive results:     1
confidence floor:     0.70
signal hash:          required
subject binding:      required
chain binding:        required
max fraud attempts:   3
max evidence spend:   0.035 USDC
overall deadline:     12 seconds
```

Do not submit stale `35s` wording.

## Real Telegraph/x402 proof

Current conservative committed totals:

```text
Real Telegraph Miner acquisitions: 2
Committed x402 evidence cost:       $0.02
Protected Base Sepolia executions:  1
```

Canonical evidence:

```text
Intent: FRAUD_DETECTION
Miner: Refut On-Chain Risk
Miner ID: 95822412
Target: 0xB38d0405DF1b15961aEf29C7c45f2ED285822c14
Chain: Base Sepolia / 84532
Verdict: ALLOW
Confidence: 0.70
Signal hash: 0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c
Cost: $0.01
```

Canonical protected execution:

```text
Amount: 1 USDC
Network: Base Sepolia
Transaction:
0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc
```

Receipt:

```text
0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3
```

See `REAL_USAGE_LOG.md` and `LIVE_EXECUTION.md`.

## Current deterministic validation

Latest green `main` snapshot:

```text
53 test files
268 / 268 tests passed
```

Fuzzing:

```text
1100 payment authorization cases
3200 adaptive + quorum cases
3100 general authorization cases
----
7400 total adversarial cases contained

0 unauthorized executions / authorizations
0 uncaught fuzz errors
```

Production dependency audit:

```text
0 vulnerabilities reported
```

Browser QA passes the redesigned landing/demo/live/SDK/Security Lab product flow.

## Submission claims matrix

### Safe to claim

| Claim | Evidence |
| --- | --- |
| Auctorail is a pre-execution authorization layer | source + architecture + UI |
| Agent proposals do not equal authority | core design/tests |
| Exact payment action is frozen/bound | action-contract tests |
| Telegraph/x402 is genuinely used in payment lane | committed evidence artifacts |
| Serving Miner/Intent/binding are checked | telegraph source/tests |
| Distinct-Miner quorum exists | quorum source/tests/fuzz |
| Missing evidence can produce HOLD | policy/tests/demo |
| One-use execution permit exists | permit/executor tests |
| Permit replay is blocked | tests/demo |
| Protected Base Sepolia execution happened | public tx + receipt |
| Deterministic fuzz validation exists | current CI logs/scripts |
| Content Trust demonstrates generic architecture reuse | source/UI/tests |
| Repository-local JS SDK exists | `packages/sdk` |
| Current UI is browser-QA tested | Playwright workflow |

### Claim with qualification

#### “Risk-adaptive multi-Miner authorization”

Safe if phrased as implemented/tested architecture. Do not imply the canonical 1-USDC historical transaction itself ran the later HIGH three-Miner path.

#### “Live Content Trust”

Safe to say bounded live-client code exists behind explicit configuration. Do not say a public real Content Trust Miner proof has already been committed unless such an artifact is added.

#### “Production ready”

Avoid as a blanket claim. The project has strong controls/tests but has not claimed independent production certification/audit.

### Do not claim

- unhackable;
- guaranteed safe AI;
- military-grade;
- independently audited;
- fully decentralized;
- universally production ready;
- public npm release when package remains private/repository-local;
- real live Telegraph usage from deterministic demo/fuzz traffic;
- successful public HIGH three-distinct-Miner evidence artifact if not committed;
- objective truth from an AI/Miner verdict.

## Demo submission path

Recommended video sequence:

```text
Home
→ valid deterministic action
→ amount mutation BLOCK
→ replay BLOCK
→ missing-evidence HOLD
→ canonical real Telegraph evidence
→ public Base Sepolia proof
```

The deterministic demo proves the policy behavior reliably. The real artifact proves the external integration.

## Suggested voiceover

> AI agents can already take real actions, but capability isn't authority. Auctorail sits between the agent and the protected executor. The agent proposes one exact action; Auctorail checks what the human actually delegated and acquires the external evidence the policy requires through Telegraph. A valid action can receive one-use execution authority. Change the amount after authorization and it's blocked. Replay the permit and it's blocked. If required evidence is unavailable, Auctorail holds instead of guessing. The repository also contains genuine Telegraph/x402 fraud evidence and a protected 1-USDC Base Sepolia execution. Intelligence tells agents what they know. Auctorail determines what they're allowed to do.

## Repository links reviewers should see

Prioritize:

1. root `README.md`;
2. `docs/PRODUCT_STORY.md`;
3. `docs/ARCHITECTURE.md`;
4. `docs/REAL_USAGE_LOG.md`;
5. `docs/LIVE_EXECUTION.md`;
6. `docs/HACKATHON_DEMO.md`;
7. `docs/SECURITY_MODEL.md`;
8. `packages/sdk/README.md`.

## Implementation / demonstrated / planned boundary

### Implemented today

- canonical Action/Mandate/Decision architecture;
- payment policy and adaptive evidence planning;
- Telegraph/x402 live payment acquisition;
- evidence subject/chain/Intent verification;
- distinct-Miner quorum logic;
- bounded evidence spend/time/attempts;
- deterministic `ALLOW/HOLD/BLOCK`;
- one-use permits;
- protected Base Sepolia execution path;
- replay/idempotency/ambiguity controls;
- proof receipts and verification;
- Content Trust lane;
- Security Lab;
- repository SDK;
- responsive browser product.

### Demonstrated with committed real artifacts

- two genuine Telegraph acquisitions;
- canonical x402-paid fraud evidence;
- one protected Base Sepolia USDC execution;
- public transaction and proof receipt.

### Planned / future direction

Possible additional protected adapters:

- DeFi;
- infrastructure mutation;
- SaaS/API actions;
- marketplace purchases;
- content publication;
- account management;
- broader smart-contract actions.

Do not present future adapter ideas as already implemented.

## Current runtime note

Node 24 is recommended for local development because newer browser/DOM development dependencies officially target Node 22/24.

Some existing CI workflow configuration still uses Node 20 and currently passes with engine warnings. This is an environment-maintenance item, not a reason to overstate Node 20 support in submission docs.

## Final pre-submission checklist

### Repository

- [ ] intended `main` commit is final;
- [ ] no unintended open PRs;
- [ ] no secret/private-key material committed;
- [ ] README current facts match code;
- [ ] LOW deadline says `12s`, not `35s`;
- [ ] test count says `268`, not `267`;
- [ ] public product branding says Auctorail;
- [ ] historical ProofGate identifiers are explained rather than randomly renamed.

### Validation

- [ ] CI green;
- [ ] browser QA green;
- [ ] fuzz suites green;
- [ ] production dependency audit reviewed;
- [ ] deterministic Watch Demo works;
- [ ] mobile view has no horizontal overflow.

### Real proof

- [ ] evidence JSON paths valid;
- [ ] BaseScan transaction link valid;
- [ ] receipt reference valid;
- [ ] real usage totals match committed artifacts;
- [ ] deterministic traffic not counted as live usage.

### Video

- [ ] problem clear in first 10 seconds;
- [ ] changed-action BLOCK visible;
- [ ] replay BLOCK visible;
- [ ] missing-evidence HOLD visible;
- [ ] real proof shown;
- [ ] no secrets visible;
- [ ] no long unexplained live spinner.

### Copy

- [ ] no “unhackable” language;
- [ ] no false audit/certification claims;
- [ ] no false public-npm claim;
- [ ] no claim that all features were proven by the one historical transaction;
- [ ] distinction between evidence and authority is explicit.

## Final submission principle

**The strongest Auctorail submission is not the one with the biggest claims. It is the one where every important claim has a code path, a test, a deterministic demonstration, or a real external artifact that a reviewer can inspect.**
