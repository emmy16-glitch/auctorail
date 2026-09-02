# ProofGate

**Agent confidence is not permission to act.**

ProofGate is a pre-execution control plane for autonomous AI agents. It turns verified Telegraph intelligence into a short-lived, single-use authorization bound to one exact proposed action.

`PROPOSE → PROVE → PERMIT → EXECUTE → RECEIPT`

## Core security properties

- Exact-action canonicalization and SHA-256 binding
- Real Telegraph Miner evidence; no simulated Miner data in the live path
- Deterministic `ALLOW / HOLD / BLOCK` policy evaluation
- Evidence subject, chain, applicability, confidence, signal-hash and freshness checks
- HMAC-authenticated, evidence-bound, short-lived permits
- Atomic single-use permit consumption and replay protection
- Explicit ambiguity handling for irreversible writes
- Operation journaling before external side effects
- Tamper-evident proof receipts
- Fail-closed x402 payment policy locked to Base Sepolia USDC

## Flagship demo

ProofGate protects an autonomous treasury payment of **1 Base Sepolia USDC** to the deployed `ProofGateVendor` contract.

Canonical vendor:

`0xB38d0405DF1b15961aEf29C7c45f2ED285822c14`

The vendor contract intentionally has no owner, admin, pause, proxy, upgrade authority or privileged withdrawal path. Telegraph evidence about that destination is evaluated independently by `payments.strict.v1`; a Miner verdict is never itself permission.

## Local checks

```bash
npm ci
npm run ci
```

`npm run ci` runs strict TypeScript checking and the full Vitest security suite. Run `npm run audit:prod` to audit only the dependencies shipped to production; CI enforces that this audit remains clean.

The Solidity compiler used by `vendor:compile` is development-only tooling and is intentionally kept out of production dependencies. Production installs must use `npm ci --omit=dev` so compiler-only transitive packages cannot enter the runtime image.

`npm run vendor:compile` downloads the official native Solidity `0.8.36+commit.8a079791` binary into the ignored `.tools/` cache, verifies its SHA-256 digest, compiles with the pinned optimizer settings, and writes the tracked `artifacts/vendor/ProofGateVendor.build.json` manifest. The manifest records the source hash, compiler binary hash, compiler settings, and creation/runtime bytecode hashes. CI recompiles the artifact and fails if either tracked artifact changes.

## Live Telegraph proof

Refresh the live registry first:

```bash
bash scripts/discover-telegraph.sh
```

Then run the protected proof stage against the exact vendor destination:

```bash
npm run proof:live -- 0xB38d0405DF1b15961aEf29C7c45f2ED285822c14
```

The live proof command:

1. freezes the 1 USDC Action Contract first;
2. records an operation journal before any paid attempt;
3. obtains the real Telegraph x402 challenge;
4. accepts only `exact / eip155:84532 / Base Sepolia USDC` and a price at or below the standing 0.01 USDC proof cap;
5. never hardcodes Telegraph's dynamic `payTo` address;
6. starts the x402 attempt only after the lane passes policy;
7. never blindly retries an ambiguous paid attempt;
8. saves evidence only after a genuine successful Miner response;
9. evaluates that evidence against the already-frozen action; and
10. emits an auditable HOLD receipt when proof cannot be established.

A facilitator-side response such as `insufficient_credits: facilitator returned 403` is classified as a non-retryable external `HOLD`. It is not treated as missing wallet USDC, and ProofGate does not loop paid requests hoping the condition changes.

## Inspect an existing decision

```bash
npm run policy -- \
  0xB38d0405DF1b15961aEf29C7c45f2ED285822c14
```

Evidence lookup is exact-target and exact-chain. Newer evidence for a different address is never substituted for the proposed action.

## Runtime state

`.env` and `.proofgate/` are ignored by Git. Never commit private keys, permit secrets, wallet recovery files, payment signatures or other runtime credentials.

## Hackathon

Built for the Telegraph Protocol Application Track.
