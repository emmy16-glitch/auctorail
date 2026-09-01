# ProofGate Attack Lab

The Attack Lab is a deterministic, offline security harness for the ProofGate
authorization boundary.

It does not call Telegraph, does not make x402 payments, and does not broadcast
transactions. Its "execution" callback is a local counter only.

The lab exercises the exact invariants that matter after an agent receives an
ALLOW decision:

1. A valid exact permit executes once.
2. A consumed permit cannot be replayed.
3. Changing the authorized amount invalidates the action hash.
4. Swapping the evidence subject breaks evidence binding.
5. Forging a permit signature fails authentication.
6. An expired permit cannot execute.
7. Tampering with the decision breaks the decision hash.
8. Rebinding to another mandate breaks the mandate hash.
9. A negative Telegraph verdict still BLOCKs even with valid runtime proof.
10. Tampering with the vendor runtime attestation BLOCKs.
11. Tampering with a completed Proof Receipt breaks receipt verification.

Run:

```bash
npm run attack:lab
```

Expected summary:

```text
RESULT: 10/10 attacks contained
Telegraph requests: 0
x402 payments: 0
Blockchain writes: 0
```

The fixtures in this lab are explicitly synthetic security-test fixtures. They
must not be presented as live Telegraph Miner activity. ProofGate's live demo
uses separately captured real Telegraph/x402 evidence and real Base Sepolia
execution artifacts.
