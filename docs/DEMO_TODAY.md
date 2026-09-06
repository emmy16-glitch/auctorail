# Auctorail demo-day operating guide

This is the practical checklist to use immediately before recording, presenting, or submitting Auctorail.

It is intentionally operational. For the narrative, read `HACKATHON_DEMO.md`. For architecture, read `ARCHITECTURE.md`.

## Primary goal

The demo should prove one idea clearly:

> **The agent can propose a consequential action, but Auctorail controls whether that exact action receives execution authority.**

The presentation should not depend on a perfect live external route.

## Best demo order

Use this sequence:

```text
1. Home
2. Watch Demo
3. Valid action
4. Changed amount → BLOCK
5. Replayed permit → BLOCK
6. Missing evidence → HOLD
7. Verify / real Telegraph + Base Sepolia proof
8. Optional Live Mode
```

This order guarantees that the security value is visible even if Telegraph routing is temporarily unavailable.

## Pre-recording repository check

Before touching the browser:

```bash
node -v
npm ci
npm run ci
npm run audit:prod
```

Current `main` requires **Node `>=24.15.0`**. `.nvmrc` selects Node 24 and current GitHub Actions workflows run Node 24.

For a deeper security pass:

```bash
npm run security:fuzz
npm run security:fuzz:adaptive
npm run security:fuzz:general
```

Current expected green validation snapshot:

```text
53 test files
268 / 268 tests
7400 deterministic adversarial cases contained
0 unauthorized executions / authorizations in fuzz suites
0 production dependency vulnerabilities reported
```

## Required local runtime

Use **Node `>=24.15.0`** for current local development and demo validation. Node 20 belongs to older historical runs and is not a supported baseline for current `main`.

## Browser setup

For a clean recording:

- use a modern Chromium-based browser;
- hide bookmarks bar if it adds clutter;
- close unrelated tabs;
- use 100% browser zoom unless the screen size requires otherwise;
- use a clean viewport with no devtools visible;
- ensure reduced-motion settings are known, because the Home terminals have a calm reduced-motion mode;
- if recording mobile, use a common width around `390px` and verify no horizontal scroll.

## Responsive check

The redesigned UI has explicit mobile fixes for grid minimum widths and the SDK layout.

Before recording mobile:

1. open Home;
2. open Watch Demo;
3. open Check/Live;
4. open Execution/result screen;
5. open SDK;
6. verify no horizontal overflow;
7. verify long addresses/hashes do not push the page wider than the viewport.

## Deterministic demo check

Run **Watch Demo** before recording.

Confirm all four scenarios:

### Valid action

Expected outcome: successful deterministic authorization/execution presentation.

### Modified amount

Expected outcome: `BLOCK`.

### Permit replay

Expected outcome: `BLOCK`.

### Missing evidence

Expected outcome: `HOLD` with no execution authority.

If any deterministic scenario fails, fix that before trying live mode.

## Verify surface check

Confirm the canonical public proof can be inspected.

Canonical transaction:

```text
0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc
```

Canonical receipt hash:

```text
0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3
```

Canonical fraud evidence:

```text
Intent: FRAUD_DETECTION
Miner: Refut On-Chain Risk
Miner ID: 95822412
Verdict: ALLOW
Confidence: 0.70
```

## Live Mode readiness

Only use live mode in the demo if all of the following are true:

- the deployment is on the intended commit;
- live evidence acquisition is enabled intentionally;
- the burner/evidence payer wallet is funded appropriately;
- evidence spend caps are correct;
- the pinned recipient is correct;
- the action is LOW risk if you want the fastest path;
- the audience understands that external Miner availability can still produce a safe `HOLD`.

## Current LOW live envelope

For `<= 5 USDC`:

```text
Intent:               FRAUD_DETECTION
confidence floor:     0.70
max attempts:         3
max evidence spend:   0.035 USDC
overall deadline:     12 seconds
```

The deployed API also bounds individual Telegraph HTTP calls.

A live request should therefore not sit apparently frozen for the old 35-second window.

## If Live Mode returns HOLD

Do not panic and do not weaken the policy during the presentation.

Explain:

> Auctorail is failing closed because required external evidence did not reach the policy threshold within the bounded acquisition window. No execution authority is issued.

That is a valid security outcome.

Then move to the canonical real proof showing that the lane has successfully executed with genuine Telegraph evidence before.

## If live routing fails repeatedly

Use the deterministic demo + public real proof instead of repeatedly spending x402 evidence budget on camera.

A demo is not stronger because you watch an upstream provider time out three times.

## Do not expose secrets

Before screen recording, check:

- terminal history;
- `.env` files;
- browser devtools;
- wallet/private-key output;
- Vercel environment screens;
- shell commands containing secrets.

Use only public addresses, public transaction hashes and sanitized committed evidence.

## Public claims you can safely make

You can say:

- Auctorail is a pre-execution authorization layer for autonomous agents.
- It separates delegated authority from external evidence.
- The payment lane integrates Telegraph/x402.
- Evidence binds to the exact action/subject and chain.
- Adaptive policy can require distinct Miner providers.
- `HOLD` is fail-closed.
- Executable `ALLOW` can produce one-use authority.
- Permit replay is rejected.
- The repository contains genuine Telegraph/x402 payment evidence.
- The repository contains one protected Base Sepolia USDC execution.
- Current deterministic validation has 268 passing tests and 7400 adversarial fuzz cases contained.

## Claims to avoid

Do not say:

- “unhackable”;
- “guaranteed safe”;
- “independently audited”;
- “production certified”;
- “all lanes are live through Telegraph”;
- “we already captured a successful HIGH three-Miner production quorum”;
- “Auctorail proves every Miner answer is true”;
- “the SDK is already a public npm package.”

## 60-second recording shot list

### Shot 1 — Home

Duration: about 5–8 seconds.

Show the Auctorail name and “Prove authority before execution.”

Narration:

> AI agents can already take real actions, but capability isn't authority.

### Shot 2 — Watch Demo / valid action

Duration: about 8–10 seconds.

Narration:

> Auctorail freezes the exact action, checks delegated authority and required evidence, and only then creates execution authority.

### Shot 3 — Amount mutation

Duration: about 8 seconds.

Narration:

> Change the amount after authorization and the old authority no longer matches. Blocked.

### Shot 4 — Replay

Duration: about 7 seconds.

Narration:

> Reuse a consumed permit and it's blocked.

### Shot 5 — Missing evidence

Duration: about 8 seconds.

Narration:

> If required evidence is missing, Auctorail doesn't guess. It holds the action.

### Shot 6 — Real proof

Duration: about 10–15 seconds.

Narration:

> The payment lane is also connected to real Telegraph/x402 evidence and a protected Base Sepolia execution.

End:

> Intelligence tells agents what they know. Auctorail determines what they're allowed to do.

## Judge presentation fallback plan

Have three levels ready.

### Level A — full live

Deterministic demo + Live Mode + public proof.

### Level B — live evidence unavailable

Deterministic demo + explain safe HOLD + public real proof.

### Level C — internet/deployment issue

Run local deterministic demo + show committed evidence/transaction references from repository/docs.

Never let one external dependency destroy the entire story.

## Vercel deployment check

Before presenting the hosted app:

- confirm deployment state is `READY`;
- confirm `/` returns `200`;
- confirm the API function loads rather than `FUNCTION_INVOCATION_FAILED`;
- confirm a GET to `/api/authorize` reaches the app and returns its normal application-level not-found response;
- inspect recent runtime errors;
- confirm the deployment is pinned to the intended Git commit.

See `TROUBLESHOOTING.md` for deployment-specific issues.

## Social post checklist

For an X post:

- lead with the problem, not implementation jargon;
- keep the video under roughly 60 seconds if possible;
- use one strong sentence per visual state;
- show `BLOCK` and `HOLD` clearly;
- include the real Telegraph/Base Sepolia claim only if you can link to the project/proof;
- avoid overlong hash strings in the main caption;
- emphasize authorization rather than “we queried a Miner.”

## Final 10-minute checklist

- [ ] correct branch/commit;
- [ ] Node version is `>=24.15.0`;
- [ ] current app loads;
- [ ] no open unrelated browser tabs;
- [ ] deterministic demo passes;
- [ ] mobile/desktop viewport looks clean;
- [ ] Verify/public proof accessible;
- [ ] no secret values visible;
- [ ] live wallet/budget checked if using live mode;
- [ ] know the current LOW deadline is 12s;
- [ ] know the exact canonical transaction facts;
- [ ] narration rehearsed once;
- [ ] fallback plan ready.

## Final rule

**Do not make the demo depend on external luck. Demonstrate the deterministic authorization property first, then use the real Telegraph/x402 and Base Sepolia artifacts as proof that the same architecture has crossed the boundary into genuine external execution.**
