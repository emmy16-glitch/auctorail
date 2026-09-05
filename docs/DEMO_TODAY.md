# Auctorail — demo today

Use this as the practical runbook immediately before presenting or recording the Telegraph hackathon demo.

The most important rule is simple:

> **Keep deterministic demo output and real Telegraph/x402 activity clearly separated.**

The canonical protected payment is already publicly verifiable. Do **not** resend it just for theater.

---

## Before you start

Make sure:

- you are on the exact revision you intend to present;
- the web app opens normally on the device you will record;
- you know whether live payment mode is enabled;
- Content Trust is left on **DEMO · FREE** unless you intentionally want to pay for a real live Content Trust acquisition;
- no `.env`, private key, wallet recovery phrase, signing secret, or terminal history containing secrets will appear in the recording;
- the canonical Basescan transaction is already open in another tab.

Canonical transaction:

https://sepolia.basescan.org/tx/0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc

---

## 1. Start with Content Trust

From **HOME**, click **CHECK CONTENT**.

Use **LOAD SCAM SAMPLE** and keep the mode on **DEMO · FREE**.

Run the check and show:

```text
exact content hash
→ bound scam evidence
→ BLOCK
→ Auctorail content receipt
```

Say:

> **“This first check is deterministic demo mode, so it makes no real Telegraph payment. I’m showing how Auctorail binds evidence to one exact piece of content and fails closed before someone acts on it.”**

Useful policy points:

- strong scam/phishing evidence can `BLOCK`;
- missing, stale, weak, or inconclusive required evidence becomes `HOLD`;
- AI-written text is informational by itself and is not automatically malicious;
- AI-generation becomes a blocking authorship conflict only when the action is `publish`, authorship is explicitly claimed as `human`, and the configured confidence threshold is crossed.

Do not call the deterministic sample a live Miner result.

---

## 2. Verify the generated content receipt

Click **VERIFY RECEIPT**, then **VERIFY PROOF**.

Show `VALID`.

Explain:

> **“The exact subject, action, evidence commitment, decision, and share summary are covered by the receipt. If those bindings change, verification no longer matches.”**

Then clarify:

> **“A valid receipt proves integrity under Auctorail’s rules. It does not turn a classifier or Miner assessment into objective truth.”**

---

## 3. Verify the real payment proof

Open **VERIFY** from the header and click **LOAD CANONICAL PROOF**.

Show the valid payment receipt and open Basescan.

Publicly verified facts:

```text
Network:          Base Sepolia 84532
Protected amount: 1 USDC
Telegraph Intent: FRAUD_DETECTION
Serving Miner:    Refut On-Chain Risk / 95822412
Miner verdict:    ALLOW @ 0.70
Evidence cost:    $0.01 via x402
Signal hash:      0x13499ae...78cae4c
Transaction:      0x41b1d2...8f59f2ffc
Block:            46301208
Receipt hash:     0x036a15...db9e91e3
```

Say:

> **“This one is real: genuine Telegraph evidence was purchased through x402, then a protected Base Sepolia execution followed after authorization.”**

If `ProofGateVendor` appears on-screen or in the proof, explain that it is the historical immutable deployment name from before the Auctorail rename.

---

## 4. Explain the shared authorization model

Use this simplified comparison:

```text
PAYMENT
agent proposes payment
→ freeze exact payment
→ check principal authority
→ verify required Telegraph evidence
→ ALLOW / HOLD / BLOCK
→ one-use permit on ALLOW
→ protected execution
→ receipt

CONTENT TRUST
user/agent supplies content
→ hash exact content
→ verify bound evidence
→ ALLOW / HOLD / BLOCK
→ content receipt
```

The payment lane is the demonstrated executable adapter. Content Trust shows how the same generic Action / Mandate / Decision ideas can also protect a non-payment decision.

---

## 5. Explain consequence-adaptive evidence correctly

Use these current examples:

```text
1 USDC — LOW
1 distinct positive FRAUD_DETECTION Miner
confidence >= 0.70

7 USDC — MEDIUM
2 distinct positive fraud Miners
confidence >= 0.75
+ ONCHAIN_TX_LOOKUP

75 USDC — HIGH evidence classification
3 distinct fraud Miners / at least 2 positives
confidence >= 0.80
+ ONCHAIN_TX_LOOKUP
+ WALLET_BALANCE_CHECK
```

Then immediately explain the authority boundary:

> **“Evidence tier and permission are separate. The current autonomous execution ceiling is 10 USDC, so the HIGH example shows how the evidence planner scales, not that the agent is allowed to send 75 USDC.”**

Provider independence is counted by **distinct Miner ID**, not number of requests.

If the required diversity or confidence cannot be established inside the bounded attempts, deadline, and evidence budget, Auctorail returns `HOLD`.

---

## 6. Show Security Lab

Open **SECURITY LAB**.

Run the modified-amount attack and then the full deterministic suite.

Use these three examples:

```text
ACTION MUTATION
1.00 authorized → 2.00 attempted
→ action binding mismatch
→ BLOCKED

PERMIT REPLAY
same permit submitted twice
→ already consumed
→ BLOCKED

INSUFFICIENT EVIDENCE
required threshold not reached
→ no execution authority
→ HELD
```

Say:

> **“Security Lab is deterministic, offline, and zero-payment. I’m using it to show the enforcement boundary, not to inflate live Telegraph usage.”**

---

## 7. Show Guided Demo and SDK briefly

### Guided Demo

Open **WATCH DEMO** and show the four outcomes:

```text
VALID REQUEST      → EXECUTED (DEMO)
MODIFIED AMOUNT    → BLOCKED
REPLAYED PERMIT    → BLOCKED
MISSING EVIDENCE   → HELD
```

### SDK

Open **DOCS → SDK** and show the repository-local install:

```bash
npm install ./packages/sdk
```

Explain:

> **“The SDK asks the trusted Auctorail service for authorization. It does not contain the signing keys or mint its own permission.”**

The safest code example for a presentation is a local preflight:

```js
const auth = await rail.authorize({
  amount: "1.00",
  recipient: "0xB38d...2c14",
  limit: "10.00",
  live: false
});
```

`live: false` prevents the example from intentionally purchasing Telegraph evidence.

Do not claim a public npm release. The SDK is currently repository-local/private.

---

## 8. State the real usage count exactly

Current conservative publicly committed minimum:

```text
Real Telegraph Miner acquisitions: 2
Committed x402 evidence cost:       $0.02
Protected on-chain executions:      1
```

Do **not** add any of these to that total:

- Content Trust demo checks;
- Security Lab runs;
- Guided Demo steps;
- SDK examples;
- unit tests;
- fuzz cases.

A bounded Content Trust live Telegraph/x402 client exists, but it is not a real usage claim until a live run is actually performed, reviewed, and safely preserved.

---

## 9. Only run another live payment if you really mean to

Use **ENTER LIVE MODE** only if:

- the configured wallet is ready;
- evidence budgets/limits are correct;
- you intentionally want another genuine Telegraph/x402 acquisition;
- you accept that the result may correctly be `ALLOW`, `HOLD`, or `BLOCK`.

A new live payment is **not required** to prove the project because the canonical real payment and evidence are already public.

If a real live check returns `HOLD` or `BLOCK`, present it as correct enforcement when the policy/evidence requires that outcome. Do not retry blindly just to obtain a prettier result.

---

## 10. Validation to quote

The latest green feature-branch snapshot before this documentation cleanup recorded:

```text
267 / 267 unit tests across 53 files
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

The browser workflow also passed the main product paths at approximately:

```text
390px   phone
980px   Android desktop-site-like viewport
1440px  desktop
```

Before recording, confirm the exact final SHA is green rather than relying only on the numbers written here.

---

## 11. Final verification commands

Run on the exact final revision:

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

The GitHub Actions **Auctorail CI** and **Auctorail UI Playwright** workflows should both be green on the same SHA used for the recording.

---

## Close

Use this line:

> **“Telegraph tells autonomous software what the outside world says. The principal defines what the agent may do. Auctorail combines sufficiently bound evidence with delegated authority to decide whether one exact consequence may proceed.”**

---

## Claim discipline

### Safe

- the canonical Base Sepolia payment and its Telegraph/x402 evidence are real;
- the repository contains two publicly committed genuine Miner acquisitions;
- the public real evidence cost currently totals $0.02;
- Content Trust and content-receipt verification are implemented;
- Content Trust demo output is explicitly deterministic/non-Telegraph;
- Verify checks Auctorail receipt integrity and bindings;
- current adaptive evidence bands are `<=5`, `>5–50`, and `>50` USDC;
- the current autonomous execution ceiling is 10 USDC;
- duplicate Miner routing does not create provider independence;
- Security Lab/demo/fuzz activity is separate from live evidence.

### Do not say

- “the first ever” or “the first AI payment agent that…”;
- Content Trust demo output is a real Miner result;
- a content verdict proves objective truth;
- the successful historical payment used the later adaptive multi-Miner path;
- a successful real three-distinct-Miner HIGH quorum artifact has been captured;
- autonomous payments above 10 USDC are currently supported;
- `@auctorail/sdk` is already published on npm;
- Auctorail is “unhackable,” “production ready,” or independently security audited.

Specific proof is more convincing than inflated language.
