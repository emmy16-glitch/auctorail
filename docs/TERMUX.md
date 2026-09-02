# ProofGate on Termux / Android ARM

ProofGate can run its TypeScript tests, Telegraph proof flow, Base Sepolia execution flow, Attack Lab and artifact-integrity verification inside an Ubuntu `proot-distro` environment on Termux.

## Why `vendor:compile` does not run on ARM

The canonical Solidity build is intentionally pinned to the official native Solidity compiler:

- compiler: `0.8.36+commit.8a079791`
- canonical platform: `linux-amd64`
- compiler SHA-256 is pinned in `scripts/compile-vendor.mjs`

Most Android devices running Termux are `arm64`. An amd64 native executable cannot be treated as a native ARM compiler, so ProofGate does not silently substitute another compiler or architecture and then claim the artifact was reproduced identically.

On unsupported hosts, `npm run vendor:compile` now fails with an explicit platform message rather than a vague `solc_failed` error.

## ARM-safe verification

Run:

```bash
npm run vendor:verify
```

This command does **not** compile Solidity. It verifies the committed supply-chain bindings that are architecture-independent:

- `contracts/ProofGateVendor.sol` SHA-256 matches the tracked build manifest
- tracked artifact SHA-256 matches the build manifest
- compiler identity recorded by the artifact matches the pinned manifest
- creation bytecode length and SHA-256 match
- runtime bytecode length and SHA-256 match

Canonical native recompilation remains a separate stronger check and is enforced by GitHub CI on `linux-x64`.

## Recommended Termux final-validation sequence

```bash
npm ci
npm run ci
npm run audit:prod
npm run attack:lab
npm run vendor:verify
git status --short
git rev-parse HEAD
```

Do not use `git add .` when local Telegraph experiments have produced quarantine, evidence or receipt files. Commit only intentionally selected public proof artifacts after checking them for secrets.

## What this distinction means

A successful `vendor:verify` on ARM proves that the checked-in source, artifact and manifest have not drifted from their recorded hashes.

A successful `vendor:compile` in GitHub CI proves that the same tracked artifact can be reproduced with the exact pinned native `linux-amd64` compiler configuration.

ProofGate keeps those claims separate rather than presenting integrity verification as recompilation.
