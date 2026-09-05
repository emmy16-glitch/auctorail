# `@auctorail/sdk`

A small JavaScript SDK for integrating an agent with the Auctorail payment authorization API.

> **Current status:** this package is used from inside the hackathon repository and is intentionally marked `private`. It is **not** being presented as a published npm package yet.

The SDK is deliberately thin. It does not contain private keys, permit-signing secrets, Miner credentials, or a protected execution wallet. Those stay on the trusted Auctorail host/API side.

---

## What the SDK does

The SDK exposes two main operations:

```text
authorize()
  ↓
ALLOW / HOLD / BLOCK

execute()
  ↓
protected execution only when executable authority was returned
```

The important security boundary is that the SDK **asks** the trusted Auctorail service for authorization. It does not mint its own authority.

---

## Install from this repository

From the repository root:

```bash
npm install ./packages/sdk
```

Then import it with:

```js
import { Auctorail } from "@auctorail/sdk";
```

---

## Start Auctorail locally

From the repository root:

```bash
npm ci
npm run dev
```

The payment authorization API is available locally at:

```text
http://127.0.0.1:8787
```

---

## Safest first example: local preflight only

Use `live: false` while learning the SDK. This stops after local policy preflight and does not intentionally purchase Telegraph evidence.

```js
import { Auctorail } from "@auctorail/sdk";

const rail = new Auctorail({
  baseUrl: "http://127.0.0.1:8787"
});

const auth = await rail.authorize({
  agent: "invoice-bot",
  amount: "1.00",
  recipient: "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
  limit: "10.00",
  reason: "Supplier invoice #4471",
  reference: "INV-4471",
  live: false
});

console.log(auth.decision);
// ALLOW | HOLD | BLOCK

console.log(auth.reason);
console.log(auth.riskTier);
```

A local preflight can tell you that a request is outside policy/authority, or that it would require live evidence. It is not a substitute for the live Telegraph evidence path when policy requires that evidence.

---

## Live authorization

If `live` is omitted, `authorize()` follows the real two-stage payment authorization flow when local policy says external intelligence is required:

```text
1. local policy preflight
2. freeze fingerprint returned by the API
3. live Telegraph/x402 authorization
4. normalized ALLOW / HOLD / BLOCK result
```

Example:

```js
const auth = await rail.authorize({
  agent: "invoice-bot",
  amount: "1.00",
  recipient: "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
  limit: "10.00",
  reason: "Supplier invoice #4471",
  reference: "INV-4471"
});
```

**Important:** a live authorization can cause a real x402 payment for Telegraph evidence if the server is configured for live acquisition. Use a funded burner wallet, bounded budgets, and the repository's live-run guidance.

---

## Execute an allowed action

`execute()` only works when the authorization response includes executable authority from the trusted Auctorail API.

```js
if (auth.allowed && auth.executionToken) {
  const receipt = await rail.execute(auth);
  console.log(receipt);
}
```

If the result is `HOLD` or `BLOCK`, the SDK does not invent a token and should not attempt protected execution.

---

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
| `baseUrl` | `string` | Origin of the Auctorail authorization API. |
| `headers` | `Record<string,string>` | Optional headers added to SDK requests. Do not embed long-lived secrets in browser code. |

---

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
| `agent` | No | Agent identity. Defaults to `invoice-bot` in the current package. |
| `amount` | Yes | Positive payment amount. Numeric strings are accepted. |
| `recipient` | Yes | Exact payment destination. |
| `limit` | No | Principal-side amount limit used by the current API request. If omitted, the SDK currently sends the amount itself as the limit. For real integrations, use an explicit principal-controlled limit rather than letting an agent choose its own ceiling. |
| `durationSeconds` | No | Requested authorization/Mandate duration. Current default is `3600`. |
| `reason` | No | Human-readable reason for the payment. |
| `reference` | No | Business/reference identifier such as an invoice ID. |
| `live` | No | `false` stops after local preflight. Omitted/default behavior may proceed to real Telegraph/x402 acquisition when required. |
| `idempotencyKey` | No | Optional key for the live authorization request. The SDK generates one when omitted. |

### Important trust note about `limit`

The SDK accepts `limit` because the current hackathon API shape uses it, but a production integration should not treat an agent-supplied `limit` as authoritative delegated permission.

The real security model is:

```text
principal-controlled mandate/limit
          ≠
agent-provided request field
```

Keep authoritative permission on the trusted host/service side.

---

## Authorization result

The SDK normalizes the API response into this shape:

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

### What to check in application code

Prefer the explicit decision:

```js
switch (auth.decision) {
  case "ALLOW":
    // May proceed only if executable authority is present.
    break;
  case "HOLD":
    // Do not execute. Evidence was not sufficient to authorize safely.
    break;
  case "BLOCK":
    // Do not execute. A hard authorization/policy rule failed.
    break;
}
```

`allowed === true` is equivalent to `decision === "ALLOW"` in the current SDK normalizer.

---

## `execute(authorization, options?)`

```ts
interface ExecuteOptions {
  idempotencyKey?: string;
}
```

Example:

```js
const receipt = await rail.execute(auth, {
  idempotencyKey: "invoice-4471-execution"
});
```

The SDK extracts the execution token returned by the trusted authorization API and posts it to `/api/execute`.

The server-side executor remains responsible for re-checking execution authority and applying replay/idempotency controls.

---

## Idempotency

The SDK generates an idempotency key when one is not supplied for live authorization/execution requests.

For a real application, use a stable business operation ID where practical, for example:

```text
invoice-4471-authorize
invoice-4471-execute
```

Do not blindly retry an ambiguous paid evidence request or ambiguous external execution. Auctorail's host-side logic has separate reconciliation/ambiguity controls for this reason.

---

## Error handling

Non-2xx API responses throw an `Error` with additional fields when available:

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

Input validation performed in the SDK includes:

- `authorize(input)` must receive an object;
- `amount` must be a positive finite number/numeric string;
- `recipient` is required.

Server-side policy performs the authoritative security validation.

---

## What the SDK deliberately does not do

The package does **not**:

- hold the Base Sepolia execution private key;
- hold the Telegraph/x402 payment private key;
- hold the permit-signing secret;
- decide its own Mandate;
- convert a Miner result directly into execution permission;
- bypass the server-side policy/executor;
- guarantee that an arbitrary agent adapter is safe;
- claim the package is published on npm.

Those omissions are part of the trust boundary, not missing convenience features.

---

## Security checklist for integrators

Before connecting Auctorail to a real protected tool:

1. Keep the protected credential/wallet away from the agent process.
2. Make the Auctorail executor the only supported route to the protected side effect.
3. Keep principal Mandates/limits on the trusted side.
4. Use explicit action targets and bounded parameters.
5. Use idempotency keys for operations that may be retried.
6. Treat `HOLD` as **no permission to execute**.
7. Never treat a Miner `ALLOW` as direct authority.
8. Keep live evidence budgets and deadlines bounded.
9. Preserve receipts/logs for debugging and auditability.
10. Test mutation, replay, stale evidence and ambiguous-effect behavior before production use.

---

## Repository references

- Root project guide: [`../../README.md`](../../README.md)
- Documentation index: [`../../docs/README.md`](../../docs/README.md)
- Architecture: [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)
- Developer integration: [`../../docs/DEVELOPER_INTEGRATION.md`](../../docs/DEVELOPER_INTEGRATION.md)
- Risk policy: [`../../docs/RISK_POLICY.md`](../../docs/RISK_POLICY.md)
- SDK implementation: [`index.js`](index.js)
- Type declarations: [`index.d.ts`](index.d.ts)

---

## One-line rule

**The SDK can request authorization and submit returned executable authority; it must never become the component that grants itself that authority.**
