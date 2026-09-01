import fs from "node:fs";
import path from "node:path";

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
  loadTelegraphEvidence
} from "../src/evidence/telegraph.js";

import {
  evaluatePaymentsStrictV1
} from "../src/policy/payments-strict-v1.js";

function latestEvidenceFile():
  string {
  const directory =
    path.join(
      process.cwd(),
      "data",
      "evidence"
    );

  const files =
    fs.readdirSync(directory)
      .filter(
        (name) =>
          name.endsWith(".json")
      )
      .sort();

  if (
    files.length === 0
  ) {
    throw new Error(
      "No real Telegraph evidence files found."
    );
  }

  return path.join(
    directory,
    files[files.length - 1]
  );
}

describe(
  "payments.strict.v1 with REAL Telegraph evidence",
  () => {
    it(
      "HOLDs even when Miner says ALLOW if evidence is insufficient",
      () => {
        const evidence =
          loadTelegraphEvidence(
            latestEvidenceFile()
          );

        // This is the exact subject
        // that was actually assessed
        // by the live Miner.
        const action =
          createActionContract({
            type:
              "payment",

            chainId:
              BASE_SEPOLIA_CHAIN_ID,

            token:
              BASE_SEPOLIA_USDC,

            amountRaw:
              "5000000",

            destination:
              evidence.subject,

            reason:
              "Invoice INV-1042",

            policyId:
              "payments.strict.v1"
          });

        // Evaluate one second after
        // the actual evidence timestamp
        // so this test focuses on
        // evidence quality rather than age.
        const now =
          new Date(
            new Date(
              evidence.receivedAt
            ).getTime() +
              1000
          );

        const decision =
          evaluatePaymentsStrictV1(
            action,
            evidence,
            { now }
          );

        // Telegraph really said ALLOW.
        expect(
          evidence.label
        ).toBe("ALLOW");

        // ProofGate independently
        // refuses authorization.
        expect(
          decision.decision
        ).toBe("HOLD");

        expect(
          evidence.confidence
        ).toBe(0.5);

        expect(
          evidence.applicability
        ).toBe(
          "NOT_APPLICABLE"
        );

        const applicability =
          decision.checks.find(
            (item) =>
              item.name ===
              "evidence_applicability"
          );

        expect(
          applicability?.status
        ).toBe("HOLD");

        const confidence =
          decision.checks.find(
            (item) =>
              item.name ===
              "minimum_confidence"
          );

        expect(
          confidence?.status
        ).toBe("HOLD");

        const signal =
          decision.checks.find(
            (item) =>
              item.name ===
              "telegraph_signal_hash"
          );

        expect(
          signal?.status
        ).toBe("PASS");
      }
    );
  }
);
