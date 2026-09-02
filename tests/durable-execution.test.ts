import { describe, expect, it } from "vitest";
import {
  PostgresExecutionStore,
  allowedDurableExecutionTransitions,
  assertDurableExecutionTransition,
  type DurableExecutionState
} from "../src/executor/durable-execution.js";

type Row = Record<string, unknown>;
class FakeExecutionDatabase {
  rows = new Map<string, Row>();
  async query<RowType = Row>(text: string, values: readonly unknown[]): Promise<{ rows: RowType[] }> {
    const id = String(values[0]);
    if (text.includes("INSERT INTO executions")) {
      this.rows.set(id, {
        executionId: id,
        permitId: values[1],
        permitNonce: values[2],
        policyId: values[6],
        state: values[12],
        schemaVersion: values[13]
      });
      return { rows: [] };
    }
    if (text.includes("UPDATE executions")) {
      const row = this.rows.get(id);
      if (!row || row.state !== values[4]) return { rows: [] };
      row.state = values[1];
      if (values[2]) row.transactionHash = values[2];
      return { rows: [{ execution_id: id } as RowType] };
    }
    const row = this.rows.get(id);
    return { rows: row ? [row as RowType] : [] };
  }
}

const input = {
  executionId: "11111111-1111-4111-8111-111111111111",
  permitId: "permit-1",
  permitNonce: "nonce-1",
  mandateHash: "mandate-hash",
  actionHash: "action-hash",
  decisionHash: "decision-hash",
  policyId: "payments.strict.v1",
  chainId: 84532,
  sender: "0xsender",
  destination: "0xdestination",
  token: "0xtoken",
  amountRaw: "1000000",
  now: new Date("2026-09-01T19:00:00.000Z")
};

describe("durable execution state machine", () => {
  it("creates an AUTHORIZED record with all authorization bindings", async () => {
    const database = new FakeExecutionDatabase();
    const store = new PostgresExecutionStore(database);
    const record = await store.create(input);
    expect(record).toMatchObject({
      executionId: input.executionId,
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
      createdAt: input.now.toISOString(),
      updatedAt: input.now.toISOString()
    });
    expect(database.rows.get(input.executionId)).toMatchObject({ state: "AUTHORIZED", permitId: "permit-1" });
  });

  it("permits only the strict monotonic transitions", () => {
    const allowed: Array<[DurableExecutionState, DurableExecutionState]> = [
      ["AUTHORIZED", "CLAIMED"], ["CLAIMED", "SUBMITTING"], ["CLAIMED", "FAILED"],
      ["SUBMITTING", "BROADCAST"], ["SUBMITTING", "FAILED"], ["SUBMITTING", "AMBIGUOUS"],
      ["BROADCAST", "CONFIRMED"], ["BROADCAST", "REJECTED"], ["BROADCAST", "AMBIGUOUS"],
      ["AMBIGUOUS", "RECONCILING"], ["RECONCILING", "CONFIRMED"],
      ["RECONCILING", "REJECTED"], ["RECONCILING", "AMBIGUOUS"]
    ];
    for (const [from, to] of allowed) expect(() => assertDurableExecutionTransition(from, to)).not.toThrow();
    expect(allowedDurableExecutionTransitions("AMBIGUOUS")).toEqual(["RECONCILING"]);
  });

  it.each([
    ["CONFIRMED", "SUBMITTING"], ["REJECTED", "SUBMITTING"], ["FAILED", "SUBMITTING"],
    ["AMBIGUOUS", "SUBMITTING"], ["RECONCILING", "SUBMITTING"], ["BROADCAST", "SUBMITTING"],
    ["AUTHORIZED", "SUBMITTING"], ["CONFIRMED", "BROADCAST"]
  ])("rejects illegal transition %s -> %s", (from, to) => {
    expect(() => assertDurableExecutionTransition(from as DurableExecutionState, to as DurableExecutionState)).toThrow(`invalid_execution_transition:${from}->${to}`);
  });

  it("persists state transitions and transaction hashes", async () => {
    const database = new FakeExecutionDatabase();
    const store = new PostgresExecutionStore(database);
    await store.create(input);
    await store.transition(input.executionId, "AUTHORIZED", "CLAIMED", input.now);
    await store.transition(input.executionId, "CLAIMED", "SUBMITTING", input.now);
    await store.transition(input.executionId, "SUBMITTING", "AMBIGUOUS", input.now, "0xabc");
    await store.transition(input.executionId, "AMBIGUOUS", "RECONCILING", input.now);
    expect(database.rows.get(input.executionId)).toMatchObject({ state: "RECONCILING", transactionHash: "0xabc" });
    await expect(store.transition(input.executionId, "RECONCILING", "SUBMITTING", input.now)).rejects.toThrow("invalid_execution_transition:RECONCILING->SUBMITTING");
  });

  it("rejects stale concurrent state updates", async () => {
    const database = new FakeExecutionDatabase();
    const store = new PostgresExecutionStore(database);
    await store.create(input);
    const outcomes = await Promise.allSettled([
      store.transition(input.executionId, "AUTHORIZED", "CLAIMED", input.now),
      store.transition(input.executionId, "AUTHORIZED", "CLAIMED", input.now)
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((x) => x.status === "rejected")).toHaveLength(1);
  });
});
