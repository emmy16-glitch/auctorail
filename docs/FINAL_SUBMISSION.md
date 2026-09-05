# Auctorail — final hackathon submission pack

This file is the judge-facing source of truth for the Telegraph Protocol Application Track submission, demo video, public post, and claim boundaries.

For deeper technical detail, start with [`README.md`](../README.md) and [`docs/README.md`](README.md).

---

## Project

**Auctorail**

**Tagline:** **Prove authority before execution.**

### One-line description

Auctorail is a pre-execution authorization layer for autonomous agents: it freezes one exact action, checks delegated authority, verifies the Telegraph evidence that action requires, returns `ALLOW`, `HOLD`, or `BLOCK`, and only creates one-use execution authority when the checks pass.

### Plain-English version

An AI agent can decide what it wants to do. It should not be able to give itself permission to do it.

Auctorail sits between the agent and the protected tool. The human principal defines the limits. The agent proposes an exact action. Auctorail checks the limits first, obtains and verifies independent Telegraph Miner evidence when required, and only then decides whether that exact action may proceed.

A Miner saying `ALLOW` is **evidence**, not permission.

---

## What is demonstrated today

Auctorail has two user-facing policy lanes built on the same generic Action / Mandate / Decision foundation.

### 1. Protected payment lane

```text
agent proposes payment
→ freeze exact payment
→ check principal authority
→ derive consequence-based evidence plan
→ Telegraph/x402 evidence
→ ALLOW / HOLD / BLOCK
→ one-use permit on ALLOW
→ protected execution
→ payment receipt
```

This is the lane with the project's real Telegraph/x402 and Base Sepolia execution proof.

### 2. Content Trust lane

```text
user/agent supplies suspicious content
→ hash exact content
→ obtain or load bound evidence
→ content.strict.v1
→ ALLOW / HOLD / BLOCK
→ content receipt
```

Content Trust is a simpler public example of the same principle: evidence is checked against one exact subject before a consequential decision to view, share, or publish.

Its default UI is **DEMO · FREE**. That deterministic demo output is intentionally **not** presented as live Telegraph output.

A bounded real Content Trust Telegraph/x402 path exists behind:

```text
AUCTORAIL_CONTENT_LIVE_ENABLED=true
```

Do not claim a real Content Trust Miner run until one has actually been performed, reviewed, and preserved as a safe artifact.

---

## Core model

```text
PRINCIPAL
defines authority
     ↓
AGENT
proposes an exact action
     ↓
AUCTORAIL
freezes action + checks authority
     ↓
TELEGRAPH
supplies required external intelligence
     ↓
AUCTORAIL POLICY
ALLOW / HOLD / BLOCK
     ↓
ONE-USE AUTHORITY
only for an allowed executable action
     ↓
PROTECTED EXECUTOR
causes the external effect
     ↓
VERIFIABLE RECEIPT
```

Three rules matter more than anything else:

1. **Evidence is not authority.** A Miner result cannot expand what the principal delegated.
2. **The exact action is the unit of permission.** Changing a security-relevant field changes the action binding.
3. **Fail closed.** Missing or insufficient required evidence becomes `HOLD`; a hard violation becomes `BLOCK`.

---

## Current consequence-adaptive payment policy

The current implementation uses these evidence tiers:

| Proposed amount | Tier | Fraud requirement | Additional Intents | Max evidence spend | Deadline |
| --- | --- | --- | --- | ---: | ---: |
| `<= 5 USDC` | `LOW` | 1 distinct positive Miner at `>= 0.70` | none | `0.035 USDC` | `35s` |
| `> 5 to 50 USDC` | `MEDIUM` | 2 distinct positive Miners at `>= 0.75` | `ONCHAIN_TX_LOOKUP` | `0.060 USDC` | `60s` |
| `> 50 USDC` | `HIGH` | 3 distinct Miners, at least 2 positives at `>= 0.80` | `ONCHAIN_TX_LOOKUP` + `WALLET_BALANCE_CHECK` | `0.100 USDC` | `90s` |

Provider diversity is counted by **distinct Telegraph Miner ID**, never by request count.

The final payment policy treats **any explicit negative evidence as `BLOCK`**. A high-confidence negative can also stop acquisition early. Known negative evidence is never averaged away by a positive majority.

### Evidence tier is not authority

`payments.adaptive.v1` currently has a hard **10 USDC autonomous execution ceiling**.

So:

```text
1 USDC   → LOW evidence tier; potentially executable if the Mandate allows it
7 USDC   → MEDIUM evidence tier; potentially executable if the Mandate allows it
20 USDC  → MEDIUM evidence tier, but blocked by the 10-USDC autonomous ceiling
75 USDC  → HIGH evidence tier, but still blocked by the 10-USDC autonomous ceiling
```

The HIGH plan demonstrates how stronger evidence would be required for higher-consequence proposals. It does not manufacture permission to execute them.

See [`RISK_POLICY.md`](RISK_POLICY.md).

---

## Public real-usage proof

The conservative publicly committed minimum is:

```text
Real Telegraph Miner acquisitions: 2
Committed x402 evidence cost:       $0.02
Protected on-chain executions:      1
```

These totals deliberately exclude Guided Demo, Content Trust demo, Security Lab, SDK examples, unit tests, and fuzz traffic.

Full ledger: [`REAL_USAGE_LOG.md`](REAL_USAGE_LOG.md).

### Genuine Telegraph artifact #1

`data/evidence/telegraph-2026-09-01T17-00-18-634Z.json`

- Intent: `FRAUD_DETECTION`
- Miner: `Refut On-Chain Risk`
- Miner ID: `95822412`
- Chain: Base Sepolia `84532`
- Verdict: `ALLOW`
- Confidence: `0.50`
- Telegraph cost: `$0.01`
- Signal hash: `0x28c002c52731ed59f12573408aa2c918ba0dd6cf7691535c7699f54d4fc8f12c`

This acquisition is evidence-only and is not presented as the canonical protected execution.

### Genuine Telegraph artifact #2 + canonical protected execution

`data/evidence/telegraph-2026-09-02T17-36-12-826Z.json`

- Intent: `FRAUD_DETECTION`
- Miner: `Refut On-Chain Risk`
- Miner ID: `95822412`
- Chain: Base Sepolia `84532`
- Verdict: `ALLOW`
- Confidence: `0.70`
- Telegraph cost: `$0.01`
- x402 settlement success: `true`
- Signal hash: `0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c`

Protected execution:

- Amount: `1 USDC`
- Transaction: `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc`
- Block: `46301208`
- Proof Receipt hash: `0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3`

Basescan:

https://sepolia.basescan.org/tx/0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc

Full record: [`LIVE_EXECUTION.md`](LIVE_EXECUTION.md).

---

## What VERIFY proves

The public **VERIFY** surface can inspect:

- Auctorail payment receipt JSON;
- Auctorail content receipt JSON;
- a receipt ID;
- a receipt hash;
- a recorded Base Sepolia transaction hash.

For payment receipts, Auctorail recomputes receipt integrity and checks the action, Mandate, evidence, decision, permit, and execution bindings represented by the receipt schema.

For content receipts, it recomputes the content receipt hash, exact subject/action binding, evidence commitment, and deterministic decision aggregation.

A valid receipt proves integrity and binding **under Auctorail's verification rules**. It does not prove that an external Miner prediction is objective truth.

---

## Product surfaces

| Surface | What it demonstrates |
| --- | --- |
| **Home** | Project thesis and entry points. |
| **Content Trust** | Exact-content evidence checks and content receipts; deterministic by default. |
| **Verify** | Re-check payment/content receipts and the canonical payment reference. |
| **Guided Demo** | Valid request, action mutation, replay, and missing-evidence behavior with zero real payments. |
| **Check / Live Mode** | Real Telegraph/x402 payment authorization path and protected Base Sepolia execution path. |
| **Activity** | Decision and execution history with proof context. |
| **Permissions** | Principal-controlled authority and limits. |
| **Security Lab** | Deterministic mutation/replay/evidence attack workbench. |
| **Docs / SDK** | Repository-local integration example. |

---

## SDK claim

The SDK is real and runnable **from this repository**:

```bash
npm install ./packages/sdk
```

It is intentionally a repository-local/private hackathon package.

Do **not** say `@auctorail/sdk` is already published to the public npm registry.

See [`../packages/sdk/README.md`](../packages/sdk/README.md).

---

## Security validation

The latest green feature-branch validation snapshot before this documentation-only cleanup recorded:

```text
267 / 267 tests passed across 53 files
7400 / 7400 deterministic adversarial fuzz cases contained
0 unauthorized executions / authorizations in those fuzz suites
0 production dependency vulnerabilities reported by npm audit
```

Fuzz breakdown:

```text
1100 payment authorization fuzz
3200 adaptive + quorum fuzz
3100 general authorization fuzz
----
7400 total
```

GitHub Playwright also passed the main product flow at approximately:

```text
390px   phone
980px   Android desktop-site-like viewport
1440px  desktop
```

Do not treat these numbers as eternal. Re-run the exact revision used for submission and use the result from that SHA.

Final verification commands:

```bash
npm ci
npm run ci
npm run audit:prod
npm run attack:lab
npm run security:fuzz
npm run security:fuzz:adaptive
npm run security:fuzz:general
npm run vendor:verify
git rev-parse HEAD
```

Both **Auctorail CI** and **Auctorail UI Playwright** should be green on the exact final SHA before the final video/submission is treated as frozen.

---

## Suggested 3-minute judge path

```text
0:00–0:35  Content Trust deterministic scam check
0:35–0:55  Verify the generated content receipt
0:55–1:25  Load and inspect the canonical real Telegraph + Base Sepolia payment proof
1:25–1:50  Explain risk-adaptive evidence vs delegated authority
1:50–2:15  Security Lab
2:15–2:38  Guided Demo + SDK
2:38–2:55  Public real-usage count + validation
2:55–3:00  Close
```

Exact script: [`HACKATHON_DEMO.md`](HACKATHON_DEMO.md).

---

## Answers to likely judge questions

### “Why not just ask the model whether the transaction is safe?”

Because the component proposing the action should not be the same component that grants itself authority to cause the external effect. Auctorail uses a principal-defined authority boundary and external evidence outside the model's own reasoning loop.

### “Does a Telegraph Miner `ALLOW` execute the payment?”

No. A Miner answer is evidence. Auctorail verifies that evidence, applies policy, checks delegated authority, and only an Auctorail `ALLOW` with valid executable authority can reach the protected executor.

### “What happens when Telegraph cannot provide enough independent evidence?”

The result is `HOLD`. Auctorail does not weaken the quorum or count duplicate Miner routing as fake independence.

### “Why is there a HIGH tier if autonomous execution is capped at 10 USDC?”

The evidence planner and the authority ceiling solve different problems. The HIGH plan shows how evidence requirements scale with consequence; the current policy intentionally does not grant autonomous execution above 10 USDC. A future step-up/human-approved policy would have to create that authority explicitly.

### “Is Content Trust using real Telegraph today?”

The default Content Trust surface is deterministic demo mode. A bounded live Telegraph/x402 client exists, but no real Content Trust usage should be claimed until a live run has actually been captured and reviewed.

### “Is this production audited?”

No. The repository has deterministic unit, fuzz, attack-lab, and browser validation. That is not the same thing as an independent production security audit.

---

## Public-post copy

Built **Auctorail** for the Telegraph hackathon.

An AI agent can decide what it wants to do. It should not be able to give itself permission to do it.

Auctorail freezes the exact action, checks principal-delegated authority, acquires and verifies @Telegraphprotoc Miner evidence through x402 when required, and returns `ALLOW`, `HOLD`, or `BLOCK`. Executable `ALLOW` decisions get one-use authority for one exact action.

Public proof in the repo:

- 2 genuine committed Telegraph Miner acquisitions
- $0.02 committed x402 evidence spend
- 1 protected Base Sepolia execution
- deterministic mutation/replay/evidence attack validation

**Evidence informs authority. It never creates it.**

#Telegraph #AIAgents #Web3Security

---

## Claim discipline

### Safe to say

- genuine Telegraph/x402 payment evidence is publicly committed;
- one protected Base Sepolia transaction is publicly verifiable;
- provider independence is measured by distinct Miner IDs;
- consequence-adaptive multi-Intent/quorum logic is implemented;
- one-use exact-action authorization and replay controls are implemented;
- Content Trust policy and content receipts are implemented;
- the public Verify surface re-checks receipt integrity/bindings;
- deterministic demo/Security Lab/fuzz traffic is kept separate from live usage;
- the repository-local SDK is runnable.

### Do not say unless later proved

- “first ever” or “the first AI payment firewall”;
- “unhackable” or “guarantees safe AI”;
- deterministic Content Trust output is real Telegraph output;
- a content verdict proves objective truth;
- the historical 1-USDC execution used the later adaptive multi-Miner path;
- a successful real three-distinct-Miner HIGH quorum artifact has been captured;
- autonomous payments above the current 10-USDC ceiling are supported;
- `@auctorail/sdk` is publicly available on npm;
- example GitHub/cloud/database adapters are production integrations;
- Auctorail has undergone an independent production security audit.

Specific, inspectable proof is stronger than hype.

---

## Naming compatibility

The current product brand is **Auctorail**.

The repository slug remains `proof-gate`, and stable historical identifiers such as `proofgate.*` and `ProofGateVendor` are retained where changing them would break cryptographic, stored-data, deployment, or compatibility assumptions.

---

## Final checklist

- [ ] Pull the exact final feature branch revision.
- [ ] Keep Content Trust live mode disabled unless a funded, bounded live run is intentional.
- [ ] Never expose `.env`, private keys, wallet recovery material, or signing secrets.
- [ ] Run the final CI/security commands.
- [ ] Confirm **Auctorail CI** is green on the final SHA.
- [ ] Confirm **Auctorail UI Playwright** is green on the same SHA.
- [ ] Record `git rev-parse HEAD`.
- [ ] Test Home, Content Trust, Verify, Guided Demo, Check, Activity, Permissions, Security Lab, and SDK once on the actual device.
- [ ] Open the canonical Basescan transaction before recording.
- [ ] Record the video from the same SHA that passed validation.
- [ ] Post the public update and tag `@Telegraphprotoc`.
- [ ] Submit only claims supported by committed artifacts.
