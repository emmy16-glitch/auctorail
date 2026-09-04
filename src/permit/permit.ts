import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "node:crypto";

import {
  canonicalize,
  hashCanonicalPayload,
  type ActionContract,
  type PaymentPolicyId
} from "../core/action-contract.js";
import {
  evaluateMandate,
  type MandateContract,
  type MandateViolationCode
} from "../core/mandate-contract.js";
import type { DecisionRecord } from "../policy/payments-strict-v1.js";
import {
  authorizationEvidenceMatchesAction,
  type AuthorizationEvidence
} from "../telegraph/evidence-bundle.js";
import { createDecisionHash } from "./decision-hash.js";
import {
  assertProductionSigner,
  LocalDevelopmentSigner,
  type PermitSigner,
  type PermitVerifier,
  type PermitSignatureMetadata
} from "./signer.js";

export interface PermitPayload {
  permitId: string;
  mandateHash: string;
  actionHash: string;
  decisionHash: string;
  nonce: string;
  policyId: PaymentPolicyId;
  policyVersion: number;
  keyId: string;
  algorithm: PermitSignatureMetadata["algorithm"];
  signingVersion: number;
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
  | "signature_metadata_mismatch"
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

function signerFrom(input: PermitSigner | string): PermitSigner {
  if (typeof input !== "string") return input;
  return new LocalDevelopmentSigner(input);
}

function verifierFrom(input: PermitVerifier | string): PermitVerifier {
  if (typeof input !== "string") return input;
  return new LocalDevelopmentSigner(input);
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
  evidence: AuthorizationEvidence
): boolean {
  return authorizationEvidenceMatchesAction(
    evidence,
    action
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
  evidence: AuthorizationEvidence,
  decision: DecisionRecord,
  signerOrSecret: PermitSigner | string,
  options?: {
    now?: Date;
    ttlSeconds?: number;
  }
): Permit {
  const signer = signerFrom(signerOrSecret);
  assertProductionSigner(signer.metadata);

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
    policyVersion: decision.policyVersion,
    keyId: signer.metadata.keyId,
    algorithm: signer.metadata.algorithm,
    signingVersion: signer.metadata.signingVersion,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString()
  };

  return {
    payload,
    signature: signer.sign(payload)
  };
}

export function verifyPermit(
  mandate: MandateContract,
  permit: Permit,
  action: ActionContract,
  evidence: AuthorizationEvidence,
  decision: DecisionRecord,
  verifierOrSecret: PermitVerifier | string,
  options?: {
    now?: Date;
  }
): PermitVerificationResult {
  const verifier = verifierFrom(verifierOrSecret);
  if (!Number.isInteger(permit.payload.policyVersion) || permit.payload.policyVersion !== decision.policyVersion) {
    return { valid: false, code: "signature_metadata_mismatch" };
  }
  if (!verifier.verify(permit.payload, permit.signature, {
    keyId: permit.payload.keyId,
    algorithm: permit.payload.algorithm,
    signingVersion: permit.payload.signingVersion
  })) {
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
    permit.payload.policyId !== decision.policyId ||
    permit.payload.policyVersion !== decision.policyVersion
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

  // Recompute the hash from the current semantic payload. The object may
  // have been deserialized or mutated while retaining a stale actionHash.
  // Both the supplied action hash and the permit must bind to the payload
  // currently presented to the executor.
  const recomputedActionHash = hashCanonicalPayload(
    canonicalize(action.payload)
  );
  if (
    action.actionHash !== recomputedActionHash ||
    permit.payload.actionHash !== recomputedActionHash
  ) {
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
