import { getAddress } from "ethers";
import { z } from "zod";

import {
  PAYMENT_POLICY_IDS,
  canonicalize,
  hashCanonicalPayload,
  type ActionContract,
  type PaymentPolicyId
} from "./action-contract.js";

const IdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(128);

const EvmAddressSchema = z
  .string()
  .refine((value) => {
    try {
      getAddress(value);
      return true;
    } catch {
      return false;
    }
  }, "value must be a valid EVM address");

const PositiveIntegerStringSchema = z
  .string()
  .regex(/^[1-9][0-9]*$/, "value must be a positive integer in minor units");

const TimestampSchema = z
  .string()
  .refine((value) => Number.isFinite(new Date(value).getTime()), "invalid timestamp");

const MandateContractInputSchema = z.object({
  mandateId: IdentifierSchema,
  principalId: IdentifierSchema,
  agentId: IdentifierSchema,

  allowedActionTypes: z
    .array(z.string().trim().min(1).max(64))
    .min(1),

  allowedChainIds: z
    .array(z.number().int().positive())
    .min(1),

  allowedAssets: z
    .array(EvmAddressSchema)
    .min(1),

  allowedDestinations: z
    .array(EvmAddressSchema)
    .min(1),

  maxPerActionRaw: PositiveIntegerStringSchema,

  requiredIntents: z
    .array(z.string().trim().min(1).max(128))
    .min(1),

  policyId: z.enum(PAYMENT_POLICY_IDS),
  issuedAt: TimestampSchema,
  expiresAt: TimestampSchema,
  version: z.number().int().positive()
});

export type MandateContractInput = z.infer<typeof MandateContractInputSchema>;

export interface MandateContract {
  schemaVersion: "proofgate.mandate.v1";
  mandateId: string;
  principalId: string;
  agentId: string;
  allowedActionTypes: string[];
  allowedChainIds: number[];
  allowedAssets: string[];
  allowedDestinations: string[];
  maxPerActionRaw: string;
  requiredIntents: string[];
  policyId: PaymentPolicyId;
  issuedAt: string;
  expiresAt: string;
  version: number;
  canonicalMandate: string;
  mandateHash: string;
}

export type MandateCheckStatus = "PASS" | "BLOCK";

export type MandateViolationCode =
  | "mandate_integrity_violation"
  | "mandate_time_invalid"
  | "mandate_not_yet_active"
  | "mandate_expired"
  | "mandate_agent_violation"
  | "mandate_action_type_violation"
  | "mandate_chain_violation"
  | "mandate_asset_violation"
  | "mandate_destination_violation"
  | "mandate_amount_violation"
  | "mandate_policy_violation"
  | "mandate_required_intent_violation";

export interface MandateCheck {
  name: string;
  status: MandateCheckStatus;
  reason: string;
  code?: MandateViolationCode;
}

export interface MandateEvaluation {
  valid: boolean;
  checks: MandateCheck[];
}

function uniqueSortedStrings(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function uniqueSortedNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function normalizeAddress(value: string): string {
  return getAddress(value).toLowerCase();
}

function normalizeTimestamp(value: string): string {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid mandate timestamp: ${value}`);
  }

  return date.toISOString();
}

function addressesEqual(a: string, b: string): boolean {
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    return false;
  }
}

function mandateCheck(
  name: string,
  passed: boolean,
  passReason: string,
  blockReason: string,
  code: MandateViolationCode
): MandateCheck {
  return passed
    ? {
        name,
        status: "PASS",
        reason: passReason
      }
    : {
        name,
        status: "BLOCK",
        reason: blockReason,
        code
      };
}

export function createMandateContract(
  input: MandateContractInput
): MandateContract {
  const validated = MandateContractInputSchema.parse(input);

  const issuedAt = normalizeTimestamp(validated.issuedAt);
  const expiresAt = normalizeTimestamp(validated.expiresAt);

  if (new Date(expiresAt).getTime() <= new Date(issuedAt).getTime()) {
    throw new Error("mandate_expires_before_or_at_issue_time");
  }

  const body = {
    schemaVersion: "proofgate.mandate.v1" as const,
    mandateId: validated.mandateId.trim(),
    principalId: validated.principalId.trim(),
    agentId: validated.agentId.trim(),
    allowedActionTypes: uniqueSortedStrings(
      validated.allowedActionTypes.map((value) => value.trim().toLowerCase())
    ),
    allowedChainIds: uniqueSortedNumbers(validated.allowedChainIds),
    allowedAssets: uniqueSortedStrings(
      validated.allowedAssets.map(normalizeAddress)
    ),
    allowedDestinations: uniqueSortedStrings(
      validated.allowedDestinations.map(normalizeAddress)
    ),
    maxPerActionRaw: BigInt(validated.maxPerActionRaw).toString(),
    requiredIntents: uniqueSortedStrings(
      validated.requiredIntents.map((value) => value.trim().toUpperCase())
    ),
    policyId: validated.policyId,
    issuedAt,
    expiresAt,
    version: validated.version
  };

  const canonicalMandate = canonicalize(body);
  const mandateHash = hashCanonicalPayload(canonicalMandate);

  const contract: MandateContract = {
    ...body,
    canonicalMandate,
    mandateHash
  };

  Object.freeze(contract.allowedActionTypes);
  Object.freeze(contract.allowedChainIds);
  Object.freeze(contract.allowedAssets);
  Object.freeze(contract.allowedDestinations);
  Object.freeze(contract.requiredIntents);

  return Object.freeze(contract);
}

export function verifyMandateContract(
  mandate: MandateContract
): boolean {
  const body = {
    schemaVersion: mandate.schemaVersion,
    mandateId: mandate.mandateId,
    principalId: mandate.principalId,
    agentId: mandate.agentId,
    allowedActionTypes: mandate.allowedActionTypes,
    allowedChainIds: mandate.allowedChainIds,
    allowedAssets: mandate.allowedAssets,
    allowedDestinations: mandate.allowedDestinations,
    maxPerActionRaw: mandate.maxPerActionRaw,
    requiredIntents: mandate.requiredIntents,
    policyId: mandate.policyId,
    issuedAt: mandate.issuedAt,
    expiresAt: mandate.expiresAt,
    version: mandate.version
  };

  if (canonicalize(body) !== mandate.canonicalMandate) {
    return false;
  }

  return hashCanonicalPayload(mandate.canonicalMandate) === mandate.mandateHash;
}

export function evaluateMandate(
  mandate: MandateContract,
  action: ActionContract,
  agentId: string,
  now: Date = new Date()
): MandateEvaluation {
  const checks: MandateCheck[] = [];

  if (!verifyMandateContract(mandate)) {
    return {
      valid: false,
      checks: [
        {
          name: "mandate_integrity",
          status: "BLOCK",
          reason: "Mandate fields do not match its canonical cryptographic commitment.",
          code: "mandate_integrity_violation"
        }
      ]
    };
  }

  const nowMs = now.getTime();
  const issuedAtMs = new Date(mandate.issuedAt).getTime();
  const expiresAtMs = new Date(mandate.expiresAt).getTime();

  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(issuedAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= issuedAtMs
  ) {
    checks.push({
      name: "mandate_active",
      status: "BLOCK",
      reason: "Mandate time bounds are invalid.",
      code: "mandate_time_invalid"
    });
  } else if (nowMs < issuedAtMs) {
    checks.push({
      name: "mandate_active",
      status: "BLOCK",
      reason: "Mandate is not active yet.",
      code: "mandate_not_yet_active"
    });
  } else if (nowMs >= expiresAtMs) {
    checks.push({
      name: "mandate_active",
      status: "BLOCK",
      reason: "Mandate has expired.",
      code: "mandate_expired"
    });
  } else {
    checks.push({
      name: "mandate_active",
      status: "PASS",
      reason: "Mandate is active."
    });
  }

  const normalizedAgentId =
    typeof agentId === "string" ? agentId.trim() : "";
  const normalizedActionType =
    typeof action.type === "string" ? action.type.toLowerCase() : "";
  let actionAmount: bigint | null = null;

  try {
    actionAmount = BigInt(action.payload.amountRaw);
  } catch {
    actionAmount = null;
  }

  checks.push(
    mandateCheck(
      "mandate_agent",
      normalizedAgentId === mandate.agentId,
      "Authenticated agent matches the delegated mandate agent.",
      "Authenticated agent is outside the delegated mandate.",
      "mandate_agent_violation"
    )
  );

  checks.push(
    mandateCheck(
      "mandate_action_type",
      mandate.allowedActionTypes.includes(normalizedActionType),
      "Action type is delegated by the mandate.",
      "Action type is outside delegated authority.",
      "mandate_action_type_violation"
    )
  );

  checks.push(
    mandateCheck(
      "mandate_chain",
      mandate.allowedChainIds.includes(action.payload.chainId),
      "Action chain is delegated by the mandate.",
      "Action chain is outside delegated authority.",
      "mandate_chain_violation"
    )
  );

  checks.push(
    mandateCheck(
      "mandate_asset",
      mandate.allowedAssets.some((asset) => addressesEqual(asset, action.payload.token)),
      "Action asset is delegated by the mandate.",
      "Action asset is outside delegated authority.",
      "mandate_asset_violation"
    )
  );

  checks.push(
    mandateCheck(
      "mandate_destination",
      mandate.allowedDestinations.some((destination) =>
        addressesEqual(destination, action.payload.destination)
      ),
      "Action destination is delegated by the mandate.",
      "Action destination is outside delegated authority.",
      "mandate_destination_violation"
    )
  );

  checks.push(
    mandateCheck(
      "mandate_amount",
      actionAmount !== null && actionAmount <= BigInt(mandate.maxPerActionRaw),
      "Action amount is within the delegated per-action maximum.",
      "Action amount exceeds the delegated per-action maximum.",
      "mandate_amount_violation"
    )
  );

  checks.push(
    mandateCheck(
      "mandate_policy",
      mandate.policyId === action.policyId,
      "Action policy matches the delegated mandate policy.",
      "Action policy is outside delegated authority.",
      "mandate_policy_violation"
    )
  );

  checks.push(
    mandateCheck(
      "mandate_required_intent",
      mandate.requiredIntents.includes("FRAUD_DETECTION"),
      "Mandate requires the standing FRAUD_DETECTION proof intent.",
      `Mandate does not authorize the proof intent required by ${mandate.policyId}.`,
      "mandate_required_intent_violation"
    )
  );

  return {
    valid: checks.every((item) => item.status === "PASS"),
    checks
  };
}
