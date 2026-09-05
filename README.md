# Auctorail

**Prove authority before execution.**

> **Naming note:** Auctorail is the current product name. The repository is still named `proof-gate`, and some historical wire-format identifiers and the deployed `ProofGateVendor` contract keep the old ProofGate name for compatibility. Those identifiers are not a second product.

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

Current policy behavior:

- strong scam/phishing evidence can `BLOCK`;
- missing, stale, weak or unrecognized required evidence becomes `HOLD`;
- AI-generated text is informational by itself and is **not** treated as malicious;
- AI-generation becomes a blocking authorship conflict only when the action is `publish`, the claim is `human`, and the confidence crosses the configured threshold;
- accepted signals must be bound to the exact content hash;
- the receipt summary is included inside the receipt hash so the displayed summary and audit record cannot silently diverge.

The Content Trust UI defaults to **deterministic demo mode** and clearly labels demo evidence as non-Telegraph output.

A bounded live Telegraph/x402 Content Trust client exists behind:

```text
AUCTORAIL_CONTENT_LIVE_ENABLED=true
```

A real Content Trust Miner run should **not** be claimed until the run has actually been performed, reviewed and preserved as a safe artifact.

---

## Verify: prove the receipt, not the screenshot

The web app includes a public **VERIFY** surface.

It can inspect:

- Auctorail payment receipt JSON;
- Auctorail content receipt JSON;
- a receipt ID;
- a receipt hash;
- a recorded Base Sepolia transaction hash.

For payment receipts, verification recomputes receipt integrity and checks the action, Mandate, evidence, decision, permit and execution bindings represented by the receipt schema.

For content receipts, verification recomputes the content receipt hash, subject/action binding, evidence commitment and deterministic decision aggregation.

A valid receipt proves that the record is internally consistent under Auctorail's verification rules. It does **not** mean that a Miner prediction is objective truth.

---

## Product surfaces

The UI intentionally separates explanation, deterministic testing and real execution.

| Surface | Purpose | Live external side effect? |
| --- | --- | --- |
| **Home** | Explains the product and routes users to the main flows. | No |
| **Guided Demo** | Shows valid request, modified amount, permit replay and missing-evidence behavior. | No |
| **Content Trust** | Checks suspicious content and creates a content receipt. Demo by default; live acquisition is explicit opt-in. | Demo: no. Live mode: Telegraph/x402 only when enabled. |
| **Verify** | Verifies payment/content receipts and known transaction references. | No protected payment execution. |
| **Check / Live Mode** | Runs the real payment authorization path. | Can make Telegraph/x402 requests and, after authorization, protected Base Sepolia execution. |
| **Activity** | Shows decisions, execution outcomes and receipt details. | No |
| **Permissions** | Shows and explains standing authority/limits. | No |
| **Security Lab** | Deterministic adversarial workbench for mutation, replay and evidence failures. | No |
| **Docs / SDK** | Shows integration examples and the repository-local SDK. | Examples are deterministic unless you explicitly call the live path. |

---

## Run locally

### Requirements

- Node.js 20+
- npm

For deterministic/demo use:

```bash
npm ci
npm run dev
```

The launcher starts:

```text
Payment authorization API       http://127.0.0.1:8787
Utility API                      http://127.0.0.1:8788
Web UI                           http://127.0.0.1:5173
```

The utility API serves Security Lab, Content Trust and Verify-related local endpoints.

### Live configuration

Use [`.env.example`](.env.example) as the template.

```bash
cp .env.example .env
```

Live payment authorization is intentionally opt-in. Live Content Trust has a separate opt-in switch. Keep private keys, permit-signing secrets and wallet material out of source control.

Do not enable a live path merely to make the UI look more impressive. A live Telegraph request can create a real x402 payment.

---

## SDK quickstart

The SDK is currently a **repository-local hackathon package**. It is not claimed as a public npm release.

Install it from this repository:

```bash
npm install ./packages/sdk
```

A safe local-policy-only example:

```js
import { Auctorail } from "@auctorail/sdk";

const rail = new Auctorail({
  baseUrl: "http://127.0.0.1:8787"
});

const auth = await rail.authorize({
  agent: "invoice-bot",
  amount: "1.00",
  recipient: "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
  limit: "10.00",
  reason: "Supplier invoice #4471",
  reference: "INV-4471",
  live: false
});

console.log(auth.decision); // ALLOW | HOLD | BLOCK
```

`live: false` stops after local policy preflight and does not intentionally purchase Telegraph evidence.

If `live` is omitted, `authorize()` follows the real two-stage path when local policy requires intelligence:

```text
local policy preflight
→ frozen request fingerprint
→ live Telegraph/x402 authorization
→ normalized ALLOW / HOLD / BLOCK
```

Only call `execute()` when the returned authorization contains executable authority:

```js
if (auth.allowed && auth.executionToken) {
  const receipt = await rail.execute(auth);
  console.log(receipt);
}
```

See [`packages/sdk/README.md`](packages/sdk/README.md) for the complete SDK guide.

---

## Security model

Auctorail is designed to fail closed around consequential effects.

Important invariants include:

- **exact action binding** — changing the amount, destination, chain, asset, reason or policy creates a different action;
- **authority before evidence spend** — undelegated requests are blocked before paid evidence acquisition;
- **provider-neutral Telegraph routing** — Auctorail asks for Intents and records the actual serving Miner;
- **distinct-Miner quorum accounting** — duplicate routing cannot fake provider independence;
- **exact evidence binding** — subject, chain, Intent, applicability and commitments are verified;
- **bounded x402 spend** — acquisition is constrained by per-request/aggregate budgets, attempts and deadlines;
- **one-use authority** — executable permits are short-lived and consumed atomically;
- **execution-time revalidation** — the Mandate and bindings are checked again immediately before the effect;
- **kill switch** — protected execution fails closed if execution authority is unavailable/disabled;
- **ambiguous-effect handling** — ambiguous external effects are not blindly retried;
- **tamper-evident receipts** — authorization and execution records are cryptographically committed.

### Critical deployment assumption

The protected tool or wallet must not have a second direct path that the agent can use to bypass Auctorail.

If the same agent process can simply call the protected wallet, cloud API, merge endpoint or other tool directly, the authorization layer is no longer the security boundary. Deployment isolation matters as much as policy code.

---

## Validation status

The latest green feature-branch CI at the time of this documentation update completed:

```text
267 / 267 unit tests passed across 53 test files
7400 / 7400 deterministic adversarial fuzz cases contained
0 unauthorized executions / authorizations in those fuzz suites
0 production dependency vulnerabilities reported by npm audit
```

Fuzz totals:

```text
payment authorization fuzz      1100 / 1100
adaptive + quorum fuzz           3200 / 3200
general authorization fuzz       3100 / 3100
                                -----------
total                             7400 / 7400
```

The final browser workflow also exercises the main product flows in Chromium at approximately:

```text
390px   phone
980px   Android desktop-site-like viewport
1440px  desktop
```

Re-run the exact revision you intend to submit rather than relying forever on a README snapshot:

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

The deterministic tests, Attack Lab and fuzz harnesses are designed to run without buying Telegraph evidence or writing protected blockchain effects.

---

## Repository map

```text
contracts/
  Historical ProofGateVendor demo contract and pinned artifact source.

src/core/
  Payment Action/Mandate contracts plus the generic action.v2 / mandate.v2 core.

src/telegraph/
  Telegraph routing, x402 acquisition controls, adaptive evidence planning,
  distinct-Miner quorum logic, evidence bundles and Content Trust live client.

src/policy/
  Payment policies and content.strict.v1.

src/permit/
  Deterministic decisions, decision commitments, permit signing and verification.

src/executor/
  Protected execution, replay prevention, durable execution and spend authority.

src/receipt/
  Payment proof receipts and content receipts.

src/sdk/
  Trusted in-repository integration/adaptor code and legacy compatibility exports.

packages/sdk/
  Small repository-local JavaScript package used by the Docs/SDK experience.

src/security/
  Attack Lab primitives, kill switch and audit controls.

web/
  Home, Guided Demo, Content Trust, Verify, Check, Activity, Permissions,
  Security Lab and SDK UI.

qa/
  Playwright/browser product checks.

data/evidence/
  Sanitized committed real Telegraph evidence artifacts.

data/receipts/
  Stored proof receipts used by verification flows.

scripts/
  Local demo, live proof, execution, security/fuzz and operational utilities.

tests/
  Deterministic unit/integration tests.

docs/
  Architecture, risk policy, real-usage proof, integration, validation and demo docs.
```

For a guided documentation index, start with [`docs/README.md`](docs/README.md).

---

## Documentation guide

| If you want to understand… | Read… |
| --- | --- |
| the whole project | [`docs/README.md`](docs/README.md) |
| trust boundaries and system design | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| current amount tiers and evidence rules | [`docs/RISK_POLICY.md`](docs/RISK_POLICY.md) |
| real Telegraph/x402 usage | [`docs/REAL_USAGE_LOG.md`](docs/REAL_USAGE_LOG.md) |
| the canonical real payment | [`docs/LIVE_EXECUTION.md`](docs/LIVE_EXECUTION.md) |
| distinct-Miner quorum semantics | [`docs/V1_2_GENERAL_QUORUM.md`](docs/V1_2_GENERAL_QUORUM.md) |
| integrating another protected action | [`docs/DEVELOPER_INTEGRATION.md`](docs/DEVELOPER_INTEGRATION.md) |
| adversarial behavior | [`docs/ATTACK_LAB.md`](docs/ATTACK_LAB.md) |
| the judge-facing demo | [`docs/HACKATHON_DEMO.md`](docs/HACKATHON_DEMO.md) |
| submission claims and claim limits | [`docs/FINAL_SUBMISSION.md`](docs/FINAL_SUBMISSION.md) |

---

## Honest scope

### Real today

- genuine Telegraph/x402 acquisition in the payment lane;
- two publicly committed real Telegraph Miner evidence artifacts;
- one real protected Base Sepolia USDC execution;
- consequence-adaptive multi-Intent and distinct-Miner quorum implementation;
- generic Action / Mandate / Decision / Permit / Executor architecture;
- Content Trust policy and verifiable content receipts;
- bounded, opt-in live Content Trust acquisition code;
- public payment/content receipt verification UI;
- deterministic Security Lab and fuzz validation;
- repository-local SDK;
- responsive product UI with browser QA.

### Not claimed

- a captured real Content Trust Telegraph run merely because the live client exists;
- that the canonical 1-USDC transaction used the later adaptive multi-Miner path;
- a successful real three-distinct-Miner HIGH quorum artifact;
- autonomous execution above the current 10-USDC ceiling;
- production-ready GitHub/cloud/database adapters;
- that arbitrary third-party action adapters are safe without trusted review;
- that a Miner verdict proves objective truth;
- a public npm release of `@auctorail/sdk`;
- an independent production security audit.

---

## Glossary

**Agent** — autonomous software that proposes an action.

**Principal** — the human or trusted authority that delegates what the agent may do.

**Mandate** — the principal's standing, bounded authorization contract.

**Action** — the exact proposed external effect. A canonical hash binds its security-relevant fields.

**Intent** — the type of intelligence requested from Telegraph, such as `FRAUD_DETECTION`.

**Miner** — a Telegraph provider that returns external intelligence for an Intent.

**x402** — the payment mechanism used for paid Telegraph requests in the live path.

**Evidence Bundle** — the verified, committed set of Miner evidence and quorum summaries used by policy.

**Permit** — short-lived, one-use executable authority bound to one exact action/decision/evidence set.

**Receipt** — a tamper-evident record of what Auctorail authorized and, for executable actions, what happened.

**HOLD** — a fail-closed result meaning the system does not currently have enough trustworthy evidence to authorize execution.

---

## Final principle

**Telegraph tells autonomous software what the outside world says. The principal defines what the agent may do. Auctorail combines sufficiently bound evidence with delegated authority to decide whether one exact consequence may proceed.**
