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
  verifyGeneralMandateIntegrity,
  type GeneralMandate
} from "../core/general-mandate.js";
import type {
  PermitSignatureMetadata,
  PermitSigner,
  PermitVerifier
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
  const decision: GeneralDecisionStatus =
    blocked ? "BLOCK" : held ? "HOLD" : "ALLOW";
  const reason =
    blocked?.code ??
    blocked?.name ??
    held?.code ??
    held?.name ??
    "all_authorization_checks_passed";

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
    decidedAt: (input.now ?? new Date()).toISOString()
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
  return (
    verifyGeneralMandateIntegrity(mandate) &&
    verifyGeneralActionIntegrity(action) &&
    decision.schemaVersion === "proofgate.decision.v2" &&
    decision.mandateHash === mandate.mandateHash &&
    decision.actionHash === action.actionHash &&
    decision.policyId === action.policyId &&
    decision.policyVersion === action.policyVersion &&
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
  if (
    !verifyGeneralDecision(
      input.decision,
      input.mandate,
      input.action
    )
  ) {
    throw new Error("general_decision_integrity_failed");
  }

  if (
    input.decision.decision !== "ALLOW" ||
    input.decision.checks.some(
      (check) => check.status !== "PASS"
    )
  ) {
    throw new Error("general_permit_requires_allow");
  }

  const ttlSeconds = input.ttlSeconds ?? 30;
  if (
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < 1 ||
    ttlSeconds > 300
  ) {
    throw new Error("general_permit_ttl_invalid");
  }

  const now = input.now ?? new Date();
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
    if (!verifyGeneralDecision(decision, mandate, action)) {
      return { valid: false, code: "general_decision_invalid" };
    }
    if (decision.decision !== "ALLOW") {
      return { valid: false, code: "general_decision_not_allow" };
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
    const now = (input.now ?? new Date()).getTime();
    if (
      !Number.isFinite(issued) ||
      !Number.isFinite(expires) ||
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
