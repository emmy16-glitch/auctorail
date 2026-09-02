import { createHash } from "node:crypto";
import { getAddress } from "ethers";
import { canonicalize, type ActionContract } from "../core/action-contract.js";

export const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";

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
    | "transaction_selector_mismatch"
    | "transaction_calldata_malformed"
    | "transaction_intent_malformed";
}

function normalizeAddress(value: string): string {
  return getAddress(value.toLowerCase()).toLowerCase();
}

export function normalizeTransactionIntent(intent: TransactionIntent): TransactionIntent {
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
    sender: normalizeAddress(intent.sender),
    token: normalizeAddress(intent.token),
    recipient: normalizeAddress(intent.recipient),
    amountRaw: BigInt(intent.amountRaw).toString(),
    value: BigInt(intent.value).toString(),
    calldata: intent.calldata.toLowerCase()
  };
}

export function encodeErc20TransferCalldata(recipient: string, amountRaw: string): string {
  const normalizedRecipient = normalizeAddress(recipient).slice(2).padStart(64, "0");
  const normalizedAmount = BigInt(amountRaw).toString(16).padStart(64, "0");
  return `${ERC20_TRANSFER_SELECTOR}${normalizedRecipient}${normalizedAmount}`;
}

export function hashTransactionIntent(intent: TransactionIntent): string {
  const canonical = canonicalize(normalizeTransactionIntent(intent));
  return "0x" + createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function verifyTransactionIntent(expected: TransactionIntent, actual: TransactionIntent): TransactionIntentVerification {
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
    if (normalizedExpected[field] !== normalizedActual[field]) return { valid: false, code };
  }
  return { valid: true, code: "transaction_intent_valid" };
}

export function verifyErc20TransferIntent(
  action: ActionContract,
  sender: string,
  actual: TransactionIntent
): TransactionIntentVerification {
  let normalizedActual: TransactionIntent;
  try {
    normalizedActual = normalizeTransactionIntent(actual);
  } catch {
    return { valid: false, code: "transaction_intent_malformed" };
  }
  if (normalizedActual.calldata.slice(0, 10) !== ERC20_TRANSFER_SELECTOR) {
    return { valid: false, code: "transaction_selector_mismatch" };
  }
  if (normalizedActual.calldata.length !== 138 || !/^0x[0-9a-f]{136}$/.test(normalizedActual.calldata)) {
    return { valid: false, code: "transaction_calldata_malformed" };
  }
  const encodedRecipient = `0x${normalizedActual.calldata.slice(34, 74)}`;
  const encodedAmount = BigInt(`0x${normalizedActual.calldata.slice(74)}`).toString();
  const decodedRecipient = normalizeAddress(encodedRecipient);
  const expected: TransactionIntent = {
    chainId: action.payload.chainId,
    sender,
    token: action.payload.token,
    recipient: action.payload.destination,
    amountRaw: action.payload.amountRaw,
    calldata: encodeErc20TransferCalldata(action.payload.destination, action.payload.amountRaw),
    value: "0"
  };
  if (decodedRecipient !== action.payload.destination.toLowerCase()) {
    return { valid: false, code: "transaction_recipient_mismatch" };
  }
  if (encodedAmount !== BigInt(action.payload.amountRaw).toString()) {
    return { valid: false, code: "transaction_amount_mismatch" };
  }
  return verifyTransactionIntent(expected, normalizedActual);
}
