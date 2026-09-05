# Auctorail

**Prove authority before execution.**

> **Naming note:** Auctorail is the current product and repository name. The project was previously developed as ProofGate, so some historical wire-format identifiers and the already-deployed `ProofGateVendor` contract keep the old name for compatibility and provenance. Those identifiers are not a second product.

Auctorail is a **pre-execution authorization layer for autonomous agents**. An agent can propose an action, but it cannot grant itself permission to cause the external effect.

Before a protected action is allowed to execute, Auctorail:

1. freezes the exact action;
2. checks what the human principal actually delegated;
3. derives the evidence required by the consequence;
4. acquires and verifies Telegraph Miner intelligence when live evidence is needed;
5. returns a deterministic `ALLOW`, `HOLD`, or `BLOCK` decision;
6. issues short-lived, one-use execution authority only after the checks pass; and
7. records a tamper-evident receipt after the outcome.

The core idea is simple:

> **The agent may decide what it wants to do. It must not be able to create, expand, or bypass the authority required to do it.**

---

## The 60-second mental model

Think of Auctorail as a security checkpoint between an AI agent and a consequential tool.

```text
HUMAN PRINCIPAL
creates standing authority
        ↓
AGENT
proposes one exact action
        ↓
AUCTORAIL
freezes the action and checks authority
        ↓
TELEGRAPH
provides paid external intelligence when required
        ↓
AUCTORAIL POLICY
ALLOW / HOLD / BLOCK
        ↓
ONE-USE PERMIT
only for an allowed executable action
        ↓
PROTECTED EXECUTOR
causes the external effect
        ↓
PROOF RECEIPT
records what was authorized and what happened
```

A favorable Miner answer is **evidence**, not permission. The principal's Mandate defines the authority boundary. Telegraph helps Auctorail decide whether the requested action is safe enough **inside that boundary**.

---

## A concrete payment example

Suppose `invoice-bot` wants to send **7 USDC** to a vendor.

Auctorail does not simply ask the model whether the payment looks safe.

It does the following:

1. **Freeze the payment** — amount, recipient, chain, asset, reason and policy become one canonical action hash.
2. **Check the Mandate first** — if the principal only allowed 5 USDC, the request is `BLOCK` before Auctorail spends anything on Telegraph evidence.
3. **Classify the consequence** — 7 USDC falls into the current `MEDIUM` evidence tier.
4. **Build the evidence plan** — the current policy requires two distinct confidence-qualified `FRAUD_DETECTION` Miner results and `ONCHAIN_TX_LOOKUP` context.
5. **Acquire evidence through Telegraph/x402** — requests are bounded by attempts, time and evidence-spend limits.
6. **Verify the returned evidence** — Miner identity, Intent, subject, chain, confidence, signal commitment and quorum are checked.
7. **Decide** — Auctorail deterministically returns `ALLOW`, `HOLD` or `BLOCK`.
8. **Mint authority only on `ALLOW`** — the permit is short-lived, signed and bound to the exact action/decision/evidence.
9. **Execute through the protected executor** — the executor re-checks the Mandate and permit, consumes the permit atomically and applies the external effect once.
10. **Create a receipt** — the authorization and execution bindings can be inspected later.

The important separation is:

```text
agent proposal ≠ permission
Miner verdict ≠ permission
stronger evidence ≠ more delegated authority
```

---

## What `ALLOW`, `HOLD`, and `BLOCK` mean

| Decision | Meaning | Can the protected action execute? |
| --- | --- | --- |
| `ALLOW` | Delegated authority and the required evidence checks passed. | Only if the action lane supports execution and valid one-use authority is issued. |
| `HOLD` | Auctorail cannot safely authorize yet because required evidence is missing, stale, weak, inconclusive, or insufficiently independent. | **No.** |
| `BLOCK` | A hard rule failed: for example the action is outside authority, evidence is explicitly negative, bindings do not match, or the policy forbids the action. | **No.** |

`HOLD` is intentionally different from `BLOCK`. A hold means “do not execute with the evidence we currently have,” not “this action is permanently forbidden.”

---

## Authority and evidence are different things

This distinction is the heart of the project.

### Authority answers

> What is this agent allowed to do?

The principal-created Mandate can restrict things such as:

- agent identity;
- action type;
- exact targets or destinations;
- chain and asset;
- per-action amount ceiling;
- policy/version;
- allowed evidence Intents;
- lifetime, status and version.

### Evidence answers

> What does independent external intelligence say about this exact action or subject?

Telegraph Miners can provide evidence such as:

- `FRAUD_DETECTION`;
- `ONCHAIN_TX_LOOKUP`;
- `WALLET_BALANCE_CHECK`.

Evidence can satisfy a policy requirement **inside existing authority**. It cannot make an undelegated action become delegated.

---

## Risk-adaptive payment evidence

`payments.adaptive.v1` derives the evidence plan from the exact frozen payment amount. These are **Auctorail demo/product defaults**, not universal financial-risk rules.

| Proposed amount | Evidence tier | Fraud requirement | Additional Intents | Fraud attempts | Max evidence spend | Deadline |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `<= 5 USDC` | `LOW` | 1 distinct positive Miner at `>= 0.70` | none | 3 | `0.035 USDC` | `35s` |
| `> 5 to 50 USDC` | `MEDIUM` | 2 distinct positive Miners at `>= 0.75` | `ONCHAIN_TX_LOOKUP` | 4 | `0.060 USDC` | `60s` |
| `> 50 USDC` | `HIGH` | 3 distinct Miners, at least 2 positives at `>= 0.80` | `ONCHAIN_TX_LOOKUP` + `WALLET_BALANCE_CHECK` | 5 | `0.100 USDC` | `90s` |

Provider diversity is counted by **distinct Telegraph Miner ID**, never by request count. Repeated routing to the same Miner does not create fake consensus.

A confidence-qualified high-risk negative can veto early, and the final payment policy treats **any explicit negative evidence as a block**. Known negative evidence is never averaged away by positive votes.

### Important: the evidence tier is not the execution limit

The current `payments.adaptive.v1` policy has a hard **10 USDC autonomous execution ceiling**. The public hackathon web flow is also capped at 10 USDC.

That means the `HIGH` evidence plan describes how stronger evidence would be required for higher-consequence proposals, but satisfying a HIGH plan does **not** give the agent authority to execute a payment above 10 USDC. A future human-approved/step-up policy would have to grant that authority explicitly.

See [`docs/RISK_POLICY.md`](docs/RISK_POLICY.md) and [`src/telegraph/adaptive-evidence-plan.ts`](src/telegraph/adaptive-evidence-plan.ts).

---

## Real usage: what has actually happened

Auctorail has a real payment lane. It is not only a UI simulation.

The repository currently contains two publicly committed Telegraph/x402 evidence acquisitions and one protected Base Sepolia execution.

### Canonical protected execution

| Field | Value |
| --- | --- |
| Network | Base Sepolia (`84532`) |
| Protected action | `1 USDC` payment |
| Telegraph Intent | `FRAUD_DETECTION` |
| Serving Miner | `Refut On-Chain Risk` (`95822412`) |
| Miner verdict | `ALLOW` |
| Confidence | `0.70` |
| Telegraph evidence cost | `$0.01` via x402 |
| Signal hash | `0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c` |
| Transaction | `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc` |
| Block | `46301208` |
| Proof Receipt hash | `0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3` |

**Inspect the transaction:**

https://sepolia.basescan.org/tx/0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc

**Inspect the committed evidence:**

- [`data/evidence/telegraph-2026-09-01T17-00-18-634Z.json`](data/evidence/telegraph-2026-09-01T17-00-18-634Z.json)
- [`data/evidence/telegraph-2026-09-02T17-36-12-826Z.json`](data/evidence/telegraph-2026-09-02T17-36-12-826Z.json)
- [`docs/REAL_USAGE_LOG.md`](docs/REAL_USAGE_LOG.md)
- [`docs/LIVE_EXECUTION.md`](docs/LIVE_EXECUTION.md)

Conservative publicly verifiable totals:

```text
Real Telegraph Miner acquisitions: 2
Committed x402 evidence cost:       $0.02
Protected on-chain executions:      1
```

Deterministic demos, Security Lab traffic, unit tests and fuzz cases are intentionally **not** counted as real Telegraph usage.

---

## Content Trust

Auctorail also uses the generic Action/Mandate/Decision core for **Content Trust**.

The current `content.strict.v1` flow protects a decision about suspicious content before a user or agent chooses to view, share or publish it.

```text
content
  ↓
hash exact subject
  ↓
collect bound evidence
  ↓
apply content.strict.v1
  ↓
ALLOW / HOLD / BLOCK
  ↓
content receipt
```

Policy behavior is deliberately conservative:

- strong scam/phishing evidence can `BLOCK`;
- missing, stale, weak, or unrecognized required evidence becomes `HOLD`;
- AI-written text is informational by itself and does **not** mean malicious;
- AI-generation only becomes a blocking authorship conflict when the proposed action is `publish`, the claimed authorship is `human`, and the AI-generation confidence crosses the configured threshold;
- every accepted signal is bound to the exact content hash;
- the receipt `summaryLine` is inside the receipt hash, so the share text and audit record have one source of truth.

The Content Trust UI defaults to **deterministic demo mode**, clearly marked as non-Telegraph output. A bounded real Telegraph/x402 text-acquisition path exists behind the explicit `AUCTORAIL_CONTENT_LIVE_ENABLED=true` switch. Do not claim real Content Trust Miner usage until a real run has been captured and reviewed.

---

## Public proof verification

The web app includes a **VERIFY** surface.

It accepts:

- Auctorail payment receipt JSON;
- Auctorail content receipt JSON;
- a receipt ID;
- a receipt hash;
- a recorded Base Sepolia transaction hash.

For payment receipts, the verifier recomputes Auctorail receipt integrity and checks the action, mandate, evidence, permit, decision, and execution bindings enforced by the receipt schema. A recorded transaction hash links to Base Sepolia for independent chain inspection.

For content receipts, the verifier recomputes the content receipt hash, exact subject/action binding, evidence commitment, and deterministic decision aggregation.

A valid receipt proves **integrity and binding under Auctorail's verification rules**. It does not turn a Miner assessment into objective truth.

---

## Product surfaces

The web experience deliberately separates safe demonstration from real execution:

- **Home** — product thesis and entry points.
- **Content Trust** — paste suspicious text, run a deterministic demo or an explicitly enabled live Telegraph check, and produce a verifiable content receipt.
- **Verify** — independently re-check stored/payment/content receipts and recorded transaction references.
- **Watch Demo** — deterministic, zero-payment walkthrough: valid request, modified amount, replayed permit, missing evidence.
- **Check / Live Mode** — real Telegraph/x402 payment authorization path and protected Base Sepolia execution path.
- **Activity** — decisions, technical bindings, execution outcomes, and receipts.
- **Permissions** — principal-controlled limits and authorization state.
- **Security Lab** — deterministic adversarial workbench; no real payments.
- **Docs / SDK** — short integration flow and deterministic SDK examples.

---

## Security invariants

Auctorail is designed to fail closed around consequential effects:

- exact action / subject binding;
- principal Mandate validation before evidence spending;
- provider-neutral Telegraph routing;
- distinct-Miner quorum accounting;
- evidence subject/chain/intent binding;
- bounded x402 evidence spend;
- one-use, short-lived permits for executable actions;
- execution-time Mandate revalidation;
- fail-closed execution kill switch;
- atomic permit consumption / replay resistance;
- ambiguous external effects are not blindly retried;
- tamper-evident proof receipts.

The repository includes deterministic attack and fuzz harnesses. The current validation snapshot records:

```text
267 / 267 tests across 53 files
7400 / 7400 deterministic adversarial cases contained
0 unauthorized executions / authorizations in those suites
0 production dependency vulnerabilities
```

Fuzz breakdown:

```text
1100 payment authorization
3200 adaptive + quorum
3100 general authorization
----
7400 total
```

Re-run the exact final revision locally before submission:

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

The fuzz/attack suites are offline: they do not buy Telegraph evidence or write to the blockchain.

---

## Run locally

```bash
npm ci
npm run dev
```

The development launcher starts:

- Auctorail payment authorization API — port `8787`
- Auctorail utility API (Security Lab, Content Trust, Verify) — port `8788`
- Vite web UI — port `5173`

Live Telegraph payment authorization and live Content Trust are protected by separate opt-in switches, quotas, and evidence budgets. Never commit real wallet/private-key values.

See [`.env.example`](.env.example).

---

## SDK / integration model

```text
YOUR AGENT
    ↓
AUCTORAIL SDK
    ↓
AUCTORAIL AUTHORIZATION API
    ↓
TELEGRAPH EVIDENCE + POLICY + PERMIT
    ↓
CONTROLLED EXECUTION
```

The payment adapter is the first publicly demonstrated real external effect. The generic Action / Mandate / Decision architecture is reused by Content Trust and is designed for additional trusted consequential adapters.

Some stable internal wire-format identifiers and the historically deployed vendor contract still use the pre-rename `proofgate.*` / `ProofGateVendor` names. They are retained for cryptographic and deployment compatibility and should not be interpreted as the current product brand.

---

## Judge path

For the fastest review:

1. Open the app and run **Content Trust** in demo mode, then verify its generated receipt.
2. Open **Verify** and load the canonical public payment proof.
3. Read [`docs/LIVE_EXECUTION.md`](docs/LIVE_EXECUTION.md) for the genuine Telegraph + Base Sepolia execution.
4. Run **Security Lab** for mutation/replay/missing-evidence enforcement.
5. Read [`docs/FINAL_SUBMISSION.md`](docs/FINAL_SUBMISSION.md) and [`docs/HACKATHON_DEMO.md`](docs/HACKATHON_DEMO.md) for submission claims and presentation sequence.

---

## Scope

What is real today:

- genuine Telegraph/x402 acquisition in the payment lane;
- real protected Base Sepolia USDC execution;
- consequence-derived multi-Intent / distinct-Miner quorum logic;
- generic Action / Mandate / Decision / Permit / Executor architecture;
- `content.strict.v1` plus verifiable content decision receipts;
- bounded opt-in Content Trust Telegraph/x402 client code;
- public verification of Auctorail payment and content receipts;
- deterministic attack and fuzz validation;
- responsive Home, Content Trust, Verify, Demo, Live, Security Lab, Activity, Permissions, and SDK surfaces.

What is **not** claimed:

- that a real Content Trust Telegraph run has already been captured merely because the live adapter exists;
- that the historical 1-USDC transaction used the later multi-Miner quorum path;
- that a successful three-distinct-Miner HIGH quorum artifact has already been captured;
- that example GitHub/cloud/database adapters are production integrations;
- that arbitrary third-party adapters are safe without trusted review;
- that a content Miner verdict proves objective truth;
- that Auctorail has undergone an independent production security audit.

---

## Documentation

Start with [`docs/README.md`](docs/README.md).

That file explains which documents are current, which are historical, and the order a human or AI should use when interpreting the repository.

Useful entry points:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — trust boundaries and invariants;
- [`docs/RISK_POLICY.md`](docs/RISK_POLICY.md) — current consequence-adaptive payment policy;
- [`docs/REAL_USAGE_LOG.md`](docs/REAL_USAGE_LOG.md) — conservative real Telegraph/x402 usage ledger;
- [`docs/LIVE_EXECUTION.md`](docs/LIVE_EXECUTION.md) — canonical protected transaction;
- [`docs/DEVELOPER_INTEGRATION.md`](docs/DEVELOPER_INTEGRATION.md) — adding a trusted protected-action integration;
- [`packages/sdk/README.md`](packages/sdk/README.md) — repository-local SDK guide;
- [`docs/HACKATHON_DEMO.md`](docs/HACKATHON_DEMO.md) — judge-facing demonstration;
- [`docs/FINAL_SUBMISSION.md`](docs/FINAL_SUBMISSION.md) — submission claims/checklist.

---

## Glossary

**Agent** — autonomous software that proposes an action.

**Principal** — the human/organization that owns the authority being delegated.

**Mandate** — standing, bounded authority created by the principal.

**Action** — the exact proposed consequence that is frozen and hashed before authorization.

**Intent** — the type of external intelligence requested from Telegraph.

**Miner** — a Telegraph provider that supplies the requested intelligence.

**x402** — the payment mechanism used when a Telegraph request requires paid evidence acquisition.

**Evidence Bundle** — the committed set of accepted evidence and quorum summaries used by policy.

**Permit** — short-lived one-use capability created only after an executable action is allowed.

**Receipt** — tamper-evident record binding the authorization decision and, where applicable, execution result.

**HOLD** — fail-closed decision meaning the system does not have enough acceptable evidence to authorize execution now.

---

## Final principle

**Telegraph tells autonomous software what the outside world says. Auctorail proves whether there is enough delegated authority and sufficiently bound evidence to permit one exact consequence.**
