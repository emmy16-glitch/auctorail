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
  description?: string;
  required?: string[];
  outputMode?: "structured" | "text" | "none";
}) {
  const outputMode = input.outputMode ?? "structured";

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
        description:
          input.description ??
          "FRAUD_DETECTION fraud anomaly risk assessment"
      }
    ],
    input_schema: {
      properties: {
        query: { type: "string" },
        address: { type: "string" },
        wallet: { type: "string" },
        chain: {
          type: "string",
          enum: ["ethereum", "base", "polygon"]
        },
        impossible: { type: "string" }
      },
      required: input.required ?? ["query", "address"]
    },
    output_schema: {
      properties:
        outputMode === "structured"
          ? {
              address: { type: "string" },
              chain: { type: "string" },
              verdict: { type: "string" },
              confidence: { type: "number" }
            }
          : outputMode === "text"
            ? {
                answer: { type: "string" },
                verdict: { type: "string" },
                confidence: { type: "number" }
              }
            : {
                verdict: { type: "string" },
                confidence: { type: "number" }
              }
    },
    signal_mapping:
      outputMode === "text"
        ? {
            label_field: "verdict",
            confidence_field: "confidence",
            reason_field: "answer"
          }
        : undefined,
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
    expect(plan.selected[0].outputBindingMode).toBe(
      "STRUCTURED_EXACT"
    );
    expect(String(plan.selected[0].payload.query)).toContain(
      "FRAUD_DETECTION"
    );
  });

  it("prioritizes structured exact-binding output over a higher-ranked text-only candidate", () => {
    const plan = planDirectDiversity({
      action: action(),
      intent: "FRAUD_DETECTION",
      miners: [
        fraudMiner({
          id: "text",
          slug: "rank-one-text",
          rank: 1,
          outputMode: "text"
        }),
        fraudMiner({
          id: "structured",
          slug: "rank-four-structured",
          rank: 4,
          outputMode: "structured"
        })
      ],
      count: 2
    });

    expect(plan.selected.map((item) => item.miner.id)).toEqual([
      "structured",
      "text"
    ]);
    expect(plan.selected[0].outputBindingMode).toBe(
      "STRUCTURED_EXACT"
    );
    expect(plan.selected[1].outputBindingMode).toBe(
      "DECLARED_TEXT"
    );
  });

  it("does not infer exact chain binding for a wallet-only endpoint from a Miner-wide schema", () => {
    const plan = planDirectDiversity({
      action: action(),
      intent: "FRAUD_DETECTION",
      miners: [
        fraudMiner({
          id: "wallet-only",
          slug: "wallet-only",
          endpoint: "/assess-wallet",
          description:
            "FRAUD_DETECTION for a specific address. Params: wallet (required, EVM address).",
          outputMode: "structured"
        })
      ],
      count: 1
    });

    expect(plan.selected).toHaveLength(0);
    expect(plan.skipped[0].reason).toContain(
      "chosen endpoint cannot bind exact subject/chain"
    );
  });

  it("allows declared-text binding when the chosen endpoint explicitly accepts the exact query", () => {
    const proposed = action();
    const plan = planDirectDiversity({
      action: proposed,
      intent: "FRAUD_DETECTION",
      miners: [
        fraudMiner({
          id: "query-text",
          slug: "query-text",
          endpoint: "/risk-check",
          description:
            "FRAUD_DETECTION assessment. Params: wallet (required), query (optional).",
          outputMode: "text"
        })
      ],
      count: 1
    });

    expect(plan.selected).toHaveLength(1);
    expect(plan.selected[0].outputBindingMode).toBe("DECLARED_TEXT");
    expect(plan.selected[0].payload.wallet).toBe(
      proposed.payload.destination
    );
    expect(String(plan.selected[0].payload.query)).toContain(
      "Base Sepolia"
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

  it("skips a direct Miner whose declared output cannot bind subject and chain", () => {
    const plan = planDirectDiversity({
      action: action(),
      intent: "FRAUD_DETECTION",
      miners: [
        fraudMiner({
          id: "weak",
          slug: "weak-output",
          outputMode: "none"
        })
      ],
      count: 1
    });

    expect(plan.selected).toHaveLength(0);
    expect(plan.skipped[0].reason).toContain(
      "chosen endpoint cannot bind exact subject/chain"
    );
  });
});
