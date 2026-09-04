# ProofGate — Demo Today

Use this path for the Telegraph hackathon demo. Do not rerun the protected historical payment and do not spend more x402 evidence budget just for theater.

## 1. Open with the thesis

> **Agent confidence is not permission to act.**

ProofGate sits between an autonomous agent and a consequential tool. The agent may propose an action, but only a principal Mandate plus sufficient independent Telegraph intelligence can produce one-use execution authority.

```text
MANDATE → PROPOSE → FREEZE ACTION
        → DERIVE CONSEQUENCE
        → BUY / VERIFY TELEGRAPH EVIDENCE
        → ALLOW / HOLD / BLOCK
        → ONE-USE PERMIT
        → CONTROLLED EXECUTION
```

## 2. Run the zero-spend judge proof

```bash
npm run demo
```

This command is read-only. It sends no Telegraph request, signs no x402 authorization and performs no blockchain write.

It shows two separate real proof layers.

### Proof A — real protected execution

The historical v1.0 proof is publicly verifiable:

- Base Sepolia chain `84532`
- protected amount `1 USDC`
- vendor `0xB38d0405DF1b15961aEf29C7c45f2ED285822c14`
- genuine Telegraph FRAUD_DETECTION evidence
- Refut On-Chain Risk `95822412`
- real protected transaction `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc`
- block `46301208`

Do not claim this historical transaction used v1.2 quorum. It proves the real execution boundary.

### Proof B — real v1.2 HIGH multi-Miner attempt

The latest captured HIGH-risk check-only run used real Telegraph/x402 acquisition and deliberately returned `HOLD` because the live intelligence did not satisfy the frozen policy.

What happened:

```text
SarzOps 91001
→ accepted evidence
→ RECHECK @ 0.60

ChainSight 302
→ real paid response
→ exact wallet, but only "Base network"
→ rejected: exact chain 84532 not asserted

Refut 95822412
→ accepted evidence
→ ALLOW @ 0.70
→ exact subject/chain binding
→ below HIGH positive confidence floor 0.80

Anchor 49
→ real paid response
→ explicitly returned chainId 8453 / base-mainnet
→ rejected for the Base-Sepolia 84532 action
```

Therefore ProofGate refused authorization instead of weakening the rule after seeing the answers.

Say:

> **A Miner can say ALLOW and still not create permission. ProofGate checks whether the response is about the exact action, whether it comes from enough independent providers, and whether it meets the precommitted confidence rule.**

## 3. Show consequence-adaptive intelligence

```text
1 USDC — LOW
1 fraud Miner / 1 positive
confidence >= 0.70
budget 0.015 USDC

4 USDC — MEDIUM
2 distinct fraud Miners / 2 positives
+ ONCHAIN_TX_LOOKUP
confidence >= 0.75
budget 0.050 USDC

7 USDC — HIGH
3 distinct fraud Miners / 2 positives
+ ONCHAIN_TX_LOOKUP
+ WALLET_BALANCE_CHECK
confidence >= 0.80
budget 0.070 USDC
```

Say:

> **Higher consequence buys more breadth and more independent corroboration.**

## 4. Show the security property judges may remember

The latest live attempt is useful because it demonstrates exact-chain enforcement:

```text
Proposed action: Base Sepolia 84532
Miner answer:    Base mainnet 8453
Result:          REJECT EVIDENCE
```

ProofGate does not reinterpret a high-confidence answer for the wrong chain as authority for the requested action.

## 5. Show adversarial validation

Use the current branch and run:

```bash
npm run ci
npm run security:fuzz
npm run security:fuzz:adaptive
npm run security:fuzz:general
npm run audit:prod
```

These validation commands are offline and do not make Telegraph/x402 payments.

## 6. Close

> **Telegraph tells autonomous software what the outside world says. ProofGate decides how much independent intelligence the consequence deserves and only turns sufficient evidence plus delegated authority into one-use permission for one exact action.**

## Claims discipline

Safe to say:

- the historical Base-Sepolia protected transaction is real;
- Telegraph/x402 evidence acquisition is real;
- the latest HIGH run used multiple real Telegraph Miners;
- ProofGate rejected wrong-chain and insufficiently specific evidence;
- HIGH quorum remained unsatisfied and therefore the 7-USDC protected action was not sent;
- v1.2 implements and tests consequence-derived multi-Intent / distinct-Miner quorum and a general authorization core.

Do not say:

- the latest HIGH run successfully satisfied a three-Miner quorum;
- the v1.0 execution used the v1.2 quorum path;
- a Miner ALLOW is itself permission;
- GitHub/cloud/database examples are already live production adapters;
- ProofGate has undergone an independent production audit.
