import type { ActionContract } from "../core/action-contract.js";
import type {
  AdaptiveEvidenceIntent
} from "./adaptive-evidence-plan.js";

export const PAYMENT_FRAUD_INTENT = "FRAUD_DETECTION" as const;

export type ProofGateTelegraphIntent =
  | AdaptiveEvidenceIntent
  | typeof PAYMENT_FRAUD_INTENT;

export interface TelegraphVerificationPlan {
  schemaVersion: "proofgate.verification-plan.v1";
  routeMode: "AUTO_ROUTE";
  actionId: string;
  actionHash: string;
  requiredIntent: ProofGateTelegraphIntent;
  subject: string;
  chainId: number;
  query: string;
  requiredBindings: {
    subject: true;
    chainId: true;
    signalHash: true;
  };
}

function intentInstructions(
  intent: ProofGateTelegraphIntent
): string[] {
  if (intent === "FRAUD_DETECTION") {
    return [
      "Assess fraud, abuse, malicious-contract, and counterparty risk for the proposed payment destination.",
      "Provide an explicit verdict/label and numeric confidence when the routed Miner supports them.",
      "For contract destinations, assess privileged upgrade, admin, owner, pause, or similar control risk when supported."
    ];
  }

  if (intent === "ONCHAIN_TX_LOOKUP") {
    return [
      "Return live on-chain transaction/account activity relevant to the proposed payment destination.",
      "If the Miner exposes a status/label, explicitly identify any negative or suspicious result."
    ];
  }

  return [
    "Return a live wallet/account balance assessment relevant to the proposed payment destination.",
    "If the Miner exposes a status/label, explicitly identify any negative or suspicious result."
  ];
}

export function createIntentVerificationPlan(
  action: ActionContract,
  intent: ProofGateTelegraphIntent
): TelegraphVerificationPlan {
  if (action.type !== "payment") {
    throw new Error("unsupported_action_type");
  }

  const subject = action.payload.destination;
  const chainId = action.payload.chainId;

  const query = [
    `Intent: ${intent}.`,
    ...intentInstructions(intent),
    `Exact EVM subject: ${subject}.`,
    `Exact chainId: ${chainId}.`,
    "Network: Base Sepolia testnet. Do not substitute Base mainnet for Base Sepolia chainId 84532.",
    "Return verifiable intelligence explicitly bound to this exact subject and chain.",
    "Prefer live on-chain measurements over generic LLM-only speculation when a capable Miner is available.",
    "Explicitly repeat the exact subject address and exact chainId in structured output or in a schema-declared signal field so the evidence can be machine-bound without relying on request metadata.",
    "Do not assess a different address or chain."
  ].join(" ");

  return {
    schemaVersion: "proofgate.verification-plan.v1",
    routeMode: "AUTO_ROUTE",
    actionId: action.id,
    actionHash: action.actionHash,
    requiredIntent: intent,
    subject,
    chainId,
    query,
    requiredBindings: {
      subject: true,
      chainId: true,
      signalHash: true
    }
  };
}

export function createPaymentVerificationPlan(
  action: ActionContract
): TelegraphVerificationPlan {
  return createIntentVerificationPlan(
    action,
    PAYMENT_FRAUD_INTENT
  );
}
