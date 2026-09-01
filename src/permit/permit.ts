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

import type {
  TelegraphEvidenceRecord
} from "../evidence/telegraph.js";

import type {
  DecisionRecord
} from "../policy/payments-strict-v1.js";

import {
  createDecisionHash
} from "./decision-hash.js";

export interface PermitPayload {
  permitId: string;
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
    throw new Error(
      "PROOFGATE_SECRET must contain at least 32 characters"
    );
  }
}

function signPermitPayload(
  payload: PermitPayload,
  secret: string
): string {
  requireStrongSecret(secret);

  return (
    "0x" +
    createHmac("sha256", secret)
      .update(canonicalize(payload), "utf8")
      .digest("hex")
  );
}

function safeSignatureEqual(
  supplied: string,
  expected: string
): boolean {
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

function decisionIsInternallyAllowing(
  action: ActionContract,
  decision: DecisionRecord
): boolean {
  return (
    decision.decision === "ALLOW" &&
    decision.actionId === action.id &&
    decision.policyId === action.policyId &&
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

  // Five seconds of clock skew is tolerated, but a permit cannot be
  // meaningfully issued far in the future.
  if (issuedAt > now.getTime() + 5_000) {
    return "permit_time_invalid";
  }

  if (now.getTime() >= expiresAt) {
    return "permit_expired";
  }

  return null;
}

export function mintPermit(
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

  if (decision.policyId !== action.policyId) {
    throw new Error("policy_id_mismatch");
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

  const decisionHash = createDecisionHash(action, evidence, decision);

  const payload: PermitPayload = {
    permitId: randomUUID(),
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

  if (decision.decision !== "ALLOW") {
    return {
      valid: false,
      code: "decision_not_allow"
    };
  }

  if (
    decision.policyId !== action.policyId ||
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

  const timeFailure = validatePermitTimes(
    permit,
    options?.now ?? new Date()
  );

  if (timeFailure) {
    return {
      valid: false,
      code: timeFailure
    };
  }

  // Exact semantic action binding takes precedence over proposal-instance
  // binding so mutation attacks receive the stable public error code.
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

  if (!decisionIsInternallyAllowing(action, decision)) {
    return {
      valid: false,
      code: "decision_not_allow"
    };
  }

  const expectedDecisionHash = createDecisionHash(
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
