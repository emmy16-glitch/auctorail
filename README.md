# ProofGate

**Agent confidence is not permission to act.**

ProofGate is a pre-execution authorization control plane for autonomous AI agents. An agent may decide what it wants to do, but it cannot authorize its own irreversible action.

ProofGate binds delegated authority, independently obtained Telegraph evidence, deterministic policy, a short-lived permit, replay protection, controlled execution, and a tamper-evident receipt around one proposed action.

`MANDATE → PROPOSE → PROVE → POLICY → PERMIT → EXECUTE → RECEIPT`

Built for the **Telegraph Protocol Application Track**.

## Why ProofGate exists

Autonomous agents can reason, plan and choose actions, but a high-confidence model output is not an authorization boundary. For consequential actions such as payments, the system needs an enforceable answer to a different question:

> Is this exact action currently permitted under the authority delegated to this agent, using sufficient independent evidence?

Telegraph provides external intelligence. ProofGate decides whether that evidence satisfies policy for one exact action. A Miner verdict such as `ALLOW`, `SAFE` or `VALID` is evidence only; it never directly becomes permission.

## Canonical live hackathon execution

On **2026-09-02**, ProofGate completed its flagship flow end-to-end on Base Sepolia.

- Action: autonomous ERC-20 payment
- Amount: **1 Base Sepolia USDC**
- Sender: `0xC07a448DF2E1F3AF0d6f0E8cCe45d5D753fc8eF4`
- Canonical vendor: `0xB38d0405DF1b15961aEf29C7c45f2ED285822c14`
- Telegraph Miner: `Refut On-Chain Risk` (`95822412`)
- Telegraph verdict: `ALLOW`
- Telegraph confidence: `0.7`
- Telegraph signal hash: `0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c`
- Policy: `payments.attested-vendor.v1`
- Policy result: `ALLOW`
- Transaction: `0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc`
- Base Sepolia block: `46301208`
- Receipt hash: `0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3`

Basescan:

https://sepolia.basescan.org/tx/0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc

Public proof artifacts:

- `data/evidence/telegraph-2026-09-02T17-36-12-826Z.json`
- `data/evidence/vendor-attestations/vendor-runtime-2026-09-02T17-38-18-411Z.json`
- `data/receipts/878d4350-85c8-44dd-94c2-257641cd7c0c.json`
- `docs/LIVE_EXECUTION.md`

The transaction is not a UI simulation. ProofGate obtained fresh Telegraph evidence for the exact destination and chain, independently attested the deployed vendor runtime, evaluated deterministic policy, minted a permit bound to the exact action, executed the approved transfer, and produced a verifiable receipt.

## Flagship action

The canonical demo action is:

- network: Base Sepolia (`84532`)
- asset: Base Sepolia USDC
- amount: `1 USDC` (`1000000` minor units)
- destination: `0xB38d0405DF1b15961aEf29C7c45f2ED285822c14`
- destination contract: `ProofGateVendor`

The vendor is intentionally minimal: no owner, admin, pause, proxy, upgrade authority, privileged withdrawal path or mutable configuration.

Its deployment is tracked in:

`data/deployments/base-sepolia-vendor.json`

## Core security properties

- Canonical Action Contracts with SHA-256 exact-action binding
- Cryptographically committed Mandate Contracts for delegated authority
- Mandate lifecycle controls: `ACTIVE`, `REVOKED`, `EXPIRED`
- Per-action and optional cumulative spending limits
- Real Telegraph Miner evidence in the live path; synthetic evidence is confined to tests
- Exact evidence subject and chain binding
- Evidence intent, applicability, confidence, signal-hash and freshness checks
- Deterministic `ALLOW / HOLD / BLOCK` policy evaluation
- Decision hashing so permit authority is bound to the evaluated evidence and policy result
- Short-lived, single-use permits with key and policy-version metadata
- Ed25519 production signing support with key rotation/revocation semantics
- HMAC signing restricted to local/test/demo environments
- Shared PostgreSQL permit claims for multi-worker replay protection
- Durable execution state and exact transaction-intent binding
- Cumulative spend reservations bound to mandate, policy, chain and token
- Execution kill-switch support
- Explicit `AMBIGUOUS` handling for uncertain irreversible writes
- Operation journaling before external side effects
- Tamper-evident Proof Receipts
- Fail-closed x402 proof-payment policy locked to Base Sepolia USDC

## Authority model

ProofGate separates **delegation** from **decision-making**.

A Mandate may constrain:

- principal and agent identity
- allowed action types
- allowed chains
- allowed assets
- allowed destinations
- maximum amount per action
- optional maximum cumulative spend
- required Telegraph proof intents
- policy ID and policy version
- activation, expiry and revocation state

The agent can act autonomously only inside that pre-delegated envelope. A valid model decision cannot expand the Mandate.

## Policies

### `payments.strict.v1`

A strict payment policy requiring exact subject/chain binding, `FRAUD_DETECTION` evidence, applicability, signal hash, freshness and its configured confidence threshold in addition to mandate and payment constraints.

### `payments.attested-vendor.v1`

The composite policy used by the canonical live execution. It combines fresh Telegraph evidence with an exact live runtime attestation of the deployed vendor contract.

The runtime proof is supplemental evidence; it does not replace Telegraph and it does not weaken a negative Miner result.

Both policies fail closed.

## Permit and signing model

Only an `ALLOW` decision may mint a permit.

A permit commits to security-sensitive context including:

- mandate hash
- action hash
- decision hash
- nonce
- policy ID/version
- signing key ID/algorithm/version where applicable
- issue time
- expiry time

For local development and deterministic demos, ProofGate provides an HMAC-based development signer. It is explicitly rejected in `NODE_ENV=production`.

Production-oriented signing uses Ed25519 and supports verification-key lifecycle states including `ACTIVE`, `VERIFY_ONLY` and `REVOKED`.

### Live-demo scope

The canonical transaction recorded in `docs/LIVE_EXECUTION.md` used the local/demo HMAC signer and filesystem-backed permit-consumption compatibility path.

The repository separately implements the stronger production-oriented Ed25519 and PostgreSQL durable path. Those controls are implemented and tested, but this specific transaction should not be described as having exercised them.

## Durable execution

The production-oriented path adds durable state for multi-worker and failure-aware execution:

- PostgreSQL-backed single-use permit claims
- durable execution records
- transaction-intent hashing and verification before submission
- mandate status authority checks
- optional cumulative spend authority
- execution kill switch
- explicit failure versus post-submission ambiguity semantics

An unknown database claim result is never treated as success. An unknown blockchain result after possible broadcast is never blindly retried as though nothing happened.

See:

- `docs/ARCHITECTURE.md`
- `docs/RESILIENCE_INVARIANTS.md`
- `docs/permit-consumption-store.md`

## Local verification

```bash
npm ci
npm run ci
npm run audit:prod
```

`npm run ci` runs strict TypeScript checking and the full Vitest suite.

CI also recompiles the vendor contract with the pinned native Solidity compiler and fails if the tracked build artifacts change unexpectedly.

The Solidity compiler is development-only tooling. Production installations should use:

```bash
npm ci --omit=dev
```

## Deterministic defensive Attack Lab

Run:

```bash
npm run attack:lab
```

The Attack Lab is intentionally offline. It does not call Telegraph, pay x402 challenges or broadcast blockchain transactions.

It exercises authorization-boundary attacks such as replay, amount mutation, evidence substitution, forged signatures, permit expiry, decision tampering, mandate rebinding, negative Miner verdicts, runtime-attestation tampering and Proof Receipt tampering.

See `docs/ATTACK_LAB.md`.

## Obtain fresh Telegraph proof

Refresh the live Telegraph registry:

```bash
bash scripts/discover-telegraph.sh
```

For the canonical composite-policy route:

```bash
npm run proof:live -- \
  0xB38d0405DF1b15961aEf29C7c45f2ED285822c14 \
  --capability-route \
  --attested-vendor-policy
```

The live proof path freezes the Action Contract before requesting evidence, journals the paid attempt, validates the x402 payment lane and price cap, preserves Telegraph's dynamic `payTo`, refuses blind retry after ambiguous payment, validates exact subject/chain/Miner/intent binding, and saves evidence only after a genuine successful response.

Historical evidence for a different destination is never substituted for the canonical vendor. If fresh evidence is unavailable or insufficient, ProofGate must `HOLD` or `BLOCK` rather than weaken policy.

## Approved payment check and execution

Check a saved evidence artifact without sending a transaction:

```bash
npm run execute:approved -- \
  data/evidence/telegraph-2026-09-02T17-36-12-826Z.json \
  --attested-vendor-policy
```

A live execution additionally requires `--execute` and intentionally causes a Base Sepolia USDC transfer. Do not rerun the canonical transaction merely to reproduce the existing proof artifact.

## Security assessment artifacts

`audit-artifacts/` contains an authorized defensive assessment performed against an earlier assessed revision, including adversarial fuzzing, coverage, stress output and dependency-audit material.

Those artifacts are evidence for the revision they name; they must not be presented as an independent audit of every later commit. Final hackathon validation should be regenerated against the exact submission SHA after implementation is frozen.

## Runtime state and secrets

`.env` and `.proofgate/` are ignored by Git.

Never commit:

- private keys
- permit-signing secrets
- wallet recovery material
- payment signatures
- database credentials
- Telegraph credentials
- production signing keys

## Repository map

```text
contracts/          Minimal ProofGateVendor smart contract
src/core/           Action and Mandate Contracts
src/telegraph/      Telegraph routing, evidence and x402 policy
src/evidence/       Evidence normalization/storage/runtime attestation
src/policy/         Deterministic payment policies
src/permit/         Permit creation, verification and signing
src/executor/       Replay protection, durable execution and spend authority
src/gateway/        End-to-end payment authorization gateway
src/receipt/        Proof Receipt creation and verification
src/security/       Attack Lab, audit logging and execution kill switch
migrations/         PostgreSQL durability/replay/spend schemas
scripts/            Live proof, execution, deployment and defensive tooling
tests/              Deterministic regression/security tests
docs/               Architecture, resilience, live proof and demo documentation
```

## Principle

**Telegraph provides the evidence. ProofGate turns sufficient evidence plus delegated authority into permission for one exact action.**

The innovation is the enforceable boundary between an autonomous agent's decision and an irreversible external effect.
