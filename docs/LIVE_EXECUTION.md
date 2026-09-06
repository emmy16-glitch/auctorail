# Auctorail canonical live execution proof

This document records the canonical end-to-end protected payment completed on **Base Sepolia on 2026-09-02**.

It is the strongest public proof in the repository that Auctorail crossed the boundary from deterministic authorization logic into a genuine external evidence purchase and protected on-chain effect.

The transaction predates the final Auctorail rebrand. Some immutable artifacts therefore still contain the historical `ProofGate` name. They are preserved exactly because changing historical proof artifacts for branding would reduce provenance.

## Executive summary

Auctorail's authorization boundary approved and executed a **1 USDC** Base Sepolia payment to the already-deployed historical `ProofGateVendor` contract after validating delegated authority, a frozen exact action, genuine Telegraph fraud evidence, runtime attestation and a deterministic authorization decision.

```text
PRINCIPAL MANDATE
        ↓
EXACT FROZEN PAYMENT
        ↓
GENUINE TELEGRAPH/x402 EVIDENCE
        ↓
VENDOR RUNTIME ATTESTATION
        ↓
DETERMINISTIC ALLOW
        ↓
SHORT-LIVED ONE-USE PERMIT
        ↓
PROTECTED BASE SEPOLIA EXECUTION
        ↓
PROOF RECEIPT
```

## Public execution result

| Field | Value |
| --- | --- |
| Network | Base Sepolia |
| Chain ID | `84532` |
| Asset | Base Sepolia USDC |
| Amount | `1 USDC` (`1000000` minor units) |
| Sender | `0xC07a448DF2E1F3AF0d6f0E8cCe45d5D753fc8eF4` |
| Destination | `0xB38d0405DF1b15961aEf29C7c45f2ED285822c14` |
| Transaction | `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc` |
| Base Sepolia block | `46301208` |
| Transaction status | Success |

BaseScan:

https://sepolia.basescan.org/tx/0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc

## Authorization chain in detail

### 1. Principal Mandate

Historical run values:

| Field | Value |
| --- | --- |
| Mandate ID | `treasury-demo-attested-v1` |
| Principal | `company-demo` |
| Agent | `procurement-agent` |
| Policy | `payments.attested-vendor.v1` |
| Mandate hash | `0x052a7e9a3ab0398f9636c795550c89b41eff82aad95cb86fd4c477ad084f5687` |

The important architectural property is that standing authority existed **before** external evidence was treated as relevant.

Telegraph did not decide what the agent was allowed to spend. The principal's Mandate established the authorization envelope.

### 2. Exact frozen action

| Field | Value |
| --- | --- |
| Action hash | `0x0989c7d9470c6d26d873fa23670fb66565534e274b5a56d35fa6abd5bab0fbf4` |
| Chain | Base Sepolia (`84532`) |
| Token | Base Sepolia USDC |
| Amount | `1000000` |
| Destination | `0xb38d0405df1b15961aef29c7c45f2ed285822c14` |
| Reason | `Invoice INV-1042` |

The action commitment prevents the authorization from becoming a vague permission such as “procurement-agent may pay this vendor.”

Changing amount, destination, chain, token or another protected semantic changes the action binding and requires new authorization.

### 3. Genuine Telegraph fraud evidence

Artifact:

`data/evidence/telegraph-2026-09-02T17-36-12-826Z.json`

Verified fields:

| Field | Value |
| --- | --- |
| Source | Telegraph |
| Required Intent | `FRAUD_DETECTION` |
| Serving Miner | `Refut On-Chain Risk` |
| Miner ID | `95822412` |
| Subject | canonical vendor |
| Chain | Base Sepolia (`84532`) |
| Verdict | `ALLOW` |
| Confidence | `0.70` |
| Applicability | `APPLICABLE` |
| Signal hash | `0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c` |
| Raw response hash | `0x442bc3463cae1c9f8ba9a5fce124ffd96cec720f0f24a41dc322b3b905cc361d` |

### 4. Genuine x402 evidence payment

The Telegraph challenge selected an approved Base Sepolia USDC payment lane.

| Field | Value |
| --- | --- |
| Evidence charge | `10000` minor units (`0.01 USDC`) |
| Settlement success | `true` |
| Settlement tx | `0xc135d16a7abf5fdfc9f9dcaec001e5369865c5004224cd6bb9a822fb900daef0` |

The implementation validated payment-lane constraints before accepting the paid evidence flow.

This matters because external evidence acquisition is itself a machine side effect.

### 5. Vendor runtime attestation

Artifact:

`data/evidence/vendor-attestations/vendor-runtime-2026-09-02T17-38-18-411Z.json`

| Field | Value |
| --- | --- |
| Runtime Keccak-256 | `0x12c20655de1ed03a8e646cb98f8ce51e033ec28dc38b7c9383b8f96d02d07a93` |
| Attestation hash | `0x4d63927d1dc90819efb71138cbabf9fd1439551257f11c92f2a1842e391c7922` |
| Attested block | `46301204` |

This ensured the protected destination's deployed runtime matched the expected artifact for the historical attested-vendor policy.

### 6. Deterministic policy decision

The preserved historical output was:

```text
PROOFGATE: ALLOW
Reason: composite_attested_vendor_checks_passed
```

`PROOFGATE` is retained here because it is the literal historical output generated before the rebrand.

The important point is that the Miner verdict was not sufficient by itself. The policy combined:

- delegated Mandate authority;
- exact action semantics;
- supported chain/asset/destination/amount;
- genuine Telegraph evidence;
- confidence/applicability/signal commitment;
- vendor runtime attestation;
- policy checks.

### 7. One-use permit

| Field | Value |
| --- | --- |
| Permit ID | `a1b4e53c-0e0e-4504-b0b0-a05ec80093bb` |
| Decision hash | `0x5f159b8bac7fa9807347decad0f8875fd3b5b4a7e41dbd3475c82d54cb0f054e` |
| Historical permit expiry window | 30 seconds |

The permit bound execution authority to the exact authorization context rather than creating a reusable spending credential.

### 8. Protected execution

Recorded execution result:

```text
Final decision: ALLOW
Execution: EXECUTED
Execution code: executed
Transaction: 0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc
```

The executor constructed the ERC-20 transfer from the authorized action.

The historical execution design allowed confirmation reads to fail over across RPC providers while preserving transaction semantics. Failover could not silently change amount, recipient or action meaning.

### 9. Proof Receipt

Artifact:

`data/receipts/878d4350-85c8-44dd-94c2-257641cd7c0c.json`

| Field | Value |
| --- | --- |
| Receipt ID | `878d4350-85c8-44dd-94c2-257641cd7c0c` |
| Receipt hash | `0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3` |

The receipt binds the important authorization and execution facts into a tamper-evident artifact.

## What this execution proves

This artifact chain demonstrates that Auctorail has exercised:

- principal-controlled authorization context;
- exact frozen payment semantics;
- genuine Telegraph Miner acquisition;
- genuine x402 evidence payment;
- explicit Miner/Intent/subject/chain/confidence/signal data;
- deterministic policy authorization;
- short-lived execution authority;
- protected Base Sepolia USDC transfer;
- public on-chain transaction reference;
- tamper-evident proof receipt.

It is not a browser-only simulation.

## What this execution does not prove

This specific transaction predates later architecture and should not be used to claim that the transaction itself exercised every feature now present in `main`.

Do **not** claim this exact run exercised:

- the later `payments.adaptive.v1` multi-tier policy in its current form;
- a successful HIGH three-distinct-Miner quorum;
- the later generalized action-adapter path;
- every current Content Trust feature;
- every newer durable PostgreSQL/Ed25519-oriented deployment control;
- the current 12-second LOW evidence window.

Those are current code/test capabilities or later design elements, not properties retroactively added to the 2026-09-02 transaction.

## Relationship to the current LOW adaptive policy

Although the historical transaction used `payments.attested-vendor.v1`, its canonical Telegraph fraud result has confidence `0.70`, matching the current LOW adaptive positive floor.

That makes it useful evidence that the same real Telegraph lane can return the class of bound fraud evidence required by current LOW authorization.

But runtime adaptive authorization still requires a fresh current evidence acquisition; this historical artifact is not permanent permission.

## Why the historical `ProofGateVendor` name remains

The deployed contract and its artifacts predate the Auctorail rename.

Changing:

```text
ProofGateVendor
proofgate.* schema names
historical output strings
artifact filenames/hashes
```

after the fact would damage provenance and could break compatibility/hash references.

The correct interpretation is:

```text
Auctorail = current product
ProofGateVendor / proofgate.* = preserved historical protocol/deployment identifiers
```

## Reproducing the proof review

A reviewer can independently inspect:

1. the Telegraph evidence JSON;
2. the vendor runtime attestation artifact;
3. the stored proof receipt;
4. the Base Sepolia transaction on BaseScan;
5. the current source/tests explaining how those categories of artifacts are validated.

## Public claim wording

Recommended:

> Auctorail has a real payment lane. The repository contains genuine Telegraph/x402 fraud evidence and a protected 1-USDC Base Sepolia execution with a public transaction and proof receipt.

Avoid:

> Every current Auctorail control was proven by this one historical transaction.

That would overstate what the artifact demonstrates.

## Current broader validation

Separate from this historical live proof, current `main` also has:

```text
268 / 268 tests passed
7400 / 7400 deterministic adversarial cases contained
0 unauthorized executions / authorizations in the fuzz suites
0 production dependency vulnerabilities reported by npm audit
```

Those validation results prove current deterministic implementation behavior; the canonical transaction proves a real external-effect path.

## Final proof principle

**The value of this artifact is not that a transaction succeeded. It is that a real external effect is traceable through delegated authority, an exact frozen action, genuine paid Telegraph evidence, deterministic authorization, one-use execution authority and a verifiable receipt.**
