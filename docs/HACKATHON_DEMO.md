# ProofGate Hackathon Demo Runbook

This is the final presentation path for the Telegraph Protocol Application Track.

The core message is:

> An autonomous agent may decide to act, but ProofGate requires delegated authority plus sufficient independent evidence before that exact action can execute.

## Canonical demo action

- action: ERC-20 payment
- network: Base Sepolia (`84532`)
- asset: Base Sepolia USDC
- amount: **1 USDC** (`1000000` minor units)
- destination: `0xB38d0405DF1b15961aEf29C7c45f2ED285822c14`
- destination contract: `ProofGateVendor`

Do not change the canonical vendor merely to obtain a favorable result.

## Canonical live result already captured

The complete end-to-end flow succeeded on **2026-09-02**.

- Telegraph Miner: `Refut On-Chain Risk` (`95822412`)
- Telegraph intent: `FRAUD_DETECTION`
- Telegraph verdict: `ALLOW`
- confidence: `0.7`
- signal hash: `0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c`
- policy: `payments.attested-vendor.v1`
- action hash: `0x0989c7d9470c6d26d873fa23670fb66565534e274b5a56d35fa6abd5bab0fbf4`
- permit: `a1b4e53c-0e0e-4504-b0b0-a05ec80093bb`
- execution: `EXECUTED`
- transaction: `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc`
- block: `46301208`
- receipt hash: `0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3`

Basescan:

https://sepolia.basescan.org/tx/0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc

Primary public artifacts:

- `docs/LIVE_EXECUTION.md`
- `data/evidence/telegraph-2026-09-02T17-36-12-826Z.json`
- `data/evidence/vendor-attestations/vendor-runtime-2026-09-02T17-38-18-411Z.json`
- `data/receipts/878d4350-85c8-44dd-94c2-257641cd7c0c.json`

Use these artifacts for the final presentation rather than spending another USDC merely to reproduce the same proof.

## Before recording or presenting

Confirm:

```bash
npm ci
npm run ci
npm run audit:prod
npm run vendor:compile
```

If PostgreSQL integration is part of the presentation environment, also run:

```bash
npm run test:postgres
```

with a dedicated test database configured through `PROOFGATE_DATABASE_URL`.

Never expose `.env`, private keys, Telegraph credentials, wallet recovery material, signing keys or database credentials on screen.

## Stage 1 — unsafe baseline

Show the conceptual baseline:

```text
Agent decides → wallet executes
```

Then introduce ProofGate:

```text
MANDATE → PROPOSE → PROVE → POLICY → PERMIT → EXECUTE → RECEIPT
```

Explain that the component deciding what to do is not allowed to create its own permission.

## Stage 2 — delegated authority

Show that the agent operates under a bounded Mandate rather than unlimited wallet authority.

Relevant constraints:

- correct agent
- payment action only
- Base Sepolia only
- Base Sepolia USDC only
- canonical vendor only
- bounded amount
- required `FRAUD_DETECTION` evidence
- explicit policy/version
- lifecycle and expiry limits
- optional cumulative authority in the production-oriented path

Key line:

> The agent is autonomous inside the Mandate, but it cannot expand the Mandate.

## Stage 3 — exact Action Contract

The payment action is canonicalized and hashed before proof is requested.

Useful visual:

```text
1 USDC → canonical vendor → actionHash A
10 USDC → canonical vendor → actionHash B
1 USDC → different recipient → actionHash C
```

Changing a protected semantic field changes the authorization target.

## Stage 4 — Telegraph proof

For a recorded presentation, show the committed canonical evidence artifact and its provenance.

The successful proof was obtained with:

```bash
npm run proof:live -- \
  0xB38d0405DF1b15961aEf29C7c45f2ED285822c14 \
  --capability-route \
  --attested-vendor-policy
```

The live path validated:

- exact destination
- Base Sepolia chain
- `FRAUD_DETECTION`
- serving Miner identity
- Miner result
- confidence threshold
- applicability
- signal hash
- evidence freshness
- approved x402 network/asset/amount lane
- dynamic x402 payment recipient
- exact vendor runtime attestation

A failed or insufficient proof must produce `HOLD` or `BLOCK`; policy must not be weakened to force a demo result.

## Stage 5 — deterministic decision

Explain:

- `ALLOW`: all required checks pass; a permit may be issued
- `HOLD`: enough current proof cannot be established; no permit
- `BLOCK`: a known authorization/security rule failed; no permit

The Miner does not issue the permit. ProofGate policy does.

The canonical result was:

```text
PROOFGATE: ALLOW
Reason: composite_attested_vendor_checks_passed
```

## Stage 6 — attack demonstrations

Run the offline defensive harness:

```bash
npm run attack:lab
```

Focus on three easy-to-understand cases.

### Amount mutation

```text
Authorized: 1 USDC → canonical vendor
Attempted: 10 USDC → canonical vendor
Expected: BLOCK before protected execution
```

### Recipient mutation

```text
Authorized: 1 USDC → canonical vendor
Attempted: 1 USDC → different address
Expected: BLOCK before protected execution
```

### Replay

Attempt to reuse an already consumed permit.

Expected:

```text
permit_already_consumed
```

Key line:

> Even after an agent earns permission once, that permission is not a reusable wallet credential.

## Stage 7 — show the real protected execution

Do not resend the canonical payment just for presentation.

Show the committed receipt and the successful Base Sepolia transaction instead:

```text
Final decision: ALLOW
Execution: EXECUTED
Execution code: executed
Transaction: 0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc
```

Then open the Basescan transaction and show the **1 USDC** transfer from the ProofGate burner wallet to the canonical vendor.

If a separate fresh live execution is intentionally performed, obtain fresh evidence first and treat `AMBIGUOUS` as a reconciliation state rather than automatically broadcasting another payment.

## Stage 8 — Proof Receipt

End with:

`data/receipts/878d4350-85c8-44dd-94c2-257641cd7c0c.json`

Explain that the receipt answers:

```text
Who delegated authority?
What exact action was proposed?
What evidence was obtained?
Which policy checks ran?
What decision was made?
Which permit authorized it?
What transaction happened?
Can the receipt still verify?
```

## Suggested 3-minute presentation

### 0:00–0:25 — problem

"AI agents can be confident and still be wrong. ProofGate separates deciding from permission to act."

### 0:25–0:55 — architecture

Show:

```text
MANDATE → PROPOSE → PROVE → POLICY → PERMIT → EXECUTE → RECEIPT
```

Explain that Telegraph is independent evidence, not authority.

### 0:55–1:30 — real proof

Show the committed Telegraph evidence, signal hash, runtime attestation and deterministic `ALLOW`.

### 1:30–2:05 — attacks

Demonstrate amount mutation, recipient mutation and replay being contained.

### 2:05–2:40 — real execution

Show the successful Basescan transaction and the 1-USDC transfer.

### 2:40–3:00 — receipt and close

Show the Proof Receipt and finish with:

> Telegraph provides the evidence. ProofGate turns sufficient evidence plus delegated authority into permission for one exact action.

## Claims to make carefully

Safe claims:

- the vendor deployment is real and tracked
- the canonical 1-USDC Base Sepolia execution is real and publicly verifiable
- the canonical Telegraph proof used a genuine Miner/x402 response
- the offline Attack Lab uses synthetic fixtures and no external spending
- ProofGate binds permission to an exact Action Contract
- replay protection exists in local and PostgreSQL-backed forms
- the codebase implements production-oriented Ed25519 signing, durable transaction-intent controls and cumulative-spend authority

Do not claim:

- that the canonical live transaction exercised the PostgreSQL/Ed25519 production-oriented path; it used the local/demo compatibility path
- that the earlier security assessment covers commits made after its assessed revision
- that ProofGate has undergone an independent production security audit
- that an ambiguous blockchain response means the transaction failed
- that a favorable Miner verdict alone means ProofGate authorized execution

## Final submission freeze

1. run final validation against the exact submission revision;
2. save only non-secret evidence intended for public audit;
3. confirm CI is green;
4. record the final commit SHA in submission notes;
5. avoid architectural changes after the final demo recording unless fixing a verified defect.
