import { describe, expect, it } from "vitest";

import {
  createAdaptiveEvidencePlan
} from "../src/telegraph/adaptive-evidence-plan.js";
import {
  collectAdaptiveEvidence
} from "../src/telegraph/adaptive-orchestrator.js";
import {
  adaptiveAction,
  adaptiveEvidence
} from "./helpers/adaptive-fixtures.js";

describe("adaptive evidence orchestrator", () => {
  it("collects exactly the Intents required by the risk tier", async () => {
    const action = adaptiveAction("7000000");
    const plan = createAdaptiveEvidencePlan(action);
    const seen: string[] = [];

    const result = await collectAdaptiveEvidence(
      action,
      plan,
      async ({ requirement }) => {
        seen.push(requirement.intent);
        return {
          evidence: adaptiveEvidence(
            action,
            requirement.intent
          ),
          paymentAmountRaw: "10000"
        };
      }
    );

    expect(result.status).toBe("COMPLETE");
    expect(seen).toEqual([
      "FRAUD_DETECTION",
      "ONCHAIN_TX_LOOKUP",
      "WALLET_BALANCE_CHECK"
    ]);
    expect(result.bundle.totalEvidenceSpendRaw).toBe(
      "30000"
    );
  });

  it("fails closed before accepting an over-budget evidence result", async () => {
    const action = adaptiveAction("1000000");
    const plan = createAdaptiveEvidencePlan(action);

    const result = await collectAdaptiveEvidence(
      action,
      plan,
      async ({ requirement }) => ({
        evidence: adaptiveEvidence(
          action,
          requirement.intent
        ),
        paymentAmountRaw: "15001"
      })
    );

    expect(result.status).toBe("HOLD");
    expect(result.code).toBe(
      "adaptive_evidence_budget_exceeded"
    );
    expect(result.bundle.items).toHaveLength(0);
  });

  it("fails closed on routed Intent mismatch or acquisition failure", async () => {
    const action = adaptiveAction("1000000");
    const plan = createAdaptiveEvidencePlan(action);

    const mismatch = await collectAdaptiveEvidence(
      action,
      plan,
      async () => ({
        evidence: adaptiveEvidence(
          action,
          "ONCHAIN_TX_LOOKUP"
        )
      })
    );

    expect(mismatch.status).toBe("HOLD");
    expect(mismatch.error).toContain(
      "routed_intent_mismatch"
    );

    const failed = await collectAdaptiveEvidence(
      action,
      plan,
      async () => {
        throw new Error("provider_unavailable");
      }
    );

    expect(failed.status).toBe("HOLD");
    expect(failed.code).toBe(
      "adaptive_evidence_acquisition_failed"
    );
    expect(failed.error).toBe(
      "provider_unavailable"
    );
  });

  it("enforces the evidence latency deadline", async () => {
    const action = adaptiveAction("1000000");
    const plan = createAdaptiveEvidencePlan(action);
    let calls = 0;
    const start = new Date(
      "2026-09-02T18:00:00.000Z"
    );

    const result = await collectAdaptiveEvidence(
      action,
      plan,
      async ({ requirement }) => ({
        evidence: adaptiveEvidence(
          action,
          requirement.intent
        )
      }),
      {
        now: () => {
          calls++;
          return calls === 1
            ? start
            : new Date(
                start.getTime() +
                plan.maxEvidenceLatencyMs +
                1
              );
        }
      }
    );

    expect(result.status).toBe("HOLD");
    expect(result.code).toBe(
      "adaptive_evidence_deadline_exceeded"
    );
  });
});
