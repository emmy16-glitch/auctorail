import { createHash, randomUUID } from "node:crypto";
import { getAddress } from "ethers";
import { z } from "zod";

export const BASE_SEPOLIA_CHAIN_ID = 84532;

export const BASE_SEPOLIA_USDC =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export const PAYMENT_POLICY_IDS = [
  "payments.strict.v1",
  "payments.attested-vendor.v1",
  "payments.adaptive.v1"
] as const;

export type PaymentPolicyId =
  typeof PAYMENT_POLICY_IDS[number];

const PaymentPolicyIdSchema =
  z.enum(PAYMENT_POLICY_IDS);

const PaymentActionInputSchema = z.object({
  type: z.literal("payment"),

  chainId: z.literal(BASE_SEPOLIA_CHAIN_ID),

  token: z
    .string()
    .refine((value) => {
      try {
        return (
          getAddress(value) ===
          getAddress(BASE_SEPOLIA_USDC)
        );
      } catch {
        return false;
      }
    }, "Only Base Sepolia USDC is supported by Auctorail payment policies"),

  amountRaw: z
    .string()
    .regex(/^[1-9][0-9]*$/, "amountRaw must be a positive integer"),

  destination: z
    .string()
    .refine((value) => {
      try {
        getAddress(value);
        return true;
      } catch {
        return false;
      }
    }, "destination must be a valid EVM address"),

  reason: z.string().trim().min(1).max(256),

  policyId: PaymentPolicyIdSchema,
  policyVersion: z.number().int().positive().optional()
});

export type PaymentActionInput =
  z.infer<typeof PaymentActionInputSchema>;

export interface ActionContract {
  id: string;

  type: "payment";

  payload: {
    type: "payment";
    chainId: number;
    token: string;
    amountRaw: string;
    destination: string;
    reason: string;
    policyId: PaymentPolicyId;
    policyVersion: number;
  };

  canonicalPayload: string;

  actionHash: string;

  policyId: PaymentPolicyId;
  policyVersion: number;

  createdAt: string;
}

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nestedValue]) => [
          key,
          canonicalizeValue(nestedValue)
        ])
    );
  }

  return value;
}

export function canonicalize(
  value: unknown
): string {
  return JSON.stringify(canonicalizeValue(value));
}

export function hashCanonicalPayload(
  canonicalPayload: string
): string {
  return (
    "0x" +
    createHash("sha256")
      .update(canonicalPayload, "utf8")
      .digest("hex")
  );
}

export function createActionContract(
  input: PaymentActionInput
): ActionContract {
  const validated =
    PaymentActionInputSchema.parse(input);

  const payload = {
    type: "payment" as const,

    chainId: validated.chainId,

    token:
      getAddress(validated.token).toLowerCase(),

    amountRaw:
      BigInt(validated.amountRaw).toString(),

    destination:
      getAddress(validated.destination).toLowerCase(),

    reason: validated.reason.trim(),

    policyId:
      validated.policyId,

    policyVersion:
      validated.policyVersion ?? 1
  };

  const canonicalPayload =
    canonicalize(payload);

  const actionHash =
    hashCanonicalPayload(canonicalPayload);

  return {
    id: randomUUID(),

    type: "payment",

    payload,

    canonicalPayload,

    actionHash,

    policyId:
      validated.policyId,

    policyVersion:
      validated.policyVersion ?? 1,

    createdAt:
      new Date().toISOString()
  };
}
