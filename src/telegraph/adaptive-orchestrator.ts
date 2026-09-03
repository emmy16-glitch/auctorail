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

export type RetryableEvidenceAcquisitionCode =
  | "evidence_subject_not_asserted"
  | "evidence_chain_not_asserted";

export class RetryableEvidenceAcquisitionError extends Error {
  readonly code: RetryableEvidenceAcquisitionCode;
  readonly detail: string;
  readonly paymentAmountRaw: string;
  readonly artifactPath?: string;
  readonly minerId?: string;

  constructor(input: {
    code: RetryableEvidenceAcquisitionCode;
    detail: string;
    paymentAmountRaw?: string;
    artifactPath?: string;
    minerId?: string;
  }) {
    super(
      `${input.code}:${input.detail}` +
      (input.artifactPath
        ? `;artifact:${input.artifactPath}`
        : "")
    );
    this.name = "RetryableEvidenceAcquisitionError";
    this.code = input.code;
    this.detail = input.detail;
    this.paymentAmountRaw =
      input.paymentAmountRaw ?? "0";
    this.artifactPath = input.artifactPath;
    this.minerId = input.minerId;
  }
}

export interface RejectedEvidenceAttempt {
  intent: string;
  attempt: number;
  code: RetryableEvidenceAcquisitionCode;
  detail: string;
  paymentAmountRaw: string;
  minerId?: string;
  artifactPath?: string;
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
  actualEvidenceSpendRaw: string;
  rejectedAttempts: RejectedEvidenceAttempt[];
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
  const rejectedAttempts: RejectedEvidenceAttempt[] = [];
  let spent = 0n;

  const currentBundle = () =>
    createEvidenceBundle(
      action,
      plan,
      items,
      { now: clock() }
    );

  const snapshot = () => ({
    bundle: currentBundle(),
    completedIntents: [...completedIntents],
    actualEvidenceSpendRaw: spent.toString(),
    rejectedAttempts: [...rejectedAttempts]
  });

  for (const requirement of plan.requirements) {
    let satisfied = false;
    let lastRetryableError: string | undefined;

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
          ...snapshot(),
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
          ...snapshot(),
          failedIntent:
            requirement.intent
        };
      }

      const acceptedMinerIds = items
        .filter(
          (item) =>
            item.evidence.intent ===
            requirement.intent
        )
        .map(
          (item) => item.evidence.miner.id
        );
      const rejectedMinerIds = rejectedAttempts
        .filter(
          (item) =>
            item.intent === requirement.intent &&
            Boolean(item.minerId)
        )
        .map((item) => item.minerId!);
      const priorMinerIds = [
        ...new Set([
          ...acceptedMinerIds,
          ...rejectedMinerIds
        ])
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
        if (
          error instanceof RetryableEvidenceAcquisitionError
        ) {
          let retryPayment: bigint;

          try {
            retryPayment = unsigned(
              error.paymentAmountRaw,
              "retryable_evidence_payment_amount"
            );
          } catch {
            return {
              status: "HOLD",
              code:
                "adaptive_evidence_acquisition_failed",
              ...snapshot(),
              failedIntent:
                requirement.intent,
              error:
                `retryable_evidence_payment_invalid:${error.message}`
            };
          }

          if (retryPayment > remaining) {
            return {
              status: "HOLD",
              code:
                "adaptive_evidence_budget_exceeded",
              ...snapshot(),
              failedIntent:
                requirement.intent,
              error:
                `retryable evidence payment ${retryPayment} exceeds remaining evidence budget ${remaining}`
            };
          }

          // The user authorized this bounded acquisition session up to the
          // deterministic plan budget. A response with proven settlement but
          // missing subject/chain assertion is unusable as authorization
          // evidence, yet its cost is real. Account for that cost, quarantine
          // the response, consume this route attempt, and continue only while
          // the same precommitted deadline/attempt/spend limits still allow it.
          // Transport ambiguity never reaches this branch and still stops.
          spent += retryPayment;
          rejectedAttempts.push({
            intent: requirement.intent,
            attempt: attemptNumber,
            code: error.code,
            detail: error.detail,
            paymentAmountRaw:
              retryPayment.toString(),
            ...(error.minerId
              ? { minerId: error.minerId }
              : {}),
            ...(error.artifactPath
              ? { artifactPath: error.artifactPath }
              : {})
          });

          lastRetryableError = error.message;
          continue;
        }

        return {
          status: "HOLD",
          code:
            "adaptive_evidence_acquisition_failed",
          ...snapshot(),
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
          ...snapshot(),
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
          ...snapshot(),
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
          ...snapshot(),
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
        ...snapshot(),
        failedIntent:
          requirement.intent,
        error:
          lastRetryableError
            ? `distinct_miner_quorum_not_met:${requirement.intent};last_unusable_evidence:${lastRetryableError}`
            : `distinct_miner_quorum_not_met:${requirement.intent}`
      };
    }
  }

  return {
    status: "COMPLETE",
    code:
      "adaptive_evidence_complete",
    ...snapshot()
  };
}
