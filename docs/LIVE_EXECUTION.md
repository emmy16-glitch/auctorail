# Auctorail — Canonical Live Execution

This document records the canonical end-to-end hackathon execution completed on Base Sepolia on **2026-09-02**.

It gives reviewers one place to verify the exact protected action, genuine Telegraph evidence, deterministic policy result, one-use permit, on-chain transaction, and Proof Receipt.

The execution predates the Auctorail rename, so some immutable historical identifiers still contain the previous `ProofGate` name. They are preserved intentionally.

## Result

Auctorail's authorization boundary successfully authorized and executed an autonomous payment of **1 Base Sepolia USDC** to the already-deployed historical `ProofGateVendor` contract.

- Network: Base Sepolia (`84532`)
- Token: Base Sepolia USDC
- Amount: `1 USDC` (`1000000` minor units)
- Sender: `0xC07a448DF2E1F3AF0d6f0E8cCe45d5D753fc8eF4`
- Destination: `0xB38d0405DF1b15961aEf29C7c45f2ED285822c14`
- Transaction: `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc`
- Base Sepolia block: `46301208`
- Transaction status: `Success`

Basescan:

https://sepolia.basescan.org/tx/0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc

## Authorization chain

### 1. Principal mandate

- Mandate ID: `treasury-demo-attested-v1`
- Principal: `company-demo`
- Agent: `procurement-agent`
- Mandate hash: `0x052a7e9a3ab0398f9636c795550c89b41eff82aad95cb86fd4c477ad084f5687`
- Policy: `payments.attested-vendor.v1`

The mandate restricted the agent to the delegated payment envelope before Telegraph proof was requested.

### 2. Exact frozen action

- Action hash: `0x0989c7d9470c6d26d873fa23670fb66565534e274b5a56d35fa6abd5bab0fbf4`
- Chain: Base Sepolia (`84532`)
- Token: Base Sepolia USDC
- Amount: `1000000`
- Destination: `0xb38d0405df1b15961aef29c7c45f2ed285822c14`
- Reason: `Invoice INV-1042`

Changing a protected semantic field such as amount, recipient, chain, token or policy changes the action commitment and invalidates the old authorization.

### 3. Genuine Telegraph evidence

Fresh Telegraph evidence was obtained for the exact canonical vendor and chain.

- Serving Miner: `Refut On-Chain Risk`
- Miner ID: `95822412`
- Required Intent: `FRAUD_DETECTION`
- Miner verdict: `ALLOW`
- Confidence: `0.7`
- Applicability: `APPLICABLE`
- Telegraph signal hash: `0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c`
- Raw response hash: `0x442bc3463cae1c9f8ba9a5fce124ffd96cec720f0f24a41dc322b3b905cc361d`
- Evidence artifact: `data/evidence/telegraph-2026-09-02T17-36-12-826Z.json`

The live Telegraph x402 challenge selected an approved Base Sepolia USDC lane with a proof charge of `10000` minor units (`0.01 USDC`). The implementation validated the network, asset, amount cap and dynamic `payTo` address before the paid request.

### 4. Vendor runtime attestation

The deployed vendor runtime was independently verified before execution.

- Runtime Keccak-256: `0x12c20655de1ed03a8e646cb98f8ce51e033ec28dc38b7c9383b8f96d02d07a93`
- Attestation hash: `0x4d63927d1dc90819efb71138cbabf9fd1439551257f11c92f2a1842e391c7922`
- Attested at Base Sepolia block: `46301204`
- Artifact: `data/evidence/vendor-attestations/vendor-runtime-2026-09-02T17-38-18-411Z.json`

### 5. Deterministic policy decision

The historical policy output was:

```text
PROOFGATE: ALLOW
Reason: composite_attested_vendor_checks_passed
```

`PROOFGATE` is shown here because that exact string belongs to the preserved historical artifact generated before the product was renamed Auctorail.

Every required mandate, chain, asset, destination, amount, evidence, Miner-profile, confidence, signal-hash, freshness and vendor-runtime check passed.

A favorable Miner verdict alone did not create authorization. The authorization engine combined the Miner evidence with delegated authority and the exact runtime attestation.

### 6. One-use permit

- Permit ID: `a1b4e53c-0e0e-4504-b0b0-a05ec80093bb`
- Decision hash: `0x5f159b8bac7fa9807347decad0f8875fd3b5b4a7e41dbd3475c82d54cb0f054e`
- Permit expiry window: 30 seconds

The permit was bound to the exact mandate, frozen action and decision.

### 7. Controlled execution

Execution result:

```text
Final decision: ALLOW
Execution: EXECUTED
Execution code: executed
Transaction: 0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc
```

The Base Sepolia executor constructed the ERC-20 transfer from the authorized action and allowed only one irreversible broadcast attempt. Confirmation reads may fail over across RPC providers, but transaction semantics cannot change during failover.

### 8. Proof Receipt

- Receipt ID: `878d4350-85c8-44dd-94c2-257641cd7c0c`
- Receipt hash: `0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3`
- Artifact: `data/receipts/878d4350-85c8-44dd-94c2-257641cd7c0c.json`

The receipt binds the mandate, action, Telegraph evidence, policy decision, permit, vendor runtime attestation and execution result into one tamper-evident artifact.

## What this proves

This execution demonstrates a real Auctorail authorization boundary with a real external effect:

```text
DELEGATED AUTHORITY
  ↓
EXACT FROZEN ACTION
  ↓
GENUINE TELEGRAPH EVIDENCE
  ↓
DETERMINISTIC ALLOW
  ↓
ONE-USE PERMIT
  ↓
CONTROLLED BASE SEPOLIA EXECUTION
  ↓
VERIFIABLE PROOF RECEIPT
```

It is not a visual simulation and it does not reuse historical evidence for a different destination.

## What it does not prove

This historical transaction predates later Auctorail work.

Do not claim that this transaction exercised:

- the later HIGH three-distinct-Miner quorum path;
- the later general action-adapter architecture;
- the later production-oriented Ed25519/PostgreSQL deployment path.

Those controls exist separately in the current code/tests, but this exact transaction should only be used to prove the live Telegraph + protected execution boundary that it actually exercised.

## Historical-name compatibility

The product is now **Auctorail**.

The deployed `ProofGateVendor` contract name, saved evidence files, receipts, hashes and historical output strings are intentionally unchanged. They are immutable proof/deployment artifacts from before the rename. Rewriting them for branding would reduce the trustworthiness of the recorded proof.
