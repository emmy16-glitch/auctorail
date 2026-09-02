# ProofGate v1.1 Validation Record

This document records the strict validation performed after the v1.1 adaptive-evidence architecture and security hardening were implemented.

## Validated code snapshot

Code SHA:

`68ac50a1e607a7eb89a1fba909657ac00341b79c`

GitHub Actions run:

`33675864125`

Branch:

`v1.1-adaptive-evidence`

This snapshot includes the final code-level hardenings before this validation record was added, including:

- consequence-derived adaptive plans
- provider-neutral Intent routing
- live Telegraph/x402 acquisition boundary
- canonical Evidence Bundles
- evidence-payment provenance validation
- adaptive conflict/uncertainty semantics
- bundle-aware permits/execution
- Proof Receipt v3
- trusted-host developer SDK
- non-authoritative evaluate-only HTTP gateway

Subsequent documentation-only commits must still pass CI before a release/tag is created.

## CI result

**PASS**

### Vendor reproducibility

- tracked vendor source/artifact/manifest verification: PASS
- pinned native `solc 0.8.36+commit.8a079791` recompilation on Linux x64: PASS
- creation bytecode: `258 bytes`
- runtime bytecode: `165 bytes`
- generated-artifact diff check: PASS

### TypeScript and deterministic tests

```text
Test Files: 42 passed / 42
Tests:      210 passed / 210
```

Coverage includes the original v1 controls plus adaptive planning, Intent routing, Evidence Bundles, live-client guards, conflict semantics, x402 provenance, trusted SDK behavior, bundle-bound permits and Receipt v3.

### Original authorization fuzz gate

```text
Mutation families:       11
Cases per family:        100
Adversarial contained:   1100 / 1100
Valid controls:          100 / 100
Unauthorized executions: 0
Uncaught errors:          0
Telegraph requests:       0
x402 payments:            0
Blockchain writes:        0
```

Families include:

- stale action amount hash
- destination swap
- chain confusion
- asset swap
- reason mutation
- permit signature forgery
- evidence subject swap
- evidence chain swap
- decision commitment tampering
- Mandate version substitution
- permit expiry

### Adaptive authorization fuzz gate

```text
Mutation families:            18
Cases per family:             100
Adversarial contained:        1800 / 1800
Valid controls:               100 / 100
Unauthorized authorizations:  0
Uncaught errors:               0
Telegraph requests:            0
x402 payments:                 0
Blockchain writes:             0
```

Families include:

- risk-tier downgrade
- missing `FRAUD_DETECTION`
- missing `ONCHAIN_TX_LOOKUP`
- missing `WALLET_BALANCE_CHECK`
- negative fraud signal
- negative secondary signal
- fraud confidence below floor
- stale required evidence
- missing signal hash
- evidence-budget overrun
- bundle signal-hash tampering
- bundle raw-response-hash tampering
- evidence subject substitution
- substitution of another valid bundle after permit mint
- permit signature forgery
- permit expiry
- action semantic mutation
- un-delegated Intent

The adaptive tamper families explicitly require both bundle-integrity rejection and non-authorization where applicable.

### Additional direct hardening regressions

The deterministic test suite also covers security cases outside the 18 fuzz-family count, including:

- paid Evidence Bundle with wrong x402 network rejected
- paid Evidence Bundle with wrong asset rejected
- per-request evidence payment above global cap rejected
- malformed signal hash rejected even if outer bundle is rehashed
- malformed raw-response hash rejected even if outer bundle is rehashed
- secondary `UNAVAILABLE` status results in `HOLD`
- alternate Evidence Bundle is first proven internally valid, then rejected after permit mint because the decision commitment binds the original bundle
- trusted high-level SDK does not mint a permit on incomplete evidence acquisition
- HTTP evaluation gateway does not return executable authority

## Production dependency audit

```text
npm audit --omit=dev
found 0 vulnerabilities
```

This is a dependency-audit result, not a claim of an independent production security audit.

## Important trust statement

An Evidence Bundle hash proves **integrity**, not source authenticity by itself.

The authoritative production path must construct the bundle inside the trusted Telegraph acquisition boundary. That boundary verifies:

- actual serving Miner identity
- active Miner / supported Intent
- exact subject binding
- exact chain binding
- Telegraph signal metadata
- approved x402 payment lane and budget when paid
- provable settlement
- raw-response commitment

A production permit-minter must not accept arbitrary agent-supplied Evidence Bundles as authenticated Telegraph proof.

## Real-world proof boundary

The frozen v1.0 artifact remains the public real transaction proof:

- transaction: `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc`
- Base Sepolia block: `46301208`
- genuine Telegraph `FRAUD_DETECTION` evidence
- one protected `1 USDC` execution

v1.1's multi-Intent live client is implemented and tested, but a real saved multi-Intent Telegraph Evidence Bundle is deliberately **not claimed** until an actual `npm run proof:adaptive -- ...` run is captured.

## Release gate

Before creating a v1.1 tag:

```bash
npm ci
npm run ci
npm run audit:prod
npm run attack:lab
npm run security:fuzz
npm run security:fuzz:adaptive
npm run vendor:verify
```

GitHub CI must be green on the exact release SHA. On Linux x64 it must also pass the pinned native vendor recompilation/reproducibility check.

If a real adaptive Telegraph artifact is added later, rerun every gate on the new exact SHA before tagging.
