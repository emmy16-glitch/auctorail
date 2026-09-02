# ProofGate v1.1 — Adaptive Evidence Authorization

## Competitive thesis

ProofGate should not be another application that calls one Telegraph Miner and displays a result.

The v1.1 goal is to become a **risk-adaptive authorization firewall for autonomous agents**:

> The higher the consequence of an action, the more independent Telegraph intelligence ProofGate requires before it can mint permission to execute.

This directly exercises Telegraph's strongest application primitives: Intent-based routing, confidence thresholds, multi-Intent intelligence, x402 demand, and real on-chain actions.

## Product story

An agent proposes an action. ProofGate freezes the exact action and computes its risk tier. The risk tier determines an evidence budget and required Intents. ProofGate asks Telegraph for those Intents without selecting a specific Miner. Telegraph routes each request according to its ranking/routing system. ProofGate then binds the returned signals to the exact action, checks freshness/confidence/applicability, detects conflicts, and deterministically produces ALLOW, HOLD, or BLOCK. Only ALLOW can mint a one-use permit.

```text
Agent proposes action
        |
        v
Exact Action Contract + hash
        |
        v
Risk / consequence tier
        |
        v
Adaptive Evidence Plan
        |
        +--> Intent A --Telegraph routing--> Miner-selected signal
        +--> Intent B --Telegraph routing--> Miner-selected signal
        +--> Intent C --Telegraph routing--> Miner-selected signal
        |
        v
Evidence Bundle / conflict detection
        |
        v
Mandate + deterministic policy
        |
    ALLOW / HOLD / BLOCK
        |
        v
one-use permit -> controlled executor -> receipt
```

## What makes it different

### 1. Risk-adaptive evidence spend
ProofGate does not spend the same amount of verification effort on every action.

Initial demo tiers:

| Tier | Example | Required evidence | Evidence budget |
| --- | --- | --- | --- |
| LOW | <= 1 USDC | `FRAUD_DETECTION` | minimal |
| MEDIUM | >1 and <=5 USDC | `FRAUD_DETECTION` + `ONCHAIN_TX_LOOKUP` | higher |
| HIGH | >5 and <=10 USDC | `FRAUD_DETECTION` + `ONCHAIN_TX_LOOKUP` + `WALLET_BALANCE_CHECK` | highest |

The registry must be checked live. If a required Intent is unavailable, ProofGate fails closed with HOLD rather than silently reducing verification.

### 2. True Intent routing
v1.0 intentionally pinned the Refut on-chain-risk profile for the flagship policy. v1.1 should add a route that declares required Intent, confidence floor, subject, chain and deadline, then accepts the Miner Telegraph actually routes to. The application must not choose a provider simply because it likes that provider.

### 3. Multi-Intent evidence bundle
Each returned signal becomes a separately bound Evidence Item containing at minimum:

- Intent
- routed Miner identity
- exact subject
- chain
- verdict/label when present
- confidence when present
- applicability
- signal hash
- received time
- x402 cost

The bundle itself receives a canonical hash and becomes part of the authorization commitment.

### 4. Conflict is first-class
A high-confidence negative signal must not be averaged away by positive signals.

Initial deterministic rule:

- any required signal that is explicitly BLOCK -> BLOCK
- required signal missing/stale/not-applicable/under confidence -> HOLD
- all required evidence constraints satisfied -> continue to policy

We can later add weighted/quorum rules, but fail-closed behavior comes first.

### 5. Verification economics are visible
The receipt should show how much machine-verification cost was spent to authorize the action. This makes the x402/Telegraph economics part of the product rather than hidden plumbing.

Example:

```text
Action value:       8 USDC
Risk tier:          HIGH
Telegraph requests: 3
Evidence cost:      0.03 USDC
Decision:           ALLOW
Execution:          8 USDC (demo can remain check-only)
```

### 6. Counterfactual explanation
For HOLD/BLOCK, ProofGate should emit deterministic reason codes and a small counterfactual summary such as:

- `HOLD: ONCHAIN_TX_LOOKUP evidence missing`
- `BLOCK: FRAUD_DETECTION returned negative verdict`
- `HOLD: confidence 0.61 < required 0.80`

This is not LLM reasoning. It is generated from policy checks.

## Demo sequence that should stand out

1. Agent proposes a low-risk 1 USDC payment.
2. ProofGate requires one Intent and shows Telegraph's routed Miner and evidence cost.
3. Same agent proposes a 7 USDC payment.
4. ProofGate automatically escalates to three Intents because consequence increased.
5. Show an intentionally conflicting/synthetic offline test bundle -> BLOCK. Clearly label it as a defensive fixture, not live Telegraph evidence.
6. Show a real live multi-Intent check-only run using Telegraph.
7. Execute only a safe low-value canonical transaction if desired; avoid spending just for theater.
8. Show the Proof Receipt containing action hash, evidence bundle hash, individual signal hashes, total evidence cost, permit, and transaction.
9. Run replay/mutation attack and show the exact same permit cannot authorize changed amount/destination.

## Adoption angle

After the core path works, expose a tiny SDK/HTTP boundary so another agent can call:

```text
POST /authorize
{ action, agentId, mandateId }
```

and receive:

```text
{ decision, reason, evidenceBundleHash, permit? }
```

The goal is to let at least a few other builders use ProofGate as the authorization gate in front of their own agents. That gives the project real user/activity evidence instead of only a polished demo.

## Non-negotiables

- Keep `v1.0.0-hackathon` immutable as the proven baseline.
- Build v1.1 only on `v1.1-adaptive-evidence` until it passes all existing security tests.
- Never weaken v1.0 fail-closed rules just to produce an ALLOW.
- Never fabricate Miner responses and present them as live.
- Offline fixtures may be used only for defensive BLOCK/HOLD demonstrations and must be labeled synthetic.
- Live Telegraph routing results must be preserved as evidence artifacts.
- Existing action hash, mandate, permit replay, ambiguity, receipt, and spend controls stay intact.

## Implementation order

1. `AdaptiveEvidencePlan` and deterministic risk tiers.
2. Generic Intent request/response normalization independent of a pinned Miner.
3. `EvidenceBundle` canonicalization + bundle hash.
4. Multi-Intent orchestration with total x402 budget and no blind paid retry.
5. Adaptive multi-signal policy and conflict rules.
6. Receipt extension for bundle/cost/routing metadata.
7. Offline tests + fuzz families for bundle substitution, missing Intent, cross-Miner signal swap and cost-budget bypass.
8. Live check-only multi-Intent run.
9. Optional public SDK/API and external user integrations.
