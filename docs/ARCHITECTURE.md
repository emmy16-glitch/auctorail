# Auctorail architecture

Auctorail is a **pre-execution authorization layer for autonomous agents**.

The core security rule is simple:

> **The component that proposes an action must not be able to create, expand, or bypass the authority required to execute it.**

Auctorail separates four things that agent systems often collapse into one step:

1. what the agent wants to do;
2. what the principal already allowed;
3. what external evidence says about the exact action or subject; and
4. whether enough authority and evidence exist to permit the consequence.

```text
PRINCIPAL MANDATE
      ↓
AGENT PROPOSAL
      ↓
FREEZE EXACT ACTION / SUBJECT
      ↓
AUTHORITY PREFLIGHT
      ↓
DERIVE REQUIRED EVIDENCE
      ↓
TELEGRAPH / x402 ACQUISITION
      ↓
VERIFY BINDING + QUORUM
      ↓
ALLOW / HOLD / BLOCK
      ↓
ONE-USE AUTHORITY (EXECUTABLE LANES)
      ↓
PROTECTED EXECUTOR
      ↓
RECEIPT
```

A favorable Miner result is evidence. It is **not** permission by itself.

> **Naming note:** Auctorail is the current product name. Historical schema identifiers such as `proofgate.action.v2`, compatibility files such as `src/sdk/proofgate.ts`, and the already deployed `ProofGateVendor` contract intentionally keep the old name because changing them would break compatibility or historical proof.

---

## 1. Trust boundaries

### Principal

The principal creates standing authority before the agent acts. The principal controls things such as:

- which agent is authorized;
- allowed action types;
- allowed targets or destinations;
- amount ceilings;
- chain and asset restrictions;
- allowed evidence Intents;
- policy and version;
- expiry, status and revocation.

The agent does not get to rewrite this authority while asking for permission.

### Autonomous agent

The agent may reason, plan and propose. It does not own the authoritative Mandate, live Telegraph/x402 wallet, permit-signing key, replay store, kill switch or protected execution wallet.

### Telegraph and Miners

Telegraph provides external intelligence. Auctorail requests an Intent and records the actual serving Miner. Miner output is treated as evidence that must still pass policy and binding checks.

### Trusted evidence boundary

This boundary owns live Telegraph/x402 acquisition and verifies the parts the agent must not be trusted to supply, including:

- requested Intent;
- actual serving Miner identity;
- exact subject;
- exact chain where required;
- confidence and applicability;
- signal commitment/hash;
- x402 payment provenance;
- bounded attempts, time and evidence spend.

### Policy and decision authority

Policy evaluates the frozen action, Mandate and committed evidence and returns one of:

- `ALLOW`
- `HOLD`
- `BLOCK`

### Permit authority

Executable lanes may mint a short-lived single-use capability only after `ALLOW`. The permit is bound to the exact action, Mandate, decision and evidence commitment.

### Protected executor

The executor is the only supported path to the protected side effect. It rechecks the current authority, validates the permit, atomically consumes it and then performs the external effect.

---

## 2. Authority and evidence are deliberately separate

Auctorail asks two different questions:

```text
How much evidence does this consequence deserve?

What is this agent actually authorized to do?
```

The evidence tier answers the first question. The Mandate and policy answer the second.

This means stronger evidence can satisfy already delegated authority, but it cannot manufacture new authority.

Example:

```text
A 75 USDC proposal may classify as HIGH evidence.
The current autonomous payment ceiling is still 10 USDC.
Therefore the payment is BLOCKED even if HIGH evidence could be collected.
```

See [`RISK_POLICY.md`](RISK_POLICY.md).

---

## 3. Action models

### Payment action — v1

The proven payment path is intentionally narrow:

- Base Sepolia (`84532`);
- canonical Base Sepolia USDC;
- exact amount;
- exact EVM destination;
- reason/reference;
- policy ID/version.

Security-relevant fields are canonicalized and hashed. Changing amount, recipient, chain, asset, reason or policy changes the action binding and invalidates prior authorization.

### General action envelope — v2

The generic model uses the historical wire identifier `proofgate.action.v2`.

It commits:

- namespaced action type;
- exact target;
- bounded JSON-safe parameters;
- policy ID/version;
- creation time;
- canonical payload;
- action hash.

The generic Action Adapter system is trusted application code. It is **not** a sandbox for arbitrary third-party plugins.

---

## 4. Mandates

The payment lane uses `proofgate.mandate.v1`; the generic lane uses `proofgate.mandate.v2`.

A Mandate binds the principal's standing authority independently of the agent's reasoning context.

A proposal outside Mandate scope is rejected **before live evidence acquisition**. This prevents an undelegated request from spending the principal's Telegraph/x402 evidence budget first and only later discovering that it was never authorized.

Mandates are checked again when executable authority is created and again immediately before execution. A still-live permit must not outlive revoked or expired authority.

---

## 5. Consequence-adaptive payment evidence

The current implementation in `src/telegraph/adaptive-evidence-plan.ts` derives evidence requirements from the frozen payment amount.

| Proposed amount | Tier | Fraud requirement | Additional Intents | Max evidence spend | Deadline |
| --- | --- | --- | --- | ---: | ---: |
| `<= 5 USDC` | LOW | 1 distinct positive Miner at `>= 0.70` | none | `0.035 USDC` | `35s` |
| `> 5 to 50 USDC` | MEDIUM | 2 distinct positive Miners at `>= 0.75` | `ONCHAIN_TX_LOOKUP` | `0.060 USDC` | `60s` |
| `> 50 USDC` | HIGH | 3 distinct Miners, at least 2 positives at `>= 0.80` | `ONCHAIN_TX_LOOKUP` + `WALLET_BALANCE_CHECK` | `0.100 USDC` | `90s` |

These are Auctorail's current product/demo defaults, not universal financial-risk rules.

The current autonomous execution ceiling remains **10 USDC per action**.

### Negative evidence

Every fraud tier supports a high-confidence early negative veto. Final payment policy is stricter: **any explicit negative evidence blocks**. A known negative is not averaged away by a positive majority.

---

## 6. Evidence diversity

Auctorail uses two kinds of diversity.

### Vertical diversity

Different Intents answer different questions:

```text
FRAUD_DETECTION
+ ONCHAIN_TX_LOOKUP
+ WALLET_BALANCE_CHECK
```

### Horizontal diversity

The same critical Intent can require independent providers:

```text
FRAUD_DETECTION
   ├─ Miner A
   ├─ Miner B
   └─ Miner C
```

Independence is counted by **distinct Miner ID**, not by request count.

Three requests routed to the same Miner still represent one provider. If required diversity cannot be established inside the bounded attempt, time and spend budget, Auctorail returns `HOLD` rather than inventing consensus.

---

## 7. Telegraph routing and x402

Auctorail is Intent-first and provider-neutral.

```text
Auctorail asks for an Intent
        ↓
Telegraph routes/ranks
        ↓
actual serving Miner responds
        ↓
Auctorail records and verifies the provider + evidence
```

Evidence acquisition is itself a machine side effect because it may spend money through x402. The live acquisition boundary therefore:

1. freezes the protected action first;
2. runs authority preflight before paid evidence work;
3. validates the x402 challenge;
4. checks network, asset, payee and amount rules;
5. enforces per-request and aggregate evidence budgets;
6. records settlement/provenance;
7. avoids blind paid retries after ambiguous outcomes.

A paid response that cannot satisfy binding or policy may still count against the evidence budget if payment settled, but it does not count toward authorization quorum.

---

## 8. Evidence bundles and commitments

Adaptive payment evidence is committed into an evidence bundle. The bundle records the exact action, evidence plan, accepted Miner attempts, quorum summaries, spend and hashes.

A valid bundle hash proves integrity of the committed structure. It does **not** prove that arbitrary caller-supplied JSON came from Telegraph. Provenance must be established by the trusted acquisition boundary before policy trusts it.

Content Trust follows the same principle: evidence is bound to the exact content hash before a receipt is created.

---

## 9. Decision semantics

### `ALLOW`

All required authority and evidence checks passed.

For an executable lane, permit creation may proceed.

### `HOLD`

Auctorail cannot safely authorize yet. Typical causes include:

- required evidence missing;
- evidence stale or too weak;
- insufficient distinct Miner diversity;
- confidence below the required floor;
- deadline or evidence budget exhausted;
- evidence cannot be bound to the exact action.

`HOLD` produces no execution authority.

### `BLOCK`

A hard rule failed. Examples include:

- action outside Mandate scope;
- revoked/expired authority;
- prohibited chain, asset or destination;
- amount above autonomous ceiling;
- action/evidence binding mismatch;
- undelegated Intent;
- explicit negative evidence;
- invalid execution authority.

`BLOCK` dominates `HOLD` when both are present.

---

## 10. One-use authority and replay resistance

Executable payment permits bind security-relevant fields including:

- Mandate hash;
- action hash;
- decision hash;
- policy ID/version;
- permit ID;
- nonce;
- issue/expiry times;
- signer metadata.

The protected executor validates these bindings and atomically claims `permitId + nonce` before the external effect.

The system is designed so the same permit cannot be successfully consumed twice through the supported executor path.

For multi-worker deployments, shared replay state should use the PostgreSQL permit-consumption store rather than independent local filesystems.

---

## 11. Execution, ambiguity and retries

The Base Sepolia payment executor:

1. validates action/decision/evidence/permit bindings;
2. validates chain, asset, amount and destination;
3. consumes the permit atomically;
4. journals the intended transaction;
5. broadcasts once;
6. reconciles confirmation read-only;
7. records a receipt when the outcome is trustworthy.

After dispatch, uncertainty is treated as `AMBIGUOUS` / `UNCERTAIN`, not as a reason to blindly send a replacement transaction. A remote effect may already have happened.

The same principle applies to generic adapters: reconcile uncertain external state before creating a fresh authorization.

---

## 12. General trusted adapters

The historical TypeScript interface name `ProofGateActionAdapter` remains for compatibility.

A trusted adapter defines:

```text
type + policy ID/version
freeze(proposal)
requiredIntents(action)
evaluateTrusted(action, requiredIntents)
execute(action)
```

The generic core verifies adapter metadata, Mandate scope, required evidence coverage, decision semantics, permit bindings, replay state and kill-switch state before executing the trusted callback.

Examples such as GitHub merge or cloud operations demonstrate the integration shape. They are not claimed as production connectors unless separately implemented and tested.

---

## 13. Content Trust

`content.strict.v1` is a second policy built on the same general decision architecture.

The current flow:

```text
text / subject
   ↓
exact subject hash
   ↓
scam / AI-text evidence
   ↓
ALLOW / HOLD / BLOCK
   ↓
content receipt
```

Important semantics:

- strong scam/phishing evidence can block;
- weak, missing or unrecognized required evidence holds;
- AI-written text is informational by itself;
- AI-generation becomes a blocking authorship conflict only when publishing with an explicit human-authorship claim and the configured confidence threshold is crossed;
- the receipt `summaryLine` is included in the receipt hash.

The default Content Trust UI is deterministic demo mode and is clearly labeled as non-Telegraph output. The opt-in live client should only be described as real usage after an actual paid run has been captured and preserved.

---

## 14. Receipt verification

Auctorail exposes a Verify surface for payment and content receipts.

Payment receipt verification recomputes the receipt integrity and checks the action, Mandate, evidence, decision, permit and execution bindings represented by the receipt schema.

Content receipt verification recomputes the receipt hash, exact subject/action binding, evidence commitment and deterministic decision aggregation.

A valid receipt proves integrity and binding under Auctorail's verification rules. It does **not** turn a Miner assessment into objective truth.

---

## 15. Public API boundary

The current web payment path separates policy preflight, live evidence authorization and execution:

```text
POST /api/authorize  (policy preflight)
        ↓
freeze fingerprint
        ↓
POST /api/authorize  (live Telegraph/x402)
        ↓
ALLOW + one-use execution token
        ↓
POST /api/execute
```

Important controls include request validation, rate limits, bounded evidence budget, idempotency, frozen-request TTL, execution-session TTL, exact fingerprint matching and one-use permit consumption.

The repository-local SDK is a hackathon integration package. It should not be described as a production public SDK until a real hosted authentication boundary and public package release exist.

---

## 16. Track 3 role

Auctorail is a **consumption-side Telegraph application**.

```text
Agent / user action
       ↓
Auctorail authorization request
       ↓
Telegraph Miner evidence via x402
       ↓
Auctorail policy + enforcement
       ↓
receipt / protected external effect
```

Auctorail is not a Miner. Its value is turning external intelligence into an enforceable pre-execution decision boundary rather than merely displaying a signal.

The canonical publicly committed real proof remains the genuine Telegraph/x402 payment evidence plus the protected Base Sepolia execution described in [`LIVE_EXECUTION.md`](LIVE_EXECUTION.md) and [`REAL_USAGE_LOG.md`](REAL_USAGE_LOG.md).

---

## 17. What this architecture does not claim

Auctorail does **not** claim that:

- a model process is impossible to compromise;
- a hostile host with another unrestricted tool path can be contained by a TypeScript library alone;
- arbitrary third-party adapters are safe without review;
- Content Trust demo output is real Telegraph output;
- a Miner verdict proves objective truth;
- the project has undergone an independent production security audit.

The deployment must preserve the actual trust boundary: the agent must not have a second direct route to the protected tool.

---

## Source of truth

When prose and implementation disagree, use this order:

1. current source code and constants;
2. committed evidence and receipts;
3. newest green CI / Playwright results;
4. root README and `docs/README.md`;
5. current architecture/risk docs;
6. older milestone documentation.

See [`README.md`](README.md) for the full documentation map.
