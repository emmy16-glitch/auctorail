import {
  canonicalize,
  hashCanonicalPayload
} from "./action-contract.js";
import {
  verifyGeneralActionIntegrity,
  type GeneralActionEnvelope
} from "./general-action.js";

export type GeneralMandateStatus =
  | "ACTIVE"
  | "REVOKED"
  | "EXPIRED";

export interface GeneralMandateInput {
  mandateId: string;
  principalId: string;
  agentId: string;
  allowedActionTypes: string[];
  allowedTargets: string[];
  requiredIntents?: string[];
  policyId: string;
  policyVersion?: number;
  status?: GeneralMandateStatus;
  issuedAt: string;
  expiresAt: string;
  version: number;
}

export interface GeneralMandate {
  schemaVersion: "proofgate.mandate.v2";
  mandateId: string;
  principalId: string;
  agentId: string;
  allowedActionTypes: string[];
  allowedTargets: string[];
  requiredIntents: string[];
  policyId: string;
  policyVersion: number;
  status: GeneralMandateStatus;
  issuedAt: string;
  expiresAt: string;
  version: number;
  canonicalMandate: string;
  mandateHash: string;
}

export interface GeneralMandateCheck {
  name: string;
  status: "PASS" | "BLOCK";
  reason: string;
  code?: string;
}

export interface GeneralMandateEvaluation {
  valid: boolean;
  checks: GeneralMandateCheck[];
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 512) {
    throw new Error(`${field}_invalid`);
  }
  return normalized;
}

function timestamp(value: string, field: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`${field}_invalid`);
  }
  return date.toISOString();
}

function unique(values: string[]): string[] {
  return [...new Set(
    values.map((value) => requiredText(value, "mandate_list_value"))
  )].sort((a, b) => a.localeCompare(b));
}

function bodyOf(
  mandate: Omit<
    GeneralMandate,
    "schemaVersion" | "canonicalMandate" | "mandateHash"
  >
): unknown {
  return mandate;
}

export function createGeneralMandate(
  input: GeneralMandateInput
): GeneralMandate {
  const issuedAt = timestamp(input.issuedAt, "mandate_issued_at");
  const expiresAt = timestamp(input.expiresAt, "mandate_expires_at");
  if (new Date(expiresAt).getTime() <= new Date(issuedAt).getTime()) {
    throw new Error("mandate_time_window_invalid");
  }

  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new Error("mandate_version_invalid");
  }
  const policyVersion = input.policyVersion ?? 1;
  if (!Number.isInteger(policyVersion) || policyVersion < 1) {
    throw new Error("mandate_policy_version_invalid");
  }

  const allowedActionTypes = unique(input.allowedActionTypes);
  const allowedTargets = unique(input.allowedTargets);
  if (allowedActionTypes.length === 0 || allowedTargets.length === 0) {
    throw new Error("mandate_authority_scope_empty");
  }

  const body = {
    mandateId: requiredText(input.mandateId, "mandate_id"),
    principalId: requiredText(input.principalId, "principal_id"),
    agentId: requiredText(input.agentId, "agent_id"),
    allowedActionTypes,
    allowedTargets,
    requiredIntents: unique(input.requiredIntents ?? []),
    policyId: requiredText(input.policyId, "mandate_policy_id").toLowerCase(),
    policyVersion,
    status: input.status ?? "ACTIVE" as GeneralMandateStatus,
    issuedAt,
    expiresAt,
    version: input.version
  };

  if (!["ACTIVE", "REVOKED", "EXPIRED"].includes(body.status)) {
    throw new Error("mandate_status_invalid");
  }

  const canonicalMandate = canonicalize(body);

  return {
    schemaVersion: "proofgate.mandate.v2",
    ...body,
    canonicalMandate,
    mandateHash: hashCanonicalPayload(canonicalMandate)
  };
}

export function verifyGeneralMandateIntegrity(
  mandate: GeneralMandate
): boolean {
  try {
    if (mandate.schemaVersion !== "proofgate.mandate.v2") return false;
    const recreated = createGeneralMandate({
      mandateId: mandate.mandateId,
      principalId: mandate.principalId,
      agentId: mandate.agentId,
      allowedActionTypes: mandate.allowedActionTypes,
      allowedTargets: mandate.allowedTargets,
      requiredIntents: mandate.requiredIntents,
      policyId: mandate.policyId,
      policyVersion: mandate.policyVersion,
      status: mandate.status,
      issuedAt: mandate.issuedAt,
      expiresAt: mandate.expiresAt,
      version: mandate.version
    });
    return (
      recreated.canonicalMandate === mandate.canonicalMandate &&
      recreated.mandateHash === mandate.mandateHash
    );
  } catch {
    return false;
  }
}

function result(
  name: string,
  pass: boolean,
  passReason: string,
  failReason: string,
  code: string
): GeneralMandateCheck {
  return pass
    ? { name, status: "PASS", reason: passReason }
    : { name, status: "BLOCK", reason: failReason, code };
}

export function evaluateGeneralMandate(
  mandate: GeneralMandate,
  action: GeneralActionEnvelope,
  agentId: string,
  now = new Date()
): GeneralMandateEvaluation {
  const integrity = verifyGeneralMandateIntegrity(mandate);
  const actionIntegrity = verifyGeneralActionIntegrity(action);
  const nowMs = now.getTime();
  const issued = new Date(mandate.issuedAt).getTime();
  const expires = new Date(mandate.expiresAt).getTime();

  const checks: GeneralMandateCheck[] = [
    result(
      "mandate_integrity",
      integrity,
      "Mandate hash and canonical body are intact.",
      "Mandate integrity verification failed.",
      "general_mandate_integrity_violation"
    ),
    result(
      "action_integrity",
      actionIntegrity,
      "Action hash and canonical body are intact.",
      "Action integrity verification failed.",
      "general_action_integrity_violation"
    ),
    result(
      "mandate_status",
      mandate.status === "ACTIVE",
      "Mandate is ACTIVE.",
      `Mandate status is ${mandate.status}.`,
      "general_mandate_not_active"
    ),
    result(
      "mandate_time",
      Number.isFinite(nowMs) && nowMs >= issued && nowMs <= expires,
      "Mandate is active in the current time window.",
      "Mandate is not active at the current time.",
      "general_mandate_time_violation"
    ),
    result(
      "mandate_agent",
      agentId.trim() === mandate.agentId,
      "Agent identity matches delegated authority.",
      "Agent is not the delegated agent.",
      "general_mandate_agent_violation"
    ),
    result(
      "mandate_action_type",
      mandate.allowedActionTypes.includes(action.type),
      `Action type ${action.type} is delegated.`,
      `Action type ${action.type} is not delegated.`,
      "general_mandate_action_type_violation"
    ),
    result(
      "mandate_target",
      mandate.allowedTargets.includes(action.target),
      "Exact action target is delegated.",
      "Action target is outside delegated authority.",
      "general_mandate_target_violation"
    ),
    result(
      "mandate_policy",
      action.policyId === mandate.policyId &&
        action.policyVersion === mandate.policyVersion,
      "Action policy matches the delegated policy/version.",
      "Action policy/version differs from the delegated authority.",
      "general_mandate_policy_violation"
    )
  ];

  return {
    valid: checks.every((check) => check.status === "PASS"),
    checks
  };
}
