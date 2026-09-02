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
      "uses one intent for low-risk payments",
      () => {
        const candidate =
          action("1000000");

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
        expect(plan.actionHash)
          .toBe(candidate.actionHash);
        expect(plan.maxEvidenceSpendRaw)
          .toBe("15000");
      }
    );

    it(
      "escalates medium-risk payments to two intents",
      () => {
        const plan =
          createAdaptiveEvidencePlan(
            action("5000000")
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
        expect(plan.maxEvidenceSpendRaw)
          .toBe("30000");
      }
    );

    it(
      "escalates high-risk payments to three intents",
      () => {
        const plan =
          createAdaptiveEvidencePlan(
            action("5000001")
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
        expect(plan.maxEvidenceSpendRaw)
          .toBe("50000");
      }
    );

    it(
      "raises the fraud confidence floor as consequence increases",
      () => {
        const low =
          createAdaptiveEvidencePlan(
            action("1000000")
          );
        const medium =
          createAdaptiveEvidencePlan(
            action("1000001")
          );
        const high =
          createAdaptiveEvidencePlan(
            action("9000000")
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
