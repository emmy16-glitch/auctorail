import { describe, expect, it } from "vitest";

import {
  createAdaptiveEvidencePlan
} from "../src/telegraph/adaptive-evidence-plan.js";
import {
  planDirectDiversity
} from "../src/telegraph/diversity-planner.js";
import {
  createLiveIntentAcquirer
} from "../src/telegraph/live-intent-client.js";
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
          enum: ["ethereum", "base", "polygon"]
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

describe("live direct provider diversity", () => {
  it("keeps attempt one on auto-route then directly corroborates with an unused ranked Miner by numeric subnet id", async () => {
    const action = adaptiveAction("7000000");
    const plan = createAdaptiveEvidencePlan(action);
    const autoMiner = fraudMiner({
      id: "91001",
      slug: "auto-miner",
      rank: 3
    });
    const candidateA = fraudMiner({
      id: "10002",
      slug: "candidate-a",
      rank: 2
    });
    const candidateB = fraudMiner({
      id: "302",
      slug: "candidate-b",
      rank: 1
    });
    const miners = [
      autoMiner,
      candidateA,
      candidateB
    ];

    const expected = planDirectDiversity({
      action,
      intent: "FRAUD_DETECTION",
      miners,
      excludeMinerIds: ["91001"],
      count: 1
    }).selected[0];

    expect(expected).toBeDefined();
    expect(expected.miner.id).toBe("302");

    const calls: Array<{
      url: string;
      body: Record<string, unknown>;
    }> = [];

    const fetchImpl = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const url = String(input);
      const body = JSON.parse(
        String(init?.body ?? "{}")
      ) as Record<string, unknown>;
      calls.push({ url, body });

      const direct = url.includes("/v1/ask/");
      const miner = direct
        ? candidateB
        : autoMiner;

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
            confidence: 0.91,
            applicability: "APPLICABLE"
          }
        }),
        { status: 200 }
      );
    };

    const acquire = createLiveIntentAcquirer({
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
      deadlineAt:
        new Date(Date.now() + 30_000).toISOString()
    });

    const second = await acquire({
      action,
      plan,
      requirement: plan.requirements[0],
      attemptNumber: 2,
      priorMinerIds: [first.evidence.miner.id],
      remainingBudgetRaw: plan.maxEvidenceSpendRaw,
      deadlineAt:
        new Date(Date.now() + 30_000).toISOString()
    });

    expect(calls[0].url).toMatch(/\/v1\/ask$/);
    expect(calls[0].body).toHaveProperty("query");

    expect(calls[1].url).toContain(
      `/v1/ask/${expected.miner.id}`
    );
    expect(calls[1].url).not.toContain(
      `/v1/ask/${expected.miner.slug}`
    );
    expect(calls[1].body).toEqual({
      method: expected.method,
      endpoint: expected.endpoint,
      payload: expected.payload
    });
    expect(second.evidence.miner.id).toBe("302");
    expect(second.evidence.miner.id).not.toBe(
      first.evidence.miner.id
    );
  });
});
