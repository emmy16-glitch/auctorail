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
  extractExactEvmAuthorization
} from "../src/telegraph/x402-reconciliation.js";
import {
  adaptiveAction
} from "./helpers/adaptive-fixtures.js";

const PRIVATE_KEY =
  `0x${"1".repeat(64)}` as `0x${string}`;
const USDC =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PAY_TO =
  "0x2222222222222222222222222222222222222222";

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
        path: "/assess-wallet",
        method: "GET",
        description:
          "FRAUD_DETECTION malicious-activity risk assessment of a wallet"
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

function paymentRequiredHeader(
  resourceUrl: string
): string {
  return Buffer.from(
    JSON.stringify({
      x402Version: 2,
      error: "Payment required",
      resource: {
        url: resourceUrl,
        description: "Telegraph direct evidence",
        mimeType: "application/json"
      },
      accepts: [
        {
          scheme: "exact",
          network: "eip155:84532",
          asset: USDC,
          amount: "10000",
          payTo: PAY_TO,
          maxTimeoutSeconds: 300,
          extra: {
            name: "USDC",
            version: "2",
            resourceUrl
          }
        }
      ]
    })
  ).toString("base64");
}

function hasPaymentSignature(
  input: RequestInfo | URL,
  init?: RequestInit
): boolean {
  const request = new Request(input, init);
  return (
    request.headers.has("payment-signature") ||
    request.headers.has("x-payment")
  );
}

describe("live x402 settlement reconciliation", () => {
  it("accepts a missing PAYMENT-RESPONSE only after exact EIP-3009 authorization reconciliation succeeds", async () => {
    const action = adaptiveAction("7000000");
    const plan = createAdaptiveEvidencePlan(action);
    const prior = fraudMiner({
      id: "91001",
      slug: "prior-auto-miner",
      rank: 2
    });
    const direct = fraudMiner({
      id: "9002",
      slug: "direct-miner",
      rank: 1
    });
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "proofgate-x402-reconcile-")
    );

    let calls = 0;
    let reconciliationCalls = 0;

    const fetchImpl = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      calls++;
      const url = String(input);

      if (!hasPaymentSignature(input, init)) {
        return new Response("", {
          status: 402,
          headers: {
            "payment-required":
              paymentRequiredHeader(url)
          }
        });
      }

      return new Response(
        JSON.stringify({
          intent: "FRAUD_DETECTION",
          miner_used: direct.slug,
          miner_name: direct.name,
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
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    };

    try {
      const acquire = createLiveIntentAcquirer({
        privateKey: PRIVATE_KEY,
        miners: [prior, direct],
        evidenceDirectory: directory,
        fetchImpl: fetchImpl as typeof fetch,
        settlementReconciler: async (input) => {
          reconciliationCalls++;
          const authorization =
            extractExactEvmAuthorization({
              paymentPayload: input.paymentPayload,
              lane: input.lane,
              expectedPayer: input.expectedPayer
            });

          return {
            authorization,
            settlement: {
              success: true,
              code: "payment_settled",
              retryable: false,
              transaction: `0x${"f".repeat(64)}`,
              errorReason: null,
              proofSource:
                "BASE_SEPOLIA_AUTHORIZATION_USED_AND_TRANSFER",
              authorizationNonce:
                authorization.nonce,
              transferVerified: true
            }
          };
        }
      });

      const result = await acquire({
        action,
        plan,
        requirement: plan.requirements[0],
        attemptNumber: 2,
        priorMinerIds: ["91001"],
        remainingBudgetRaw: plan.maxEvidenceSpendRaw,
        deadlineAt:
          new Date(Date.now() + 30_000).toISOString()
      });

      expect(calls).toBe(2);
      expect(reconciliationCalls).toBe(1);
      expect(result.evidence.miner.id).toBe("9002");
      expect(result.paymentAmountRaw).toBe("10000");
      expect(result.settlement?.success).toBe(true);
      expect(result.settlement?.transaction).toBe(
        `0x${"f".repeat(64)}`
      );

      const saved = JSON.parse(
        fs.readFileSync(
          result.evidencePath,
          "utf8"
        )
      );
      expect(saved.payment.settlement.proofSource).toBe(
        "BASE_SEPOLIA_AUTHORIZATION_USED_AND_TRANSFER"
      );
      expect(saved.request.routeMode).toBe(
        "TELEGRAPH_DIRECT_CORROBORATION"
      );
    } finally {
      fs.rmSync(directory, {
        recursive: true,
        force: true
      });
    }
  });
});
