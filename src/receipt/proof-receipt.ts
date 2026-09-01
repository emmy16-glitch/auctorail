import { createHash, randomUUID } from "node:crypto";

import {
  canonicalize,
  hashCanonicalPayload,
  type ActionContract
} from "../core/action-contract.js";
import type { TelegraphEvidenceRecord } from "../evidence/telegraph.js";
import type {
  DecisionRecord,
  PolicyCheck
} from "../policy/payments-strict-v1.js";
import type { Permit } from "../permit/permit.js";

export type ReceiptExecutionStatus =
  | "EXECUTED"
  | "FAILED"
  | "AMBIGUOUS"
  | "BLOCKED"
  | "NOT_EXECUTED";

export interface ReceiptExecution {
  status: ReceiptExecutionStatus;
  code: string;
  transactionHash?: string;
  chainId?: number;
  executedAt?: string;
  error?: string;
}

export interface ProofReceipt {
  schemaVersion: "proofgate.receipt.v1";
  receiptId: string;
  operationId?: string;
  action: {
    actionId: string;
    actionHash: string;
    policyId: string;
    canonicalPayload: string;
  };
  evidence: {
    source: "telegraph";
    minerId: string;
    minerName: string;
    subject: string;
    chainId: number;
    label: string | null;
    confidence: number | null;
    applicability: TelegraphEvidenceRecord["applicability"];
    signalHash: string | null;
    rawResponseHash: string;
    receivedAt: string;
  } | null;
  decision: {
    actionId: string;
    decision: DecisionRecord["decision"];
    reason: string;
    policyId: string;
    checks: PolicyCheck[];
    decidedAt: string;
  };
  permit: {
    permitId: string;
    actionHash: string;
    decisionHash: string;
    nonce: string;
    policyId: string;
    issuedAt: string;
    expiresAt: string;
  } | null;
  execution: ReceiptExecution;
  createdAt: string;
  receiptHash: string;
}

export interface CreateProofReceiptInput {
  action: ActionContract;
  evidence: TelegraphEvidenceRecord | null;
  decision: DecisionRecord;
  permit: Permit | null;
  execution: ReceiptExecution;
  operationId?: string;
  now?: Date;
}

function sha256(value: string): string {
  return "0x" + createHash("sha256").update(value, "utf8").digest("hex");
}

function hashReceiptBody(body: Omit<ProofReceipt, "receiptHash">): string {
  return sha256(canonicalize(body));
}

export function createProofReceipt(
  input: CreateProofReceiptInput
): ProofReceipt {
  if (input.decision.actionId !== input.action.id) {
    throw new Error("decision_action_mismatch");
  }

  if (input.decision.policyId !== input.action.policyId) {
    throw new Error("decision_policy_mismatch");
  }

  if (input.permit) {
    if (input.permit.payload.actionHash !== input.action.actionHash) {
      throw new Error("permit_action_mismatch");
    }

    if (input.permit.payload.policyId !== input.decision.policyId) {
      throw new Error("permit_policy_mismatch");
    }
  }

  if (
    input.execution.status === "EXECUTED" &&
    (input.decision.decision !== "ALLOW" || !input.permit)
  ) {
    throw new Error("executed_without_valid_authorization_context");
  }

  const now = input.now ?? new Date();

  const body: Omit<ProofReceipt, "receiptHash"> = {
    schemaVersion: "proofgate.receipt.v1",
    receiptId: randomUUID(),
    ...(input.operationId ? { operationId: input.operationId } : {}),
    action: {
      actionId: input.action.id,
      actionHash: input.action.actionHash,
      policyId: input.action.policyId,
      canonicalPayload: input.action.canonicalPayload
    },
    evidence: input.evidence
      ? {
          source: "telegraph",
          minerId: input.evidence.miner.id,
          minerName: input.evidence.miner.name,
          subject: input.evidence.subject,
          chainId: input.evidence.chainId,
          label: input.evidence.label,
          confidence: input.evidence.confidence,
          applicability: input.evidence.applicability,
          signalHash: input.evidence.signalHash,
          rawResponseHash: input.evidence.rawResponseHash,
          receivedAt: input.evidence.receivedAt
        }
      : null,
    decision: {
      actionId: input.decision.actionId,
      decision: input.decision.decision,
      reason: input.decision.reason,
      policyId: input.decision.policyId,
      checks: input.decision.checks,
      decidedAt: input.decision.decidedAt
    },
    permit: input.permit
      ? {
          permitId: input.permit.payload.permitId,
          actionHash: input.permit.payload.actionHash,
          decisionHash: input.permit.payload.decisionHash,
          nonce: input.permit.payload.nonce,
          policyId: input.permit.payload.policyId,
          issuedAt: input.permit.payload.issuedAt,
          expiresAt: input.permit.payload.expiresAt
        }
      : null,
    execution: input.execution,
    createdAt: now.toISOString()
  };

  return {
    ...body,
    receiptHash: hashReceiptBody(body)
  };
}

export function verifyProofReceipt(receipt: ProofReceipt): boolean {
  const { receiptHash, ...body } = receipt;

  if (receiptHash !== hashReceiptBody(body)) {
    return false;
  }

  if (
    receipt.decision.actionId !== receipt.action.actionId ||
    receipt.decision.policyId !== receipt.action.policyId
  ) {
    return false;
  }

  try {
    const parsedPayload = JSON.parse(receipt.action.canonicalPayload) as unknown;

    if (canonicalize(parsedPayload) !== receipt.action.canonicalPayload) {
      return false;
    }
  } catch {
    return false;
  }

  if (
    hashCanonicalPayload(receipt.action.canonicalPayload) !==
    receipt.action.actionHash
  ) {
    return false;
  }

  if (receipt.permit) {
    if (
      receipt.permit.actionHash !== receipt.action.actionHash ||
      receipt.permit.policyId !== receipt.decision.policyId
    ) {
      return false;
    }
  }

  if (
    receipt.execution.status === "EXECUTED" &&
    (receipt.decision.decision !== "ALLOW" || !receipt.permit)
  ) {
    return false;
  }

  return true;
}
