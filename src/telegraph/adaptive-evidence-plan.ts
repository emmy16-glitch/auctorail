import type {
  ActionContract
} from "../core/action-contract.js";
import type {
  EvidenceQuorumRule
} from "./evidence-quorum.js";

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
  quorum: EvidenceQuorumRule;
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
  providerDiversityRule:
    "DISTINCT_MINER_IDS";
}

const ONE_USDC =
  1_000_000n;

const FIVE_USDC =
  5_000_000n;

function quorum(
  minimumDistinctMiners: number,
  minimumPositiveResults: number,
  maxAttempts: number,
  negativeVetoConfidence: number | null
): EvidenceQuorumRule {
  return {
    minimumDistinctMiners,
    minimumPositiveResults,
    maxAttempts,
    negativeVetoConfidence
  };
}

function requirement(
  intent: AdaptiveEvidenceIntent,
  minimumConfidence: number | undefined,
  evidenceQuorum: EvidenceQuorumRule
): AdaptiveEvidenceRequirement {
  return {
    intent,
    ...(minimumConfidence === undefined
      ? {}
      : { minimumConfidence }),
    requireApplicable: true,
    requireSignalHash: true,
    requireExactSubject: true,
    requireExactChain: true,
    quorum: evidenceQuorum
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
            0.70,
            quorum(1, 1, 1, null)
          )
        ]
      : riskTier === "MEDIUM"
        ? [
            requirement(
              "FRAUD_DETECTION",
              0.75,
              quorum(2, 2, 4, 0.90)
            ),
            requirement(
              "ONCHAIN_TX_LOOKUP",
              undefined,
              quorum(1, 0, 1, null)
            )
          ]
        : [
            requirement(
              "FRAUD_DETECTION",
              0.80,
              quorum(3, 2, 5, 0.90)
            ),
            requirement(
              "ONCHAIN_TX_LOOKUP",
              undefined,
              quorum(1, 0, 1, null)
            ),
            requirement(
              "WALLET_BALANCE_CHECK",
              undefined,
              quorum(1, 0, 1, null)
            )
          ];

  const maxEvidenceSpendRaw =
    riskTier === "LOW"
      ? "15000"
      : riskTier === "MEDIUM"
        ? "50000"
        : "70000";

  const maxEvidenceLatencyMs =
    riskTier === "LOW"
      ? 15_000
      : riskTier === "MEDIUM"
        ? 35_000
        : 60_000;

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
      "HOLD",
    providerDiversityRule:
      "DISTINCT_MINER_IDS"
  };
}
