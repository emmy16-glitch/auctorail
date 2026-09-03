import { describe, expect, it } from "vitest";

import {
  createAdaptiveEvidencePlan
} from "../src/telegraph/adaptive-evidence-plan.js";
import {
  selectDirectCorroborationTarget
} from "../src/telegraph/direct-corroboration.js";
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
  name: string;
  path: string;
  method?: "GET" | "POST";
  description: string;
}) {
  return {
    id: input.id,
    name: input.name,
    slug: input.slug,
    activation_status: "active",
    supported_intents: ["FRAUD_DETECTION"],
    endpoints: [
      {
        path: input.path,
        method: input.method ?? "GET",
        description: input.description
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

const SARZOPS = fraudMiner({
  id: "91001",
  slug: "sarzops-transaction-risk",
  name: "SarzOps Fraud Intelligence",
  path: "/fraud",
  description:
    "FRAUD_DETECTION. Malicious-activity risk assessment of an address."
});

const DEGENLENS = fraudMiner({
  id: "10002",
  slug: "degenlens-onchain",
  name: "DegenLens On-Chain Intelligence",
  path: "/anomaly/check",
  description:
    "FRAUD_DETECTION. Assess how likely the specific entity named in the required natural-language query is to be fraudulent."
});

const CHAINSIGHT = fraudMiner({
  id: "302",
  slug: "chainsight-oracle",
  name: "ChainSight — On-Chain Intelligence Hub",
  path: "/fraud",
  description:
    "Malicious-activity risk assessment of an address (FRAUD_DETECTION)."
});

describe("deterministic Telegraph direct corroboration", () => {
  it("selects an unused capable Miner deterministically without verdict input", () => {
    const action = adaptiveAction("7000000");
    const miners = [
      SARZOPS,
      DEGENLENS,
      CHAINSIGHT
    ];

    const first = selectDirectCorroborationTarget({
      miners,
      action,
      intent: "FRAUD_DETECTION",
      excludedMinerIds: ["91001"]
    });
    const reordered = selectDirectCorroborationTarget({
      miners: [...miners].reverse(),
      action,
      intent: "FRAUD_DETECTION",
      excludedMinerIds: ["91001"]
    });

    expect(first).not.toBeNull();
    expect(reordered).not.toBeNull();
    expect(first?.miner.id).not.toBe("91001");
    expect(first?.miner.id).toBe(reordered?.miner.id);
    expect(first?.selectionHash).toBe(
      reordered?.selectionHash
    );
  });

  it("uses Telegraph auto-route for the first vote and direct route for later diversity", async () => {
    const action = adaptiveAction("7000000");
    const plan = createAdaptiveEvidencePlan(action);
    const miners = [
      SARZOPS,
      DEGENLENS,
      CHAINSIGHT
    ];

    const expectedDirect =
      selectDirectCorroborationTarget({
        miners,
        action,
        intent: "FRAUD_DETECTION",
        excludedMinerIds: ["91001"]
      });

    expect(expectedDirect).not.toBeNull();

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
        ? expectedDirect!.miner
        : SARZOPS;

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
      `/v1/ask/${expectedDirect!.miner.slug}`
    );
    expect(calls[1].body).toEqual({
      method: expectedDirect!.endpoint.method,
      endpoint: expectedDirect!.endpoint.path,
      payload: expectedDirect!.payload
    });
    expect(second.evidence.miner.id).toBe(
      String(expectedDirect!.miner.id)
    );
    expect(second.evidence.miner.id).not.toBe(
      first.evidence.miner.id
    );
  });

  it("rotates to another deterministic direct Miner after a rejected direct provider", () => {
    const action = adaptiveAction("7000000");
    const miners = [
      SARZOPS,
      DEGENLENS,
      CHAINSIGHT
    ];

    const first = selectDirectCorroborationTarget({
      miners,
      action,
      intent: "FRAUD_DETECTION",
      excludedMinerIds: ["91001"]
    });

    expect(first).not.toBeNull();

    const second = selectDirectCorroborationTarget({
      miners,
      action,
      intent: "FRAUD_DETECTION",
      excludedMinerIds: [
        "91001",
        String(first!.miner.id)
      ]
    });

    expect(second).not.toBeNull();
    expect(second?.miner.id).not.toBe(first?.miner.id);
    expect(second?.miner.id).not.toBe("91001");
  });
});
