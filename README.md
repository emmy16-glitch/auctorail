# ProofGate

**Agent confidence is not permission to act.**

ProofGate is a **risk-adaptive authorization firewall for autonomous agents** built for the Telegraph Protocol Application Track.

An agent may decide what it wants to do. It cannot create its own permission to cause a consequential external effect.

For each proposed payment, ProofGate freezes the exact action, checks the principal's standing Mandate, derives how much independent intelligence the consequence deserves, routes the required Intents through Telegraph, enforces a bounded verification budget, resolves evidence conflicts deterministically, and only then may mint a short-lived one-use permit.

```text
MANDATE
  → PROPOSE
  → FREEZE ACTION
  → DERIVE RISK
  → ROUTE TELEGRAPH INTENTS
  → EVIDENCE BUNDLE
  → POLICY
  → ONE-USE PERMIT
  → CONTROLLED EXECUTION
  → PROOF RECEIPT
```

## The problem ProofGate solves

Autonomous-agent systems often collapse three different questions:

1. What does the model want to do?
2. What does independent external intelligence say about the action?
3. Is the model actually authorized to cause the effect?

ProofGate separates them.

- **Agent** — proposes an action.
- **Principal / Mandate** — defines what the agent may do.
- **Telegraph** — routes independent intelligence requests to Miners.
- **ProofGate** — decides whether the exact authority + exact evidence are sufficient.
- **Executor** — is the only path to the protected side effect.

A Miner result is evidence. It is never permission by itself.

## v1.1: consequence-adaptive verification

ProofGate does not spend the same verification effort on every action.

`payments.adaptive.v1` deterministically derives the evidence plan from the exact payment amount:

| Amount | Tier | Required Telegraph Intents | Fraud confidence | Max evidence spend | Deadline |
| --- | --- | --- | ---: | ---: | ---: |
| `<= 1 USDC` | LOW | `FRAUD_DETECTION` | `>= 0.70` | `0.015 USDC` | `15 s` |
| `>1 <=5 USDC` | MEDIUM | `FRAUD_DETECTION`, `ONCHAIN_TX_LOOKUP` | `>= 0.75` | `0.030 USDC` | `25 s` |
| `>5 <=10 USDC` | HIGH | `FRAUD_DETECTION`, `ONCHAIN_TX_LOOKUP`, `WALLET_BALANCE_CHECK` | `>= 0.80` | `0.050 USDC` | `40 s` |

The agent cannot label a `7 USDC` action LOW risk. Before authorization, ProofGate recreates the expected plan from the frozen Action Contract and requires an exact canonical match.

> **Higher consequence → stronger independent evidence → larger but bounded verification budget.**

## Intent-first, provider-neutral Telegraph routing

The adaptive path asks Telegraph for **what it needs**, not for a hardcoded favorite provider.

```text
ProofGate:
"I require ONCHAIN_TX_LOOKUP for this exact address on chain 84532."

Telegraph:
routes to a capable Miner.

ProofGate:
verifies the actual serving Miner, Intent, subject and chain.
```

Before a live run, the current Telegraph registry is checked for active coverage. Missing coverage for a required Intent fails closed instead of silently reducing security.

## Canonical Evidence Bundle

Multi-Intent responses are committed into `proofgate.evidence-bundle.v1`.

Each evidence item records security-relevant context including:

- requested Intent
- actual routed Miner ID/name/slug
- exact subject and chain
- verdict/label when supplied
- confidence when supplied
- applicability
- Telegraph signal hash
- raw-response hash
- received timestamp
- cost/duration metadata
- exact evidence-payment amount/network/asset when paid

The bundle also commits:

- Action ID/hash
- payment amount
- risk tier
- adaptive-plan hash
- maximum evidence spend
- aggregate evidence spend
- canonical `bundleHash`

The bundle verifier rejects body/hash mismatch, duplicate Intents, malformed hashes, wrong subject/chain, invalid timestamps and paid evidence outside the approved Base Sepolia USDC x402 provenance rules.

A different but internally valid bundle cannot be swapped in after permit mint because the decision commitment binds the original bundle.

### Integrity is not authenticity

`bundleHash` proves **integrity** after construction. It does not magically prove arbitrary JSON came from Telegraph.

Live evidence provenance is established inside the trusted acquisition boundary: ProofGate makes the Telegraph request, resolves the serving Miner, checks the requested Intent, requires explicit subject/chain binding, validates the x402 lane and settlement when paid, preserves the signal/raw-response commitments, and only then builds the bundle.

A production permit-minting service must therefore **not accept an arbitrary agent-supplied Evidence Bundle**.

## Conflict semantics

ProofGate does not average away known danger.

- explicit required `MALICIOUS`, `SUSPICIOUS`, `DENY`, `BLOCK`, `HIGH_RISK`, etc. → `BLOCK`
- required evidence missing → `HOLD`
- required signal hash missing → `HOLD`
- stale evidence → `HOLD`
- confidence below tier floor → `HOLD`
- secondary status such as `UNKNOWN` / `UNAVAILABLE` → `HOLD`
- wrong subject/chain → `BLOCK`
- un-delegated Intent → `BLOCK`
- risk-plan downgrade → `BLOCK`
- Evidence Bundle integrity/provenance failure → `BLOCK`
- aggregate evidence budget exceeded → `BLOCK`

`BLOCK` dominates `HOLD`.

## x402 evidence-purchase safety

Buying intelligence is also a machine side effect.

For a paid Telegraph request, the adaptive client:

1. freezes the protected action first;
2. preflights Telegraph;
3. parses the live x402 challenge;
4. validates the exact scheme/network/asset/payment recipient and per-request price policy;
5. checks the quote against the **remaining aggregate risk-tier evidence budget before paying**;
6. performs exactly one paid attempt;
7. requires provable settlement;
8. never blindly retries a paid request after transport ambiguity;
9. accepts evidence only after serving-Miner/Intent/subject/chain verification.

The global per-request Telegraph proof ceiling remains `0.01 USDC` on Base Sepolia USDC.

## Real on-chain proof already captured

The frozen `v1.0.0-hackathon` build completed the original single-Intent flow end-to-end on Base Sepolia on **2026-09-02**.

- protected action: ERC-20 payment
- amount: **1 Base Sepolia USDC**
- sender: `0xC07a448DF2E1F3AF0d6f0E8cCe45d5D753fc8eF4`
- vendor: `0xB38d0405DF1b15961aEf29C7c45f2ED285822c14`
- Telegraph Miner: `Refut On-Chain Risk` (`95822412`)
- Intent: `FRAUD_DETECTION`
- verdict: `ALLOW`
- confidence: `0.7`
- signal hash: `0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c`
- vendor runtime hash: `0x12c20655de1ed03a8e646cb98f8ce51e033ec28dc38b7c9383b8f96d02d07a93`
- transaction: `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc`
- Base Sepolia block: `46301208`
- receipt hash: `0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3`

Basescan:

https://sepolia.basescan.org/tx/0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc

Public artifacts:

- `docs/LIVE_EXECUTION.md`
- `data/evidence/telegraph-2026-09-02T17-36-12-826Z.json`
- `data/evidence/vendor-attestations/vendor-runtime-2026-09-02T17-38-18-411Z.json`
- `data/receipts/878d4350-85c8-44dd-94c2-257641cd7c0c.json`

This real transaction predates the adaptive multi-Intent layer. It must **not** be presented as if three Intents were used. v1.0 is the canonical real execution proof; v1.1 is the stronger adaptive authorization architecture.

## Use ProofGate from another agent

### Recommended trusted-host API

Another developer can keep the autonomous agent limited to its proposal and let the trusted host own the authorization process:

```ts
import {
  authorizePaymentWithEvidence
} from "./src/sdk/proofgate.js";

const result = await authorizePaymentWithEvidence({
  proposal: {
    amountRaw: "7000000",
    destination: "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
    reason: "Agent purchase"
  },
  mandate,
  agentId: "my-agent",
  acquire: trustedTelegraphIntentAcquirer,
  signer: permitSigner,
  ttlSeconds: 30
});

if (!result.permit) {
  // HOLD/BLOCK/incomplete evidence: no executable authority exists.
}
```

Inside that one boundary ProofGate:

- freezes the action;
- derives the risk plan;
- collects the required evidence;
- builds the Evidence Bundle;
- evaluates deterministic policy;
- mints a permit only if collection is complete and the decision is `ALLOW`.

See `docs/DEVELOPER_INTEGRATION.md` for Mandate setup, live Telegraph acquisition, controlled execution and production deployment guidance.

### Evaluate-only HTTP gateway

```bash
npm run gateway:serve
```

Endpoints:

- `GET /health`
- `POST /v1/plan`
- `POST /v1/evaluate`

The HTTP gateway intentionally does not accept wallet keys, buy evidence, mint authority or execute funds. It is an evaluation/debugging surface, not a permit-minting service.

## Live adaptive check

Refresh the Telegraph registry:

```bash
bash scripts/discover-telegraph.sh
```

LOW-risk live check:

```bash
npm run proof:adaptive -- 1
```

Standout HIGH-risk check:

```bash
npm run proof:adaptive -- 7
```

The `7` USDC proposal derives three required Intents and may make up to three real x402 evidence purchases subject to both the per-request and aggregate budgets.

`proof:adaptive` is **check-only for the protected vendor payment**. It does not broadcast `7 USDC`.

Do not blindly rerun after an ambiguous paid request. Reconcile the saved state first.

## Policies

### `payments.strict.v1`
Original strict single-evidence payment policy.

### `payments.attested-vendor.v1`
Composite policy used by the real v1.0 transaction: Telegraph fraud evidence plus exact vendor-runtime attestation.

### `payments.adaptive.v1`
Risk-adaptive, provider-neutral, multi-Intent policy with deterministic tier derivation, canonical Evidence Bundles, conflict handling and bounded verification economics.

All policies fail closed.

## Permit, execution and receipt controls

ProofGate also implements:

- canonical Action Contracts + semantic hash recomputation
- cryptographically committed Mandates
- Mandate lifecycle: `ACTIVE`, `REVOKED`, `EXPIRED`
- per-action and optional cumulative limits
- deterministic `ALLOW / HOLD / BLOCK`
- decision commitments
- short-lived single-use permits
- Ed25519 production-oriented signing + key lifecycle
- HMAC restricted to local/test/demo
- filesystem local and PostgreSQL shared replay protection
- durable transaction-intent state
- cumulative-spend reservations
- execution kill switch
- explicit post-submit `AMBIGUOUS` state
- operation journaling
- Proof Receipt v2 for single evidence
- Proof Receipt v3 for Evidence Bundles
- pinned/reproducible vendor-contract verification

## Security validation

Current v1.1 hardened code validation has passed:

```text
Vitest:                    42/42 test files
Tests:                     210/210
Original adversarial fuzz: 1100/1100 contained
Original valid controls:   100/100
Unauthorized executions:   0
Adaptive fuzz:             1800/1800 contained
Adaptive valid controls:   100/100
Unauthorized authorizations: 0
Uncaught fuzz errors:      0
Production npm audit:      0 vulnerabilities
```

Both fuzz harnesses are deterministic/offline: zero Telegraph requests, zero x402 payments and zero blockchain writes.

Run locally:

```bash
npm ci
npm run ci
npm run audit:prod
npm run attack:lab
npm run security:fuzz
npm run security:fuzz:adaptive
npm run vendor:verify
```

GitHub CI additionally recompiles the pinned Solidity artifact on Linux x64 and fails if the tracked artifact/manifest changes.

On ARM/Termux use `npm run vendor:verify`; see `docs/TERMUX.md`.

## Current scope and honest limitations

ProofGate currently protects one deliberately narrow action class: **Base Sepolia USDC payments up to 10 USDC under the adaptive policy**.

It is an authorization architecture, not yet a generic arbitrary-tool policy language.

The v1.1 live multi-Intent path is implemented and tested, but a **real saved multi-Intent Telegraph bundle should not be claimed until an actual `proof:adaptive` run is captured**. Synthetic multi-Intent evidence exists only in tests/fuzzing.

The canonical v1.0 transaction used the local/demo HMAC + filesystem permit path. Ed25519, PostgreSQL replay protection and durable execution are implemented/tested separately; the historical transaction did not exercise all of those production-oriented controls.

ProofGate currently uses multiple **Intents**, each routed to one serving Miner. It does not claim a same-Intent 2-of-3 Miner consensus system.

## Repository map

```text
contracts/          ProofGateVendor contract
src/core/           Action + Mandate contracts
src/telegraph/      adaptive planning, routing, live client, bundles, x402
src/evidence/       Telegraph normalization + runtime attestation
src/policy/         strict, attested-vendor and adaptive policies
src/permit/         permit commitment/signing/verification
src/executor/       controlled + durable execution/replay protection
src/sdk/            developer-facing trusted authorization SDK
src/gateway/        payment-gateway internals
src/receipt/        Proof Receipt v2/v3
src/security/       attack lab and operational safety controls
migrations/         PostgreSQL replay/execution/spend schemas
scripts/            live proof, adaptive proof, gateway and security tooling
tests/              deterministic regression/security tests
docs/               architecture, integration, demo and live proof docs
```

## Read next

- `docs/ARCHITECTURE.md` — trust boundaries and invariants
- `docs/DEVELOPER_INTEGRATION.md` — integrate another autonomous agent safely
- `docs/HACKATHON_DEMO.md` — judge-facing demo sequence
- `docs/LIVE_EXECUTION.md` — canonical real v1.0 transaction
- `docs/V1_1_COMPETITIVE_PLAN.md` — v1.1 competitive design/status
- `docs/ATTACK_LAB.md` — defensive testing model

## Principle

**Telegraph answers what the outside world says. The principal defines what the agent may do. ProofGate decides how much intelligence the consequence deserves and whether that exact evidence plus that exact authority is enough to permit this exact action.**
