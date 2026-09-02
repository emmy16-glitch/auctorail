import { randomUUID } from "node:crypto";
import type { PermitConsumptionDatabase } from "./permit-store.js";

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
  chainId: number;
  sender: string;
  destination: string;
  token: string;
  amountRaw: string;
  state: DurableExecutionState;
  transactionHash?: string;
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
      chainId: input.chainId,
      sender: input.sender,
      destination: input.destination,
      token: input.token,
      amountRaw: input.amountRaw,
      state: "AUTHORIZED",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    await this.database.query(
      `INSERT INTO executions
        (execution_id, permit_id, permit_nonce, mandate_hash, action_hash,
         decision_hash, chain_id, sender, destination, token, amount_raw,
         state, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               $12, $13::timestamptz, $14::timestamptz)`,
      [record.executionId, record.permitId, record.permitNonce, record.mandateHash, record.actionHash, record.decisionHash, record.chainId, record.sender, record.destination, record.token, record.amountRaw, record.state, record.createdAt, record.updatedAt]
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
              chain_id AS "chainId",
              sender, destination, token, amount_raw AS "amountRaw",
              state, transaction_hash AS "transactionHash",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM executions WHERE execution_id = $1::uuid`,
      [executionId]
    );
    return result.rows[0] ?? null;
  }
}
