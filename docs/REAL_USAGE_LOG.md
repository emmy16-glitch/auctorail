# Auctorail — Real Telegraph Usage Log

This file records only **publicly committed, directly verifiable** real Telegraph/x402 activity in the repository. It intentionally excludes deterministic demo, Security Lab and fuzz traffic.

The goal is to make Track 3 real-usage evidence easy for judges to inspect without mixing it with simulations.

## Publicly committed real Miner acquisitions

### 2026-09-01 — FRAUD_DETECTION request

Artifact:

`data/evidence/telegraph-2026-09-01T17-00-18-634Z.json`

Verified details:

- Source: Telegraph
- Intent: `FRAUD_DETECTION`
- Miner: `Refut On-Chain Risk`
- Miner ID: `95822412`
- Target: `0xaFb077A0869c6B5bD3DC2aAF7aBb2f971Eb53d08`
- Chain: Base Sepolia `84532`
- Verdict: `ALLOW`
- Confidence: `0.50`
- Telegraph cost: `$0.01`
- Signal hash: `0x28c002c52731ed59f12573408aa2c918ba0dd6cf7691535c7699f54d4fc8f12c`
- x402 settlement present: yes
- Captured: `2026-09-01T17:00:18.634Z`

This response was evidence acquisition only. It is not presented as the canonical protected execution.

### 2026-09-02 — FRAUD_DETECTION request used by canonical protected execution

Artifact:

`data/evidence/telegraph-2026-09-02T17-36-12-826Z.json`

Verified details:

- Source: Telegraph
- Intent: `FRAUD_DETECTION`
- Miner: `Refut On-Chain Risk`
- Miner ID: `95822412`
- Target: `0xB38d0405DF1b15961aEf29C7c45f2ED285822c14`
- Chain: Base Sepolia `84532`
- Verdict: `ALLOW`
- Confidence: `0.70`
- Telegraph cost: `$0.01`
- Signal hash: `0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c`
- x402 payment amount: `10000` minor units
- x402 settlement success: true
- x402 settlement transaction: `0xc135d16a7abf5fdfc9f9dcaec001e5369865c5004224cd6bb9a822fb900daef0`
- Captured: `2026-09-02T17:36:12.826Z`

This accepted evidence became part of the canonical authorization chain documented in `docs/LIVE_EXECUTION.md`.

## Publicly committed protected external effect

### 2026-09-02 — Base Sepolia protected vendor payment

- Network: Base Sepolia `84532`
- Protected amount: `1 USDC`
- Destination: `0xB38d0405DF1b15961aEf29C7c45f2ED285822c14`
- Transaction: `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc`
- Block: `46301208`
- Proof Receipt hash: `0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3`

Basescan:

https://sepolia.basescan.org/tx/0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc

## Current minimum publicly verifiable usage totals

From committed artifacts only:

```text
Real Telegraph Miner acquisitions: 2
Committed x402 evidence cost:       $0.02 total
Protected on-chain executions:      1
Deterministic demo requests:         excluded
Security Lab requests:               excluded
Fuzz cases:                          excluded
```

These numbers are deliberately conservative. They count only artifacts a judge can inspect directly in the repository.

## Additional HIGH-risk multi-Miner run

The project documentation records a later real HIGH-risk multi-Miner/x402 run that returned `HOLD` after rejecting or discounting evidence that did not satisfy the frozen HIGH policy.

The developer's local Termux working tree previously showed `data/evidence/adaptive/` as **untracked**. Those raw adaptive artifacts are therefore **not included in the public totals above** on this branch yet.

Before using that HIGH run as a primary submission claim, review the local adaptive artifacts for secrets/private data and commit only safe, sanitized proof artifacts. Do not commit private keys, wallet secrets, authentication tokens or unrelated raw credentials.

Until that is done, use the two committed Telegraph artifacts and canonical Base Sepolia execution as the fully public proof set.

## Track 3 usage discipline

Do not inflate this log with deterministic demo or test traffic. Telegraph's Track 3 rules require real Miner usage, so this file intentionally distinguishes:

```text
REAL TELEGRAPH/x402       → counted here
GUIDED DEMO               → not counted
SECURITY LAB              → not counted
OFFLINE FUZZ / TESTS      → not counted
```

When new genuine live evidence is intentionally acquired, add the sanitized artifact and update this log with the exact Miner, Intent, cost, outcome and artifact path.
