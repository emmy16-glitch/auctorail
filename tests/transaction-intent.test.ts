import { describe, expect, it } from "vitest";
import {
  hashTransactionIntent,
  verifyTransactionIntent,
  type TransactionIntent
} from "../src/executor/transaction-intent.js";

const expected: TransactionIntent = {
  chainId: 84532,
  sender: "0x0000000000000000000000000000000000000002",
  token: "0x0000000000000000000000000000000000000003",
  recipient: "0x0000000000000000000000000000000000000004",
  amountRaw: "1000000",
  calldata: `0xa9059cbb${"4".padStart(64, "0")}${"f4240".padStart(64, "0")}`,
  value: "0"
};

describe("transaction intent binding", () => {
  it("accepts an equivalent normalized intent and hashes it deterministically", () => {
    const equivalent = { ...expected, sender: `0x${expected.sender.slice(2).toUpperCase()}`, token: `0x${expected.token.slice(2).toUpperCase()}`, recipient: `0x${expected.recipient.slice(2).toUpperCase()}`, amountRaw: "0001000000", value: "00", calldata: expected.calldata.toLowerCase() };
    expect(verifyTransactionIntent(expected, equivalent)).toEqual({ valid: true, code: "transaction_intent_valid" });
    expect(hashTransactionIntent(expected)).toBe(hashTransactionIntent(equivalent));
  });

  it.each([
    ["chainId", { chainId: 1 }, "transaction_chain_mismatch"],
    ["sender", { sender: "0x0000000000000000000000000000000000000005" }, "transaction_sender_mismatch"],
    ["token", { token: "0x0000000000000000000000000000000000000005" }, "transaction_token_mismatch"],
    ["recipient", { recipient: "0x0000000000000000000000000000000000000005" }, "transaction_recipient_mismatch"],
    ["amount", { amountRaw: "1000001" }, "transaction_amount_mismatch"],
    ["calldata", { calldata: "0xdeadbeef" }, "transaction_calldata_mismatch"],
    ["value", { value: "1" }, "transaction_value_mismatch"]
  ])("rejects mutated %s", (_field, mutation, code) => {
    expect(verifyTransactionIntent(expected, { ...expected, ...mutation })).toEqual({ valid: false, code });
  });

  it("rejects malformed addresses and numeric values", () => {
    expect(verifyTransactionIntent(expected, { ...expected, sender: "not-an-address" })).toEqual({ valid: false, code: "transaction_intent_malformed" });
    expect(() => hashTransactionIntent({ ...expected, amountRaw: "-1" })).toThrow();
  });
});
