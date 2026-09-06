# `@auctorail/sdk`

A small JavaScript SDK for integrating an application or autonomous agent with the Auctorail payment authorization API.

> **Current status:** this package is repository-local and intentionally private. It is **not** being claimed as a published npm package.

The SDK is intentionally thin. It gives client applications a convenient way to request authorization and submit returned execution authority without moving protected credentials or permit-signing power into the agent.

## Security boundary

The most important design rule is:

```text
SDK asks for authority
      ≠
SDK creates authority
```

The trusted Auctorail host remains responsible for:

- authoritative Mandate state;
- policy evaluation;
- Telegraph/x402 evidence acquisition;
- evidence binding/quorum;
- permit signing;
- permit-consumption state;
- protected execution credentials;
- kill switch and reconciliation state.

The SDK should remain safe to use from an application process that is less trusted than the protected executor.

## What the SDK exposes

```text
authorize()
  ↓
ALLOW / HOLD / BLOCK

execute()
  ↓
protected execution only when executable authority exists
```

An authorization result can explain why an action is allowed, held or blocked. The client must not reinterpret `HOLD` as permission.

## Install from this repository

From the Auctorail repository root:

```bash
npm install ./packages/sdk
```

Import:

```js
import { Auctorail } from "@auctorail/sdk";
```

## Recommended development runtime

Use **Node 24** for current local development where possible.

The redesigned repository includes modern browser/DOM development dependencies that officially target Node 22/24. Some CI jobs still exercise Node 20 for compatibility, but that should not be interpreted as the preferred SDK/runtime baseline.

## Start Auctorail locally

From repository root:

```bash
npm ci
npm run dev
```

Payment authorization API:

```text
http://127.0.0.1:8787
```

## Safest first example — preflight only

Use `live: false` while learning or testing basic integration.

```js
import { Auctorail } from "@auctorail/sdk";

const rail = new Auctorail({
  baseUrl: "http://127.0.0.1:8787"
});

const auth = await rail.authorize({
  agent: "invoice-bot",
  amount: "1.00",
  recipient: "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
  limit: "5.00",
  reason: "Supplier invoice #4471",
  reference: "INV-4471",
  live: false
});

console.log(auth.decision);
// ALLOW | HOLD | BLOCK

console.log(auth.reason);
console.log(auth.riskTier);
```

`live:false` avoids intentionally purchasing Telegraph evidence. It is useful for local development and policy preflight, but it is not a substitute for required live evidence when a real authorization policy demands that evidence.

## Live authorization

When live mode is enabled and the trusted server determines external intelligence is required, `authorize()` follows the real authorization path.

Conceptually:

```text
1. validate client request
2. trusted authority preflight
3. freeze exact action / fingerprint
4. derive evidence requirements
5. acquire Telegraph/x402 evidence
6. verify serving Miner + exact binding
7. evaluate policy
8. return ALLOW / HOLD / BLOCK
```

Example:

```js
const auth = await rail.authorize({
  agent: "invoice-bot",
  amount: "1.00",
  recipient: "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
  limit: "5.00",
  reason: "Supplier invoice #4471",
  reference: "INV-4471"
});
```

**Live warning:** if the server is configured for genuine Telegraph acquisition, this call can cause a real x402 evidence payment from the configured test/burner wallet.

## Current LOW live behavior

For a payment `<= 5 USDC`, the current adaptive evidence plan requires:

```text
Intent:               FRAUD_DETECTION
Distinct Miners:      1
Qualified positives:  1
Confidence:           >= 0.70
Signal commitment:    required
Exact subject:        required
Exact chain:          required
Max fraud attempts:   3
Max evidence spend:   0.035 USDC
Overall deadline:     12 seconds
```

The 12-second deadline is the current value. Older documentation that says 35 seconds is stale.

If valid evidence cannot be obtained inside the bounded plan, the expected safe result is `HOLD`, not an automatic `ALLOW`.

## Execute an allowed action

`execute()` should be called only when the authorization result contains executable authority.

```js
if (auth.decision === "ALLOW" && auth.executionToken) {
  const receipt = await rail.execute(auth, {
    idempotencyKey: "invoice-4471-execution"
  });

  console.log(receipt);
}
```

Do not execute based only on:

```js
auth.reason
```

or a displayed Miner verdict. Use the normalized authorization state and returned trusted execution token.

## Constructor

```js
const rail = new Auctorail({
  baseUrl: "http://127.0.0.1:8787",
  headers: {
    // optional deployment-specific headers
  }
});
```

### Options

| Option | Type | Meaning |
| --- | --- | --- |
| `baseUrl` | `string` | Origin of the trusted Auctorail authorization API. |
| `headers` | `Record<string,string>` | Optional request headers. Avoid long-lived protected secrets in browser/client code. |

## `authorize(input)`

```ts
interface AuthorizeInput {
  agent?: string;
  amount: number | string;
  recipient: string;
  limit?: number | string;
  durationSeconds?: number;
  reason?: string;
  reference?: string;
  live?: boolean;
  idempotencyKey?: string;
}
```

### Fields

| Field | Required? | Meaning |
| --- | --- | --- |
| `agent` | No | Agent identity. Current package default is `invoice-bot`. |
| `amount` | Yes | Positive payment amount. Numeric strings are accepted. |
| `recipient` | Yes | Exact payment destination. |
| `limit` | No | Limit field used by the current hackathon API/control surface. **Do not use an agent-provided value as authoritative production Mandate state.** |
| `durationSeconds` | No | Requested authorization/Mandate duration. Current default is `3600`. |
| `reason` | No | Human-readable business reason. |
| `reference` | No | Stable operation/business reference. |
| `live` | No | `false` stops after local/preflight behavior. Default behavior may enter genuine evidence acquisition when required/configured. |
| `idempotencyKey` | No | Stable key for repeated logical authorization requests. Generated when omitted. |

## Important trust warning about `limit`

The SDK accepts `limit` because the current public/hackathon API shape exposes it.

That does **not** mean an autonomous agent should control its own real spending authority.

Production model:

```text
principal / trusted policy store
        ↓
server-side Mandate
        ↓
agent request checked against Mandate
```

Unsafe model:

```text
agent sends limit=1000
server trusts the field as permission
```

See `../../MANDATE_IMPLEMENTATION_NOTES.md`.

## Authorization result

Current normalized shape:

```ts
interface AuthorizationResult {
  id: string | null;
  decision: "ALLOW" | "HOLD" | "BLOCK";
  allowed: boolean;
  reason: string | null;
  riskTier: string | null;
  action: unknown;
  evidence: unknown;
  permit: unknown;
  executionToken: string | null;
  raw: any;
}
```

### Recommended client handling

```js
switch (auth.decision) {
  case "ALLOW":
    if (!auth.executionToken) {
      // Allowed decision may still be non-executable for some action lanes.
      return;
    }

    // Submit returned authority to the trusted executor/API.
    break;

  case "HOLD":
    // Required proof is not sufficient right now.
    // Do not execute.
    break;

  case "BLOCK":
    // Hard policy/authority failure.
    // Do not execute.
    break;
}
```

## Meaning of `HOLD`

`HOLD` is intentionally fail-closed.

Possible causes include:

- Telegraph route unavailable;
- wrong returned Intent;
- evidence not explicitly bound to the subject/chain;
- confidence below threshold;
- missing signal commitment;
- insufficient distinct-Miner quorum;
- evidence deadline reached;
- evidence budget exhausted.

The client should display/explain the state, not fall back to direct execution.

## Meaning of `BLOCK`

`BLOCK` represents a hard authorization or policy failure, for example:

- amount outside trusted authority;
- wrong recipient;
- unsupported chain/asset;
- revoked/expired Mandate;
- explicit negative evidence;
- invalid action binding;
- autonomous ceiling exceeded.

Identical blocked requests should not be automatically retried merely to search for a different outcome.

## `execute(authorization, options?)`

```ts
interface ExecuteOptions {
  idempotencyKey?: string;
}
```

Example:

```js
const receipt = await rail.execute(auth, {
  idempotencyKey: "invoice-4471-execute"
});
```

The SDK extracts the execution token returned by the trusted Auctorail service and posts it to `/api/execute`.

The protected server/executor remains responsible for:

- permit integrity;
- action binding;
- decision/evidence binding;
- expiration;
- Mandate revalidation;
- permit-consumption/replay state;
- kill switch;
- durable execution/ambiguity handling.

## Idempotency

Use a stable business operation identifier where practical.

```text
invoice-4471-authorize
invoice-4471-execute
```

Idempotency helps avoid duplicate logical requests, but it does not make an ambiguous external effect safe to repeat automatically.

## Ambiguous live evidence requests

If a paid evidence request may have created an x402 payment but the transport result is unclear, do not blindly repeat it.

The trusted Auctorail service has reconciliation/ambiguity controls because repeated paid calls can duplicate evidence spend.

## Ambiguous external execution

Likewise, if an external payment may have been broadcast but the response is lost, a client should not assume failure and submit a fresh execution immediately.

Auctorail treats this as a reconciliation problem.

## Error handling

Non-2xx API responses throw an `Error` with extra fields when available:

```js
try {
  const auth = await rail.authorize({
    amount: "1.00",
    recipient: "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
    live: false
  });
} catch (error) {
  console.error(error.message);
  console.error(error.code);
  console.error(error.status);
  console.error(error.body);
}
```

Client-side input checks are convenience validation. Trusted server-side policy remains authoritative.

## What the SDK deliberately does not contain

The package does **not**:

- hold the protected Base Sepolia execution private key;
- hold the Telegraph/x402 payer private key;
- hold the permit-signing secret;
- own authoritative Mandate state;
- directly convert a Miner verdict into permission;
- bypass server-side policy;
- bypass the protected executor;
- make arbitrary third-party adapter code trustworthy;
- claim publication to npm.

Those omissions are part of the architecture.

## Browser use

If this SDK or similar client code is used from a browser:

- do not embed protected credentials in shipped JavaScript;
- treat browser state as untrusted request state;
- keep authoritative Mandates server-side;
- keep protected execution server-side;
- use normal web security controls for authentication/CSRF/CORS as appropriate to the deployment.

A disabled UI button is not a security boundary.

## Server/agent use

For an agent running in a backend service, the same rule still applies: the agent process should not need the protected executor private key merely to request authorization.

Auctorail is most useful when compromise of the agent process does **not** automatically expose unrestricted execution authority.

## Public package status

The project currently demonstrates a repository-local SDK and product Docs surface.

Safe wording:

> Auctorail includes a repository-local JavaScript SDK for authorization integration.

Do not say:

> Install Auctorail from npm

unless a real public package is actually published later.

## Current validation

Current green repository validation includes:

```text
53 test files
268 / 268 tests passed
7400 / 7400 deterministic adversarial cases contained
```

The SDK check is also part of the repository CI command.

## Integrator security checklist

Before connecting a real protected effect:

1. Keep protected credentials outside the agent/client.
2. Keep authoritative Mandates on the trusted side.
3. Freeze exact action semantics before authorization.
4. Never let the agent raise its own authority.
5. Treat Miner output as evidence, not permission.
6. Treat `HOLD` as no-execution.
7. Treat `BLOCK` as no-execution.
8. Use returned executable authority only for the exact action.
9. Use stable idempotency keys.
10. Do not blindly retry ambiguous paid/external operations.
11. Preserve receipts/operation references.
12. Test mutation, replay, expiry and stale/missing evidence.
13. Keep evidence attempts/spend/deadlines bounded.
14. Re-run server-side validation even if the client already validated input.

## Repository references

- Root project guide: [`../../README.md`](../../README.md)
- Documentation index: [`../../docs/README.md`](../../docs/README.md)
- Product story: [`../../docs/PRODUCT_STORY.md`](../../docs/PRODUCT_STORY.md)
- Architecture: [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)
- Security model: [`../../docs/SECURITY_MODEL.md`](../../docs/SECURITY_MODEL.md)
- Developer integration: [`../../docs/DEVELOPER_INTEGRATION.md`](../../docs/DEVELOPER_INTEGRATION.md)
- Risk policy: [`../../docs/RISK_POLICY.md`](../../docs/RISK_POLICY.md)
- Troubleshooting: [`../../docs/TROUBLESHOOTING.md`](../../docs/TROUBLESHOOTING.md)
- Mandate notes: [`../../MANDATE_IMPLEMENTATION_NOTES.md`](../../MANDATE_IMPLEMENTATION_NOTES.md)
- SDK implementation: [`index.js`](index.js)
- Type declarations: [`index.d.ts`](index.d.ts)

## Final SDK rule

**The SDK should make Auctorail easy to ask, not easy to bypass. It transports proposals and trusted execution authority; it does not become the authority root itself.**
