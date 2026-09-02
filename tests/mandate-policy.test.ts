import { describe, expect, it } from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import { createMandateContract } from "../src/core/mandate-contract.js";
import { normalizeTelegraphEvidence } from "../src/evidence/telegraph.js";
import { evaluatePaymentsStrictV1 } from "../src/policy/payments-strict-v1.js";

const VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const OTHER = "0x1111111111111111111111111111111111111111";
const NOW = new Date("2026-09-01T20:00:01.000Z");

function action() {
  return createActionContract({
    type: "payment",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    amountRaw: "1000000",
    destination: VENDOR,
    reason: "Invoice INV-1042",
    policyId: "payments.strict.v1"
  });
}

function mandate(destination = VENDOR) {
  return createMandateContract({
    mandateId: "treasury-demo-v1",
    principalId: "company-demo",
    agentId: "procurement-agent",
    allowedActionTypes: ["payment"],
    allowedChainIds: [BASE_SEPOLIA_CHAIN_ID],
    allowedAssets: [BASE_SEPOLIA_USDC],
    allowedDestinations: [destination],
    maxPerActionRaw: "10000000",
    requiredIntents: ["FRAUD_DETECTION"],
    policyId: "payments.strict.v1",
    policyVersion: 1,
    issuedAt: "2026-09-01T00:00:00.000Z",
    expiresAt: "2026-09-08T01:00:00.000Z",
    version: 1
  });
}

function strongAllowEvidence() {
  return normalizeTelegraphEvidence({
    source: "telegraph",
    intent: "FRAUD_DETECTION",
    miner: { id: "unit", name: "Unit Miner", slug: "unit-miner" },
    request: { endpoint: "/assess", target: VENDOR, chainId: BASE_SEPOLIA_CHAIN_ID },
    result: {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      confidence: 0.99,
      subject: VENDOR,
      verdict: "ALLOW",
      signals: [{ key: "isContract", present: true }]
    },
    telegraph: {
      signalHash: "0x" + "a".repeat(64),
      costUsd: 0.01,
      durationMs: 100,
      timestamp: "2026-09-01T20:00:00.000Z"
    },
    capturedAt: {
      startedAt: "2026-09-01T19:59:59.000Z",
      finishedAt: "2026-09-01T20:00:00.000Z"
    },
    rawResponse: { fixture: true }
  });
}

describe("Mandate + standing policy + Telegraph precedence", () => {
  it("does not let strong Telegraph ALLOW override a mandate destination violation", () => {
    const decision = evaluatePaymentsStrictV1(
      mandate(OTHER),
      action(),
      strongAllowEvidence(),
      { agentId: "procurement-agent", now: NOW }
    );

    expect(decision.decision).toBe("BLOCK");
    expect(decision.reason).toBe("mandate_destination_violation");
  });

  it("returns BLOCK, not HOLD, when mandate is violated and Telegraph is missing", () => {
    const decision = evaluatePaymentsStrictV1(
      mandate(OTHER),
      action(),
      null,
      { agentId: "procurement-agent", now: NOW }
    );

    expect(decision.decision).toBe("BLOCK");
    expect(decision.reason).toBe("mandate_destination_violation");
    expect(decision.checks.find((item) => item.name === "telegraph_evidence")?.status).toBe("HOLD");
  });

  it("returns HOLD when mandate is valid but Telegraph is unavailable", () => {
    const decision = evaluatePaymentsStrictV1(
      mandate(),
      action(),
      null,
      { agentId: "procurement-agent", now: NOW }
    );

    expect(decision.decision).toBe("HOLD");
    expect(decision.reason).toBe("telegraph_evidence");
  });
});
