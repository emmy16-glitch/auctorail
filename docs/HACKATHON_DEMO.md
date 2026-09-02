# ProofGate Hackathon Demo Runbook

This is the judge-facing presentation path for the Telegraph Protocol **Application Track**.

## One-line thesis

> **AI agents can decide what they want to do. ProofGate decides how much independent intelligence the consequence deserves, and whether that evidence plus delegated authority is enough to permit the exact action.**

The v1.1 flow is:

```text
MANDATE → PROPOSE → RISK → TELEGRAPH INTENTS → EVIDENCE BUNDLE → POLICY → PERMIT → EXECUTE → RECEIPT
```

## Two proof layers to show honestly

The submission has two complementary artifacts.

### A. v1.0 real execution proof

Already completed and publicly verifiable:

- network: Base Sepolia (`84532`)
- asset: Base Sepolia USDC
- amount: **1 USDC**
- destination: `0xB38d0405DF1b15961aEf29C7c45f2ED285822c14`
- Telegraph Miner: `Refut On-Chain Risk` (`95822412`)
- Intent: `FRAUD_DETECTION`
- verdict: `ALLOW`
- confidence: `0.7`
- signal hash: `0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c`
- policy: `payments.attested-vendor.v1`
- transaction: `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc`
- block: `46301208`
- receipt hash: `0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3`

Basescan:

https://sepolia.basescan.org/tx/0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc

This proves ProofGate can turn real Telegraph evidence + delegated authority into a real protected on-chain execution.

### B. v1.1 adaptive authorization architecture

The new path adds:

- LOW / MEDIUM / HIGH consequence tiers
- provider-neutral Telegraph Intent routing
- multi-Intent Evidence Bundles
- aggregate x402 verification-spend budgets
- evidence latency budgets
- explicit conflict semantics
- risk-tier downgrade prevention
- Proof Receipt v3
- developer SDK / evaluate-only gateway

Do **not** claim the historical v1.0 transaction used three Intents. It did not.

## Before recording

On the exact branch/revision you will present:

```bash
npm ci
npm run ci
npm run audit:prod
npm run attack:lab
npm run security:fuzz
npm run security:fuzz:adaptive
npm run vendor:verify
```

On Linux x64, CI additionally runs the pinned vendor recompilation. On Android/Termux ARM, `vendor:verify` is the correct local command.

Never expose `.env`, private keys, recovery material, permit-signing keys or database credentials on screen.

## Stage 1 — show the unsafe baseline

Use one slide/terminal diagram:

```text
Typical autonomous agent:

Agent decides → wallet/tool executes
```

Then:

```text
ProofGate:

Agent proposes
      ↓
Standing Mandate
      ↓
Risk-derived evidence requirements
      ↓
Telegraph intelligence
      ↓
Deterministic authorization
      ↓
One-use Permit
      ↓
Controlled execution
```

Key line:

> The component deciding what it wants to do is not allowed to create its own permission.

## Stage 2 — prove this is not a mock project

Show `docs/LIVE_EXECUTION.md` and the Basescan transaction.

Explain briefly:

1. the agent proposed **1 USDC** to the canonical vendor;
2. the exact Action Contract was hashed;
3. real Telegraph `FRAUD_DETECTION` evidence was purchased through x402;
4. ProofGate independently attested the vendor runtime;
5. deterministic policy returned `ALLOW`;
6. a one-use permit was created;
7. the protected executor sent the real Base Sepolia transaction;
8. ProofGate produced a tamper-evident receipt.

Do not resend the 1-USDC transaction for theater.

## Stage 3 — the standout idea: consequence changes verification

Show two proposals that differ only by amount.

### Proposal A

```text
1 USDC → canonical vendor
```

Expected plan:

```text
Risk: LOW
Required Intents:
  FRAUD_DETECTION
Fraud confidence floor: 0.70
Max evidence spend: 0.015 USDC
```

### Proposal B

```text
7 USDC → same canonical vendor
```

Expected plan:

```text
Risk: HIGH
Required Intents:
  FRAUD_DETECTION
  ONCHAIN_TX_LOOKUP
  WALLET_BALANCE_CHECK
Fraud confidence floor: 0.80
Max evidence spend: 0.050 USDC
```

Key line:

> The amount did not just change a number. It changed how much independent intelligence ProofGate requires before authority can exist.

This is the main v1.1 differentiator.

## Stage 4 — show the agent cannot downgrade itself

Explain that ProofGate recomputes the adaptive plan from the frozen Action Contract.

Attempt conceptually:

```text
Action: 7 USDC
Agent-supplied claim: LOW risk, only FRAUD_DETECTION
```

Result:

```text
BLOCK / adaptive_plan_downgrade_or_mismatch
```

The model does not choose its own security requirements.

## Stage 5 — Telegraph provider-neutral routing

Explain the new mental model:

```text
ProofGate does NOT say:
"Give me my favorite Miner."

ProofGate says:
"I require ONCHAIN_TX_LOOKUP for this exact address on chain 84532."

Telegraph routes the request.
ProofGate verifies the Miner that actually served it.
```

Show the live Miner coverage discovered by:

```bash
bash scripts/discover-telegraph.sh
```

If a required Intent has zero active Miner coverage, the adaptive workflow stops rather than silently reducing security.

## Stage 6 — Evidence Bundle

Show the conceptual bundle:

```text
HIGH-risk 7 USDC action
        |
        +-- FRAUD_DETECTION
        |     Miner: routed by Telegraph
        |     signalHash: ...
        |     confidence: ...
        |     x402 spend: ...
        |
        +-- ONCHAIN_TX_LOOKUP
        |     Miner: routed by Telegraph
        |     signalHash: ...
        |     x402 spend: ...
        |
        +-- WALLET_BALANCE_CHECK
              Miner: routed by Telegraph
              signalHash: ...
              x402 spend: ...

bundleHash: 0x...
total evidence spend: ...
```

Explain that the permit commits the bundle hash. Swapping in different evidence afterward invalidates authorization.

## Stage 7 — conflict demonstration

Use a **clearly labeled synthetic defensive fixture**, not fake live Telegraph output.

Example:

```text
FRAUD_DETECTION       ALLOW
ONCHAIN_TX_LOOKUP     PASS
WALLET_BALANCE_CHECK  SUSPICIOUS
```

ProofGate result:

```text
BLOCK / adaptive_explicit_negative
```

Key line:

> ProofGate does not average away known danger. Two positive signals cannot outvote an explicit required negative signal.

## Stage 8 — verification economics

Show why x402 matters to the product:

```text
LOW action
Protected value:      1 USDC
Evidence budget:      0.015 USDC
Required requests:    1

HIGH action
Protected value:      7 USDC
Evidence budget:      0.050 USDC
Required requests:    3
```

Key line:

> ProofGate answers a new machine-economics question: how much independent intelligence should an autonomous system buy before it is allowed to take this consequence?

The live client checks each x402 quote against the **remaining aggregate evidence budget before paying** and does not blindly retry an ambiguous paid request.

## Stage 9 — security proof

Run:

```bash
npm run attack:lab
npm run security:fuzz
npm run security:fuzz:adaptive
```

Current deterministic gates are designed to show:

```text
Original fuzz:
1,100/1,100 adversarial cases contained
100/100 valid controls
0 unauthorized executions

Adaptive fuzz:
1,800/1,800 adversarial cases contained
100/100 valid controls
0 unauthorized authorizations
0 uncaught errors
```

Adaptive fuzz includes:

- tier downgrade
- missing Intents
- negative-signal suppression
- confidence/freshness bypass
- x402 evidence-budget overrun
- Evidence Bundle tampering
- substitution of another valid bundle after permit mint
- permit forgery/expiry
- action mutation
- un-delegated Intent

All fuzzing is offline: no Telegraph calls, x402 payments or blockchain writes.

## Stage 10 — show ProofGate is reusable

Open `docs/DEVELOPER_INTEGRATION.md` or a short code example from `src/sdk/proofgate.ts`.

Explain:

> ProofGate is not hardcoded as a screen for my procurement agent. Another developer can put the SDK or evaluate-only gateway in front of an agent that wants to make Base Sepolia USDC payments.

Show:

```bash
npm run gateway:serve
```

Then explain the safe boundary:

- `/v1/plan` returns the Action Contract + risk-derived plan
- `/v1/evaluate` returns `ALLOW/HOLD/BLOCK` + counterfactual
- the HTTP gateway does **not** accept wallet keys
- it does **not** buy evidence
- it does **not** mint production authority
- it does **not** execute funds

A full trusted deployment composes the SDK, live Telegraph client, secure signer, shared replay store and controlled executor.

## Optional Stage 11 — real live adaptive Telegraph run

Only do this if you intentionally want to purchase fresh evidence and are ready to preserve the result.

Refresh coverage:

```bash
bash scripts/discover-telegraph.sh
```

LOW:

```bash
npm run proof:adaptive -- 1
```

HIGH standout path:

```bash
npm run proof:adaptive -- 7
```

The HIGH command may make up to three real Telegraph/x402 evidence purchases. It is **check-only** for the protected vendor payment: it does not broadcast 7 USDC.

If the paid path reports transport ambiguity, **do not blindly rerun it**. Inspect/reconcile the saved state first.

Until a successful live multi-Intent bundle is captured, do not describe synthetic test bundles as live Telegraph evidence.

## Suggested 3-minute video

### 0:00–0:20 — problem

"AI agents can be confident and still be wrong. More importantly, confidence is not authority. ProofGate separates deciding from permission to act."

### 0:20–0:45 — real proof

Show the existing successful 1-USDC Basescan transaction and receipt. Establish that the control plane really executed once after genuine Telegraph proof.

### 0:45–1:25 — adaptive twist

Show `1 USDC → LOW → 1 Intent`, then `7 USDC → HIGH → 3 Intents`.

Say:

> "ProofGate dynamically decides how much intelligence the consequence deserves."

### 1:25–1:55 — Telegraph + Evidence Bundle

Show provider-neutral Intent routing, bundle hash and aggregate x402 evidence budget.

### 1:55–2:15 — disagreement

Turn one synthetic required signal to `SUSPICIOUS` and show deterministic `BLOCK`.

### 2:15–2:40 — adversarial proof

Show `1,800/1,800` adaptive fuzz cases contained plus the original `1,100/1,100` suite.

### 2:40–3:00 — ecosystem / close

Show the developer SDK/gateway and finish:

> **Telegraph tells autonomous software what the outside world says. ProofGate decides how much intelligence the consequence deserves and turns sufficient evidence plus delegated authority into one-use permission for one exact action.**

## Claims to make carefully

Safe:

- the canonical v1.0 Base Sepolia payment is real and publicly verifiable;
- the canonical v1.0 Telegraph proof was genuine and used x402;
- v1.1 implements deterministic adaptive risk planning and multi-Intent Evidence Bundles;
- adaptive Intent routing is provider-neutral in the v1.1 live client;
- the live adaptive command can purchase routed evidence while remaining check-only for the protected payment;
- the adaptive and original fuzz suites are offline deterministic security tests;
- production-oriented Ed25519, PostgreSQL replay state, durable intent and cumulative-spend controls exist separately from the historical demo execution.

Do not claim unless a real artifact exists:

- that a live v1.1 three-Intent Evidence Bundle has already been captured;
- that the historical v1.0 transaction used adaptive routing;
- that the historical transaction exercised PostgreSQL + Ed25519 production paths;
- that ProofGate has undergone an independent production audit;
- that a favorable Miner result directly authorizes execution.

## Final freeze process

1. finish all implementation/docs changes on `v1.1-adaptive-evidence`;
2. run CI against the exact final SHA;
3. run local Termux validation;
4. capture a live adaptive bundle only if desired and safe;
5. rerun CI after any committed live artifact/docs change;
6. create a new versioned tag rather than changing `v1.0.0-hackathon`.
