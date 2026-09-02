# Integrating ProofGate into another agent

ProofGate is designed to sit **between an autonomous agent and a consequential tool**.

The agent may propose an action. It should not own the standing authority, evidence policy, permit signer, replay store and protected executor that decide whether the action can actually occur.

Current supported protected action: **Base Sepolia USDC payments**.

## Recommended boundary

```text
Your Agent
   │
   │ proposes payment
   ▼
ProofGate SDK / service
   │
   ├─ verify principal Mandate
   ├─ derive LOW / MEDIUM / HIGH risk tier
   ├─ derive required Telegraph Intents
   ├─ obtain routed evidence
   ├─ enforce x402 evidence budget
   ├─ build canonical Evidence Bundle
   ├─ deterministic ALLOW / HOLD / BLOCK
   └─ mint exact one-use Permit only on ALLOW
              │
              ▼
Protected executor
              │
              ▼
Wallet / external effect
```

The agent should not be able to skip around ProofGate and call the protected wallet directly.

## 1. Plan an authorization

```ts
import {
  planPaymentAuthorization
} from "../src/sdk/proofgate.js";

const { action, plan } =
  planPaymentAuthorization({
    amountRaw: "7000000",
    destination: "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
    reason: "Purchase compute capacity"
  });
```

A `7 USDC` payment currently derives a HIGH risk plan requiring:

- `FRAUD_DETECTION`
- `ONCHAIN_TX_LOOKUP`
- `WALLET_BALANCE_CHECK`

The agent does not choose the risk tier or remove required Intents. `payments.adaptive.v1` recomputes the plan from the Action Contract before authorizing.

## 2. Give the agent a standing Mandate

A Mandate should be created/approved by the principal or an upstream authority, not invented by the autonomous agent immediately before execution.

```ts
import {
  createAdaptivePaymentMandate
} from "../src/sdk/proofgate.js";

const mandate =
  createAdaptivePaymentMandate({
    mandateId: "ops-agent-2026-09",
    principalId: "acme-treasury",
    agentId: "ops-agent",
    allowedDestinations: [
      action.payload.destination
    ],
    maxPerActionRaw: "10000000",
    maxCumulativeRaw: "50000000",
    requiredIntents: [
      "FRAUD_DETECTION",
      "ONCHAIN_TX_LOOKUP",
      "WALLET_BALANCE_CHECK"
    ],
    status: "ACTIVE",
    issuedAt: new Date().toISOString(),
    expiresAt:
      new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ).toISOString(),
    version: 1
  });
```

Production deployments should persist Mandates and expose an authoritative revocation/status source to the durable executor.

## 3. Obtain Telegraph evidence

### Live provider-neutral routing

ProofGate can request each Intent through Telegraph without pinning a specific Miner:

```ts
import fs from "node:fs";
import {
  createLiveIntentAcquirer
} from "../src/telegraph/live-intent-client.js";
import {
  collectAdaptiveEvidence
} from "../src/telegraph/adaptive-orchestrator.js";

const miners = JSON.parse(
  fs.readFileSync("data/miners.json", "utf8")
);

const acquire =
  createLiveIntentAcquirer({
    privateKey:
      process.env.TELEGRAPH_EVM_PRIVATE_KEY as `0x${string}`,
    miners
  });

const collection =
  await collectAdaptiveEvidence(
    action,
    plan,
    acquire
  );

const bundle = collection.bundle;
```

Refresh `data/miners.json` before a live demonstration:

```bash
bash scripts/discover-telegraph.sh
```

### What the live client enforces

For a paid Intent request it:

1. preflights Telegraph;
2. parses the live x402 challenge;
3. enforces the locked Base Sepolia USDC x402 lane;
4. enforces the per-request price ceiling;
5. enforces the remaining aggregate risk-tier evidence budget **before paying**;
6. performs one paid attempt only;
7. requires provable settlement;
8. refuses blind paid retry after transport ambiguity;
9. resolves the Miner Telegraph actually routed to;
10. verifies that Miner is active and advertises the requested Intent;
11. requires explicit exact subject and chain binding;
12. normalizes and saves the real response.

Missing/failed evidence produces an incomplete bundle and ultimately `HOLD`; it never authorizes a weaker path automatically.

## 4. Evaluate the Evidence Bundle

```ts
import {
  evaluatePaymentAuthorization
} from "../src/sdk/proofgate.js";

const authorization =
  evaluatePaymentAuthorization({
    mandate,
    action,
    plan,
    bundle,
    agentId: "ops-agent"
  });

if (
  authorization.decision.decision !==
  "ALLOW"
) {
  console.error(
    authorization.counterfactual
  );
  // Stop. Do not call the protected wallet.
}
```

Possible results:

- `ALLOW` — every required authority/evidence check passed.
- `HOLD` — ProofGate cannot establish sufficient current proof.
- `BLOCK` — a known authorization/security invariant failed.

An explicit negative required signal is `BLOCK`; it cannot be averaged away by positive signals.

## 5. Mint a one-use Permit

Only do this after `ALLOW`:

```ts
import {
  mintPaymentPermit
} from "../src/sdk/proofgate.js";

const permit = mintPaymentPermit({
  mandate,
  action,
  bundle,
  decision:
    authorization.decision,
  signer: myPermitSigner,
  ttlSeconds: 30
});
```

### Signer guidance

- Local/demo: ProofGate supports HMAC development signing.
- Production: use Ed25519 or a KMS/HSM adapter.
- `NODE_ENV=production` rejects the HMAC development signer.
- Keep production signing keys outside the agent process.

## 6. Execute only through the controlled boundary

```ts
import {
  executeProtectedAction
} from "../src/executor/controlled-executor.js";

const execution =
  await executeProtectedAction({
    mandate,
    permit,
    action,
    evidence: bundle,
    decision:
      authorization.decision,
    secret: localDemoSecret,
    store: permitConsumptionStore,
    execute: async (authorizedAction) => {
      // Call your wallet/tool here using fields derived
      // from authorizedAction, not new agent-supplied values.
      return sendPayment(authorizedAction);
    }
  });
```

For a multi-worker deployment use the PostgreSQL permit-consumption and durable-execution path instead of independent local filesystem stores.

## Evaluate-only HTTP gateway

For teams that do not want to import the SDK immediately:

```bash
npm run gateway:serve
```

Default:

```text
http://127.0.0.1:8787
```

### Health

```bash
curl http://127.0.0.1:8787/health
```

### Plan

```bash
curl -sS \
  -X POST \
  -H 'content-type: application/json' \
  http://127.0.0.1:8787/v1/plan \
  -d '{
    "amountRaw":"7000000",
    "destination":"0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
    "reason":"Agent purchase"
  }'
```

The response contains the frozen Action Contract and the deterministic adaptive evidence plan.

### Evaluate

`POST /v1/evaluate` accepts:

```json
{
  "mandate": {},
  "action": {},
  "plan": {},
  "bundle": {},
  "agentId": "ops-agent"
}
```

The gateway returns the deterministic decision and a counterfactual explanation for non-ALLOW results.

### Why the HTTP gateway is evaluate-only

It deliberately does **not**:

- accept a wallet private key over HTTP;
- buy Telegraph evidence;
- hold a production permit-signing key;
- mint authority;
- broadcast a payment.

This keeps the public integration surface narrow. A host that needs a full authorization service should compose the SDK, live Intent client, secure signer, shared replay store and controlled executor inside its own trusted deployment boundary.

## Integration rules for another developer

Do:

- create Mandates outside agent-controlled prompting;
- give the agent no direct wallet bypass;
- derive wallet transaction fields from the frozen Action Contract;
- refresh Telegraph Miner coverage before live workflows;
- treat `HOLD` as no authority;
- treat `BLOCK` as no authority;
- use a shared atomic permit store across executor replicas;
- reconcile `AMBIGUOUS` irreversible writes instead of retrying blindly;
- preserve Proof Receipts.

Do not:

- let the model choose its own risk tier;
- let the model reduce required Intents;
- treat Miner `ALLOW` as direct authorization;
- average away an explicit negative signal;
- replace stale/missing evidence with a favorable fixture;
- retry an ambiguous paid x402 request blindly;
- expose `.env`, private keys or signing keys to an agent prompt.

## Proof Receipt v3

Adaptive authorization receipts use `proofgate.receipt.v3` and embed the canonical Evidence Bundle. Receipt verification checks bundle integrity and exact action binding in addition to the existing Mandate/decision/permit/execution commitments.

A changed signal hash, Miner, Intent, payment amount or bundle body invalidates the receipt hash and/or bundle hash.

## Current scope

ProofGate currently supports a deliberately narrow protected action:

- payment
- Base Sepolia (`84532`)
- canonical Base Sepolia USDC
- maximum adaptive autonomous amount: `10 USDC`

The architecture can be generalized to other consequential tools later, but the hackathon implementation avoids pretending arbitrary actions are already supported.
