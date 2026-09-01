import type {
  ActionContract
} from "../core/action-contract.js";

import type {
  TelegraphEvidenceRecord
} from "../evidence/telegraph.js";

import type {
  DecisionRecord
} from "../policy/payments-strict-v1.js";

import {
  type Permit,
  verifyPermit
} from "../permit/permit.js";

import type {
  PermitConsumptionStore
} from "./permit-store.js";

export type ExecutorCode =
  | "executed"
  | "execution_failed"
  | "permit_already_consumed"
  | "invalid_permit_signature"
  | "action_hash_mismatch"
  | "decision_hash_mismatch"
  | "permit_expired"
  | "decision_not_allow";

export interface ExecutorResult<T> {
  status:
    | "EXECUTED"
    | "BLOCKED"
    | "FAILED";

  code:
    ExecutorCode;

  result?: T;

  consumedAt?: string;

  error?: string;
}

export interface ExecuteProtectedInput<T> {
  permit: Permit;

  action: ActionContract;

  evidence:
    TelegraphEvidenceRecord;

  decision:
    DecisionRecord;

  secret: string;

  store:
    PermitConsumptionStore;

  execute:
    (
      action: ActionContract
    ) => Promise<T>;

  now?: Date;
}

export async function executeProtectedAction<T>(
  input:
    ExecuteProtectedInput<T>
): Promise<ExecutorResult<T>> {
  const now =
    input.now ??
    new Date();

  // Step 1:
  // independently verify authorization.
  const verification =
    verifyPermit(
      input.permit,
      input.action,
      input.evidence,
      input.decision,
      input.secret,
      { now }
    );

  if (!verification.valid) {
    return {
      status:
        "BLOCKED",

      code:
        verification.code
    };
  }

  // Step 2:
  // atomically claim the permit BEFORE
  // invoking the irreversible action.
  const consumption =
    input.store.consume(
      input.permit
        .payload
        .permitId,

      input.permit
        .payload
        .nonce,

      now.toISOString()
    );

  if (
    !consumption.consumed
  ) {
    return {
      status:
        "BLOCKED",

      code:
        "permit_already_consumed"
    };
  }

  // Step 3:
  // Only now can execution happen.
  try {
    const result =
      await input.execute(
        input.action
      );

    return {
      status:
        "EXECUTED",

      code:
        "executed",

      result,

      consumedAt:
        now.toISOString()
    };
  } catch (
    error: unknown
  ) {
    // Important:
    // the permit stays consumed.
    // We never replay a failed
    // irreversible operation blindly.
    return {
      status:
        "FAILED",

      code:
        "execution_failed",

      consumedAt:
        now.toISOString(),

      error:
        error instanceof Error
          ? error.message
          : String(error)
    };
  }
}
