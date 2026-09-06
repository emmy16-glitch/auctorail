# Auctorail glossary

This glossary defines the terms used throughout the Auctorail repository and documentation. It is intentionally precise because many security mistakes come from treating words like “request,” “permission,” “evidence,” and “approval” as interchangeable when they are not.

## Auctorail

The current product and repository name.

Auctorail is a pre-execution authorization layer for autonomous agents. It evaluates whether an exact proposed action is inside delegated authority and satisfies the evidence/policy requirements needed before a protected executor may act.

## ProofGate

The historical project name.

Some stable identifiers intentionally retain `ProofGate` or `proofgate.*` because they are embedded in historical artifacts, schema names, hashes, compatibility exports, or the deployed `ProofGateVendor` contract.

ProofGate is not a second current product.

## Agent

The autonomous or semi-autonomous software component proposing an action.

The agent is not trusted to grant itself authority.

## Principal

The human, organization, or trusted authority that delegates what an agent may do.

The principal owns the policy boundary, not the agent.

## Action

A canonical description of one exact proposed operation.

For a payment, this includes fields such as amount, recipient, chain, token, reason and policy.

## Action hash

A cryptographic commitment to the canonical action payload.

Changing a security-relevant field changes the action semantics and therefore the action binding.

## Mandate

Principal-controlled standing authority describing the scope in which an agent may act.

A Mandate can constrain agent identity, action types, targets, parameter limits, evidence Intents, policy/version, lifetime and status.

## Authority

Permission to perform an action under the principal's rules.

Authority is not the same thing as confidence, intelligence or a favorable Miner result.

## Evidence

External or internal information evaluated by policy when deciding whether an otherwise-delegated action can be authorized.

Evidence informs authorization. It does not create authority.

## Telegraph

The external intelligence/evidence network used by Auctorail's live payment path.

Auctorail can route requests to Telegraph Miners and pay for evidence through x402.

## Miner

A Telegraph intelligence provider/service capable of answering supported Intents.

Miner responses are evidence inputs, not execution permission.

## Intent

The semantic capability requested from Telegraph.

Current adaptive payment Intents include:

- `FRAUD_DETECTION`
- `ONCHAIN_TX_LOOKUP`
- `WALLET_BALANCE_CHECK`

## Serving Miner

The Miner that actually answered a routed request.

Auctorail verifies serving-Miner identity/capability rather than assuming the requested route guarantees the returned provider.

## Applicability

Whether evidence explicitly applies to the exact subject/action being evaluated.

A result about a different wallet or action must not silently satisfy the current request.

## Subject

The object evidence is about.

For the current payment fraud check, the subject is the exact payment recipient/destination.

## Signal hash / signal commitment

A cryptographic commitment associated with returned Telegraph evidence.

The LOW-risk adaptive payment path requires a usable signal commitment.

## Confidence

A numeric confidence value associated with an evidence result where supported.

Confidence can qualify a result for quorum but never grants authority by itself.

## Quorum

The rule describing how many evidence results/providers are required before a requirement can be considered satisfied.

Quorum may specify distinct providers, positive results, confidence floors, attempt limits and negative-veto thresholds.

## Distinct Miner

A unique Telegraph Miner identity, counted by Miner ID.

Multiple responses from one Miner do not become multiple independent providers.

## Evidence plan

The consequence-derived set of evidence requirements for an exact action.

The adaptive payment policy currently uses LOW, MEDIUM and HIGH evidence tiers.

## Risk tier

A consequence classification used to determine how much evidence is required.

It is not a spending authorization level.

## LOW

Current payment evidence tier for proposed amounts `<= 5 USDC`.

Requires one applicable confidence-qualified `FRAUD_DETECTION` result under bounded acquisition rules.

## MEDIUM

Current payment evidence tier for proposed amounts `> 5` through `50 USDC`.

Requires stronger fraud-provider diversity plus `ONCHAIN_TX_LOOKUP` context.

## HIGH

Current payment evidence tier for proposed amounts above `50 USDC`.

Describes the strongest current evidence plan, but the current autonomous payment policy still blocks execution above its separate 10-USDC ceiling.

## Evidence budget

The maximum amount Auctorail may spend acquiring evidence for an authorization attempt.

Evidence acquisition through x402 is itself a side effect and must be bounded.

## Evidence deadline

The maximum overall time available for evidence acquisition.

The current LOW-risk payment deadline is 12 seconds.

## x402

The payment/authentication mechanism used when Telegraph evidence acquisition requires payment.

Auctorail validates the approved payment lane and bounds evidence spend.

## Preflight

A trusted check performed before paid evidence acquisition.

The important rule is that obviously undelegated/unexecutable actions should be rejected before Auctorail pays for evidence that cannot make them authorized.

## Decision

The deterministic policy result for a frozen action and its authority/evidence context.

Auctorail uses `ALLOW`, `HOLD`, and `BLOCK`.

## ALLOW

The required authority and policy/evidence checks passed.

For a protected external effect, execution still requires valid executable authority.

## HOLD

The action is not authorized to execute because required evidence is currently insufficient, unavailable, stale, inconclusive or otherwise unusable.

`HOLD` is fail-closed.

## BLOCK

A hard authorization or policy rule failed.

Examples include an action outside authority, an explicit negative result, a binding mismatch, expired/revoked authority or a replayed permit.

## Permit

Signed short-lived execution authority created only for an executable `ALLOW` decision.

A permit is bound to the authorization context and designed for one-use consumption.

## One-use authority

Authority that becomes invalid after successful consumption.

This limits replay and prevents a permit from becoming a reusable credential.

## Permit consumption

The durable state transition marking a permit as used.

This state must be coordinated safely with the protected external effect.

## Replay

An attempt to reuse previously consumed execution authority.

Auctorail rejects permit replay.

## Protected executor

The trusted component that holds or can access the credential needed to cause the external side effect.

The agent should not hold the protected credential directly.

## Kill switch

A fail-closed execution control that can prevent protected execution even when other checks passed.

## Idempotency key

A stable identifier used to distinguish retries of the same intended operation from new operations.

It helps prevent accidental duplicate work, but does not replace execution reconciliation.

## Ambiguous effect

A situation where the caller cannot tell whether an external side effect occurred.

Auctorail treats this as a reconciliation case rather than blindly repeating the action.

## Reconciliation

The process of establishing whether an ambiguous paid or external effect actually occurred before deciding what to do next.

## Proof Receipt

A tamper-evident record binding important authorization/execution facts.

It helps prove integrity under Auctorail's verification rules but does not prove that every external evidence claim is objectively true.

## Content Trust

A separate Auctorail product lane demonstrating that the generic Action/Mandate/Decision model can protect content-related decisions as well as payments.

## Deterministic demo

A zero-live-side-effect scenario used to demonstrate policy behavior reproducibly.

Deterministic demo activity is not counted as real Telegraph usage.

## Live mode

A path that can perform real external interactions, including Telegraph/x402 evidence acquisition and protected Base Sepolia execution when configured.

## Security Lab

A deterministic UI/workbench for demonstrating mutation, replay, missing-evidence and related adversarial cases.

It does not count as real Telegraph usage.

## Base Sepolia

The EVM test network used by the canonical public payment execution.

Chain ID: `84532`.

## USDC

The token used by the current payment adapter on Base Sepolia.

## Autonomous execution ceiling

The hard maximum amount the current adaptive payment policy permits for autonomous execution regardless of stronger evidence.

Current value: `10 USDC` per action.

## Legacy protocol identifier

A stable old `proofgate.*` or `ProofGateVendor` name retained for compatibility/provenance.

Do not rename such identifiers merely for branding consistency without evaluating hash, artifact, protocol and deployment consequences.

## Final distinction

```text
proposal  = what the agent wants
Mandate   = what the principal allows
evidence  = what trusted inputs say about the exact action
decision  = what policy concludes
permit    = one-use execution authority
executor  = the trusted component that causes the effect
receipt   = the record binding what happened
```
