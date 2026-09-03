# ProofGate Hackathon Demo Runbook

This is the judge-facing presentation path for the Telegraph Protocol **Application Track**.

## One-line thesis

> **AI agents can decide what they want to do. ProofGate decides how much breadth and independence of external intelligence the consequence deserves, then turns sufficient evidence plus delegated authority into one-use permission for one exact action.**

```text
MANDATE → PROPOSE → FREEZE → CONSEQUENCE
        → TELEGRAPH INTENTS + MINER DIVERSITY
        → EVIDENCE COMMITMENT
        → ALLOW / HOLD / BLOCK
        → ONE-USE PERMIT
        → CONTROLLED EXECUTION
```

## The three proof layers — keep them separate

### A. v1.0 — real end-to-end execution

Already completed and publicly verifiable:

- Base Sepolia (`84532`)
- 1 Base Sepolia USDC
- vendor `0xB38d0405DF1b15961aEf29C7c45f2ED285822c14`
- genuine Telegraph Miner `Refut On-Chain Risk` (`95822412`)
- Intent `FRAUD_DETECTION`
- verdict `ALLOW`, confidence `0.7`
- signal hash `0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c`
- transaction `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc`
- block `46301208`
- receipt hash `0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3`

Basescan:

https://sepolia.basescan.org/tx/0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc

This proves ProofGate can combine real Telegraph evidence + delegated authority + a one-use Permit to control a real external effect.

### B. v1.2 — adaptive multi-Intent + multi-Miner authorization

This is the standout Telegraph layer.

ProofGate now scales two dimensions of intelligence with consequence:

- **vertical diversity** — more kinds of intelligence;
- **horizontal diversity** — more independent Miners for the same critical Intent.

### C. v1.2 — general authorization core

Payments are the first concrete real adapter, not the architectural limit.

The generic v1.2 core provides:

- `proofgate.action.v2`
- `proofgate.mandate.v2`
- `proofgate.decision.v2`
- `proofgate.permit.v2`
- trusted `ActionAdapterRegistry`
- execution-time Mandate revalidation
- fail-closed kill switch
- atomic replay protection
- `AMBIGUOUS` handling for uncertain external effects

Do not claim example GitHub/cloud/database adapters are already production integrations. The adapter framework is implemented and tested; developers still supply trusted integration-specific code.

## Before recording

Use the exact revision being presented:

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

Never show `.env`, wallet keys, seed/recovery material, Permit-signing keys or database credentials.

## Stage 1 — show the unsafe baseline

```text
Typical autonomous system:
Agent decides → tool executes
```

Then show:

```text
ProofGate:
Agent proposes
      ↓
Principal Mandate
      ↓
Exact frozen action
      ↓
Consequence-derived evidence requirements
      ↓
Telegraph intelligence + provider diversity
      ↓
Deterministic ALLOW / HOLD / BLOCK
      ↓
One-use Permit
      ↓
Controlled executor
```

Say:

> **The component deciding what it wants to do is not allowed to create its own permission.**

## Stage 2 — prove it is not a mock

Open `docs/LIVE_EXECUTION.md` and the Basescan transaction.

Explain:

1. the agent proposed 1 USDC;
2. ProofGate froze and hashed the exact action;
3. genuine Telegraph `FRAUD_DETECTION` evidence was purchased through x402;
4. ProofGate independently verified the vendor runtime;
5. deterministic policy returned `ALLOW`;
6. a one-use Permit was created;
7. the controlled executor submitted exactly that payment;
8. a tamper-evident Proof Receipt was produced.

Do **not** resend the historical transaction for theater.

## Stage 3 — the amount changes the evidence graph

Show only the protected amount changing.

### 1 USDC — LOW

```text
FRAUD_DETECTION
    ↓
1 distinct Miner
1 positive required
confidence >= 0.70

Evidence budget: 0.015 USDC
Deadline: 15 s
```

### 4 USDC — MEDIUM

```text
FRAUD_DETECTION
   ├─ Miner A
   └─ Miner B
2 distinct / 2 positive required
confidence >= 0.75
max 4 bounded fraud attempts

+ ONCHAIN_TX_LOOKUP

Evidence budget: 0.050 USDC
Deadline: 35 s
```

### 7 USDC — HIGH

```text
FRAUD_DETECTION
   ├─ Miner A
   ├─ Miner B
   └─ Miner C
3 distinct Miners
2 positive votes required
confidence >= 0.80
max 5 bounded fraud attempts

+ ONCHAIN_TX_LOOKUP
+ WALLET_BALANCE_CHECK

Evidence budget: 0.070 USDC
Deadline: 60 s
```

Say:

> **The amount does not merely change a number. It changes both how many kinds of intelligence ProofGate needs and how independently the most important claim must be corroborated.**

## Stage 4 — duplicate routing is not fake consensus

Show this synthetic defensive scenario:

```text
FRAUD_DETECTION
attempt 1 → Miner A → ALLOW
attempt 2 → Miner A → ALLOW
attempt 3 → Miner B → ALLOW

Requests:         3
Distinct Miners:  2
Required:         3

Result: HOLD
```

Say:

> **Three responses are not three independent opinions if Telegraph served the same provider twice. ProofGate counts distinct Miner identity, not request count.**

This is important: ProofGate does not fabricate provider independence.

## Stage 5 — quorum is not naive majority voting

Synthetic defensive scenario:

```text
Miner A → ALLOW     0.93
Miner B → ALLOW     0.86
Miner C → MALICIOUS 0.97
```

Result:

```text
BLOCK
```

MEDIUM/HIGH collection has a `0.90` high-confidence negative early veto. Final policy is stricter: **any explicit known-negative result remains BLOCK**, even if it is below that early-veto threshold.

Say:

> **A dangerous signal cannot be averaged away just because two other providers were optimistic.**

## Stage 6 — the agent cannot downgrade its own security

Attack:

```text
Actual action: 7 USDC
Agent submits: LOW
Agent requests: only one FRAUD_DETECTION response
Agent lowers quorum/confidence/budget rules
```

ProofGate recomputes the complete expected plan from the exact frozen action.

Expected:

```text
BLOCK / adaptive_plan_downgrade_or_mismatch
```

The agent cannot choose its authoritative risk tier, quorum size, confidence floor, attempt ceiling or evidence budget.

## Stage 7 — provider-neutral Telegraph routing

Show:

```text
Not:
"ProofGate always trusts Miner X."

Instead:
"ProofGate requires FRAUD_DETECTION for this exact subject."
```

Telegraph routes the request. ProofGate records and verifies the actual Miner returned.

For same-Intent quorum, ProofGate makes bounded additional requests. Repeated provider identity does not count as additional independence.

Refresh current coverage before a live run:

```bash
bash scripts/discover-telegraph.sh
```

If sufficient evidence/provider diversity cannot be established within the configured attempt, spend and deadline bounds, the result is `HOLD`.

## Stage 8 — Evidence Bundle and verification economics

For the adaptive payment path, show the Evidence Bundle containing:

```text
Exact action hash
Risk tier
Plan hash

FRAUD_DETECTION attempt 1
  Miner ID
  label/confidence
  signal hash
  x402 evidence cost

FRAUD_DETECTION attempt 2
  ...

FRAUD_DETECTION attempt 3
  ...

ONCHAIN_TX_LOOKUP
  ...

WALLET_BALANCE_CHECK
  ...

Canonical quorum summaries
Total evidence spend
Bundle hash
```

Explain:

- bundle hash protects **integrity** after construction;
- trusted live acquisition establishes **Telegraph provenance** before construction;
- the one-use Permit commits the exact evidence decision;
- changing a Miner identity/vote/quorum summary later invalidates the authorization chain.

Then ask the product question:

> **How much independent intelligence should an autonomous system be willing to purchase before it is allowed to take this consequence?**

The evidence budget is bounded. A more consequential action may justify more verification spend, but ProofGate never gives the evidence collector an unlimited wallet.

## Stage 9 — show ProofGate is no longer payment-only architecture

Open:

- `src/core/general-action.ts`
- `src/core/general-mandate.ts`
- `src/permit/general-permit.ts`
- `src/sdk/action-adapter.ts`
- `src/executor/general-executor.ts`

Show a simple custom adapter example from `docs/DEVELOPER_INTEGRATION.md`:

```text
coding-agent proposes github.merge
        ↓
proofgate.action.v2
        ↓
principal Mandate permits exact repo/target
        ↓
required evidence: CI_STATUS + SECURITY_SCAN
        ↓
trusted adapter commits/verifies evidence
        ↓
proofgate.decision.v2
        ↓
proofgate.permit.v2
        ↓
kill switch + current Mandate + atomic Permit claim
        ↓
trusted adapter.execute()
```

Say:

> **The payment is our first real demonstrated adapter. The authorization runtime itself is now action-general. Other developers register trusted adapters for the consequential tools their agents use.**

Be explicit that the GitHub example is an SDK example, not a live GitHub integration claim.

## Stage 10 — show adapter bypass protections

Explain four small details judges may not expect:

```text
Undelegated action
→ BLOCK before paid evidence acquisition

Missing required evidence-Intent coverage
→ HOLD, no Permit

Mandate expires after Permit mint but before execution
→ BLOCK at execution-time revalidation

External effect throws after Permit claim
→ AMBIGUOUS; Permit remains consumed; no blind retry
```

Also show the fail-closed execution kill switch:

```text
kill switch disabled?  BLOCK
kill switch unreadable? BLOCK
```

This proves the generic architecture is an enforcement boundary, not only a data structure.

## Stage 11 — adversarial proof

Run:

```bash
npm run attack:lab
npm run security:fuzz
npm run security:fuzz:adaptive
npm run security:fuzz:general
```

Current validated pre-documentation code snapshot:

```text
Vitest
43/43 test files
225/225 tests

Original exact-action fuzz
1100/1100 contained
100/100 valid controls
0 unauthorized executions

Adaptive + Miner-quorum fuzz
3100/3100 contained
100/100 valid controls
0 unauthorized authorizations

General authorization fuzz
3100/3100 contained
100/100 valid controls
0 unauthorized executions

Total deterministic adversarial cases: 7300/7300
Uncaught fuzz errors: 0
Production npm audit: 0 vulnerabilities
```

Every fuzz harness is offline: zero Telegraph calls, zero x402 payments and zero blockchain writes.

Do not call this an independent production audit. It is a deterministic security validation suite for the implemented invariants.

## Optional Stage 12 — live adaptive/quorum attempt

Only do this intentionally because it can purchase real testnet evidence.

```bash
bash scripts/discover-telegraph.sh
npm run proof:adaptive -- 7
```

The HIGH path can make multiple real Telegraph/x402 evidence requests while trying to satisfy the three-distinct-Miner fraud quorum plus the additional Intents. Every request remains subject to per-request, aggregate spend, attempt and deadline limits.

`proof:adaptive` remains **check-only for the protected vendor payment**. It does not broadcast the 7-USDC vendor payment.

Until a real successful multi-Miner artifact is captured, never present synthetic fuzz/test fixtures as live Telegraph quorum evidence.

## Suggested 3-minute video

### 0:00–0:20 — thesis

> "AI agents can be confident and still be wrong. More importantly, confidence is not authority."

### 0:20–0:40 — real proof

Show the genuine v1.0 Telegraph evidence, Basescan transaction and receipt.

### 0:40–1:20 — consequence-adaptive evidence

Animate/show:

```text
1 USDC → 1 Miner / 1 Intent
4 USDC → 2 independent fraud Miners + tx intelligence
7 USDC → 3 independent fraud Miners + 2-of-3 positive quorum + 3 Intents
```

### 1:20–1:45 — anti-fake-consensus

Show duplicate Miner not counting, then high-confidence negative veto / explicit negative BLOCK.

### 1:45–2:05 — cryptographic/economic binding

Show Evidence Bundle, quorum summary, x402 evidence budget and one-use Permit.

### 2:05–2:30 — general authorization platform

Show `github.merge` adapter example and explain payment is the first proven adapter, not the architectural limit.

### 2:30–2:50 — security proof

Show:

```text
7300 / 7300 adversarial cases contained
225 / 225 tests
0 unauthorized executions / authorizations
0 production dependency vulnerabilities
```

### 2:50–3:00 — close

> **Telegraph tells autonomous software what the outside world says. ProofGate decides how much breadth and independence of intelligence the consequence deserves, and turns sufficient evidence plus delegated authority into one-use permission for one exact action.**

## Claims to make carefully

Safe claims:

- the v1.0 Base Sepolia USDC transaction is real and publicly verifiable;
- the v1.0 Telegraph fraud evidence was genuine and purchased through x402;
- v1.2 implements deterministic risk-derived same-Intent distinct-Miner quorum;
- v1.2 implements provider-neutral multi-Intent Evidence Bundles;
- duplicate Miner responses do not count as independent providers;
- v1.2 implements a general action/Mandate/decision/Permit/executor core;
- other developers can register trusted action adapters;
- all current deterministic test/fuzz gates pass on the validated code snapshot;
- production-oriented Ed25519/PostgreSQL controls exist and are tested separately from the historical live tx.

Do **not** claim unless a corresponding real artifact/integration exists:

- a successful real three-Miner Telegraph quorum has already been captured;
- the historical v1.0 transaction used quorum/adaptive routing;
- the historical transaction used Ed25519/PostgreSQL production paths;
- the example GitHub/cloud/database adapters are live production integrations;
- arbitrary third-party adapters are sandboxed/safe;
- ProofGate has undergone an independent production audit;
- a Miner `ALLOW` directly authorizes execution.

## Final freeze process

1. finish v1.2 code/docs on `v1.2-general-quorum`;
2. require GitHub CI green on the exact final SHA;
3. run local Termux verification;
4. optionally capture live quorum evidence only as a deliberate paid test;
5. rerun every gate after any committed live artifact;
6. create a new immutable v1.2 tag; never move v1.0/v1.1 tags.
