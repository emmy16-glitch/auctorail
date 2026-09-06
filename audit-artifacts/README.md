# Auctorail audit-artifact archive

This directory contains **historical assessment outputs and generated evidence from earlier ProofGate-era revisions** of the project.

These files are preserved for provenance. They are **not the source of truth for current Auctorail behavior, dependency status, test counts, runtime requirements, or release readiness**.

## Important distinction

The project was previously named **ProofGate**. Historical reports in this folder intentionally keep the name, repository URL, revision SHA, findings, test counts, coverage numbers and dependency state that were true for the exact revision they assessed.

Do not silently rewrite those reports to look current. Doing so would destroy the meaning of the historical assessment.

For present-tense Auctorail claims, use this source order:

```text
current source code
→ current green CI / browser QA
→ current committed real evidence + receipts
→ root README + docs/README.md
→ current architecture/security/risk docs
→ historical audit artifacts
```

## Historical reports

### `security-audit-report.md`

This is an authorized defensive assessment of an earlier ProofGate revision from **2026-09-02**. Its old repository URL, assessed SHA, test count, coverage values, dependency findings and implementation topology belong to that historical snapshot.

It should **not** be quoted as the current Auctorail test count or current dependency-audit status.

### `residual-risk-hardening-analysis.md`

This is a follow-on production-hardening analysis based on the historical security assessment above. It records risks and recommendations as they existed at that milestone.

Some recommendations remain useful design guidance, but current implementation status must be checked against `main` before treating an old item as still open.

## Current Auctorail status

At the time this archive index was added, current maintained documentation records:

```text
Product:                       Auctorail
Repository:                    emmy16-glitch/auctorail
Current Node baseline:         >=24.15.0
Current LOW evidence deadline: 12 seconds
Current tests:                 268 / 268
Current deterministic fuzz:    7400 / 7400 cases contained
Current production npm audit:  0 vulnerabilities in latest green CI
```

The current real-usage ledger conservatively records:

```text
2 genuine Telegraph Miner acquisitions
$0.02 committed x402 evidence cost
1 protected Base Sepolia execution
```

For exact current values, always re-check the latest green `main` rather than treating this archive README as timeless.

## Current sources to read instead

- [`../README.md`](../README.md) — canonical project overview and current facts.
- [`../docs/README.md`](../docs/README.md) — maintained documentation index.
- [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) — current architecture.
- [`../docs/SECURITY_MODEL.md`](../docs/SECURITY_MODEL.md) — current security model.
- [`../docs/RISK_POLICY.md`](../docs/RISK_POLICY.md) — current adaptive policy thresholds.
- [`../docs/REAL_USAGE_LOG.md`](../docs/REAL_USAGE_LOG.md) — current conservative real external-usage ledger.
- [`../docs/LIVE_EXECUTION.md`](../docs/LIVE_EXECUTION.md) — canonical public execution proof.
- [`../docs/FINAL_SUBMISSION.md`](../docs/FINAL_SUBMISSION.md) — current claim boundaries.

## Why historical findings may differ from current status

A historical report can legitimately say things such as:

```text
120 tests
old dependency advisories
local filesystem permit store
old ProofGate repository URL
```

while current `main` has different tests, dependencies, architecture and naming.

That is not a contradiction when the report is correctly understood as a dated artifact.

## Rule for reviewers and AI assistants

**Never copy a present-tense security, dependency or release claim out of a file in `audit-artifacts/` without first checking current source and current green CI.**

Historical evidence is valuable because it is preserved honestly, not because it is rewritten to match the latest product.