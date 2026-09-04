import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type OperationKind =
  | "telegraph_proof"
  | "onchain_execution"
  | "contract_deployment";

export type OperationState =
  | "PREPARED"
  | "PAYMENT_ATTEMPT_STARTED"
  | "BROADCAST"
  | "CONFIRMED"
  | "BLOCKED"
  | "HOLD"
  | "FAILED"
  | "AMBIGUOUS";

export interface OperationJournalEntry {
  operationId: string;
  kind: OperationKind;
  state: OperationState;
  createdAt: string;
  updatedAt: string;
  actionHash?: string;
  target?: string;
  transactionHash?: string;
  metadata: Record<string, unknown>;
}

export interface CreateOperationInput {
  kind: OperationKind;
  state?: OperationState;
  actionHash?: string;
  target?: string;
  transactionHash?: string;
  metadata?: Record<string, unknown>;
  now?: Date;
}

export interface UpdateOperationInput {
  state: OperationState;
  transactionHash?: string;
  metadata?: Record<string, unknown>;
  now?: Date;
}

const ALLOWED_TRANSITIONS: Record<OperationState, ReadonlySet<OperationState>> = {
  PREPARED: new Set([
    "PAYMENT_ATTEMPT_STARTED",
    "BROADCAST",
    "CONFIRMED",
    "BLOCKED",
    "HOLD",
    "FAILED",
    "AMBIGUOUS"
  ]),
  PAYMENT_ATTEMPT_STARTED: new Set([
    "CONFIRMED",
    "BLOCKED",
    "HOLD",
    "FAILED",
    "AMBIGUOUS"
  ]),
  BROADCAST: new Set([
    "CONFIRMED",
    "FAILED",
    "AMBIGUOUS"
  ]),
  AMBIGUOUS: new Set([
    "BROADCAST",
    "CONFIRMED",
    "FAILED",
    "HOLD"
  ]),
  CONFIRMED: new Set(),
  BLOCKED: new Set(),
  HOLD: new Set(),
  FAILED: new Set()
};

function validateOperationId(operationId: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      operationId
    )
  ) {
    throw new Error("invalid_operation_id");
  }
}

function assertTransition(from: OperationState, to: OperationState): void {
  if (from === to) {
    return;
  }

  if (!ALLOWED_TRANSITIONS[from].has(to)) {
    throw new Error(`invalid_operation_transition:${from}->${to}`);
  }
}

export class FileOperationJournal {
  constructor(
    private readonly directory = ".proofgate/operations"
  ) {
    fs.mkdirSync(this.directory, { recursive: true });
  }

  private filePath(operationId: string): string {
    validateOperationId(operationId);
    return path.join(this.directory, `${operationId}.json`);
  }

  create(input: CreateOperationInput): OperationJournalEntry {
    const now = input.now ?? new Date();
    const operationId = randomUUID();

    const entry: OperationJournalEntry = {
      operationId,
      kind: input.kind,
      state: input.state ?? "PREPARED",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      ...(input.actionHash ? { actionHash: input.actionHash } : {}),
      ...(input.target ? { target: input.target } : {}),
      ...(input.transactionHash ? { transactionHash: input.transactionHash } : {}),
      metadata: input.metadata ?? {}
    };

    fs.writeFileSync(
      this.filePath(operationId),
      JSON.stringify(entry, null, 2),
      { flag: "wx", mode: 0o600 }
    );

    return entry;
  }

  get(operationId: string): OperationJournalEntry | null {
    const file = this.filePath(operationId);

    if (!fs.existsSync(file)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(file, "utf8")) as OperationJournalEntry;
  }

  update(
    operationId: string,
    input: UpdateOperationInput
  ): OperationJournalEntry {
    const current = this.get(operationId);

    if (!current) {
      throw new Error("operation_not_found");
    }

    assertTransition(current.state, input.state);

    const now = input.now ?? new Date();

    const next: OperationJournalEntry = {
      ...current,
      state: input.state,
      updatedAt: now.toISOString(),
      ...(input.transactionHash !== undefined
        ? { transactionHash: input.transactionHash }
        : {}),
      metadata: {
        ...current.metadata,
        ...(input.metadata ?? {})
      }
    };

    const file = this.filePath(operationId);
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;

    fs.writeFileSync(temporary, JSON.stringify(next, null, 2), {
      flag: "wx",
      mode: 0o600
    });

    fs.renameSync(temporary, file);

    return next;
  }
}
