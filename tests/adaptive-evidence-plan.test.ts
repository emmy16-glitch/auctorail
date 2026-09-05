import {
  describe,
  expect,
  it
} from "vitest";

import {
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import {
  classifyActionRisk,
  createAdaptiveEvidencePlan
} from "../src/telegraph/adaptive-evidence-plan.js";

const VENDOR =
  "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";

function action(
  amountRaw: string
) {
  return createActionContract({
    type: "payment",
    chainId: 84532,
    token: BASE_SEPOLIA_USDC,
    amountRaw,
    destination: VENDOR,
    reason: "Adaptive evidence test",
    policyId:
      "payments.attested-vendor.v1"
  });
}

describe(
  "adaptive evidence planning",
  () => {
    it(
      "keeps payments through 5 USDC in the low-consequence band with bounded route retries",
      () => {
        const candidate =
          action("5000000");

        const plan =
          createAdaptiveEvidencePlan(
            candidate
          );

        expect(
          classifyActionRisk(candidate)
        ).toBe("LOW");
        expect(plan.riskTier)
          .toBe("LOW");
        expect(
          plan.requirements.map(
            (item) => item.intent
          )
        ).toEqual([
          "FRAUD_DETECTION"
        ]);
        expect(plan.requirements[0].quorum).toEqual({
          minimumDistinctMiners: 1,
          minimumPositiveResults: 1,
          minimumPositiveConfidence: 0.70,
          maxAttempts: 3,
          negativeVetoConfidence: 0.90
        });
        expect(plan.actionHash)
          .toBe(candidate.actionHash);
        expect(plan.maxEvidenceSpendRaw)
          .toBe("35000");
        expect(plan.maxEvidenceLatencyMs)
          .toBe(12000);
      }
    );

    it(
      "escalates payments above 5 through 50 USDC to two distinct fraud Miners plus transaction intelligence",
      () => {
        const plan =
          createAdaptiveEvidencePlan(
            action("5000001")
          );

        expect(plan.riskTier)
          .toBe("MEDIUM");
        expect(
          plan.requirements.map(
            (item) => item.intent
          )
        ).toEqual([
          "FRAUD_DETECTION",
          "ONCHAIN_TX_LOOKUP"
        ]);
        expect(plan.requirements[0].quorum).toEqual({
          minimumDistinctMiners: 2,
          minimumPositiveResults: 2,
          minimumPositiveConfidence: 0.75,
          maxAttempts: 4,
          negativeVetoConfidence: 0.90
        });
        expect(plan.maxEvidenceSpendRaw)
          .toBe("60000");
        expect(plan.maxEvidenceLatencyMs)
          .toBe(60000);
      }
    );

    it(
      "reserves the strongest evidence plan for payments above 50 USDC",
      () => {
        const plan =
          createAdaptiveEvidencePlan(
            action("50000001")
          );

        expect(plan.riskTier)
          .toBe("HIGH");
        expect(
          plan.requirements.map(
            (item) => item.intent
          )
        ).toEqual([
          "FRAUD_DETECTION",
          "ONCHAIN_TX_LOOKUP",
          "WALLET_BALANCE_CHECK"
        ]);
        expect(plan.requirements[0].quorum).toEqual({
          minimumDistinctMiners: 3,
          minimumPositiveResults: 2,
          minimumPositiveConfidence: 0.80,
          maxAttempts: 5,
          negativeVetoConfidence: 0.90
        });
        expect(plan.maxEvidenceSpendRaw)
          .toBe("100000");
        expect(plan.maxEvidenceLatencyMs)
          .toBe(90000);
        expect(plan.providerDiversityRule)
          .toBe("DISTINCT_MINER_IDS");
      }
    );

    it(
      "raises the fraud confidence floor as consequence increases",
      () => {
        const low =
          createAdaptiveEvidencePlan(
            action("5000000")
          );
        const medium =
          createAdaptiveEvidencePlan(
            action("7000000")
          );
        const high =
          createAdaptiveEvidencePlan(
            action("70000000")
          );

        expect(
          low.requirements[0]
            .minimumConfidence
        ).toBe(0.70);
        expect(
          medium.requirements[0]
            .minimumConfidence
        ).toBe(0.75);
        expect(
          high.requirements[0]
            .minimumConfidence
        ).toBe(0.80);
      }
    );
  }
);
