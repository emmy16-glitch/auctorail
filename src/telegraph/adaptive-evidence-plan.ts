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

/*
 * These are Auctorail's default consequence bands, not universal financial
 * thresholds. The principal-created Mandate remains the real authority cap.
 * The public hackathon web path is intentionally capped lower again by its API.
 *
 * Rationale:
 * - <= $5 is the low-consequence demo/automation band: one strong, bound Miner
 *   result is enough, but transport/schema failures get bounded retries.
 * - > $5 to $50 adds independent provider diversity and transaction context.
 * - > $50 is high consequence and requires the strongest evidence plan. The
 *   current payments.adaptive.v1 autonomous execution ceiling remains $10, so
 *   this HIGH plan is intentionally not enough by itself to authorize a large
 *   transfer; a future/human-approved policy must explicitly raise authority.
 */
const FIVE_USDC =
  5_000_000n;

const FIFTY_USDC =
  50_000_000n;

function quorum(
  minimumDistinctMiners: number,
  minimumPositiveResults: number,
  minimumPositiveConfidence: number | null,
  maxAttempts: number,
  negativeVetoConfidence: number | null
): EvidenceQuorumRule {
  return {
    minimumDistinctMiners,
    minimumPositiveResults,
    minimumPositiveConfidence,
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

  if (amount <= FIVE_USDC) {
    return "LOW";
  }

  if (amount <= FIFTY_USDC) {
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
            // One valid result is sufficient for <= $5, but allow a small
            // bounded retry window so one unusable route does not make the
            // policy artificially unavailable. Duplicate Miners still do not
            // count, explicit negatives still block, and exact binding remains
            // mandatory.
            quorum(1, 1, 0.70, 3, 0.90)
          )
        ]
      : riskTier === "MEDIUM"
        ? [
            requirement(
              "FRAUD_DETECTION",
              0.75,
              quorum(2, 2, 0.75, 4, 0.90)
            ),
            requirement(
              "ONCHAIN_TX_LOOKUP",
              undefined,
              quorum(1, 0, null, 1, null)
            )
          ]
        : [
            requirement(
              "FRAUD_DETECTION",
              0.80,
              quorum(3, 2, 0.80, 5, 0.90)
            ),
            requirement(
              "ONCHAIN_TX_LOOKUP",
              undefined,
              quorum(1, 0, null, 1, null)
            ),
            requirement(
              "WALLET_BALANCE_CHECK",
              undefined,
              quorum(1, 0, null, 1, null)
            )
          ];

  // Telegraph engine calls are typically around $0.01, but pricing is
  // dynamic. Budgets therefore cover the bounded attempt count rather than a
  // single happy-path request while still preventing runaway x402 spend.
  const maxEvidenceSpendRaw =
    riskTier === "LOW"
      ? "35000"
      : riskTier === "MEDIUM"
        ? "60000"
        : "100000";

  // The public LOW-risk path must fail closed quickly enough to remain usable
  // in interactive agent flows. Evidence quality requirements are unchanged;
  // only the maximum waiting window is reduced. Slow or unavailable upstream
  // evidence therefore becomes HOLD sooner instead of leaving the caller
  // waiting for tens of seconds.
  const maxEvidenceLatencyMs =
    riskTier === "LOW"
      ? 12_000
      : riskTier === "MEDIUM"
        ? 60_000
        : 90_000;

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
