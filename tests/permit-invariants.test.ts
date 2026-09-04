import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import { createMandateContract, type MandateContract } from "../src/core/mandate-contract.js";
import { loadTelegraphEvidence } from "../src/evidence/telegraph.js";
import type { DecisionRecord } from "../src/policy/payments-strict-v1.js";
import { mintPermit, verifyPermit } from "../src/permit/permit.js";

const AGENT = "procurement-agent";
const SECRET = "proofgate-permit-invariant-secret-" + "x".repeat(64);

function evidence() {
  const directory = path.join(process.cwd(), "data", "evidence");
  const file = fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort().at(-1);

  if (!file) {
    throw new Error("real_evidence_missing");
  }

  return loadTelegraphEvidence(path.join(directory, file));
}

function action(destination: string) {
  return createActionContract({
    type: "payment",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    amountRaw: "1000000",
    destination,
    reason: "Invoice INV-1042",
    policyId: "payments.strict.v1"
  });
}

function mandate(destination: string) {
  return createMandateContract({
    mandateId: "permit-invariant-mandate",
    principalId: "unit-principal",
    agentId: AGENT,
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

function allow(mandate: MandateContract, actionId: string, now: Date): DecisionRecord {
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
        reason: "Cryptographic invariant fixture."
      }
    ],
    decidedAt: now.toISOString()
  };
}

describe("permit boundary invariants", () => {
  it("will not mint from an ALLOW decision belonging to another proposal instance", () => {
    const liveEvidence = evidence();
    const first = action(liveEvidence.subject);
    const second = action(liveEvidence.subject);
    const delegated = mandate(liveEvidence.subject);
    const now = new Date("2026-09-01T19:00:00.000Z");

    expect(() =>
      mintPermit(
        delegated,
        second,
        liveEvidence,
        allow(delegated, first.id, now),
        SECRET,
        { now }
      )
    ).toThrow("decision_action_mismatch");
  });

  it("will not mint an ALLOW record containing any non-PASS check", () => {
    const liveEvidence = evidence();
    const proposed = action(liveEvidence.subject);
    const delegated = mandate(liveEvidence.subject);
    const now = new Date("2026-09-01T19:00:00.000Z");
    const decision = allow(delegated, proposed.id, now);

    decision.checks.push({
      name: "minimum_confidence",
      status: "HOLD",
      reason: "Insufficient confidence."
    });

    expect(() =>
      mintPermit(delegated, proposed, liveEvidence, decision, SECRET, { now })
    ).toThrow("decision_not_allow");
  });

  it("rejects a validly signed permit issued too far in the future", () => {
    const liveEvidence = evidence();
    const proposed = action(liveEvidence.subject);
    const delegated = mandate(liveEvidence.subject);
    const issuedAt = new Date("2026-09-01T19:00:10.000Z");
    const decision = allow(delegated, proposed.id, issuedAt);
    const permit = mintPermit(
      delegated,
      proposed,
      liveEvidence,
      decision,
      SECRET,
      { now: issuedAt, ttlSeconds: 30 }
    );

    expect(
      verifyPermit(
        delegated,
        permit,
        proposed,
        liveEvidence,
        decision,
        SECRET,
        { now: new Date("2026-09-01T19:00:00.000Z") }
      )
    ).toEqual({ valid: false, code: "permit_time_invalid" });
  });

  it("will not mint if an ALLOW record is rebound to another mandate", () => {
    const liveEvidence = evidence();
    const proposed = action(liveEvidence.subject);
    const delegated = mandate(liveEvidence.subject);
    const other = createMandateContract({
      ...JSON.parse(delegated.canonicalMandate),
      version: 2
    });
    const now = new Date("2026-09-01T19:00:00.000Z");

    expect(() =>
      mintPermit(
        other,
        proposed,
        liveEvidence,
        allow(delegated, proposed.id, now),
        SECRET,
        { now }
      )
    ).toThrow("mandate_hash_mismatch");
  });
});
