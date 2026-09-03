# Integrating ProofGate into another autonomous agent

ProofGate belongs **between an autonomous agent and a consequential tool**.

The agent supplies a proposal. The trusted host owns authority, evidence acquisition, policy, Permit signing, replay state, kill switch and execution.

```text
Autonomous Agent
      |
      | proposal only
      v
Trusted ProofGate host
      |
      +-- standing principal Mandate
      +-- trusted Action Adapter
      +-- canonical frozen action
      +-- required evidence / Telegraph routing
      +-- deterministic checks
      +-- signed one-use Permit
      +-- replay store + kill switch
      |
      v
Controlled adapter execution
      |
      v
External effect
```

The agent must not have a second direct route around this boundary.

## 1. Choose the integration mode

ProofGate exposes two useful paths.

### Existing adaptive payment SDK

Use `src/sdk/proofgate.ts` when the protected action is the implemented Base Sepolia USDC payment flow. It includes adaptive Telegraph planning, x402 evidence acquisition, Evidence Bundles and the payment Permit/executor path.

### General v1.2 Action Adapter SDK

Use `src/sdk/action-adapter.ts` when you want ProofGate to authorize another kind of consequential action.

The generic path provides:

- `proofgate.action.v2`
- `proofgate.mandate.v2`
- `proofgate.decision.v2`
- `proofgate.permit.v2`
- `ActionAdapterRegistry`
- trusted evidence-coverage enforcement
- execution-time Mandate revalidation
- fail-closed execution kill switch
- atomic single-use replay protection
- `AMBIGUOUS` handling for uncertain external effects

## 2. What an Action Adapter is

An adapter is **trusted application code** that knows the semantics of one external action.

```ts
import {
  createGeneralAction
} from "../src/core/general-action.js";
import type {
  ProofGateActionAdapter
} from "../src/sdk/action-adapter.js";

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

  requiredIntents(_action) {
    return ["CI_STATUS", "SECURITY_SCAN"];
  },

  async evaluateTrusted({
    action,
    requiredIntents
  }) {
    // This runs inside the trusted host, not in the agent prompt.
    // Obtain/verify the real evidence appropriate to this adapter.
    const evidence = await verifyMergeEvidence(action);

    return {
      evidenceCommitmentHash:
        evidence.commitmentHash,
      coveredIntents: [
        "CI_STATUS",
        "SECURITY_SCAN"
      ],
      checks: [
        {
          name: "ci_status",
          status: evidence.ciPassed
            ? "PASS"
            : "BLOCK",
          reason: evidence.ciPassed
            ? "Required CI passed."
            : "Required CI failed."
        },
        {
          name: "security_scan",
          status: evidence.securityPassed
            ? "PASS"
            : "BLOCK",
          reason: evidence.securityPassed
            ? "Required security scan passed."
            : "Security scan found a blocking issue."
        }
      ]
    };
  },

  async execute(action) {
    // Derive the actual side-effect fields from action.parameters/target.
    // Never accept replacement execution values from the agent here.
    return performMerge(action);
  }
};
```

The sample action names are examples. ProofGate does not ship a production GitHub merge connector in v1.2.

## 3. Register the trusted adapter

```ts
import {
  ActionAdapterRegistry
} from "../src/sdk/action-adapter.js";

const registry = new ActionAdapterRegistry();
registry.register(mergeAdapter);
```

The registry prevents duplicate registration for the same action-type/policy/version tuple.

When authorizing, ProofGate also verifies that `freeze()` returns the exact type/policy/version that was registered. A mismatched frozen contract fails before Permit creation.

## 4. Create a principal Mandate

The principal creates standing authority outside the agent-controlled reasoning context.

```ts
import {
  createGeneralMandate
} from "../src/core/general-mandate.js";

const mandate = createGeneralMandate({
  mandateId: "engineering-agent-sept-2026",
  principalId: "acme-engineering",
  agentId: "coding-agent",

  allowedActionTypes: [
    "github.merge"
  ],

  allowedTargets: [
    "github:acme/production#42"
  ],

  requiredIntents: [
    "CI_STATUS",
    "SECURITY_SCAN"
  ],

  policyId: "github.merge.v1",
  policyVersion: 1,
  status: "ACTIVE",
  issuedAt: new Date().toISOString(),
  expiresAt:
    new Date(Date.now() + 60 * 60 * 1000)
      .toISOString(),
  version: 1
});
```

The general Mandate binds exact agent identity, allowed action type, exact targets, delegated evidence classes, policy/version and lifecycle.

## 5. Authorize the agent proposal

```ts
import {
  authorizeRegisteredAction
} from "../src/sdk/action-adapter.js";

const authorization =
  await authorizeRegisteredAction({
    registry,
    adapterType: "github.merge",
    policyId: "github.merge.v1",
    policyVersion: 1,

    // This is the only part supplied by the agent.
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
  // HOLD/BLOCK = no executable authority.
  console.error(
    authorization.decision.decision,
    authorization.decision.reason
  );
  return;
}
```

### What happens inside this call

1. resolve the trusted adapter;
2. freeze/canonicalize the proposal;
3. verify adapter type/policy consistency;
4. evaluate the principal Mandate;
5. derive adapter-required Intents;
6. verify every required Intent was delegated;
7. **stop before `evaluateTrusted()` if authority already fails**;
8. run trusted evidence verification;
9. require exact `coveredIntents` accounting;
10. reject unrequested Intent claims;
11. require an evidence commitment when evidence is required;
12. require trusted checks when evidence is required;
13. create the canonical decision;
14. mint a short-lived Permit only when every check is `PASS`.

Checking Mandate scope before evidence acquisition matters: an unauthorized proposal cannot burn paid Telegraph/x402 verification budget first and then discover it was never permitted anyway.

## 6. Evidence commitment rules

`evaluateTrusted()` must not simply return `checks: PASS`.

When external evidence is required it must return:

```ts
{
  evidenceCommitmentHash: "0x...64 hex chars...",
  coveredIntents: ["..."],
  checks: [/* deterministic trusted checks */]
}
```

ProofGate enforces:

- missing required Intent coverage → `HOLD`
- unrequested Intent coverage → `BLOCK`
- required evidence with no commitment → `HOLD`
- required evidence with no trusted checks → `HOLD`
- un-delegated adapter-required Intent → `BLOCK`

The commitment may reference a Telegraph Evidence Bundle or another adapter-specific trusted evidence structure.

### Important authenticity rule

A commitment hash proves integrity of whatever was committed. It does **not** prove the source was authentic.

Your trusted adapter must establish source authenticity before returning its evidence commitment/checks.

For Telegraph-backed adapters this means the trusted host should own the actual Telegraph routing/x402/provenance verification. Do not ask the autonomous model to fabricate or submit its own “proof bundle.”

## 7. Execute through the controlled boundary

```ts
import {
  executeRegisteredAction
} from "../src/sdk/action-adapter.js";

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

Before the adapter callback runs, ProofGate:

1. checks the execution kill switch;
2. fails closed if kill-switch state is unavailable;
3. verifies decision integrity/semantics;
4. re-evaluates the Mandate **at execution time**;
5. verifies Permit signature/bindings/time;
6. atomically consumes `permitId + nonce`;
7. only then calls `adapter.execute()`.

This means a still-live Permit cannot be used after its Mandate has already expired.

## 8. Replay and ambiguous effects

After the Permit is claimed, a thrown external call is treated as:

```text
AMBIGUOUS
```

not:

```text
FAILED → retry automatically
```

Why? A remote API may have completed the side effect before the connection failed.

The Permit remains consumed. The adapter/integration must reconcile the external system before any new authorization is created.

For multiple application workers, use the shared PostgreSQL `PermitConsumptionStore` rather than independent local filesystem stores.

## 9. Execution kill switch

The generic executor requires an `ExecutionKillSwitch`.

```ts
const executionKillSwitch = {
  async isDisabled() {
    return readAuthoritativeOperationalState();
  }
};
```

If it returns `true`, execution is blocked before Permit claim.

If reading it throws, execution also fails closed.

The repository includes `DurableExecutionKillSwitch`, whose state-store failure is intentionally treated as disabled.

## 10. Production signing

- local/test/demo can use the HMAC development signer;
- `NODE_ENV=production` rejects HMAC Permit minting;
- use Ed25519 or a KMS/HSM-compatible signer in production;
- keep signing keys outside the autonomous agent process.

## 11. Adapter security responsibilities

ProofGate protects the authorization boundary, but the adapter is trusted code.

An adapter must:

- derive external side-effect fields from the frozen `GeneralActionEnvelope`;
- never accept replacement target/parameters from the agent during execution;
- obtain evidence inside a trusted boundary;
- commit exactly the evidence its checks rely on;
- map external uncertainty to `HOLD`, not optimistic `PASS`;
- return `BLOCK` for known policy/security failures;
- provide reconciliation logic for irreversible or non-idempotent external effects;
- keep credentials outside agent-controlled prompts/data.

ProofGate v1.2 does **not** sandbox malicious adapter code. Do not register arbitrary third-party adapters without review.

## 12. Telegraph-backed custom adapters

The v1.2 architecture allows a custom adapter to use Telegraph too.

Conceptually:

```text
Adapter requiredIntents(action)
          ↓
Trusted host sends Telegraph Intent request(s)
          ↓
Telegraph routes to Miner(s)
          ↓
Host verifies provider + evidence provenance
          ↓
Host creates evidence commitment
          ↓
Adapter returns exact coveredIntents + checks
          ↓
ProofGate decision / Permit
```

If same-Intent provider diversity matters, use the quorum primitives in:

- `src/telegraph/evidence-quorum.ts`
- `src/telegraph/adaptive-orchestrator.ts`
- `src/telegraph/evidence-bundle.ts`

The current built-in live quorum wiring is implemented concretely for the adaptive payment evidence path.

## 13. Existing adaptive payment integration

For Base Sepolia USDC, the recommended higher-level path remains:

```ts
const result = await authorizePaymentWithEvidence({
  proposal: agentProposal,
  mandate: principalMandate,
  agentId: "treasury-agent",
  acquire: trustedTelegraphIntentAcquirer,
  signer: permitSigner
});
```

The payment adapter provides:

- consequence-derived LOW/MEDIUM/HIGH planning
- multiple Telegraph Intents
- distinct-Miner fraud quorum for MEDIUM/HIGH
- x402 per-request and aggregate evidence budgets
- canonical Evidence Bundle
- payment-specific policy
- payment Permit/execution/receipt path

See README and `ARCHITECTURE.md` for the exact quorum table.

## 14. Evaluate-only HTTP gateway

```bash
npm run gateway:serve
```

The existing gateway is intentionally **non-authoritative**. It does not:

- accept wallet/signing private keys;
- purchase evidence;
- mint executable authority;
- consume Permits;
- execute external effects.

It is a planning/evaluation surface, not the generic production Permit service.

## 15. Integration checklist

Do:

- create Mandates outside agent-controlled reasoning;
- register only reviewed trusted adapters;
- freeze action semantics before evidence acquisition;
- check authority before spending on evidence;
- explicitly account for every required Intent;
- keep evidence acquisition and Permit signing inside the trusted host;
- use shared atomic replay state across workers;
- require a fail-closed kill switch;
- revalidate current authority immediately before execution;
- derive side-effect parameters from the frozen action;
- reconcile `AMBIGUOUS` effects instead of blind retry;
- preserve evidence/decision/Permit audit material.

Do not:

- let the agent create its own Mandate;
- let the agent choose its own authoritative risk tier/quorum thresholds;
- treat Miner `ALLOW` as permission;
- count repeated responses from the same Miner as independent providers;
- allow low-confidence positive votes to satisfy a higher confidence quorum;
- average away explicit negative evidence;
- accept arbitrary agent-supplied evidence JSON as authenticated proof;
- let an undelegated action consume paid evidence budget;
- expose signer/tool credentials to the agent;
- give the agent a bypass around the controlled executor;
- blindly retry an irreversible ambiguous effect.

## Current scope, precisely

ProofGate's **authorization core is now action-general** through trusted adapters.

The only publicly demonstrated real protected external effect remains the v1.0 Base Sepolia USDC payment. v1.2 does not claim that GitHub/cloud/database examples have been live-deployed or production audited.

That distinction is deliberate: the architecture is reusable, while real integrations must still implement and validate their own trusted adapter semantics.
