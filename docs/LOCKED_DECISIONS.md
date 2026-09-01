# ProofGate Locked Decisions

This document prevents implementation drift during the Telegraph Hackathon.

If a new feature conflicts with this document or ARCHITECTURE.md, do not add it
unless a real Telegraph/protocol constraint requires the architecture to change.

## Product Thesis

Agent confidence is not permission to act.

ProofGate is a pre-execution control plane that turns sufficient verified
Telegraph intelligence into permission for one exact autonomous action.

## Public Flow

PROPOSE → PROVE → PERMIT → EXECUTE → RECEIPT

The public experience stays simple even when the internals are advanced.

## Autonomy Model

ProofGate is NOT a per-transaction human approval workflow.

Normal successful flow:

Agent proposes action
→ ProofGate gets real Telegraph evidence
→ deterministic policy evaluates it
→ ALLOW automatically mints permit
→ executor verifies permit
→ action executes automatically
→ Proof Receipt is generated automatically

No human Approve button is required in the normal happy path.

Humans define policy boundaries in advance.
Agents operate autonomously inside those boundaries.
ProofGate enforces the boundaries every time.

## Decision Semantics

ALLOW:
All required evidence and policy checks pass.
Permit may be created automatically.

HOLD:
Evidence is missing, stale, ambiguous, inapplicable, unavailable, or below
the required threshold.
No permit. No execution. ProofGate refuses to guess.

BLOCK:
A known policy/security invariant failed.
No permit. No execution.

## Telegraph Boundary

Telegraph provides intelligence.

A Miner result is EVIDENCE, not authorization.

Even if a Miner returns:
- ALLOW
- SAFE
- VALID
- high confidence

ProofGate must still run its own deterministic policy.

ProofGate does not create fake Miner consensus.
ProofGate does not invent aggregate safety percentages.

## Current Real Evidence Lesson

The first successful x402 call returned:

Miner: Refut On-Chain Risk
Intent: FRAUD_DETECTION
Verdict: ALLOW
Confidence: 0.5
Subject type: externally-owned account
Contract-control checks: not applicable

ProofGate is allowed to return HOLD even though the Miner returned ALLOW,
because the evidence may not satisfy payments.strict.v1.

This is a core demonstration of the architecture.

## Flagship

Autonomous Treasury / Procurement Guard.

An agent proposes an exact Base Sepolia USDC payment.

ProofGate verifies the exact action using real Telegraph intelligence,
evaluates payments.strict.v1, and only ALLOW creates an exact-action permit.

## Standing Policy

Policy ID:

payments.strict.v1

Initial configurable boundaries include:

allowedChain = 84532
allowedAsset = Base Sepolia USDC
maxAutonomousAmount = configurable
minimumEvidenceConfidence = configurable
permitTTLSeconds = 30
requireTelegraphEvidence = true
requireFreshEvidence = true
failClosed = true

These settings may later have a Policy Console.

The Policy Console changes standing autonomy rules.
It does NOT approve individual transactions.

## Action Immutability

After an Action Contract is authorized, protected fields cannot be edited.

Protected fields include:

type
chainId
asset/token
amountRaw
destination
policyId
policy-relevant purpose/reason
execution constraints

Changing any protected field means a NEW action.

Correct flow:

old action discarded
→ new Action Contract
→ new verification
→ new decision
→ new permit

There is no "edit approved transaction" path.

## Permit

Only ALLOW may mint a permit.

Permit includes:

permitId
actionHash
decisionHash
nonce
policyId
issuedAt
expiresAt
signature

Hackathon v1 signature:

HMAC-SHA256

Permit properties:

exact-action bound
short-lived
single-use
replay protected
tamper evident
server authenticated

## Decision Binding

decisionHash should commit to:

actionHash
Telegraph evidence references
Telegraph signalHash
policy checks
policy version
final decision

This binds authorization not only to the action,
but also to the evidence and policy decision that justified it.

## Executor

The executor is the enforcement boundary.

Before any action executes it verifies:

permit signature
actionHash
decisionHash/policy binding
expiry
nonce consumption
policy ID

Then it atomically consumes the permit.

The agent cannot bypass this executor.

## Required Attack Demonstrations

Amount mutation:
authorized 5 USDC
attempt 15 USDC

Expected:
BLOCK action_hash_mismatch

Recipient mutation:
authorized Vendor ABC
attempt Attacker XYZ

Expected:
BLOCK action_hash_mismatch

Replay:
reuse consumed permit

Expected:
BLOCK permit_already_consumed

Expiry:
execute after TTL

Expected:
BLOCK permit_expired

Insufficient real Telegraph evidence:

Expected:
HOLD insufficient_proof

No Telegraph evidence may be faked for the final demo.

## Proof Receipt

A receipt links:

Action Contract
actionHash
Telegraph signalHash
evidence
policy checks
decisionHash
permit
execution result
transaction hash
post-execution verification when available
timestamps
receiptHash

## What We Will NOT Build Before The Core Works

No multiple flagship use cases.
No fake Miner disagreement.
No fake safety percentage.
No human approval flow in the main path.
No huge analytics dashboard.
No dozens of integrations.
No frontend-first development.
No secrets in browser code.
No direct agent access to protected execution.

## Definition of Advanced

Advanced does NOT mean more screens.

Advanced means:

real Telegraph evidence
canonical action hashing
deterministic policy
evidence applicability
fail-closed behavior
evidence-bound permits
nonce and expiry
atomic single use
controlled execution
tamper resistance
replay resistance
Proof Receipts
real testnet execution

Everything else is secondary.
