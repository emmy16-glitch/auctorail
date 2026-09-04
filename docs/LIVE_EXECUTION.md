# ProofGate Canonical Live Execution

This document records the canonical end-to-end hackathon execution completed on Base Sepolia on 2026-09-02.

It is intended to give reviewers one place to verify the exact action, Telegraph evidence, policy result, permit, on-chain transaction, and Proof Receipt.

## Result

ProofGate successfully authorized and executed an autonomous payment of **1 Base Sepolia USDC** to the canonical `ProofGateVendor` contract.

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

### Mandate

- Mandate ID: `treasury-demo-attested-v1`
- Principal: `company-demo`
- Agent: `procurement-agent`
- Mandate hash: `0x052a7e9a3ab0398f9636c795550c89b41eff82aad95cb86fd4c477ad084f5687`
- Policy: `payments.attested-vendor.v1`

The Mandate restricted the agent to the delegated payment envelope before Telegraph proof was requested.

### Exact Action Contract

- Action hash: `0x0989c7d9470c6d26d873fa23670fb66565534e274b5a56d35fa6abd5bab0fbf4`
- Chain: Base Sepolia (`84532`)
- Token: Base Sepolia USDC
- Amount: `1000000`
- Destination: `0xb38d0405df1b15961aef29c7c45f2ed285822c14`
- Reason: `Invoice INV-1042`

Changing a protected semantic field such as amount, recipient, chain, token or policy changes the action hash and invalidates authorization.

### Live Telegraph evidence

Fresh Telegraph evidence was obtained for the exact canonical vendor and chain.

- Serving Miner: `Refut On-Chain Risk`
- Miner ID: `95822412`
- Required intent: `FRAUD_DETECTION`
- Miner verdict: `ALLOW`
- Confidence: `0.7`
- Applicability: `APPLICABLE`
- Telegraph signal hash: `0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c`
- Raw response hash: `0x442bc3463cae1c9f8ba9a5fce124ffd96cec720f0f24a41dc322b3b905cc361d`
- Evidence artifact: `data/evidence/telegraph-2026-09-02T17-36-12-826Z.json`

The live Telegraph x402 challenge selected an approved Base Sepolia USDC lane with a proof charge of `10000` minor units (`0.01 USDC`). ProofGate validated the network, asset, amount cap and dynamic `payTo` address before the paid request.

### Vendor runtime attestation

ProofGate independently verified the deployed vendor runtime before execution.

- Runtime Keccak-256: `0x12c20655de1ed03a8e646cb98f8ce51e033ec28dc38b7c9383b8f96d02d07a93`
- Attestation hash: `0x4d63927d1dc90819efb71138cbabf9fd1439551257f11c92f2a1842e391c7922`
- Attested at Base Sepolia block: `46301204`
- Artifact: `data/evidence/vendor-attestations/vendor-runtime-2026-09-02T17-38-18-411Z.json`

### Deterministic policy decision

Policy result:

```text
PROOFGATE: ALLOW
Reason: composite_attested_vendor_checks_passed
```

Every required mandate, chain, asset, destination, amount, evidence, Miner-profile, confidence, signal-hash, freshness and vendor-runtime check passed.

A favorable Miner verdict alone did not create authorization. The ProofGate policy engine combined the Miner evidence with delegated authority and the exact runtime attestation.

### One-use permit

- Permit ID: `a1b4e53c-0e0e-4504-b0b0-a05ec80093bb`
- Decision hash: `0x5f159b8bac7fa9807347decad0f8875fd3b5b4a7e41dbd3475c82d54cb0f054e`
- Permit expiry window: 30 seconds

The permit was bound to the exact Mandate, Action Contract and decision.

### Controlled execution

Execution result:

```text
Final decision: ALLOW
Execution: EXECUTED
Execution code: executed
Transaction: 0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc
```

The Base Sepolia executor constructed the ERC-20 transfer from the authorized Action Contract and allowed only one irreversible broadcast attempt. Confirmation reads may fail over across RPC providers, but transaction semantics cannot change during failover.

### Proof Receipt

- Receipt ID: `878d4350-85c8-44dd-94c2-257641cd7c0c`
- Receipt hash: `0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3`
- Artifact: `data/receipts/878d4350-85c8-44dd-94c2-257641cd7c0c.json`

The receipt binds the Mandate, Action Contract, Telegraph evidence, policy decision, permit, vendor runtime attestation and execution result into one tamper-evident artifact.

## What this live execution proves

This execution demonstrates the core ProofGate authorization boundary with real external effects:

```text
MANDATE
  ↓
EXACT ACTION
  ↓
LIVE TELEGRAPH EVIDENCE
  ↓
DETERMINISTIC POLICY ALLOW
  ↓
ONE-USE PERMIT
  ↓
CONTROLLED BASE SEPOLIA EXECUTION
  ↓
VERIFIABLE PROOF RECEIPT
```

It is not a visual simulation and it does not reuse historical evidence for a different destination.

## Scope note

The canonical live transaction used ProofGate's local/demo permit-signing and filesystem-backed permit-consumption compatibility path.

The repository separately contains production-oriented hardening for Ed25519 signing and key lifecycle, shared PostgreSQL permit claims, durable execution state, transaction-intent binding, mandate status authority, cumulative spend authority and an execution kill switch.

Those production-oriented controls are covered by the codebase and automated tests, but should not be described as having been exercised by this specific live transaction unless a separate execution explicitly runs through that deployment path.
