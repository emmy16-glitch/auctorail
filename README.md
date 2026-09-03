# ProofGate

**Agent confidence is not permission to act.**

ProofGate is a risk-adaptive authorization firewall for autonomous agents built for the Telegraph Protocol Application Track. It freezes an exact proposed action, checks it against delegated authority, determines how much external intelligence the consequence deserves, validates qualifying Telegraph evidence, and returns a deterministic authorization decision before execution.

## Try ProofGate web flow

The public web experience now follows the real authorization sequence:

1. Set the agent's payment boundary.
2. Propose one exact Base Sepolia USDC action.
3. Run the local ProofGate authority check first.
4. If the action is inside the boundary, ProofGate shows the consequence tier and the exact external intelligence required.
5. Live Telegraph verification is a separate, explicitly triggered step. It may use x402 testnet USDC for evidence, but it never executes the proposed payment.
6. ProofGate returns ALLOW, HOLD, or BLOCK with a technical proof record.

The public live verifier is intentionally disabled unless `PROOFGATE_LIVE_AUTHORIZATION_ENABLED=true` is configured on the server. Keep the server wallet isolated and budget-capped. Never expose `TELEGRAPH_EVM_PRIVATE_KEY` to the browser.

## Core principle

Telegraph supplies external intelligence. ProofGate decides whether that intelligence is sufficient, together with delegated authority, to permit one exact action.

A Miner saying **ALLOW** is evidence. It is not permission.

## Demo

Run the zero-spend judge demo:

```bash
npm run demo
```

Run the interactive web UI locally:

```bash
npm run web:api
npm run web:dev
```

The Vite dev server proxies `/api` to the local ProofGate API server.

## Safety

- Do not commit `.env` or private signing material.
- Do not expose project-controlled execution funds to the public UI.
- Live Telegraph requests must remain rate-limited, idempotent, and budget-capped.
- Authorization and execution remain separate.
- Do not use synthetic Miner responses as live evidence.

## Repository

This repository also contains the mandate/action contracts, adaptive evidence planning, Telegraph/x402 client, quorum validation, permit/receipt logic, execution adapters, security fuzzing, and audit artifacts used by the ProofGate prototype.
