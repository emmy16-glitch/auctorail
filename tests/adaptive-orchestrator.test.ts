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

describe("adaptive evidence orchestrator", () => {
  it("collects the routed attempts required by the high-risk quorum", async () => {
    const action = adaptiveAction("7000000");
    const plan = createAdaptiveEvidencePlan(action);
    const seen: string[] = [];

    const result = await collectAdaptiveEvidence(
      action,
      plan,
      async ({ requirement, attemptNumber = 1 }) => {
        seen.push(
          `${requirement.intent}:${attemptNumber}`
        );
        return {
          evidence: adaptiveEvidence(
            action,
            requirement.intent,
            {
              miner: {
                id: `${requirement.intent}-miner-${attemptNumber}`,
                name: `${requirement.intent} Miner ${attemptNumber}`,
                slug: `${requirement.intent.toLowerCase()}-miner-${attemptNumber}`
              }
            }
          ),
          paymentAmountRaw: "10000"
        };
      }
    );

    expect(result.status).toBe("COMPLETE");
    expect(seen).toEqual([
      "FRAUD_DETECTION:1",
      "FRAUD_DETECTION:2",
      "FRAUD_DETECTION:3",
      "ONCHAIN_TX_LOOKUP:1",
      "WALLET_BALANCE_CHECK:1"
    ]);
    expect(result.bundle.totalEvidenceSpendRaw).toBe(
      "50000"
    );
    expect(
      result.bundle.quorums.find(
        (item) => item.intent === "FRAUD_DETECTION"
      )?.distinctMinerIds
    ).toHaveLength(3);
  });

  it("continues after free schema-poor evidence without counting it as a quorum vote", async () => {
    const action = adaptiveAction("7000000");
    const plan = createAdaptiveEvidencePlan(action);
    const seen: string[] = [];

    const result = await collectAdaptiveEvidence(
      action,
      plan,
      async ({ requirement, attemptNumber = 1 }) => {
        seen.push(
          `${requirement.intent}:${attemptNumber}`
        );

        if (
          requirement.intent === "FRAUD_DETECTION" &&
          attemptNumber === 1
        ) {
          throw new RetryableEvidenceAcquisitionError({
            code: "evidence_chain_not_asserted",
            detail: "test Miner named the subject but omitted chain",
            paymentAmountRaw: "0",
            artifactPath: "data/evidence/adaptive/rejected/test.json",
            minerId: "schema-poor-miner"
          });
        }

        return {
          evidence: adaptiveEvidence(
            action,
            requirement.intent,
            {
              miner: {
                id: `${requirement.intent}-miner-${attemptNumber}`,
                name: `${requirement.intent} Miner ${attemptNumber}`,
                slug: `${requirement.intent.toLowerCase()}-miner-${attemptNumber}`
              }
            }
          )
        };
      }
    );

    expect(result.status).toBe("COMPLETE");
    expect(seen.slice(0, 4)).toEqual([
      "FRAUD_DETECTION:1",
      "FRAUD_DETECTION:2",
      "FRAUD_DETECTION:3",
      "FRAUD_DETECTION:4"
    ]);

    const fraudItems = result.bundle.items.filter(
      (item) => item.intent === "FRAUD_DETECTION"
    );
    expect(fraudItems.map((item) => item.attempt)).toEqual([
      2,
      3,
      4
    ]);
    expect(
      result.bundle.quorums.find(
        (item) => item.intent === "FRAUD_DETECTION"
      )?.distinctMinerIds
    ).toHaveLength(3);
  });

  it("does not automatically buy another response after paid unusable evidence", async () => {
    const action = adaptiveAction("3000000");
    const plan = createAdaptiveEvidencePlan(action);
    let calls = 0;

    const result = await collectAdaptiveEvidence(
      action,
      plan,
      async () => {
        calls++;
        throw new RetryableEvidenceAcquisitionError({
          code: "evidence_chain_not_asserted",
          detail: "paid Miner omitted chain",
          paymentAmountRaw: "10000",
          artifactPath: "data/evidence/adaptive/rejected/paid.json",
          minerId: "paid-schema-poor-miner"
        });
      }
    );

    expect(calls).toBe(1);
    expect(result.status).toBe("HOLD");
    expect(result.code).toBe(
      "adaptive_evidence_acquisition_failed"
    );
    expect(result.error).toContain(
      "paid_unusable_evidence_not_retried"
    );
  });

  it("does not count repeated routing to the same Miner as independent diversity", async () => {
    const action = adaptiveAction("3000000");
    const plan = createAdaptiveEvidencePlan(action);

    const result = await collectAdaptiveEvidence(
      action,
      plan,
      async ({ requirement }) => ({
        evidence: adaptiveEvidence(
          action,
          requirement.intent,
          {
            miner: {
              id: "same-miner",
              name: "Same Miner",
              slug: "same-miner"
            }
          }
        )
      })
    );

    expect(result.status).toBe("HOLD");
    expect(result.code).toBe(
      "adaptive_evidence_quorum_unsatisfied"
    );
    expect(result.failedIntent).toBe(
      "FRAUD_DETECTION"
    );
    const fraud = result.bundle.quorums.find(
      (item) => item.intent === "FRAUD_DETECTION"
    );
    expect(fraud?.distinctMinerIds).toEqual([
      "same-miner"
    ]);
    expect(fraud?.duplicateMinerAttempts).toBe(3);
  });

  it("stops immediately on a high-confidence negative veto", async () => {
    const action = adaptiveAction("7000000");
    const plan = createAdaptiveEvidencePlan(action);
    let calls = 0;

    const result = await collectAdaptiveEvidence(
      action,
      plan,
      async ({ requirement, attemptNumber = 1 }) => {
        calls++;
        return {
          evidence: adaptiveEvidence(
            action,
            requirement.intent,
            {
              miner: {
                id: `veto-miner-${attemptNumber}`,
                name: `Veto Miner ${attemptNumber}`,
                slug: `veto-miner-${attemptNumber}`
              },
              ...(attemptNumber === 2
                ? {
                    label: "MALICIOUS",
                    confidence: 0.97
                  }
                : {})
            }
          )
        };
      }
    );

    expect(result.status).toBe("BLOCKED");
    expect(result.code).toBe(
      "adaptive_evidence_negative_veto"
    );
    expect(calls).toBe(2);
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
