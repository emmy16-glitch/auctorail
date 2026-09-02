import { describe, expect, it } from "vitest";

import {
  BASE_SEPOLIA_USDC
} from "../src/core/action-contract.js";
import {
  evaluatePaymentsAdaptiveV1
} from "../src/policy/payments-adaptive-v1.js";
import {
  createAdaptiveEvidencePlan,
  type AdaptiveEvidencePlan
} from "../src/telegraph/adaptive-evidence-plan.js";
import {
  createEvidenceBundle
} from "../src/telegraph/evidence-bundle.js";
import {
  ADAPTIVE_TEST_AGENT,
  ADAPTIVE_TEST_NOW,
  adaptiveAction,
  adaptiveContext,
  adaptiveEvidence,
  adaptiveMandate
} from "./helpers/adaptive-fixtures.js";

function paid(evidence: ReturnType<typeof adaptiveEvidence>, amountRaw = "10000") {
  return {
    evidence,
    paymentAmountRaw: amountRaw,
    paymentNetwork: "eip155:84532",
    paymentAsset: BASE_SEPOLIA_USDC
  };
}

function decide(
  context: ReturnType<typeof adaptiveContext>
) {
  return evaluatePaymentsAdaptiveV1(
    context.mandate,
    context.action,
    context.plan,
    context.bundle,
    {
      agentId: ADAPTIVE_TEST_AGENT,
      now: ADAPTIVE_TEST_NOW
    }
  );
}

describe("payments.adaptive.v1", () => {
  it("allows complete LOW and HIGH evidence bundles", () => {
    expect(
      decide(
        adaptiveContext("1000000")
      ).decision
    ).toBe("ALLOW");

    expect(
      decide(
        adaptiveContext("7000000")
      ).decision
    ).toBe("ALLOW");
  });

  it("HOLDs when a required medium-risk Intent is missing", () => {
    const action = adaptiveAction("3000000");
    const plan = createAdaptiveEvidencePlan(action);
    const mandate = adaptiveMandate();
    const bundle = createEvidenceBundle(
      action,
      plan,
      [
        paid(
          adaptiveEvidence(
            action,
            "FRAUD_DETECTION"
          )
        )
      ],
      { now: ADAPTIVE_TEST_NOW }
    );

    const decision = evaluatePaymentsAdaptiveV1(
      mandate,
      action,
      plan,
      bundle,
      {
        agentId: ADAPTIVE_TEST_AGENT,
        now: ADAPTIVE_TEST_NOW
      }
    );

    expect(decision.decision).toBe("HOLD");
    expect(decision.reason).toBe(
      "adaptive_required_evidence_missing"
    );
  });

  it("BLOCKs explicit negative evidence instead of averaging it away", () => {
    const context = adaptiveContext(
      "7000000",
      {
        WALLET_BALANCE_CHECK: {
          label: "HIGH_RISK"
        }
      }
    );

    const decision = decide(context);
    expect(decision.decision).toBe("BLOCK");
    expect(decision.reason).toBe(
      "adaptive_explicit_negative"
    );
  });

  it("HOLDs uncertain status labels from secondary Intents", () => {
    const context = adaptiveContext(
      "7000000",
      {
        ONCHAIN_TX_LOOKUP: {
          label: "UNAVAILABLE"
        }
      }
    );

    const decision = decide(context);
    expect(decision.decision).toBe("HOLD");
    expect(decision.reason).toBe(
      "adaptive_secondary_result_uncertain"
    );
  });

  it("HOLDs stale or under-confidence required evidence", () => {
    const stale = adaptiveContext(
      "7000000",
      {
        FRAUD_DETECTION: {
          receivedAt:
            "2026-09-02T17:40:00.000Z"
        }
      }
    );
    expect(decide(stale).decision).toBe("HOLD");
    expect(decide(stale).reason).toBe(
      "adaptive_evidence_stale"
    );

    const weak = adaptiveContext(
      "7000000",
      {
        FRAUD_DETECTION: {
          confidence: 0.79
        }
      }
    );
    expect(decide(weak).decision).toBe("HOLD");
    expect(decide(weak).reason).toBe(
      "adaptive_confidence_below_floor"
    );
  });

  it("BLOCKs total Telegraph evidence spend above the risk-tier budget", () => {
    const action = adaptiveAction("1000000");
    const plan = createAdaptiveEvidencePlan(action);
    const mandate = adaptiveMandate();
    const bundle = createEvidenceBundle(
      action,
      plan,
      [
        paid(
          adaptiveEvidence(
            action,
            "FRAUD_DETECTION"
          ),
          "15001"
        )
      ],
      { now: ADAPTIVE_TEST_NOW }
    );

    const decision = evaluatePaymentsAdaptiveV1(
      mandate,
      action,
      plan,
      bundle,
      {
        agentId: ADAPTIVE_TEST_AGENT,
        now: ADAPTIVE_TEST_NOW
      }
    );

    expect(decision.decision).toBe("BLOCK");
    expect(decision.reason).toBe(
      "adaptive_bundle_integrity_failed"
    );
  });

  it("BLOCKs required Intents that the principal did not delegate", () => {
    const context = adaptiveContext("3000000");
    const mandate = adaptiveMandate({
      requiredIntents: ["FRAUD_DETECTION"]
    });

    const decision = evaluatePaymentsAdaptiveV1(
      mandate,
      context.action,
      context.plan,
      context.bundle,
      {
        agentId: ADAPTIVE_TEST_AGENT,
        now: ADAPTIVE_TEST_NOW
      }
    );

    expect(decision.decision).toBe("BLOCK");
    expect(decision.reason).toBe(
      "adaptive_intent_not_delegated"
    );
  });

  it("BLOCKs a caller-forged risk-tier downgrade plan", () => {
    const action = adaptiveAction("7000000");
    const expected = createAdaptiveEvidencePlan(action);
    const downgraded: AdaptiveEvidencePlan = {
      ...expected,
      riskTier: "LOW",
      requirements: [
        expected.requirements[0]
      ],
      maxEvidenceSpendRaw: "15000",
      maxEvidenceLatencyMs: 15000
    };
    const bundle = createEvidenceBundle(
      action,
      downgraded,
      [
        paid(
          adaptiveEvidence(
            action,
            "FRAUD_DETECTION"
          )
        )
      ],
      { now: ADAPTIVE_TEST_NOW }
    );

    const decision = evaluatePaymentsAdaptiveV1(
      adaptiveMandate(),
      action,
      downgraded,
      bundle,
      {
        agentId: ADAPTIVE_TEST_AGENT,
        now: ADAPTIVE_TEST_NOW
      }
    );

    expect(decision.decision).toBe("BLOCK");
    expect(decision.reason).toBe(
      "adaptive_plan_downgrade_or_mismatch"
    );
  });

  it("BLOCKs a bundle whose cryptographic body was mutated", () => {
    const context = adaptiveContext("7000000");
    const tampered = structuredClone(
      context.bundle
    );
    tampered.items[0].rawResponseHash =
      `0x${"f".repeat(64)}`;

    const decision = evaluatePaymentsAdaptiveV1(
      context.mandate,
      context.action,
      context.plan,
      tampered,
      {
        agentId: ADAPTIVE_TEST_AGENT,
        now: ADAPTIVE_TEST_NOW
      }
    );

    expect(decision.decision).toBe("BLOCK");
    expect(decision.reason).toBe(
      "adaptive_bundle_integrity_failed"
    );
  });
});
