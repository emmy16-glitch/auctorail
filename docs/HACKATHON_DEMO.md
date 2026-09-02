# ProofGate Hackathon Demo Runbook

This is the judge-facing presentation path for the Telegraph Protocol **Application Track**.

## One-line thesis

> **AI agents can decide what they want to do. ProofGate decides how much independent intelligence the consequence deserves, and whether that evidence plus delegated authority is enough to permit the exact action.**

```text
MANDATE → PROPOSE → FREEZE → RISK → TELEGRAPH INTENTS → EVIDENCE BUNDLE → POLICY → PERMIT → EXECUTE → RECEIPT
```

## Two proof layers — show them honestly

### A. v1.0 real execution proof

Already completed and publicly verifiable:

- Base Sepolia (`84532`)
- 1 Base Sepolia USDC
- vendor `0xB38d0405DF1b15961aEf29C7c45f2ED285822c14`
- Telegraph Miner `Refut On-Chain Risk` (`95822412`)
- Intent `FRAUD_DETECTION`
- verdict `ALLOW`, confidence `0.7`
- signal hash `0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c`
- transaction `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc`
- block `46301208`
- receipt hash `0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3`

Basescan:

https://sepolia.basescan.org/tx/0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc

This proves the core control plane can turn genuine Telegraph evidence + delegated authority into one real protected on-chain execution.

### B. v1.1 adaptive authorization

The competitive layer adds:

- LOW / MEDIUM / HIGH consequence tiers
- provider-neutral Telegraph Intent routing
- multi-Intent Evidence Bundles
- per-request + aggregate x402 verification budgets
- evidence deadlines
- explicit negative/uncertain conflict semantics
- risk-tier downgrade prevention
- bundle-aware permit/executor
- Proof Receipt v3
- trusted developer SDK
- evaluate-only HTTP gateway

**Do not claim the historical v1.0 transaction used v1.1 multi-Intent routing. It did not.**

## Before recording

On the exact revision being presented:

```bash
npm ci
npm run ci
npm run audit:prod
npm run attack:lab
npm run security:fuzz
npm run security:fuzz:adaptive
npm run vendor:verify
```

Never show `.env`, wallet keys, seed/recovery material, signing keys or database credentials.

## Stage 1 — unsafe baseline

```text
Typical agent:
Agent decides → wallet/tool executes
```

Then:

```text
ProofGate:
Agent proposes
      ↓
Standing Mandate
      ↓
Exact frozen action
      ↓
Consequence-derived evidence requirements
      ↓
Telegraph intelligence
      ↓
Deterministic ALLOW / HOLD / BLOCK
      ↓
One-use Permit
      ↓
Controlled execution
```

Say:

> **The component deciding what it wants to do is not allowed to create its own permission.**

## Stage 2 — prove it is not a mock

Open `docs/LIVE_EXECUTION.md` and the Basescan transaction.

Explain:

1. the agent proposed 1 USDC;
2. the exact Action Contract was frozen/hashed;
3. genuine Telegraph `FRAUD_DETECTION` evidence was purchased through x402;
4. ProofGate independently attested the vendor runtime;
5. deterministic policy returned `ALLOW`;
6. a one-use permit was created;
7. the controlled executor sent the transaction;
8. a tamper-evident receipt was produced.

Do not resend the historical payment for theater.

## Stage 3 — standout idea: consequence changes verification

Show only the amount changing.

### 1 USDC

```text
Risk: LOW
Required Intents:
  FRAUD_DETECTION
Fraud confidence floor: 0.70
Evidence budget: 0.015 USDC
```

### 7 USDC

```text
Risk: HIGH
Required Intents:
  FRAUD_DETECTION
  ONCHAIN_TX_LOOKUP
  WALLET_BALANCE_CHECK
Fraud confidence floor: 0.80
Evidence budget: 0.050 USDC
```

Say:

> **The amount did not just change a number. It changed how much independent intelligence ProofGate requires before executable authority can exist.**

## Stage 4 — the agent cannot downgrade its own security

Conceptual attack:

```text
Actual action: 7 USDC
Agent claims:  LOW risk, only FRAUD_DETECTION
```

ProofGate recomputes the plan from the frozen action:

```text
BLOCK / adaptive_plan_downgrade_or_mismatch
```

## Stage 5 — provider-neutral Telegraph routing

```text
Not:
"Use my favorite Miner."

Instead:
"I require ONCHAIN_TX_LOOKUP for this exact address on chain 84532."
```

Telegraph routes the request. ProofGate verifies the actual serving Miner is active, supports the requested Intent and returned explicitly bound evidence.

Show current coverage with:

```bash
bash scripts/discover-telegraph.sh
```

Zero coverage for a required Intent fails closed.

## Stage 6 — Evidence Bundle

For a HIGH action, show:

```text
FRAUD_DETECTION
  routed Miner: ...
  signal hash: ...
  confidence: ...
  evidence spend: ...

ONCHAIN_TX_LOOKUP
  routed Miner: ...
  signal hash: ...
  evidence spend: ...

WALLET_BALANCE_CHECK
  routed Miner: ...
  signal hash: ...
  evidence spend: ...

bundleHash: ...
totalEvidenceSpendRaw: ...
```

Explain two separate guarantees:

- `bundleHash` protects **integrity** after construction;
- the trusted live client establishes **Telegraph provenance/authenticity** before construction.

The production permit-minter never needs to trust an agent-supplied arbitrary bundle.

## Stage 7 — disagreement and uncertainty

Use clearly labeled **synthetic defensive fixtures**.

Known danger:

```text
FRAUD_DETECTION       ALLOW
ONCHAIN_TX_LOOKUP     PASS
WALLET_BALANCE_CHECK  SUSPICIOUS
```

Result:

```text
BLOCK / adaptive_explicit_negative
```

Unknown secondary status:

```text
ONCHAIN_TX_LOOKUP  UNAVAILABLE
```

Result:

```text
HOLD / adaptive_secondary_result_uncertain
```

Say:

> **ProofGate does not turn uncertainty into permission, and it does not let positive evidence vote away a known negative signal.**

## Stage 8 — verification economics

```text
LOW action
Protected value:      1 USDC
Evidence budget:      0.015 USDC
Required Intents:     1

HIGH action
Protected value:      7 USDC
Evidence budget:      0.050 USDC
Required Intents:     3
```

Say:

> **How much independent intelligence should an autonomous system buy before it is allowed to take this consequence?**

The live client checks every x402 quote against the remaining aggregate budget **before paying** and never blindly retries an ambiguous paid request.

## Stage 9 — adversarial proof

Run:

```bash
npm run attack:lab
npm run security:fuzz
npm run security:fuzz:adaptive
```

Validated hardened snapshot:

```text
Vitest:
42/42 test files
210/210 tests

Original fuzz:
1100/1100 adversarial cases contained
100/100 valid controls
0 unauthorized executions
0 uncaught errors

Adaptive fuzz:
1800/1800 adversarial cases contained
100/100 valid controls
0 unauthorized authorizations
0 uncaught errors
```

The adaptive suite covers tier downgrade, missing Intents, negative-signal suppression, confidence/freshness bypass, evidence-budget bypass, bundle tampering, valid-bundle substitution after permit mint, evidence-subject substitution, permit forgery/expiry, action mutation and un-delegated Intents.

The direct test suite additionally covers malformed evidence hashes, x402 evidence-payment provenance and uncertain secondary status.

All fuzzing is offline: zero Telegraph calls, x402 payments and blockchain writes.

## Stage 10 — show another developer can use ProofGate

Open `docs/DEVELOPER_INTEGRATION.md` and `src/sdk/proofgate.ts`.

Recommended integration:

```ts
const result = await authorizePaymentWithEvidence({
  proposal: agentProposal,
  mandate: principalMandate,
  agentId: "my-agent",
  acquire: trustedTelegraphIntentAcquirer,
  signer: permitSigner
});
```

The agent supplies only the proposal. The trusted host owns planning, Telegraph acquisition, policy and permit minting.

Say:

> **ProofGate is not a screen for one procurement agent. It is an authorization boundary another autonomous application can put in front of a consequential payment tool.**

You may also show:

```bash
npm run gateway:serve
```

But explain that this HTTP gateway is intentionally evaluate-only: it does not accept wallet keys, purchase evidence, mint authority or execute funds.

## Optional Stage 11 — live adaptive Telegraph run

Only do this intentionally because it can purchase real testnet evidence.

```bash
bash scripts/discover-telegraph.sh
npm run proof:adaptive -- 7
```

The HIGH path may make up to three real Telegraph/x402 evidence purchases, bounded by the per-request and aggregate policies.

It is **check-only for the protected 7-USDC vendor payment**; it does not broadcast 7 USDC.

If a paid request becomes transport-ambiguous, do not rerun blindly. Reconcile first.

Until a real multi-Intent bundle is captured, never present synthetic test evidence as live Telegraph output.

## Suggested 3-minute video

### 0:00–0:20 — problem
"AI agents can be confident and still be wrong. More importantly, confidence is not authority."

### 0:20–0:45 — real proof
Show the successful v1.0 transaction + receipt.

### 0:45–1:25 — adaptive twist
Show `1 USDC → LOW → 1 Intent`, then `7 USDC → HIGH → 3 Intents`.

### 1:25–1:50 — Telegraph + Evidence Bundle
Show Intent-first routing, bundle hash and bounded x402 verification spend.

### 1:50–2:10 — disagreement
Show `SUSPICIOUS → BLOCK` and `UNAVAILABLE → HOLD`.

### 2:10–2:35 — security proof
Show `1800/1800` adaptive + `1100/1100` original fuzz containment.

### 2:35–3:00 — ecosystem close
Show the trusted developer SDK and finish:

> **Telegraph tells autonomous software what the outside world says. ProofGate decides how much intelligence the consequence deserves and turns sufficient evidence plus delegated authority into one-use permission for one exact action.**

## Claims to make carefully

Safe claims:

- the v1.0 Base Sepolia payment is real and verifiable;
- the v1.0 Telegraph proof was genuine and paid through x402;
- v1.1 implements deterministic adaptive risk planning;
- v1.1 implements provider-neutral multi-Intent acquisition and Evidence Bundles;
- v1.1 enforces per-request + aggregate evidence-payment budgets;
- v1.1 distinguishes negative (`BLOCK`) from uncertain (`HOLD`) evidence;
- another developer can compose the trusted SDK in front of an agent payment tool;
- production-oriented Ed25519/PostgreSQL/durable controls exist and are tested separately.

Do not claim unless a real artifact exists:

- a live three-Intent v1.1 bundle has already been captured;
- the historical transaction used adaptive routing;
- the historical transaction exercised Ed25519/PostgreSQL production paths;
- same-Intent 2-of-3 Miner consensus is implemented;
- ProofGate has undergone an independent production audit;
- a Miner `ALLOW` directly authorizes execution.

## Final freeze process

1. finish implementation/docs on `v1.1-adaptive-evidence`;
2. require green CI on the exact final SHA;
3. run local Termux verification;
4. optionally capture a real adaptive bundle intentionally;
5. rerun all gates after any committed live artifact/docs change;
6. create a new versioned tag — never move `v1.0.0-hackathon`.
