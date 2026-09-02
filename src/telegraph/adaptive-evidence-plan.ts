import type {
  ActionContract
} from "../core/action-contract.js";

export const ADAPTIVE_EVIDENCE_INTENTS = [
  "FRAUD_DETECTION",
  "ONCHAIN_TX_LOOKUP",
  "WALLET_BALANCE_CHECK"
] as const;

export type AdaptiveEvidenceIntent =
  typeof ADAPTIVE_EVIDENCE_INTENTS[number];

export type ActionRiskTier =
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export interface AdaptiveEvidenceRequirement {
  intent: AdaptiveEvidenceIntent;
  minimumConfidence?: number;
  requireApplicable: boolean;
  requireSignalHash: true;
  requireExactSubject: true;
  requireExactChain: true;
}

export interface AdaptiveEvidencePlan {
  schemaVersion:
    "proofgate.adaptive-evidence-plan.v1";
  routeMode:
    "TELEGRAPH_INTENT_ROUTE";
  actionId: string;
  actionHash: string;
  subject: string;
  chainId: number;
  amountRaw: string;
  riskTier: ActionRiskTier;
  requirements:
    AdaptiveEvidenceRequirement[];
  maxEvidenceSpendRaw: string;
  maxEvidenceLatencyMs: number;
  conflictRule:
    "EXPLICIT_NEGATIVE_BLOCKS";
  missingEvidenceRule:
    "HOLD";
}

const ONE_USDC =
  1_000_000n;

const FIVE_USDC =
  5_000_000n;

function requirement(
  intent: AdaptiveEvidenceIntent,
  minimumConfidence?: number
): AdaptiveEvidenceRequirement {
  return {
    intent,
    ...(minimumConfidence === undefined
      ? {}
      : { minimumConfidence }),
    requireApplicable: true,
    requireSignalHash: true,
    requireExactSubject: true,
    requireExactChain: true
  };
}

export function classifyActionRisk(
  action: ActionContract
): ActionRiskTier {
  const amount =
    BigInt(action.payload.amountRaw);

  if (amount <= ONE_USDC) {
    return "LOW";
  }

  if (amount <= FIVE_USDC) {
    return "MEDIUM";
  }

  return "HIGH";
}

export function createAdaptiveEvidencePlan(
  action: ActionContract
): AdaptiveEvidencePlan {
  if (action.type !== "payment") {
    throw new Error(
      "adaptive_evidence_unsupported_action_type"
    );
  }

  const riskTier =
    classifyActionRisk(action);

  const requirements =
    riskTier === "LOW"
      ? [
          requirement(
            "FRAUD_DETECTION",
            0.70
          )
        ]
      : riskTier === "MEDIUM"
        ? [
            requirement(
              "FRAUD_DETECTION",
              0.75
            ),
            requirement(
              "ONCHAIN_TX_LOOKUP"
            )
          ]
        : [
            requirement(
              "FRAUD_DETECTION",
              0.80
            ),
            requirement(
              "ONCHAIN_TX_LOOKUP"
            ),
            requirement(
              "WALLET_BALANCE_CHECK"
            )
          ];

  const maxEvidenceSpendRaw =
    riskTier === "LOW"
      ? "15000"
      : riskTier === "MEDIUM"
        ? "30000"
        : "50000";

  const maxEvidenceLatencyMs =
    riskTier === "LOW"
      ? 15_000
      : riskTier === "MEDIUM"
        ? 25_000
        : 40_000;

  return {
    schemaVersion:
      "proofgate.adaptive-evidence-plan.v1",
    routeMode:
      "TELEGRAPH_INTENT_ROUTE",
    actionId:
      action.id,
    actionHash:
      action.actionHash,
    subject:
      action.payload.destination,
    chainId:
      action.payload.chainId,
    amountRaw:
      action.payload.amountRaw,
    riskTier,
    requirements,
    maxEvidenceSpendRaw,
    maxEvidenceLatencyMs,
    conflictRule:
      "EXPLICIT_NEGATIVE_BLOCKS",
    missingEvidenceRule:
      "HOLD"
  };
}
