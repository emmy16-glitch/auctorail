import { randomUUID } from "node:crypto";
import type { PermitConsumptionDatabase } from "./permit-store.js";
import type { ExecutionKillSwitch } from "../security/execution-kill-switch.js";

export type DurableExecutionState =
  | "AUTHORIZED"
  | "CLAIMED"
  | "SUBMITTING"
  | "BROADCAST"
  | "CONFIRMED"
  | "REJECTED"
  | "AMBIGUOUS"
  | "RECONCILING"
  | "FAILED";

export interface DurableExecutionRecord {
  executionId: string;
  permitId: string;
  permitNonce: string;
  mandateHash: string;
  actionHash: string;
  decisionHash: string;
  policyId: string;
  chainId: number;
  sender: string;
  destination: string;
  token: string;
  amountRaw: string;
  state: DurableExecutionState;
  transactionHash?: string;
  providerRequestId?: string;
  senderNonce?: string;
  lastReconciledAt?: string;
  failureClass?: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDurableExecutionInput {
  executionId?: string;
  permitId: string;
  permitNonce: string;
  mandateHash: string;
  actionHash: string;
  decisionHash: string;
  policyId: string;
  chainId: number;
  sender: string;
  destination: string;
  token: string;
  amountRaw: string;
  now?: Date;
}

export interface ExecutionDatabase {
  query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[]
  ): Promise<{ rows: Row[] }>;
}

const ALLOWED_TRANSITIONS: Record<DurableExecutionState, ReadonlySet<DurableExecutionState>> = {
  AUTHORIZED: new Set(["CLAIMED"]),
  CLAIMED: new Set(["SUBMITTING", "FAILED"]),
  SUBMITTING: new Set(["BROADCAST", "FAILED", "AMBIGUOUS"]),
  BROADCAST: new Set(["CONFIRMED", "REJECTED", "AMBIGUOUS"]),
  AMBIGUOUS: new Set(["RECONCILING"]),
  RECONCILING: new Set(["CONFIRMED", "REJECTED", "AMBIGUOUS"]),
  CONFIRMED: new Set(),
  REJECTED: new Set(),
  FAILED: new Set()
};

export function assertDurableExecutionTransition(
  from: DurableExecutionState,
  to: DurableExecutionState
): void {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS[from].has(to)) {
    throw new Error(`invalid_execution_transition:${from}->${to}`);
  }
}

export function allowedDurableExecutionTransitions(
  state: DurableExecutionState
): readonly DurableExecutionState[] {
  return [...ALLOWED_TRANSITIONS[state]];
}

/** Shared durable execution state; database errors intentionally propagate. */
export class PostgresExecutionStore {
  constructor(private readonly database: ExecutionDatabase) {}

  async create(input: CreateDurableExecutionInput): Promise<DurableExecutionRecord> {
    const now = input.now ?? new Date();
    const executionId = input.executionId ?? randomUUID();
    const record: DurableExecutionRecord = {
      executionId,
      permitId: input.permitId,
      permitNonce: input.permitNonce,
      mandateHash: input.mandateHash,
      actionHash: input.actionHash,
      decisionHash: input.decisionHash,
      policyId: input.policyId,
      chainId: input.chainId,
      sender: input.sender,
      destination: input.destination,
      token: input.token,
      amountRaw: input.amountRaw,
      state: "AUTHORIZED",
      schemaVersion: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    await this.database.query(
      `INSERT INTO executions
        (execution_id, permit_id, permit_nonce, mandate_hash, action_hash,
         decision_hash, policy_id, chain_id, sender, destination, token,
         amount_raw, state, schema_version, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               $13, $14, $15::timestamptz, $16::timestamptz)`,
      [record.executionId, record.permitId, record.permitNonce, record.mandateHash, record.actionHash, record.decisionHash, record.policyId, record.chainId, record.sender, record.destination, record.token, record.amountRaw, record.state, record.schemaVersion, record.createdAt, record.updatedAt]
    );
    return record;
  }

  async transition(
    executionId: string,
    from: DurableExecutionState,
    to: DurableExecutionState,
    now: Date = new Date(),
    transactionHash?: string
  ): Promise<void> {
    assertDurableExecutionTransition(from, to);
    const result = await this.database.query(
      `UPDATE executions
       SET state = $2,
           transaction_hash = COALESCE($3, transaction_hash),
           updated_at = $4::timestamptz
       WHERE execution_id = $1::uuid AND state = $5
       RETURNING execution_id`,
      [executionId, to, transactionHash ?? null, now.toISOString(), from]
    );
    if (result.rows.length === 0) {
      throw new Error("execution_state_conflict");
    }
  }

  async get(executionId: string): Promise<DurableExecutionRecord | null> {
    const result = await this.database.query<DurableExecutionRecord>(
      `SELECT execution_id AS "executionId",
              permit_id AS "permitId",
              permit_nonce AS "permitNonce",
              mandate_hash AS "mandateHash",
              action_hash AS "actionHash",
              decision_hash AS "decisionHash",
              policy_id AS "policyId",
              chain_id AS "chainId",
              sender, destination, token, amount_raw AS "amountRaw",
              state, transaction_hash AS "transactionHash",
              provider_request_id AS "providerRequestId",
              sender_nonce AS "senderNonce",
              last_reconciled_at AS "lastReconciledAt",
              failure_class AS "failureClass",
              schema_version AS "schemaVersion",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM executions WHERE execution_id = $1::uuid`,
      [executionId]
    );
    return result.rows[0] ?? null;
  }
}


export interface DurableSubmissionResult {
  state: "CONFIRMED" | "REJECTED" | "BROADCAST" | "AMBIGUOUS";
  transactionHash?: string;
}

export interface DurableExecutionResult {
  status: "EXECUTED" | "BLOCKED" | "FAILED" | "AMBIGUOUS";
  code: string;
  executionId?: string;
  transactionHash?: string;
  error?: string;
}

/**
 * Production-oriented orchestration boundary. A provider callback is not
 * invoked until durable authorization, permit claim, CLAIMED, and SUBMITTING
 * have all succeeded. Recovery must call the reconciler for non-terminal
 * durable states instead of calling this submission path again.
 */
export async function executeDurableProtectedAction(
  input: {
    mandate: import("../core/mandate-contract.js").MandateContract;
    permit: import("../permit/permit.js").Permit;
    action: import("../core/action-contract.js").ActionContract;
    evidence: import("../evidence/telegraph.js").TelegraphEvidenceRecord;
    decision: import("../policy/payments-strict-v1.js").DecisionRecord;
    secret: string;
    permitStore: import("./permit-store.js").PermitConsumptionStore;
    executionStore: PostgresExecutionStore;
    killSwitch?: ExecutionKillSwitch;
    sender: string;
    now?: Date;
    submit: () => Promise<DurableSubmissionResult>;
  }
): Promise<DurableExecutionResult> {
  const now = input.now ?? new Date();
  if (input.killSwitch && await input.killSwitch.isDisabled()) {
    return { status: "FAILED", code: "execution_disabled" };
  }
  const { verifyPermit } = await import("../permit/permit.js");
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
    return { status: "BLOCKED", code: verification.code };
  }

  let record: DurableExecutionRecord;
  try {
    record = await input.executionStore.create({
      permitId: input.permit.payload.permitId,
      permitNonce: input.permit.payload.nonce,
      mandateHash: input.mandate.mandateHash,
      actionHash: input.action.actionHash,
      decisionHash: input.permit.payload.decisionHash,
      policyId: input.action.policyId,
      chainId: input.action.payload.chainId,
      sender: input.sender,
      destination: input.action.payload.destination,
      token: input.action.payload.token,
      amountRaw: input.action.payload.amountRaw,
      now
    });
  } catch {
    return { status: "FAILED", code: "execution_store_unavailable" };
  }

  try {
    const claim = await input.permitStore.consume(
      input.permit.payload.permitId,
      input.permit.payload.nonce,
      now.toISOString(),
      record.executionId
    );
    if (!claim.consumed) {
      return {
        status: "BLOCKED",
        code: "permit_already_consumed",
        executionId: record.executionId
      };
    }
  } catch {
    return {
      status: "FAILED",
      code: "permit_store_unavailable",
      executionId: record.executionId
    };
  }

  try {
    await input.executionStore.transition(
      record.executionId,
      "AUTHORIZED",
      "CLAIMED",
      now
    );
    await input.executionStore.transition(
      record.executionId,
      "CLAIMED",
      "SUBMITTING",
      now
    );
  } catch {
    return {
      status: "FAILED",
      code: "execution_state_unavailable",
      executionId: record.executionId
    };
  }

  let submission: DurableSubmissionResult;
  try {
    submission = await input.submit();
  } catch {
    // Once SUBMITTING is durable, provider contact is possible. Do not label
    // an unknown provider outcome as FAILED or invoke the provider again.
    try {
      await input.executionStore.transition(
        record.executionId,
        "SUBMITTING",
        "AMBIGUOUS",
        now
      );
    } catch {
      // The durable state is already at least SUBMITTING; fail closed.
    }
    return {
      status: "AMBIGUOUS",
      code: "execution_ambiguous",
      executionId: record.executionId
    };
  }

  try {
    await input.executionStore.transition(
      record.executionId,
      "SUBMITTING",
      submission.state === "BROADCAST" ? "BROADCAST" : submission.state,
      now,
      submission.transactionHash
    );
    if (submission.state === "BROADCAST") {
      return {
        status: "AMBIGUOUS",
        code: "execution_ambiguous",
        executionId: record.executionId,
        ...(submission.transactionHash ? { transactionHash: submission.transactionHash } : {})
      };
    }
    return {
      status: submission.state === "CONFIRMED" ? "EXECUTED" : "FAILED",
      code: submission.state === "CONFIRMED" ? "executed" : "execution_rejected",
      executionId: record.executionId,
      ...(submission.transactionHash ? { transactionHash: submission.transactionHash } : {})
    };
  } catch {
    return {
      status: "AMBIGUOUS",
      code: "execution_state_unavailable",
      executionId: record.executionId,
      ...(submission.transactionHash ? { transactionHash: submission.transactionHash } : {})
    };
  }
}
