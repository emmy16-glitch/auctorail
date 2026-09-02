# ProofGate Attack Lab

The Attack Lab is a deterministic, offline defensive security harness for the ProofGate authorization boundary.

It is intentionally isolated from live external side effects:

- no Telegraph requests
- no x402 payments
- no blockchain writes
- no real wallet spending

Its execution callback is local test instrumentation only.

## What the lab proves

The current harness contains **one valid baseline control plus ten adversarial scenarios**.

The baseline proves that a correctly bound permit/action can execute exactly once. The ten adversarial scenarios then verify that the authorization boundary rejects or contains the relevant mutations and replay attempts.

Current cases are:

1. **Baseline control:** a valid exact permit executes once.
2. **Attack:** a consumed permit cannot be replayed.
3. **Attack:** changing the authorized amount invalidates the action binding.
4. **Attack:** swapping the evidence subject breaks evidence binding.
5. **Attack:** forging a permit signature fails authentication.
6. **Attack:** an expired permit cannot execute.
7. **Attack:** tampering with the decision breaks the decision commitment.
8. **Attack:** rebinding to another Mandate breaks mandate binding.
9. **Attack:** a negative Telegraph verdict still `BLOCK`s even when supplemental runtime proof is valid.
10. **Attack:** tampering with the vendor runtime attestation `BLOCK`s.
11. **Attack:** tampering with a completed Proof Receipt breaks receipt verification.

Run:

```bash
npm run attack:lab
```

Expected summary for the current harness:

```text
RESULT: 10/10 attacks contained
Telegraph requests: 0
x402 payments: 0
Blockchain writes: 0
```

The valid baseline is deliberately not counted as an attack, which is why the report is `10/10` even though eleven total cases are printed.

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
