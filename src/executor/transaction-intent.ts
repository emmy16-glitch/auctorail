import { createHash } from "node:crypto";
import { getAddress } from "ethers";
import { canonicalize } from "../core/action-contract.js";

export interface TransactionIntent {
  chainId: number;
  sender: string;
  token: string;
  recipient: string;
  amountRaw: string;
  calldata: string;
  value: string;
}

export interface TransactionIntentVerification {
  valid: boolean;
  code:
    | "transaction_intent_valid"
    | "transaction_chain_mismatch"
    | "transaction_sender_mismatch"
    | "transaction_token_mismatch"
    | "transaction_recipient_mismatch"
    | "transaction_amount_mismatch"
    | "transaction_calldata_mismatch"
    | "transaction_value_mismatch"
    | "transaction_intent_malformed";
}

export function normalizeTransactionIntent(
  intent: TransactionIntent
): TransactionIntent {
  if (!/^[0-9]+$/.test(intent.amountRaw) || BigInt(intent.amountRaw) <= 0n) {
    throw new Error("invalid_transaction_amount");
  }
  if (!/^[0-9]+$/.test(intent.value)) {
    throw new Error("invalid_transaction_value");
  }
  if (!/^0x[0-9a-fA-F]*$/.test(intent.calldata)) {
    throw new Error("invalid_transaction_calldata");
  }
  return {
    ...intent,
    sender: getAddress(intent.sender.toLowerCase()).toLowerCase(),
    token: getAddress(intent.token.toLowerCase()).toLowerCase(),
    recipient: getAddress(intent.recipient.toLowerCase()).toLowerCase(),
    amountRaw: BigInt(intent.amountRaw).toString(),
    value: BigInt(intent.value).toString(),
    calldata: intent.calldata.toLowerCase()
  };
}

export function hashTransactionIntent(intent: TransactionIntent): string {
  const canonical = canonicalize(normalizeTransactionIntent(intent));
  return "0x" + createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function verifyTransactionIntent(
  expected: TransactionIntent,
  actual: TransactionIntent
): TransactionIntentVerification {
  let normalizedExpected: TransactionIntent;
  let normalizedActual: TransactionIntent;
  try {
    normalizedExpected = normalizeTransactionIntent(expected);
    normalizedActual = normalizeTransactionIntent(actual);
  } catch {
    return { valid: false, code: "transaction_intent_malformed" };
  }
  const fields: Array<[keyof TransactionIntent, TransactionIntentVerification["code"]]> = [
    ["chainId", "transaction_chain_mismatch"],
    ["sender", "transaction_sender_mismatch"],
    ["token", "transaction_token_mismatch"],
    ["recipient", "transaction_recipient_mismatch"],
    ["amountRaw", "transaction_amount_mismatch"],
    ["calldata", "transaction_calldata_mismatch"],
    ["value", "transaction_value_mismatch"]
  ];
  for (const [field, code] of fields) {
    if (normalizedExpected[field] !== normalizedActual[field]) {
      return { valid: false, code };
    }
  }
  return { valid: true, code: "transaction_intent_valid" };
}
