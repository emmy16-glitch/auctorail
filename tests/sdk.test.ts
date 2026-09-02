import { describe, expect, it } from "vitest";

import {
  createAdaptivePaymentMandate,
  evaluatePaymentAuthorization,
  mintPaymentPermit,
  planPaymentAuthorization
} from "../src/sdk/proofgate.js";
import {
  createEvidenceBundle
} from "../src/telegraph/evidence-bundle.js";
import {
  adaptiveEvidence
} from "./helpers/adaptive-fixtures.js";

describe("ProofGate developer SDK", () => {
  it("plans risk automatically from a developer payment proposal", () => {
    const planned = planPaymentAuthorization({
      amountRaw: "7000000",
      destination:
        "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
      reason: "External agent purchase"
    });

    expect(planned.action.policyId).toBe(
      "payments.adaptive.v1"
    );
    expect(planned.plan.riskTier).toBe("HIGH");
    expect(
      planned.plan.requirements.map(
        (item) => item.intent
      )
    ).toEqual([
      "FRAUD_DETECTION",
      "ONCHAIN_TX_LOOKUP",
      "WALLET_BALANCE_CHECK"
    ]);
  });

  it("lets a host evaluate and mint authority without giving ProofGate direct execution power", () => {
    const now = new Date(
      "2026-09-02T18:00:00.000Z"
    );
    const planned = planPaymentAuthorization({
      amountRaw: "1000000",
      destination:
        "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
      reason: "SDK authorization"
    });
    const mandate = createAdaptivePaymentMandate({
      mandateId: "sdk-mandate",
      principalId: "sdk-principal",
      agentId: "sdk-agent",
      allowedDestinations: [
        planned.action.payload.destination
      ],
      maxPerActionRaw: "10000000",
      requiredIntents: [
        "FRAUD_DETECTION",
        "ONCHAIN_TX_LOOKUP",
        "WALLET_BALANCE_CHECK"
      ],
      status: "ACTIVE",
      issuedAt:
        "2026-09-02T17:00:00.000Z",
      expiresAt:
        "2026-09-02T20:00:00.000Z",
      version: 1
    });
    const bundle = createEvidenceBundle(
      planned.action,
      planned.plan,
      planned.plan.requirements.map(
        (requirement) => ({
          evidence: adaptiveEvidence(
            planned.action,
            requirement.intent
          ),
          paymentAmountRaw: "10000"
        })
      ),
      { now }
    );

    const result = evaluatePaymentAuthorization({
      mandate,
      action: planned.action,
      plan: planned.plan,
      bundle,
      agentId: "sdk-agent",
      now
    });

    expect(result.decision.decision).toBe("ALLOW");
    expect(result.counterfactual).toBeNull();
    expect(result.evidenceBundleHash).toBe(
      bundle.bundleHash
    );

    const permit = mintPaymentPermit({
      mandate,
      action: planned.action,
      bundle,
      decision: result.decision,
      signer:
        "sdk-test-secret-" +
        "x".repeat(64),
      now,
      ttlSeconds: 30
    });

    expect(permit.payload.actionHash).toBe(
      planned.action.actionHash
    );
  });

  it("returns a deterministic counterfactual for incomplete evidence", () => {
    const now = new Date(
      "2026-09-02T18:00:00.000Z"
    );
    const planned = planPaymentAuthorization({
      amountRaw: "3000000",
      destination:
        "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
      reason: "SDK hold"
    });
    const mandate = createAdaptivePaymentMandate({
      mandateId: "sdk-hold",
      principalId: "sdk-principal",
      agentId: "sdk-agent",
      allowedDestinations: [
        planned.action.payload.destination
      ],
      maxPerActionRaw: "10000000",
      requiredIntents: [
        "FRAUD_DETECTION",
        "ONCHAIN_TX_LOOKUP",
        "WALLET_BALANCE_CHECK"
      ],
      status: "ACTIVE",
      issuedAt:
        "2026-09-02T17:00:00.000Z",
      expiresAt:
        "2026-09-02T20:00:00.000Z",
      version: 1
    });
    const partial = createEvidenceBundle(
      planned.action,
      planned.plan,
      [
        {
          evidence: adaptiveEvidence(
            planned.action,
            "FRAUD_DETECTION"
          ),
          paymentAmountRaw: "10000"
        }
      ],
      { now }
    );

    const result = evaluatePaymentAuthorization({
      mandate,
      action: planned.action,
      plan: planned.plan,
      bundle: partial,
      agentId: "sdk-agent",
      now
    });

    expect(result.decision.decision).toBe("HOLD");
    expect(result.counterfactual).toContain(
      "Required ONCHAIN_TX_LOOKUP evidence is missing"
    );
  });
});
