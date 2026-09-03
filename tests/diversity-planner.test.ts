import { describe, expect, it } from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import {
  planDirectDiversity
} from "../src/telegraph/diversity-planner.js";

const VENDOR =
  "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";

function action() {
  return createActionContract({
    type: "payment",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    amountRaw: "7000000",
    destination: VENDOR,
    reason: "diversity test",
    policyId: "payments.adaptive.v1",
    policyVersion: 1
  });
}

function fraudMiner(input: {
  id: string;
  slug: string;
  rank?: number;
  endpoint?: string;
  required?: string[];
}) {
  return {
    id: input.id,
    slug: input.slug,
    name: input.slug,
    activation_status: "active",
    supported_intents: ["FRAUD_DETECTION"],
    endpoints: [
      {
        path: input.endpoint ?? "/anomaly/check",
        method: "GET",
        description: "FRAUD_DETECTION fraud anomaly risk assessment"
      }
    ],
    input_schema: {
      properties: {
        query: { type: "string" },
        address: { type: "string" },
        chain: {
          type: "string",
          enum: ["ethereum", "base", "polygon"]
        },
        impossible: { type: "string" }
      },
      required: input.required ?? ["query", "address"]
    },
    scores: input.rank
      ? [{ intent_id: "FRAUD_DETECTION", rank: input.rank, score: 0.9 }]
      : []
  };
}

describe("direct diversity planner", () => {
  it("selects active same-Intent Miners before any verdict and maps exact subject/query fields", () => {
    const proposed = action();
    const plan = planDirectDiversity({
      action: proposed,
      intent: "FRAUD_DETECTION",
      miners: [
        fraudMiner({ id: "a", slug: "miner-a", rank: 2 }),
        fraudMiner({ id: "b", slug: "miner-b", rank: 1 })
      ],
      count: 2
    });

    expect(plan.selected.map((item) => item.miner.id)).toEqual([
      "b",
      "a"
    ]);
    expect(plan.selected[0].payload.address).toBe(
      proposed.payload.destination
    );
    expect(plan.selected[0].payload.chain).toBe("base");
    expect(String(plan.selected[0].payload.query)).toContain(
      "FRAUD_DETECTION"
    );
  });

  it("excludes already-served Miners and is deterministic for the same frozen action", () => {
    const proposed = action();
    const miners = [
      fraudMiner({ id: "1", slug: "one" }),
      fraudMiner({ id: "2", slug: "two" }),
      fraudMiner({ id: "3", slug: "three" })
    ];

    const first = planDirectDiversity({
      action: proposed,
      intent: "FRAUD_DETECTION",
      miners,
      excludeMinerIds: ["1"],
      count: 2
    });
    const second = planDirectDiversity({
      action: proposed,
      intent: "FRAUD_DETECTION",
      miners,
      excludeMinerIds: ["1"],
      count: 2
    });

    expect(first.selected.map((item) => item.miner.id)).not.toContain("1");
    expect(first.selected).toEqual(second.selected);
  });

  it("fails closed for a Miner whose required direct payload fields cannot be derived", () => {
    const plan = planDirectDiversity({
      action: action(),
      intent: "FRAUD_DETECTION",
      miners: [
        fraudMiner({
          id: "bad",
          slug: "needs-secret-field",
          required: ["query", "impossible"]
        })
      ],
      count: 1
    });

    expect(plan.selected).toHaveLength(0);
    expect(plan.skipped[0].reason).toContain(
      "unresolved required fields: impossible"
    );
  });
});
