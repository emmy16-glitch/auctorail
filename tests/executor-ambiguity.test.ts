import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import { loadTelegraphEvidence } from "../src/evidence/telegraph.js";
import type { DecisionRecord } from "../src/policy/payments-strict-v1.js";
import { mintPermit } from "../src/permit/permit.js";
import { FilePermitConsumptionStore } from "../src/executor/permit-store.js";
import {
  AmbiguousExecutionError,
  executeProtectedAction
} from "../src/executor/controlled-executor.js";

const SECRET = "proofgate-ambiguity-test-" + "z".repeat(64);

function evidence() {
  const directory = path.join(process.cwd(), "data", "evidence");
  const file = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .at(-1);

  if (!file) {
    throw new Error("Real Telegraph evidence missing");
  }

  return loadTelegraphEvidence(path.join(directory, file));
}

function allow(actionId: string, now: Date): DecisionRecord {
  return {
    actionId,
    decision: "ALLOW",
    reason: "all_required_checks_passed",
    policyId: "payments.strict.v1",
    checks: [
      {
        name: "ambiguity_test",
        status: "PASS",
        reason: "Executor ambiguity unit fixture."
      }
    ],
    decidedAt: now.toISOString()
  };
}

describe("controlled executor ambiguous writes", () => {
  it("keeps the permit consumed and surfaces AMBIGUOUS instead of FAILED", async () => {
    const ev = evidence();
    const now = new Date("2026-09-01T19:15:00.000Z");
    const action = createActionContract({
      type: "payment",
      chainId: BASE_SEPOLIA_CHAIN_ID,
      token: BASE_SEPOLIA_USDC,
      amountRaw: "1000000",
      destination: ev.subject,
      reason: "Invoice INV-1042",
      policyId: "payments.strict.v1"
    });
    const decision = allow(action.id, now);
    const permit = mintPermit(action, ev, decision, SECRET, { now });
    const store = new FilePermitConsumptionStore(
      fs.mkdtempSync(path.join(os.tmpdir(), "proofgate-ambiguity-"))
    );
    const txHash = "0x" + "d".repeat(64);

    const first = await executeProtectedAction({
      permit,
      action,
      evidence: ev,
      decision,
      secret: SECRET,
      store,
      execute: async () => {
        throw new AmbiguousExecutionError(
          "broadcast_succeeded_confirmation_unknown",
          txHash
        );
      },
      now: new Date(now.getTime() + 1_000)
    });

    expect(first.status).toBe("AMBIGUOUS");
    expect(first.code).toBe("execution_ambiguous");
    expect(store.isConsumed(permit.payload.permitId, permit.payload.nonce)).toBe(true);

    const replay = await executeProtectedAction({
      permit,
      action,
      evidence: ev,
      decision,
      secret: SECRET,
      store,
      execute: async () => ({ txHash: "should-not-run" }),
      now: new Date(now.getTime() + 2_000)
    });

    expect(replay.code).toBe("permit_already_consumed");
  });
});
