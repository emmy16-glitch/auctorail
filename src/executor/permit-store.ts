import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export interface PermitConsumption {
  permitId: string;
  nonce: string;
  consumedAt: string;
  executionId?: string;
}

export interface ConsumeResult {
  consumed: boolean;
  code:
    | "permit_consumed"
    | "permit_already_consumed";
}

export type MaybePromise<T> = T | Promise<T>;

/** Stores may be synchronous (local filesystem) or asynchronous (shared DB). */
export interface PermitConsumptionStore {
  consume(
    permitId: string,
    nonce: string,
    consumedAt: string,
    executionId?: string
  ): MaybePromise<ConsumeResult>;

  isConsumed(
    permitId: string,
    nonce: string
  ): MaybePromise<boolean>;
}

export interface PermitConsumptionQueryResult<Row = Record<string, unknown>> {
  rows: Row[];
}

/** Injected query boundary; core code does not depend on a hosting vendor. */
export interface PermitConsumptionDatabase {
  query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[]
  ): Promise<PermitConsumptionQueryResult<Row>>;
}

function keyFor(
  permitId: string,
  nonce: string
): string {
  return createHash("sha256")
    .update(`${permitId}:${nonce}`)
    .digest("hex");
}

export class FilePermitConsumptionStore
implements PermitConsumptionStore {
  constructor(
    private readonly directory:
      string = ".proofgate/consumed"
  ) {
    fs.mkdirSync(
      this.directory,
      { recursive: true }
    );
  }

  private filePath(
    permitId: string,
    nonce: string
  ): string {
    return path.join(
      this.directory,
      `${keyFor(
        permitId,
        nonce
      )}.json`
    );
  }

  consume(
    permitId: string,
    nonce: string,
    consumedAt: string,
    _executionId?: string
  ): ConsumeResult {
    const file =
      this.filePath(
        permitId,
        nonce
      );

    const record:
      PermitConsumption = {
        permitId,
        nonce,
        consumedAt
      };

    try {
      fs.writeFileSync(
        file,
        JSON.stringify(
          record,
          null,
          2
        ),
        {
          flag: "wx",
          mode: 0o600
        }
      );

      return {
        consumed: true,
        code:
          "permit_consumed"
      };
    } catch (
      error: unknown
    ) {
      const code =
        (error as NodeJS.ErrnoException)
          .code;

      if (code === "EEXIST") {
        return {
          consumed: false,
          code:
            "permit_already_consumed"
        };
      }

      throw error;
    }
  }

  isConsumed(
    permitId: string,
    nonce: string
  ): boolean {
    return fs.existsSync(
      this.filePath(
        permitId,
        nonce
      )
    );
  }
}


/**
 * Shared PostgreSQL candidate. The database client/pool is injected so core
 * authorization code remains independent of a hosting vendor or pg package.
 * Apply migrations/001_permit_consumptions.sql before using this adapter.
 */
export class PostgresPermitConsumptionStore
  implements PermitConsumptionStore {
  constructor(
    private readonly database: PermitConsumptionDatabase
  ) {}

  async consume(
    permitId: string,
    nonce: string,
    consumedAt: string,
    executionId: string = randomUUID()
  ): Promise<ConsumeResult> {
    const result =
      await this.database.query<{ permit_id: string }>(
        `INSERT INTO permit_consumptions
           (permit_id, nonce, consumed_at, execution_id)
         VALUES ($1, $2, $3::timestamptz, $4::uuid)
         ON CONFLICT (permit_id, nonce)
         DO NOTHING
         RETURNING permit_id`,
        [permitId, nonce, consumedAt, executionId]
      );

    return result.rows.length > 0
      ? {
          consumed: true,
          code: "permit_consumed"
        }
      : {
          consumed: false,
          code: "permit_already_consumed"
        };
  }

  async isConsumed(
    permitId: string,
    nonce: string
  ): Promise<boolean> {
    const result =
      await this.database.query<{ permit_id: string }>(
        `SELECT permit_id
         FROM permit_consumptions
         WHERE permit_id = $1 AND nonce = $2
         LIMIT 1`,
        [permitId, nonce]
      );
    return result.rows.length > 0;
  }
}
