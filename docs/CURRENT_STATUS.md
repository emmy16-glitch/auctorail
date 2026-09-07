# Current main audit and hackathon readiness

Source baseline: `44c0722`, after merged PR #9. Audited 2026-09-07. Closed branches were not restored. Historical artifacts and receipt identities are preserved.

## PR audit

| Work | Present on main | Practical boundary |
| --- | --- | --- |
| #1, atomic PostgreSQL permit claims (`261017c`) | Injected adapter, migration, concurrency/replay tests | Public web API still constructs filesystem claims; PostgreSQL is an integration option, not an automatically deployed service. |
| #2, durable execution (`4bab821`) | Durable state machine, transaction binding, reconciliation, kill switch and integration harness | Adapter guarantees require actual wiring to shared persistence. Public pending requests and quotas remain process-local. |
| #3, live Telegraph/UI (`2db308e`) | Frozen requests, delegated recipient, live evidence, Ed25519 permit and protected execution | Later main commits supersede initial auto-only routing: LOW starts with direct Refut routing via Telegraph and bounded fallback. |
| #9, browser selectors (`5bccb4a`) | Landing/content selectors match current product copy | Lab browser fixtures did not exercise the production function package. Added an isolated production package test and real Lab API browser checks. |

No open PRs were returned at initial audit. PR descriptions are historical intent; current source determines runtime behavior.

## WORKING

The baseline suite passed 280 tests in 54 files. Source retains exact action/mandate binding, real x402 acquisition, fail-closed evidence evaluation, Ed25519 authority validation and the newer EIP-712 gate bridge. LOW requires one distinct positive fraud Miner at >=0.70, 3 attempts, 0.035 USDC budget, 20s total evidence deadline; HTTP timeout defaults to 16s. Offline demos remain labelled simulations.

## BROKEN — fixed in this polish

Production `POST /api/security-lab` reproduced HTTP 500 with missing `artifacts/vendor/ProofGateVendor.json`. The utility function now packages that public artifact. The harness's HMAC signer also conflicted with production restrictions; it now creates an ephemeral Ed25519 test signer. No production signing key is loaded by the Lab.

The UI previously showed “RAIL HELD” and a successful trace on failed checks. It now derives results from validated API observations, preserves HOLD, labels receipt-integrity detection accurately, clears stale results, bounds requests to 15 seconds and supports retries.

## RISKY — retained architecture and limitations

- Web pending permits, idempotency maps and quota counters are process-local; `/tmp` state is not shared durable storage. PR #1/#2 adapter availability does not establish multi-instance durability for this deployment.
- Existing gate bootstrap can deploy and fund a gate when none is configured. Deployment, funding and confirmation can exceed the short permit/function lifetime; do not present bootstrap as guaranteed live-demo liveness. Prefer a verified, funded, configured gate for a presentation.
- The existing gate signer and executor wallet remain trusted. A different credential outside this boundary is not constrained by Auctorail.
- Existing on-chain tests cover typed-data bindings and source invariants; they do not constitute an independent Solidity audit or exhaustive EVM execution proof.
- Public historical receipts establish historical activity, not a fresh payment or proof that that historical payment used the new gate.

The payment executor, bootstrap, routing and contract are intentionally preserved during this polish. No new gate deployment is necessary to repair the Lab.

## STALE DOCUMENTATION — corrected

Maintained guides now use the 20s LOW deadline and link current execution boundaries. Historical validation/Track 3 records retain their original body with a current-status notice. Historical usage ledger totals are not inflated by local tests.

## FALSE CLAIMS — corrected

Lab PASS means the expected check matched the observed engine output, not that a real transaction was blocked on-chain. Missing evidence is HOLD/no permit. Receipt mutation is detected after a simulated receipt is built. Current contract source enforces exact signed transfers of gate-held funds; “all direct calls fail” is inaccurate because any relayer may submit a valid permit.

## MISSING TESTS — addressed and remaining

Added production-mode Lab test, isolated built-function test, three requested policy scenarios, and browser real-API/error/timeout coverage. Run `npm run ci`, the three fuzz scripts and both Playwright suites to reproduce current results. Live database integration requires a disposable PostgreSQL endpoint; it must be reported separately from mocked adapter unit tests.

## Demo runbook

1. Home → Watch the rail hold: show the labelled 1 USDC simulation, then Over Limit (7 USDC requested, 5 allowed), then missing evidence. No real transaction is claimed.
2. Security Lab → run replay, amount mutation (1 → 100 USDC), recipient mutation, expired permission and missing evidence. Read observed codes; HOLD issues no permit. Run suite for all 13 checks.
3. Live → use 1 USDC and a 5 USDC limit with the approved vendor. Report only the actual returned decision. If confirmed, open that run's transaction in BaseScan. If evidence is unavailable, show HOLD; never substitute a saved receipt.
4. Verify → canonical proof is explicitly historical. Open documentation and repository links for the implementation and preserved evidence.

Production URL: https://auctorail.vercel.app. Deployment success and live execution must be checked separately from the local results below.

## Local verification — 2026-09-07

- Node 24.15.0; clean lockfile install.
- `npm run ci`: SDK checks, backend/frontend typechecks, 54 test files / 281 tests, frontend build, Vercel build and isolated production utility test passed.
- All three fuzz suites passed: 1,100 + 3,200 + 3,100 = 7,400 adversarial cases; no unauthorized effects or uncaught errors reported.
- Production dependency audit: zero reported vulnerabilities.
- Full product Playwright suite passed at 390/980/1440px, including mocked live presentation, actual receipt verification, navigation and screenshots.
- Real Lab API browser suite passed at 320/390/1440px, with failed suite/single, malformed reports, HTTP failure, 15s timeout and retry checks.
- Relative links in maintained Markdown resolve locally; `git diff --check` passed.
- Live PostgreSQL integration was not run: no disposable database configured and this environment cannot access the Docker daemon. Adapter unit/concurrency tests passed; this is not a fresh real-database verification.

Production environment note: the payment API still reads several `PROOFGATE_*` settings directly, including Ed25519 signer, executor, execution quota, policy quota and daily budget. Preserve existing working production values. Do not assume every `AUCTORAIL_*` name is automatically aliased by the deployment prelude.
