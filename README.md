# ProofGate

**Agent confidence is not permission to act.**

ProofGate is a **risk-adaptive authorization firewall for autonomous agents**. An agent may decide what it wants to do, but it cannot authorize its own consequential external effect.

For each proposed payment, ProofGate freezes the exact action, checks the principal's standing Mandate, decides how much independent intelligence the consequence deserves, routes the required Intents through Telegraph, enforces a verification-spend budget, resolves evidence conflicts deterministically, and only then may mint a short-lived one-use permit.

`MANDATE → PROPOSE → RISK → TELEGRAPH INTENTS → EVIDENCE BUNDLE → POLICY → PERMIT → EXECUTE → RECEIPT`

Built for the **Telegraph Protocol Application Track**.

## The idea

Most agent systems collapse three different questions into one:

1. What does the model want to do?
2. Is the outside world safe enough for that action?
3. Is the model actually authorized to cause the effect?

ProofGate separates them.

- **Agent**: proposes an action.
- **Principal / Mandate**: defines what the agent is allowed to do.
- **Telegraph**: routes independent intelligence from Miners.
- **ProofGate**: determines whether the exact authority + exact evidence are sufficient.
- **Executor**: is the only path to the external side effect.

A Miner result is evidence. It is never permission by itself.

## What makes v1.1 different: consequence-adaptive verification

ProofGate does not use the same verification cost for every action.

The current adaptive payment policy deterministically derives the required evidence plan from the exact payment amount:

| Proposed amount | Risk tier | Required Telegraph Intents | Fraud confidence floor | Max evidence spend |
|---|---|---|---:|---:|
| `<= 1 USDC` | LOW | `FRAUD_DETECTION` | `0.70` | `0.015 USDC` |
| `> 1` and `<= 5 USDC` | MEDIUM | `FRAUD_DETECTION` + `ONCHAIN_TX_LOOKUP` | `0.75` | `0.030 USDC` |
| `> 5 USDC` | HIGH | `FRAUD_DETECTION` + `ONCHAIN_TX_LOOKUP` + `WALLET_BALANCE_CHECK` | `0.80` | `0.050 USDC` |

The agent cannot submit a high-value action and claim it is LOW risk. `payments.adaptive.v1` recomputes the expected risk tier, Intent set, confidence floors, latency budget and x402 evidence budget from the frozen Action Contract and blocks any downgrade/mismatch.

This turns Telegraph usage into an explicit security/economic control:

> **Higher consequence → stronger independent evidence → larger bounded verification budget.**

## Provider-neutral Telegraph routing

The v1.1 adaptive path asks Telegraph for an **Intent**, not for a hardcoded provider.

Example:

```text
ProofGate: I require FRAUD_DETECTION for this exact address on chain 84532.
Telegraph: routes the request to a capable Miner.
ProofGate: verifies the actual serving Miner is active and supports that exact Intent.
```

The current adaptive Intents are:

- `FRAUD_DETECTION`
- `ONCHAIN_TX_LOOKUP`
- `WALLET_BALANCE_CHECK`

Before a live run, ProofGate checks the current Telegraph Miner registry and fails closed if any Intent required by the risk tier has zero active coverage.

## Evidence Bundle

Multiple routed responses are not kept as loose JSON blobs. ProofGate builds a canonical `proofgate.evidence-bundle.v1` object containing, per Intent:

- requested Intent
- actual routed Miner ID/name/slug
- exact subject and chain
- verdict/label when supplied
- confidence when supplied
- applicability
- Telegraph signal hash
- raw response hash
- evidence timestamp
- request duration/cost metadata
- exact x402 payment amount/network/asset when paid

The bundle also commits:

- Action ID/hash
- amount
- risk tier
- adaptive-plan hash
- maximum evidence spend
- actual aggregate evidence spend
- canonical bundle hash

The bundle hash is then included in the authorization decision commitment. Swapping even another internally valid evidence bundle after permit mint invalidates authorization.

## Conflict semantics

ProofGate does not average away known danger.

If a required routed signal explicitly reports a negative result such as `MALICIOUS`, `SUSPICIOUS`, `DENY`, `BLOCK` or `HIGH_RISK`, the adaptive policy **BLOCKS**. Two positive signals do not outvote a high-confidence negative one.

Other fail-closed states include:

- missing required Intent → `HOLD`
- missing required signal hash → `HOLD`
- stale evidence → `HOLD`
- confidence below the tier floor → `HOLD`
- wrong subject/chain → `BLOCK`
- un-delegated Intent → `BLOCK`
- tampered Evidence Bundle → `BLOCK`
- aggregate evidence budget exceeded → `BLOCK`
- risk-tier/plan downgrade → `BLOCK`

`BLOCK` dominates `HOLD`.

## x402 evidence-purchase safety

ProofGate treats buying intelligence as a consequential machine action too.

For every paid Telegraph Intent request, the live adaptive client:

1. freezes the protected Action Contract first;
2. makes a preflight request;
3. parses the live x402 challenge;
4. validates scheme, network, asset, recipient and per-request price policy;
5. compares the requested price against the **remaining aggregate evidence budget**;
6. performs exactly one paid attempt;
7. requires provable settlement;
8. never blindly retries a paid request after transport ambiguity;
9. accepts evidence only after actual serving-Miner, Intent, subject and chain verification.

The adaptive orchestrator also enforces a risk-tier latency budget.

## Real canonical execution already proved

The frozen `v1.0.0-hackathon` build completed the original ProofGate authorization flow end-to-end on Base Sepolia on **2026-09-02**.

- Action: ERC-20 payment
- Amount: **1 Base Sepolia USDC**
- Sender: `0xC07a448DF2E1F3AF0d6f0E8cCe45d5D753fc8eF4`
- Canonical vendor: `0xB38d0405DF1b15961aEf29C7c45f2ED285822c14`
- Telegraph Miner: `Refut On-Chain Risk` (`95822412`)
- Intent: `FRAUD_DETECTION`
- Verdict: `ALLOW`
- Confidence: `0.7`
- Signal hash: `0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c`
- Vendor runtime hash: `0x12c20655de1ed03a8e646cb98f8ce51e033ec28dc38b7c9383b8f96d02d07a93`
- Transaction: `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc`
- Base Sepolia block: `46301208`
- Receipt hash: `0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3`

Basescan:

https://sepolia.basescan.org/tx/0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc

Public artifacts:

- `docs/LIVE_EXECUTION.md`
- `data/evidence/telegraph-2026-09-02T17-36-12-826Z.json`
- `data/evidence/vendor-attestations/vendor-runtime-2026-09-02T17-38-18-411Z.json`
- `data/receipts/878d4350-85c8-44dd-94c2-257641cd7c0c.json`

This real transaction predates the v1.1 adaptive multi-Intent layer. It must not be presented as if three Intents were used for that transaction. v1.0 is the canonical **real execution proof**; v1.1 is the stronger adaptive authorization architecture being validated separately.

## Use ProofGate from another agent

ProofGate is no longer limited to the bundled procurement demo. Other developers can put it in front of an agent that proposes Base Sepolia USDC payments.

### SDK

```ts
import {
  planPaymentAuthorization,
  createAdaptivePaymentMandate,
  evaluatePaymentAuthorization
} from "./src/sdk/proofgate.js";

const { action, plan } = planPaymentAuthorization({
  amountRaw: "7000000",
  destination: "0x...",
  reason: "Agent purchase"
});

const mandate = createAdaptivePaymentMandate({
  mandateId: "my-agent-v1",
  principalId: "my-company",
  agentId: "trading-agent",
  allowedDestinations: [action.payload.destination],
  maxPerActionRaw: "10000000",
  requiredIntents: [
    "FRAUD_DETECTION",
    "ONCHAIN_TX_LOOKUP",
    "WALLET_BALANCE_CHECK"
  ],
  status: "ACTIVE",
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  version: 1
});

// Acquire/build a verified EvidenceBundle, then:
const result = evaluatePaymentAuthorization({
  mandate,
  action,
  plan,
  bundle,
  agentId: "trading-agent"
});

if (result.decision.decision !== "ALLOW") {
  // Do not call the protected payment tool.
}
```

For a complete integration including live Telegraph routing and permit minting, see `docs/DEVELOPER_INTEGRATION.md`.

### Evaluate-only HTTP gateway

Start:

```bash
npm run gateway:serve
```

Default bind:

```text
127.0.0.1:8787
```

Endpoints:

- `GET /health`
- `POST /v1/plan`
- `POST /v1/evaluate`

The gateway is intentionally **evaluate-only**. It does not hold a wallet private key, purchase Telegraph evidence, mint a permit or execute money. This makes it safer for another developer to put ProofGate in front of an existing agent/tool boundary.

## Live adaptive proof

Refresh the Telegraph registry first:

```bash
bash scripts/discover-telegraph.sh
```

Then a LOW-risk check-only live run:

```bash
npm run proof:adaptive -- 1
```

Or the standout HIGH-risk demonstration:

```bash
npm run proof:adaptive -- 7
```

The `7` USDC proposal requires three Telegraph Intents and may therefore make up to three real x402 evidence purchases, each subject to both the single-request policy and the remaining total evidence budget.

`proof:adaptive` is **check-only**: it does not broadcast the protected vendor payment.

Do not repeatedly run a paid adaptive proof after an ambiguous payment error. Inspect the saved output/evidence first.

## Policies

### `payments.strict.v1`

Original strict single-evidence payment policy.

### `payments.attested-vendor.v1`

Composite policy used for the canonical v1.0 real transaction: Telegraph fraud evidence plus exact live vendor-runtime attestation.

### `payments.adaptive.v1`

Risk-adaptive, provider-neutral, multi-Intent policy. It derives the evidence plan from action consequence, binds a canonical Evidence Bundle, enforces aggregate x402 spend and latency budgets, rejects risk-tier downgrades, and blocks explicit negative conflicts.

All policies fail closed.

## Authorization and execution security

ProofGate also implements:

- canonical Action Contracts + semantic hash recomputation
- cryptographically committed Mandates
- Mandate lifecycle (`ACTIVE`, `REVOKED`, `EXPIRED`)
- per-action and optional cumulative limits
- deterministic `ALLOW / HOLD / BLOCK`
- decision hashes
- short-lived single-use permits
- Ed25519 production-oriented signing and key lifecycle
- HMAC only for local/test/demo
- filesystem local and PostgreSQL shared replay protection
- durable transaction-intent state
- cumulative-spend reservation
- execution kill switch
- explicit post-submit `AMBIGUOUS` state
- operation journaling
- Proof Receipt v2 (single evidence)
- Proof Receipt v3 (adaptive Evidence Bundle)
- pinned/reproducible vendor-contract build verification

See `docs/ARCHITECTURE.md`.

## Strict local validation

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

On ARM/Termux, use `npm run vendor:verify`; see `docs/TERMUX.md`.

Neither fuzz harness calls Telegraph, pays x402 challenges, or writes to the blockchain.

## Important scope limits

The current protected action is intentionally narrow: **Base Sepolia USDC payment authorization**. ProofGate is an authorization architecture, not yet a general arbitrary-tool policy language.

The v1.1 adaptive live command should not be described as having produced a real multi-Intent artifact until a real run is captured and committed. Synthetic multi-Intent evidence exists only in tests/fuzzing.

The canonical v1.0 transaction used the local/demo HMAC + filesystem permit path. Ed25519, PostgreSQL replay protection and durable execution are separately implemented/tested production-oriented controls; that historical transaction did not exercise every one of them.

## Repository map

```text
contracts/          Minimal ProofGateVendor contract
src/core/           Action + Mandate contracts
src/telegraph/      Intent planning/routing, live client, bundles, x402 policy
src/evidence/       Evidence normalization/storage/runtime attestation
src/policy/         strict, attested-vendor and adaptive policies
src/permit/         permit commitment/signing/verification
src/executor/       controlled + durable execution and replay protection
src/sdk/            developer-facing ProofGate authorization SDK
src/gateway/        protected payment gateway internals
src/receipt/        Proof Receipt v2/v3
src/security/       attack lab and safety controls
migrations/         PostgreSQL replay/execution/spend schemas
scripts/            live proof, adaptive proof, gateway and security tooling
tests/              deterministic regression/security tests
docs/               architecture, demo, integration and proof documentation
```

## Read next

- `docs/ARCHITECTURE.md` — full trust-boundary design
- `docs/DEVELOPER_INTEGRATION.md` — put ProofGate in front of another agent
- `docs/HACKATHON_DEMO.md` — judge-facing demo sequence
- `docs/LIVE_EXECUTION.md` — canonical real v1.0 transaction
- `docs/V1_1_COMPETITIVE_PLAN.md` — v1.1 design decisions/status
- `docs/ATTACK_LAB.md` — defensive testing model

## Principle

**Telegraph answers what the outside world says. The principal defines what the agent may do. ProofGate decides whether that exact evidence plus that exact authority is enough to permit this exact action.**
