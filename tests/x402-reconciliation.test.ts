import { describe, expect, it } from "vitest";

import {
  extractExactEvmAuthorization
} from "../src/telegraph/x402-reconciliation.js";
import type {
  X402PaymentLane
} from "../src/telegraph/x402-policy.js";

const PAYER =
  "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A";
const PAY_TO =
  "0x2222222222222222222222222222222222222222";
const USDC =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const NONCE = `0x${"ab".repeat(32)}`;

const lane: X402PaymentLane = {
  scheme: "exact",
  network: "eip155:84532",
  asset: USDC,
  amount: "10000",
  payTo: PAY_TO
};

function payload(overrides?: Record<string, unknown>) {
  return {
    x402Version: 2,
    accepted: lane,
    payload: {
      signature: `0x${"11".repeat(65)}`,
      authorization: {
        from: PAYER,
        to: PAY_TO,
        value: "10000",
        validAfter: "0",
        validBefore: "1999999999",
        nonce: NONCE,
        ...overrides
      }
    }
  };
}

describe("x402 EIP-3009 reconciliation binding", () => {
  it("extracts only an authorization exactly bound to payer, payee, amount and Base Sepolia USDC lane", () => {
    const authorization =
      extractExactEvmAuthorization({
        paymentPayload: payload(),
        lane,
        expectedPayer: PAYER
      });

    expect(authorization.from).toBe(PAYER);
    expect(authorization.to).toBe(PAY_TO);
    expect(authorization.value).toBe("10000");
    expect(authorization.nonce).toBe(NONCE);
  });

  it("rejects a recipient substitution before any on-chain reconciliation", () => {
    expect(() =>
      extractExactEvmAuthorization({
        paymentPayload: payload({
          to: "0x3333333333333333333333333333333333333333"
        }),
        lane,
        expectedPayer: PAYER
      })
    ).toThrow(/x402_reconciliation_recipient_mismatch/);
  });

  it("rejects an amount substitution before any on-chain reconciliation", () => {
    expect(() =>
      extractExactEvmAuthorization({
        paymentPayload: payload({ value: "20000" }),
        lane,
        expectedPayer: PAYER
      })
    ).toThrow(/x402_reconciliation_amount_mismatch/);
  });

  it("rejects a payer substitution before any on-chain reconciliation", () => {
    expect(() =>
      extractExactEvmAuthorization({
        paymentPayload: payload({
          from: "0x4444444444444444444444444444444444444444"
        }),
        lane,
        expectedPayer: PAYER
      })
    ).toThrow(/x402_reconciliation_payer_mismatch/);
  });
});
