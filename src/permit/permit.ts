import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "node:crypto";

import {
  canonicalize,
  type ActionContract
} from "../core/action-contract.js";
import {
  evaluateMandate,
  type MandateContract,
  type MandateViolationCode
} from "../core/mandate-contract.js";
import type { TelegraphEvidenceRecord } from "../evidence/telegraph.js";
import type { DecisionRecord } from "../policy/payments-strict-v1.js";
import { createDecisionHash } from "./decision-hash.js";

export interface PermitPayload {
  permitId: string;
  mandateHash: string;
  actionHash: string;
  decisionHash: string;
  nonce: string;
  policyId: "payments.strict.v1";
  issuedAt: string;
  expiresAt: string;
}

export interface Permit {
  payload: PermitPayload;
  signature: string;
}

export type PermitVerificationCode =
  | "permit_valid"
  | "invalid_permit_signature"
  | "mandate_hash_mismatch"
  | MandateViolationCode
  | "action_hash_mismatch"
  | "decision_hash_mismatch"
  | "decision_action_mismatch"
  | "policy_id_mismatch"
  | "evidence_binding_mismatch"
  | "permit_time_invalid"
  | "permit_expired"
  | "decision_not_allow";

export interface PermitVerificationResult {
  valid: boolean;
  code: PermitVerificationCode;
}

function requireStrongSecret(secret: string): void {
  if (!secret || secret.length < 32) {
    throw new Error("PROOFGATE_SECRET must contain at least 32 characters");
  }
}

function signPermitPayload(payload: PermitPayload, secret: string): string {
  requireStrongSecret(secret);

  return (
    "0x" +
    createHmac("sha256", secret)
      .update(canonicalize(payload), "utf8")
      .digest("hex")
  );
}

function safeSignatureEqual(supplied: string, expected: string): boolean {
  try {
    if (
      !/^0x[0-9a-fA-F]{64}$/.test(supplied) ||
      !/^0x[0-9a-fA-F]{64}$/.test(expected)
    ) {
      return false;
    }

    const a = Buffer.from(supplied.slice(2), "hex");
    const b = Buffer.from(expected.slice(2), "hex");

    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function evidenceMatchesAction(
  action: ActionContract,
  evidence: TelegraphEvidenceRecord
): boolean {
  return (
    /^0x[0-9a-fA-F]{40}$/.test(evidence.subject) &&
    evidence.subject.toLowerCase() === action.payload.destination.toLowerCase() &&
    evidence.chainId === action.payload.chainId
  );
}

function decisionMatchesMandate(
  mandate: MandateContract,
  decision: DecisionRecord
): boolean {
  return (
    decision.mandate.mandateId === mandate.mandateId &&
    decision.mandate.mandateHash === mandate.mandateHash &&
    decision.mandate.principalId === mandate.principalId &&
    decision.mandate.agentId === mandate.agentId &&
    decision.mandate.version === mandate.version
  );
}

function decisionIsInternallyAllowing(
  mandate: MandateContract,
  action: ActionContract,
  decision: DecisionRecord
): boolean {
  return (
    decision.decision === "ALLOW" &&
    decision.actionId === action.id &&
    decision.policyId === action.policyId &&
    decision.agentId === mandate.agentId &&
    decisionMatchesMandate(mandate, decision) &&
    decision.checks.length > 0 &&
    decision.checks.every((item) => item.status === "PASS")
  );
}

function validatePermitTimes(
  permit: Permit,
  now: Date
): PermitVerificationCode | null {
  const issuedAt = new Date(permit.payload.issuedAt).getTime();
  const expiresAt = new Date(permit.payload.expiresAt).getTime();

  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= issuedAt
  ) {
    return "permit_time_invalid";
  }

  if (issuedAt > now.getTime() + 5_000) {
    return "permit_time_invalid";
  }

  if (now.getTime() >= expiresAt) {
    return "permit_expired";
  }

  return null;
}

function firstMandateFailure(
  mandate: MandateContract,
  action: ActionContract,
  agentId: string,
  now: Date
): MandateViolationCode | null {
  const result = evaluateMandate(mandate, action, agentId, now);
  const failed = result.checks.find((item) => item.status === "BLOCK");

  return failed?.code ?? null;
}

export function mintPermit(
  mandate: MandateContract,
  action: ActionContract,
  evidence: TelegraphEvidenceRecord,
  decision: DecisionRecord,
  secret: string,
  options?: {
    now?: Date;
    ttlSeconds?: number;
  }
): Permit {
  requireStrongSecret(secret);

  if (decision.decision !== "ALLOW") {
    throw new Error("decision_not_allow");
  }

  if (decision.actionId !== action.id) {
    throw new Error("decision_action_mismatch");
  }

  if (
    decision.policyId !== action.policyId ||
    mandate.policyId !== action.policyId
  ) {
    throw new Error("policy_id_mismatch");
  }

  if (!decisionMatchesMandate(mandate, decision)) {
    throw new Error("mandate_hash_mismatch");
  }

  if (!evidenceMatchesAction(action, evidence)) {
    throw new Error("evidence_binding_mismatch");
  }

  if (
    decision.checks.length === 0 ||
    decision.checks.some((item) => item.status !== "PASS")
  ) {
    throw new Error("decision_not_allow");
  }

  const now = options?.now ?? new Date();
  const ttlSeconds = options?.ttlSeconds ?? 30;

  if (
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds <= 0 ||
    ttlSeconds > 300
  ) {
    throw new Error("invalid_permit_ttl");
  }

  const mandateFailure = firstMandateFailure(
    mandate,
    action,
    decision.agentId,
    now
  );

  if (mandateFailure) {
    throw new Error(mandateFailure);
  }

  if (!decisionIsInternallyAllowing(mandate, action, decision)) {
    throw new Error("decision_not_allow");
  }

  const decisionHash = createDecisionHash(
    mandate,
    action,
    evidence,
    decision
  );

  const payload: PermitPayload = {
    permitId: randomUUID(),
    mandateHash: mandate.mandateHash,
    actionHash: action.actionHash,
    decisionHash,
    nonce: randomBytes(16).toString("hex"),
    policyId: decision.policyId,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString()
  };

  return {
    payload,
    signature: signPermitPayload(payload, secret)
  };
}

export function verifyPermit(
  mandate: MandateContract,
  permit: Permit,
  action: ActionContract,
  evidence: TelegraphEvidenceRecord,
  decision: DecisionRecord,
  secret: string,
  options?: {
    now?: Date;
  }
): PermitVerificationResult {
  requireStrongSecret(secret);

  const expectedSignature = signPermitPayload(permit.payload, secret);

  if (!safeSignatureEqual(permit.signature, expectedSignature)) {
    return {
      valid: false,
      code: "invalid_permit_signature"
    };
  }

  if (
    permit.payload.mandateHash !== mandate.mandateHash ||
    !decisionMatchesMandate(mandate, decision)
  ) {
    return {
      valid: false,
      code: "mandate_hash_mismatch"
    };
  }

  if (decision.decision !== "ALLOW") {
    return {
      valid: false,
      code: "decision_not_allow"
    };
  }

  if (
    decision.policyId !== action.policyId ||
    mandate.policyId !== action.policyId ||
    permit.payload.policyId !== action.policyId ||
    permit.payload.policyId !== decision.policyId
  ) {
    return {
      valid: false,
      code: "policy_id_mismatch"
    };
  }

  if (!evidenceMatchesAction(action, evidence)) {
    return {
      valid: false,
      code: "evidence_binding_mismatch"
    };
  }

  const now = options?.now ?? new Date();
  const timeFailure = validatePermitTimes(permit, now);

  if (timeFailure) {
    return {
      valid: false,
      code: timeFailure
    };
  }

  // Exact semantic action binding takes precedence so post-authorization
  // mutations retain stable attack-specific error codes.
  if (permit.payload.actionHash !== action.actionHash) {
    return {
      valid: false,
      code: "action_hash_mismatch"
    };
  }

  if (decision.actionId !== action.id) {
    return {
      valid: false,
      code: "decision_action_mismatch"
    };
  }

  const mandateFailure = firstMandateFailure(
    mandate,
    action,
    decision.agentId,
    now
  );

  if (mandateFailure) {
    return {
      valid: false,
      code: mandateFailure
    };
  }

  if (!decisionIsInternallyAllowing(mandate, action, decision)) {
    return {
      valid: false,
      code: "decision_not_allow"
    };
  }

  const expectedDecisionHash = createDecisionHash(
    mandate,
    action,
    evidence,
    decision
  );

  if (permit.payload.decisionHash !== expectedDecisionHash) {
    return {
      valid: false,
      code: "decision_hash_mismatch"
    };
  }

  return {
    valid: true,
    code: "permit_valid"
  };
}
