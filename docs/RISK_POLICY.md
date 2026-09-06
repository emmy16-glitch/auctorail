# Auctorail payment risk policy

This document explains how the current adaptive payment policy decides **how much external evidence a proposed payment deserves**.

It does **not** define how much money an agent is allowed to spend. That authority comes from the principal-created Mandate and the policy's separate execution ceiling.

That separation matters:

```text
risk tier  → how much evidence Auctorail requires
authority  → what the principal actually allows the agent to do
```

A stronger evidence tier can never expand authority that the principal did not delegate.

> Historical note: some source/schema names still use `proofgate.*` because they predate the Auctorail rename. Those identifiers are preserved for compatibility.

---

## Current consequence bands

The authoritative implementation is in [`../src/telegraph/adaptive-evidence-plan.ts`](../src/telegraph/adaptive-evidence-plan.ts).

| Proposed amount | Tier | `FRAUD_DETECTION` requirement | Additional Intents | Max fraud attempts | Max evidence spend | Deadline |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `<= 5 USDC` | `LOW` | 1 distinct positive Miner at `>= 0.70` | none | 3 | `0.035 USDC` | **12s** |
| `> 5 to 50 USDC` | `MEDIUM` | 2 distinct positive Miners at `>= 0.75` | `ONCHAIN_TX_LOOKUP` | 4 | `0.060 USDC` | `60s` |
| `> 50 USDC` | `HIGH` | 3 distinct Miners, at least 2 positives at `>= 0.80` | `ONCHAIN_TX_LOOKUP` + `WALLET_BALANCE_CHECK` | 5 | `0.100 USDC` | `90s` |

These are Auctorail's current product/demo defaults. They are **not universal financial-risk thresholds**.

Older documentation that describes `<=1`, `1–5`, and `5–10` as LOW/MEDIUM/HIGH is stale relative to the current implementation.

---

## What “distinct Miner” means

Provider diversity is measured by Telegraph **Miner ID**, not by request count.

If Telegraph routes three requests to the same Miner, Auctorail still has only one independent provider.

```text
3 requests to Miner A  ≠  3 independent opinions

Miner A + Miner B      =  2 distinct providers
```

If the policy requires more independent providers and the required diversity cannot be obtained within the bounded attempt/spend/deadline window, the result is `HOLD`.

Auctorail does not invent consensus by counting duplicate routing as new votes.

---

## Positive confidence and negative evidence

A positive fraud result only counts toward quorum when it meets the tier's confidence floor:

```text
LOW     >= 0.70
MEDIUM  >= 0.75
HIGH    >= 0.80
```

Each FRAUD_DETECTION tier also has a high-confidence negative-veto threshold of `0.90` for early termination.

The final adaptive payment policy is stricter than a simple majority rule: **any explicit negative evidence blocks**. Known negative evidence is not averaged away by positive votes.

This is intentional. The system is authorizing an external effect, not trying to produce the most optimistic score.

---

## Exact evidence binding

Evidence is useful only when it belongs to the exact action being authorized.

The adaptive plan and evidence bundle bind security-relevant fields such as:

- action ID;
- action hash;
- exact payment destination/subject;
- chain ID;
- amount;
- required Intent;
- Miner identity;
- confidence and applicability;
- signal commitment/hash;
- quorum rule;
- consequence-derived plan hash.

Changing the payment after authorization changes the action binding. Evidence for another wallet, chain, amount, or plan must not silently satisfy the current request.

---

## The 10 USDC autonomous execution ceiling

The current [`payments.adaptive.v1`](../src/policy/payments-adaptive-v1.ts) policy has a hard autonomous execution ceiling of:

```text
10 USDC per action
```

The public hackathon web flow is also capped at 10 USDC.

This means:

- `0.50 USDC` → LOW evidence tier and within the current autonomous ceiling;
- `7 USDC` → MEDIUM evidence tier and can still be inside the autonomous ceiling if the Mandate allows it;
- `20 USDC` → MEDIUM evidence tier, but **blocked by the 10-USDC autonomous execution ceiling**;
- `75 USDC` → HIGH evidence tier, but **still blocked by the autonomous execution ceiling**.

So the HIGH evidence plan demonstrates/classifies what stronger evidence would be required for higher-consequence payments. It does not itself grant permission to execute those payments.

A future human-approved or step-up policy would need to explicitly create that additional authority.

---

## Why evidence is purchased only after authority preflight

Telegraph evidence can cost money through x402.

Buying that evidence is therefore itself a machine side effect.

Auctorail first checks whether the proposal is inside delegated authority. If a request is already outside the Mandate or policy ceiling, the system should `BLOCK` without spending money to gather intelligence that cannot make the request authorized anyway.

The desired order is:

```text
freeze exact action
→ check authority
→ derive evidence plan
→ acquire paid evidence only if the action is still eligible
```

This protects both security and evidence budget.

---

## Why LOW allows bounded retries

A single Telegraph route may be unusable for authorization even when the network request succeeds. Examples include:

- wrong Intent;
- wrong chain;
- wrong subject;
- insufficient confidence;
- missing required signal commitment;
- transport/schema failure.

LOW therefore allows up to **3 bounded acquisition attempts**, with a total evidence budget of **0.035 USDC** and a **12-second** evidence window.

This is a liveness allowance, not a weaker security rule.

A LOW request still requires:

- a real applicable `FRAUD_DETECTION` result;
- confidence `>= 0.70`;
- exact subject binding;
- exact Base Sepolia chain binding in the current payment path;
- a usable signal commitment;
- no explicit negative evidence;
- final policy `ALLOW` before executable authority is minted.

If required evidence remains missing or insufficient, the result is `HOLD`.

---

## What `HOLD` means in this policy

`HOLD` is a fail-closed result.

It means Auctorail does not currently have enough trustworthy evidence to authorize the action safely.

Typical causes include:

- insufficient distinct Miner diversity;
- too few confidence-qualified positive results;
- required Intent missing;
- stale evidence;
- acquisition deadline reached;
- evidence budget exhausted;
- evidence that cannot be bound to the exact action.

A hold does **not** mean “go ahead because nothing bad was found.” It means **no execution authority is issued**.

---

## Security rationale

The policy follows a consequence and least-privilege model:

1. The principal defines authority.
2. The exact action is frozen before paid evidence acquisition.
3. Higher consequence requires broader and/or more independent evidence.
4. Provider independence is measured by distinct Miner identity.
5. External intelligence cannot expand delegated authority.
6. Attempts, evidence spend and latency are bounded.
7. Missing/insufficient evidence fails closed as `HOLD`.
8. Explicit negative evidence fails closed as `BLOCK`.
9. A permit is minted only after the final decision is `ALLOW`.

Useful external references:

- Telegraph Hackathon rules: https://hackathon.telegraphprotocol.com/rules
- Telegraph x402 authentication: https://github.com/telegraphprotocol/telegraph-api-docs/blob/main/docs/overview/authentication.md
- OWASP AI Agent Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html
- OWASP LLM06 Excessive Agency: https://genai.owasp.org/llmrisk/llm062025-excessive-agency/

---

## Source-of-truth checklist

When the policy changes, update these together:

1. `src/telegraph/adaptive-evidence-plan.ts`
2. `src/policy/payments-adaptive-v1.ts`
3. relevant unit/fuzz tests
4. this file
5. the root [`README.md`](../README.md)
6. [`README.md`](README.md) documentation index if the mental model changes
7. judge-facing copy if public claims or examples change

The implementation and the newest green tests always take precedence over an older prose snapshot.

---

## Design rule

**A risk tier determines how much evidence Auctorail requires. A Mandate and policy determine what the agent is actually authorized to do. Evidence can satisfy authority; it cannot manufacture authority.**
