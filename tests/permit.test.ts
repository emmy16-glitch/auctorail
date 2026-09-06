import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import {
  createMandateContract,
  type MandateContract
} from "../src/core/mandate-contract.js";
import {
  loadTelegraphEvidence,
  type TelegraphEvidenceRecord
} from "../src/evidence/telegraph.js";
import {
  evaluatePaymentsStrictV1,
  type DecisionRecord
} from "../src/policy/payments-strict-v1.js";
import { mintPermit, verifyPermit } from "../src/permit/permit.js";

const AGENT = "procurement-agent";
const SECRET = "proofgate-unit-test-secret-" + "a".repeat(64);

function realHoldEvidence(): TelegraphEvidenceRecord {
  return loadTelegraphEvidence(
    path.join(
      process.cwd(),
      "data",
      "evidence",
      "telegraph-2026-09-01T17-00-18-634Z.json"
    )
  );
}

function createAction(destination: string, amountRaw = "5000000") {
  return createActionContract({
    type: "payment",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    amountRaw,
    destination,
    reason: "Invoice INV-1042",
    policyId: "payments.strict.v1"
  });
}

function createMandate(destination: string, overrides: Partial<{ version: number; maxPerActionRaw: string }> = {}) {
  return createMandateContract({
    mandateId: "permit-unit-mandate",
    principalId: "unit-principal",
    agentId: AGENT,
    allowedActionTypes: ["payment"],
    allowedChainIds: [BASE_SEPOLIA_CHAIN_ID],
    allowedAssets: [BASE_SEPOLIA_USDC],
    allowedDestinations: [destination],
    maxPerActionRaw: overrides.maxPerActionRaw ?? "20000000",
    requiredIntents: ["FRAUD_DETECTION"],
    policyId: "payments.strict.v1",
    policyVersion: 1,
    issuedAt: "2026-09-01T00:00:00.000Z",
    expiresAt: "2026-09-08T01:00:00.000Z",
    version: overrides.version ?? 1
  });
}

function unitAllowDecision(
  mandate: MandateContract,
  actionId: string,
  now: Date
): DecisionRecord {
  return {
    mandate: {
      mandateId: mandate.mandateId,
      mandateHash: mandate.mandateHash,
      principalId: mandate.principalId,
      agentId: mandate.agentId,
      version: mandate.version
    },
    agentId: AGENT,
    actionId,
    decision: "ALLOW",
    reason: "all_required_checks_passed",
    policyId: "payments.strict.v1",
    policyVersion: 1,
    checks: [
      {
        name: "unit_test_policy",
        status: "PASS",
        reason: "Cryptographic permit test."
      }
    ],
    decidedAt: now.toISOString()
  };
}

describe("Auctorail exact-action and exact-mandate permits", () => {
  it("does not mint a permit for the real HOLD decision", () => {
    const evidence = realHoldEvidence();
    const action = createAction(evidence.subject);
    const mandate = createMandate(evidence.subject);
    const now = new Date(new Date(evidence.receivedAt).getTime() + 1000);
    const decision = evaluatePaymentsStrictV1(mandate, action, evidence, {
      agentId: AGENT,
      now
    });

    expect(decision.decision).toBe("HOLD");
    expect(() =>
      mintPermit(mandate, action, evidence, decision, SECRET, { now })
    ).toThrow("decision_not_allow");
  });

  it("mints and verifies a permit bound to mandate and exact action", () => {
    const evidence = realHoldEvidence();
    const now = new Date("2026-09-01T18:30:00.000Z");
    const action = createAction(evidence.subject);
    const mandate = createMandate(evidence.subject);
    const decision = unitAllowDecision(mandate, action.id, now);
    const permit = mintPermit(mandate, action, evidence, decision, SECRET, {
      now,
      ttlSeconds: 30
    });

    expect(
      verifyPermit(mandate, permit, action, evidence, decision, SECRET, {
        now: new Date(now.getTime() + 5000)
      })
    ).toEqual({ valid: true, code: "permit_valid" });

    expect(permit.payload.actionHash).toBe(action.actionHash);
    expect(permit.payload.mandateHash).toBe(mandate.mandateHash);
  });

  it("blocks amount mutation with the stable action hash code", () => {
    const evidence = realHoldEvidence();
    const now = new Date("2026-09-01T18:30:00.000Z");
    const approved = createAction(evidence.subject, "5000000");
    const mandate = createMandate(evidence.subject);
    const decision = unitAllowDecision(mandate, approved.id, now);
    const permit = mintPermit(mandate, approved, evidence, decision, SECRET, { now });
    const tampered = createAction(evidence.subject, "15000000");

    expect(
      verifyPermit(mandate, permit, tampered, evidence, decision, SECRET, {
        now: new Date(now.getTime() + 1000)
      }).code
    ).toBe("action_hash_mismatch");
  });

  it("rejects an expired permit", () => {
    const evidence = realHoldEvidence();
    const now = new Date("2026-09-01T18:30:00.000Z");
    const action = createAction(evidence.subject);
    const mandate = createMandate(evidence.subject);
    const decision = unitAllowDecision(mandate, action.id, now);
    const permit = mintPermit(mandate, action, evidence, decision, SECRET, {
      now,
      ttlSeconds: 30
    });

    expect(
      verifyPermit(mandate, permit, action, evidence, decision, SECRET, {
        now: new Date(now.getTime() + 31_000)
      }).code
    ).toBe("permit_expired");
  });

  it("detects evidence or decision mutation", () => {
    const evidence = realHoldEvidence();
    const now = new Date("2026-09-01T18:30:00.000Z");
    const action = createAction(evidence.subject);
    const mandate = createMandate(evidence.subject);
    const decision = unitAllowDecision(mandate, action.id, now);
    const permit = mintPermit(mandate, action, evidence, decision, SECRET, { now });
    const changedEvidence = { ...evidence, signalHash: "0x" + "f".repeat(64) };

    expect(
      verifyPermit(mandate, permit, action, changedEvidence, decision, SECRET, {
        now: new Date(now.getTime() + 1000)
      }).code
    ).toBe("decision_hash_mismatch");
  });

  it("rejects a mandate object whose authority fields were mutated after hashing", () => {
    const evidence = realHoldEvidence();
    const now = new Date("2026-09-01T18:30:00.000Z");
    const action = createAction(evidence.subject);
    const mandate = createMandate(evidence.subject);
    const decision = unitAllowDecision(mandate, action.id, now);
    const permit = mintPermit(mandate, action, evidence, decision, SECRET, { now });
    const tamperedMandate = {
      ...mandate,
      allowedDestinations: [
        "0x1111111111111111111111111111111111111111"
      ]
    };

    expect(
      verifyPermit(
        tamperedMandate,
        permit,
        action,
        evidence,
        decision,
        SECRET,
        { now: new Date(now.getTime() + 1000) }
      ).code
    ).toBe("mandate_integrity_violation");
  });

  it("rejects a different mandate even when the permit signature is valid", () => {
    const evidence = realHoldEvidence();
    const now = new Date("2026-09-01T18:30:00.000Z");
    const action = createAction(evidence.subject);
    const mandate = createMandate(evidence.subject);
    const decision = unitAllowDecision(mandate, action.id, now);
    const permit = mintPermit(mandate, action, evidence, decision, SECRET, { now });
    const otherMandate = createMandate(evidence.subject, { version: 2 });

    expect(
      verifyPermit(otherMandate, permit, action, evidence, decision, SECRET, {
        now: new Date(now.getTime() + 1000)
      }).code
    ).toBe("mandate_hash_mismatch");
  });
});
