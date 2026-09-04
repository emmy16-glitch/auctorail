# ProofGate — Telegraph Track 3 Architecture

ProofGate is a **consumption-side application** on Telegraph. It is not a Miner and it does not try to rank providers itself.

Its job is to turn a bounded principal mandate plus real Telegraph intelligence into an enforceable machine authorization decision, then allow the protected action to execute only when that decision is valid.

## Product thesis

> Agent confidence is not permission to act.

An agent may decide what it wants to do. ProofGate decides whether that exact action is authorized to happen.

Telegraph supplies ranked external intelligence. ProofGate consumes that intelligence, applies deterministic authorization policy, issues an exact-action Permit only for an `ALLOW`, executes through a protected adapter, and writes a verifiable receipt.

## End-to-end Track 3 flow

```text
PRINCIPAL / USER
  defines bounded authority
        |
        v
SCREEN 1 — REQUEST + AUTHORITY
  agent + amount + recipient + duration
        |
        | freeze exact request
        v
POLICY PREFLIGHT
  deterministic local authority check
  no paid Miner request yet
        |
        | inside authority
        v
SCREEN 2 — LIVE VERIFICATION
  ProofGate declares required Telegraph Intents
        |
        v
TELEGRAPH /v1/ask
  Telegraph routes to ranked Miners
  x402 pays real intelligence requests
        |
        v
TRUSTED EVIDENCE BUNDLE
  actual serving Miner identity
  Intent / confidence / signal hashes
  x402 payment provenance
  distinct-provider quorum
        |
        v
DETERMINISTIC POLICY
  ALLOW / HOLD / BLOCK
        |
        | ALLOW only
        v
SIGNED ONE-USE PERMIT
  exact action + mandate + evidence + decision
        |
        v
SCREEN 3 — AUTOMATIC EXECUTION
  protected executor re-verifies Permit
  Permit atomically consumed against replay
  exactly one Base Sepolia USDC broadcast attempt
        |
        v
CONFIRMATION / AMBIGUITY HANDLING
  confirmed => EXECUTED
  uncertain => AMBIGUOUS, never blind rebroadcast
        |
        v
VERIFIABLE PROOFGATE RECEIPT
  decision lineage + evidence + Permit + execution
```

## Screen contract

### Screen 1 — Control what an agent can do

Human-facing configuration only.

It shows:

- agent identity;
- maximum allowed payment;
- allowed recipient;
- permission lifetime;
- the exact current proposal;
- `CHECK THIS REQUEST`.

It intentionally does **not** lead with hashes, canonical JSON, Miner IDs or x402 internals.

Backend state transition:

`proposal -> frozen action -> mandate evaluation`

If the action is outside authority, ProofGate blocks locally and does not buy Telegraph intelligence.

### Screen 2 — Checking request

This screen visualizes real backend stages, not cosmetic timers.

1. `REQUEST RECEIVED`
2. `RULES CHECKED`
3. `REAL CHECKS RUNNING`
4. `DECISION`

The paid stage begins only after the deterministic mandate check passes.

ProofGate requests **Intents**, not preferred Miner identities. Telegraph performs provider routing. ProofGate records the Miner actually served and only counts distinct providers toward quorum.

If the final decision is `HOLD` or `BLOCK`, execution stops.

If the final decision is `ALLOW`, ProofGate automatically mints the one-use Permit and moves to Screen 3. There is no second human approval button in the primary autonomous flow.

### Screen 3 — Executing request

Screen 3 is the protected downstream action, not another authorization prompt.

1. `AUTHORIZATION PASSED`
2. `PERMIT ISSUED`
3. `EXECUTING ON BASE SEPOLIA`
4. `CONFIRMATION PENDING / CONFIRMED`

The browser does not construct the transaction. It receives an opaque short-lived execution session created by the trusted authorization server after `ALLOW` and calls the protected execution endpoint.

The server then:

- re-verifies the signed Permit;
- re-validates action/evidence/decision bindings;
- atomically consumes the Permit before execution;
- derives recipient/amount/token/chain from the frozen action;
- permits one irreversible transaction broadcast attempt;
- reconciles confirmation using read-only RPC failover;
- refuses blind automatic rebroadcast after an ambiguous result;
- generates and verifies the ProofGate receipt.

`VIEW PROOF` is an audit action after the autonomous path. It is not required to continue execution.

## Telegraph role

Telegraph is the external ranked-intelligence market.

ProofGate does not register as a Miner and does not bypass Telegraph routing in the primary Track 3 path.

```text
ProofGate: require FRAUD_DETECTION for this exact subject
                 |
                 v
          Telegraph /v1/ask
                 |
                 v
        ranked Miner is served
                 |
                 v
 ProofGate validates and records the result
```

For higher consequence, ProofGate may make additional bounded Intent requests. Duplicate responses from the same Miner do not create fake independence.

## The two payment lanes

ProofGate has two intentionally separate financial side effects.

### 1. Intelligence acquisition

Small x402 payments to Telegraph Miners while Screen 2 is collecting evidence.

These are bounded by ProofGate's evidence-spend policy and are **not** the vendor payment.

### 2. Protected action execution

The actual requested payment, for example:

`1.00 USDC -> ProofGate Vendor`

This is attempted only after a valid `ALLOW` and signed one-use Permit.

The UI must never describe x402 evidence spend as the vendor payment, or a policy `ALLOW` as an already-executed transaction.

## Key separation

Production deployments should keep separate credentials for separate authorities:

- `TELEGRAPH_EVM_PRIVATE_KEY` — purchases Telegraph intelligence over x402;
- `PROOFGATE_EXECUTOR_PRIVATE_KEY` — executes protected Base Sepolia actions;
- `PROOFGATE_PERMIT_ED25519_PRIVATE_KEY` — signs ProofGate execution Permits.

A production permit signer must be asymmetric. Local HMAC signing remains development/test-only.

## Failure semantics

ProofGate fails closed.

| Failure | Result |
| --- | --- |
| proposal exceeds mandate | `BLOCK`, no Miner spend |
| frozen request changed | reject before paid live verification |
| Telegraph/x402 unavailable | no Permit, no vendor execution |
| quorum incomplete | `HOLD`, no execution |
| explicit unsafe evidence | `BLOCK`, no execution |
| Permit invalid/expired/replayed | executor `BLOCKED` |
| transaction preparation fails before broadcast | `FAILED`, no automatic retry |
| possible broadcast but confirmation uncertain | `AMBIGUOUS`, no automatic rebroadcast |
| confirmed transaction | `EXECUTED` + receipt |

## Provenance without changing the product identity

ProofGate receipts make the decision reconstructible from its authority, evidence and execution context.

That provenance is important, but ProofGate is not merely an audit layer. Its defining property is that the receipt comes **after an enforced authorization boundary**:

`evidence -> decision -> Permit -> protected execution`

A receipt cannot create authority retroactively.

## Real-adoption posture

Track 3 usage should be real consumption, not request spam.

The production demonstration should therefore use legitimate end-to-end actions:

`real proposal -> real Telegraph request -> real decision -> real downstream action or real block -> real receipt`

Autonomous/continuous workflows may generate genuine machine traffic when they correspond to real decisions. Artificial loops whose only purpose is to inflate request counts should not be part of ProofGate.

The public Web UI is the human-observable surface for the same real pipeline. It must not silently substitute synthetic evidence, fake Miner results or fake transaction confirmations.

## Submission story

ProofGate demonstrates the consumption side of the Telegraph flywheel:

1. an autonomous application needs external intelligence before acting;
2. it buys ranked intelligence through Telegraph;
3. it converts that intelligence into a consequential machine decision;
4. the decision changes what the agent is allowed to do;
5. an `ALLOW` can trigger a real downstream transaction automatically;
6. the full action remains inspectable afterward through a verifiable receipt.

That is the architecture the UI, API, executor and submission narrative must all describe.