# Permit consumption and shared execution authority

Auctorail consumes or claims a permit before protected execution. That consumption record is replay authority, so every executor replica in a multi-worker deployment must share the same strongly consistent durable source of truth.

A model process, HTTP worker or container-local cache must never be able to create its own independent replay state.

## Local filesystem store

`FilePermitConsumptionStore` is retained for:

- local development
- deterministic security tests
- offline Attack Lab runs
- single-host testnet demonstrations

It uses exclusive file creation and is safe for concurrent processes that truly share the same local filesystem.

It is **not** a production multi-host authority.

Do not place separate container-local stores behind a load balancer and assume replay protection is shared.

## PostgreSQL shared permit store

`PostgresPermitConsumptionStore` is the production-oriented shared claim implementation.

It accepts an injected database boundary and claims a permit using one atomic database operation with conflict protection.

Migration:

`migrations/001_permit_consumptions.sql`

The database schema enforces uniqueness for the authorization identity so competing executor replicas cannot both successfully claim the same permit.

All production replicas must point to the same authoritative strongly consistent PostgreSQL database.

Database errors, timeouts, serialization failures and unknown claim outcomes must fail closed through the executor's storage-failure path. They must never be interpreted as replay success, authorization success or permission to invoke the protected callback.

## Durable execution state

Permit claiming answers:

> Has this authorization already been claimed?

It does not, by itself, answer:

> What happened after the claim?

Auctorail therefore also has durable execution state in `src/executor/durable-execution.ts`, backed by the execution migration:

`migrations/002_executions.sql`

The durable layer records execution identity and state around transaction submission so the system can distinguish pre-submit failure from post-submit ambiguity.

Callers that already have a durable execution record should pass the same `executionId` into permit consumption. This binds replay authority to the durable execution lifecycle instead of creating unrelated retry identities.

## Cumulative spend authority

Optional cumulative Mandate limits are enforced through the PostgreSQL spend-authority layer:

- implementation: `src/executor/spend-authority.ts`
- migration: `migrations/003_spend_authority.sql`

The shared spend authority is bound to:

- Mandate hash
- policy ID/version
- chain
- token
- maximum cumulative amount

Spend reservations are made transactionally before submission. Competing reservations lock the shared authority so concurrent workers cannot exceed the delegated cumulative ceiling through a race.

An execution ID is unique across spend reservations.

If a Mandate declares cumulative authority but the correctly bound shared authority cannot be established, durable execution must fail closed.

## Cache guidance

A Redis cache or other eventually consistent cache must not become the sole replay or cumulative-spend authority unless its durability, atomicity, replication, failover and recovery semantics are explicitly proven for the deployment.

If a cache is used as an optimization, the strongly consistent datastore remains authoritative.

## Integration verification

The repository includes an opt-in PostgreSQL integration script:

```bash
npm run test:postgres
```

It requires `PROOFGATE_DATABASE_URL` and exercises the real migrations and shared-store behavior without making Telegraph requests, x402 payments or blockchain writes.

The current integration path checks key properties including:

- permit claim behavior
- execution state round-trip
- transaction-intent persistence
- cumulative-spend race containment
- released reservation reuse
- confirmed reservation consumption

This is useful integration evidence, but it is not a substitute for deployment-specific resilience testing.

## Required production resilience testing

Before treating a multi-host deployment as production-ready, test against the actual PostgreSQL topology for conditions such as:

- connection loss before commit
- connection loss after commit but before acknowledgement
- serialization/deadlock retries
- primary failover
- process crash after permit claim
- process crash before/after transaction submission
- restart reconciliation
- concurrent permit claims
- concurrent cumulative-spend reservations
- ambiguous transaction-provider outcomes

The key invariant is:

> Unknown shared-state authority must stop execution; unknown post-broadcast blockchain state must be reconciled rather than blindly retried.
