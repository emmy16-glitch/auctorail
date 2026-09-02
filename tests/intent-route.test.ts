import { describe, expect, it } from "vitest";

import {
  createAdaptiveEvidencePlan
} from "../src/telegraph/adaptive-evidence-plan.js";
import {
  activeMinersForIntent,
  describeIntentCoverage,
  missingIntentCoverage,
  servingMinerSupportsIntent
} from "../src/telegraph/intent-route.js";
import {
  adaptiveAction
} from "./helpers/adaptive-fixtures.js";

const miners = [
  {
    id: 1,
    name: "Fraud A",
    slug: "fraud-a",
    activation_status: "active",
    supported_intents: ["FRAUD_DETECTION"]
  },
  {
    id: 2,
    name: "Multi B",
    slug: "multi-b",
    activation_status: "active",
    supported_intents: [
      "FRAUD_DETECTION",
      "ONCHAIN_TX_LOOKUP",
      "WALLET_BALANCE_CHECK"
    ]
  },
  {
    id: 3,
    name: "Inactive",
    slug: "inactive",
    activation_status: "inactive",
    supported_intents: ["WALLET_BALANCE_CHECK"]
  }
];

describe("provider-neutral Intent routing helpers", () => {
  it("discovers active coverage without pinning a provider", () => {
    expect(
      activeMinersForIntent(
        miners,
        "FRAUD_DETECTION"
      ).map((item) => item.slug)
    ).toEqual(["fraud-a", "multi-b"]);
  });

  it("reports coverage for every risk-required Intent", () => {
    const plan = createAdaptiveEvidencePlan(
      adaptiveAction("7000000")
    );
    const coverage = describeIntentCoverage(
      miners,
      plan
    );

    expect(coverage).toHaveLength(3);
    expect(
      coverage.find(
        (item) =>
          item.intent === "WALLET_BALANCE_CHECK"
      )?.activeMinerCount
    ).toBe(1);
    expect(
      missingIntentCoverage(miners, plan)
    ).toEqual([]);
  });

  it("fails closed when a required Intent has no active Miner", () => {
    const plan = createAdaptiveEvidencePlan(
      adaptiveAction("7000000")
    );
    const limited = miners.filter(
      (item) => item.slug !== "multi-b"
    );

    expect(
      missingIntentCoverage(limited, plan)
    ).toEqual([
      "ONCHAIN_TX_LOOKUP",
      "WALLET_BALANCE_CHECK"
    ]);
  });

  it("checks the Miner actually routed by Telegraph against the exact Intent", () => {
    expect(
      servingMinerSupportsIntent(
        miners[1],
        "ONCHAIN_TX_LOOKUP"
      )
    ).toBe(true);
    expect(
      servingMinerSupportsIntent(
        miners[0],
        "ONCHAIN_TX_LOOKUP"
      )
    ).toBe(false);
  });
});
