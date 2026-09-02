import { describe, expect, it } from "vitest";

import {
  canonicalize,
  hashCanonicalPayload
} from "../src/core/action-contract.js";
import {
  createAdaptiveEvidencePlan
} from "../src/telegraph/adaptive-evidence-plan.js";
import {
  createEvidenceBundle,
  verifyEvidenceBundle,
  type EvidenceBundle
} from "../src/telegraph/evidence-bundle.js";
import {
  adaptiveAction,
  adaptiveEvidence
} from "./helpers/adaptive-fixtures.js";

describe("adaptive EvidenceBundle", () => {
  it("creates a deterministic tamper-evident bundle", () => {
    const action = adaptiveAction("3000000");
    const plan = createAdaptiveEvidencePlan(action);
    const inputs = plan.requirements.map(
      (requirement) => ({
        evidence:
          adaptiveEvidence(
            action,
            requirement.intent
          ),
        paymentAmountRaw: "10000"
      })
    );

    const first = createEvidenceBundle(
      action,
      plan,
      inputs,
      {
        now: new Date(
          "2026-09-02T18:00:00.000Z"
        )
      }
    );
    const second = createEvidenceBundle(
      action,
      plan,
      [...inputs].reverse(),
      {
        now: new Date(
          "2026-09-02T18:00:00.000Z"
        )
      }
    );

    expect(first.bundleHash).toBe(
      second.bundleHash
    );
    expect(first.totalEvidenceSpendRaw).toBe(
      "20000"
    );
    expect(verifyEvidenceBundle(first)).toBe(true);
  });

  it("rejects duplicate Intent evidence", () => {
    const action = adaptiveAction("3000000");
    const plan = createAdaptiveEvidencePlan(action);
    const evidence = adaptiveEvidence(
      action,
      "FRAUD_DETECTION"
    );

    expect(() =>
      createEvidenceBundle(
        action,
        plan,
        [
          { evidence },
          { evidence }
        ]
      )
    ).toThrow(/duplicate_evidence_intent/);
  });

  it("rejects exact subject and chain substitution", () => {
    const action = adaptiveAction("1000000");
    const plan = createAdaptiveEvidencePlan(action);

    expect(() =>
      createEvidenceBundle(
        action,
        plan,
        [
          {
            evidence: adaptiveEvidence(
              action,
              "FRAUD_DETECTION",
              {
                subject:
                  "0x1111111111111111111111111111111111111111"
              }
            )
          }
        ]
      )
    ).toThrow("evidence_bundle_subject_mismatch");

    expect(() =>
      createEvidenceBundle(
        action,
        plan,
        [
          {
            evidence: adaptiveEvidence(
              action,
              "FRAUD_DETECTION",
              { chainId: 1 }
            )
          }
        ]
      )
    ).toThrow("evidence_bundle_chain_mismatch");
  });

  it("detects item and total-spend tampering", () => {
    const action = adaptiveAction("1000000");
    const plan = createAdaptiveEvidencePlan(action);
    const bundle = createEvidenceBundle(
      action,
      plan,
      [
        {
          evidence: adaptiveEvidence(
            action,
            "FRAUD_DETECTION"
          ),
          paymentAmountRaw: "10000"
        }
      ]
    );

    const itemTamper = structuredClone(bundle);
    itemTamper.items[0].signalHash =
      `0x${"f".repeat(64)}`;
    expect(
      verifyEvidenceBundle(itemTamper)
    ).toBe(false);

    const spendTamper = structuredClone(bundle);
    spendTamper.totalEvidenceSpendRaw = "1";
    const {
      bundleHash: _oldHash,
      ...body
    } = spendTamper;
    spendTamper.bundleHash = hashCanonicalPayload(
      canonicalize(body)
    );

    expect(
      verifyEvidenceBundle(
        spendTamper as EvidenceBundle
      )
    ).toBe(false);
  });
});
