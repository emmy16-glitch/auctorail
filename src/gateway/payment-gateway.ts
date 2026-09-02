import type { ActionContract } from "../core/action-contract.js";
import type { MandateContract } from "../core/mandate-contract.js";
import type { TelegraphEvidenceRecord } from "../evidence/telegraph.js";
import type {
  SupplementalEvidenceRef
} from "../evidence/vendor-runtime.js";
import {
  executeProtectedAction,
  type ExecutorResult
} from "../executor/controlled-executor.js";
import type { PermitConsumptionStore } from "../executor/permit-store.js";
import { executeDurableProtectedAction, type PostgresExecutionStore } from "../executor/durable-execution.js";
import type { ExecutionKillSwitch } from "../security/execution-kill-switch.js";
import type { TransactionIntent } from "../executor/transaction-intent.js";
import {
  evaluatePaymentsStrictV1,
  type DecisionRecord
} from "../policy/payments-strict-v1.js";
import {
  mintPermit,
  type Permit
} from "../permit/permit.js";
import {
  createProofReceipt,
  verifyProofReceipt,
  type ProofReceipt,
  type ReceiptExecution
} from "../receipt/proof-receipt.js";

export interface PaymentExecutionArtifact {
  transactionHash: string;
  blockNumber?: number | null;
  confirmedAt?: string;
  confirmedVia?: string | null;
  sender?: string;
  nonce?: number;
  operationId?: string;
}

export type PaymentPolicyEvaluator = (
  mandate: MandateContract,
  action: ActionContract,
  evidence: TelegraphEvidenceRecord,
  options: {
    agentId: string;
    now?: Date;
  }
) => DecisionRecord;

export interface RunPaymentGatewayInput {
  mandate: MandateContract;
  action: ActionContract;
  evidence: TelegraphEvidenceRecord;
  supplementalEvidence?: SupplementalEvidenceRef[];
  evaluatePolicy?: PaymentPolicyEvaluator;
  agentId: string;
  secret: string;
  store: PermitConsumptionStore;
  /** Required for the production durable path; omitted only for local compatibility tests. */
  durableExecutionStore?: PostgresExecutionStore;
  sender?: string;
  transactionIntent?: () => Promise<TransactionIntent> | TransactionIntent;
  killSwitch?: ExecutionKillSwitch;
  execute: (action: ActionContract) => Promise<PaymentExecutionArtifact>;
  operationId?: string;
  now?: Date;
  permitTtlSeconds?: number;
}

export interface PaymentGatewayResult {
  decision: DecisionRecord;
  permit: Permit | null;
  execution: ExecutorResult<PaymentExecutionArtifact> | null;
  receipt: ProofReceipt;
}

function txHashFrom(
  result: ExecutorResult<PaymentExecutionArtifact>
): string | undefined {
  const hash = result.result?.transactionHash;

  return typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash)
    ? hash
    : undefined;
}

function receiptExecutionFrom(
  result: ExecutorResult<PaymentExecutionArtifact>,
  chainId: number,
  now: Date
): ReceiptExecution {
  const transactionHash = txHashFrom(result);

  if (result.status === "EXECUTED" && !transactionHash) {
    throw new Error("executor_result_missing_transaction_hash");
  }

  return {
    status: result.status,
    code: result.code,
    chainId,
    ...(transactionHash ? { transactionHash } : {}),
    ...(result.status === "EXECUTED"
      ? {
          executedAt:
            result.result?.confirmedAt ??
            now.toISOString()
        }
      : {}),
    ...(result.error ? { error: result.error } : {})
  };
}

export async function runPaymentGateway(
  input: RunPaymentGatewayInput
): Promise<PaymentGatewayResult> {
  const now = input.now ?? new Date();

  const evaluator =
    input.evaluatePolicy ??
    evaluatePaymentsStrictV1;

  const decision = evaluator(
    input.mandate,
    input.action,
    input.evidence,
    {
      agentId: input.agentId,
      now
    }
  );

  if (decision.decision !== "ALLOW") {
    const receipt = createProofReceipt({
      mandate: input.mandate,
      action: input.action,
      evidence: input.evidence,
      decision,
      permit: null,
      execution: {
        status: decision.decision === "BLOCK" ? "BLOCKED" : "NOT_EXECUTED",
        code: `policy_${decision.decision.toLowerCase()}`,
        chainId: input.action.payload.chainId
      },
      ...(input.supplementalEvidence
        ? { supplementalEvidence: input.supplementalEvidence }
        : {}),
      ...(input.operationId ? { operationId: input.operationId } : {}),
      now
    });

    if (!verifyProofReceipt(receipt)) {
      throw new Error("generated_receipt_failed_verification");
    }

    return {
      decision,
      permit: null,
      execution: null,
      receipt
    };
  }

  const permit = mintPermit(
    input.mandate,
    input.action,
    input.evidence,
    decision,
    input.secret,
    {
      now,
      ttlSeconds: input.permitTtlSeconds ?? 30
    }
  );

  const execution = input.durableExecutionStore && input.sender && input.transactionIntent
    ? await executeDurableProtectedAction({
        mandate: input.mandate,
        permit,
        action: input.action,
        evidence: input.evidence,
        decision,
        secret: input.secret,
        permitStore: input.store,
        executionStore: input.durableExecutionStore,
        sender: input.sender,
        transactionIntent: input.transactionIntent,
        killSwitch: input.killSwitch,
        now,
        submit: async () => {
          const artifact = await input.execute(input.action);
          return {
            state: "CONFIRMED" as const,
            transactionHash: artifact.transactionHash
          };
        }
      }).then((result) => ({
        status: result.status,
        code: result.code,
        ...(result.transactionHash ? { result: { transactionHash: result.transactionHash } } : {}),
        ...(result.error ? { error: result.error } : {})
      }) as ExecutorResult<PaymentExecutionArtifact>)
    : await executeProtectedAction({
        mandate: input.mandate,
        permit,
        action: input.action,
        evidence: input.evidence,
        decision,
        secret: input.secret,
        store: input.store,
        execute: input.execute,
        now
      });

  const receipt = createProofReceipt({
    mandate: input.mandate,
    action: input.action,
    evidence: input.evidence,
    decision,
    permit,
    execution: receiptExecutionFrom(
      execution,
      input.action.payload.chainId,
      now
    ),
    ...(input.supplementalEvidence
      ? { supplementalEvidence: input.supplementalEvidence }
      : {}),
    ...(input.operationId ? { operationId: input.operationId } : {}),
    now
  });

  if (!verifyProofReceipt(receipt)) {
    throw new Error("generated_receipt_failed_verification");
  }

  return {
    decision,
    permit,
    execution,
    receipt
  };
}
