import { describe, expect, it } from "vitest";
import { PostgresSpendAuthorityStore, type SpendDatabase } from "../src/executor/spend-authority.js";

class FakeSpendDatabase implements SpendDatabase {
  authority = { authorityId: "auth-1", mandateHash: "mh", policyId: "payments.strict.v1", chainId: 84532, token: "token", maxCumulativeRaw: "100", reservedRaw: "0" };
  reservations = new Map<string, { authorityId: string; executionId: string; amountRaw: string; status: string; createdAt: string; updatedAt: string }>();

  async transaction<T>(work: (database: SpendDatabase) => Promise<T>): Promise<T> { return work(this); }

  async query<Row = Record<string, unknown>>(text: string, values: readonly unknown[]): Promise<{ rows: Row[] }> {
    if (text.includes("FROM spend_reservations")) {
      const key = `${values[0]}:${values[1]}`;
      const row = this.reservations.get(key);
      return { rows: row ? [row as Row] : [] };
    }
    if (text.includes("FROM spend_authorities")) {
      return { rows: [this.authority as Row] };
    }
    if (text.includes("UPDATE spend_authorities")) {
      this.authority.reservedRaw = (BigInt(this.authority.reservedRaw) + (text.includes(" - ") ? -BigInt(String(values[1])) : BigInt(String(values[1])))).toString();
      return { rows: [] };
    }
    if (text.includes("INSERT INTO spend_reservations")) {
      const now = String(values[3]);
      this.reservations.set(`${values[0]}:${values[1]}`, { authorityId: String(values[0]), executionId: String(values[1]), amountRaw: String(values[2]), status: "RESERVED", createdAt: now, updatedAt: now });
      return { rows: [] };
    }
    if (text.includes("UPDATE spend_reservations")) {
      const key = `${values[0]}:${values[1]}`;
      const row = this.reservations.get(key);
      if (row) { row.status = text.includes("'CONSUMED'") ? "CONSUMED" : "RELEASED"; row.updatedAt = String(values[2]); }
      return { rows: [] };
    }
    if (text.includes("INSERT INTO spend_authorities")) return { rows: [] };
    throw new Error(`unhandled query: ${text}`);
  }
}

describe("durable cumulative spend authority", () => {
  it("reserves within the cumulative limit and rejects overspend", async () => {
    const db = new FakeSpendDatabase();
    const store = new PostgresSpendAuthorityStore(db);
    expect((await store.reserve({ authorityId: "auth-1", executionId: "00000000-0000-0000-0000-000000000001", amountRaw: "60" })).reserved).toBe(true);
    expect((await store.reserve({ authorityId: "auth-1", executionId: "00000000-0000-0000-0000-000000000002", amountRaw: "41" })).code).toBe("spend_exhausted");
    expect(db.authority.reservedRaw).toBe("60");
  });

  it("is idempotent for the same execution and does not double-reserve", async () => {
    const db = new FakeSpendDatabase();
    const store = new PostgresSpendAuthorityStore(db);
    const executionId = "00000000-0000-0000-0000-000000000003";
    expect((await store.reserve({ authorityId: "auth-1", executionId, amountRaw: "30" })).reserved).toBe(true);
    expect((await store.reserve({ authorityId: "auth-1", executionId, amountRaw: "30" })).code).toBe("spend_already_reserved");
    expect(db.authority.reservedRaw).toBe("30");
  });

  it("releases a failed reservation and consumes a confirmed reservation", async () => {
    const db = new FakeSpendDatabase();
    const store = new PostgresSpendAuthorityStore(db);
    const executionId = "00000000-0000-0000-0000-000000000004";
    await store.reserve({ authorityId: "auth-1", executionId, amountRaw: "25" });
    await store.release("auth-1", executionId);
    expect(db.authority.reservedRaw).toBe("0");
    expect(db.reservations.get(`auth-1:${executionId}`)?.status).toBe("RELEASED");
    await store.reserve({ authorityId: "auth-1", executionId, amountRaw: "25" });
    await store.consume("auth-1", executionId);
    expect(db.reservations.get(`auth-1:${executionId}`)?.status).toBe("CONSUMED");
  });
});
