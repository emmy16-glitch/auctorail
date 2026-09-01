# ProofGate Resilience Invariants

ProofGate must be resilient without weakening authorization.

## Primary Rule

Infrastructure may change automatically.
The authorized action may not.

A retry may change:
- RPC provider
- connection route
- timeout
- retry delay
- gas fee parameters
- Telegraph Miner discovery result
- x402 challenge/payment route
- confirmation provider

A retry may NOT silently change:
- destination
- amount
- asset
- chain
- action type
- policy ID
- other protected Action Contract fields

Changing a protected field creates a NEW Action Contract and requires:
PROPOSE -> PROVE -> DECIDE -> PERMIT again.

## Safe Read Operations

Reads may automatically:
1. retry with bounded exponential backoff
2. fail over between healthy providers
3. refresh stale registry data
4. retry another live Telegraph route where protocol routing permits
5. stop and return HOLD if evidence cannot be established

## Irreversible Write Operations

Never blindly retry an ambiguous write.

After a timeout:
1. check the transaction hash across all available RPCs
2. check sender nonce
3. check destination/on-chain state
4. determine whether execution already happened
5. only then decide whether a retry is safe

If replacement is required:
- preserve the same semantic action
- preserve the appropriate nonce
- only increase transaction fee parameters
- never execute twice

## Failure Classification

TRANSIENT
Examples: RPC timeout, temporary network error.
Response: automatic retry/failover.

AMBIGUOUS
Examples: transaction broadcast but confirmation unavailable.
Response: reconcile state before any retry.

INSUFFICIENT PROOF
Examples: Telegraph unavailable, stale evidence, low confidence.
Response: HOLD.

POLICY / SECURITY FAILURE
Examples: wrong destination, excessive amount, expired permit.
Response: BLOCK.

COMPLETED
Permit consumed or transaction confirmed.
Response: never retry execution.

## Idempotency

All protected execution must be idempotency-aware.

permitId + nonce identify one authorization.

One authorization may cause at most one protected execution.

## Wallet Maintenance Exception

Operational maintenance such as sweeping a test wallet may dynamically
calculate a safe transferable ETH balance after reserving gas.

This is NOT permission to mutate a ProofGate-protected Action Contract.

## Design Goal

ProofGate should recover automatically from infrastructure failures where
doing so cannot change the authorized effect.

When recovery could create uncertainty about whether an irreversible action
already occurred, ProofGate reconciles state instead of guessing.
