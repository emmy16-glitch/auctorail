import { randomUUID } from "node:crypto";

export type SpendReservationStatus = "RESERVED" | "RELEASED" | "CONSUMED";

export interface SpendAuthority {
  authorityId: string;
  mandateHash: string;
  policyId: string;
  chainId: number;
  token: string;
  maxCumulativeRaw: string;
  reservedRaw: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpendReservation {
  authorityId: string;
  executionId: string;
  amountRaw: string;
  status: SpendReservationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SpendDatabase {
  query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[]
  ): Promise<{ rows: Row[] }>;
  transaction<T>(work: (database: SpendDatabase) => Promise<T>): Promise<T>;
}

function positiveInteger(value: string, field: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`invalid_${field}`);
  return BigInt(value);
}

export class PostgresSpendAuthorityStore {
  constructor(private readonly database: SpendDatabase) {}

  async createAuthority(input: Omit<SpendAuthority, "reservedRaw" | "createdAt" | "updatedAt"> & { now?: Date }): Promise<SpendAuthority> {
    if (!input.authorityId || !input.mandateHash || !input.policyId || input.chainId <= 0) throw new Error("invalid_spend_authority");
    positiveInteger(input.maxCumulativeRaw, "max_cumulative_raw");
    const now = (input.now ?? new Date()).toISOString();
    const authority: SpendAuthority = { ...input, reservedRaw: "0", createdAt: now, updatedAt: now };
    await this.database.query(
      `INSERT INTO spend_authorities
        (authority_id, mandate_hash, policy_id, chain_id, token,
         max_cumulative_raw, reserved_raw, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::numeric, 0, $7::timestamptz, $7::timestamptz)`,
      [authority.authorityId, authority.mandateHash, authority.policyId, authority.chainId, authority.token, authority.maxCumulativeRaw, now]
    );
    return authority;
  }

  async reserve(input: { authorityId: string; executionId: string; amountRaw: string; now?: Date }): Promise<{ reserved: boolean; code: "spend_reserved" | "spend_already_reserved" | "spend_exhausted"; reservation?: SpendReservation }> {
    positiveInteger(input.amountRaw, "spend_amount");
    if (!input.executionId || !input.authorityId) throw new Error("invalid_spend_reservation");
    return this.database.transaction(async (database) => {
      const now = (input.now ?? new Date()).toISOString();
      const existing = await database.query<SpendReservation>(
        `SELECT authority_id AS "authorityId", execution_id AS "executionId",
                amount_raw::text AS "amountRaw", status,
                created_at AS "createdAt", updated_at AS "updatedAt"
           FROM spend_reservations
          WHERE authority_id = $1 AND execution_id = $2::uuid
          FOR UPDATE`,
        [input.authorityId, input.executionId]
      );
      const prior = existing.rows[0];
      if (prior && prior.status !== "RELEASED") {
        return { reserved: false, code: "spend_already_reserved" as const, reservation: prior };
      }

      const authority = await database.query<{ authorityId: string; reservedRaw: string; maxCumulativeRaw: string }>(
        `SELECT authority_id AS "authorityId", reserved_raw::text AS "reservedRaw",
                max_cumulative_raw::text AS "maxCumulativeRaw"
           FROM spend_authorities
          WHERE authority_id = $1
          FOR UPDATE`,
        [input.authorityId]
      );
      const account = authority.rows[0];
      if (!account) return { reserved: false, code: "spend_exhausted" as const };
      if (BigInt(account.reservedRaw) + BigInt(input.amountRaw) > BigInt(account.maxCumulativeRaw)) {
        return { reserved: false, code: "spend_exhausted" as const };
      }

      await database.query(
        `UPDATE spend_authorities
            SET reserved_raw = reserved_raw + $2::numeric,
                updated_at = $3::timestamptz
          WHERE authority_id = $1`,
        [input.authorityId, input.amountRaw, now]
      );
      if (prior?.status === "RELEASED") {
        const result = await database.query<SpendReservation>(
          `UPDATE spend_reservations
              SET amount_raw = $3::numeric, status = 'RESERVED', updated_at = $4::timestamptz
            WHERE authority_id = $1 AND execution_id = $2::uuid
            RETURNING authority_id AS "authorityId", execution_id AS "executionId", amount_raw::text AS "amountRaw", status, created_at AS "createdAt", updated_at AS "updatedAt"`,
          [input.authorityId, input.executionId, input.amountRaw, now]
        );
        return { reserved: true, code: "spend_reserved" as const, reservation: result.rows[0] };
      }
      const reservation: SpendReservation = {
        authorityId: input.authorityId,
        executionId: input.executionId,
        amountRaw: input.amountRaw,
        status: "RESERVED",
        createdAt: now,
        updatedAt: now
      };
      await database.query(
        `INSERT INTO spend_reservations
          (authority_id, execution_id, amount_raw, status, created_at, updated_at)
         VALUES ($1, $2::uuid, $3::numeric, 'RESERVED', $4::timestamptz, $4::timestamptz)`,
        [reservation.authorityId, reservation.executionId, reservation.amountRaw, now]
      );
      return { reserved: true, code: "spend_reserved" as const, reservation };
    });
  }

  async release(authorityId: string, executionId: string, now = new Date()): Promise<void> {
    await this.database.transaction(async (database) => {
      const rows = await database.query<{ amountRaw: string; status: SpendReservationStatus }>(
        `SELECT amount_raw::text AS "amountRaw", status
           FROM spend_reservations
          WHERE authority_id = $1 AND execution_id = $2::uuid
          FOR UPDATE`,
        [authorityId, executionId]
      );
      const reservation = rows.rows[0];
      if (!reservation || reservation.status !== "RESERVED") return;
      await database.query(`UPDATE spend_authorities SET reserved_raw = reserved_raw - $2::numeric, updated_at = $3::timestamptz WHERE authority_id = $1`, [authorityId, reservation.amountRaw, now.toISOString()]);
      await database.query(`UPDATE spend_reservations SET status = 'RELEASED', updated_at = $3::timestamptz WHERE authority_id = $1 AND execution_id = $2::uuid`, [authorityId, executionId, now.toISOString()]);
    });
  }

  async consume(authorityId: string, executionId: string, now = new Date()): Promise<void> {
    await this.database.transaction(async (database) => {
      const result = await database.query(`UPDATE spend_reservations SET status = 'CONSUMED', updated_at = $3::timestamptz WHERE authority_id = $1 AND execution_id = $2::uuid AND status = 'RESERVED'`, [authorityId, executionId, now.toISOString()]);
      if (result.rows.length === 0) return;
    });
  }
}

export function newSpendAuthorityId(): string {
  return randomUUID();
}
