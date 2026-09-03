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
    reason: "exact-chain direct route test",
    policyId: "payments.adaptive.v1",
    policyVersion: 1
  });
}

function commonMiner(input: {
  id: string;
  slug: string;
  inputSchema: Record<string, unknown>;
  endpoint: Record<string, unknown>;
}) {
  return {
    id: input.id,
    slug: input.slug,
    name: input.slug,
    activation_status: "active",
    supported_intents: ["FRAUD_DETECTION"],
    endpoints: [input.endpoint],
    input_schema: input.inputSchema,
    output_schema: {
      properties: {
        address: { type: "string" },
        chainId: { type: "integer" },
        verdict: { type: "string" },
        confidence: { type: "number" }
      }
    },
    scores: [
      {
        intent_id: "FRAUD_DETECTION",
        rank: 1,
        score: 0.9
      }
    ]
  };
}

describe("direct diversity exact chain binding", () => {
  it("rejects a Base-mainnet-only chain enum for a Base Sepolia action", () => {
    const plan = planDirectDiversity({
      action: action(),
      intent: "FRAUD_DETECTION",
      miners: [
        commonMiner({
          id: "mainnet-only",
          slug: "mainnet-only",
          endpoint: {
            path: "/fraud",
            method: "GET",
            description:
              "FRAUD_DETECTION. Params: address (required), chain (optional), query (optional)."
          },
          inputSchema: {
            properties: {
              address: { type: "string" },
              chain: {
                type: "string",
                enum: ["ethereum", "base", "polygon"]
              },
              query: { type: "string" }
            },
            required: ["address", "query"]
          }
        })
      ],
      count: 1
    });

    expect(plan.selected).toHaveLength(0);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0].reason).toContain(
      "cannot express exact chainId 84532"
    );
    expect(plan.skipped[0].reason).toContain("chain");
  });

  it("accepts an endpoint that can represent chainId 84532 exactly", () => {
    const proposed = action();
    const plan = planDirectDiversity({
      action: proposed,
      intent: "FRAUD_DETECTION",
      miners: [
        commonMiner({
          id: "exact-testnet",
          slug: "exact-testnet",
          endpoint: {
            path: "/assess",
            method: "POST",
            description:
              "FRAUD_DETECTION. JSON body: { \"address\": \"0x...\", \"chainId\": 84532 }."
          },
          inputSchema: {
            properties: {
              address: { type: "string" },
              chainId: {
                type: "integer",
                enum: [84532]
              }
            },
            required: ["address", "chainId"]
          }
        })
      ],
      count: 1
    });

    expect(plan.selected).toHaveLength(1);
    expect(plan.selected[0].payload.address).toBe(
      proposed.payload.destination
    );
    expect(plan.selected[0].payload.chainId).toBe(84532);
    expect(plan.selected[0].requestBindingMode).toBe(
      "STRUCTURED_SUBJECT_CHAIN"
    );
  });
});
