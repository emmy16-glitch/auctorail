import { describe, expect, it } from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import type { DecisionRecord } from "../src/policy/payments-strict-v1.js";
import {
  createProofReceipt,
  verifyProofReceipt
} from "../src/receipt/proof-receipt.js";

function action() {
  return createActionContract({
    type: "payment",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    amountRaw: "1000000",
    destination: "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
    reason: "Invoice INV-1042",
    policyId: "payments.strict.v1"
  });
}

function decision(actionId: string): DecisionRecord {
  return {
    actionId,
    decision: "HOLD",
    reason: "telegraph_evidence",
    policyId: "payments.strict.v1",
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

describe("ProofGate proof receipts", () => {
  it("hashes even a HOLD outcome so failed authorization is auditable", () => {
    const proposed = action();
    const receipt = createProofReceipt({
      action: proposed,
      evidence: null,
      decision: decision(proposed.id),
      permit: null,
      execution: {
        status: "BLOCKED",
        code: "decision_not_allow"
      },
      now: new Date("2026-09-01T19:00:01.000Z")
    });

    expect(receipt.receiptHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(verifyProofReceipt(receipt)).toBe(true);
  });

  it("refuses to record an EXECUTED action without ALLOW plus a permit", () => {
    const proposed = action();

    expect(() =>
      createProofReceipt({
        action: proposed,
        evidence: null,
        decision: decision(proposed.id),
        permit: null,
        execution: {
          status: "EXECUTED",
          code: "executed",
          transactionHash: "0x" + "1".repeat(64)
        }
      })
    ).toThrow("executed_without_valid_authorization_context");
  });

  it("detects receipt tampering", () => {
    const proposed = action();
    const receipt = createProofReceipt({
      action: proposed,
      evidence: null,
      decision: decision(proposed.id),
      permit: null,
      execution: {
        status: "BLOCKED",
        code: "decision_not_allow"
      }
    });

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
