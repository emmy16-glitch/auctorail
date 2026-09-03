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
    reason: "request binding priority test",
    policyId: "payments.adaptive.v1",
    policyVersion: 1
  });
}

function miner(input: {
  id: string;
  slug: string;
  rank: number;
  description: string;
}) {
  return {
    id: input.id,
    slug: input.slug,
    name: input.slug,
    activation_status: "active",
    supported_intents: ["FRAUD_DETECTION"],
    endpoints: [
      {
        path: "/risk",
        method: "GET",
        description: input.description
      }
    ],
    input_schema: {
      properties: {
        query: { type: "string" },
        wallet: { type: "string" },
        address: { type: "string" },
        chain: {
          type: "string",
          enum: ["eth", "base", "polygon"]
        }
      }
    },
    output_schema: {
      properties: {
        answer: { type: "string" },
        confidence: { type: "number" }
      }
    },
    signal_mapping: {
      label_field: "answer",
      reason_field: "answer",
      confidence_field: "confidence"
    },
    scores: [
      {
        intent_id: "FRAUD_DETECTION",
        rank: input.rank,
        score: 0.9
      }
    ]
  };
}

describe("direct diversity request binding priority", () => {
  it("prefers structured subject+chain request binding over a higher-ranked query-only route", () => {
    const plan = planDirectDiversity({
      action: action(),
      intent: "FRAUD_DETECTION",
      miners: [
        miner({
          id: "rank-one-query",
          slug: "rank-one-query",
          rank: 1,
          description:
            "FRAUD_DETECTION wallet risk. Params: wallet (required), query (optional)."
        }),
        miner({
          id: "rank-four-structured",
          slug: "rank-four-structured",
          rank: 4,
          description:
            "FRAUD_DETECTION anomaly check. Params: address (required), chain (required), query (optional)."
        })
      ],
      count: 2
    });

    expect(plan.selected.map((item) => item.miner.id)).toEqual([
      "rank-four-structured",
      "rank-one-query"
    ]);
    expect(plan.selected[0].requestBindingMode).toBe(
      "STRUCTURED_SUBJECT_CHAIN"
    );
    expect(plan.selected[1].requestBindingMode).toBe(
      "QUERY_ASSERTED"
    );
  });
});
