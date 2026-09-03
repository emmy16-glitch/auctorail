import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  createAdaptiveEvidencePlan
} from "../src/telegraph/adaptive-evidence-plan.js";
import {
  RetryableEvidenceAcquisitionError
} from "../src/telegraph/adaptive-orchestrator.js";
import {
  createLiveIntentAcquirer
} from "../src/telegraph/live-intent-client.js";
import {
  adaptiveAction
} from "./helpers/adaptive-fixtures.js";

const PRIVATE_KEY =
  `0x${"1".repeat(64)}` as `0x${string}`;
const ENGINE_URL =
  "https://devnode.telegraphprotocol.com/engine";
const ASK_URL = `${ENGINE_URL}/v1/ask`;
const USDC =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PAY_TO =
  "0x2222222222222222222222222222222222222222";

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

function answerOnlyMiner(intents: string[]) {
  return {
    id: 84,
    name: "Schema Poor Miner",
    slug: "schema-poor-miner",
    activation_status: "active",
    supported_intents: intents,
    output_schema: {
      properties: {
        answer: {},
        verdict: {},
        confidence: {},
        applicability: {}
      }
    },
    signal_mapping: {
      label_field: "verdict",
      confidence_field: "confidence",
      reason_field: "answer"
    }
  };
}

function paymentRequiredHeader(
  amount = "10000"
): string {
  return Buffer.from(
    JSON.stringify({
      x402Version: 2,
      error: "Payment required",
      resource: {
        url: ASK_URL,
        description: "Telegraph test evidence",
        mimeType: "application/json"
      },
      accepts: [
        {
          scheme: "exact",
          network: "eip155:84532",
          asset: USDC,
          amount,
          payTo: PAY_TO,
          maxTimeoutSeconds: 300,
          extra: {
            name: "USDC",
            version: "2",
            resourceUrl: ASK_URL
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

  it("quarantines a free schema-declared answer that names the subject but omits the chain", async () => {
    const action = adaptiveAction("7000000");
    const plan = createAdaptiveEvidencePlan(action);
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "proofgate-live-rejected-")
    );

    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          intent: "FRAUD_DETECTION",
          miner_used: "schema-poor-miner",
          miner_name: "Schema Poor Miner",
          signal_hash: `0x${"b".repeat(64)}`,
          timestamp: "2026-09-03T07:15:00.000Z",
          result: {
            answer:
              `The exact address ${action.payload.destination} appears safe.`,
            verdict: "ALLOW",
            confidence: 0.91,
            applicability: "APPLICABLE"
          }
        }),
        { status: 200 }
      );

    try {
      const acquire = createLiveIntentAcquirer({
        privateKey: PRIVATE_KEY,
        miners: [answerOnlyMiner(["FRAUD_DETECTION"])],
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
        code: "evidence_chain_not_asserted",
        paymentAmountRaw: "0",
        minerId: "84"
      });

      const rejectedDirectory =
        path.join(directory, "rejected");
      const files = fs.readdirSync(
        rejectedDirectory
      );
      expect(files).toHaveLength(1);

      const saved = JSON.parse(
        fs.readFileSync(
          path.join(
            rejectedDirectory,
            files[0]
          ),
          "utf8"
        )
      );
      expect(saved.rejection.code).toBe(
        "evidence_chain_not_asserted"
      );
      expect(saved.payment.amountRaw).toBe("0");
      expect(saved.rawResponse.result.answer).toContain(
        action.payload.destination
      );
    } finally {
      fs.rmSync(directory, {
        recursive: true,
        force: true
      });
    }
  });

  it("guides later auto-route attempts toward a different capable Miner without forcing one", async () => {
    const action = adaptiveAction("7000000");
    const plan = createAdaptiveEvidencePlan(action);
    let sentBody: Record<string, unknown> | null = null;

    const fetchImpl = async (
      _input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      sentBody = JSON.parse(
        String(init?.body ?? "{}")
      );

      return new Response(
        JSON.stringify({
          intent: "FRAUD_DETECTION",
          miner_used: "routed-test-miner",
          miner_name: "Routed Test Miner",
          signal_hash: `0x${"c".repeat(64)}`,
          timestamp: "2026-09-03T07:16:00.000Z",
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
    };

    const acquire = createLiveIntentAcquirer({
      privateKey: PRIVATE_KEY,
      miners: [miner(["FRAUD_DETECTION"])],
      evidenceDirectory: os.tmpdir(),
      fetchImpl: fetchImpl as typeof fetch
    });

    await acquire({
      action,
      plan,
      requirement: plan.requirements[0],
      attemptNumber: 2,
      priorMinerIds: ["42", "77"],
      remainingBudgetRaw: plan.maxEvidenceSpendRaw,
      deadlineAt:
        new Date(Date.now() + 30_000).toISOString()
    });

    const query = String(sentBody?.query ?? "");
    expect(query).toContain(
      "independent corroboration attempt 2"
    );
    expect(query).toContain("42, 77");
    expect(query).toContain(
      "prefer a different Miner"
    );
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
    const challenge = paymentRequiredHeader("10000");

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

  it("reuses the validated 402 for signing so a second unpaid challenge cannot replace it", async () => {
    const action = adaptiveAction("1000000");
    const plan = createAdaptiveEvidencePlan(action);
    let calls = 0;
    let unsignedChallengeCalls = 0;
    let signedCalls = 0;

    const fetchImpl = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      calls++;

      if (calls === 1) {
        expect(hasPaymentSignature(input, init)).toBe(false);
        return new Response("", {
          status: 402,
          headers: {
            "payment-required":
              paymentRequiredHeader("10000")
          }
        });
      }

      if (!hasPaymentSignature(input, init)) {
        unsignedChallengeCalls++;
        return new Response("", {
          status: 402,
          headers: {
            "payment-required":
              paymentRequiredHeader("20000")
          }
        });
      }

      signedCalls++;
      throw new Error(
        "simulated_transport_failure_after_signed_request"
      );
    };

    const acquire = createLiveIntentAcquirer({
      privateKey: PRIVATE_KEY,
      miners: [miner(["FRAUD_DETECTION"])],
      engineUrl: ENGINE_URL,
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
      /adaptive_x402_transport_ambiguous:simulated_transport_failure_after_signed_request/
    );

    expect(calls).toBe(2);
    expect(unsignedChallengeCalls).toBe(0);
    expect(signedCalls).toBe(1);
  });
});
