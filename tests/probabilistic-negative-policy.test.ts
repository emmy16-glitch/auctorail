import {
  describe,
  expect,
  it
} from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import {
  createMandateContract
} from "../src/core/mandate-contract.js";
import {
  normalizeTelegraphEvidence
} from "../src/evidence/telegraph.js";
import {
  evaluatePaymentsStrictV1
} from "../src/policy/payments-strict-v1.js";

const VENDOR =
  "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const AGENT =
  "procurement-agent";
const NOW =
  new Date(
    "2026-09-01T21:56:48.000Z"
  );

function setup(label: string) {
  const mandate =
    createMandateContract({
      mandateId:
        "treasury-demo-v1",
      principalId:
        "company-demo",
      agentId:
        AGENT,
      allowedActionTypes:
        ["payment"],
      allowedChainIds:
        [BASE_SEPOLIA_CHAIN_ID],
      allowedAssets:
        [BASE_SEPOLIA_USDC],
      allowedDestinations:
        [VENDOR],
      maxPerActionRaw:
        "10000000",
      requiredIntents:
        ["FRAUD_DETECTION"],
      policyId:
        "payments.strict.v1",
    policyVersion: 1,
      issuedAt:
        "2026-09-01T00:00:00.000Z",
      expiresAt:
        "2026-09-08T01:00:00.000Z",
      version:
        1
    });

  const action =
    createActionContract({
      type:
        "payment",
      chainId:
        BASE_SEPOLIA_CHAIN_ID,
      token:
        BASE_SEPOLIA_USDC,
      amountRaw:
        "1000000",
      destination:
        VENDOR,
      reason:
        "Invoice INV-1042",
      policyId:
        "payments.strict.v1"
    });

  const evidence =
    normalizeTelegraphEvidence({
      schemaVersion:
        "proofgate.telegraph-evidence.v1",
      source:
        "telegraph",
      intent:
        "FRAUD_DETECTION",
      miner: {
        id:
          "302",
        name:
          "ChainSight",
        slug:
          "chainsight-oracle"
      },
      request: {
        endpoint:
          "/v1/ask",
        target:
          VENDOR,
        chainId:
          BASE_SEPOLIA_CHAIN_ID
      },
      result: {
        subject:
          VENDOR,
        chainId:
          BASE_SEPOLIA_CHAIN_ID,
        verdict:
          label
      },
      telegraph: {
        signalHash:
          "0x" + "a".repeat(64),
        costUsd:
          0.01,
        durationMs:
          100,
        timestamp:
          "2026-09-01T21:56:47.000Z"
      },
      capturedAt: {
        startedAt:
          "2026-09-01T21:56:47.000Z",
        finishedAt:
          "2026-09-01T21:56:47.000Z"
      },
      rawResponse: {
        fixture:
          true
      }
    });

  return {
    mandate,
    action,
    evidence
  };
}

describe(
  "probabilistic intelligence asymmetry",
  () => {
    it(
      "lets explicit suspicious/high-risk prose reduce authority",
      () => {
        const {
          mandate,
          action,
          evidence
        } = setup(
          "The exact subject is unverified/suspicious. High risk."
        );

        const decision =
          evaluatePaymentsStrictV1(
            mandate,
            action,
            evidence,
            {
              agentId:
                AGENT,
              now:
                NOW
            }
          );

        expect(
          decision.decision
        ).toBe("BLOCK");

        expect(
          decision.checks.find(
            (item) =>
              item.name ===
              "miner_result"
          )?.status
        ).toBe("BLOCK");
      }
    );

    it(
      "does not let arbitrary positive prose create authority",
      () => {
        const {
          mandate,
          action,
          evidence
        } = setup(
          "This looks low risk and probably safe."
        );

        const decision =
          evaluatePaymentsStrictV1(
            mandate,
            action,
            evidence,
            {
              agentId:
                AGENT,
              now:
                NOW
            }
          );

        expect(
          decision.checks.find(
            (item) =>
              item.name ===
              "miner_result"
          )?.status
        ).toBe("HOLD");

        expect(
          decision.decision
        ).not.toBe("ALLOW");
      }
    );
  }
);
