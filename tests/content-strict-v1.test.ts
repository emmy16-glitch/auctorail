import { describe, expect, it } from "vitest";
import { createGeneralAction } from "../src/core/general-action.js";
import { createGeneralMandate } from "../src/core/general-mandate.js";
import {
  evaluateContentStrictV1,
  type ContentEvidenceSignal
} from "../src/policy/content-strict-v1.js";
import {
  createContentDecisionReceipt,
  verifyContentDecisionReceipt
} from "../src/receipt/content-receipt.js";
import { hashCanonicalPayload } from "../src/core/action-contract.js";

const now = new Date("2026-09-05T12:00:00.000Z");
const subjectHash = hashCanonicalPayload("suspicious content");

function setup() {
  const action = createGeneralAction(
    {
      type: "content.check",
      target: `content:${subjectHash}`,
      parameters: {
        contentKind: "text",
        proposedAction: "share",
        authorshipClaim: "unspecified"
      },
      policyId: "content.strict.v1",
      policyVersion: 1
    },
    { id: "content-action-1", now }
  );
  const mandate = createGeneralMandate({
    mandateId: "content-public-check-v1",
    principalId: "auctorail-user",
    agentId: "content-checker",
    allowedActionTypes: ["content.check"],
    allowedTargets: [action.target],
    requiredIntents: ["CONTENT_VERIFICATION"],
    policyId: "content.strict.v1",
    policyVersion: 1,
    status: "ACTIVE",
    issuedAt: new Date(now.getTime() - 60_000).toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    version: 1
  });
  return { action, mandate };
}

function signal(kind: ContentEvidenceSignal["kind"], label: string, confidence: number): ContentEvidenceSignal {
  return {
    source: "telegraph",
    kind,
    minerId: kind === "AI_GENERATED" ? "32" : "102",
    minerName: kind === "AI_GENERATED" ? "ItsAI" : "Telegraph Scam Classifier",
    intent: kind === "AI_GENERATED" ? "AI_DETECTION" : "CONTENT_VERIFICATION",
    label,
    confidence,
    subjectHash,
    signalHash: hashCanonicalPayload(`${kind}:${label}:${confidence}`),
    receivedAt: now.toISOString()
  };
}

describe("content.strict.v1", () => {
  it("allows text when required scam evidence passes", () => {
    const { action, mandate } = setup();
    const result = evaluateContentStrictV1({
      mandate,
      action,
      agentId: "content-checker",
      contentKind: "text",
      proposedAction: "share",
      authorshipClaim: "unspecified",
      subjectHash,
      signals: [signal("SCAM", "likely_safe", 0.92), signal("AI_GENERATED", "ai_generated", 0.88)],
      now
    });
    expect(result.decision.decision).toBe("ALLOW");
    expect(result.summaryLine).toContain("ALLOW");
  });

  it("blocks strong scam evidence", () => {
    const { action, mandate } = setup();
    const result = evaluateContentStrictV1({
      mandate,
      action,
      agentId: "content-checker",
      contentKind: "text",
      proposedAction: "share",
      authorshipClaim: "unspecified",
      subjectHash,
      signals: [signal("SCAM", "scam", 0.94)],
      now
    });
    expect(result.decision.decision).toBe("BLOCK");
    expect(result.decision.reason).toBe("scam_signal_block");
  });

  it("does not block AI-written text by itself", () => {
    const { action, mandate } = setup();
    const result = evaluateContentStrictV1({
      mandate,
      action,
      agentId: "content-checker",
      contentKind: "text",
      proposedAction: "share",
      authorshipClaim: "unspecified",
      subjectHash,
      signals: [signal("SCAM", "likely_safe", 0.9), signal("AI_GENERATED", "ai_generated", 0.99)],
      now
    });
    expect(result.decision.decision).toBe("ALLOW");
  });

  it("blocks a strong AI finding only when publication claims human authorship", () => {
    const { action, mandate } = setup();
    const result = evaluateContentStrictV1({
      mandate,
      action,
      agentId: "content-checker",
      contentKind: "text",
      proposedAction: "publish",
      authorshipClaim: "human",
      subjectHash,
      signals: [signal("SCAM", "likely_safe", 0.9), signal("AI_GENERATED", "ai_generated", 0.96)],
      now
    });
    expect(result.decision.decision).toBe("BLOCK");
    expect(result.decision.reason).toBe("human_authorship_claim_conflict");
  });

  it("holds when required evidence is missing", () => {
    const { action, mandate } = setup();
    const result = evaluateContentStrictV1({
      mandate,
      action,
      agentId: "content-checker",
      contentKind: "text",
      proposedAction: "view",
      authorshipClaim: "unspecified",
      subjectHash,
      signals: [],
      now
    });
    expect(result.decision.decision).toBe("HOLD");
  });

  it("rejects evidence bound to different content", () => {
    const { action, mandate } = setup();
    const wrong = signal("SCAM", "likely_safe", 0.92);
    wrong.subjectHash = hashCanonicalPayload("other content");
    const result = evaluateContentStrictV1({
      mandate,
      action,
      agentId: "content-checker",
      contentKind: "text",
      proposedAction: "view",
      authorshipClaim: "unspecified",
      subjectHash,
      signals: [wrong],
      now
    });
    expect(result.decision.decision).toBe("BLOCK");
    expect(result.decision.reason).toBe("content_evidence_subject_mismatch");
  });

  it("creates a receipt whose share summary is covered by the receipt hash", () => {
    const { action, mandate } = setup();
    const result = evaluateContentStrictV1({
      mandate,
      action,
      agentId: "content-checker",
      contentKind: "text",
      proposedAction: "share",
      authorshipClaim: "unspecified",
      subjectHash,
      signals: [signal("SCAM", "likely_safe", 0.92)],
      now
    });
    const receipt = createContentDecisionReceipt({
      receiptId: "content-receipt-1",
      subjectHash,
      contentKind: "text",
      proposedAction: "share",
      authorshipClaim: "unspecified",
      action,
      evidence: result.signals,
      evidenceCommitmentHash: result.evidenceCommitmentHash,
      decision: result.decision,
      summaryLine: result.summaryLine,
      now
    });
    expect(verifyContentDecisionReceipt(receipt)).toBe(true);
    expect(verifyContentDecisionReceipt({ ...receipt, summaryLine: "tampered" })).toBe(false);
  });
});
