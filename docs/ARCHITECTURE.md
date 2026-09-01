# ProofGate Architecture

## Product Definition

ProofGate is a pre-execution control plane for autonomous agents.

It converts independently obtained Telegraph intelligence into a
server-authenticated, short-lived, single-use authorization for one exact
proposed action.

> Agent confidence is not permission to act.

## Core Flow

PROPOSE → PROVE → PERMIT → EXECUTE → RECEIPT

---

## 1. Agent

The autonomous agent may propose consequential actions.

The agent is NOT trusted to authorize its own action.

Example:

- send 500 USDC
- recipient: 0x123...
- network: Base Sepolia
- reason: invoice INV-1042

---

## 2. Action Contract

Before verification, ProofGate converts the proposed action into a canonical
Action Contract.

Example:

{
  "type": "payment",
  "chainId": 84532,
  "asset": "USDC",
  "amountRaw": "500000000",
  "recipient": "0x123...",
  "reason": "Invoice INV-1042"
}

The Action Contract is canonicalized and hashed.

The hash represents the exact action being considered.

Changing any security-sensitive field creates a different action hash.

Examples:

500 USDC → 5000 USDC = different hash

0xABC → 0xBAD = different hash

Base Sepolia → Base Mainnet = different hash

---

## 3. Verification Planner

The Verification Planner determines which external evidence is required for
the Action Contract.

For the flagship payment demo this may include Telegraph-backed:

- fraud/risk intelligence
- recipient contract risk
- wallet information
- other relevant live evidence

ProofGate does not fabricate missing evidence.

---

## 4. Telegraph Adapter

Telegraph supplies independently produced intelligence from live Miners.

ProofGate records useful provenance such as:

- intent
- miner ID
- miner name
- result
- confidence when supplied
- reasoning when supplied
- signal hash
- cost
- duration
- payment settlement evidence when available
- timestamp

Important:

A Telegraph Miner result is EVIDENCE.

It is NOT a ProofGate authorization.

Even if a Miner returns ALLOW, SAFE, VALID, or a high confidence score,
ProofGate's policy engine still decides whether a permit may be created.

ProofGate does not invent consensus between Miners.

ProofGate does not generate fake aggregate confidence values.

---

## 5. Evidence Normalizer

Different Miners may return different response shapes.

The Evidence Normalizer converts relevant fields into an internal evidence
format while preserving the original raw response.

Raw Telegraph evidence must remain available for audit.

---

## 6. Deterministic Policy Engine

The Policy Engine evaluates the Action Contract and evidence.

Initial policy:

strict.v1

Possible decisions:

### ALLOW

All required evidence and invariants satisfy the policy.

A permit may be issued.

### HOLD

Evidence is incomplete, stale, unavailable, ambiguous, below a required
threshold, or otherwise insufficient.

No permit is issued.

### BLOCK

A known policy or security invariant has failed.

No permit is issued.

Examples:

- explicit prohibited risk result
- action mismatch
- invalid action data
- expired authorization
- replayed authorization

ProofGate fails closed.

---

## 7. Action Permit

Only an ALLOW decision can mint a permit.

Hackathon v1 uses an HMAC-SHA256 server-authenticated permit.

Permit fields include:

- permitId
- actionHash
- policyId
- nonce
- issuedAt
- expiresAt

The signature is computed server-side.

The secret must never be exposed to the agent or browser.

The permit is:

- exact-action bound
- short-lived
- single-use
- replay protected
- tamper evident

Changing the action after approval invalidates the permit.

---

## 8. Controlled Executor

The protected action must only be reachable through the Controlled Executor.

The executor must independently verify:

1. permit signature
2. action hash
3. expiry
4. nonce/permit consumption state

If any check fails, execution stops.

The executor must atomically consume the permit.

This prevents replay.

---

## 9. Real Action

Only after successful permit verification may the protected action execute.

Hackathon flagship:

A controlled Base Sepolia payment/action sandbox demonstrating a consequential
agent action.

The final implementation must not rely on a visual simulation to claim that
execution happened.

---

## 10. Proof Receipt

Every attempt creates an audit artifact.

A receipt may contain:

- receipt ID
- Action Contract
- action hash
- Telegraph evidence references
- Telegraph signal hash
- policy
- decision
- permit ID
- permit state
- execution result
- timestamps
- post-execution evidence when available

A post-execution ONCHAIN_TX_LOOKUP may enrich the receipt.

It does not replace ProofGate's pre-execution authorization boundary.

---

## Security Demonstrations

### Tamper Attack

Approved:

500 USDC → 0xABC

Attempted:

5000 USDC → 0xABC

Expected:

BLOCK
action_hash_mismatch

### Recipient Mutation

Approved:

500 USDC → 0xABC

Attempted:

500 USDC → 0xBAD

Expected:

BLOCK
action_hash_mismatch

### Replay Attack

Use an already-consumed permit again.

Expected:

BLOCK
permit_already_consumed

### Expiry

Use an expired permit.

Expected:

BLOCK
permit_expired

### Missing Evidence

Required Telegraph evidence is unavailable.

Expected:

HOLD

No permit is created.

---

## Architectural Boundaries

Telegraph:

Produces/routs/verifies intelligence.

ProofGate:

Determines whether evidence satisfies policy for one exact Action Contract.

Permit Service:

Authenticates one exact authorization.

Controlled Executor:

Enforces that authorization.

Receipt Service:

Records what happened.

The agent cannot bypass these boundaries.

---

## Flagship Principle

Telegraph provides the evidence.

ProofGate turns sufficient evidence into permission for one exact action.

The core innovation is not another fraud detector or another AI classifier.

The core innovation is the enforceable authorization boundary between an
autonomous agent's decision and an irreversible action.
