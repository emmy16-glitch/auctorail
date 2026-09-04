import { describe, expect, it } from "vitest";

import {
  createAdaptiveEvidencePlan
} from "../src/telegraph/adaptive-evidence-plan.js";
import {
  createAutoRoutedLiveIntentAcquirer
} from "../src/telegraph/auto-route-acquirer.js";
import {
  adaptiveAction
} from "./helpers/adaptive-fixtures.js";

const PRIVATE_KEY =
  `0x${"1".repeat(64)}` as `0x${string}`;

function fraudMiner(input: {
  id: string;
  slug: string;
  rank: number;
}) {
  return {
    id: input.id,
    slug: input.slug,
    name: input.slug,
    activation_status: "active",
    supported_intents: ["FRAUD_DETECTION"],
    endpoints: [
      {
        path: "/fraud",
        method: "GET",
        description:
          "FRAUD_DETECTION malicious-activity risk assessment of an address"
      }
    ],
    input_schema: {
      properties: {
        address: { type: "string" },
        chain: {
          type: "string",
          enum: ["ethereum", "base-sepolia", "polygon"]
        }
      },
      required: ["address", "chain"]
    },
    scores: [
      {
        intent_id: "FRAUD_DETECTION",
        rank: input.rank,
        score: 0.9
      }
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

describe("public live Telegraph routing", () => {
  it("keeps every corroboration attempt on ranked /v1/ask auto-route while preserving prior Miner context", async () => {
    const action = adaptiveAction("7000000");
    const plan = createAdaptiveEvidencePlan(action);
    const firstMiner = fraudMiner({ id: "91001", slug: "first-miner", rank: 1 });
    const secondMiner = fraudMiner({ id: "302", slug: "second-miner", rank: 2 });
    const miners = [firstMiner, secondMiner];
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];

    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({ url, body });
      const query = String(body.query ?? "");
      const miner = query.includes(firstMiner.id) ? secondMiner : firstMiner;

      return new Response(
        JSON.stringify({
          intent: "FRAUD_DETECTION",
          miner_used: miner.slug,
          miner_name: miner.name,
          signal_hash: `0x${"a".repeat(64)}`,
          timestamp: new Date().toISOString(),
          result: {
            subject: action.payload.destination,
            chainId: action.payload.chainId,
            verdict: "ALLOW",
            confidence: 0.94,
            applicability: "APPLICABLE"
          }
        }),
        { status: 200 }
      );
    };

    const acquire = createAutoRoutedLiveIntentAcquirer({
      privateKey: PRIVATE_KEY,
      miners,
      fetchImpl: fetchImpl as typeof fetch
    });

    const first = await acquire({
      action,
      plan,
      requirement: plan.requirements[0],
      attemptNumber: 1,
      priorMinerIds: [],
      remainingBudgetRaw: plan.maxEvidenceSpendRaw,
      deadlineAt: new Date(Date.now() + 30_000).toISOString()
    });

    const second = await acquire({
      action,
      plan,
      requirement: plan.requirements[0],
      attemptNumber: 2,
      priorMinerIds: [first.evidence.miner.id],
      remainingBudgetRaw: plan.maxEvidenceSpendRaw,
      deadlineAt: new Date(Date.now() + 30_000).toISOString()
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toMatch(/\/v1\/ask$/);
    expect(calls[1].url).toMatch(/\/v1\/ask$/);
    expect(calls[1].url).not.toMatch(/\/v1\/ask\//);
    expect(String(calls[1].body.query)).toContain(firstMiner.id);
    expect(first.evidence.miner.id).toBe(firstMiner.id);
    expect(second.evidence.miner.id).toBe(secondMiner.id);
  });
});
