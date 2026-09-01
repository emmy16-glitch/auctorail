# ProofGate Locked Decisions

This document prevents implementation drift during the Telegraph Hackathon.

If a new feature conflicts with this document or ARCHITECTURE.md, do not add it
unless a real Telegraph/protocol constraint requires the architecture to change.

## Product Thesis

Agent confidence is not permission to act.

ProofGate is a zero-trust execution gateway for autonomous AI agents.

A principal defines bounded authority. An agent may propose an action. Telegraph
provides verified intelligence. Deterministic ProofGate policy decides whether
that intelligence and the standing authority are sufficient. Only a short-lived,
single-use ProofGate permit may authorize the exact execution.

Technical definition:

ProofGate is a zero-trust authorization runtime that converts verified machine
intelligence into cryptographically bound permission for one exact autonomous
action.

## Public Flow

PROPOSE → PROVE → PERMIT → EXECUTE → RECEIPT

The public experience stays simple even when the internals are advanced.

## Authority Model

The agent cannot authorize itself.

Telegraph intelligence cannot authorize an action by itself.

A local probabilistic model cannot authorize an action by itself.

The protected executor cannot execute without a valid ProofGate permit.

Humans define standing authority boundaries in advance. Agents operate
autonomously inside those boundaries. ProofGate enforces the boundaries every
time.

There is no per-transaction human approval button in the normal successful flow.

## Mandate Binding

ProofGate must bind every protected action to a standing Mandate Contract.

The Mandate Contract expresses authority delegated by a principal to an agent.
It is canonicalized and hashed as mandateHash.

Hackathon v1 mandate fields include:

- mandateId
- principalId
- agentId
- allowedActionTypes
- allowedChainIds
- allowedAssets
- allowedDestinations
- maxPerActionRaw
- maxCumulativeRaw when used
- requiredIntents
- issuedAt
- expiresAt
- version

Structured authority is enforced deterministically. Do not use an LLM or NLI
model to decide whether a chain, token, amount, recipient, or action type is
authorized when the Mandate Contract can decide it exactly.

If an agent is manipulated before it creates an Action Contract, the Mandate
Contract is the first authority boundary.

Example:

Mandate allows Vendor A only
→ agent proposes Vendor B
→ BLOCK mandate_destination_violation

The Action Contract remains immutable, but an immutable action that is outside
the mandate is still unauthorized.

## Decision Binding

decisionHash must commit to:

- mandateHash
- actionHash
- Telegraph evidence references
- Telegraph signalHash
- rawResponseHash
- policy checks
- policy version / policy ID
- final decision

This binds authorization to the delegated authority, exact action, evidence, and
policy decision that justified it.

## Permit Binding

Only ALLOW may mint a permit.

Permit includes:

- permitId
- mandateHash
- actionHash
- decisionHash
- nonce
- policyId
- issuedAt
- expiresAt
- signature

Hackathon v1 authentication is HMAC-SHA256 with a server-side secret.

Permit properties:

- exact-action bound
- exact-mandate bound
- short-lived
- single-use
- replay protected
- tamper evident
- server authenticated

## Autonomy Model

Normal successful flow:

Principal standing mandate
→ agent proposes action
→ ProofGate freezes Action Contract
→ ProofGate verifies mandate scope
→ ProofGate obtains real Telegraph evidence
→ deterministic policy evaluates mandate + action + evidence
→ ALLOW automatically mints permit
→ executor verifies permit
→ action executes automatically
→ Proof Receipt is generated automatically

No human Approve button is required in the normal happy path.

## Decision Semantics

ALLOW:
All required mandate, evidence, and policy checks pass.
Permit may be created automatically.

HOLD:
Evidence or supporting infrastructure is missing, stale, ambiguous, inapplicable,
unavailable, or below the required threshold.
No permit. No execution. ProofGate refuses to guess.

BLOCK:
A known mandate, policy, or security invariant failed.
No permit. No execution.

## Telegraph Boundary

Telegraph provides intelligence.

A Miner result is EVIDENCE, not authorization.

Even if a Miner returns ALLOW, SAFE, VALID, or high confidence, ProofGate must
still run its own deterministic policy.

ProofGate does not create fake Miner consensus.
ProofGate does not invent aggregate safety percentages.

## Telegraph Routing

ProofGate prefers Telegraph AUTO_ROUTE for ordinary proof acquisition. The
required capability/Intent is expressed to Telegraph and the actual serving
Miner is recorded in the Proof Receipt.

For the flagship payment flow the required Intent is currently:

FRAUD_DETECTION

However, ProofGate is an authorization system, so the evidence provider must be
capable of satisfying the locked evidence contract. A real protocol constraint
was observed on 2026-09-01: repeated paid AUTO_ROUTE calls selected the same
ChainSight Miner even after exact address, wallet, chainId, and Base Sepolia
context were supplied. ChainSight returned explicit subject/chain-bound negative
risk intelligence, but its registered response semantics did not supply the
numeric confidence/applicability shape required by payments.strict.v1.

Therefore v1 permits a second final route mode:

CAPABILITY_ROUTE

CAPABILITY_ROUTE is not arbitrary manual Miner selection. ProofGate applies a
deterministic local provider-selection policy to the live Telegraph registry,
then calls Telegraph's official direct Engine Miner endpoint. For the deployed
vendor contract, the locked v1 selection policy is:

proofgate.contract-control.v1

It selects the active Refut On-Chain Risk Miner because that capability accepts
the exact EVM address plus numeric chainId and returns contract-control risk
evidence suitable for the vendor-contract action. The direct request still goes
through Telegraph, still uses x402, still records the real serving Miner, still
requires real signalHash, and still passes through the exact same deterministic
ProofGate policy.

The security rule is:

Proof requirements may constrain provider selection.
Provider selection may never relax proof requirements.

Manually forced direct Miner calls remain diagnostics only and cannot authorize
live execution.

No fake or simulated Miner data may be used in the final demo.

## Current Real Evidence Lesson

The first successful x402 call returned:

Miner: Refut On-Chain Risk
Intent: FRAUD_DETECTION
Verdict: ALLOW
Confidence: 0.5
Subject type: externally-owned account
Contract-control checks: not applicable

ProofGate correctly returned HOLD because the evidence did not satisfy
payments.strict.v1.

This is a core demonstration of the architecture:

Telegraph says what it knows. ProofGate decides whether what it knows is enough
to permit the action.

## Flagship

Autonomous Treasury / Procurement Guard.

An agent proposes an exact Base Sepolia USDC payment to the deployed vendor
contract.

Treasury is the flagship demonstration, not the product boundary. ProofGate is a
generic execution authorization layer for autonomous agents.

## Standing Policy

Policy ID:

payments.strict.v1

Initial locked boundaries include:

allowedChain = 84532
allowedAsset = Base Sepolia USDC
maxAutonomousAmount = 10 USDC
minimumEvidenceConfidence = 0.80
permitTTLSeconds = 30
requireTelegraphEvidence = true
requireSignalHash = true
requireFreshEvidence = true
failClosed = true

A future Policy Console may change standing autonomy rules.
It does NOT approve individual transactions.

## Action Immutability

After an Action Contract is created, protected fields cannot be silently edited.

Protected fields include:

- type
- chainId
- asset/token
- amountRaw
- destination
- policyId
- policy-relevant purpose/reason
- execution constraints

Changing any protected field means a NEW action:

old action discarded
→ new Action Contract
→ new mandate check
→ new verification
→ new decision
→ new permit

There is no edit-approved-transaction path.

## Probabilistic Intelligence Asymmetry

Probabilistic intelligence may reduce authority. It can never create authority.

Therefore:

local security model says SAFE
→ does not create ALLOW

local security model says suspicious
→ may cause HOLD

Telegraph evidence may satisfy evidence requirements, but only deterministic
ProofGate policy can produce ALLOW.

## Local AI / Cost Policy

ProofGate has zero paid-cloud-AI dependencies.

Do not make the core system depend on OpenAI API calls, Anthropic API calls,
Hugging Face hosted inference, dedicated GPU endpoints, or another paid model
service.

If local ML sensors are added, prefer local ONNX / Transformers.js execution and
allow offline operation after model files are downloaded.

The Telegraph x402 flow is the protocol-required exception for the hackathon and
remains isolated behind the Telegraph adapter. Protected treasury execution stays
on supported test networks for the hackathon.

## Local ML Sensors

Local ML sensors are optional and secondary until the real authorization path is
complete.

If added:

- prompt-injection/context sensors may only PASS-through or HOLD
- NLI/semantic drift sensors may only PASS-through or HOLD
- model output never mints a permit
- deterministic mandate checks always take precedence where exact structured
  authority exists
- model ID and revision must be recorded when a model affects a HOLD decision

Do not install large general-purpose LLM dependencies merely to make ProofGate
look more AI-heavy.

## Executor

The executor is the enforcement boundary.

Before any action executes it verifies:

- permit signature
- mandateHash
- actionHash
- decisionHash/policy binding
- expiry
- nonce consumption
- policy ID

Then it atomically consumes the permit before invoking the irreversible action.

The agent cannot bypass this executor.

If an irreversible write becomes ambiguous after broadcast, the permit remains
consumed. ProofGate reconciles chain state before any replacement. It never
blindly replays an irreversible action.

Infrastructure may change automatically. The authorized action may not.

Safe automatic changes include:

- RPC provider
- timeout/backoff
- fee parameters
- read routing
- confirmation provider

Unsafe automatic changes include:

- destination
- amount
- token
- chain
- action type
- policy ID
- mandate scope

Any semantic action mutation requires a new Action Contract and new authorization
cycle.

## Proof Receipt

A receipt links:

- Mandate Contract / mandateHash
- Action Contract / actionHash
- Telegraph Intent
- actual serving Miner
- Telegraph signalHash
- evidence/rawResponseHash
- policy checks
- decisionHash
- permit status
- execution result
- transaction hash
- reconciliation state
- timestamps
- receiptHash

Optional post-execution Telegraph lookup is receipt enrichment only. It does not
replace pre-execution authorization.

## MCP Product Surface

ProofGate should later expose a small MCP authorization gateway after the real
end-to-end path is proven.

Preferred external tools are high-level operations such as:

- proofgate_request_payment
- proofgate_get_receipt
- proofgate_get_policy

Do not expose wallet private keys, HMAC secrets, or a raw unrestricted executor
to the agent.

The developer experience should remain simple while the full authorization cycle
runs internally.

## Adversarial Evaluation / Attack Lab

The primary Attack Lab is deterministic and reproducible, not dependent on paid
LLM red-team calls.

Required attack classes include:

- amount mutation
- recipient mutation
- chain mutation
- token mutation
- policy mutation
- mandate mutation
- stale evidence
- wrong-subject evidence
- signalHash corruption
- raw evidence mutation
- permit replay
- concurrent replay
- permit expiry
- signature corruption
- decisionHash corruption
- RPC timeout
- ambiguous broadcast
- process crash after broadcast
- receipt tampering

Report only measurements actually generated by the harness. Never invent attack
counts or unauthorized-execution statistics.

Expected security invariant:

unauthorized executions = 0

## Required Demo Attacks

Amount mutation:
authorized 1/5 USDC → attempt 10/15 USDC
Expected: BLOCK action_hash_mismatch

Recipient mutation:
authorized Vendor Alpha → attempt another destination
Expected: BLOCK action_hash_mismatch or mandate_destination_violation before
permit creation

Replay:
reuse consumed permit
Expected: BLOCK permit_already_consumed

Expiry:
execute after TTL
Expected: BLOCK permit_expired

Insufficient real Telegraph evidence:
Expected: HOLD

Mandate escape:
propose an otherwise valid payment outside delegated authority
Expected: BLOCK mandate_*_violation

No Telegraph evidence may be faked for the final demo.

## Build Order

Do not reorder this list without a real protocol blocker:

1. Keep and harden the current core; do not rewrite it.
2. Resolve the current live Telegraph/x402 proof path and obtain applicable real
   evidence for the deployed vendor.
3. Move the flagship Telegraph path from direct Miner selection to routed Engine
   inference, while keeping direct Miner diagnostics.
4. Add Mandate Contract + mandateHash.
5. Bind mandateHash into deterministic policy, decisionHash, permit, executor,
   and Proof Receipt.
6. Complete the genuine 1-USDC testnet end-to-end flow.
7. Expand deterministic Attack Lab / fuzzing.
8. Add MCP gateway.
9. Add optional local ML HOLD-only sensors if time remains.
10. Build the minimal UI around Control, Live, Receipts, and Attack Lab.

## What We Will NOT Build Before The Core Works

- multiple flagship use cases
- fake Miner disagreement
- fake safety percentage
- per-transaction human approval in the happy path
- huge analytics dashboard
- dozens of integrations
- frontend-first architecture
- secrets in browser code
- direct agent access to protected execution
- paid-cloud-AI dependency
- local ML that can create ALLOW
- semantic ML checks for structured constraints that deterministic code can
  verify exactly

## Definition of Advanced

Advanced does NOT mean more screens.

Advanced means:

- principal-bound mandate
- canonical mandate hashing
- canonical action hashing
- real Telegraph routed evidence
- deterministic policy
- evidence applicability
- fail-closed behavior
- mandate/evidence/action-bound permits
- nonce and expiry
- atomic single use
- controlled execution
- tamper resistance
- replay resistance
- ambiguous-write reconciliation
- Proof Receipts
- adversarial evaluation
- real testnet execution

Everything else is secondary.
