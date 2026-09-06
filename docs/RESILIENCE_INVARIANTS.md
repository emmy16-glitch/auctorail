# Auctorail Resilience Invariants

Auctorail must recover from infrastructure problems **without weakening authorization or duplicating consequential effects**.

## Primary rule

Infrastructure may change automatically.

The authorized semantic effect may not.

A retry/failover may change operational details such as:

- RPC provider;
- connection route;
- timeout/backoff;
- Telegraph routing result;
- x402 facilitator/payment route within the approved policy;
- confirmation provider;
- transaction fee parameters where the same transaction semantics are preserved.

A retry/failover may **not** silently change protected action semantics such as:

- payment destination/amount/asset/chain;
- generic action type;
- generic target;
- generic action parameters;
- policy ID/version;
- other fields committed in the canonical action hash.

Changing a protected semantic field creates a **new action** and requires fresh:

```text
PROPOSE → EVIDENCE → DECIDE → PERMIT
```

## Safe read/evidence operations

Read-like evidence acquisition may:

1. use bounded retry/backoff where no payment/irreversible effect occurred;
2. refresh stale registry metadata;
3. accept a different Telegraph-routed Miner where protocol routing permits;
4. perform bounded additional same-Intent requests to satisfy a required distinct-Miner quorum;
5. stop with `HOLD` when required proof/provider diversity cannot be established.

### Miner-diversity invariant

Retrying a request does not automatically create independent evidence.

```text
Miner A
Miner A again
Miner A again
```

still represents one distinct serving Miner for quorum accounting.

Distinct-provider requirements are satisfied only by distinct Miner IDs committed into the Evidence Bundle/quorum summary.

## Paid x402 evidence operations

A paid evidence request is not treated as an ordinary idempotent read.

Before payment:

- validate the exact challenge/payment requirements;
- enforce the per-request cap;
- enforce the remaining aggregate evidence budget;
- enforce attempt/deadline bounds.

After a payment-bearing request becomes transport-ambiguous:

- do not blindly submit another payment;
- inspect/reconcile the existing result/settlement state where possible;
- return `HOLD` when sufficient evidence cannot be proven safely.

Provider-diversity goals never justify unlimited payment retries.

## Irreversible payment writes

Never blindly retry an ambiguous blockchain write.

After a possible broadcast:

1. reconcile the locally computed transaction hash across available RPCs;
2. inspect sender nonce;
3. inspect destination/on-chain state;
4. determine whether execution already happened;
5. only create new authorization if a new attempt is actually required and safe.

If a transaction replacement is required, it may alter fee mechanics while preserving the exact authorized semantic action. It must never silently change destination, token or amount.

## Generic external effects

Generic adapters cannot assume all external systems provide blockchain-style transaction reconciliation.

Therefore the generic executor follows this invariant:

```text
Permit claimed
→ adapter callback invoked
→ callback throws / outcome uncertain
→ AMBIGUOUS
→ Permit remains consumed
→ no automatic replay
```

The adapter/integration must provide service-specific reconciliation before another action/Permit is created.

Examples may include checking:

- whether a pull request already merged;
- whether an infrastructure resource already changed state;
- whether an API-created object/idempotency key already exists;
- whether a remote workflow already completed.

Auctorail does not guess that a thrown client error means the external effect did not happen.

## Execution kill-switch invariant

The generic executor checks the operational kill switch **before Permit consumption and before the protected callback**.

```text
kill switch says disabled → BLOCK
kill-switch state unavailable → BLOCK
```

An infrastructure failure reading the emergency control is never treated as permission.

## Execution-time authority invariant

Current Mandate authority is re-evaluated immediately before generic execution.

A still-unexpired Permit cannot be used when its standing Mandate has meanwhile become invalid/expired.

This keeps the Permit subordinate to current principal authority.

## Failure classification

### TRANSIENT

Examples:

- non-paid registry/read timeout;
- temporary safe RPC read error.

Response:

- bounded retry/failover where doing so cannot duplicate a side effect or evidence payment.

### AMBIGUOUS

Examples:

- transaction may have broadcast but confirmation is unavailable;
- generic external callback may have completed before connection/runtime failure;
- paid evidence request may have settled while response delivery failed.

Response:

- reconcile state;
- do not automatically replay the same protected effect/payment.

### INSUFFICIENT PROOF

Examples:

- Telegraph unavailable;
- insufficient distinct Miner diversity;
- insufficient positive quorum;
- stale/low-confidence/uncertain evidence;
- evidence budget/deadline exhausted.

Response:

- `HOLD`;
- no Permit/execution.

### POLICY / SECURITY FAILURE

Examples:

- wrong target/destination;
- prohibited action type;
- expired/revoked Mandate;
- quorum/risk-plan downgrade;
- tampered evidence/Permit;
- explicit negative evidence;
- kill switch disabled/unavailable.

Response:

- `BLOCK`;
- no protected callback.

### COMPLETED

Examples:

- Permit already consumed;
- blockchain transaction confirmed;
- generic adapter callback returned successfully after claim.

Response:

- never execute the same Permit again.

## Idempotency and replay

`permitId + nonce` identify one authorization use.

One Permit may cause at most one protected callback attempt.

Atomic replay state must be shared between executor replicas in production-oriented deployments.

Local filesystem replay state is not sufficient for independent multi-worker authority.

## Adapter responsibility

A trusted generic adapter must:

- derive side-effect parameters from the frozen action;
- use external idempotency/reconciliation facilities where available;
- not accept replacement semantics from the autonomous agent at execution time;
- distinguish known failure from uncertain outcome;
- never retry an ambiguous irreversible effect automatically.

## Wallet-maintenance exception

Operational maintenance such as sweeping a test wallet may dynamically calculate safe transferable ETH after reserving gas.

That operational action is **not permission to mutate a Auctorail-protected Action Contract**.

## Design goal

Auctorail should recover automatically when infrastructure can change without changing or duplicating the authorized effect.

When recovery could create uncertainty about whether money, evidence payment, code, infrastructure or another external effect already happened, Auctorail **reconciles instead of guessing**.
