import { describe, expect, it } from "vitest";

import {
  TELEGRAPH_X402_POLICY,
  classifyPaymentResponseHeader,
  parsePaymentRequiredHeader,
  selectApprovedTelegraphPaymentLane
} from "../src/telegraph/x402-policy.js";

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function validChallenge() {
  return {
    x402Version: 2,
    error: "Payment required",
    accepts: [
      {
        scheme: "exact",
        network: "eip155:84532",
        asset: TELEGRAPH_X402_POLICY.asset,
        amount: "10000",
        payTo: "0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8",
        maxTimeoutSeconds: 60,
        extra: { name: "USDC", version: "2" }
      },
      {
        scheme: "exact",
        network: "solana:example",
        asset: "solana-asset",
        amount: "10000",
        payTo: "solana-payee"
      }
    ]
  };
}

describe("ProofGate x402 payment policy", () => {
  it("accepts only the locked Base Sepolia USDC lane", () => {
    const parsed = parsePaymentRequiredHeader(encode(validChallenge()));
    const decision = selectApprovedTelegraphPaymentLane(parsed);

    expect(decision.approved).toBe(true);
    expect(decision.code).toBe("payment_lane_approved");

    if (decision.approved) {
      expect(decision.lane.network).toBe("eip155:84532");
      expect(decision.lane.amount).toBe("10000");
    }
  });

  it("fails closed instead of switching to another chain", () => {
    const challenge = validChallenge();
    challenge.accepts = challenge.accepts.filter(
      (lane) => lane.network !== "eip155:84532"
    );

    const decision = selectApprovedTelegraphPaymentLane(
      parsePaymentRequiredHeader(encode(challenge))
    );

    expect(decision).toEqual({
      approved: false,
      code: "approved_payment_lane_unavailable"
    });
  });

  it("HOLDs when Telegraph price exceeds the standing payment cap", () => {
    const challenge = validChallenge();
    challenge.accepts[0].amount = "10001";

    const decision = selectApprovedTelegraphPaymentLane(
      parsePaymentRequiredHeader(encode(challenge))
    );

    expect(decision.approved).toBe(false);
    expect(decision.code).toBe("payment_amount_exceeds_policy");
  });

  it("rejects a zero payment recipient", () => {
    const challenge = validChallenge();
    challenge.accepts[0].payTo = "0x0000000000000000000000000000000000000000";

    const decision = selectApprovedTelegraphPaymentLane(
      parsePaymentRequiredHeader(encode(challenge))
    );

    expect(decision.approved).toBe(false);
    expect(decision.code).toBe("payment_recipient_invalid");
  });

  it("classifies the observed facilitator 403 as non-retryable", () => {
    const result = classifyPaymentResponseHeader(
      encode({
        success: false,
        transaction: "",
        errorReason: "insufficient_credits: facilitator returned 403"
      })
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("facilitator_insufficient_credits");
    expect(result.retryable).toBe(false);
  });

  it("distinguishes a generic facilitator 403 from insufficient credits", () => {
    const result = classifyPaymentResponseHeader(
      encode({
        success: false,
        transaction: "",
        errorReason: "facilitator returned 403"
      })
    );

    expect(result.code).toBe("facilitator_forbidden");
    expect(result.retryable).toBe(false);
  });

  it("recognizes successful settlement", () => {
    const result = classifyPaymentResponseHeader(
      encode({
        success: true,
        transaction: "0x" + "1".repeat(64)
      })
    );

    expect(result.success).toBe(true);
    expect(result.code).toBe("payment_settled");
  });
});
