# Running Auctorail in Termux

This guide is for developers using Android + Termux to inspect, run and test Auctorail locally.

Auctorail is a Node/TypeScript/React/Vite project with browser tooling and optional native/browser-adjacent dependencies. Termux can run much of the project, but some browser automation packages are easier on a normal Linux desktop/VM.

## Recommended runtime

For the current dependency set, **Node 24 is recommended**.

Several modern development dependencies now officially target Node 22/24, including browser/DOM tooling. Older Node 20 environments may still install/run parts of the project but can emit `EBADENGINE` warnings and should not be treated as the preferred baseline.

## Basic Termux preparation

```bash
pkg update
pkg upgrade
pkg install git nodejs-lts python clang make pkg-config
```

Check versions:

```bash
node -v
npm -v
git --version
python --version
```

Aim for a modern Node 24 environment where available.

## Clone

```bash
git clone https://github.com/emmy16-glitch/auctorail.git
cd auctorail
```

If already cloned:

```bash
git fetch origin
git checkout main
git pull --ff-only
```

Check current commit:

```bash
git log -1 --oneline
```

Do not follow old branch instructions from historical v1.1/v1.2 notes unless you specifically want to reproduce an old milestone.

## Install dependencies

Preferred:

```bash
npm ci
```

If Termux-specific native package constraints prevent a clean install, do not immediately delete the lockfile. First capture the exact error and identify which package is incompatible.

The lockfile is part of the reproducible build.

## Environment file

Copy the example:

```bash
cp .env.example .env
```

Do not place real secrets into screenshots, Git commits or shared logs.

Live Telegraph/x402 and protected execution paths can use private keys and spend test funds. Keep those values private.

## Start local product

```bash
npm run dev
```

Expected local services:

```text
payment authorization API: 127.0.0.1:8787
utility API:               127.0.0.1:8788
Vite UI:                   127.0.0.1:5173
```

Open the Vite address in a browser on the device when accessible.

## Build only

```bash
npm run web:build
```

The current web build also copies OCR/Tesseract assets before Vite compilation.

A successful build should include a message indicating OCR assets were copied.

## Typecheck and tests

```bash
npm run typecheck
npm run web:typecheck
npm test
```

Or the combined CI command:

```bash
npm run ci
```

Current expected validated suite:

```text
53 test files
268 tests
```

## Security fuzz suites

```bash
npm run security:fuzz
npm run security:fuzz:adaptive
npm run security:fuzz:general
```

Current total deterministic adversarial cases:

```text
7400
```

These fuzz suites are offline/deterministic and should not intentionally buy Telegraph evidence or write to the blockchain.

## Production dependency audit

```bash
npm run audit:prod
```

The latest green repository snapshot reports zero production dependency vulnerabilities through this command.

## Vendor artifact verification

```bash
npm run vendor:verify
```

### ARM vs canonical native recompilation

The historical vendor artifact is tied to a pinned canonical compiler/platform. Most Android devices are ARM64, so Termux should not silently replace the compiler/platform and claim byte-for-byte canonical reproduction.

On ARM, `vendor:verify` is useful because it checks the tracked source/artifact/manifest binding without pretending a different native compiler build is identical.

Canonical native recompilation remains stronger when run on the intended Linux x64 environment.

Historical `ProofGateVendor` naming is intentional compatibility/provenance and does not mean the product name changed back.

## Live Telegraph warning

Commands such as live proof/acquisition can spend real test funds through x402.

Before any live run:

1. confirm which wallet/private key is configured;
2. use a burner/test wallet;
3. confirm balance;
4. confirm target and chain;
5. confirm evidence budget;
6. confirm the run is intentional;
7. avoid repeating an ambiguous paid request blindly.

## Current LOW live limits

```text
risk tier:            LOW for <=5 USDC
Intent:               FRAUD_DETECTION
confidence floor:     0.70
max fraud attempts:   3
max evidence spend:   0.035 USDC
overall deadline:     12 seconds
```

If evidence does not meet the requirements, `HOLD` is expected fail-closed behavior.

## Adaptive/quorum live checks

Before live Telegraph experiments, inspect the script and refresh any required Miner registry/configuration intentionally.

A live adaptive run can make multiple real x402 evidence purchases while attempting to satisfy provider diversity.

Important:

- attempts remain bounded;
- total evidence spend remains bounded;
- the frozen evidence deadline still applies;
- duplicate Miners do not count as independent providers;
- ambiguous paid transport should be reconciled before blindly rerunning;
- deterministic tests/fuzzing must not be presented as live Telegraph evidence.

## Browser automation limitations in Termux

Packages such as Puppeteer/Chromium may be difficult to run natively in Android Termux because they target standard desktop Linux distributions and browser binaries.

### Option A — run app/tests in Termux, browser QA in GitHub Actions

This is the simplest approach.

The repository's browser QA workflow already runs the product flow in a Linux CI environment.

### Option B — use proot-distro Ubuntu

```bash
pkg install proot-distro
proot-distro install ubuntu
proot-distro login ubuntu
```

Inside Ubuntu, install a supported Node runtime and dependencies.

Even there, browser sandbox/native-library requirements can differ from a full VM.

### Option C — use desktop/VM for final browser audit

For release/demo validation, a normal Ubuntu/Windows/macOS environment may be more reliable for Playwright/Chromium.

## If `npm ci` shows `EBADENGINE`

Check Node version:

```bash
node -v
```

The current dependency set includes packages requiring Node 22/24. Upgrade to Node 24 where possible.

Do not assume an installation warning is harmless simply because another environment happened to pass.

## If installation fails on a native package

Capture:

```text
package name
package version
Node version
npm version
Termux architecture
full first error
```

Then determine whether the dependency is:

- required at runtime;
- development-only;
- browser-QA-only;
- replaceable in the Termux workflow.

Do not remove security/runtime dependencies just to make installation green.

## If the UI opens but API calls fail

Check that the dev launcher started all services.

Useful checks:

```bash
curl -i http://127.0.0.1:8787/
curl -i http://127.0.0.1:8788/
```

The exact root response may be application-specific; the important question is whether the process is listening.

## If live authorization takes too long

Current LOW overall evidence window is 12 seconds.

If a deployed/local path waits much longer:

- confirm you are running current `main`;
- confirm the Telegraph timeout wrapper is active in that runtime path;
- inspect Telegraph transport behavior;
- check whether another non-Telegraph operation is blocking;
- do not lower evidence requirements to “fix” latency.

## If a live request returns HOLD

Check:

- returned Intent;
- serving Miner identity;
- subject assertion;
- chain assertion;
- confidence;
- signal hash;
- attempts;
- spend;
- deadline.

`HOLD` is not an error if required proof genuinely did not arrive.

## Live evidence artifact hygiene

Live experiments can create local evidence/quarantine/receipt files.

Do **not** casually run:

```bash
git add .
```

Review every artifact for secrets first.

Also avoid destructive cleanup such as `git clean -fd` when you have local evidence artifacts you may still need.

Never print, paste or commit:

- `.env`;
- wallet private keys;
- seed/recovery phrases;
- permit-signing secrets;
- database credentials;
- authentication tokens.

## Generic adapter development on Termux

You can build/test new adapters offline before connecting them to real external systems.

Useful source areas:

```text
src/core/
src/policy/
src/permit/
src/executor/
src/sdk/
tests/
scripts/general-fuzz.ts
```

A real adapter should only execute through the controlled boundary and must not give the autonomous agent a second direct route to the protected tool.

## Git hygiene

Before committing:

```bash
git status
git diff --stat
git diff
```

Never commit:

```text
.env
private keys
wallet mnemonics
API tokens
secret headers
funded credentials
```

## Useful repo commands

```bash
npm run ci
npm run web:build
npm run audit:prod
npm run vendor:verify
npm run security:fuzz
npm run security:fuzz:adaptive
npm run security:fuzz:general
```

For real/live tooling, inspect the script and environment variables before running it.

## Termux workflow recommendation

Use Termux for:

- code reading/editing;
- Git operations;
- TypeScript/unit tests where supported;
- deterministic scripts;
- API/local-server inspection;
- documentation work.

Use GitHub Actions or a desktop Linux environment for:

- final browser QA;
- Chromium-heavy workflows;
- canonical native x64 vendor recompilation;
- release/deployment validation.

## Final Termux rule

**Termux is a useful development environment, but do not weaken Auctorail's security or delete reproducibility controls to fit a mobile environment. Move environment-specific browser/native tasks to a supported runner instead.**
