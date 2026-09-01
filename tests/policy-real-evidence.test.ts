import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import { createMandateContract } from "../src/core/mandate-contract.js";
import { loadTelegraphEvidence } from "../src/evidence/telegraph.js";
import { evaluatePaymentsStrictV1 } from "../src/policy/payments-strict-v1.js";

const AGENT = "procurement-agent";

function latestEvidenceFile(): string {
  const directory = path.join(process.cwd(), "data", "evidence");
  const files = fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort();

  if (files.length === 0) {
    throw new Error("No real Telegraph evidence files found.");
  }

  return path.join(directory, files[files.length - 1]);
}

describe("payments.strict.v1 with REAL Telegraph evidence", () => {
  it("HOLDs even when Miner says ALLOW if evidence is insufficient", () => {
    const evidence = loadTelegraphEvidence(latestEvidenceFile());
    const action = createActionContract({
      type: "payment",
      chainId: BASE_SEPOLIA_CHAIN_ID,
      token: BASE_SEPOLIA_USDC,
      amountRaw: "5000000",
      destination: evidence.subject,
      reason: "Invoice INV-1042",
      policyId: "payments.strict.v1"
    });
    const mandate = createMandateContract({
      mandateId: "real-evidence-test-mandate",
      principalId: "unit-principal",
      agentId: AGENT,
      allowedActionTypes: ["payment"],
      allowedChainIds: [BASE_SEPOLIA_CHAIN_ID],
      allowedAssets: [BASE_SEPOLIA_USDC],
      allowedDestinations: [evidence.subject],
      maxPerActionRaw: "10000000",
      requiredIntents: ["FRAUD_DETECTION"],
      policyId: "payments.strict.v1",
      issuedAt: "2026-09-01T00:00:00.000Z",
      expiresAt: "2026-09-08T01:00:00.000Z",
      version: 1
    });
    const now = new Date(new Date(evidence.receivedAt).getTime() + 1000);
    const decision = evaluatePaymentsStrictV1(mandate, action, evidence, {
      agentId: AGENT,
      now
    });

    expect(evidence.label).toBe("ALLOW");
    expect(decision.decision).toBe("HOLD");
    expect(evidence.confidence).toBe(0.5);
    expect(evidence.applicability).toBe("NOT_APPLICABLE");
    expect(
      decision.checks.find((item) => item.name === "evidence_applicability")?.status
    ).toBe("HOLD");
    expect(
      decision.checks.find((item) => item.name === "minimum_confidence")?.status
    ).toBe("HOLD");
    expect(
      decision.checks.find((item) => item.name === "telegraph_signal_hash")?.status
    ).toBe("PASS");
    expect(
      decision.checks.filter((item) => item.name.startsWith("mandate_")).every((item) => item.status === "PASS")
    ).toBe(true);
  });
});
