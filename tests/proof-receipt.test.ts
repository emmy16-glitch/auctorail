import { describe, expect, it } from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import { createMandateContract, type MandateContract } from "../src/core/mandate-contract.js";
import type { DecisionRecord } from "../src/policy/payments-strict-v1.js";
import {
  createProofReceipt,
  verifyProofReceipt,
  type ProofReceipt
} from "../src/receipt/proof-receipt.js";

const VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const AGENT = "procurement-agent";

function mandate() {
  return createMandateContract({
    mandateId: "receipt-unit-mandate",
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
}

function action() {
  return createActionContract({
    type: "payment",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    amountRaw: "1000000",
    destination: VENDOR,
    reason: "Invoice INV-1042",
    policyId: "payments.strict.v1"
  });
}

function decision(delegated: MandateContract, actionId: string): DecisionRecord {
  return {
    mandate: {
      mandateId: delegated.mandateId,
      mandateHash: delegated.mandateHash,
      principalId: delegated.principalId,
      agentId: delegated.agentId,
      version: delegated.version
    },
    agentId: AGENT,
    actionId,
    decision: "HOLD",
    reason: "telegraph_evidence",
    policyId: "payments.strict.v1",
    policyVersion: 1,
    checks: [
      {
        name: "telegraph_evidence",
        status: "HOLD",
        reason: "Required Telegraph evidence is missing."
      }
    ],
    decidedAt: "2026-09-01T19:00:00.000Z"
  };
}

function holdReceipt() {
  const delegated = mandate();
  const proposed = action();
  return createProofReceipt({
    mandate: delegated,
    action: proposed,
    evidence: null,
    decision: decision(delegated, proposed.id),
    permit: null,
    execution: {
      status: "BLOCKED",
      code: "decision_not_allow"
    },
    now: new Date("2026-09-01T19:00:01.000Z")
  });
}

describe("Auctorail proof receipts", () => {
  it("hashes mandate context even for a HOLD/BLOCK outcome", () => {
    const receipt = holdReceipt();

    expect(receipt.schemaVersion).toBe("proofgate.receipt.v2");
    expect(receipt.mandate.mandateHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(receipt.receiptHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(verifyProofReceipt(receipt)).toBe(true);
  });

  it("refuses to record an EXECUTED action without ALLOW plus a permit", () => {
    const delegated = mandate();
    const proposed = action();

    expect(() =>
      createProofReceipt({
        mandate: delegated,
        action: proposed,
        evidence: null,
        decision: decision(delegated, proposed.id),
        permit: null,
        execution: {
          status: "EXECUTED",
          code: "executed",
          transactionHash: "0x" + "1".repeat(64)
        }
      })
    ).toThrow("executed_without_valid_authorization_context");
  });

  const tamperCases: Array<[
    string,
    (receipt: ProofReceipt) => ProofReceipt
  ]> = [
    ["mandateHash", (receipt) => ({
      ...receipt,
      mandate: { ...receipt.mandate, mandateHash: "0x" + "f".repeat(64) }
    })],
    ["principalId", (receipt) => ({
      ...receipt,
      mandate: { ...receipt.mandate, principalId: "attacker-principal" }
    })],
    ["agentId", (receipt) => ({
      ...receipt,
      mandate: { ...receipt.mandate, agentId: "attacker-agent" }
    })],
    ["canonicalMandate", (receipt) => ({
      ...receipt,
      mandate: {
        ...receipt.mandate,
        canonicalMandate: receipt.mandate.canonicalMandate.replace(
          "company-demo",
          "attacker-demo"
        )
      }
    })]
  ];

  it.each(tamperCases)("detects %s tampering", (_name, tamper) => {
    expect(verifyProofReceipt(tamper(holdReceipt()))).toBe(false);
  });

  it("detects ordinary receipt tampering", () => {
    const receipt = holdReceipt();
    const tampered = {
      ...receipt,
      execution: {
        ...receipt.execution,
        code: "executed"
      }
    };

    expect(verifyProofReceipt(tampered)).toBe(false);
  });
});
