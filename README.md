# Auctorail

**Prove authority before execution.**

Auctorail is a **pre-execution authorization layer for autonomous AI agents**. It sits between an agent that wants to take a consequential action and the credential, wallet, API, or executor that can actually cause that action.

An AI agent may decide what it wants to do. Auctorail decides whether the agent has the **delegated authority and sufficient bound evidence** to do it.

> **The central rule:** intelligence is not authority. A favorable model or Miner response can inform an authorization decision, but it cannot create permission that the principal never delegated.

## Why this exists

AI agents are becoming capable of doing more than answering questions. They can call APIs, move money, publish content, modify infrastructure, create accounts, operate software, and trigger other external effects.

That creates a security problem that prompt engineering alone does not solve:

```text
Can the agent do something?
        is different from
Is the agent authorized to do this exact thing right now?
```

Auctorail makes that distinction explicit.

Instead of giving an agent a powerful credential and hoping it behaves, the protected credential stays behind an authorization boundary. The agent proposes an exact action. Auctorail freezes that action, checks the principal's standing authority, gathers any required external evidence, evaluates deterministic policy, and issues short-lived one-use execution authority only when all required checks pass.

## The 30-second mental model

```text
HUMAN / PRINCIPAL
creates bounded standing authority
        ↓
AI AGENT
proposes one exact action
        ↓
AUCTORAIL
freezes the action
        ↓
AUTHORITY PREFLIGHT
is this action inside the principal's mandate?
        ↓
TELEGRAPH EVIDENCE
paid external intelligence is acquired only when required
        ↓
POLICY
ALLOW / HOLD / BLOCK
        ↓
ONE-USE PERMIT
minted only for an executable ALLOW
        ↓
PROTECTED EXECUTOR
causes the external effect once
        ↓
PROOF RECEIPT
records the authorization and outcome bindings
```

Auctorail is therefore not just another intelligence dashboard and it is not a Miner itself. Telegraph Miners answer questions about the world. **Auctorail uses evidence from Miners as one input to decide whether an agent may act.**

## The easiest way to understand the difference

Suppose an agent wants to send **1 USDC** to a wallet.

A fraud Miner might answer:

```text
wallet risk: LOW
confidence: 0.82
```

That is useful intelligence, but it still does not answer:

- Was this agent allowed to spend money at all?
- Was it allowed to spend **1 USDC** or only `0.50 USDC`?
- Was this exact recipient permitted?
- Was Base Sepolia the permitted chain?
- Does the evidence actually refer to this exact wallet and action?
- Was the evidence fresh enough?
- Was the returned Miner actually serving the required Intent?
- Has this permit already been consumed?
- Did the agent alter the amount after authorization?

Auctorail handles that authorization layer.

## Core security model

Auctorail separates four concepts that are often accidentally collapsed into one:

### 1. Proposal

The agent proposes an action. A proposal has **zero authority by itself**.

### 2. Mandate

The principal defines what the agent is allowed to do: agent identity, action types, targets, limits, policy, evidence Intents, lifetime and status.

### 3. Evidence

External intelligence can help establish whether an otherwise-delegated action meets the policy's safety requirements. In the payment lane Auctorail can acquire real Telegraph Miner evidence through x402.

### 4. Permit

Only a final `ALLOW` decision for an executable action can produce short-lived, one-use execution authority bound to the exact action, decision and evidence commitment.

The protected executor revalidates that authority before causing the effect.

## `ALLOW`, `HOLD`, and `BLOCK`

| Decision | Meaning | Execution |
| --- | --- | --- |
| `ALLOW` | Delegated authority exists and all required policy/evidence checks passed. | May execute only when valid executable authority is present. |
| `HOLD` | Required evidence is missing, stale, weak, unavailable, inconclusive or insufficiently independent. | **No execution.** |
| `BLOCK` | A hard authorization or policy rule failed, or explicit negative evidence requires rejection. | **No execution.** |

`HOLD` is intentionally fail-closed. It does not mean “nothing bad was found.” It means Auctorail does not have enough trustworthy evidence to authorize the action.

## Real Telegraph integration

Auctorail's payment path performs real Telegraph/x402 acquisition when live mode is explicitly enabled and configured.

For the current LOW-risk payment path, Auctorail asks Telegraph for:

```text
Intent:        FRAUD_DETECTION
Target:        exact frozen payment recipient
Chain:         Base Sepolia / 84532
Network:       eip155:84532
Amount:        exact frozen amount
Action:        exact action hash
Applicability: exact target and action
```

The request metadata is **not treated as proof**. Returned evidence must independently satisfy the policy's binding and quality requirements.

For LOW risk, the current policy requires:

- a real `FRAUD_DETECTION` result;
- exact subject applicability;
- exact Base Sepolia chain binding;
- confidence `>= 0.70`;
- a usable signal commitment/hash;
- no explicit negative evidence;
- bounded attempts, evidence spend and deadline.

Slow or unavailable evidence fails closed as `HOLD` rather than granting permission.

## Current adaptive payment evidence policy

The current consequence bands are product defaults used by `payments.adaptive.v1`. They are **not universal financial-risk rules**.

| Proposed amount | Evidence tier | Fraud quorum | Additional Intents | Max fraud attempts | Max evidence spend | Evidence deadline |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `<= 5 USDC` | `LOW` | 1 distinct positive Miner at `>= 0.70` | none | 3 | `0.035 USDC` | **12s** |
| `> 5 to 50 USDC` | `MEDIUM` | 2 distinct positive Miners at `>= 0.75` | `ONCHAIN_TX_LOOKUP` | 4 | `0.060 USDC` | `60s` |
| `> 50 USDC` | `HIGH` | 3 distinct Miners, at least 2 positives at `>= 0.80` | `ONCHAIN_TX_LOOKUP` + `WALLET_BALANCE_CHECK` | 5 | `0.100 USDC` | `90s` |

Provider diversity is counted by **distinct Telegraph Miner ID**, never request count. Three responses from the same Miner do not become three independent opinions.

The current adaptive payment policy also has a hard **10 USDC autonomous execution ceiling**. A stronger evidence plan never creates spending authority above that ceiling or above the principal's Mandate.

See [`docs/RISK_POLICY.md`](docs/RISK_POLICY.md).

## Why LOW uses bounded retries

A Telegraph request can technically succeed but still be unusable for authorization. Examples include:

- incorrect routed Intent;
- evidence for the wrong target;
- evidence for the wrong chain;
- confidence below the policy floor;
- missing explicit subject/chain assertions;
- missing signal commitment;
- route unavailable;
- transport/schema failure.

For LOW risk, Auctorail can retry within a strict envelope. The overall evidence window is currently **12 seconds**, and deployed live Telegraph HTTP calls are additionally bounded so a single slow upstream request does not monopolize the authorization flow.

This improves liveness without weakening evidence requirements.

## Exact-action binding

Auctorail freezes the security-relevant action before authorization.

For the payment adapter that includes fields such as:

```text
payment type
chain ID
asset/token
amount
recipient
reason
policy + version
```

A canonical representation is hashed into the action commitment.

That creates an important property:

```text
Authorized: send 1.00 USDC to Vendor A
Attempted:  send 2.00 USDC to Vendor A

Result: different action → old authority cannot silently apply
```

The same principle applies to recipient swaps, chain confusion, asset substitution, stale hashes and other semantic mutations.

## One-use execution authority

A valid authorization result is still not a reusable blank cheque.

Executable authority is:

- short-lived;
- cryptographically signed;
- bound to the exact action;
- bound to the exact authorization decision;
- bound to the evidence commitment;
- consumed when execution begins;
- protected against replay.

The executor also re-checks the current Mandate and fail-closed execution controls before applying the external effect.

## What happens if execution is ambiguous?

Auctorail does not blindly retry a consequential external effect merely because a client did not receive a clean response.

The execution layer distinguishes between:

```text
known failure
known success
ambiguous external effect
```

An ambiguous effect is treated as a reconciliation problem, not as permission to repeat the operation and risk a duplicate side effect.

## Real public proof in this repository

The repository contains publicly committed real Telegraph/x402 evidence and a protected Base Sepolia execution.

### Canonical payment proof

| Field | Value |
| --- | --- |
| Network | Base Sepolia (`84532`) |
| Protected payment | `1 USDC` |
| Telegraph Intent | `FRAUD_DETECTION` |
| Serving Miner | `Refut On-Chain Risk` (`95822412`) |
| Miner verdict | `ALLOW` |
| Confidence | `0.70` |
| Telegraph evidence cost | `$0.01` via x402 |
| Signal hash | `0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c` |
| Base Sepolia tx | `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc` |
| Block | `46301208` |
| Proof Receipt hash | `0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3` |

Public artifacts:

- [`data/evidence/telegraph-2026-09-01T17-00-18-634Z.json`](data/evidence/telegraph-2026-09-01T17-00-18-634Z.json)
- [`data/evidence/telegraph-2026-09-02T17-36-12-826Z.json`](data/evidence/telegraph-2026-09-02T17-36-12-826Z.json)
- [`docs/REAL_USAGE_LOG.md`](docs/REAL_USAGE_LOG.md)
- [`docs/LIVE_EXECUTION.md`](docs/LIVE_EXECUTION.md)

BaseScan transaction:

https://sepolia.basescan.org/tx/0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc

Conservative public totals currently documented:

```text
Real Telegraph Miner acquisitions: 2
Committed x402 evidence cost:       $0.02
Protected Base Sepolia executions:  1
```

Deterministic demos, tests, fuzz runs and Security Lab scenarios are deliberately not counted as real Telegraph usage.

## Product surfaces

The current web product separates demonstration, inspection and live consequential paths:

- **Home** — plain-language product explanation and visual authorization model.
- **Watch Demo** — deterministic walkthrough of valid execution, mutation blocking, permit replay blocking and missing-evidence HOLD.
- **Check / Live** — real payment authorization path when live Telegraph acquisition is configured.
- **Permissions** — principal-controlled authorization settings for the public demo flow.
- **Activity** — authorization decisions, execution outcomes and receipt references.
- **Verify** — receipt and proof verification.
- **Content Trust** — generic Action/Mandate/Decision reuse for suspicious-content decisions.
- **Security Lab** — deterministic adversarial scenarios; no live payment required.
- **SDK / Docs** — repository-local integration surface for agents and developers.

## Content Trust

Auctorail is not hard-coded to payments conceptually. The generic Action/Mandate/Decision architecture is also used by the Content Trust lane.

The current `content.strict.v1` path can bind evidence to an exact content subject and return `ALLOW`, `HOLD`, or `BLOCK` under deterministic policy.

Important claim boundary: Content Trust has deterministic demo support and bounded live-client code, but the project should **not claim a real live Content Trust Telegraph acquisition unless such an artifact has actually been captured and preserved**.

## Security validation

The latest green `main` CI for the current redesigned version completed:

```text
53 test files
268 / 268 tests passed
```

The deterministic fuzz suites also completed:

```text
1100 payment authorization adversarial cases
3200 adaptive + quorum adversarial cases
3100 general authorization adversarial cases
----
7400 total adversarial cases contained

0 unauthorized executions / authorizations
0 uncaught fuzz errors
```

The production dependency audit reported:

```text
0 vulnerabilities
```

The browser QA workflow also passed the current landing, demo, live, SDK and Security Lab product-flow audit.

These are deterministic validation results, not a claim that software can be proven universally secure.

## Security invariants

Auctorail is designed around these invariants:

1. **An agent proposal is never authority.**
2. **Authority is principal-controlled.**
3. **Paid evidence is acquired only after authority preflight.**
4. **Evidence must bind to the exact action/subject.**
5. **Miner intelligence cannot expand delegated authority.**
6. **Provider diversity is based on distinct Miner identity.**
7. **Evidence acquisition has bounded attempts, spend and time.**
8. **Missing evidence fails closed as `HOLD`.**
9. **Explicit negative evidence fails closed according to policy.**
10. **Executable authority is short-lived and one-use.**
11. **Execution revalidates authority.**
12. **Replay is rejected.**
13. **Ambiguous effects are reconciled, not blindly repeated.**
14. **Receipts bind the authorization and execution outcome.**

Read [`docs/RESILIENCE_INVARIANTS.md`](docs/RESILIENCE_INVARIANTS.md) and [`docs/ATTACK_LAB.md`](docs/ATTACK_LAB.md) for the deeper model.

## Repository map

```text
src/core/                 canonical Action + Mandate primitives
src/policy/               deterministic authorization policies
src/telegraph/            routing, x402, evidence plans, quorum, binding
src/permit/               signed decision-bound execution authority
src/executor/             protected execution + replay/ambiguity controls
src/receipt/              proof receipts
src/sdk/                  trusted integration/adaptor layer
packages/sdk/             repository-local JS SDK
web/                      product UI + APIs
qa/                       browser/Playwright product checks
data/evidence/             sanitized committed real evidence artifacts
data/receipts/             receipt artifacts
docs/                     architecture, risk, integration, demo and proof docs
```

## Run locally

### Recommended runtime

Use a modern Node.js release. **Node 24 is recommended for the current dependency set.** Several browser/DOM development dependencies now require Node 22/24 even though some existing CI configuration still exercises Node 20 for compatibility.

```bash
npm ci
npm run dev
```

Local services:

```text
Payment authorization API     http://127.0.0.1:8787
Utility / Security Lab API    http://127.0.0.1:8788
Vite web UI                   http://127.0.0.1:5173
```

Live evidence paths are opt-in and can spend real test funds through x402. Never commit private keys or funded secrets.

See [`.env.example`](.env.example) and [`docs/DEVELOPER_INTEGRATION.md`](docs/DEVELOPER_INTEGRATION.md).

## SDK

Auctorail includes a small repository-local JavaScript SDK:

```js
import { Auctorail } from "@auctorail/sdk";

const rail = new Auctorail({
  baseUrl: "http://127.0.0.1:8787"
});

const auth = await rail.authorize({
  agent: "invoice-bot",
  amount: "1.00",
  recipient: "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
  limit: "5.00",
  reason: "Supplier invoice",
  live: false
});

console.log(auth.decision); // ALLOW | HOLD | BLOCK
```

The SDK is deliberately thin. It asks the trusted Auctorail service for authorization; it does not hold protected credentials or mint its own permits.

See [`packages/sdk/README.md`](packages/sdk/README.md).

## Demo strategy

For a public video or hackathon presentation, start with the deterministic demo because it makes the security property visible without depending on external Miner availability:

```text
valid 1 USDC action     → allowed/executed demo
amount changed          → BLOCK
permit replayed         → BLOCK
required evidence absent→ HOLD
```

Then show the public real-use artifact or Live Mode to demonstrate that the same architecture is connected to genuine Telegraph/x402 and Base Sepolia execution.

The strongest one-line explanation is:

> **Intelligence tells an agent what it knows. Auctorail determines what it is allowed to do.**

See [`docs/HACKATHON_DEMO.md`](docs/HACKATHON_DEMO.md) and [`docs/DEMO_TODAY.md`](docs/DEMO_TODAY.md).

## Claim boundaries

### Implemented today

- pre-execution Action/Mandate/Decision architecture;
- adaptive payment evidence planning;
- Telegraph/x402 payment evidence acquisition;
- exact evidence binding and distinct-Miner quorum logic;
- deterministic `ALLOW` / `HOLD` / `BLOCK` policy;
- one-use signed execution authority;
- protected Base Sepolia USDC execution;
- replay/idempotency/ambiguity controls;
- tamper-evident receipts and verification;
- Content Trust policy/demo path;
- repository-local SDK;
- deterministic attack/fuzz validation;
- responsive web product and automated browser QA.

### Publicly demonstrated with committed real artifacts

- genuine Telegraph/x402 payment evidence;
- one protected Base Sepolia USDC execution;
- a canonical real Miner `FRAUD_DETECTION` result with signal hash and confidence.

### Not claimed

- that every Auctorail product lane has already been exercised live through Telegraph;
- that HIGH-tier multi-Miner evidence has already been captured successfully in a public artifact;
- that Auctorail is independently audited or production-certified;
- that the local SDK is already a public npm release;
- that AI/Miners provide objective truth;
- that any system can guarantee universally safe autonomous agents.

## Naming and compatibility

The current product and repository are **Auctorail**.

Some stable historical identifiers intentionally retain the old `ProofGate` / `proofgate.*` names, including wire-format/schema identifiers and the already-deployed `ProofGateVendor` contract. Renaming them casually could break artifact hashes, compatibility or deployment provenance.

Treat them as **legacy protocol identifiers**, not a second product brand.

## Documentation

Start with [`docs/README.md`](docs/README.md).

Key documents:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system and trust-boundary architecture.
- [`docs/RISK_POLICY.md`](docs/RISK_POLICY.md) — current adaptive evidence policy.
- [`docs/DEVELOPER_INTEGRATION.md`](docs/DEVELOPER_INTEGRATION.md) — integration guide.
- [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md) — threat model and security properties.
- [`docs/REAL_USAGE_LOG.md`](docs/REAL_USAGE_LOG.md) — conservative ledger of real Telegraph/x402 usage.
- [`docs/LIVE_EXECUTION.md`](docs/LIVE_EXECUTION.md) — canonical real execution proof.
- [`docs/HACKATHON_DEMO.md`](docs/HACKATHON_DEMO.md) — judge-facing demo story.
- [`docs/FINAL_SUBMISSION.md`](docs/FINAL_SUBMISSION.md) — submission claims and evidence boundaries.
- [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) — common live/demo/deployment failures.
- [`docs/GLOSSARY.md`](docs/GLOSSARY.md) — project terminology.

## Final principle

**Do not give an autonomous agent more trust because it sounds confident. Give it explicit authority, require evidence appropriate to the consequence, bind that evidence to the exact action, and make execution depend on a verifiable one-use authorization.**
