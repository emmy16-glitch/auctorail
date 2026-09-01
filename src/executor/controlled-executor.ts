import type { ActionContract } from "../core/action-contract.js";
import type { MandateContract } from "../core/mandate-contract.js";
import type { TelegraphEvidenceRecord } from "../evidence/telegraph.js";
import type { DecisionRecord } from "../policy/payments-strict-v1.js";
import {
  type Permit,
  type PermitVerificationCode,
  verifyPermit
} from "../permit/permit.js";
import type { PermitConsumptionStore } from "./permit-store.js";

export type ExecutorCode =
  | "executed"
  | "execution_failed"
  | "execution_ambiguous"
  | "permit_already_consumed"
  | PermitVerificationCode;

export interface ExecutorResult<T> {
  status: "EXECUTED" | "BLOCKED" | "FAILED" | "AMBIGUOUS";
  code: ExecutorCode;
  result?: T;
  consumedAt?: string;
  error?: string;
}

export class AmbiguousExecutionError extends Error {
  constructor(
    message: string,
    public readonly transactionHash?: string
  ) {
    super(message);
    this.name = "AmbiguousExecutionError";
  }
}

export interface ExecuteProtectedInput<T> {
  mandate: MandateContract;
  permit: Permit;
  action: ActionContract;
  evidence: TelegraphEvidenceRecord;
  decision: DecisionRecord;
  secret: string;
  store: PermitConsumptionStore;
  execute: (action: ActionContract) => Promise<T>;
  now?: Date;
}

export async function executeProtectedAction<T>(
  input: ExecuteProtectedInput<T>
): Promise<ExecutorResult<T>> {
  const now = input.now ?? new Date();

  const verification = verifyPermit(
    input.mandate,
    input.permit,
    input.action,
    input.evidence,
    input.decision,
    input.secret,
    { now }
  );

  if (!verification.valid) {
    return {
      status: "BLOCKED",
      code: verification.code
    };
  }

  const consumption = input.store.consume(
    input.permit.payload.permitId,
    input.permit.payload.nonce,
    now.toISOString()
  );

  if (!consumption.consumed) {
    return {
      status: "BLOCKED",
      code: "permit_already_consumed"
    };
  }

  try {
    const result = await input.execute(input.action);

    return {
      status: "EXECUTED",
      code: "executed",
      result,
      consumedAt: now.toISOString()
    };
  } catch (error: unknown) {
    if (error instanceof AmbiguousExecutionError) {
      return {
        status: "AMBIGUOUS",
        code: "execution_ambiguous",
        consumedAt: now.toISOString(),
        error: error.message,
        ...(error.transactionHash
          ? { result: { transactionHash: error.transactionHash } as T }
          : {})
      };
    }

    return {
      status: "FAILED",
      code: "execution_failed",
      consumedAt: now.toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
