# ProofGate Security Audit Report

**Assessment type:** Authorized defensive security assessment
**Repository:** [emmy16-glitch/proof-gate](https://github.com/emmy16-glitch/proof-gate)
**Assessment scope:** Local source code, fixtures, mocks, deterministic tests, worker-thread stress harnesses, and offline mutation/fuzzing harnesses. No production systems, unrelated hosts, real funds, live Telegraph paid requests, x402 payments, or blockchain writes were used.
**Assessment date:** 2026-09-02 UTC
**Assessed revision:** `381a2dddd86b59f2afc41c555be5e9174d3ca904` plus the uncommitted security fixes recorded in the metadata artifact.

## Executive conclusion

> **1,100 / 1,100 adversarial fuzz cases contained; unauthorized executions = 0.**

The assessed ProofGate implementation preserved its primary security invariant across the executed offline harnesses: invalid, mutated, replayed, malformed, or incorrectly bound authorization inputs did not reach protected execution. One important weakness was identified during adversarial testing and remediated: `verifyPermit()` previously trusted the `actionHash` field supplied on an `ActionContract` instead of recomputing the hash from the current semantic payload. The implementation now recomputes the canonical hash and requires both the action’s stored hash and the permit’s committed hash to match it.

A second previously identified weakness was also remediated: permit-store filesystem errors could escape the executor boundary. `executeProtectedAction()` now returns the stable `permit_store_unavailable` failure code and does not invoke the protected callback when permit acquisition fails.

The conclusion applies to the tested local implementation and its current single-worker filesystem-store topology. It is not a substitute for an independent smart-contract audit, live-chain integration review, production key-management review, or distributed datastore assessment.

## Scope and system invariants

The review covered the authorization sequence **MANDATE → ACTION → TELEGRAPH EVIDENCE → DETERMINISTIC POLICY → ALLOW → PERMIT → CONTROLLED EXECUTOR → EXECUTION → RECEIPT**. The following invariants were treated as security requirements:

| Invariant | Assessment result |
|---|---|
| Invalid permit cannot execute | Passed |
| Wrong action hash cannot execute | Passed after canonical recomputation hardening |
| Wrong mandate, agent, principal, or version cannot execute | Passed |
| Wrong evidence subject or chain cannot execute | Passed |
| Expired or future-invalid permit cannot execute | Passed |
| Permit replay is blocked | Passed |
| Concurrent replay has at most one claimant | Passed |
| Permit is consumed before protected execution | Passed |
| Consumption remains recorded after downstream failure | Passed by existing executor semantics |
| Ambiguous blockchain outcome remains `AMBIGUOUS` | Passed |
| Pre-execution storage failure is `FAILED`, not `AMBIGUOUS` | Passed after fix |
| Agent or miner output cannot directly create authorization | Passed in tested policy and permit flows |
| Receipt tampering is detected | Passed by attack lab and receipt tests |

## Vulnerability classes tested

The adversarial harness used reproducible mutation families and generated 1,100 distinct attack cases. The existing repository attack lab and regression tests provided additional targeted coverage.

| Vulnerability class | Test coverage and observed result |
|---|---|
| Action-contract mutation | Amount, destination, chain, asset, reason, policy, action type, stale hash, and combined mutations were rejected. |
| Amount manipulation | Changed amounts and policy-boundary values were rejected through action-hash and mandate/policy checks. |
| Recipient manipulation | Alternate destination and evidence-subject substitutions were rejected. |
| Chain and asset confusion | Mainnet/other-chain and unauthorized-token substitutions were rejected. |
| Mandate and standing-authority violations | Destination, chain, asset, action-type, policy, agent, and mandate binding changes were rejected. |
| Mandate substitution | Altered mandate hash and binding fields were rejected. |
| Permit replay | Sequential and concurrent replay tests passed; the shared filesystem stress run recorded zero duplicate claims. |
| Permit-field mutation | Permit ID, nonce, action hash, decision hash, policy, expiry, and signature mutations were rejected. |
| Time attacks | Expired and malformed-time cases were rejected; valid controls remained accepted. |
| Signature tampering | Forged, truncated, and altered signatures were rejected. |
| Decision mutation and fake ALLOW objects | Altered action IDs, status/checks, and policy IDs were rejected. |
| Decision-hash attacks | Changes to committed decision/evidence material were rejected. |
| Evidence substitution and mutation | Subject, chain, intent, signal, and raw evidence changes were rejected when they altered a bound value. |
| Evidence freshness and confidence policy | Existing policy tests cover freshness and thresholds; no external evidence request was made during the audit. |
| Missing or malformed evidence | Existing live-evidence guard and policy tests passed; malformed fuzz values produced no uncaught execution path. |
| Miner verdict confusion | Attack-lab negative-miner scenario passed; miner output remained evidence rather than authorization. |
| Provenance and signal-hash corruption | Existing evidence-binding and attack-lab tests passed; signal mutations were rejected by committed decision context. |
| Canonicalization and hash binding | Stale semantic payload hash attack was reproduced and fixed; post-fix fuzzing contained all genuine mutations. |
| Receipt tampering and fake execution receipts | Existing proof-receipt and attack-lab tests passed. |
| Journal state-machine abuse | Existing operation-journal tests passed; no illegal transition was observed. |
| Crash, persistence, and replay safety | Permit consumption, ambiguity, and filesystem failure tests passed; distributed recovery remains out of scope. |
| RPC ambiguity and failover semantics | Local simulated pre-submit failure and post-submit ambiguity preserved `FAILED` and `AMBIGUOUS` distinctions. |
| TOCTOU and race conditions | Eight worker threads performed 442,037 shared-store attempts against 120 permits with zero duplicate claims. |
| Corrupted persistence and storage failure | EACCES, ENOSPC, EROFS, unknown storage error, and mid-acquisition disk-full simulation were contained. |
| Configuration and secret boundary | Existing local-secret tests passed; no real secrets were logged or exposed. |
| x402 policy and settlement safety | Existing x402 policy tests passed; no x402 payments or paid requests were made. |
| Input, Unicode, serialization, unknown-field, and contradictory-object attacks | Fuzz corpus included malformed values, Unicode/control-style text, stale derived fields, and combined object mutations; no unauthorized execution occurred. |
| Cross-action, cross-agent, and cross-principal authorization | Existing mandate/action binding tests and fuzz mutations rejected substitutions. |

## Findings and mitigations

### SEC-001 — Stale action hash could authorize a mutated payload — **Remediated**

**Affected component:** `src/permit/permit.ts`.

Before remediation, verification compared `permit.payload.actionHash` with the caller-supplied `action.actionHash` but did not recompute the hash from `action.payload`. An attacker-controlled or mutated object could therefore change semantic fields while retaining a stale derived hash. This was reproduced during the concurrent local attack run, where 20 amount mutations reached the protected callback.

The mitigation imports `hashCanonicalPayload()` and recomputes the hash from `canonicalize(action.payload)`. Verification now requires the recomputed value to equal both the action’s stored hash and the permit’s committed hash. A regression test, **“blocks a mutated payload with a stale action hash,”** asserts `action_hash_mismatch` and zero protected executions.

### SEC-002 — Permit-store filesystem errors escaped the executor boundary — **Remediated**

**Affected components:** `src/executor/controlled-executor.ts` and `src/executor/permit-store.ts`.

Filesystem errors other than `EEXIST` could previously escape as uncaught exceptions. The executor now catches permit-store acquisition failures and returns the sanitized result `FAILED / permit_store_unavailable`; the protected callback is not invoked. Tests cover `EACCES`, `ENOSPC`, `EROFS`, unknown errors, and a simulated disk-full failure after acquisition work had begun.

### SEC-003 — Local filesystem consumption store is topology-limited — **Open operational risk**

`FilePermitConsumptionStore` uses atomic local file creation and performed correctly under the tested eight-worker shared-filesystem race. It is not, by itself, a distributed authorization-consumption service. Multi-host deployments need a shared durable atomic-claim primitive with a uniqueness constraint and explicit crash/recovery semantics.

### SEC-004 — Production dependency audit findings — **Open dependency risk**

The production-tree dependency audit reported one high and one low advisory through `solc` and its transitive `tmp` dependency. The affected path is primarily compiler/build tooling rather than payment execution, but it should be isolated or upgraded after compatibility testing. The complete audit output is included in `npm-audit.log` and `npm-audit.json`.

### SEC-005 — No dedicated lint gate — **Open process gap**

The project CI script runs typecheck and tests but has no dedicated lint command or configuration. Adding a lint gate would improve detection of unsafe patterns, unreachable code, and maintainability regressions; this is not an observed authorization bypass.

## Verification results

| Verification | Result |
|---|---:|
| Full Vitest suite | **28 files / 120 tests passed** |
| TypeScript typecheck | Passed |
| Repository attack lab | **11 / 11 scenarios passed** |
| Authorized defensive fuzz harness | **1,100 / 1,100 attacks contained** |
| Valid fuzz controls | **100 / 100 passed** |
| Unauthorized executions in fuzz harness | **0** |
| Uncaught fuzz verification errors | **0** |
| Long-duration shared-store stress | **15 seconds, 8 workers, 442,037 attempts** |
| Unique stress claims | **120 / 120** |
| Duplicate stress claims | **0** |
| Stress partition semantic errors | **0** |
| External Telegraph calls | **0** |
| x402 payments | **0** |
| Blockchain writes | **0** |
| `git diff --check` | Passed |

## Coverage report

Coverage was generated with Vitest’s V8 provider across the instrumented source set.

| Metric | Covered | Total | Percentage |
|---|---:|---:|---:|
| Lines | 790 | 1,047 | **75.45%** |
| Statements | 790 | 1,047 | **75.45%** |
| Functions | 161 | 181 | **88.95%** |
| Branches | 675 | 952 | **70.90%** |

The coverage output includes HTML, Clover XML, and raw JSON formats. Coverage is a test-coverage measurement, not a security guarantee; the untested lines should be reviewed before production deployment.

## Test evidence and limitations

The assessment is strong evidence for the tested local authorization paths, especially exact action binding, permit replay, evidence binding, decision integrity, and pre-execution storage failure behavior. The assessment did not execute live external payments, did not exercise production RPC providers, and did not independently audit Solidity or the deployed contract address. The filesystem store’s single-host limitation remains relevant for any horizontally scaled deployment.

## Compliance artifact inventory

| Artifact | Purpose |
|---|---|
| `full-execution-log.txt` | Combined stdout/stderr for typecheck, full tests, attack lab, coverage, and dependency audit. |
| `coverage-summary.json` | Machine-readable aggregate coverage totals. |
| `coverage-final.json` | Raw V8 coverage data. |
| `coverage-clover.xml` | XML coverage export for compliance tooling. |
| `coverage-index.html` | Human-readable HTML coverage entrypoint. |
| `full-test.log` | Full Vitest execution log. |
| `attack-lab.log` | Full attack-lab execution log. |
| `typecheck.log` | Full TypeScript typecheck log. |
| `npm-audit.log` and `npm-audit.json` | Dependency vulnerability audit outputs. |
| `audit-metadata.txt` | Commit, branch, runtime, package, and working-tree metadata. |

## References

[1]: https://github.com/emmy16-glitch/proof-gate "ProofGate repository"
[2]: https://vitest.dev/guide/coverage.html "Vitest coverage documentation"
[3]: https://docs.npmjs.com/cli/v10/commands/npm-audit "npm audit documentation"
