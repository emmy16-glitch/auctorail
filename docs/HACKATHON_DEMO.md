# ProofGate Hackathon Demo Runbook

This runbook is the intended final presentation path for the Telegraph Protocol Application Track.

The goal is to demonstrate one idea clearly:

> An autonomous agent may decide to act, but ProofGate requires delegated authority plus sufficient independent evidence before that exact action can execute.

## Canonical demo action

- action: ERC-20 payment
- network: Base Sepolia (`84532`)
- asset: Base Sepolia USDC
- amount: **1 USDC** (`1000000` minor units)
- destination: `0xB38d0405DF1b15961aEf29C7c45f2ED285822c14`
- destination contract: `ProofGateVendor`

Do not change the canonical vendor merely to obtain a favorable result.

## Before recording or presenting

Confirm:

```bash
npm ci
npm run ci
npm run audit:prod
npm run vendor:compile
```

The tracked vendor artifact should remain unchanged after recompilation.

If PostgreSQL integration is part of the final environment, also run:

```bash
npm run test:postgres
```

with a dedicated test database configured through `PROOFGATE_DATABASE_URL`.

Never expose `.env`, private keys, Telegraph credentials, wallet recovery material, signing keys or database credentials on screen.

## Stage 1 — explain the unsafe baseline

Keep this conceptual and short:

```text
Agent decides → wallet executes
```

Problem: the same component that reasons about the action effectively controls whether the action happens.

Then introduce ProofGate:

```text
Mandate → Proposed Action → Telegraph Proof → Policy → Permit → Controlled Execution → Receipt
```

## Stage 2 — show delegated authority

Show that the agent operates under a bounded Mandate rather than unlimited wallet authority.

Explain the relevant constraints for the demo:

- correct agent
- payment action only
- Base Sepolia only
- Base Sepolia USDC only
- canonical vendor only
- bounded amount
- required `FRAUD_DETECTION` proof
- explicit policy/version
- time/lifecycle limits
- optional cumulative authority

Key line:

> The agent is autonomous inside the Mandate, but it cannot expand the Mandate.

## Stage 3 — freeze the exact Action Contract

The payment action is normalized and hashed before requesting proof.

Emphasize that changing amount, recipient or policy changes the authorization target.

Useful visual:

```text
1 USDC → canonical vendor → actionHash A
10 USDC → canonical vendor → actionHash B
1 USDC → different recipient → actionHash C
```

## Stage 4 — obtain fresh Telegraph proof

Refresh the public Telegraph registry:

```bash
bash scripts/discover-telegraph.sh
```

Then request proof for the exact canonical vendor:

```bash
npm run proof:live -- 0xB38d0405DF1b15961aEf29C7c45f2ED285822c14
```

The proof must be genuinely obtained for this address and Base Sepolia.

Do not reuse the historical evidence artifact already committed under `data/evidence/` as though it authorizes this vendor. ProofGate's exact-target and freshness rules are intentionally designed to reject that substitution.

If the proof is missing, stale, below threshold, unavailable or otherwise insufficient, show the `HOLD`. That is correct behavior.

Do not weaken the policy to force a green demo.

## Stage 5 — show the deterministic decision

Explain the difference:

- `ALLOW`: all required checks pass; a permit may be issued
- `HOLD`: ProofGate cannot establish enough current proof; no permit
- `BLOCK`: a known authorization/security rule failed; no permit

The Miner does not issue the permit. ProofGate policy does.

## Stage 6 — demonstrate attacks before the successful action

Run the offline defensive harness:

```bash
npm run attack:lab
```

For the presentation, focus on three easy-to-understand cases.

### Attack A — amount mutation

Authorized:

```text
1 USDC → canonical vendor
```

Attempted:

```text
10 USDC → canonical vendor
```

Expected: blocked before protected execution.

### Attack B — recipient mutation

Authorized:

```text
1 USDC → canonical vendor
```

Attempted:

```text
1 USDC → attacker/different address
```

Expected: blocked before protected execution.

### Attack C — replay

Attempt to use an already claimed/consumed permit again.

Expected:

```text
permit_already_consumed
```

Key line:

> Even after an agent earns permission once, that permission is not a reusable wallet credential.

## Stage 7 — final protected execution

Only perform the live payment when fresh evidence satisfies the selected policy and the final environment is intentionally funded for the testnet action.

The approved execution command available in the repository is:

```bash
npm run execute:approved
```

Before running it, verify the script/environment still targets the canonical Base Sepolia action and does not contain stale local state from earlier experiments.

The final execution should prove that the submitted transaction matches the already-authorized transaction intent.

If the provider reports uncertainty after possible broadcast, ProofGate should preserve an ambiguous/reconciliation state rather than blindly issuing another payment.

## Stage 8 — show the Proof Receipt

End with the receipt rather than the transaction alone.

The receipt demonstrates the full chain of accountability:

```text
Who delegated authority?
What exact action was proposed?
What evidence was obtained?
Which policy checks ran?
What decision was made?
Which permit authorized it?
Was the permit consumed?
What transaction happened?
Can the receipt still verify?
```

This is what makes ProofGate more than a transaction filter.

## Suggested 3-minute presentation

### 0:00–0:25 — problem

"AI agents can be confident and still be wrong. Today, many systems connect the same agent decision directly to a wallet or tool. ProofGate separates deciding from permission to act."

### 0:25–0:55 — architecture

Show:

```text
MANDATE → PROPOSE → PROVE → POLICY → PERMIT → EXECUTE → RECEIPT
```

Explain that Telegraph is independent evidence, not authority.

### 0:55–1:30 — live proof/policy

Show the exact vendor action and fresh Telegraph evidence. Show `ALLOW`, `HOLD` or `BLOCK` honestly according to the actual response.

### 1:30–2:05 — attacks

Demonstrate amount mutation, recipient mutation and replay being contained.

### 2:05–2:40 — valid execution

Run the correctly authorized 1-USDC Base Sepolia payment only when the proof path permits it. Show the real transaction hash.

### 2:40–3:00 — receipt and close

Show the Proof Receipt and finish with:

> Telegraph provides the evidence. ProofGate turns sufficient evidence plus delegated authority into permission for one exact action.

## Claims to make carefully

Safe claims:

- the vendor deployment is real and tracked
- the live Telegraph path uses genuine Miner/x402 responses
- the offline Attack Lab uses synthetic fixtures and no external spending
- ProofGate binds permission to an exact Action Contract
- replay protection exists in both local and PostgreSQL-backed forms
- the current architecture supports durable transaction-intent and cumulative-spend controls

Do not claim:

- that historical Telegraph evidence authorizes the current vendor
- that the earlier security assessment covers commits made after its assessed revision
- that ProofGate has undergone an independent production security audit
- that an ambiguous blockchain response means the transaction failed
- that a favorable Miner verdict alone means ProofGate authorized execution

## Final submission freeze

After the final code and documentation are complete:

1. run the full final validation against the exact submission revision;
2. save only non-secret evidence/artifacts intended for public audit;
3. confirm CI is green;
4. record the final commit SHA in the submission notes;
5. avoid architectural changes after the final demo recording unless fixing a verified defect.
