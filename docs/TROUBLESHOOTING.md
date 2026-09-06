# Auctorail troubleshooting guide

This guide covers the common failure modes in local development, browser demo flows, Telegraph/x402 evidence acquisition, authorization decisions, protected execution and deployment.

The first rule when debugging Auctorail is to identify **which stage failed**. Do not treat every `HOLD`, timeout or HTTP error as the same problem.

## Authorization lifecycle

```text
1. request received
2. exact action frozen
3. authority/Mandate preflight
4. evidence plan created
5. Telegraph evidence acquired
6. evidence normalized + bound
7. quorum/policy evaluated
8. ALLOW / HOLD / BLOCK returned
9. permit created if executable
10. protected execution
11. receipt recorded
```

A failure at stage 3 is fundamentally different from a failure at stage 5 or 10.

## The UI appears to be “stuck” on live evidence

### Expected current behavior

The current LOW-risk evidence plan has a **12-second overall evidence window**. The deployed API also bounds individual Telegraph HTTP calls so one upstream request should not occupy the entire authorization lifecycle indefinitely.

If a LOW-risk live request cannot obtain usable evidence within the bounded window, the correct result is normally `HOLD`.

### Check

Look at authorization diagnostics for fields such as:

- failed Intent;
- acquisition error;
- rejected attempts;
- evidence spend;
- evidence sources;
- bundle hash.

### Typical causes

- Telegraph route unavailable;
- route returns the wrong Intent;
- serving Miner does not support the required Intent;
- subject not explicitly asserted;
- chain not explicitly asserted;
- confidence below the required floor;
- signal hash missing;
- evidence budget exhausted;
- deadline reached.

### Do not fix by

- silently treating missing evidence as positive;
- lowering confidence to make the demo pass;
- removing exact subject/chain binding;
- manufacturing a signal hash;
- counting duplicate Miner responses as independent providers.

Those changes would weaken the security model rather than fix availability.

## A LOW-risk payment returns `HOLD`

For `<= 5 USDC`, verify that the evidence satisfies all current requirements:

```text
Intent: FRAUD_DETECTION
subject: exact frozen recipient
action: exact frozen action
chain: Base Sepolia / 84532
confidence: >= 0.70
signal commitment: present
explicit negative evidence: absent
attempts/spend/deadline: within bounds
```

A `HOLD` is correct when one or more mandatory evidence properties are unavailable.

## A payment is `BLOCK` before Telegraph is called

This is often correct.

Auctorail performs authority preflight before spending money on evidence.

Check:

- principal/Mandate limit;
- recipient/target scope;
- agent identity;
- chain and asset;
- policy/version;
- requested amount;
- Mandate expiration/revocation;
- current autonomous execution ceiling.

For `payments.adaptive.v1`, the current autonomous execution ceiling is `10 USDC` per action.

## Evidence exists but does not count toward quorum

A response can be real but unusable for authorization.

Check:

### Miner identity

The serving Miner must be identifiable and capable of the required Intent.

### Intent

A `FRAUD_DETECTION` requirement must not be satisfied by an unrelated routed Intent.

### Subject

Evidence must explicitly apply to the exact payment destination/subject.

### Chain

For the current payment path, evidence must explicitly bind to Base Sepolia (`84532`).

### Confidence

LOW positive floor: `0.70`.

MEDIUM positive floor: `0.75`.

HIGH positive floor: `0.80`.

### Signal commitment

Where required, a missing usable signal hash makes the evidence insufficient.

### Provider diversity

Distinctness is based on Miner ID. Repeated responses from one Miner still count as one provider.

## Telegraph returns an HTTP error

Classify the error before retrying.

Potential categories:

- pre-payment transport failure;
- x402 challenge missing/invalid;
- unsupported x402 lane;
- payment exceeds remaining evidence budget;
- paid request returns route unavailable;
- direct corroboration route unavailable;
- ambiguous paid transport;
- settlement cannot be proven.

A paid request must not be blindly repeated when payment state is ambiguous.

## x402 payment challenge is rejected

Check:

- network matches the approved policy;
- asset matches the approved policy;
- requested payment amount is within remaining evidence budget;
- payment requirement has a supported scheme;
- payer key/wallet is configured correctly;
- wallet has sufficient Base Sepolia test funds if live acquisition requires them.

Do not broaden accepted payment networks/assets merely to make an upstream request succeed.

## `adaptive_x402_transport_ambiguous`

This means a payment payload may have been created but the client does not have a clean final transport result.

The correct next step is reconciliation, not automatic re-payment.

Blind retry could purchase the same evidence twice.

## `adaptive_x402_settlement_unproven`

Auctorail could not prove that the x402 payment settled successfully under the expected rules.

Do not treat the evidence as safely paid/acquired until settlement or reconciliation succeeds.

## Wrong recipient or amount after authorization

This should fail.

The action is frozen before authorization. A changed amount, recipient, chain, token, reason or policy changes the action semantics.

The correct behavior is to create a new authorization request for the new action.

Do not reuse the old permit.

## Permit replay is rejected

This is expected behavior.

A permit is one-use authority. Once consumed, it cannot be used again even if every other field still looks valid.

Generate a new authorization for a genuinely new operation.

## Permit expired

Short permit lifetimes are intentional.

Re-authorize the current action instead of extending an expired permit client-side.

## Execution returns an ambiguous error

Do not immediately retry.

First determine whether the external effect occurred. For payments, inspect the durable execution/reconciliation state and chain as appropriate.

Auctorail's execution model intentionally distinguishes ambiguous outcomes from known failures.

## Execution is blocked by the kill switch

The kill switch is fail-closed.

If its state is disabled or unavailable, protected execution should not proceed.

Restore the trusted control/state before trying a new authorization/execution.

## Browser UI does not match current documentation

Check the current Git commit first.

Auctorail has undergone a substantial UI redesign. The source of truth is the current `main` code and latest green browser QA, not old screenshots.

Useful files:

```text
web/main.tsx
web/app.css
web/HomeLandingScreen.tsx
web/CheckingScreen.tsx
web/ExecutionScreen.tsx
web/GuidedDemoScreen.tsx
web/SdkScreen.tsx
qa/auctorail-final-playwright.py
```

## Mobile horizontal overflow

The redesigned UI includes specific fixes for single-column grid minimum sizes and the SDK “How it works” grid.

If overflow reappears:

1. reproduce at `390px` width;
2. inspect grid/flex children for intrinsic `min-width`;
3. prefer `minmax(0, 1fr)` for collapsing grid tracks;
4. add `min-width: 0` to overflowing grid/flex children;
5. verify long hashes/addresses wrap or truncate intentionally;
6. run the final Playwright browser audit.

Do not fix overflow by shrinking all typography globally.

## Home terminal animation does not move

The AutoTerminal supports reduced-motion behavior.

Current intended behavior:

- normal motion: progressive typing/cycling;
- `prefers-reduced-motion`: calm line-by-line opacity transitions, not a permanently frozen transcript.

Check the user's browser/OS reduced-motion setting when debugging animation differences.

## OCR/Tesseract assets fail in Content Trust

The web build copies required OCR assets into `public/tesseract/`.

Check:

```bash
npm run web:build
```

The build should report the copied OCR assets before Vite compilation.

If the browser cannot load them, inspect deployment asset paths and Vite base-path behavior.

## `npm ci` prints `EBADENGINE`

First check the runtime:

```bash
node -v
```

Current `main` declares **Node `>=24.15.0`** in `package.json`, `.nvmrc` selects Node 24, and current GitHub Actions workflows run Node 24.

If the local runtime is older than `24.15.0`, upgrade it. Node 20 is not a supported current baseline. If `EBADENGINE` still appears on a compliant Node version, inspect the exact package requirement instead of dismissing the warning.

## CI fails after changing evidence policy constants

Policy constants are intentionally locked by tests.

If you intentionally change a threshold such as evidence latency, attempt count, confidence floor or evidence budget, update:

1. the implementation;
2. the exact policy tests;
3. fuzz expectations if applicable;
4. `docs/RISK_POLICY.md`;
5. root `README.md`;
6. `docs/README.md` current-facts section;
7. demo/submission claims if user-visible behavior changes.

Do not change the tests without first verifying that the implementation change is intentional.

## Vercel build: top-level await + CommonJS error

The repository API bundle is ESM and currently uses top-level `await` imports.

A deployment adapter that forcibly bundles that file as CommonJS can fail with an error similar to:

```text
Top-level await is currently not supported with the "cjs" output format
```

That is a deployment packaging problem, not evidence that the application source failed TypeScript tests.

Use a Vercel-compatible adapter that preserves initialization semantics or explicitly transforms the temporary deployment copy without changing security behavior.

## Vercel `FUNCTION_INVOCATION_FAILED`

Distinguish build success from function runtime success.

After deployment, smoke-test both:

```text
GET /
GET /api/authorize
```

A GET to `/api/authorize` is expected to reach Auctorail and return the application-level `404 {"error":"not_found"}` because authorization is a POST path. A Vercel platform `FUNCTION_INVOCATION_FAILED` means the function module itself failed before normal routing.

Check runtime errors and deployment logs.

## Old `ProofGate` text appears in logs

Not every old identifier is a branding bug.

The following can be intentionally historical/compatible:

- `proofgate.*` schema identifiers;
- `ProofGateVendor` deployed contract/artifact;
- legacy SDK export;
- old audit artifact filenames;
- historical fuzz headings.

Public UI/product copy should say **Auctorail**. Stable protocol/deployment identifiers should be renamed only after evaluating compatibility and provenance.

## Test count mismatch in docs

Current validated suite:

```text
53 test files
268 tests
```

Current deterministic fuzz total:

```text
7400 adversarial cases
```

If older historical artifacts say 120, 225, or other counts, use their date/revision context. Current maintained docs should use the latest green `main` result.

## Historical audit report disagrees with current status

Files under `audit-artifacts/` are dated assessment artifacts. They can legitimately contain old ProofGate naming, old repository URLs, old test counts, old dependency findings and older topology assumptions.

Read `audit-artifacts/README.md` before using those reports for a present-tense claim. Do not edit historical assessment content merely to make it match current `main`.

## Recommended diagnostic order

When something fails, use this order:

```text
1. Confirm exact Git commit
2. Confirm Node/runtime and deployment environment
3. Confirm request/action inputs
4. Confirm Mandate/preflight result
5. Confirm evidence plan
6. Confirm Telegraph route + returned Miner
7. Confirm evidence binding/confidence/signal
8. Confirm quorum/policy result
9. Confirm permit integrity/consumption
10. Confirm executor/reconciliation state
11. Confirm receipt/log output
```

This prevents a UI symptom from being mistaken for a policy bug or an upstream Telegraph failure from being “fixed” by weakening authorization.

## Final troubleshooting rule

**Do not make Auctorail more permissive to make a demo pass. Find the stage that failed, preserve the security invariant, and improve routing, diagnostics, availability or UX around the fail-closed decision.**
