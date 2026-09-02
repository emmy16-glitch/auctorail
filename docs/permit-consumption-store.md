# Permit consumption stores

ProofGate consumes a permit before protected execution. The consumption record is replay authority, so every executor replica in a production deployment must use the same strongly consistent durable store.

## Local filesystem store

`FilePermitConsumptionStore` is retained for local development, offline security tests, and single-host testnet demonstrations. It uses exclusive file creation and is safe for concurrent processes sharing the same local filesystem. It is **not** a production multi-host authority. Do not place separate container-local stores behind a load balancer and assume replay protection is shared.

## PostgreSQL shared store

`PostgresPermitConsumptionStore` is the production candidate. It accepts an injected query client or pool and claims a permit using one atomic `INSERT ... ON CONFLICT ... DO NOTHING RETURNING` operation. The migration is `migrations/001_permit_consumptions.sql`.

All executor replicas must point to the same strongly consistent authoritative PostgreSQL database. Database errors, timeouts, serialization failures, and unknown outcomes must propagate to the executor’s existing `FAILED / permit_store_unavailable` path. They must never be interpreted as replay or success, and the protected callback must not run when the claim result is unknown.

A Redis cache or other eventually consistent cache must not become the sole authority unless its durability, atomicity, replication, failover, and recovery semantics are explicitly proven for the deployment. If a cache is used as an optimization, PostgreSQL remains the authoritative claim store.

## Execution identifiers

The PostgreSQL adapter accepts an optional `executionId` and otherwise generates one. The database schema enforces uniqueness for `(permit_id, nonce)` and for `execution_id`. Callers that have a durable execution record should pass the same execution ID through retries and reconciliation.

## Required production integration tests

The unit tests validate adapter semantics with an injected database boundary; they do not claim to emulate a multi-host PostgreSQL cluster. Before production, run an opt-in integration suite against a real PostgreSQL deployment covering failover, serialization errors, connection loss after commit, restart recovery, and 2/5/10/25/50/100 concurrent claims for one permit.
