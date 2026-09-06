# Auctorail hackathon demo playbook

This is the judge-facing demonstration script for Auctorail.

The goal is not to show every feature. The goal is to make one security idea unforgettable:

> **AI agents can be capable without being authorized. Auctorail proves authority before execution.**

## What judges should understand by the end

A judge should leave with five clear ideas:

1. The agent proposes an action but does not control the final authority.
2. The principal defines bounded standing permission.
3. Telegraph Miner intelligence is evidence, not permission.
4. Auctorail binds authorization to one exact action and returns `ALLOW`, `HOLD`, or `BLOCK`.
5. Only an executable `ALLOW` can produce short-lived one-use authority for the protected executor.

If those five ideas are clear, the demo succeeded.

## The strongest one-line pitch

> **Intelligence tells an agent what it knows. Auctorail determines what it is allowed to do.**

## Recommended demo structure

Use two layers:

```text
Part 1 — deterministic product demo
Part 2 — real Telegraph/x402 + Base Sepolia proof
```

The deterministic demo communicates the security property reliably. The real proof demonstrates that the architecture is connected to genuine external evidence and protected execution.

## 60-second demo

### 0:00–0:08 — Problem

Show the Home screen.

Say:

> AI agents can already call tools and move value. But being capable of taking an action is not the same as being authorized to take it.

Point to the product statement:

```text
Prove authority before execution.
```

### 0:08–0:13 — Product

Say:

> Auctorail sits between the agent and the protected executor. The agent proposes; Auctorail checks delegated authority and required evidence before anything can execute.

Open **Watch Demo**.

### 0:13–0:24 — Valid request

Let the valid scenario run.

Explain:

> This agent is allowed to request the payment. The exact action is frozen, the checks pass, one-use authority is created, and the demo execution succeeds.

Do not over-explain every hash.

### 0:24–0:34 — Amount mutation

Show the modified-amount scenario.

Say:

> Now the authorized request was for 1 USDC, but the attempted action changes it to 2. Same agent and same vendor, but it is a different action. Auctorail blocks it.

This is one of the most important moments in the demo.

### 0:34–0:43 — Permit replay

Show the replay scenario.

Say:

> A successful authorization is not a reusable credential. Once the permit is consumed, replay is blocked.

### 0:43–0:52 — Missing evidence

Show the missing-evidence scenario.

Say:

> Here the action may be inside standing authority, but the required evidence is incomplete. Auctorail does not guess. It returns HOLD and issues no execution authority.

### 0:52–1:00 — Real proof

Switch to Verify/real-proof material or the canonical execution reference.

Say:

> The same architecture has a real payment lane. The repository contains genuine Telegraph/x402 fraud evidence and a protected 1-USDC Base Sepolia execution with a public transaction and receipt.

End with:

> Intelligence is evidence. Auctorail is the authorization rail.

## 2-minute demo

If more time is available, use this order.

### 1. Home — 20 seconds

Explain the problem and product.

### 2. Permissions — 15 seconds

Show that authority originates with principal-facing limits/recipient configuration.

Important wording:

> This public screen is the hackathon control surface. In a production integration, authoritative Mandates live on the trusted service side, not as an agent-controlled field.

### 3. Deterministic Watch Demo — 45 seconds

Show:

```text
valid action       → ALLOW/executed demo
amount mutation    → BLOCK
permit replay      → BLOCK
missing evidence   → HOLD
```

### 4. Live architecture — 20 seconds

Explain the LOW-risk path:

```text
FRAUD_DETECTION
exact recipient
Base Sepolia 84532
confidence >= 0.70
signal hash required
bounded attempts/spend
12-second evidence window
```

Mention that the shorter bounded window prevents an unavailable upstream Miner from leaving the product hanging indefinitely.

### 5. Real proof — 20 seconds

Show canonical evidence/transaction/Verify surface.

## 5-minute technical demo

### Minute 1 — Problem + product

Use `PRODUCT_STORY.md` framing.

### Minute 2 — Deterministic attack scenarios

Show exact-action mutation, replay and missing evidence.

### Minute 3 — Telegraph evidence architecture

Explain:

- Intent routing;
- exact subject/chain binding;
- confidence floor;
- signal commitment;
- distinct-Miner quorum;
- x402 budget;
- `HOLD` on missing proof.

### Minute 4 — Permit + executor

Explain:

- short-lived signed permit;
- exact action/decision/evidence binding;
- one-use consumption;
- execution-time Mandate revalidation;
- ambiguity/reconciliation.

### Minute 5 — Real artifacts + verification

Show the canonical public evidence and transaction.

## Canonical real payment proof

Use these facts consistently:

| Field | Canonical value |
| --- | --- |
| Network | Base Sepolia (`84532`) |
| Payment | `1 USDC` |
| Telegraph Intent | `FRAUD_DETECTION` |
| Miner | Refut On-Chain Risk (`95822412`) |
| Verdict | `ALLOW` |
| Confidence | `0.70` |
| Evidence cost | `$0.01` via x402 for canonical evidence |
| Signal hash | `0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c` |
| Transaction | `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc` |
| Block | `46301208` |
| Receipt hash | `0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3` |

Publicly committed real totals currently documented:

```text
2 Telegraph Miner acquisitions
$0.02 committed x402 evidence cost
1 protected Base Sepolia execution
```

Do not inflate those counts with deterministic demo/test activity.

## What not to do in the live demo

### Do not wait 30+ seconds on a spinner

The current LOW evidence window is 12 seconds, not 35 seconds.

If a live Miner route is unavailable, the request should fail closed as `HOLD`. Do not make a judge watch repeated live retries just to prove the system is “real.”

### Do not weaken policy to get an ALLOW

Never change confidence/binding/quorum rules immediately before a demo merely to force a positive result.

A safe `HOLD` is more credible than a fake `ALLOW`.

### Do not start with deep technical terminology

Do not open with:

```text
Mandate commitment
quorum aggregation
x402 settlement reconciliation
```

Start with:

> The agent wants to act. Auctorail checks whether it is allowed.

Then explain technical depth after the audience understands the problem.

### Do not claim deterministic demo traffic is real Telegraph usage

Keep the distinction visible.

## How to explain `HOLD`

Best phrasing:

> HOLD means Auctorail cannot prove this action is safe enough to authorize with the required evidence right now, so no execution authority is issued.

Avoid:

> HOLD means the transaction is probably okay.

That is incorrect.

## How to explain Telegraph

Use:

> Telegraph gives Auctorail specialized external intelligence. Auctorail verifies that the returned evidence belongs to this exact action and uses deterministic policy to decide whether that evidence is sufficient inside the human's delegated authority.

Do not say:

> Telegraph authorizes the transaction.

Telegraph provides evidence; Auctorail makes the authorization decision.

## How to explain the difference from a Miner dashboard

If another project offers a web/MCP interface to useful Miners, do not attack it. Explain the layer difference:

> A Miner or intelligence product helps an agent know something. Auctorail is the enforcement layer that determines whether the agent may turn that information into a protected external action.

This makes Auctorail complementary to specialized intelligence providers.

## Judge questions and concise answers

### “Why can't the agent just call the Miner itself?”

Because a Miner response does not define what the human authorized. Auctorail combines principal authority, exact-action binding, required evidence and deterministic policy before execution.

### “Why not put the spending limit in the system prompt?”

Because prompts are not a reliable security boundary. Trusted server-side policy and protected credentials are outside the model's control.

### “What happens if Telegraph is down?”

Required evidence is unavailable, so the action fails closed as `HOLD`. The LOW path is time-bounded so the user is not left waiting indefinitely.

### “What if the agent changes the payment after approval?”

The canonical action changes. The old decision/permit no longer binds to the attempted action.

### “Can the same permit pay twice?”

No. Permits are one-use and replay is rejected.

### “Does stronger evidence let the agent spend more?”

No. Evidence cannot expand principal authority or bypass the current policy's 10-USDC autonomous execution ceiling.

### “Is the entire app real/live?”

The product deliberately separates deterministic demo surfaces from live external-effect paths. The payment lane has genuine Telegraph/x402 evidence and a protected Base Sepolia execution. We do not claim every demo path has already been exercised live.

## Demo recording for X

Recommended length: **45–60 seconds**.

Use 1080p if possible.

Keep cursor movement deliberate.

Let each result state remain visible long enough to read.

Suggested shot order:

```text
Home
→ Watch Demo
→ valid request
→ changed amount BLOCK
→ replay BLOCK
→ missing evidence HOLD
→ Verify / real transaction proof
```

## Suggested X narration

> AI agents are becoming capable of taking real actions, but capability isn't authority. This is Auctorail. Before an agent executes, Auctorail freezes the exact action, checks what the human actually delegated, and verifies the required external evidence. A valid action can receive one-use execution authority. Change the amount after approval and it's blocked. Replay a permit and it's blocked. If required evidence is missing, Auctorail holds instead of guessing. The payment lane is connected to real Telegraph/x402 evidence and a protected Base Sepolia execution. Intelligence tells agents what they know. Auctorail determines what they're allowed to do.

## Pre-demo checklist

Before recording/presenting:

- [ ] use current `main` or known deployment commit;
- [ ] confirm deterministic Watch Demo works end-to-end;
- [ ] confirm mobile/desktop layout at intended recording size;
- [ ] confirm no stale ProofGate product copy is visible;
- [ ] confirm Verify/public proof is accessible;
- [ ] confirm live mode is clearly distinguished from deterministic demo;
- [ ] do not expose private keys or secret environment values;
- [ ] if live mode is used, confirm burner wallet/evidence budget first;
- [ ] know the current LOW deadline is 12 seconds;
- [ ] use the exact public transaction/evidence facts from `LIVE_EXECUTION.md`.

## Final demo principle

**Show the enforcement, not just the intelligence. Auctorail is most compelling when the audience sees that a valid action can proceed, a changed action cannot, a permit cannot be replayed, and missing evidence does not become permission.**
