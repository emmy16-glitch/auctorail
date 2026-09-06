import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import { createMandateContract, type MandateContract } from "../src/core/mandate-contract.js";
import { loadTelegraphEvidence } from "../src/evidence/telegraph.js";
import type { DecisionRecord } from "../src/policy/payments-strict-v1.js";
import { mintPermit } from "../src/permit/permit.js";
import {
  FilePermitConsumptionStore,
  type PermitConsumptionStore
} from "../src/executor/permit-store.js";
import { executeProtectedAction } from "../src/executor/controlled-executor.js";

const AGENT = "procurement-agent";
const SECRET = "proofgate-executor-test-" + "x".repeat(64);

function evidence() {
  const directory = path.join(process.cwd(), "data", "evidence");
  const file = fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort().at(-1);
  if (!file) throw new Error("Real Telegraph evidence missing");
  return loadTelegraphEvidence(path.join(directory, file));
}

function store() {
  return new FilePermitConsumptionStore(
    fs.mkdtempSync(path.join(os.tmpdir(), "proofgate-"))
  );
}

function mandate(destination: string) {
  return createMandateContract({
    mandateId: "executor-unit-mandate",
    principalId: "unit-principal",
    agentId: AGENT,
    allowedActionTypes: ["payment"],
    allowedChainIds: [BASE_SEPOLIA_CHAIN_ID],
    allowedAssets: [BASE_SEPOLIA_USDC],
    allowedDestinations: [destination],
    maxPerActionRaw: "20000000",
    requiredIntents: ["FRAUD_DETECTION"],
    policyId: "payments.strict.v1",
    policyVersion: 1,
    issuedAt: "2026-09-01T00:00:00.000Z",
    expiresAt: "2026-09-08T01:00:00.000Z",
    version: 1
  });
}

function allowDecision(
  delegated: MandateContract,
  actionId: string,
  now: Date
): DecisionRecord {
  return {
    mandate: {
      mandateId: delegated.mandateId,
      mandateHash: delegated.mandateHash,
      principalId: delegated.principalId,
      agentId: delegated.agentId,
      version: delegated.version
    },
    agentId: AGENT,
    actionId,
    decision: "ALLOW",
    reason: "all_required_checks_passed",
    policyId: "payments.strict.v1",
    policyVersion: 1,
    checks: [
      {
        name: "executor_security_test",
        status: "PASS",
        reason: "Local executor unit fixture."
      }
    ],
    decidedAt: now.toISOString()
  };
}

function action(destination: string, amountRaw = "5000000") {
  return createActionContract({
    type: "payment",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    amountRaw,
    destination,
    reason: "Invoice INV-1042",
    policyId: "payments.strict.v1"
  });
}

describe("Auctorail Controlled Executor", () => {
  it("executes a valid mandate-bound permit exactly once", async () => {
    const ev = evidence();
    const now = new Date("2026-09-01T19:00:00.000Z");
    const approved = action(ev.subject);
    const delegated = mandate(ev.subject);
    const decision = allowDecision(delegated, approved.id, now);
    const permit = mintPermit(delegated, approved, ev, decision, SECRET, {
      now,
      ttlSeconds: 30
    });
    const permitStore = store();
    let executions = 0;
    const execute = async () => {
      executions++;
      return { txHash: "0xtest" };
    };

    const first = await executeProtectedAction({
      mandate: delegated,
      permit,
      action: approved,
      evidence: ev,
      decision,
      secret: SECRET,
      store: permitStore,
      execute,
      now: new Date(now.getTime() + 1000)
    });

    const replay = await executeProtectedAction({
      mandate: delegated,
      permit,
      action: approved,
      evidence: ev,
      decision,
      secret: SECRET,
      store: permitStore,
      execute,
      now: new Date(now.getTime() + 2000)
    });

    expect(first.status).toBe("EXECUTED");
    expect(replay.status).toBe("BLOCKED");
    expect(replay.code).toBe("permit_already_consumed");
    expect(executions).toBe(1);
  });

  it("blocks a modified amount before execution", async () => {
    const ev = evidence();
    const now = new Date("2026-09-01T19:00:00.000Z");
    const approved = action(ev.subject, "5000000");
    const delegated = mandate(ev.subject);
    const decision = allowDecision(delegated, approved.id, now);
    const permit = mintPermit(delegated, approved, ev, decision, SECRET, { now });
    const tampered = action(ev.subject, "15000000");
    let executions = 0;

    const result = await executeProtectedAction({
      mandate: delegated,
      permit,
      action: tampered,
      evidence: ev,
      decision,
      secret: SECRET,
      store: store(),
      execute: async () => {
        executions++;
        return {};
      },
      now: new Date(now.getTime() + 1000)
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.code).toBe("action_hash_mismatch");
    expect(executions).toBe(0);
  });

  it("blocks a mutated payload with a stale action hash", async () => {
    const ev = evidence();
    const now = new Date("2026-09-01T19:00:00.000Z");
    const approved = action(ev.subject, "5000000");
    const delegated = mandate(ev.subject);
    const decision = allowDecision(delegated, approved.id, now);
    const permit = mintPermit(delegated, approved, ev, decision, SECRET, { now });
    const tampered = {
      ...approved,
      payload: {
        ...approved.payload,
        amountRaw: "15000000"
      }
    };
    let executions = 0;

    const result = await executeProtectedAction({
      mandate: delegated,
      permit,
      action: tampered,
      evidence: ev,
      decision,
      secret: SECRET,
      store: store(),
      execute: async () => {
        executions++;
        return {};
      },
      now: new Date(now.getTime() + 1000)
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.code).toBe("action_hash_mismatch");
    expect(executions).toBe(0);
  });

  it("allows only one winner during concurrent replay attempts", async () => {
    const ev = evidence();
    const now = new Date("2026-09-01T19:00:00.000Z");
    const approved = action(ev.subject);
    const delegated = mandate(ev.subject);
    const decision = allowDecision(delegated, approved.id, now);
    const permit = mintPermit(delegated, approved, ev, decision, SECRET, { now });
    const permitStore = store();
    let executions = 0;

    const attempt = () =>
      executeProtectedAction({
        mandate: delegated,
        permit,
        action: approved,
        evidence: ev,
        decision,
        secret: SECRET,
        store: permitStore,
        execute: async () => {
          executions++;
          await new Promise((resolve) => setTimeout(resolve, 25));
          return {};
        },
        now: new Date(now.getTime() + 1000)
      });

    const results = await Promise.all([attempt(), attempt()]);

    expect(results.filter((result) => result.status === "EXECUTED")).toHaveLength(1);
    expect(results.filter((result) => result.code === "permit_already_consumed")).toHaveLength(1);
    expect(executions).toBe(1);
  });

  it.each([
    ["EACCES", Object.assign(new Error("permission denied"), { code: "EACCES" })],
    ["ENOSPC", Object.assign(new Error("no space left"), { code: "ENOSPC" })],
    ["EROFS", Object.assign(new Error("read-only filesystem"), { code: "EROFS" })],
    ["unknown", new Error("unexpected storage failure")]
  ])("fails closed when permit consumption throws (%s)", async (_name, storageError) => {
    const ev = evidence();
    const now = new Date("2026-09-01T19:00:00.000Z");
    const approved = action(ev.subject);
    const delegated = mandate(ev.subject);
    const decision = allowDecision(delegated, approved.id, now);
    const permit = mintPermit(delegated, approved, ev, decision, SECRET, { now });
    const failingStore: PermitConsumptionStore = {
      consume: () => {
        throw storageError;
      },
      isConsumed: () => false,
      getConsumption: () => null
    };
    let executions = 0;

    const result = await executeProtectedAction({
      mandate: delegated,
      permit,
      action: approved,
      evidence: ev,
      decision,
      secret: SECRET,
      store: failingStore,
      execute: async () => {
        executions++;
        return {};
      },
      now: new Date(now.getTime() + 1000)
    });

    expect(result).toEqual({
      status: "FAILED",
      code: "permit_store_unavailable",
      error: "Permit consumption store is unavailable."
    });
    expect(executions).toBe(0);
  });

  it("fails closed when disk space is exhausted mid-acquisition", async () => {
    const ev = evidence();
    const now = new Date("2026-09-01T19:00:00.000Z");
    const approved = action(ev.subject);
    const delegated = mandate(ev.subject);
    const decision = allowDecision(delegated, approved.id, now);
    const permit = mintPermit(delegated, approved, ev, decision, SECRET, { now });
    const acquisitionMarker = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "proofgate-disk-failure-")),
      "partial-claim"
    );
    const diskFullError = Object.assign(
      new Error("simulated disk full during claim finalization"),
      { code: "ENOSPC" }
    );
    const failingStore: PermitConsumptionStore = {
      consume: () => {
        // Simulate work having started before the filesystem fails. The
        // marker is not a valid claim record and must not authorize execution.
        fs.writeFileSync(acquisitionMarker, "partial", { mode: 0o600 });
        throw diskFullError;
      },
      isConsumed: () => false,
      getConsumption: () => null
    };
    let executions = 0;

    const result = await executeProtectedAction({
      mandate: delegated,
      permit,
      action: approved,
      evidence: ev,
      decision,
      secret: SECRET,
      store: failingStore,
      execute: async () => {
        executions++;
        return {};
      },
      now: new Date(now.getTime() + 1000)
    });

    expect(result).toEqual({
      status: "FAILED",
      code: "permit_store_unavailable",
      error: "Permit consumption store is unavailable."
    });
    expect(executions).toBe(0);
    expect(fs.readFileSync(acquisitionMarker, "utf8")).toBe("partial");
  });

  it("does not execute an expired permit", async () => {
    const ev = evidence();
    const now = new Date("2026-09-01T19:00:00.000Z");
    const approved = action(ev.subject);
    const delegated = mandate(ev.subject);
    const decision = allowDecision(delegated, approved.id, now);
    const permit = mintPermit(delegated, approved, ev, decision, SECRET, {
      now,
      ttlSeconds: 30
    });
    let executions = 0;

    const expiredPermit = await executeProtectedAction({
      mandate: delegated,
      permit,
      action: approved,
      evidence: ev,
      decision,
      secret: SECRET,
      store: store(),
      execute: async () => {
        executions++;
        return {};
      },
      now: new Date(now.getTime() + 31_000)
    });

    expect(expiredPermit.code).toBe("permit_expired");
    expect(executions).toBe(0);
  });
});
