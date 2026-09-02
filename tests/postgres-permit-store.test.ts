import { describe, expect, it } from "vitest";
import {
  PostgresPermitConsumptionStore,
  type PermitConsumptionDatabase
} from "../src/executor/permit-store.js";

class FakeDatabase implements PermitConsumptionDatabase {
  readonly claims = new Map<string, string>();
  failure: unknown;
  queries: string[] = [];

  async query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[]
  ): Promise<{ rows: Row[] }> {
    this.queries.push(text);
    if (this.failure !== undefined) {
      throw this.failure;
    }
    const [permitId, nonce, consumedAt, executionId] = values as string[];
    const key = `${permitId}:${nonce}`;
    if (text.includes("INSERT INTO")) {
      if (this.claims.has(key)) {
        return { rows: [] };
      }
      this.claims.set(key, `${consumedAt}:${executionId}`);
      return { rows: [{ permit_id: permitId } as Row] };
    }
    return {
      rows: this.claims.has(key)
        ? ([{ permit_id: permitId } as Row])
        : []
    };
  }
}

describe("PostgresPermitConsumptionStore", () => {
  it("claims a permit once and uses an atomic insert", async () => {
    const database = new FakeDatabase();
    const store = new PostgresPermitConsumptionStore(database);

    await expect(
      store.consume("permit-1", "nonce-1", "2026-09-01T19:00:00.000Z", "11111111-1111-4111-8111-111111111111")
    ).resolves.toEqual({ consumed: true, code: "permit_consumed" });
    expect(database.queries[0]).toContain("ON CONFLICT (permit_id, nonce)");
    await expect(
      store.isConsumed("permit-1", "nonce-1")
    ).resolves.toBe(true);
  });

  it("rejects sequential replay and duplicate conflicts", async () => {
    const store = new PostgresPermitConsumptionStore(new FakeDatabase());
    await expect(store.consume("permit-2", "nonce-2", "2026-09-01T19:00:00.000Z")).resolves.toEqual({ consumed: true, code: "permit_consumed" });
    await expect(store.consume("permit-2", "nonce-2", "2026-09-01T19:00:01.000Z")).resolves.toEqual({ consumed: false, code: "permit_already_consumed" });
  });

  for (const count of [2, 5, 10, 25, 50, 100]) {
    it(`allows exactly one winner across ${count} concurrent claims`, async () => {
      const store = new PostgresPermitConsumptionStore(new FakeDatabase());
      const results = await Promise.all(
        Array.from({ length: count }, (_, i) =>
          store.consume("permit-race", "nonce-race", "2026-09-01T19:00:00.000Z", `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`)
        )
      );
      expect(results.filter((r) => r.consumed)).toHaveLength(1);
      expect(results.filter((r) => !r.consumed)).toHaveLength(count - 1);
    });
  }

  it.each([
    ["database unavailable", new Error("database unavailable")],
    ["connection failure", Object.assign(new Error("connection reset"), { code: "ECONNRESET" })],
    ["simulated timeout", Object.assign(new Error("query timeout"), { code: "ETIMEDOUT" })],
    ["serialization error", Object.assign(new Error("serialization failure"), { code: "40001" })],
    ["unknown database exception", "unknown database failure"]
  ])("propagates %s rather than interpreting it as replay", async (_label, failure) => {
    const database = new FakeDatabase();
    database.failure = failure;
    const store = new PostgresPermitConsumptionStore(database);
    await expect(store.consume("permit-error", "nonce-error", "2026-09-01T19:00:00.000Z")).rejects.toBe(failure);
    await expect(store.isConsumed("permit-error", "nonce-error")).rejects.toBe(failure);
  });
});
