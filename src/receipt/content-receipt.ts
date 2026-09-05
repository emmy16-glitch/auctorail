import { canonicalize, hashCanonicalPayload } from "../core/action-contract.js";
import type { GeneralActionEnvelope } from "../core/general-action.js";
import type { GeneralAuthorizationDecision } from "../permit/general-permit.js";
import type { ContentEvidenceSignal } from "../policy/content-strict-v1.js";

export interface ContentDecisionReceiptBody {
  schemaVersion: "auctorail.content-receipt.v1";
  receiptId: string;
  subjectHash: string;
  contentKind: "text" | "image";
  proposedAction: "view" | "share" | "publish";
  authorshipClaim: "unspecified" | "human" | "ai-assisted";
  action: {
    schemaVersion: GeneralActionEnvelope["schemaVersion"];
    actionId: string;
    actionHash: string;
    type: string;
    target: string;
    policyId: string;
    policyVersion: number;
    canonicalPayload: string;
  };
  evidence: ContentEvidenceSignal[];
  evidenceCommitmentHash: string;
  decision: {
    schemaVersion: GeneralAuthorizationDecision["schemaVersion"];
    decision: GeneralAuthorizationDecision["decision"];
    reason: string;
    decisionHash: string;
    mandateHash: string;
    actionHash: string;
    policyId: string;
    policyVersion: number;
    evidenceCommitmentHash: string | null;
    checks: GeneralAuthorizationDecision["checks"];
    decidedAt: string;
  };
  summaryLine: string;
  createdAt: string;
}

export interface ContentDecisionReceipt extends ContentDecisionReceiptBody {
  receiptHash: string;
}

function receiptBody(receipt: ContentDecisionReceipt): ContentDecisionReceiptBody {
  const { receiptHash: _receiptHash, ...body } = receipt;
  return body;
}

export function createContentDecisionReceipt(input: {
  receiptId: string;
  subjectHash: string;
  contentKind: "text" | "image";
  proposedAction: "view" | "share" | "publish";
  authorshipClaim: "unspecified" | "human" | "ai-assisted";
  action: GeneralActionEnvelope;
  evidence: ContentEvidenceSignal[];
  evidenceCommitmentHash: string;
  decision: GeneralAuthorizationDecision;
  summaryLine: string;
  now?: Date;
}): ContentDecisionReceipt {
  if (input.decision.actionHash !== input.action.actionHash) {
    throw new Error("content_receipt_action_mismatch");
  }
  if (input.decision.policyId !== input.action.policyId || input.decision.policyVersion !== input.action.policyVersion) {
    throw new Error("content_receipt_policy_mismatch");
  }
  if (input.decision.evidenceCommitmentHash !== input.evidenceCommitmentHash) {
    throw new Error("content_receipt_evidence_mismatch");
  }
  if (hashCanonicalPayload(canonicalize(input.evidence)) !== input.evidenceCommitmentHash) {
    throw new Error("content_receipt_evidence_hash_invalid");
  }
  if (!input.receiptId.trim()) throw new Error("content_receipt_id_invalid");
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.subjectHash)) throw new Error("content_receipt_subject_hash_invalid");
  if (!input.summaryLine.trim()) throw new Error("content_receipt_summary_invalid");

  const body: ContentDecisionReceiptBody = {
    schemaVersion: "auctorail.content-receipt.v1",
    receiptId: input.receiptId,
    subjectHash: input.subjectHash,
    contentKind: input.contentKind,
    proposedAction: input.proposedAction,
    authorshipClaim: input.authorshipClaim,
    action: {
      schemaVersion: input.action.schemaVersion,
      actionId: input.action.id,
      actionHash: input.action.actionHash,
      type: input.action.type,
      target: input.action.target,
      policyId: input.action.policyId,
      policyVersion: input.action.policyVersion,
      canonicalPayload: input.action.canonicalPayload
    },
    evidence: input.evidence,
    evidenceCommitmentHash: input.evidenceCommitmentHash,
    decision: {
      schemaVersion: input.decision.schemaVersion,
      decision: input.decision.decision,
      reason: input.decision.reason,
      decisionHash: input.decision.decisionHash,
      mandateHash: input.decision.mandateHash,
      actionHash: input.decision.actionHash,
      policyId: input.decision.policyId,
      policyVersion: input.decision.policyVersion,
      evidenceCommitmentHash: input.decision.evidenceCommitmentHash,
      checks: input.decision.checks,
      decidedAt: input.decision.decidedAt
    },
    summaryLine: input.summaryLine,
    createdAt: (input.now ?? new Date()).toISOString()
  };

  return {
    ...body,
    receiptHash: hashCanonicalPayload(canonicalize(body))
  };
}

export function verifyContentDecisionReceipt(receipt: ContentDecisionReceipt): boolean {
  try {
    if (receipt.schemaVersion !== "auctorail.content-receipt.v1") return false;
    if (!receipt.receiptId.trim()) return false;
    if (!/^0x[0-9a-fA-F]{64}$/.test(receipt.subjectHash)) return false;
    if (!Number.isFinite(new Date(receipt.createdAt).getTime())) return false;
    if (!Number.isFinite(new Date(receipt.decision.decidedAt).getTime())) return false;
    if (receipt.action.actionHash !== hashCanonicalPayload(receipt.action.canonicalPayload)) return false;
    if (receipt.decision.actionHash !== receipt.action.actionHash) return false;
    if (receipt.decision.policyId !== receipt.action.policyId || receipt.decision.policyVersion !== receipt.action.policyVersion) return false;
    if (receipt.decision.evidenceCommitmentHash !== receipt.evidenceCommitmentHash) return false;
    if (hashCanonicalPayload(canonicalize(receipt.evidence)) !== receipt.evidenceCommitmentHash) return false;
    if (receipt.receiptHash !== hashCanonicalPayload(canonicalize(receiptBody(receipt)))) return false;

    const blocked = receipt.decision.checks.some((item) => item.status === "BLOCK");
    const held = receipt.decision.checks.some((item) => item.status === "HOLD");
    const expected = blocked ? "BLOCK" : held ? "HOLD" : "ALLOW";
    if (receipt.decision.decision !== expected) return false;

    return true;
  } catch {
    return false;
  }
}
