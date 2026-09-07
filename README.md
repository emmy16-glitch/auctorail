# Auctorail

Authorization rails for autonomous AI agents.

> AI agents can know what they want to do. Auctorail proves what they are allowed to do.

## The problem

AI agents can act. Action without authority is dangerous: a favorable risk verdict does not grant permission to spend money or change a recipient.

### Safety is not authority

A safety system asks: “Does this transaction look safe?” Auctorail asks: “Was this exact action authorized?”

A recipient can appear safe and still never have been delegated by the principal. Auctorail blocks that request before purchasing evidence.

### 02.5 — ADVISORY VS ENFORCEMENT

A risk verdict can inform an agent. A permission boundary controls execution. A compromised agent can ignore advice. Auctorail keeps authority separate from the agent decision path.

| Advisory | Auctorail |
| --- | --- |
| Suggests | Authorizes |
| Lives in agent logic | Lives in the protected execution boundary |
| Can be removed by the agent | Required by the protected executor |
| Returns confidence | Returns permission for an exact action |

These properties apply to the protected integration. An agent with an independent wallet or credential can act outside that integration.

## What Auctorail does

1. Capture the exact action and hash its security-relevant fields.
2. Verify delegation: agent, recipient, chain, asset, amount and permission window.
3. Acquire and bind external intelligence when policy requires it.
4. Issue short-lived, signed, one-use authority only for an executable `ALLOW`.
5. Create a tamper-evident receipt binding the decision and execution outcome.

`BLOCK` rejects a hard rule violation. `HOLD` means evidence is insufficient or unavailable. Neither issues executable authority.

## Live Demo

[Open Auctorail](https://auctorail.vercel.app).

- **Watch the rail hold** explains the flow with a clearly labelled simulation and no payments.
- **Run a real testnet transfer** uses the live payment path; success depends on current evidence, configuration and funding.
- **Security Lab** runs real policy/permit checks against offline fixtures, including replay, amount and recipient mutation, expired permission, and missing evidence.

Follow the [demo runbook](docs/DEMO_TODAY.md). Historical [Telegraph evidence and Base Sepolia execution](docs/LIVE_EXECUTION.md) remain historical proof, never a new run's receipt.

## Architecture

```text
Agent proposal → exact action → principal delegation → Telegraph evidence
  → ALLOW / HOLD / BLOCK → Ed25519 one-use permit → protected executor
  → existing EIP-712 PermitGate path → Base Sepolia USDC → receipt
```

Execution authority is controlled by Auctorail's protected executor boundary. Current `main` already includes `AuctorailPermitGate`; its EIP-712 signature is produced after Ed25519 authority validation. The contract binds amount, recipient, token, action hash, decision hash and expiry, and consumes the permit hash before transfer. Anyone may relay a valid permit with the exact signed effect. The contract has no admin withdrawal or upgrade entrypoint.

Contract source is not deployment proof. Read [current runtime and limitations](docs/CURRENT_STATUS.md) before claiming that a particular transaction used a deployed gate. The historical `ProofGateVendor` contract is a separate artifact.

See [architecture](docs/ARCHITECTURE.md) and [repository-local SDK](packages/sdk/README.md). Protocol identifiers named `proofgate.*` are retained for compatibility.

## Security Model

The principal delegates; evidence cannot expand authority. The executor revalidates the exact permit and rejects mutations, expiry and replay. Ambiguous broadcasts require reconciliation rather than blind retry.

PRs #1 and #2 provide PostgreSQL atomic claims and durable execution adapters. The public web path currently uses process-local pending state and filesystem claims; those adapters are not automatically active on Vercel. This limits restart recovery and multi-instance coordination. See [security model](docs/SECURITY_MODEL.md) and [permit persistence](docs/permit-consumption-store.md).

## Telegraph Integration

Telegraph provides intelligence. Auctorail provides authority.

Telegraph answers: “What do we know about this action?” Auctorail answers: “Are we allowed to perform this action?”

The payment path acquires `FRAUD_DETECTION` Miner evidence through x402, retaining signal hashes and checking subject, chain, freshness, confidence and evidence binding. Current LOW routing tries Refut directly through Telegraph before bounded automatic-route fallback; PR #3's original routing description was superseded by later `main` commits.

LOW payments (`<=5 USDC`) require one distinct positive Miner at confidence `>=0.70`, with up to three attempts, a `0.035 USDC` evidence budget and a **20-second** overall deadline. Individual deployed Telegraph HTTP calls are bounded at 16 seconds by default. Missing usable evidence results in `HOLD` and no permit.

Additional policy intents and Content Trust client code are documented as implemented capabilities, not proof of successful live acquisitions. See [risk policy](docs/RISK_POLICY.md) and the conservative [real usage ledger](docs/REAL_USAGE_LOG.md).

## Attack Lab

```bash
npm run attack:lab
```

The suite runs 13 adversarial checks plus a one-execution baseline. It uses an ephemeral Ed25519 fixture signer, local temporary consumption state and pinned vendor runtime data. No Telegraph requests, x402 payments or blockchain writes occur. Missing evidence reports `HOLD`; receipt tampering reports an integrity failure rather than claiming to stop an already completed payment.

See [scenario details](docs/ATTACK_LAB.md).

## Deployment

Use Node **24.15.0 or newer** (Node 24 baseline):

```bash
npm ci
npm run dev
```

The UI runs on port 5173; payment API on 8787; utility API on 8788. Copy [`.env.example`](.env.example) into a local environment file and configure only the capabilities needed. The dev launcher enables live lanes by default unless explicitly disabled; use `AUCTORAIL_LIVE_AUTHORIZATION_ENABLED=false AUCTORAIL_CONTENT_LIVE_ENABLED=false npm run dev` for offline work.

Production uses the Vercel Build Output API. `npm run vercel:build` packages both API functions and their required public artifacts; `npm run verify:package` exercises the utility function outside the checkout with production restrictions. The deployment workflow builds the selected main commit using the project's production environment.

## Verification

```bash
npm run ci
npm run attack:lab
npm run security:fuzz
npm run security:fuzz:adaptive
npm run security:fuzz:general
npm run audit:prod
```

`npm run build` also builds the frontend. Browser checks live in `qa/auctorail-final-playwright.py` and `qa/security-lab-polish-playwright.py`; run against the local app on port 4173. Payment browser fixtures validate presentation and sequencing, not fresh blockchain activity.

See [current audit and verification](docs/CURRENT_STATUS.md) for dated results and remaining limitations, and the [documentation index](docs/README.md) for maintained guides and historical records.
