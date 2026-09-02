import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import { createMandateContract } from "../src/core/mandate-contract.js";
import { normalizeTelegraphEvidence } from "../src/evidence/telegraph.js";
import { executeProtectedAction } from "../src/executor/controlled-executor.js";
import { FilePermitConsumptionStore } from "../src/executor/permit-store.js";
import { evaluatePaymentsStrictV1 } from "../src/policy/payments-strict-v1.js";
import { mintPermit } from "../src/permit/permit.js";
import {
  createProofReceipt,
  verifyProofReceipt
} from "../src/receipt/proof-receipt.js";

const VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const AGENT = "procurement-agent";
const SECRET = "proofgate-e2e-unit-secret-" + "k".repeat(64);

function applicableAllowEvidence() {
  return normalizeTelegraphEvidence({
    schemaVersion: "proofgate.telegraph-evidence.v1",
    source: "telegraph",
    intent: "FRAUD_DETECTION",
    miner: {
      id: "unit-refut",
      name: "Refut On-Chain Risk (unit fixture)",
      slug: "refut-onchain-risk"
    },
    request: {
      endpoint: "/assess",
      target: VENDOR,
      chainId: BASE_SEPOLIA_CHAIN_ID
    },
    result: {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      confidence: 0.95,
      reasoning: "Unit fixture: contract controls satisfy the standing policy.",
      subject: VENDOR,
      verdict: "ALLOW",
      signals: [
        { key: "isContract", present: true },
        { key: "upgradeable", present: false },
        { key: "hasAdmin", present: false },
        { key: "hasOwner", present: false },
        { key: "pausable", present: false }
      ]
    },
    telegraph: {
      signalHash: "0x" + "a".repeat(64),
      costUsd: 0.01,
      durationMs: 100,
      timestamp: "2026-09-01T19:20:00.000Z"
    },
    capturedAt: {
      startedAt: "2026-09-01T19:19:59.000Z",
      finishedAt: "2026-09-01T19:20:00.000Z"
    },
    rawResponse: {
      fixture: true,
      signal_hash: "0x" + "a".repeat(64)
    }
  });
}

describe("ProofGate end-to-end security plumbing", () => {
  it("binds Mandate -> Action -> evidence -> ALLOW -> permit -> execution -> receipt", async () => {
    const mandate = createMandateContract({
      mandateId: "treasury-demo-v1",
      principalId: "company-demo",
      agentId: AGENT,
      allowedActionTypes: ["payment"],
      allowedChainIds: [BASE_SEPOLIA_CHAIN_ID],
      allowedAssets: [BASE_SEPOLIA_USDC],
      allowedDestinations: [VENDOR],
      maxPerActionRaw: "10000000",
      requiredIntents: ["FRAUD_DETECTION"],
      policyId: "payments.strict.v1",
    policyVersion: 1,
      issuedAt: "2026-09-01T00:00:00.000Z",
      expiresAt: "2026-09-08T01:00:00.000Z",
      version: 1
    });
    const evidence = applicableAllowEvidence();
    const action = createActionContract({
      type: "payment",
      chainId: BASE_SEPOLIA_CHAIN_ID,
      token: BASE_SEPOLIA_USDC,
      amountRaw: "1000000",
      destination: VENDOR,
      reason: "Invoice INV-1042",
      policyId: "payments.strict.v1"
    });
    const now = new Date("2026-09-01T19:20:01.000Z");
    const decision = evaluatePaymentsStrictV1(mandate, action, evidence, {
      agentId: AGENT,
      now
    });

    expect(decision.decision).toBe("ALLOW");
    expect(decision.mandate.mandateHash).toBe(mandate.mandateHash);
    expect(decision.checks.every((item) => item.status === "PASS")).toBe(true);

    const permit = mintPermit(mandate, action, evidence, decision, SECRET, {
      now,
      ttlSeconds: 30
    });
    expect(permit.payload.mandateHash).toBe(mandate.mandateHash);

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "proofgate-e2e-"));
    const store = new FilePermitConsumptionStore(directory);
    let executions = 0;
    const txHash = "0x" + "b".repeat(64);

    const result = await executeProtectedAction({
      mandate,
      permit,
      action,
      evidence,
      decision,
      secret: SECRET,
      store,
      execute: async () => {
        executions++;
        return { transactionHash: txHash };
      },
      now: new Date(now.getTime() + 1_000)
    });

    expect(result.status).toBe("EXECUTED");
    expect(executions).toBe(1);

    const receipt = createProofReceipt({
      mandate,
      action,
      evidence,
      decision,
      permit,
      execution: {
        status: "EXECUTED",
        code: "executed",
        transactionHash: txHash,
        chainId: BASE_SEPOLIA_CHAIN_ID,
        executedAt: new Date(now.getTime() + 1_000).toISOString()
      }
    });

    expect(receipt.mandate.mandateHash).toBe(mandate.mandateHash);
    expect(verifyProofReceipt(receipt)).toBe(true);

    const replay = await executeProtectedAction({
      mandate,
      permit,
      action,
      evidence,
      decision,
      secret: SECRET,
      store,
      execute: async () => {
        executions++;
        return { transactionHash: "should-not-run" };
      },
      now: new Date(now.getTime() + 2_000)
    });

    expect(replay.code).toBe("permit_already_consumed");
    expect(executions).toBe(1);

    fs.rmSync(directory, { recursive: true, force: true });
  });
});
