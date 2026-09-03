import type {
  GeneralActionEnvelope
} from "../core/general-action.js";
import type {
  GeneralMandate
} from "../core/general-mandate.js";
import {
  verifyGeneralPermit,
  type GeneralAuthorizationDecision,
  type GeneralPermit
} from "../permit/general-permit.js";
import type {
  PermitVerifier
} from "../permit/signer.js";
import type {
  ExecutionKillSwitch
} from "../security/execution-kill-switch.js";
import type {
  PermitConsumptionStore
} from "./permit-store.js";

export type GeneralExecutionStatus =
  | "EXECUTED"
  | "BLOCKED"
  | "FAILED"
  | "AMBIGUOUS";

export interface GeneralExecutionResult<T = unknown> {
  status: GeneralExecutionStatus;
  code: string;
  executionId: string;
  result?: T;
  error?: string;
}

export async function executeGeneralAction<T>(input: {
  mandate: GeneralMandate;
  action: GeneralActionEnvelope;
  decision: GeneralAuthorizationDecision;
  permit: GeneralPermit;
  verifier: PermitVerifier;
  store: PermitConsumptionStore;
  killSwitch: ExecutionKillSwitch;
  executionId: string;
  execute: (action: GeneralActionEnvelope) => Promise<T>;
  now?: Date;
}): Promise<GeneralExecutionResult<T>> {
  // The operational kill switch is checked before permit claiming or any
  // protected callback. Failure to read it fails closed.
  let disabled: boolean;
  try {
    disabled = await input.killSwitch.isDisabled();
  } catch (error: unknown) {
    return {
      status: "BLOCKED",
      code: "general_execution_kill_switch_unavailable",
      executionId: input.executionId,
      error: error instanceof Error
        ? error.message
        : String(error)
    };
  }

  if (disabled) {
    return {
      status: "BLOCKED",
      code: "general_execution_disabled",
      executionId: input.executionId
    };
  }

  const verification = verifyGeneralPermit({
    mandate: input.mandate,
    action: input.action,
    decision: input.decision,
    permit: input.permit,
    verifier: input.verifier,
    now: input.now
  });

  if (!verification.valid) {
    return {
      status: "BLOCKED",
      code: verification.code,
      executionId: input.executionId
    };
  }

  const consumedAt =
    (input.now ?? new Date()).toISOString();

  let claim;
  try {
    claim = await Promise.resolve(
      input.store.consume(
        input.permit.payload.permitId,
        input.permit.payload.nonce,
        consumedAt,
        input.executionId
      )
    );
  } catch (error: unknown) {
    return {
      status: "FAILED",
      code: "general_permit_store_failed",
      executionId: input.executionId,
      error: error instanceof Error
        ? error.message
        : String(error)
    };
  }

  if (!claim.consumed) {
    return {
      status: "BLOCKED",
      code: claim.code,
      executionId: input.executionId
    };
  }

  try {
    const result = await input.execute(input.action);
    return {
      status: "EXECUTED",
      code: "general_action_executed",
      executionId: input.executionId,
      result
    };
  } catch (error: unknown) {
    // The permit remains consumed. For arbitrary external effects an exception
    // cannot prove whether the side effect happened before the transport/runtime
    // failure, so ProofGate fails into AMBIGUOUS and never retries automatically.
    return {
      status: "AMBIGUOUS",
      code: "general_action_execution_ambiguous",
      executionId: input.executionId,
      error: error instanceof Error
        ? error.message
        : String(error)
    };
  }
}
