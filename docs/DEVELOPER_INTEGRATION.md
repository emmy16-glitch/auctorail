# Integrating ProofGate into another agent

ProofGate is designed to sit **between an autonomous agent and a consequential tool**.

The agent may propose an action. It must not own the standing authority, risk rules, evidence-acquisition boundary, permit signer, replay store or protected executor that decide whether the action can actually occur.

Current protected-action scope: **Base Sepolia USDC payments**.

## Recommended trust boundary

```text
Autonomous Agent
      |
      | proposal only
      v
Trusted ProofGate host
      |
      +-- principal-created Mandate
      +-- freeze exact Action Contract
      +-- derive LOW / MEDIUM / HIGH risk
      +-- derive required Telegraph Intents
      +-- obtain/validate routed Telegraph evidence
      +-- enforce x402 evidence budget + deadline
      +-- build canonical Evidence Bundle
      +-- deterministic ALLOW / HOLD / BLOCK
      +-- mint exact one-use Permit only on ALLOW
      |
      v
Controlled executor
      |
      v
Wallet / external effect
```

**The agent should submit only its proposal.** It should not be asked to provide its own risk tier, Evidence Bundle, `ALLOW` decision or permit.

The protected wallet/tool must not have a second path around ProofGate.

## Recommended high-level SDK path

For a trusted host, the safest integration is `authorizePaymentWithEvidence(...)`.

The agent supplies only the payment proposal. The host supplies the principal-created Mandate, trusted Telegraph Intent acquirer and permit signer.

```ts
import fs from "node:fs";
import {
  authorizePaymentWithEvidence,
  createAdaptivePaymentMandate
} from "../src/sdk/proofgate.js";
import {
  createLiveIntentAcquirer
} from "../src/telegraph/live-intent-client.js";

const destination =
  "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";

const mandate = createAdaptivePaymentMandate({
  mandateId: "ops-agent-2026-09",
  principalId: "acme-treasury",
  agentId: "ops-agent",
  allowedDestinations: [destination],
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
    new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString(),
  version: 1
});

const miners = JSON.parse(
  fs.readFileSync("data/miners.json", "utf8")
);

const acquire = createLiveIntentAcquirer({
  privateKey:
    process.env.TELEGRAPH_EVM_PRIVATE_KEY as `0x${string}`,
  miners
});

const result = await authorizePaymentWithEvidence({
  proposal: {
    amountRaw: "7000000",
    destination,
    reason: "Purchase compute capacity"
  },
  mandate,
  agentId: "ops-agent",
  acquire,
  signer: myPermitSigner,
  ttlSeconds: 30
});

if (!result.permit) {
  console.error(
    result.authorization.counterfactual ??
    result.authorization.decision.reason
  );
  // Stop. No executable authority exists.
}
```

For `7 USDC`, the trusted path derives HIGH risk automatically and requires:

- `FRAUD_DETECTION`
- `ONCHAIN_TX_LOOKUP`
- `WALLET_BALANCE_CHECK`

The caller cannot lower that to LOW risk. `payments.adaptive.v1` recomputes the complete expected plan from the exact frozen Action Contract before authorization.

A permit is returned only when evidence collection is `COMPLETE` **and** deterministic policy returns `ALLOW`.

## Evidence integrity is not evidence authenticity

This distinction is important.

`bundleHash` proves that an Evidence Bundle has not changed after it was constructed. It does **not**, by itself, prove that arbitrary JSON was genuinely returned by Telegraph.

Live evidence authenticity/provenance comes from the trusted acquisition boundary, which:

1. sends the Intent request to Telegraph;
2. resolves the Miner Telegraph actually routed to;
3. verifies the Miner is active and supports the requested Intent;
4. requires explicit exact subject and chain binding in returned evidence;
5. validates the Telegraph signal hash format and normalized evidence metadata;
6. validates the x402 challenge and approved payment lane when payment is required;
7. requires provable settlement;
8. preserves a hash of the raw response;
9. then constructs the Evidence Bundle inside the trusted host.

**Do not expose a production permit-minting endpoint that accepts an arbitrary agent-supplied Evidence Bundle.**

The evaluate-only HTTP gateway may accept a submitted bundle because it cannot mint a permit or execute funds. Its output must not be treated as executable authority by itself.

## Standing Mandates

A Mandate should be approved by a human/principal or another trusted authority before the agent acts. It should not be invented by the autonomous agent immediately before execution.

The adaptive payment Mandate can constrain:

- principal and agent identity
- allowed destinations
- per-action maximum
- optional cumulative maximum
- allowed Telegraph Intents
- lifecycle state
- issue/expiry time
- version

Production deployments should persist Mandates and expose an authoritative revocation/status source to the durable executor.

## Provider-neutral Telegraph routing

ProofGate asks Telegraph for an **Intent**, not a favorite Miner.

```text
ProofGate:
"I require ONCHAIN_TX_LOOKUP for this exact address on chain 84532."

Telegraph:
routes the request to a capable Miner.

ProofGate:
verifies the actual serving Miner and returned bindings.
```

Refresh the live Miner registry before a live workflow:

```bash
bash scripts/discover-telegraph.sh
```

If a required Intent has no active coverage, the adaptive workflow stops instead of silently weakening verification.

## What the live Intent client enforces

For each paid request, `createLiveIntentAcquirer(...)`:

1. preflights Telegraph;
2. parses the live x402 challenge;
3. enforces the locked Base Sepolia USDC lane;
4. enforces the per-request `0.01 USDC` price ceiling;
5. checks price against the **remaining aggregate risk-tier evidence budget before paying**;
6. performs one paid attempt only;
7. requires provable settlement;
8. refuses blind paid retry after transport ambiguity;
9. resolves the actual serving Miner;
10. verifies that Miner is active and advertises the requested Intent;
11. requires explicit exact subject and chain binding;
12. normalizes and saves the real response.

The Evidence Bundle verifier also rejects paid evidence whose committed network/asset/per-request amount is outside the approved x402 provenance rules.

## Deterministic decisions

Possible policy results are:

- `ALLOW` — every required authority and evidence check passed.
- `HOLD` — sufficient current proof cannot be established.
- `BLOCK` — a known security/authority invariant failed.

Examples:

- missing required Intent → `HOLD`
- stale evidence → `HOLD`
- fraud confidence below the tier floor → `HOLD`
- secondary status `UNKNOWN` / `UNAVAILABLE` → `HOLD`
- explicit `MALICIOUS` / `SUSPICIOUS` / `DENY` → `BLOCK`
- wrong subject/chain → `BLOCK`
- risk-tier downgrade → `BLOCK`
- un-delegated Intent → `BLOCK`
- tampered bundle → `BLOCK`
- evidence-payment provenance violation → `BLOCK`

A required explicit negative signal cannot be averaged away by favorable signals.

## Lower-level primitives

Advanced hosts can compose the pipeline manually using:

- `planPaymentAuthorization(...)`
- `createAdaptivePaymentMandate(...)`
- `collectAdaptiveEvidence(...)`
- `evaluatePaymentAuthorization(...)`
- `mintPaymentPermit(...)`
- `executeProtectedAction(...)`

This is useful when integrating an existing workflow, but the same trust rule applies: **risk planning, evidence acquisition, policy evaluation and permit minting belong inside the trusted host, not inside the autonomous agent prompt/tool context.**

## Controlled execution

After a permit exists, execution should still occur only through the controlled boundary:

```ts
import {
  executeProtectedAction
} from "../src/executor/controlled-executor.js";

const execution = await executeProtectedAction({
  mandate,
  permit: result.permit,
  action: result.action,
  evidence: result.collection.bundle,
  decision: result.authorization.decision,
  secret: localDemoSecret,
  store: permitConsumptionStore,
  execute: async (authorizedAction) => {
    // Derive transaction fields from authorizedAction.
    // Do not accept replacement values from the agent here.
    return sendPayment(authorizedAction);
  }
});
```

For multi-worker production deployments use the PostgreSQL permit-consumption and durable-execution path rather than independent filesystem stores.

### Production signer guidance

- Local/demo: HMAC development signer is supported.
- Production: use Ed25519 or a KMS/HSM adapter.
- `NODE_ENV=production` rejects the HMAC development signer.
- Keep production signing material outside the agent process.

## Evaluate-only HTTP gateway

For teams that want to inspect ProofGate planning/evaluation before embedding the SDK:

```bash
npm run gateway:serve
```

Default:

```text
http://127.0.0.1:8787
```

Endpoints:

- `GET /health`
- `POST /v1/plan`
- `POST /v1/evaluate`

Example plan request:

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

The gateway intentionally does **not**:

- accept a wallet private key over HTTP;
- purchase Telegraph evidence;
- hold a production permit-signing key;
- mint authority;
- consume a permit;
- broadcast a payment.

It is an evaluation/debugging integration surface, not the executor.

## Integration rules

Do:

- create Mandates outside agent-controlled prompting;
- use `authorizePaymentWithEvidence(...)` or an equivalent trusted-host composition;
- keep Telegraph acquisition inside the trusted authorization service;
- give the agent no direct wallet/tool bypass;
- derive transaction fields from the frozen Action Contract;
- refresh Telegraph Miner coverage before live workflows;
- treat `HOLD` as no authority;
- treat `BLOCK` as no authority;
- use a shared atomic replay store across executor replicas;
- reconcile `AMBIGUOUS` irreversible writes instead of retrying blindly;
- preserve Proof Receipts.

Do not:

- let the model choose its own risk tier;
- let the model remove required Intents;
- accept an agent-generated Evidence Bundle at a permit-minting boundary;
- confuse bundle integrity with Telegraph authenticity;
- treat Miner `ALLOW` as direct permission;
- average away an explicit negative signal;
- treat `UNKNOWN` / `UNAVAILABLE` status as positive evidence;
- replace stale/missing evidence with a favorable fixture;
- bypass the aggregate or per-request x402 budget;
- retry an ambiguous paid x402 request blindly;
- expose `.env`, wallet keys or signing keys to an agent prompt.

## Proof Receipt v3

Adaptive authorizations use `proofgate.receipt.v3` and embed the canonical Evidence Bundle.

Receipt verification checks the bundle plus the outer Mandate/action/decision/permit/execution commitments. Changing a signal hash, Miner, Intent, evidence-payment field or other committed bundle body invalidates verification.

## Current scope

ProofGate intentionally supports a narrow action today:

- payment
- Base Sepolia (`84532`)
- canonical Base Sepolia USDC
- maximum adaptive autonomous amount: `10 USDC`

It is an authorization architecture, not yet a generic arbitrary-tool policy language. That scope is intentional so the hackathon implementation can make strong, testable claims instead of pretending unsupported actions are production-ready.
