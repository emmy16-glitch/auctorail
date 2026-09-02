# ProofGate on Termux / Android ARM

ProofGate v1.1 can run its TypeScript suite, offline security harnesses, Telegraph proof flows, adaptive check flow and architecture-independent vendor verification inside an Ubuntu `proot-distro` environment on Termux.

## Get the v1.1 branch

From `~/proof-gate`:

```bash
git fetch origin
git switch v1.1-adaptive-evidence
git pull origin v1.1-adaptive-evidence
```

If the branch already exists locally, `git switch v1.1-adaptive-evidence` is enough before pulling.

The frozen `v1.0.0-hackathon` tag remains separate and must not be moved.

## Why `vendor:compile` does not run on ARM

The canonical Solidity build is intentionally pinned to the official native compiler:

- compiler: `0.8.36+commit.8a079791`
- canonical platform: `linux-amd64`
- compiler SHA-256 pinned in `scripts/compile-vendor.mjs`

Most Android/Termux devices are `arm64`. ProofGate does not silently replace the canonical compiler/platform and then claim the artifact was reproduced identically.

On unsupported hosts, `npm run vendor:compile` gives an explicit platform message.

## ARM-safe vendor verification

Run:

```bash
npm run vendor:verify
```

This does **not** compile Solidity. It verifies the architecture-independent committed bindings:

- `ProofGateVendor.sol` source hash
- tracked artifact hash
- recorded compiler identity
- creation-bytecode length/hash
- runtime-bytecode length/hash
- source/artifact/manifest consistency

Canonical native recompilation remains a separate stronger CI check on Linux x64.

## v1.1 final local validation

```bash
npm ci
npm run ci
npm run audit:prod
npm run attack:lab
npm run security:fuzz
npm run security:fuzz:adaptive
npm run vendor:verify
git status --short
git rev-parse HEAD
```

Expected hardened security summaries include:

```text
Original fuzz:
1100/1100 adversarial cases contained
100/100 valid controls
0 unauthorized executions

Adaptive fuzz:
1800/1800 adversarial cases contained
100/100 valid controls
0 unauthorized authorizations
```

The current hardened deterministic suite contains `42` test files and `210` tests; always trust the exact output of the revision you actually run if that count changes later.

## Local working-tree caution

Live Telegraph experiments can create local evidence/quarantine/receipt artifacts. Do **not** use:

```bash
git add .
```

Commit only intentionally selected public artifacts after checking them for secrets.

Never print or paste:

- `.env`
- wallet private keys
- seed/recovery phrases
- production permit-signing material
- database credentials

## Adaptive live check

The v1.1 check-only command is:

```bash
npm run proof:adaptive -- 1
```

or the HIGH-risk standout path:

```bash
npm run proof:adaptive -- 7
```

Before it, refresh the registry:

```bash
bash scripts/discover-telegraph.sh
```

Important:

- `proof:adaptive -- 7` may make up to three real Telegraph/x402 evidence purchases;
- it does **not** broadcast the protected 7-USDC vendor payment;
- if a paid request becomes transport-ambiguous, do not blindly rerun it;
- preserve and inspect the existing result first.

## Integrity verification vs canonical recompilation

A successful `vendor:verify` on ARM proves that the checked-in source, artifact and build manifest remain bound to their recorded hashes.

A successful `vendor:compile` in GitHub CI proves that the tracked artifact can be reproduced with the exact pinned native `linux-amd64` compiler configuration.

ProofGate intentionally keeps those claims separate.

## Validation record

See `docs/V1_1_VALIDATION.md` for the hardened code snapshot, CI run and exact security results used to lock the v1.1 architecture before release.
