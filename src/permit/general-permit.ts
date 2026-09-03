import { randomUUID } from "node:crypto";
import {
  canonicalize,
  hashCanonicalPayload
} from "../core/action-contract.js";
import {
  verifyGeneralActionIntegrity,
  type GeneralActionEnvelope
} from "../core/general-action.js";
import {
  evaluateGeneralMandate,
  verifyGeneralMandateIntegrity,
  type GeneralMandate
} from "../core/general-mandate.js";
import {
  assertProductionSigner,
  type PermitSignatureMetadata,
  type PermitSigner,
  type PermitVerifier
} from "./signer.js";

export type GeneralDecisionStatus =
  | "ALLOW"
  | "HOLD"
  | "BLOCK";

export interface GeneralAuthorizationCheck {
  name: string;
  status: "PASS" | "HOLD" | "BLOCK";
  reason: string;
  code?: string;
}

export interface GeneralAuthorizationDecisionBody {
  schemaVersion: "proofgate.decision.v2";
  mandateHash: string;
  actionHash: string;
  agentId: string;
  policyId: string;
  policyVersion: number;
  evidenceCommitmentHash: string | null;
  checks: GeneralAuthorizationCheck[];
  decision: GeneralDecisionStatus;
  reason: string;
  decidedAt: string;
}

export interface GeneralAuthorizationDecision
  extends GeneralAuthorizationDecisionBody {
  decisionHash: string;
}

export interface GeneralPermitPayload {
  schemaVersion: "proofgate.permit.v2";
  permitId: string;
  mandateHash: string;
  actionHash: string;
  decisionHash: string;
  evidenceCommitmentHash: string | null;
  policyId: string;
  policyVersion: number;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  signatureMetadata: PermitSignatureMetadata;
}

export interface GeneralPermit {
  payload: GeneralPermitPayload;
  signature: string;
}

function sha256(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function decisionBody(
  decision: GeneralAuthorizationDecision
): GeneralAuthorizationDecisionBody {
  const { decisionHash: _hash, ...body } = decision;
  return body;
}

function expectedDecision(
  checks: GeneralAuthorizationCheck[]
): GeneralDecisionStatus {
  if (checks.some((check) => check.status === "BLOCK")) {
    return "BLOCK";
  }
  if (checks.some((check) => check.status === "HOLD")) {
    return "HOLD";
  }
  return "ALLOW";
}

export function createGeneralAuthorizationDecision(input: {
  mandate: GeneralMandate;
  action: GeneralActionEnvelope;
  agentId: string;
  checks: GeneralAuthorizationCheck[];
  evidenceCommitmentHash?: string | null;
  now?: Date;
}): GeneralAuthorizationDecision {
  const evidenceCommitmentHash =
    input.evidenceCommitmentHash ?? null;

  if (
    evidenceCommitmentHash !== null &&
    !sha256(evidenceCommitmentHash)
  ) {
    throw new Error("general_evidence_commitment_invalid");
  }

  if (input.checks.length === 0) {
    throw new Error("general_authorization_checks_required");
  }

  const blocked = input.checks.find(
    (check) => check.status === "BLOCK"
  );
  const held = input.checks.find(
    (check) => check.status === "HOLD"
  );
  const decision = expectedDecision(input.checks);
  const reason =
    blocked?.code ??
    blocked?.name ??
    held?.code ??
    held?.name ??
    "all_authorization_checks_passed";

  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new Error("general_decision_time_invalid");
  }

  const body: GeneralAuthorizationDecisionBody = {
    schemaVersion: "proofgate.decision.v2",
    mandateHash: input.mandate.mandateHash,
    actionHash: input.action.actionHash,
    agentId: input.agentId.trim(),
    policyId: input.action.policyId,
    policyVersion: input.action.policyVersion,
    evidenceCommitmentHash,
    checks: input.checks,
    decision,
    reason,
    decidedAt: now.toISOString()
  };

  return {
    ...body,
    decisionHash: hashCanonicalPayload(canonicalize(body))
  };
}

export function verifyGeneralDecision(
  decision: GeneralAuthorizationDecision,
  mandate: GeneralMandate,
  action: GeneralActionEnvelope
): boolean {
  const decidedAt = new Date(decision.decidedAt).getTime();

  return (
    verifyGeneralMandateIntegrity(mandate) &&
    verifyGeneralActionIntegrity(action) &&
    decision.schemaVersion === "proofgate.decision.v2" &&
    decision.mandateHash === mandate.mandateHash &&
    decision.actionHash === action.actionHash &&
    decision.agentId === mandate.agentId &&
    decision.policyId === action.policyId &&
    decision.policyVersion === action.policyVersion &&
    decision.checks.length > 0 &&
    decision.decision === expectedDecision(decision.checks) &&
    Number.isFinite(decidedAt) &&
    (decision.evidenceCommitmentHash === null ||
      sha256(decision.evidenceCommitmentHash)) &&
    hashCanonicalPayload(
      canonicalize(decisionBody(decision))
    ) === decision.decisionHash
  );
}

export function mintGeneralPermit(input: {
  mandate: GeneralMandate;
  action: GeneralActionEnvelope;
  decision: GeneralAuthorizationDecision;
  signer: PermitSigner;
  now?: Date;
  ttlSeconds?: number;
}): GeneralPermit {
  const now = input.now ?? new Date();

  if (
    !verifyGeneralDecision(
      input.decision,
      input.mandate,
      input.action
    )
  ) {
    throw new Error("general_decision_integrity_failed");
  }

  const mandateNow = evaluateGeneralMandate(
    input.mandate,
    input.action,
    input.decision.agentId,
    now
  );
  if (!mandateNow.valid) {
    throw new Error("general_mandate_invalid_at_permit_mint");
  }

  if (
    input.decision.decision !== "ALLOW" ||
    input.decision.checks.some(
      (check) => check.status !== "PASS"
    )
  ) {
    throw new Error("general_permit_requires_allow");
  }

  assertProductionSigner(input.signer.metadata);

  const ttlSeconds = input.ttlSeconds ?? 30;
  if (
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < 1 ||
    ttlSeconds > 300
  ) {
    throw new Error("general_permit_ttl_invalid");
  }

  const payload: GeneralPermitPayload = {
    schemaVersion: "proofgate.permit.v2",
    permitId: randomUUID(),
    mandateHash: input.mandate.mandateHash,
    actionHash: input.action.actionHash,
    decisionHash: input.decision.decisionHash,
    evidenceCommitmentHash:
      input.decision.evidenceCommitmentHash,
    policyId: input.action.policyId,
    policyVersion: input.action.policyVersion,
    nonce: randomUUID(),
    issuedAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + ttlSeconds * 1000
    ).toISOString(),
    signatureMetadata: input.signer.metadata
  };

  return {
    payload,
    signature: input.signer.sign(payload)
  };
}

export function verifyGeneralPermit(input: {
  mandate: GeneralMandate;
  action: GeneralActionEnvelope;
  decision: GeneralAuthorizationDecision;
  permit: GeneralPermit;
  verifier: PermitVerifier;
  now?: Date;
}): { valid: boolean; code: string } {
  try {
    const { permit, mandate, action, decision } = input;
    const nowDate = input.now ?? new Date();

    if (!verifyGeneralDecision(decision, mandate, action)) {
      return { valid: false, code: "general_decision_invalid" };
    }
    if (decision.decision !== "ALLOW") {
      return { valid: false, code: "general_decision_not_allow" };
    }

    const mandateNow = evaluateGeneralMandate(
      mandate,
      action,
      decision.agentId,
      nowDate
    );
    if (!mandateNow.valid) {
      return {
        valid: false,
        code: "general_mandate_execution_invalid"
      };
    }

    if (permit.payload.schemaVersion !== "proofgate.permit.v2") {
      return { valid: false, code: "general_permit_schema_invalid" };
    }
    if (
      permit.payload.mandateHash !== mandate.mandateHash ||
      permit.payload.actionHash !== action.actionHash ||
      permit.payload.decisionHash !== decision.decisionHash ||
      permit.payload.evidenceCommitmentHash !==
        decision.evidenceCommitmentHash ||
      permit.payload.policyId !== action.policyId ||
      permit.payload.policyVersion !== action.policyVersion
    ) {
      return { valid: false, code: "general_permit_binding_mismatch" };
    }

    const issued = new Date(permit.payload.issuedAt).getTime();
    const expires = new Date(permit.payload.expiresAt).getTime();
    const now = nowDate.getTime();
    if (
      !Number.isFinite(issued) ||
      !Number.isFinite(expires) ||
      !Number.isFinite(now) ||
      expires <= issued ||
      now < issued ||
      now > expires
    ) {
      return { valid: false, code: "general_permit_time_invalid" };
    }

    if (
      !input.verifier.verify(
        permit.payload,
        permit.signature,
        permit.payload.signatureMetadata
      )
    ) {
      return { valid: false, code: "general_permit_signature_invalid" };
    }

    return { valid: true, code: "general_permit_valid" };
  } catch {
    return { valid: false, code: "general_permit_verification_failed" };
  }
}
