import type {
  ActionContract
} from "../core/action-contract.js";
import type {
  TelegraphEvidenceRecord
} from "../evidence/telegraph.js";
import {
  createEvidenceBundle,
  type EvidenceBundle,
  type EvidenceBundleItemInput
} from "./evidence-bundle.js";
import {
  summarizeEvidenceQuorum
} from "./evidence-quorum.js";
import type {
  AdaptiveEvidencePlan,
  AdaptiveEvidenceRequirement
} from "./adaptive-evidence-plan.js";

export interface IntentAcquisitionContext {
  action: ActionContract;
  plan: AdaptiveEvidencePlan;
  requirement: AdaptiveEvidenceRequirement;
  attemptNumber?: number;
  priorMinerIds?: string[];
  remainingBudgetRaw: string;
  deadlineAt: string;
}

export interface IntentAcquisitionResult {
  evidence: TelegraphEvidenceRecord;
  paymentAmountRaw?: string;
  paymentNetwork?: string | null;
  paymentAsset?: string | null;
}

export type IntentAcquirer = (
  context: IntentAcquisitionContext
) => Promise<IntentAcquisitionResult>;

export interface AdaptiveCollectionResult {
  status: "COMPLETE" | "HOLD" | "BLOCKED";
  code:
    | "adaptive_evidence_complete"
    | "adaptive_evidence_deadline_exceeded"
    | "adaptive_evidence_budget_exceeded"
    | "adaptive_evidence_acquisition_failed"
    | "adaptive_evidence_quorum_unsatisfied"
    | "adaptive_evidence_negative_veto";
  bundle: EvidenceBundle;
  completedIntents: string[];
  failedIntent?: string;
  error?: string;
}

function unsigned(
  value: string,
  field: string
): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${field}_invalid`);
  }
  return BigInt(value);
}

export async function collectAdaptiveEvidence(
  action: ActionContract,
  plan: AdaptiveEvidencePlan,
  acquire: IntentAcquirer,
  options?: {
    now?: () => Date;
  }
): Promise<AdaptiveCollectionResult> {
  const clock = options?.now ?? (() => new Date());
  const startedAt = clock();
  const deadline = new Date(
    startedAt.getTime() +
      plan.maxEvidenceLatencyMs
  );
  const budget = unsigned(
    plan.maxEvidenceSpendRaw,
    "max_evidence_spend"
  );

  const items: EvidenceBundleItemInput[] = [];
  const completedIntents: string[] = [];
  let spent = 0n;

  const currentBundle = () =>
    createEvidenceBundle(
      action,
      plan,
      items,
      { now: clock() }
    );

  for (const requirement of plan.requirements) {
    let satisfied = false;

    for (
      let attemptNumber = 1;
      attemptNumber <= requirement.quorum.maxAttempts;
      attemptNumber++
    ) {
      if (clock().getTime() > deadline.getTime()) {
        return {
          status: "HOLD",
          code:
            "adaptive_evidence_deadline_exceeded",
          bundle: currentBundle(),
          completedIntents,
          failedIntent:
            requirement.intent
        };
      }

      const remaining = budget - spent;

      if (remaining < 0n) {
        return {
          status: "HOLD",
          code:
            "adaptive_evidence_budget_exceeded",
          bundle: currentBundle(),
          completedIntents,
          failedIntent:
            requirement.intent
        };
      }

      const priorMinerIds = [
        ...new Set(
          items
            .filter(
              (item) =>
                item.evidence.intent ===
                requirement.intent
            )
            .map(
              (item) => item.evidence.miner.id
            )
        )
      ].sort();

      let result: IntentAcquisitionResult;

      try {
        result = await acquire({
          action,
          plan,
          requirement,
          attemptNumber,
          priorMinerIds,
          remainingBudgetRaw:
            remaining.toString(),
          deadlineAt:
            deadline.toISOString()
        });
      } catch (error: unknown) {
        return {
          status: "HOLD",
          code:
            "adaptive_evidence_acquisition_failed",
          bundle: currentBundle(),
          completedIntents,
          failedIntent:
            requirement.intent,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        };
      }

      if (
        result.evidence.intent !==
        requirement.intent
      ) {
        return {
          status: "HOLD",
          code:
            "adaptive_evidence_acquisition_failed",
          bundle: currentBundle(),
          completedIntents,
          failedIntent:
            requirement.intent,
          error:
            `routed_intent_mismatch:${result.evidence.intent}`
        };
      }

      const paymentAmountRaw =
        result.paymentAmountRaw ?? "0";
      const payment = unsigned(
        paymentAmountRaw,
        "evidence_payment_amount"
      );

      if (payment > remaining) {
        return {
          status: "HOLD",
          code:
            "adaptive_evidence_budget_exceeded",
          bundle: currentBundle(),
          completedIntents,
          failedIntent:
            requirement.intent,
          error:
            `payment ${payment} exceeds remaining evidence budget ${remaining}`
        };
      }

      spent += payment;

      items.push({
        evidence: result.evidence,
        attempt: attemptNumber,
        paymentAmountRaw,
        paymentNetwork:
          result.paymentNetwork ?? null,
        paymentAsset:
          result.paymentAsset ?? null
      });

      const quorum = summarizeEvidenceQuorum(
        requirement.intent,
        requirement.quorum,
        items.map((item) => ({
          intent: item.evidence.intent,
          miner: item.evidence.miner,
          label: item.evidence.label,
          confidence: item.evidence.confidence
        }))
      );

      if (quorum.status === "VETOED") {
        return {
          status: "BLOCKED",
          code:
            "adaptive_evidence_negative_veto",
          bundle: currentBundle(),
          completedIntents,
          failedIntent:
            requirement.intent,
          error:
            `high_confidence_negative_veto:${quorum.vetoMinerIds.join(",")}`
        };
      }

      if (quorum.status === "SATISFIED") {
        completedIntents.push(
          requirement.intent
        );
        satisfied = true;
        break;
      }
    }

    if (!satisfied) {
      return {
        status: "HOLD",
        code:
          "adaptive_evidence_quorum_unsatisfied",
        bundle: currentBundle(),
        completedIntents,
        failedIntent:
          requirement.intent,
        error:
          `distinct_miner_quorum_not_met:${requirement.intent}`
      };
    }
  }

  return {
    status: "COMPLETE",
    code:
      "adaptive_evidence_complete",
    bundle: currentBundle(),
    completedIntents
  };
}
