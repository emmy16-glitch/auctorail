import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BASE_SEPOLIA_USDC
} from "../src/core/action-contract.js";
import {
  executeProtectedAction
} from "../src/executor/controlled-executor.js";
import {
  FilePermitConsumptionStore
} from "../src/executor/permit-store.js";
import {
  evaluatePaymentsAdaptiveV1
} from "../src/policy/payments-adaptive-v1.js";
import {
  mintPermit,
  verifyPermit
} from "../src/permit/permit.js";
import {
  createProofReceipt,
  verifyProofReceipt
} from "../src/receipt/proof-receipt.js";
import {
  createEvidenceBundle,
  verifyEvidenceBundle
} from "../src/telegraph/evidence-bundle.js";
import {
  ADAPTIVE_TEST_AGENT,
  ADAPTIVE_TEST_NOW,
  adaptiveContext,
  adaptiveEvidence
} from "./helpers/adaptive-fixtures.js";

const SECRET =
  "adaptive-permit-test-secret-" +
  "x".repeat(64);

function allowed() {
  const context = adaptiveContext("7000000");
  const decision = evaluatePaymentsAdaptiveV1(
    context.mandate,
    context.action,
    context.plan,
    context.bundle,
    {
      agentId: ADAPTIVE_TEST_AGENT,
      now: ADAPTIVE_TEST_NOW
    }
  );

  expect(decision.decision).toBe("ALLOW");

  const permit = mintPermit(
    context.mandate,
    context.action,
    context.bundle,
    decision,
    SECRET,
    {
      now: ADAPTIVE_TEST_NOW,
      ttlSeconds: 30
    }
  );

  return {
    ...context,
    decision,
    permit
  };
}

describe("adaptive authorization cryptographic chain", () => {
  it("mints and verifies a permit bound to the complete evidence bundle", () => {
    const context = allowed();
    const result = verifyPermit(
      context.mandate,
      context.permit,
      context.action,
      context.bundle,
      context.decision,
      SECRET,
      {
        now: new Date(
          ADAPTIVE_TEST_NOW.getTime() + 1000
        )
      }
    );

    expect(result).toEqual({
      valid: true,
      code: "permit_valid"
    });
  });

  it("rejects swapping in a different but internally valid evidence bundle", () => {
    const context = allowed();
    const alternate = createEvidenceBundle(
      context.action,
      context.plan,
      context.plan.requirements.map(
        (requirement) => ({
          evidence: adaptiveEvidence(
            context.action,
            requirement.intent,
            requirement.intent ===
              "FRAUD_DETECTION"
              ? {
                  signalHash:
                    `0x${"a".repeat(64)}`
                }
              : undefined
          ),
          paymentAmountRaw: "10000",
          paymentNetwork: "eip155:84532",
          paymentAsset: BASE_SEPOLIA_USDC
        })
      ),
      { now: ADAPTIVE_TEST_NOW }
    );

    expect(verifyEvidenceBundle(alternate)).toBe(true);
    expect(alternate.bundleHash).not.toBe(
      context.bundle.bundleHash
    );

    const verification = verifyPermit(
      context.mandate,
      context.permit,
      context.action,
      alternate,
      context.decision,
      SECRET,
      {
        now: new Date(
          ADAPTIVE_TEST_NOW.getTime() + 1000
        )
      }
    );

    expect(verification.valid).toBe(false);
    expect(verification.code).toBe(
      "decision_hash_mismatch"
    );
  });

  it("executes a bundle-bound permit only once", async () => {
    const context = allowed();
    const directory = fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "proofgate-adaptive-permit-"
      )
    );
    const store = new FilePermitConsumptionStore(
      directory
    );
    let executions = 0;

    try {
      const first = await executeProtectedAction({
        mandate: context.mandate,
        permit: context.permit,
        action: context.action,
        evidence: context.bundle,
        decision: context.decision,
        secret: SECRET,
        store,
        execute: async () => {
          executions++;
          return { ok: true };
        },
        now: new Date(
          ADAPTIVE_TEST_NOW.getTime() + 1000
        )
      });

      const replay = await executeProtectedAction({
        mandate: context.mandate,
        permit: context.permit,
        action: context.action,
        evidence: context.bundle,
        decision: context.decision,
        secret: SECRET,
        store,
        execute: async () => {
          executions++;
          return { ok: true };
        },
        now: new Date(
          ADAPTIVE_TEST_NOW.getTime() + 2000
        )
      });

      expect(first.status).toBe("EXECUTED");
      expect(replay.code).toBe(
        "permit_already_consumed"
      );
      expect(executions).toBe(1);
    } finally {
      fs.rmSync(directory, {
        recursive: true,
        force: true
      });
    }
  });

  it("creates v3 receipts that expose and protect the Evidence Bundle", () => {
    const context = allowed();
    const receipt = createProofReceipt({
      mandate: context.mandate,
      action: context.action,
      evidence: context.bundle,
      decision: context.decision,
      permit: context.permit,
      execution: {
        status: "EXECUTED",
        code: "executed",
        transactionHash:
          `0x${"b".repeat(64)}`,
        chainId: 84532,
        executedAt:
          "2026-09-02T18:00:02.000Z"
      },
      now: new Date(
        "2026-09-02T18:00:03.000Z"
      )
    });

    expect(receipt.schemaVersion).toBe(
      "proofgate.receipt.v3"
    );
    expect(receipt.evidence?.source).toBe(
      "telegraph_bundle"
    );
    expect(verifyProofReceipt(receipt)).toBe(true);

    const tampered = structuredClone(receipt);
    if (
      tampered.evidence?.source ===
      "telegraph_bundle"
    ) {
      tampered.evidence.bundle.items[0].signalHash =
        `0x${"c".repeat(64)}`;
    }

    expect(
      verifyProofReceipt(tampered)
    ).toBe(false);
  });
});
