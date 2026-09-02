import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  createAdaptiveEvidencePlan
} from "../src/telegraph/adaptive-evidence-plan.js";
import {
  createLiveIntentAcquirer
} from "../src/telegraph/live-intent-client.js";
import {
  adaptiveAction
} from "./helpers/adaptive-fixtures.js";

const PRIVATE_KEY =
  `0x${"1".repeat(64)}` as `0x${string}`;

function miner(intents: string[]) {
  return {
    id: 42,
    name: "Routed Test Miner",
    slug: "routed-test-miner",
    activation_status: "active",
    supported_intents: intents,
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

describe("live Telegraph Intent client", () => {
  it("accepts free evidence only from an active Miner supporting the requested Intent", async () => {
    const action = adaptiveAction("1000000");
    const plan = createAdaptiveEvidencePlan(action);
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "proofgate-live-intent-")
    );

    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          intent: "FRAUD_DETECTION",
          miner_used: "routed-test-miner",
          miner_name: "Routed Test Miner",
          signal_hash: `0x${"a".repeat(64)}`,
          timestamp: "2026-09-02T17:59:50.000Z",
          result: {
            subject: action.payload.destination,
            chainId: action.payload.chainId,
            verdict: "ALLOW",
            confidence: 0.9,
            applicability: "APPLICABLE"
          }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );

    try {
      const acquire = createLiveIntentAcquirer({
        privateKey: PRIVATE_KEY,
        miners: [miner(["FRAUD_DETECTION"])],
        evidenceDirectory: directory,
        fetchImpl: fetchImpl as typeof fetch
      });

      const result = await acquire({
        action,
        plan,
        requirement: plan.requirements[0],
        remainingBudgetRaw: plan.maxEvidenceSpendRaw,
        deadlineAt:
          new Date(Date.now() + 30_000).toISOString()
      });

      expect(result.evidence.intent).toBe(
        "FRAUD_DETECTION"
      );
      expect(result.evidence.miner.slug).toBe(
        "routed-test-miner"
      );
      expect(result.paymentAmountRaw).toBe("0");
      expect(fs.existsSync(result.evidencePath)).toBe(true);
    } finally {
      fs.rmSync(directory, {
        recursive: true,
        force: true
      });
    }
  });

  it("rejects a routed Miner that does not advertise the requested Intent", async () => {
    const action = adaptiveAction("1000000");
    const plan = createAdaptiveEvidencePlan(action);
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          intent: "FRAUD_DETECTION",
          miner_used: "routed-test-miner",
          miner_name: "Routed Test Miner",
          result: {
            subject: action.payload.destination,
            chainId: action.payload.chainId,
            verdict: "ALLOW",
            confidence: 0.9,
            applicability: "APPLICABLE"
          }
        }),
        { status: 200 }
      );

    const acquire = createLiveIntentAcquirer({
      privateKey: PRIVATE_KEY,
      miners: [miner(["ONCHAIN_TX_LOOKUP"])],
      evidenceDirectory: os.tmpdir(),
      fetchImpl: fetchImpl as typeof fetch
    });

    await expect(
      acquire({
        action,
        plan,
        requirement: plan.requirements[0],
        remainingBudgetRaw: plan.maxEvidenceSpendRaw,
        deadlineAt:
          new Date(Date.now() + 30_000).toISOString()
      })
    ).rejects.toThrow(
      /serving_miner_intent_mismatch/
    );
  });

  it("refuses an x402 challenge above the remaining aggregate budget before any paid attempt", async () => {
    const action = adaptiveAction("1000000");
    const plan = createAdaptiveEvidencePlan(action);
    let calls = 0;
    const challenge = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: "eip155:84532",
            asset:
              "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            amount: "10000",
            payTo:
              "0x2222222222222222222222222222222222222222"
          }
        ]
      })
    ).toString("base64");

    const fetchImpl = async () => {
      calls++;
      return new Response("", {
        status: 402,
        headers: {
          "payment-required": challenge
        }
      });
    };

    const acquire = createLiveIntentAcquirer({
      privateKey: PRIVATE_KEY,
      miners: [miner(["FRAUD_DETECTION"])],
      fetchImpl: fetchImpl as typeof fetch
    });

    await expect(
      acquire({
        action,
        plan,
        requirement: plan.requirements[0],
        remainingBudgetRaw: "9999",
        deadlineAt:
          new Date(Date.now() + 30_000).toISOString()
      })
    ).rejects.toThrow(
      /adaptive_payment_exceeds_remaining_budget/
    );

    expect(calls).toBe(1);
  });
});
