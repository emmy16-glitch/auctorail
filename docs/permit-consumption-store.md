# Auctorail permit consumption and replay-prevention model

This document explains how Auctorail treats one-use execution authority, why consumption state must be durable, and how replay/ambiguity concerns interact with protected external execution.

## Core rule

A permit is not a reusable API token.

It represents **one-use authority for one exact protected action**.

Conceptually:

```text
UNUSED
  ↓ atomic consumption
CONSUMED
```

After consumption, the permit must not authorize another execution.

## Why this matters

Without durable consumption, a valid permit could be:

- sent twice intentionally;
- retried by a client after a timeout;
- submitted concurrently from two workers;
- reused after process restart;
- replayed after an attacker captures it.

A signed permit proves integrity/authority, but replay prevention requires trusted state about whether that authority has already been used.

## Permit properties

Execution authority should be:

- cryptographically signed;
- short-lived;
- bound to exact action semantics;
- bound to decision/evidence commitments;
- scoped to the intended executor/action lane;
- consumed once;
- rejected after consumption.

## Trust boundary

Permit-consumption state belongs on the trusted execution side.

The agent/client must not be able to say:

```text
"this permit is unused"
```

and have that statement treated as authoritative.

## In-memory state vs durable state

### In-memory only

Useful for simple tests/demos but weak for durable deployment.

Problems:

- process restart loses consumed state;
- multiple instances do not share state;
- concurrency can race;
- crash recovery is difficult.

### Durable store

Recommended for a real deployment.

Examples include PostgreSQL or another transactional datastore capable of enforcing uniqueness/atomic state transitions.

The important capability is not the database brand; it is the correctness of the consumption transition.

## Suggested data model

Conceptually:

```text
permit_id
permit_hash / binding
status: UNUSED | CONSUMED | EXECUTION_AMBIGUOUS | EXECUTED | FAILED_SAFE
created_at
expires_at
consumed_at
execution_id
idempotency_key
external_reference
```

Exact schema can vary.

## Atomicity requirement

Two concurrent requests must not both observe `UNUSED` and execute successfully.

The transition should use a transaction/conditional update/unique constraint appropriate to the datastore.

Conceptual SQL pattern:

```sql
UPDATE permits
SET status = 'CONSUMED', consumed_at = now()
WHERE permit_id = $1
  AND status = 'UNUSED'
  AND expires_at > now()
RETURNING *;
```

If zero rows are returned, the caller did not acquire execution authority.

This is illustrative; production logic should align the state transition with the actual external-effect lifecycle.

## Consumption timing problem

There is a subtle tradeoff.

### Consume after effect

Unsafe because two concurrent requests could both execute before either marks the permit consumed.

### Consume before effect

Safer for replay, but a crash after consumption and before confirmed external effect creates uncertainty.

Auctorail therefore needs durable execution state and reconciliation rather than a simplistic boolean.

## Execution state machine

A more realistic model:

```text
AUTHORIZED / UNUSED
        ↓ claim atomically
EXECUTION_IN_PROGRESS
        ↓
 ┌──────┼──────────────┐
 ▼      ▼              ▼
EXECUTED KNOWN_FAILURE AMBIGUOUS
                         ↓
                    RECONCILIATION
                         ↓
                  EXECUTED / FAILED
```

The exact repository implementation may use different names, but the security reasoning should preserve this structure.

## Ambiguous external effects

Suppose the executor broadcasts a transaction and the RPC connection drops.

The client sees an error, but the chain may still accept the transaction.

Unsafe behavior:

```text
error → mark permit unused → retry payment
```

Safe behavior:

```text
error after possible effect
→ keep authority consumed/claimed
→ mark execution ambiguous
→ reconcile chain/external system
→ resolve final state
```

## Idempotency

Idempotency keys help identify logical retries.

Example:

```text
invoice-4471-execute
```

A repeated request with the same key can return the known result instead of creating another side effect.

But idempotency is complementary to permit consumption, not a replacement.

## Replay scenarios

### Exact replay after success

```text
permit P executes once
attacker submits P again
```

Expected: reject as consumed.

### Concurrent replay

```text
request A and request B submit P simultaneously
```

Expected: only one can atomically claim execution authority.

### Replay after process restart

Expected: durable store still knows P is consumed/claimed.

### Replay after ambiguous result

Expected: do not reset P to unused merely because the client did not receive a clean response.

### Modified action with same permit

Expected: permit/action binding fails even before replay state matters.

## Expiration

Expiration is another independent condition.

A permit can be:

```text
unused but expired
```

and must still fail.

Do not revive an expired permit client-side.

## Mandate revalidation

Even an unused, unexpired permit may no longer be executable if trusted authority changed.

Execution can re-check:

- Mandate status;
- revocation;
- version;
- kill switch;
- other current trusted controls.

This protects the gap between authorization and execution.

## Kill switch

A fail-closed kill switch can prevent execution regardless of permit validity.

If the kill-switch state cannot be established safely, execution should not proceed.

## Multi-instance deployment

For horizontal scaling:

- all executor instances must share authoritative permit state;
- consumption must be atomic across instances;
- idempotency state must be shared;
- execution/reconciliation state must survive instance loss;
- clocks/expiration behavior should be consistent enough for policy.

Local memory per server instance is insufficient for robust replay protection.

## Database failure behavior

If the permit store is unavailable at execution time, the safe default is:

```text
no protected execution
```

Do not bypass replay protection because storage is down.

## Receipt relationship

After execution/reconciliation, the receipt can bind:

- permit ID/hash;
- action commitment;
- decision/evidence commitment;
- execution status;
- external transaction/reference;
- timestamps.

This creates an inspectable trail from authorization through consumption to outcome.

## Cleanup / retention

Consumed/expired permit records should not be deleted so aggressively that replay protection disappears while an attacker could still present old authority.

Retention policy should account for:

- maximum permit lifetime;
- client retry windows;
- audit needs;
- external reconciliation windows;
- compliance/privacy requirements.

## Security tests

Relevant test families include:

- permit signature forgery;
- permit expiry;
- permit replay;
- action binding tamper;
- decision/evidence binding tamper;
- durable execution behavior;
- executor ambiguity;
- kill-switch disabled/unavailable;
- concurrent/repeated execution semantics where covered.

The Guided Demo also exposes a simple permit replay scenario as `BLOCK`.

## Deployment checklist

- [ ] durable shared permit store;
- [ ] unique permit ID/hash;
- [ ] atomic claim/consume transition;
- [ ] expiration checked server-side;
- [ ] action/decision/evidence binding checked;
- [ ] Mandate revalidated;
- [ ] kill-switch checked;
- [ ] idempotency persisted;
- [ ] ambiguous effects retain claimed authority;
- [ ] reconciliation process exists;
- [ ] receipt/log references stored;
- [ ] secrets excluded from logs;
- [ ] failure of store causes no execution.

## Final rule

**Auctorail's permit is a one-shot capability. Durable state must ensure that one successful authorization cannot be converted into two external effects by replay, concurrency, restart, timeout or ambiguous transport.**
