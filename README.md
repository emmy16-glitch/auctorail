# ProofGate

**Agent confidence is not permission to act.**

ProofGate is a **risk-adaptive authorization firewall for autonomous agents** built for the Telegraph Protocol Application Track.

An agent may decide what it wants to do. It cannot create its own permission to cause a consequential external effect.

```text
PRINCIPAL MANDATE
      ↓
AGENT PROPOSAL
      ↓
FREEZE EXACT ACTION
      ↓
DERIVE CONSEQUENCE / REQUIRED EVIDENCE
      ↓
TELEGRAPH INTENT ROUTING
      ↓
MULTI-INTENT + MULTI-MINER EVIDENCE
      ↓
DETERMINISTIC ALLOW / HOLD / BLOCK
      ↓
ONE-USE PERMIT
      ↓
CONTROLLED EXECUTOR
      ↓
PROOF RECEIPT / RESULT
```

## What is new in v1.2

v1.2 makes two major extensions without changing the core rule that **evidence is not authority**.

### 1. Horizontal + vertical intelligence diversity

ProofGate can now scale both the **breadth** and **independence** of Telegraph intelligence with consequence.

- **Vertical diversity**: different Intents such as `FRAUD_DETECTION`, `ONCHAIN_TX_LOOKUP` and `WALLET_BALANCE_CHECK`.
- **Horizontal diversity**: multiple **distinct Telegraph Miners** may be required for the same critical Intent.

For the existing adaptive payment adapter:

| Amount | Tier | Fraud quorum | Other required Intents | Fraud confidence | Max evidence spend | Deadline |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `<= 1 USDC` | LOW | 1 distinct Miner / 1 positive | none | `>= 0.70` | `0.015 USDC` | `15 s` |
| `>1 <=5 USDC` | MEDIUM | 2 distinct Miners / 2 positives, max 4 attempts | `ONCHAIN_TX_LOOKUP` | `>= 0.75` | `0.050 USDC` | `35 s` |
| `>5 <=10 USDC` | HIGH | 3 distinct Miners / 2 positives, max 5 attempts | `ONCHAIN_TX_LOOKUP`, `WALLET_BALANCE_CHECK` | `>= 0.80` | `0.070 USDC` | `60 s` |

MEDIUM/HIGH fraud quorum uses a `0.90` high-confidence negative **early veto**. Final policy is stricter still: any explicit negative result remains `BLOCK`, even if it is below the early-veto threshold.

Duplicate routing to the same Miner does **not** create fake independence. Provider diversity is counted by distinct Miner ID. If Telegraph repeatedly routes to the same provider and the required diversity cannot be obtained within the attempt/deadline/spend budget, ProofGate returns `HOLD`.

> **Higher consequence → more kinds of intelligence + more independent corroboration.**

### 2. General authorization core

Base Sepolia USDC is no longer the architectural limit.

v1.2 adds a generic authorization model:

- `proofgate.action.v2` — canonical arbitrary action envelope
- `proofgate.mandate.v2` — principal authority over action type + exact target + evidence Intents
- `proofgate.decision.v2` — deterministic decision commitment
- `proofgate.permit.v2` — signed short-lived authority bound to the exact action/evidence decision
- `ActionAdapterRegistry` — trusted adapters connect ProofGate to concrete tools
- generic controlled executor — kill switch + Mandate revalidation + atomic replay protection + ambiguity handling

The payment system remains the **first concrete, publicly proven execution adapter**, but the authorization core can now sit in front of other trusted adapters such as a GitHub merge, infrastructure operation or API action.

ProofGate does **not** claim those example tools are already production integrations. Developers implement and register the trusted adapter for the external effect they want to protect.

## Why ProofGate exists

Autonomous systems often collapse three different questions:

1. **What does the model want to do?**
2. **What does independent intelligence say?**
3. **Is the model actually authorized to cause that exact effect?**

ProofGate separates them.

- **Agent** — proposes.
- **Principal / Mandate** — defines standing authority.
- **Telegraph / Miners** — provide independent evidence.
- **ProofGate** — determines how much evidence is required and whether authority + evidence satisfy policy.
- **Permit** — cryptographically binds one successful decision to one exact action.
- **Executor** — is the only route to the protected side effect.

A Miner can say `ALLOW`. That still does not authorize execution by itself.

## Same-Intent Miner quorum

ProofGate does not manually pretend that three API calls equal three independent providers.

For each quorum-protected Intent it records the Miner Telegraph actually served and derives a canonical quorum summary containing:

- required distinct-Miner count
- required positive count
- minimum positive confidence
- bounded maximum attempts
- negative-veto threshold
- observed attempts
- distinct Miner IDs
- positive / negative / uncertain Miner IDs
- duplicate-Miner attempts
- final quorum status

The quorum summary is included in the Evidence Bundle hash. Changing a Miner identity, vote, threshold, attempt count or summary after authorization invalidates the commitment.

### Example HIGH-risk fraud quorum

```text
FRAUD_DETECTION

Telegraph route #1 → Miner A → ALLOW 0.93
Telegraph route #2 → Miner B → ALLOW 0.86
Telegraph route #3 → Miner C → ALLOW 0.82

Distinct Miners: 3/3
Positive votes:   3/2 required
Result:           SATISFIED
```

But:

```text
Miner A → ALLOW 0.93
Miner B → ALLOW 0.86
Miner C → MALICIOUS 0.97

Result: BLOCK
```

A high-confidence negative can stop collection immediately, and final policy never allows an explicit known-negative signal to be averaged away.

## Provider-neutral Telegraph routing

ProofGate asks Telegraph for **what intelligence it requires**, not for a favorite provider:

```text
ProofGate: I require FRAUD_DETECTION for this exact subject.
        ↓
Telegraph routes the request.
        ↓
ProofGate records and verifies the actual serving Miner.
```

For quorum, ProofGate may make bounded additional requests for the same Intent. It does not count duplicate Miner identities as independent corroboration.

This preserves Telegraph routing while allowing ProofGate to demand stronger provider diversity for higher-consequence actions.

## Canonical Evidence Bundle

`proofgate.evidence-bundle.v1` commits the security context used by the adaptive payment policy, including:

- exact action ID/hash, subject, chain and amount
- risk tier and deterministic plan hash
- required quorum rules
- every routed evidence attempt
- actual Miner ID/name/slug
- Intent, label, confidence, applicability
- signal hash and raw-response hash
- attempt number
- x402 payment provenance/cost
- aggregate evidence spend
- canonical quorum summaries
- final `bundleHash`

A different but internally valid Evidence Bundle cannot be swapped in after Permit mint because the decision/Permit commits the original evidence context.

### Integrity is not authenticity

A hash proves the bundle has not changed. It does not prove arbitrary JSON came from Telegraph.

Live evidence authenticity belongs to the trusted acquisition boundary, which owns the actual Telegraph/x402 request, resolves the serving Miner, validates subject/chain/Intent/provenance, and only then constructs the bundle.

**A production permit-minter must not accept an arbitrary agent-supplied Evidence Bundle as authenticated proof.**

## Buying intelligence safely with x402

Buying evidence is itself a machine side effect.

The live adaptive client:

1. freezes the protected action before purchasing evidence;
2. validates the x402 challenge and approved Base Sepolia USDC evidence-payment lane;
3. enforces the global `0.01 USDC` per-request ceiling;
4. enforces the remaining aggregate risk-tier evidence budget;
5. binds signing to the already validated challenge;
6. independently validates the actual `PaymentRequirements` selected for signing;
7. performs one payment-bearing attempt;
8. requires provable settlement;
9. never blindly retries an ambiguous paid request;
10. validates the actual served Miner and returned evidence before accepting it.

This closes the challenge-swap / time-of-check-time-of-use gap found during v1.1 hardening.

## General Action Adapters

Another developer can put ProofGate in front of a consequential tool by registering trusted code that implements a `ProofGateActionAdapter`.

Conceptually:

```ts
const adapter = {
  type: "github.merge",
  policyId: "github.merge.v1",
  policyVersion: 1,

  freeze(proposal) {
    // Return proofgate.action.v2 with exact target + parameters.
  },

  requiredIntents(action) {
    return ["CI_STATUS", "SECURITY_SCAN"];
  },

  async evaluateTrusted({ action, requiredIntents }) {
    // Trusted host obtains/verifies evidence.
    return {
      evidenceCommitmentHash,
      coveredIntents: ["CI_STATUS", "SECURITY_SCAN"],
      checks: trustedChecks
    };
  },

  async execute(action) {
    // Perform the effect using values derived from the frozen action.
  }
};

registry.register(adapter);
```

The generic SDK enforces that:

- the action type/policy returned by `freeze` match the registered adapter;
- the Mandate authorizes the exact action type/target/policy;
- authority is checked **before** potentially paid evidence acquisition;
- every required Intent is delegated by the principal;
- trusted evaluation explicitly covers every required Intent;
- unrequested Intent coverage is rejected;
- required evidence has a cryptographic commitment;
- only all-PASS `ALLOW` can mint a Permit;
- the Permit is reverified before execution;
- the Mandate is re-evaluated at execution time;
- a fail-closed execution kill switch is checked before Permit consumption;
- the Permit is atomically consumed before the protected callback;
- replay is blocked;
- a thrown result after a possible external effect becomes `AMBIGUOUS`, never an automatic retry.

**Adapters are trusted deployment code, not untrusted plugins.** The host must review the adapter and ensure the agent has no second direct path to the protected tool.

See `docs/DEVELOPER_INTEGRATION.md`.

## Real on-chain proof

The frozen `v1.0.0-hackathon` build completed a genuine end-to-end protected execution on **2026-09-02**:

- Base Sepolia (`84532`)
- protected amount: **1 Base Sepolia USDC**
- vendor: `0xB38d0405DF1b15961aEf29C7c45f2ED285822c14`
- genuine Telegraph `FRAUD_DETECTION`
- Miner: `Refut On-Chain Risk` (`95822412`)
- verdict: `ALLOW`
- confidence: `0.7`
- signal hash: `0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c`
- transaction: `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc`
- block: `46301208`
- receipt hash: `0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3`

Basescan:

https://sepolia.basescan.org/tx/0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc

See `docs/LIVE_EXECUTION.md`.

This historical transaction proves the core real execution boundary. It did **not** use v1.2 same-Intent quorum or the new generic adapter path, and we do not claim that it did.

## Security validation

The current v1.2 code snapshot has passed GitHub CI with:

```text
Vitest:                         43/43 test files
Tests:                          225/225

Original authorization fuzz:   1100/1100 contained
Valid controls:                 100/100
Unauthorized executions:       0

Adaptive + quorum fuzz:         3100/3100 contained
Valid controls:                 100/100
Unauthorized authorizations:   0

General authorization fuzz:    3100/3100 contained
Valid controls:                 100/100
Unauthorized executions:       0

Total deterministic adversarial cases: 7300/7300
Uncaught fuzz errors:                   0
Production npm audit:                   0 vulnerabilities
```

All fuzz harnesses are offline and perform **zero Telegraph requests, zero x402 payments and zero blockchain writes**.

The generic suite attacks action/target/parameter substitution, Mandate substitution/revocation/expiry, forged decision semantics, evidence-commitment substitution, Permit forgery/binding/expiry, kill-switch failures, replay, ambiguous effects, adapter Intent-coverage bypasses, undelegated evidence spending, freeze-contract mismatch and malformed action parameters.

Run locally:

```bash
npm ci
npm run ci
npm run audit:prod
npm run attack:lab
npm run security:fuzz
npm run security:fuzz:adaptive
npm run security:fuzz:general
npm run vendor:verify
```

GitHub CI additionally recompiles the pinned vendor Solidity artifact with native `solc 0.8.36+commit.8a079791` on Linux x64 and fails on artifact drift.

## Honest current scope

What is real today:

- a real protected Base Sepolia USDC execution exists from v1.0;
- v1.2 implements and tests same-Intent distinct-Miner quorum logic;
- v1.2 implements and tests a general Action/Mandate/Decision/Permit/Executor core;
- developers can register trusted custom action adapters.

What is **not** claimed yet:

- a saved live three-Miner Telegraph quorum artifact has already been captured;
- GitHub/cloud/database adapters are shipped production integrations;
- the historical Base Sepolia transaction exercised v1.2 quorum/general paths;
- ProofGate has undergone an independent production audit;
- arbitrary third-party adapters are safe without review/sandboxing.

The live adaptive payment path remains the concrete Telegraph integration and Base Sepolia USDC remains the only publicly demonstrated real protected external effect. v1.2 generalizes the **authorization architecture**, not the historical proof artifact.

## Repository map

```text
contracts/          Canonical ProofGateVendor demo contract
src/core/           payment v1 + generic action.v2 / mandate.v2
src/telegraph/      routing, x402, adaptive planning, Miner quorum, bundles
src/policy/         strict, attested-vendor and adaptive payment policies
src/permit/         payment + generic Permit/decision signing and verification
src/executor/       payment + generic controlled execution/replay protection
src/sdk/            trusted payment SDK + generic Action Adapter Registry
src/receipt/        Proof Receipt v2/v3
src/security/       kill switch and defensive controls
scripts/            live proof, gateway and three fuzz harnesses
tests/              deterministic regression/security tests
docs/               architecture, integration, validation and demo runbooks
```

## Read next

- `docs/ARCHITECTURE.md` — complete v1.2 trust boundaries and invariants
- `docs/DEVELOPER_INTEGRATION.md` — integrate a custom action adapter safely
- `docs/V1_2_GENERAL_QUORUM.md` — v1.2 design and quorum semantics
- `docs/V1_2_VALIDATION.md` — exact release validation snapshot
- `docs/HACKATHON_DEMO.md` — judge-facing demo sequence
- `docs/LIVE_EXECUTION.md` — canonical real v1.0 transaction
- `docs/ATTACK_LAB.md` — all deterministic security harnesses

## Principle

**Telegraph tells autonomous software what the outside world says. The principal defines what the agent may do. ProofGate decides how much breadth and independence of intelligence the consequence deserves, then turns sufficient evidence plus delegated authority into one-use permission for one exact action.**
