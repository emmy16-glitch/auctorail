# ProofGate Attack Lab

The Attack Lab is a deterministic, offline defensive security harness for the ProofGate authorization boundary.

It is intentionally isolated from live external side effects:

- no Telegraph requests
- no x402 payments
- no blockchain writes
- no real wallet spending

Its execution callback is local test instrumentation only.

## What the lab proves

The lab exercises security invariants that matter after an agent appears to have enough information to proceed.

Current scenarios include:

1. A valid exact permit executes once.
2. A consumed permit cannot be replayed.
3. Changing the authorized amount invalidates the action binding.
4. Swapping the evidence subject breaks evidence binding.
5. Forging a permit signature fails authentication.
6. An expired permit cannot execute.
7. Tampering with the decision breaks the decision commitment.
8. Rebinding to another Mandate breaks mandate binding.
9. A negative Telegraph verdict still `BLOCK`s even when supplemental runtime proof is valid.
10. Tampering with the vendor runtime attestation `BLOCK`s.
11. Tampering with a completed Proof Receipt breaks receipt verification.

Run:

```bash
npm run attack:lab
```

Expected summary for the current 11-scenario harness:

```text
RESULT: 11/11 attacks contained
Telegraph requests: 0
x402 payments: 0
Blockchain writes: 0
```

## What the lab does not prove

The Attack Lab is not a substitute for:

- live Telegraph integration testing
- live x402 settlement verification
- Base Sepolia transaction confirmation
- PostgreSQL failover testing
- independent smart-contract audit
- production key-management review
- final submission-SHA security validation

Its fixtures are explicitly synthetic defensive test fixtures and must never be presented as live Miner activity.

## Final hackathon validation

The repository also contains broader authorized defensive audit artifacts from an earlier assessed revision. Those results are evidence for the revision identified inside the audit report, not a blanket claim over all later commits.

After the hackathon implementation is frozen, the final validation should be regenerated against the exact submission commit and should include the current durable/PostgreSQL architecture, especially:

- shared permit-claim races
- amount and destination mutation
- stale semantic action hashes
- mandate substitution/revocation/expiry
- policy-version mutation
- evidence substitution and freshness
- forged/rotated/revoked signing keys
- cumulative-spend races
- transaction-intent mutation
- database failure before claim
- RPC ambiguity after possible broadcast
- receipt tampering

The key success criterion remains simple:

> Unauthorized or incorrectly bound input must never reach the protected external action.
