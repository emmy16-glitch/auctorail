import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  createAdaptiveEvidencePlan
} from "../src/telegraph/adaptive-evidence-plan.js";
import {
  collectAdaptiveEvidence,
  RetryableEvidenceAcquisitionError
} from "../src/telegraph/adaptive-orchestrator.js";
import {
  createLiveIntentAcquirer
} from "../src/telegraph/live-intent-client.js";
import {
  adaptiveAction,
  adaptiveEvidence
} from "./helpers/adaptive-fixtures.js";

function testPrivateKey(): `0x${string}` {
  return `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
}

function routedMiner() {
  return {
    id: 42,
    name: "Multi Intent Test Miner",
    slug: "multi-intent-test-miner",
    activation_status: "active",
    supported_intents: [
      "FRAUD_DETECTION",
      "ONCHAIN_TX_LOOKUP"
    ],
    output_schema: {
      properties: {
        subject: {},
        chainId: {},
        verdict: {},
        confidence: {},
        applicability: {}
      }
    }
  };
}

describe("live Telegraph routing resilience", () => {
  it("quarantines a wrong Engine-detected Intent instead of counting it as requested evidence", async () => {
    const action = adaptiveAction("7000000");
    const plan = createAdaptiveEvidencePlan(action);
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "proofgate-wrong-intent-")
    );

    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          intent: "ONCHAIN_TX_LOOKUP",
          miner_used: "multi-intent-test-miner",
          miner_name: "Multi Intent Test Miner",
          signal_hash: `0x${"d".repeat(64)}`,
          timestamp: "2026-09-03T08:12:00.000Z",
          result: {
            subject: action.payload.destination,
            chainId: action.payload.chainId,
            verdict: "ALLOW",
            confidence: 0.92,
            applicability: "APPLICABLE"
          }
        }),
        { status: 200 }
      );

    try {
      const acquire = createLiveIntentAcquirer({
        privateKey: testPrivateKey(),
        miners: [routedMiner()],
        evidenceDirectory: directory,
        fetchImpl: fetchImpl as typeof fetch
      });

      let caught: unknown;
      try {
        await acquire({
          action,
          plan,
          requirement: plan.requirements[0],
          attemptNumber: 1,
          priorMinerIds: [],
          remainingBudgetRaw: plan.maxEvidenceSpendRaw,
          deadlineAt:
            new Date(Date.now() + 30_000).toISOString()
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(
        RetryableEvidenceAcquisitionError
      );
      expect(caught).toMatchObject({
        code: "routed_intent_mismatch",
        paymentAmountRaw: "0",
        minerId: "42"
      });

      const rejectedDirectory =
        path.join(directory, "rejected");
      const files = fs.readdirSync(rejectedDirectory);
      expect(files).toHaveLength(1);

      const saved = JSON.parse(
        fs.readFileSync(
          path.join(rejectedDirectory, files[0]),
          "utf8"
        )
      );
      expect(saved.rejection.code).toBe(
        "routed_intent_mismatch"
      );
      expect(saved.request.requiredIntent).toBe(
        "FRAUD_DETECTION"
      );
      expect(saved.intent).toBe(
        "ONCHAIN_TX_LOOKUP"
      );
    } finally {
      fs.rmSync(directory, {
        recursive: true,
        force: true
      });
    }
  });

  it("charges a settled wrong-Intent attempt to the medium-risk acquisition budget, excludes it from quorum, and continues", async () => {
    const action = adaptiveAction("7000000");
    const plan = createAdaptiveEvidencePlan(action);
    const seenPriorMinerIds: string[][] = [];

    const result = await collectAdaptiveEvidence(
      action,
      plan,
      async ({
        requirement,
        attemptNumber = 1,
        priorMinerIds = []
      }) => {
        seenPriorMinerIds.push([...priorMinerIds]);

        if (
          requirement.intent === "FRAUD_DETECTION" &&
          attemptNumber === 1
        ) {
          throw new RetryableEvidenceAcquisitionError({
            code: "routed_intent_mismatch",
            detail:
              "expected FRAUD_DETECTION, returned ONCHAIN_TX_LOOKUP",
            paymentAmountRaw: "10000",
            minerId: "wrong-route-miner"
          });
        }

        return {
          evidence: adaptiveEvidence(
            action,
            requirement.intent,
            {
              miner: {
                id: `${requirement.intent}-miner-${attemptNumber}`,
                name: `${requirement.intent} Miner ${attemptNumber}`,
                slug: `${requirement.intent.toLowerCase()}-miner-${attemptNumber}`
              }
            }
          ),
          paymentAmountRaw: "10000"
        };
      }
    );

    expect(result.status).toBe("COMPLETE");
    expect(result.actualEvidenceSpendRaw).toBe("40000");
    expect(result.bundle.totalEvidenceSpendRaw).toBe("30000");
    expect(result.rejectedAttempts).toEqual([
      expect.objectContaining({
        intent: "FRAUD_DETECTION",
        attempt: 1,
        code: "routed_intent_mismatch",
        paymentAmountRaw: "10000",
        minerId: "wrong-route-miner"
      })
    ]);

    const fraudItems = result.bundle.items.filter(
      (item) => item.intent === "FRAUD_DETECTION"
    );
    expect(fraudItems.map((item) => item.attempt)).toEqual([
      2,
      3
    ]);
    expect(
      seenPriorMinerIds[1]
    ).toContain("wrong-route-miner");
  });
});
