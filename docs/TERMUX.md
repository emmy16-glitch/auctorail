# Auctorail v1.2 on Termux / Android ARM

Auctorail can run its TypeScript suite, all deterministic security harnesses, Telegraph proof flows, adaptive/quorum check flow and architecture-independent vendor verification inside an Ubuntu `proot-distro` environment on Termux.

## Get the v1.2 branch

From `~/proof-gate`:

```bash
git fetch origin
```

If you do not already have the local v1.2 branch:

```bash
git switch --track origin/v1.2-general-quorum
```

If it already exists locally:

```bash
git switch v1.2-general-quorum
git pull origin v1.2-general-quorum
```

The frozen tags remain separate and must never be moved:

```text
v1.0.0-hackathon
v1.1.0-hackathon
```

A later v1.2 tag should point only to the exact final green v1.2 SHA.

## Why `vendor:compile` does not run on ARM

The canonical Solidity build is intentionally pinned to the official native compiler:

- compiler: `0.8.36+commit.8a079791`
- canonical platform: `linux-amd64`
- compiler binary SHA-256 is pinned by the repository

Most Android/Termux devices are `arm64`. Auctorail does not silently replace the canonical compiler/platform and then claim the tracked artifact was reproduced identically.

On unsupported hosts, `npm run vendor:compile` gives an explicit platform message.

## ARM-safe vendor verification

Run:

```bash
npm run vendor:verify
```

This does **not** execute solc. It verifies the committed architecture-independent bindings:

- `ProofGateVendor.sol` source hash
- tracked artifact hash
- recorded compiler identity
- creation-bytecode length/hash
- runtime-bytecode length/hash
- source/artifact/manifest consistency

Canonical native recompilation remains a separate stronger GitHub CI check on Linux x64.

## Final v1.2 local validation

```bash
npm ci
npm run ci
npm run audit:prod
npm run attack:lab
npm run security:fuzz
npm run security:fuzz:adaptive
npm run security:fuzz:general
npm run vendor:verify
git status --short
git rev-parse HEAD
```

Current validated v1.2 security summaries are:

```text
Vitest:
53/53 test files
268/268 tests

Original exact-action fuzz:
1100/1100 adversarial cases contained
100/100 valid controls
0 unauthorized executions

Adaptive + distinct-Miner quorum fuzz:
3200/3200 adversarial cases contained
100/100 valid controls
0 unauthorized authorizations

General action authorization fuzz:
3100/3100 adversarial cases contained
100/100 valid controls
0 unauthorized executions

Total deterministic adversarial cases:
7400/7400

Uncaught fuzz errors: 0
Production dependency vulnerabilities: 0
```

Always trust the exact command output from the revision you actually run if counts change after a later intentional commit.

## What changed in v1.2

The adaptive payment path now supports same-Intent provider diversity:

```text
LOW
FRAUD_DETECTION → 1 distinct Miner

MEDIUM
FRAUD_DETECTION → 2 distinct positive Miners
+ ONCHAIN_TX_LOOKUP

HIGH
FRAUD_DETECTION → 3 distinct Miners / 2 positive votes
+ ONCHAIN_TX_LOOKUP
+ WALLET_BALANCE_CHECK
```

Repeated routing to one Miner does not count as multiple independent providers.

v1.2 also adds the general authorization core and trusted Action Adapter SDK. These are deterministic/local code paths and can be tested on ARM like the rest of the TypeScript suite.

## Adaptive/quorum live check

Before a live Telegraph run, refresh the registry:

```bash
bash scripts/discover-telegraph.sh
```

LOW:

```bash
npm run proof:adaptive -- 1
```

HIGH standout path:

```bash
npm run proof:adaptive -- 7
```

Important:

- the HIGH path may make multiple **real Telegraph/x402 evidence purchases** while trying to obtain provider diversity plus the additional required Intents;
- each paid request remains capped by the per-request policy;
- total evidence spend, attempts and deadline are bounded by the HIGH-risk plan;
- the command is **check-only for the protected vendor payment** and does not broadcast 7 USDC;
- if a paid request becomes transport-ambiguous, do not blindly rerun it; inspect/reconcile the existing state first;
- until a real successful multi-Miner result is captured, do not present synthetic tests/fuzz data as live Telegraph evidence.

## Local working-tree caution

Live Telegraph experiments can create local evidence/quarantine/receipt artifacts.

Do **not** use:

```bash
git add .
```

Commit only intentionally selected public artifacts after checking them for secrets.

Also do not casually run destructive cleanup such as `git clean -fd` when you have local evidence artifacts you may still need.

Never print, paste or commit:

- `.env`
- wallet private keys
- seed/recovery phrases
- production Permit-signing material
- database credentials

## Generic adapter development on Termux

You can build/test a custom adapter entirely offline before connecting it to a real external system.

Useful files:

```text
src/core/general-action.ts
src/core/general-mandate.ts
src/permit/general-permit.ts
src/executor/general-executor.ts
src/sdk/action-adapter.ts
tests/general-authorization.test.ts
scripts/general-fuzz.ts
```

A real adapter should only execute through the controlled boundary and must not give the autonomous agent a second direct route to the protected tool.

## Integrity verification vs canonical recompilation

A successful `vendor:verify` on ARM proves that the checked-in source, artifact and build manifest remain bound to their recorded hashes.

A successful `vendor:compile` in GitHub CI proves that the tracked artifact can be reproduced with the exact pinned native `linux-amd64` compiler configuration.

Auctorail intentionally keeps those claims separate.

## Validation record

See `docs/V1_2_VALIDATION.md` for the exact v1.2 code/release SHA, GitHub CI run and current security-gate results.
