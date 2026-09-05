# Integrating Auctorail into an autonomous agent

Auctorail belongs **between an autonomous agent and a consequential tool**.

The agent proposes. The trusted host owns authority, evidence acquisition, policy, permit signing, replay state, kill-switch state and execution.

```text
AUTONOMOUS AGENT
      │
      │ proposal only
      ▼
TRUSTED AUCTORAIL HOST
      │
      ├─ principal Mandate
      ├─ trusted Action Adapter
      ├─ frozen action
      ├─ Telegraph / trusted evidence
      ├─ deterministic policy
      ├─ one-use authority
      ├─ replay store
      └─ kill switch
      │
      ▼
PROTECTED EXECUTOR / ADAPTER
      │
      ▼
EXTERNAL EFFECT
```

The most important deployment rule is that the agent must not have a second unrestricted route to the protected tool.

> **Naming note:** the current product is Auctorail. Historical source identifiers such as `proofgate.action.v2`, `src/sdk/proofgate.ts`, and the TypeScript interface name `ProofGateActionAdapter` are retained for compatibility.

---

## 1. Choose the integration path

There are two practical paths in this repository.

### Payment path

Use the existing payment authorization stack when you want to protect the implemented Base Sepolia USDC flow.

Relevant pieces include:

- `src/sdk/proofgate.ts` — historical internal payment SDK file;
- `src/telegraph/adaptive-evidence-plan.ts` — LOW/MEDIUM/HIGH evidence planning;
- `src/policy/payments-adaptive-v1.ts` — adaptive payment policy;
- `src/executor/base-sepolia-usdc.ts` — protected payment execution;
- `src/receipt/proof-receipt.ts` — payment proof receipt.

The repository-local public-facing hackathon package is under `packages/sdk/` and exports `Auctorail`.

### Generic action path

Use `src/sdk/action-adapter.ts` when you want to protect another consequential action.

The generic core provides:

- `proofgate.action.v2`;
- `proofgate.mandate.v2`;
- `proofgate.decision.v2`;
- `proofgate.permit.v2`;
- `ActionAdapterRegistry`;
- trusted evidence-coverage enforcement;
- execution-time Mandate revalidation;
- fail-closed kill-switch behavior;
- atomic one-use replay protection;
- `AMBIGUOUS` handling for uncertain external effects.

---

## 2. What an Action Adapter is

An Action Adapter is **trusted application code** that understands one kind of external effect.

For example, a GitHub merge adapter knows how to freeze a merge proposal, what evidence it needs, and how to execute the merge only after Auctorail authorizes it.

```ts
import { createGeneralAction } from "../src/core/general-action.js";
import type { ProofGateActionAdapter } from "../src/sdk/action-adapter.js";

interface MergeProposal {
  target: string;
  branch: string;
  sha: string;
}

const mergeAdapter: ProofGateActionAdapter<
  MergeProposal,
  { merged: boolean }
> = {
  type: "github.merge",
  policyId: "github.merge.v1",
  policyVersion: 1,

  freeze(proposal) {
    return createGeneralAction({
      type: "github.merge",
      target: proposal.target,
      parameters: {
        branch: proposal.branch,
        sha: proposal.sha
      },
      policyId: "github.merge.v1",
      policyVersion: 1
    });
  },

  requiredIntents() {
    return ["CI_STATUS", "SECURITY_SCAN"];
  },

  async evaluateTrusted({ action }) {
    const evidence = await verifyMergeEvidence(action);

    return {
      evidenceCommitmentHash: evidence.commitmentHash,
      coveredIntents: ["CI_STATUS", "SECURITY_SCAN"],
      checks: [
        {
          name: "ci_status",
          status: evidence.ciPassed ? "PASS" : "BLOCK",
          reason: evidence.ciPassed
            ? "Required CI passed."
            : "Required CI failed."
        },
        {
          name: "security_scan",
          status: evidence.securityPassed ? "PASS" : "BLOCK",
          reason: evidence.securityPassed
            ? "Required security scan passed."
            : "Security scan found a blocking issue."
        }
      ]
    };
  },

  async execute(action) {
    return performMerge(action);
  }
};
```

This GitHub example demonstrates the adapter contract only. The repository does **not** claim a production GitHub merge connector.

---

## 3. Register only trusted adapters

```ts
import { ActionAdapterRegistry } from "../src/sdk/action-adapter.js";

const registry = new ActionAdapterRegistry();
registry.register(mergeAdapter);
```

Registration binds an action type to a policy ID/version and trusted implementation.

Auctorail also checks that `freeze()` returns the same type/policy/version that was registered. An adapter cannot register one policy and freeze an action under another one without failing the authorization path.

Do not register arbitrary third-party adapter code without review. The adapter executes inside the trusted host boundary.

---

## 4. Create the principal Mandate outside the agent prompt

The principal's authority must exist independently of the agent's current request.

```ts
import { createGeneralMandate } from "../src/core/general-mandate.js";

const mandate = createGeneralMandate({
  mandateId: "engineering-agent-sept-2026",
  principalId: "acme-engineering",
  agentId: "coding-agent",

  allowedActionTypes: ["github.merge"],
  allowedTargets: ["github:acme/production#42"],
  requiredIntents: ["CI_STATUS", "SECURITY_SCAN"],

  policyId: "github.merge.v1",
  policyVersion: 1,
  status: "ACTIVE",
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  version: 1
});
```

The agent should not be allowed to silently create a new Mandate with a larger target set, longer expiry or broader action scope just because its prompt asks for it.

---

## 5. Authorize the proposal

```ts
import { authorizeRegisteredAction } from "../src/sdk/action-adapter.js";

const authorization = await authorizeRegisteredAction({
  registry,
  adapterType: "github.merge",
  policyId: "github.merge.v1",
  policyVersion: 1,

  proposal: {
    target: "github:acme/production#42",
    branch: "main",
    sha: "abc123..."
  },

  mandate,
  agentId: "coding-agent",
  signer: permitSigner,
  ttlSeconds: 30
});

if (!authorization.permit) {
  console.error(
    authorization.decision.decision,
    authorization.decision.reason
  );
  return;
}
```

### What Auctorail checks before a permit can exist

The generic authorization path:

1. resolves the trusted adapter;
2. freezes/canonicalizes the proposal;
3. verifies adapter type and policy metadata;
4. evaluates the principal Mandate;
5. derives adapter-required evidence Intents;
6. verifies those Intents were delegated;
7. stops before trusted evidence work if authority already fails;
8. runs trusted evidence verification;
9. requires exact evidence-coverage accounting;
10. rejects unrequested claimed Intents;
11. requires an evidence commitment when evidence is required;
12. requires trusted checks when evidence is required;
13. creates the decision;
14. mints short-lived authority only when every required check passes.

Checking authority before paid evidence acquisition matters because an undelegated proposal should not be able to burn the principal's Telegraph/x402 budget.

---

## 6. Evidence commitments: integrity is not authenticity

When external evidence is required, `evaluateTrusted()` should return something like:

```ts
{
  evidenceCommitmentHash: "0x...",
  coveredIntents: ["CI_STATUS", "SECURITY_SCAN"],
  checks: [/* deterministic trusted checks */]
}
```

Auctorail treats missing required evidence conservatively:

```text
missing required Intent coverage  → HOLD
required evidence, no commitment  → HOLD
required evidence, no trusted check → HOLD
undelegated required Intent        → BLOCK
unrequested claimed Intent         → BLOCK
```

A hash proves integrity of what was committed. It does **not** prove that the source was genuine.

For Telegraph-backed integrations, the trusted host must own the actual routing/x402/provenance checks. Do not let the model fabricate an “evidence bundle” and then treat its hash as authenticated proof.

---

## 7. Execute only through the controlled boundary

```ts
import { executeRegisteredAction } from "../src/sdk/action-adapter.js";

const execution = await executeRegisteredAction({
  registry,
  mandate,
  authorization,
  verifier: permitVerifier,
  store: sharedPermitConsumptionStore,
  killSwitch: executionKillSwitch,
  executionId: crypto.randomUUID()
});
```

Before `adapter.execute()` runs, Auctorail:

1. checks kill-switch state;
2. fails closed if authoritative kill-switch state cannot be read;
3. verifies decision integrity and semantics;
4. re-evaluates the Mandate at execution time;
5. verifies permit signature, bindings and time window;
6. atomically consumes the permit ID + nonce;
7. only then calls the trusted adapter.

This prevents a still-live permit from being used after the underlying Mandate has expired or been revoked.

---

## 8. Replay and ambiguous external effects

A permit is designed for one protected execution attempt through the supported executor path.

After the permit has been claimed, an external call that throws may be ambiguous:

```text
remote system may have completed effect
        +
local connection failed
        =
AMBIGUOUS
```

Do not automatically retry an irreversible effect in this state. The permit remains consumed. Reconcile the remote system first, then create a new authorization only if a new action is actually needed.

For multi-worker deployments, use the shared PostgreSQL permit-consumption store instead of independent local files.

---

## 9. Kill switch

The generic executor expects an authoritative kill-switch source.

```ts
const executionKillSwitch = {
  async isDisabled() {
    return readAuthoritativeOperationalState();
  }
};
```

If execution is disabled, the effect is blocked before permit claim.

If the state cannot be read, the safe behavior is to fail closed rather than assume execution is allowed.

---

## 10. Signing and secrets

Keep permit-signing and execution credentials outside the autonomous agent's prompt/data boundary.

Current repository behavior distinguishes development from production-oriented signing:

- development/test code may use local HMAC signing;
- production guards reject HMAC permit minting;
- production deployments should use Ed25519 or a KMS/HSM-compatible signer;
- live Telegraph/x402 and execution-wallet private keys remain server-side.

The repository-local `@auctorail/sdk` package contains no private keys or Miner credentials.

---

## 11. Telegraph-backed custom adapters

A custom adapter may use Telegraph as its evidence source.

Conceptually:

```text
adapter.requiredIntents(action)
        ↓
trusted host requests Telegraph Intent(s)
        ↓
Telegraph routes to Miner(s)
        ↓
host verifies provider + provenance + binding
        ↓
host commits accepted evidence
        ↓
adapter returns coveredIntents + checks
        ↓
Auctorail ALLOW / HOLD / BLOCK
        ↓
permit only on ALLOW
```

If same-Intent provider diversity matters, reuse the quorum primitives in:

- `src/telegraph/evidence-quorum.ts`
- `src/telegraph/adaptive-orchestrator.ts`
- `src/telegraph/evidence-bundle.ts`

The current built-in live distinct-Miner quorum wiring is concretely implemented for the adaptive payment path.

---

## 12. Existing adaptive payment integration

The payment path is the first real protected external effect demonstrated publicly.

It provides:

- consequence-derived LOW/MEDIUM/HIGH evidence planning;
- multiple Telegraph Intents at higher consequence;
- distinct-Miner fraud quorum;
- bounded x402 per-request and aggregate evidence spend;
- evidence bundles and decision commitments;
- payment-specific policy;
- one-use permit/execution path;
- payment receipt verification.

See:

- [`ARCHITECTURE.md`](ARCHITECTURE.md)
- [`RISK_POLICY.md`](RISK_POLICY.md)
- [`LIVE_EXECUTION.md`](LIVE_EXECUTION.md)
- [`REAL_USAGE_LOG.md`](REAL_USAGE_LOG.md)

---

## 13. Repository-local SDK

The hackathon package can be installed directly from the repository:

```bash
npm install ./packages/sdk
```

Example:

```js
import { Auctorail } from "@auctorail/sdk";

const rail = new Auctorail({
  baseUrl: "http://127.0.0.1:8787"
});

const auth = await rail.authorize({
  agent: "invoice-bot",
  amount: "1.00",
  recipient: "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
  reason: "Supplier invoice #4471",
  reference: "INV-4471",
  live: false
});

console.log(auth.decision);
```

Use `live: false` when you want local policy preflight without making a paid live Telegraph request.

Do not advertise `@auctorail/sdk` as a public npm release until it is actually published.

---

## 14. Adapter security checklist

Do:

- create Mandates outside agent-controlled reasoning;
- register only reviewed trusted adapters;
- freeze exact action semantics before evidence acquisition;
- check authority before spending on evidence;
- keep evidence acquisition and permit signing in the trusted host;
- account for every required Intent;
- derive execution parameters from the frozen action;
- use shared atomic replay state across workers;
- require a fail-closed kill switch;
- revalidate current authority immediately before execution;
- reconcile ambiguous effects instead of blindly retrying;
- preserve receipt/evidence/decision material for audit.

Do not:

- let the agent create its own authoritative Mandate;
- let the agent choose authoritative risk/quorum thresholds;
- treat a Miner `ALLOW` as permission;
- count repeated responses from the same Miner as independent providers;
- average away explicit negative evidence;
- accept arbitrary agent-supplied JSON as authenticated Telegraph proof;
- expose signer or execution credentials to the agent;
- give the agent a bypass around the controlled executor;
- automatically retry an irreversible ambiguous effect.

---

## 15. Current scope

Auctorail's authorization core is action-general through trusted adapters.

What is demonstrated today:

- a real protected Base Sepolia USDC execution;
- genuine Telegraph/x402 evidence in the payment lane;
- consequence-adaptive distinct-Miner quorum logic;
- Content Trust policy and verifiable content receipts;
- deterministic Security Lab and fuzz validation;
- a repository-local SDK.

What is not claimed:

- production GitHub/cloud/database adapters;
- a public hosted developer-authentication boundary;
- arbitrary untrusted adapter sandboxing;
- a public npm release;
- an independent production security audit.

For the documentation source-of-truth order, see [`README.md`](README.md).
