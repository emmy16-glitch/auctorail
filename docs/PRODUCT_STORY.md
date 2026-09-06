# Auctorail product story

This document explains Auctorail in the clearest possible product language. It is intended for judges, reviewers, collaborators, press/social posts, demo preparation and anyone who needs to understand the value before reading the architecture.

## The problem

AI agents are moving from **answering** to **acting**.

They can call APIs, pay invoices, manage infrastructure, publish content, create accounts, operate software and trigger other real-world effects.

The industry has spent a lot of effort making agents more capable and giving them more intelligence. But capability creates a second question:

> **Who decides what the agent is actually allowed to do?**

A model can sound confident and still be wrong. A tool can return useful intelligence and still not be permission. A wallet risk score can say “safe” while the agent is trying to spend more than its owner allowed.

That is the gap Auctorail addresses.

## The one-line explanation

> **Intelligence tells an agent what it knows. Auctorail determines what it is allowed to do.**

## The product

Auctorail is a **pre-execution authorization rail for autonomous agents**.

The agent never directly owns the final authority to cause the protected effect.

Instead:

1. the human/principal defines bounded standing authority;
2. the agent proposes one exact action;
3. Auctorail freezes the action;
4. Auctorail checks whether the action is actually delegated;
5. Auctorail collects the external evidence the policy requires;
6. deterministic policy returns `ALLOW`, `HOLD`, or `BLOCK`;
7. only an executable `ALLOW` can produce short-lived one-use authority;
8. a protected executor causes the effect;
9. Auctorail records the result in a proof receipt.

## Why Telegraph matters

Telegraph gives Auctorail access to specialized external intelligence through Miners.

Auctorail does not compete with the idea of useful Miners. It answers the next question.

A Miner may tell an agent:

```text
this wallet appears low-risk
confidence: 0.82
```

Auctorail still asks:

```text
Was this agent allowed to pay at all?
Was it allowed to pay this amount?
Was this recipient permitted?
Does the evidence actually refer to this recipient?
Is this the correct chain?
Did the Miner answer the required Intent?
Is the confidence high enough?
Is the evidence still usable?
Was this exact action changed after approval?
Has the permit already been used?
```

That makes Telegraph intelligence **actionable without turning intelligence providers into implicit authorization authorities**.

## A simple comparison

### Intelligence product

```text
Agent/User
   ↓
Ask a specialist service
   ↓
Receive information
   ↓
Human/agent decides what to do
```

### Auctorail

```text
Agent proposes an external action
   ↓
Auctorail checks delegated authority
   ↓
Auctorail acquires required intelligence
   ↓
Auctorail binds evidence to the exact action
   ↓
Policy decides ALLOW / HOLD / BLOCK
   ↓
One-use execution authority
   ↓
Protected external effect
```

Both layers can be useful together. In fact, Auctorail is designed to consume intelligence services rather than replace them.

## The demo that explains everything

Auctorail's strongest deterministic demo uses four scenarios.

### 1. Valid action

```text
Agent requests: send 1 USDC to the permitted vendor
Authority: valid
Required evidence: valid
Result: ALLOW
Permit: issued
Execution: succeeds in demo
```

### 2. Amount changed after authorization

```text
Authorized: 1 USDC
Attempted: 2 USDC
Result: BLOCK
```

This proves that authority is bound to the exact action, not to a vague intention such as “pay the vendor.”

### 3. Permit replay

```text
Permit was already consumed
Agent tries to reuse it
Result: BLOCK
```

This proves that successful authorization does not become reusable permanent authority.

### 4. Missing evidence

```text
The action is inside standing authority
but required evidence is not sufficient
Result: HOLD
No execution authority
```

This proves that unavailable intelligence does not silently become permission.

## The real path

The deterministic demo is backed by a real payment lane.

The repository contains genuine Telegraph/x402 acquisitions and one protected Base Sepolia USDC execution.

The canonical public example includes:

- `FRAUD_DETECTION`;
- Refut On-Chain Risk Miner (`95822412`);
- confidence `0.70`;
- signal hash;
- `$0.01` x402 evidence cost for the canonical run;
- `1 USDC` protected Base Sepolia execution;
- public transaction hash;
- proof receipt hash.

This matters because the demo is not merely a theoretical policy animation. The underlying execution pattern has been exercised with real external evidence and an on-chain testnet effect.

## What makes the architecture interesting

### Authority first

Auctorail checks whether the action could become authorized **before paying for external evidence**.

This prevents an agent from wasting evidence budget on actions outside its authority.

### Evidence is bound

A favorable answer about Wallet A must not authorize Wallet B.

A Base mainnet result must not silently authorize Base Sepolia.

A response for another Intent must not satisfy `FRAUD_DETECTION`.

### More consequence can require more evidence

The adaptive policy raises confidence/provider requirements with consequence.

### Provider diversity is real diversity

Three calls routed to one Miner are one source, not three votes.

### Missing evidence is not permission

`HOLD` is a first-class outcome.

### Execution authority is one-use

A successful authorization does not become a reusable token.

### Ambiguous effects are reconciled

A network error does not automatically mean “retry the payment.”

## Why not just put the rules in the prompt?

Prompts are useful for behavior shaping, but the agent still controls the reasoning process and can be manipulated or mistaken.

Auctorail moves important constraints into deterministic trusted code outside the model's authority boundary.

The agent can request:

```text
"send 20 USDC"
```

but if the trusted policy allows only 10 USDC autonomous execution, the model cannot talk its way around that limit.

## Why not just let the Miner decide?

Because a Miner answers an intelligence question, not the principal's authorization question.

A good risk score cannot tell Auctorail that the principal authorized a larger amount, another recipient or a different action.

The correct relationship is:

```text
principal authority
       +
external evidence
       +
deterministic policy
       =
authorization decision
```

## Why `HOLD` matters

Many systems collapse uncertainty into either success or failure.

For autonomous execution, that is dangerous.

Auctorail distinguishes:

- `ALLOW` — enough authority and evidence exists;
- `HOLD` — do not execute because proof is insufficient;
- `BLOCK` — a hard rule failed.

This means upstream downtime does not need to become unsafe permission.

## Current product scope

### Implemented

- generic Action/Mandate/Decision architecture;
- adaptive payment policy;
- real Telegraph/x402 payment evidence acquisition;
- exact evidence binding;
- distinct-Miner quorum;
- one-use execution permits;
- protected Base Sepolia USDC execution;
- receipts and public verification;
- deterministic Security Lab and fuzz testing;
- Content Trust lane;
- repository-local SDK;
- responsive web product.

### Demonstrated with real public artifacts

- genuine Telegraph/x402 payment evidence;
- real Base Sepolia protected payment;
- public evidence and receipt references.

### Future direction

Auctorail can evolve from one payment adapter into a broader authorization layer for agentic actions such as:

- wallet transfers;
- DeFi actions;
- account administration;
- infrastructure changes;
- SaaS/API mutations;
- content publication;
- marketplace purchases;
- smart-contract interactions.

Each new adapter needs a trustworthy action freeze, principal authority model, evidence semantics, policy and protected executor.

## What Auctorail should never claim

Avoid weakening credibility with claims that are broader than the evidence.

Do not claim:

- “unhackable”;
- “guaranteed safe AI”;
- “fully production ready”;
- “independently audited” unless that actually happens;
- “every lane has live Telegraph proof”;
- “AI detection proves truth”;
- “public npm SDK” before publication;
- “the first ever” without independent evidence.

The concrete technical story is stronger than hype.

## 20-second judge pitch

> AI agents can already take real actions, but capability isn't authority. Auctorail sits between the agent and the protected executor. It freezes the exact action, checks what the human actually delegated, gathers required Telegraph evidence, and returns ALLOW, HOLD, or BLOCK. Only ALLOW can produce a short-lived one-use permit. Change the amount, replay the permit, or lose required evidence and the action doesn't execute.

## 60-second judge pitch

> AI agents are becoming capable of moving money and using powerful tools. The problem is that a capable agent should not automatically be an authorized agent. Auctorail is a pre-execution authorization layer. A human creates bounded standing authority. When the agent proposes an action, Auctorail freezes the exact amount, recipient, chain and policy, checks that authority, and then acquires the external intelligence the policy requires through Telegraph. That evidence has to bind to the exact action and meet confidence and quorum rules. The result is ALLOW, HOLD or BLOCK. Only ALLOW can create a short-lived one-use execution permit. So if the amount changes after authorization, it is blocked. If a permit is replayed, it is blocked. If required evidence is unavailable, the system holds instead of guessing. The repository also contains real Telegraph/x402 evidence and a protected Base Sepolia execution.

## Social-post framing

A concise framing for X:

> AI agents don't just need better tools. They need enforceable limits on what they're allowed to do. Auctorail is a pre-execution authorization rail: exact-action binding, delegated authority, Telegraph evidence, deterministic ALLOW/HOLD/BLOCK, one-use permits, and protected execution.

## Final product principle

**Auctorail is not trying to make agents less intelligent. It is making intelligence operate inside explicit authority.**
