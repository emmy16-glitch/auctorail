# Auctorail security model

This document explains the security problem Auctorail is trying to solve, the trust boundaries it enforces, what the system assumes, what it does not assume, and how the main controls work together.

Auctorail is a **pre-execution authorization layer for autonomous agents**. Its primary security goal is not to make an AI model “behave.” Its goal is to ensure that a model or agent cannot cause a protected external effect unless a trusted authorization path has explicitly approved the exact action.

## Security objective

The protected resource may be a wallet, privileged API, infrastructure credential, publication authority, account-management capability or another consequential tool.

The desired invariant is:

```text
No protected external effect
unless
principal authority + exact-action policy + required evidence + valid one-use execution authority
all agree on the same action.
```

An agent can propose an action. It cannot grant itself the authority required to execute that action.

## Threat model

Auctorail assumes the agent can be wrong, manipulated, compromised or adversarial.

Examples include:

- prompt injection;
- hallucinated instructions;
- a malicious upstream tool response;
- a compromised agent process;
- an agent attempting to raise its own spending limit;
- an agent changing the recipient after approval;
- replay of a previously valid permit;
- evidence for a different wallet being substituted;
- route/provider confusion;
- stale evidence;
- ambiguous external execution responses;
- retries that could create duplicate side effects.

Auctorail therefore does **not** make the agent process the security authority.

## Trust boundaries

### Untrusted / partially trusted

The following are not treated as sources of execution authority:

- agent-generated text;
- user prompts relayed through the agent;
- arbitrary tool output;
- a Miner verdict by itself;
- browser UI state;
- client-provided limits;
- a previously issued but already-consumed permit;
- request metadata that Auctorail itself sent to an evidence provider.

### Trusted authorization components

Security-sensitive authority is held on the trusted side:

- principal-created Mandate state;
- deterministic policy implementation;
- permit-signing secret/authority;
- permit-consumption state;
- protected execution credential/wallet;
- trusted evidence verification/binding logic;
- execution kill switch and reconciliation logic.

A production deployment should keep these controls isolated from the agent process.

## Security architecture

```text
┌─────────────────────────────┐
│ Human Principal             │
│ defines bounded authority   │
└──────────────┬──────────────┘
               │ Mandate
               ▼
┌─────────────────────────────┐
│ Auctorail Authorization     │
│                             │
│ 1. freeze exact action      │
│ 2. check Mandate            │
│ 3. derive evidence plan     │
│ 4. collect/verify evidence  │
│ 5. evaluate deterministic   │
│    policy                   │
└──────────────┬──────────────┘
               │ ALLOW only
               ▼
┌─────────────────────────────┐
│ Signed one-use permit       │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Protected Executor          │
│ revalidates + consumes      │
│ authority atomically        │
└──────────────┬──────────────┘
               │
               ▼
      External side effect
```

Telegraph evidence enters the authorization layer as evidence, not as authority.

## Action freezing

Before authorization, Auctorail converts the security-relevant action into a canonical representation and computes an action hash.

For payments the frozen semantics include:

- action type;
- chain ID;
- token/asset;
- amount;
- destination;
- reason;
- policy identifier and version.

This prevents a valid decision about one action from silently applying to a semantically different action.

Examples that must create a different action binding:

```text
1 USDC → 2 USDC
Vendor A → Vendor B
Base Sepolia → another chain
USDC → another asset
policy v1 → another policy/version
```

## Mandates

A Mandate represents standing authority created by the principal.

A Mandate can constrain:

- which agent identity may act;
- which action types are permitted;
- target/destination scope;
- parameter/amount limits;
- policy and version;
- required/allowed evidence Intents;
- validity period;
- status/revocation;
- version.

The key security property is:

> Evidence can help satisfy a condition inside a Mandate. Evidence cannot expand the Mandate.

A request outside authority should be rejected before paid evidence acquisition.

## Evidence acquisition

The payment lane can acquire real Telegraph evidence through x402.

Auctorail derives a plan from the exact frozen action. For LOW-risk payments the current plan requires `FRAUD_DETECTION`; higher consequence can require more independent providers and additional Intents.

Every acquisition path is bounded by:

- maximum attempts;
- maximum total evidence spend;
- maximum evidence latency;
- exact payment-network/asset controls for x402;
- evidence binding rules.

The LOW-risk path currently has a 12-second evidence window. The deployed API also bounds individual Telegraph HTTP calls so one slow upstream call cannot occupy the whole authorization lifecycle.

## Evidence is not trusted merely because it arrived successfully

A successful HTTP response is not enough.

Auctorail validates properties such as:

- required Intent;
- serving Miner identity;
- Miner capability;
- exact subject/recipient binding;
- exact chain binding;
- applicability;
- confidence threshold;
- signal commitment/hash;
- freshness;
- quorum semantics;
- negative evidence policy.

Request metadata generated by Auctorail is not used as substitute proof for missing provider assertions.

## Distinct-Miner quorum

When multiple providers are required, independence is counted by Miner ID.

```text
Miner 12 + Miner 12 + Miner 12 = one provider
Miner 12 + Miner 37            = two providers
```

This prevents repeated routing to one source from being misrepresented as independent consensus.

## Positive and negative evidence

A positive result counts only if it satisfies the tier's confidence floor and other binding requirements.

The adaptive payment policy also fails closed on explicit negative evidence. Known negative evidence is not averaged away merely because other providers are positive.

## `ALLOW`, `HOLD`, `BLOCK`

### ALLOW

All authority and required policy/evidence checks passed.

An `ALLOW` still does not automatically mean “the external effect already happened.” Executable authority must be produced and accepted by the protected executor.

### HOLD

Auctorail cannot safely authorize with the evidence currently available.

Typical causes:

- route unavailable;
- evidence deadline expired;
- budget exhausted;
- missing required Intent;
- insufficient confidence;
- insufficient provider diversity;
- evidence not explicitly bound to the subject/chain;
- missing signal commitment;
- stale evidence.

`HOLD` always means **no execution authority**.

### BLOCK

A hard authorization/policy condition failed.

Examples:

- outside the Mandate;
- over the autonomous ceiling;
- action binding mismatch;
- explicit negative evidence;
- revoked/expired authority;
- forged/tampered permit;
- replayed permit.

## Permit security

For executable actions, Auctorail can mint a signed short-lived permit after `ALLOW`.

The permit binds to the authorization context, including the exact action and decision/evidence commitments.

Security properties include:

- short lifetime;
- cryptographic integrity;
- exact-action binding;
- evidence/decision binding;
- single-use consumption;
- replay rejection.

The permit-signing authority should not be exposed to the agent.

## Protected execution

The protected executor is the only supported path to the external effect.

Before execution it re-checks security conditions such as:

- current Mandate validity;
- permit signature;
- permit/action binding;
- expiration;
- consumption/replay state;
- execution kill switch;
- idempotency/durable execution state.

This matters because authorization and execution can be separated in time.

## Replay prevention

Auctorail uses permit-consumption state so a valid one-use permit cannot simply be replayed.

The conceptual transition is:

```text
UNUSED → CONSUMED
```

Execution must make this transition safely relative to the protected side effect.

See [`permit-consumption-store.md`](permit-consumption-store.md).

## Ambiguous external effects

Network failures create a difficult case: the external effect may have happened even if the caller did not receive a definitive response.

Auctorail avoids the unsafe rule:

```text
"request failed" → blindly retry
```

Instead ambiguous outcomes require reconciliation. This reduces the risk of duplicate transfers or repeated side effects.

## x402 spend controls

Evidence acquisition can itself move value.

The x402 path therefore verifies the approved payment lane and enforces bounded spend. Unsupported network/asset/payment lanes are rejected.

Paid evidence is acquired only after authority preflight because there is no value in paying for evidence for an action that cannot become authorized.

## Proof receipts

Receipts provide tamper-evident records that bind important authorization/execution facts.

A receipt helps answer:

- what action was authorized;
- which policy/authority applied;
- what evidence commitment supported the decision;
- what permit was used;
- what execution outcome was recorded.

A valid Auctorail receipt proves integrity/binding under Auctorail's rules. It does not prove that an external intelligence provider's conclusion is objective truth.

## Content Trust security boundary

Content Trust reuses the generic authorization pattern for content decisions.

The important security idea is the same: evidence is bound to the exact content subject and deterministic policy decides how that evidence may influence the action.

A signal such as “AI-generated” is not automatically equivalent to “malicious.” Policy semantics remain explicit.

## What Auctorail does not claim to solve

Auctorail does not claim to:

- prove that every Miner verdict is objectively correct;
- eliminate all model hallucination;
- make a compromised trusted host safe;
- secure leaked protected private keys outside the executor boundary;
- guarantee that every external service is available;
- eliminate blockchain/network reorg or upstream-provider risk;
- provide independent formal verification or external audit certification;
- guarantee universally safe autonomous AI.

The design instead minimizes the amount of trust placed in the agent and creates explicit, testable authorization boundaries.

## Validation

Current `main` validation includes:

```text
53 test files
268 / 268 tests passed
7400 / 7400 deterministic adversarial fuzz cases contained
0 unauthorized executions / authorizations in those fuzz suites
0 uncaught fuzz errors
0 production dependency vulnerabilities reported by npm audit
```

Browser QA also covers the main landing/demo/live/SDK/Security Lab flows.

Security tests cover families such as:

- amount mutation;
- destination substitution;
- chain/asset confusion;
- stale action hashes;
- forged permit signatures;
- evidence subject/chain substitution;
- missing signal commitments;
- quorum downgrades;
- duplicate-Miner counting;
- negative-evidence handling;
- x402 lane mutation;
- permit replay;
- kill-switch failure;
- ambiguous-effect handling.

Tests provide evidence about implemented invariants. They are not a proof that no undiscovered vulnerability exists.

## Deployment guidance

For a real deployment:

1. Keep the protected credential outside the agent process.
2. Keep principal Mandates on the trusted side.
3. Use a secret-management system for signing/execution/evidence-payment keys.
4. Run the authorization API and executor with least privilege.
5. Use durable permit-consumption and execution state.
6. Keep evidence budgets low and explicit.
7. Set network timeouts and circuit-breaking behavior for external providers.
8. Treat `HOLD` as a hard no-execution state.
9. Monitor failed and ambiguous executions.
10. Preserve receipts/audit logs without leaking secrets.
11. Rotate burner/test wallets independently from production wallets.
12. Re-run security/fuzz/browser suites before releases.

## Security review checklist

A reviewer should ask:

- Can the agent choose or modify its own authoritative limit?
- Can a client bypass Mandate evaluation?
- Can evidence for another target/chain satisfy the current action?
- Can duplicate Miner responses count as independent quorum?
- Can missing evidence become implicit `ALLOW`?
- Can negative evidence be averaged away incorrectly?
- Can a permit be reused?
- Can the executor skip revalidation?
- Can an ambiguous side effect be blindly retried?
- Can evidence spending exceed a bounded budget?
- Can the agent access signing or execution secrets directly?

Any “yes” to those questions should be treated as a serious design defect.

## Final security principle

**Assume the agent can be wrong. Keep authority outside the agent, bind authorization to one exact action, require consequence-appropriate evidence, fail closed when proof is insufficient, and make the protected executor accept only explicit one-use authority.**
