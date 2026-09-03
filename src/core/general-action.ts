import {
  randomUUID
} from "node:crypto";
import {
  canonicalize,
  hashCanonicalPayload
} from "./action-contract.js";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface GeneralActionInput {
  type: string;
  target: string;
  parameters: { [key: string]: JsonValue };
  policyId: string;
  policyVersion?: number;
}

export interface GeneralActionEnvelope {
  schemaVersion: "proofgate.action.v2";
  id: string;
  type: string;
  target: string;
  parameters: { [key: string]: JsonValue };
  policyId: string;
  policyVersion: number;
  canonicalPayload: string;
  actionHash: string;
  createdAt: string;
}

const NAMESPACED_ID =
  /^[a-z][a-z0-9-]*(?:[.:/][a-z0-9][a-z0-9-]*)+$/;

function assertJsonSafe(
  value: unknown,
  depth = 0
): asserts value is JsonValue {
  if (depth > 12) {
    throw new Error("general_action_parameters_too_deep");
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("general_action_non_finite_number");
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      assertJsonSafe(item, depth + 1);
    }
    return;
  }

  if (
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (!key || key.length > 128) {
        throw new Error("general_action_parameter_key_invalid");
      }
      assertJsonSafe(nested, depth + 1);
    }
    return;
  }

  throw new Error("general_action_parameters_not_json_safe");
}

function normalizeNamespacedId(
  value: string,
  field: string
): string {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 128 ||
    !NAMESPACED_ID.test(normalized)
  ) {
    throw new Error(`${field}_invalid`);
  }
  return normalized;
}

function normalizeTarget(target: string): string {
  const normalized = target.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 512 ||
    /[\u0000-\u001f]/.test(normalized)
  ) {
    throw new Error("general_action_target_invalid");
  }
  return normalized;
}

function canonicalBody(action: Pick<
  GeneralActionEnvelope,
  "type" | "target" | "parameters" | "policyId" | "policyVersion"
>): string {
  return canonicalize({
    type: action.type,
    target: action.target,
    parameters: action.parameters,
    policyId: action.policyId,
    policyVersion: action.policyVersion
  });
}

export function createGeneralAction(
  input: GeneralActionInput,
  options?: { id?: string; now?: Date }
): GeneralActionEnvelope {
  assertJsonSafe(input.parameters);

  const type = normalizeNamespacedId(
    input.type,
    "general_action_type"
  );
  const policyId = normalizeNamespacedId(
    input.policyId,
    "general_action_policy"
  );
  const policyVersion = input.policyVersion ?? 1;

  if (!Number.isInteger(policyVersion) || policyVersion < 1) {
    throw new Error("general_action_policy_version_invalid");
  }

  const parameters = JSON.parse(
    canonicalize(input.parameters)
  ) as { [key: string]: JsonValue };

  if (canonicalize(parameters).length > 16_384) {
    throw new Error("general_action_parameters_too_large");
  }

  const body = {
    type,
    target: normalizeTarget(input.target),
    parameters,
    policyId,
    policyVersion
  };
  const canonicalPayload = canonicalBody(body);

  return {
    schemaVersion: "proofgate.action.v2",
    id: options?.id ?? randomUUID(),
    ...body,
    canonicalPayload,
    actionHash: hashCanonicalPayload(canonicalPayload),
    createdAt: (options?.now ?? new Date()).toISOString()
  };
}

export function verifyGeneralActionIntegrity(
  action: GeneralActionEnvelope
): boolean {
  try {
    if (action.schemaVersion !== "proofgate.action.v2") return false;
    if (!action.id.trim()) return false;
    if (!Number.isFinite(new Date(action.createdAt).getTime())) return false;

    const recreated = createGeneralAction(
      {
        type: action.type,
        target: action.target,
        parameters: action.parameters,
        policyId: action.policyId,
        policyVersion: action.policyVersion
      },
      {
        id: action.id,
        now: new Date(action.createdAt)
      }
    );

    return (
      recreated.canonicalPayload === action.canonicalPayload &&
      recreated.actionHash === action.actionHash
    );
  } catch {
    return false;
  }
}
