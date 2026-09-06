# Auctorail handoff folder

This folder contains historical handoff artifacts from earlier stages of the project.

## `ProofGate_Master_Project_Dossier.docx`

The existing DOCX was created before the final **Auctorail** rebrand and before several current architecture/product changes.

Treat it as a **historical snapshot**, not the current source of truth.

It may contain:

- the old ProofGate product name;
- older test counts;
- older evidence-policy thresholds;
- older UI structure;
- milestone-specific architecture wording;
- older runtime assumptions.

Do not use the DOCX alone for current submission, deployment or security claims.

## Current sources of truth

Use these instead:

1. [`../../README.md`](../../README.md) — canonical current project overview.
2. [`../README.md`](../README.md) — documentation index and current-facts guide.
3. [`../PRODUCT_STORY.md`](../PRODUCT_STORY.md) — judge/product explanation.
4. [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — current architecture.
5. [`../SECURITY_MODEL.md`](../SECURITY_MODEL.md) — current threat/security model.
6. [`../RISK_POLICY.md`](../RISK_POLICY.md) — current adaptive evidence thresholds.
7. [`../REAL_USAGE_LOG.md`](../REAL_USAGE_LOG.md) — conservative real Telegraph/x402 usage ledger.
8. [`../LIVE_EXECUTION.md`](../LIVE_EXECUTION.md) — canonical public execution proof.
9. [`../FINAL_SUBMISSION.md`](../FINAL_SUBMISSION.md) — current submission claims/boundaries.

## Current facts most likely to differ from the old dossier

```text
Current product name:          Auctorail
Current repository:            emmy16-glitch/auctorail
Current Node baseline:         >=24.15.0
Current LOW evidence deadline: 12 seconds
Current tests:                 268 / 268 in latest green snapshot
Current fuzz total:            7400 / 7400 deterministic cases contained
```

The root `package.json` declares Node `>=24.15.0`, `.nvmrc` selects Node 24, and current GitHub Actions workflows run Node 24.

Historical `proofgate.*` protocol identifiers and `ProofGateVendor` artifacts can still remain intentionally for compatibility/provenance.

## Why the binary is not silently replaced

A handoff dossier is itself a historical artifact. Replacing or editing the old binary without a deliberate versioned handoff process would blur what was true at that milestone.

The Markdown documentation set now carries the current maintained project documentation.

If a new formal DOCX dossier is needed later, generate it as a **new Auctorail dossier** from the current documentation rather than overwriting the historical ProofGate artifact.
