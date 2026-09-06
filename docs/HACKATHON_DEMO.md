# Auctorail — final 3-minute hackathon demo

This is the judge-facing presentation path for the Telegraph Protocol Application Track.

The goal is not to show every screen. It is to prove four things quickly:

1. Auctorail separates **proposal** from **permission**.
2. It can use real Telegraph/x402 evidence in the payment authorization boundary.
3. It fails closed when authority or evidence is insufficient.
4. It leaves receipts that can be checked again.

---

## Opening thesis

> **Agent confidence is not permission to act.**

Use this simple explanation:

> “An agent can decide what it wants to do. Auctorail makes sure it cannot also give itself permission to cause the external effect.”

The mental model is:

```text
principal defines authority
→ agent proposes an exact action
→ Auctorail freezes it
→ required evidence is verified
→ ALLOW / HOLD / BLOCK
→ one-use authority only on an executable ALLOW
→ protected executor
→ receipt
```

---

## 0:00–0:35 — Content Trust front door

From **HOME**, click **CHECK CONTENT**.

Use **LOAD SCAM SAMPLE** and leave the mode on **DEMO · FREE**.

Run the check.

Point out:

```text
exact content hash
→ bound scam evidence
→ BLOCK
→ content receipt
```

Say:

> “This first check is deterministic demo mode, not live Telegraph output. I’m using it to show the policy boundary clearly: strong scam evidence can block; missing or inconclusive required evidence holds instead of guessing. AI-written text by itself is not treated as malicious.”

Do not describe the deterministic sample as a Miner result.

---

## 0:35–0:55 — Verify the generated content receipt

Click **VERIFY RECEIPT**, then **VERIFY PROOF**.

Show `VALID`.

Say:

> “The exact content, action, evidence commitment, decision, and share summary are covered by the receipt. If those bindings are changed, verification no longer matches.”

Then add one sentence of claim discipline:

> “A valid receipt proves integrity under Auctorail’s rules. It does not mean an external classifier has established objective truth.”

---

## 0:55–1:25 — Show the real Telegraph + Base Sepolia proof

Open **VERIFY** from the header and choose **LOAD CANONICAL PROOF**.

Show the payment receipt and then open the linked Basescan transaction.

Canonical public proof:

```text
Network:          Base Sepolia 84532
Protected action: 1 USDC
Telegraph Intent: FRAUD_DETECTION
Serving Miner:    Refut On-Chain Risk / 95822412
Miner verdict:    ALLOW @ 0.70
Evidence cost:    $0.01 via x402
Transaction:      0x41b1...f2ffc
Block:            46301208
Receipt hash:     0x036a...e91e3
```

Basescan:

https://sepolia.basescan.org/tx/0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc

Say:

> “This payment proof is real. Auctorail acquired genuine Telegraph evidence through x402, bound it to the protected request, and a real Base Sepolia execution followed after authorization.”

If the historical `ProofGateVendor` name appears, explain:

> “That is the immutable deployment name from before the product was renamed to Auctorail.”

---

## 1:25–1:50 — Explain adaptive evidence without confusing it with authority

Use these examples:

```text
1 USDC / LOW
→ 1 distinct positive FRAUD_DETECTION Miner
→ confidence >= 0.70

7 USDC / MEDIUM
→ 2 distinct positive fraud Miners
→ confidence >= 0.75
→ + ONCHAIN_TX_LOOKUP

75 USDC / HIGH evidence classification
→ 3 distinct fraud Miners / at least 2 positives
→ confidence >= 0.80
→ + ONCHAIN_TX_LOOKUP
→ + WALLET_BALANCE_CHECK
```

Then immediately clarify:

> “The evidence tier and the authority limit are separate. The current autonomous execution ceiling is 10 USDC, so a 75-USDC proposal can be classified as HIGH but cannot be autonomously executed by this policy.”

Continue:

> “Higher consequence asks for more breadth and more independent corroboration. Independence is counted by distinct Miner ID, not by how many requests we made. If the required evidence cannot be established inside the attempt, time, and spend limits, Auctorail returns HOLD.”

This is more accurate than the old `1 / 4 / 7 = LOW / MEDIUM / HIGH` explanation, which no longer matches the current implementation.

---

## 1:50–2:15 — Security Lab

Open **SECURITY LAB**.

Run the modified-amount attack and then the full suite.

Use three memorable examples:

```text
ACTION MUTATION
1.00 authorized → 2.00 attempted
→ action binding mismatch
→ BLOCKED

PERMIT REPLAY
same one-use permit submitted again
→ already consumed
→ BLOCKED

INSUFFICIENT EVIDENCE
required threshold not reached
→ no execution authority
→ HELD
```

Say:

> “Security Lab is deterministic and zero-cost. It proves enforcement behavior; I’m not counting it as live Telegraph usage.”

---

## 2:15–2:38 — Guided Demo + SDK

Show **WATCH DEMO** briefly:

```text
VALID REQUEST     → EXECUTED (DEMO)
MODIFIED AMOUNT   → BLOCKED
REPLAYED PERMIT   → BLOCKED
MISSING EVIDENCE  → HELD
```

Then open **DOCS → SDK** and show:

```bash
npm install ./packages/sdk
```

Say:

> “The SDK is runnable from the repository. It requests authorization from the trusted Auctorail service; it does not mint its own authority.”

If you show code, prefer a safe local-preflight example first:

```js
const auth = await rail.authorize({
  amount: "1.00",
  recipient: "0xB38d...2c14",
  limit: "10.00",
  live: false
});
```

Then explain that omitting `live: false` can proceed to the real Telegraph/x402 path when the server is intentionally configured for it.

Do not claim `@auctorail/sdk` is already published on npm.

---

## 2:38–2:55 — Real usage + validation

Show the conservative public real-usage count:

```text
2 genuine Telegraph Miner acquisitions
$0.02 committed x402 evidence cost
1 protected Base Sepolia execution
```

Say:

> “Those are the public committed live counts. I’m deliberately excluding demo, Security Lab, SDK examples, unit tests, and fuzz traffic.”

Current green validation snapshot before the final documentation cleanup:

```text
268 / 268 unit tests across 53 files
7400 / 7400 deterministic adversarial fuzz cases contained
0 unauthorized executions / authorizations in those fuzz suites
0 production dependency vulnerabilities reported by npm audit
```

Fuzz breakdown:

```text
1100 payment authorization
3200 adaptive + quorum
3100 general authorization
```

The final browser workflow also passed the main product path at approximately `390px`, `980px`, and `1440px` on the validated code revision.

Before recording, use the CI result from the exact final SHA rather than relying on this written snapshot.

---

## 2:55–3:00 — Close

Use one sentence:

> **“Telegraph tells autonomous software what the outside world says. The principal defines what the agent may do. Auctorail combines sufficiently bound evidence with delegated authority to decide whether one exact consequence may proceed.”**

---

# What is demo and what is live

Keep this distinction explicit during the recording.

## Deterministic / no real Telegraph usage counted

- Content Trust in `DEMO · FREE` mode
- Guided Demo
- Security Lab
- SDK examples when `live: false`
- unit tests
- fuzz/security validation

## Live / real external activity

- payment **Check / Live Mode** when enabled/configured
- saved Telegraph/x402 evidence artifacts
- canonical Base Sepolia execution
- Content Trust only when `LIVE TELEGRAPH` is explicitly enabled **and an actual run has been captured**

The Content Trust live adapter existing in code is not proof that a live Content Trust Miner run has already happened.

---

# Safe claims

You can safely say:

- genuine Telegraph/x402 payment evidence is publicly committed;
- a protected Base Sepolia transaction is publicly verifiable;
- Auctorail checks authority before paid evidence acquisition;
- provider independence is measured by distinct Miner ID;
- duplicate routing does not create fake consensus;
- missing/insufficient required evidence results in `HOLD`;
- explicit negative payment evidence results in `BLOCK`;
- the current payment policy has a 10-USDC autonomous execution ceiling;
- exact-action binding and one-use execution authority are implemented;
- Content Trust and content receipts are implemented;
- Verify re-checks payment/content receipt integrity and bindings;
- deterministic test/demo traffic is separated from real Telegraph usage;
- the repository-local SDK is runnable.

Do not claim:

- “first ever” or “the first AI payment agent that…”;
- “unhackable” or “guaranteed safe”;
- deterministic Content Trust output is live Telegraph output;
- a content verdict proves objective truth;
- the historical 1-USDC payment used the later adaptive multi-Miner path;
- a successful real three-distinct-Miner HIGH quorum artifact has been captured;
- autonomous execution above 10 USDC is currently supported;
- `@auctorail/sdk` is already public on npm;
- Auctorail has undergone an independent production security audit.

---

# Final verification before recording

Run these on the exact revision used for the video:

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

Also confirm the GitHub **Auctorail CI** and **Auctorail UI Playwright** workflows are green on that same SHA.

Do not change code after recording without re-running the checks and recording from the new final revision.
