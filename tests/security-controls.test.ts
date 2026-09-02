import { describe, expect, it } from "vitest";
import { SecurityAuditLog, type SecurityAuditEvent } from "../src/security/audit-log.js";
import { DurableExecutionKillSwitch } from "../src/security/execution-kill-switch.js";

describe("security operational controls", () => {
  it("emits structured correlated audit events without arbitrary payloads", async () => {
    const events: SecurityAuditEvent[] = [];
    const log = new SecurityAuditLog({ append: async (event) => { events.push(event); } });
    await log.record("permit_claimed", { executionId: "execution-1", actionHash: "action-1", permitId: "permit-1" }, { worker: "test", retry: 0 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "permit_claimed", executionId: "execution-1", actionHash: "action-1", permitId: "permit-1", metadata: { worker: "test", retry: 0 } });
    expect(events[0].occurredAt).toMatch(/Z$/);
  });

  it("supports durable disable and enable operations", async () => {
    let state = { disabled: false };
    const switchControl = new DurableExecutionKillSwitch({ read: async () => state, write: async (next) => { state = next; } });
    await expect(switchControl.isDisabled()).resolves.toBe(false);
    await switchControl.disable("incident");
    await expect(switchControl.isDisabled()).resolves.toBe(true);
    await switchControl.enable("resolved");
    await expect(switchControl.isDisabled()).resolves.toBe(false);
  });

  it("fails closed when the kill-switch store is unavailable", async () => {
    const switchControl = new DurableExecutionKillSwitch({ read: async () => { throw new Error("store unavailable"); }, write: async () => {} });
    await expect(switchControl.isDisabled()).resolves.toBe(true);
  });
});
