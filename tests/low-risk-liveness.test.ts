import { describe, expect, it } from "vitest";

import {
  createAdaptiveEvidencePlan
} from "../src/telegraph/adaptive-evidence-plan.js";
import {
  collectAdaptiveEvidence,
  RetryableEvidenceAcquisitionError
} from "../src/telegraph/adaptive-orchestrator.js";
import {
  adaptiveAction,
  adaptiveEvidence
} from "./helpers/adaptive-fixtures.js";

describe("low-risk live evidence liveness", () => {
  it("recovers from one unusable Telegraph route without weakening the required evidence", async () => {
    const action = adaptiveAction("5000000");
    const plan = createAdaptiveEvidencePlan(action);
    const attempts: number[] = [];

    const result = await collectAdaptiveEvidence(
      action,
      plan,
      async ({ requirement, attemptNumber = 1 }) => {
        attempts.push(attemptNumber);

        if (attemptNumber === 1) {
          throw new RetryableEvidenceAcquisitionError({
            code: "routed_intent_mismatch",
            detail: "Engine routed the first attempt to the wrong Intent",
            paymentAmountRaw: "10000",
            minerId: "wrong-intent-miner"
          });
        }

        return {
          evidence: adaptiveEvidence(
            action,
            requirement.intent,
            {
              miner: {
                id: "valid-low-risk-miner",
                name: "Valid Low Risk Miner",
                slug: "valid-low-risk-miner"
              },
              confidence: 0.70,
              label: "ALLOW"
            }
          ),
          paymentAmountRaw: "10000",
          paymentNetwork: "eip155:84532",
          paymentAsset: action.payload.token
        };
      }
    );

    expect(plan.riskTier).toBe("LOW");
    expect(plan.requirements).toHaveLength(1);
    expect(plan.requirements[0].intent).toBe("FRAUD_DETECTION");
    expect(plan.requirements[0].minimumConfidence).toBe(0.70);
    expect(plan.requirements[0].quorum.minimumDistinctMiners).toBe(1);
    expect(plan.requirements[0].quorum.maxAttempts).toBe(3);
    expect(attempts).toEqual([1, 2]);
    expect(result.status).toBe("COMPLETE");
    expect(result.completedIntents).toEqual(["FRAUD_DETECTION"]);
    expect(result.rejectedAttempts).toHaveLength(1);
    expect(result.actualEvidenceSpendRaw).toBe("20000");
    expect(result.bundle.items).toHaveLength(1);
    expect(result.bundle.items[0].miner.id).toBe("valid-low-risk-miner");
  });

  it("still HOLDs when all bounded low-risk routes are unusable", async () => {
    const action = adaptiveAction("1000000");
    const plan = createAdaptiveEvidencePlan(action);
    let calls = 0;

    const result = await collectAdaptiveEvidence(
      action,
      plan,
      async ({ attemptNumber = 1 }) => {
        calls++;
        throw new RetryableEvidenceAcquisitionError({
          code: "evidence_subject_not_asserted",
          detail: `attempt ${attemptNumber} omitted exact subject binding`,
          paymentAmountRaw: "0",
          minerId: `unusable-miner-${attemptNumber}`
        });
      }
    );

    expect(calls).toBe(3);
    expect(result.status).toBe("HOLD");
    expect(result.code).toBe("adaptive_evidence_quorum_unsatisfied");
    expect(result.failedIntent).toBe("FRAUD_DETECTION");
    expect(result.bundle.items).toHaveLength(0);
    expect(result.rejectedAttempts).toHaveLength(3);
  });
});
