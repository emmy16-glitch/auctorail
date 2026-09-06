# Auctorail developer integration guide

This guide explains how to integrate an autonomous agent or application with Auctorail and how to design a new protected-action adapter without accidentally moving authority back into the agent.

## Integration goal

The desired architecture is:

```text
AGENT / APPLICATION
        ↓ proposal
AUCTORAIL AUTHORIZATION SERVICE
        ↓ ALLOW/HOLD/BLOCK
SIGNED ONE-USE EXECUTION AUTHORITY
        ↓
PROTECTED EXECUTOR
        ↓
EXTERNAL EFFECT
```

The protected wallet/API credential should not live inside the agent process.

## Quick start

Use Node 24 for the current dependency set.

```bash
npm ci
npm run dev
```

Local services:

```text
http://127.0.0.1:8787  payment authorization API
http://127.0.0.1:8788  utility / Security Lab / Verify / Content Trust API
http://127.0.0.1:5173  web product
```

## Safest first integration

Start with deterministic/local preflight and no intentional live Telegraph purchase.

Using the repository-local SDK:

```js
import { Auctorail } from "@auctorail/sdk";

const rail = new Auctorail({
  baseUrl: "http://127.0.0.1:8787"
});

const result = await rail.authorize({
  agent: "invoice-bot",
  amount: "1.00",
  recipient: "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
  limit: "5.00",
  reason: "Invoice INV-4471",
  live: false
});

console.log(result.decision);
```

`live:false` is useful for development because it avoids intentional paid evidence acquisition.

## Live payment authorization

When live acquisition is enabled and required, the high-level flow becomes:

```text
client request
→ local authority preflight
→ freeze exact action
→ return/commit exact fingerprint
→ Telegraph/x402 acquisition
→ evidence verification/quorum
→ deterministic policy
→ ALLOW / HOLD / BLOCK
```

A live request can spend test funds through x402, so use a bounded burner wallet and the configured evidence limits.

## What belongs on the trusted side

Keep these outside the agent/client:

- authoritative Mandate state;
- protected wallet/API private key;
- permit-signing secret;
- Telegraph/x402 payer key where appropriate;
- permit-consumption store;
- execution kill switch;
- durable execution/reconciliation state;
- policy code.

A client can request or display these concepts. It must not become the source of truth for them.

## Principal-controlled limits

The current hackathon SDK/API accepts a `limit` field for the public flow, but a production integration should not let the autonomous agent choose its own authoritative limit.

Correct pattern:

```text
principal config/database
        ↓
trusted Auctorail host
        ↓
Mandate evaluation
```

Not:

```text
agent says "my limit is 1000"
        ↓
server trusts it
```

## Integrating a new protected action

A new adapter should answer five questions before any code is connected to a real credential.

### 1. What exactly is the action?

Define a structured canonical schema.

Example for an infrastructure action:

```ts
{
  type: "restart_service",
  target: "payments-api",
  environment: "staging",
  reason: "health check failure",
  policyId: "infra.restart.v1"
}
```

Avoid making security-critical meaning depend on one free-form prompt string.

### 2. What does the principal delegate?

Define Mandate constraints.

Example:

```text
agent: ops-bot
action type: restart_service
environment: staging only
targets: payments-api, worker-api
production: forbidden
lifetime: 1 hour
```

### 3. What evidence is required?

Evidence should be consequence-specific.

For payments, Auctorail can use Telegraph fraud/transaction/balance Intents.

For another adapter, do not reuse payment evidence semantics blindly. Define what evidence would actually reduce uncertainty for that action.

### 4. What policy creates ALLOW/HOLD/BLOCK?

The decision should be deterministic and testable.

Do not embed the final security decision only in an LLM prompt.

### 5. What component actually causes the effect?

Build a protected executor that owns/accesses the sensitive credential and only accepts valid execution authority.

## Adapter freeze contract

The trusted adapter must guarantee that the action authorized is the action executed.

The safest model is:

```text
parse input
→ validate
→ normalize
→ canonicalize
→ hash
→ authorize that hash
→ execute exactly that action
```

Do not reconstruct a materially different external call after authorization.

## Evidence-plan design

When an adapter needs external intelligence, define:

- required Intent/capability;
- exact subject;
- exact context/network;
- minimum confidence where meaningful;
- freshness;
- signal commitment requirements;
- provider diversity/quorum;
- explicit negative semantics;
- max attempts;
- max evidence spend;
- max latency.

The plan should be derived from trusted policy/action context, not from an agent-supplied “please use easier checks” instruction.

## Telegraph integration rules

For the current payment adapter:

1. Route the exact required Intent.
2. Include exact action context in the request.
3. Verify the actual serving Miner.
4. Verify returned Intent/capability.
5. Require explicit subject/chain binding.
6. Apply confidence and signal-hash requirements.
7. Count distinct providers by Miner ID.
8. Enforce x402 network/asset/budget rules.
9. Treat paid ambiguity carefully.
10. Fail closed when required evidence is not usable.

## Do not convert request context into evidence

Auctorail may send:

```text
intent=FRAUD_DETECTION
target=0x...
chainId=84532
```

to improve routing.

That does not mean a returned result has proven those properties.

The provider response must still contain the explicit evidence assertions required by policy.

## `HOLD` integration behavior

Applications must treat `HOLD` as non-executable.

Correct:

```js
if (result.decision === "HOLD") {
  // show pending/insufficient proof state
  // do not execute
}
```

Incorrect:

```js
if (result.decision !== "BLOCK") {
  execute(); // unsafe: HOLD is not permission
}
```

## `BLOCK` integration behavior

`BLOCK` represents a hard policy/authority failure.

Do not automatically retry an identical blocked request unless the principal/policy/input genuinely changed.

## Executing an allowed action

The repository SDK can submit returned execution authority:

```js
if (auth.decision === "ALLOW" && auth.executionToken) {
  const receipt = await rail.execute(auth, {
    idempotencyKey: "invoice-4471-execute"
  });
}
```

The trusted server/executor still performs authoritative validation.

## Idempotency

Use stable business-operation identifiers when possible.

Example:

```text
invoice-4471-authorize
invoice-4471-execute
```

Idempotency helps distinguish retries but does not eliminate the need to reconcile ambiguous external effects.

## Ambiguous external effects

If the executor submits an external action but loses the response, do not immediately repeat it.

Model:

```text
known success  → record success
known failure  → safe failure handling
ambiguous      → reconcile first
```

For payments, duplicate execution is more dangerous than a temporary delay.

## Permit lifecycle

A permit should be:

- signed by trusted authority;
- bound to the exact action;
- bound to the authorization decision/evidence commitment;
- short-lived;
- consumed once;
- rejected after consumption.

Never expose the signing secret to the agent.

## Execution-time revalidation

Authorization can become stale between decision and effect.

The executor should therefore re-check security-relevant state such as:

- Mandate validity;
- permit expiration;
- permit signature;
- action binding;
- consumption state;
- kill-switch state.

## Receipt integration

Store or surface proof receipts for important protected actions.

A receipt can help operators answer:

- what action was requested;
- what evidence commitment was used;
- what decision was made;
- what permit authorized execution;
- what execution result was recorded.

Avoid storing secrets in receipts.

## Error handling

Separate error classes mentally:

```text
client input error
authority/policy block
evidence HOLD
Telegraph transport failure
x402 payment issue
permit failure
protected execution failure
ambiguous external effect
```

Do not flatten all of them into “authorization failed.”

See `TROUBLESHOOTING.md`.

## Live evidence budgets

Auctorail's current adaptive payment defaults are:

```text
LOW     <=5 USDC: 0.035 USDC evidence budget, 12s deadline
MEDIUM  >5–50:    0.060 USDC evidence budget, 60s deadline
HIGH    >50:      0.100 USDC evidence budget, 90s deadline
```

The payment policy still has a separate 10-USDC autonomous execution ceiling.

## Testing a new adapter

Before connecting a real effect, test at least:

- valid action;
- amount/parameter mutation;
- target swap;
- policy/version mutation;
- expired/revoked Mandate;
- missing evidence;
- wrong evidence subject;
- wrong network/context;
- stale evidence;
- duplicate-provider quorum;
- explicit negative evidence;
- forged permit;
- replayed permit;
- expired permit;
- kill-switch unavailable;
- ambiguous external effect;
- concurrent duplicate execution attempts.

## Fuzzing expectation

If a new adapter introduces new security semantics, add mutation families to the fuzz harness rather than relying only on a happy-path unit test.

The current repository validation contains 7400 deterministic adversarial cases across payment, adaptive/quorum and general authorization suites.

## Browser/UI integration

The browser is a presentation/client layer, not the authority root.

Never rely on:

- disabled buttons;
- hidden fields;
- client-side max values;
- route guards alone;

for the authoritative security decision.

Revalidate all protected semantics server-side.

## Secrets and environment

Never commit:

- private keys;
- permit-signing secrets;
- funded wallet credentials;
- production database credentials;
- provider secrets.

Use `.env.example` only as a template.

## Recommended Node runtime

The current dependency set includes modern browser/DOM packages that officially target Node 22/24.

Use **Node 24** for current local development unless you have a specific compatibility reason not to.

## SDK status

The included `@auctorail/sdk` package is repository-local/private today. It should not be described as a published npm package.

Read `../packages/sdk/README.md` for exact client behavior.

## Integration checklist

Before declaring an adapter ready:

- [ ] exact structured action schema exists;
- [ ] canonical hash/freeze is deterministic;
- [ ] principal authority is trusted-side state;
- [ ] agent cannot raise its own authority;
- [ ] evidence requirements are explicit;
- [ ] evidence binds to exact subject/action/context;
- [ ] provider diversity semantics are correct;
- [ ] evidence spend/time are bounded;
- [ ] `HOLD` cannot execute;
- [ ] explicit negatives cannot be ignored;
- [ ] permit signing secret is isolated;
- [ ] permit is one-use and replay-tested;
- [ ] executor is the only supported credential path;
- [ ] execution revalidates authority;
- [ ] ambiguous effects reconcile before retry;
- [ ] receipts/logs avoid secret leakage;
- [ ] unit/integration/fuzz tests pass;
- [ ] browser/API smoke tests pass where applicable.

## Final integration rule

**Do not integrate Auctorail by giving the agent another powerful token. Integrate by putting the powerful token behind a protected executor and making Auctorail's one-use authorization the gate to that executor.**
