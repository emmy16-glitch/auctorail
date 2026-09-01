import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  type ActionContract
} from "../core/action-contract.js";
import type { MandateContract } from "../core/mandate-contract.js";
import { TELEGRAPH_X402_POLICY } from "../telegraph/x402-policy.js";
import {
  CONTRACT_CONTROL_MINER_SLUG,
  CONTRACT_CONTROL_SELECTION_POLICY
} from "../telegraph/capability-route.js";

export type LiveEvidenceGuardCode =
  | "live_evidence_valid"
  | "live_evidence_malformed"
  | "live_evidence_source_mismatch"
  | "live_evidence_intent_mismatch"
  | "live_evidence_route_unapproved"
  | "live_evidence_capability_route_invalid"
  | "live_evidence_action_hash_mismatch"
  | "live_evidence_mandate_hash_mismatch"
  | "live_evidence_target_mismatch"
  | "live_evidence_chain_mismatch"
  | "live_evidence_payment_missing"
  | "live_evidence_payment_network_mismatch"
  | "live_evidence_payment_asset_mismatch"
  | "live_evidence_payment_amount_invalid"
  | "live_evidence_payment_amount_exceeds_policy"
  | "live_evidence_settlement_unproven"
  | "live_evidence_settlement_transaction_missing";

export type LiveEvidenceGuardResult =
  | {
      valid: true;
      code: "live_evidence_valid";
    }
  | {
      valid: false;
      code: Exclude<LiveEvidenceGuardCode, "live_evidence_valid">;
      detail: string;
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addressesEqual(a: unknown, b: string): boolean {
  return (
    typeof a === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(a) &&
    a.toLowerCase() === b.toLowerCase()
  );
}

function fail(
  code: Exclude<LiveEvidenceGuardCode, "live_evidence_valid">,
  detail: string
): LiveEvidenceGuardResult {
  return {
    valid: false,
    code,
    detail
  };
}

export function validateLiveExecutionEvidenceEnvelope(
  raw: unknown,
  mandate: MandateContract,
  action: ActionContract
): LiveEvidenceGuardResult {
  if (!isObject(raw)) {
    return fail(
      "live_evidence_malformed",
      "Saved Telegraph evidence must be a JSON object."
    );
  }

  if (raw.source !== "telegraph") {
    return fail(
      "live_evidence_source_mismatch",
      "Only Telegraph evidence may authorize the protected live execution path."
    );
  }

  if (raw.intent !== "FRAUD_DETECTION") {
    return fail(
      "live_evidence_intent_mismatch",
      "Live execution requires FRAUD_DETECTION evidence."
    );
  }

  const request = raw.request;

  if (!isObject(request)) {
    return fail(
      "live_evidence_malformed",
      "Saved Telegraph evidence is missing request provenance."
    );
  }

  if (
    request.routeMode !== "AUTO_ROUTE" &&
    request.routeMode !== "CAPABILITY_ROUTE"
  ) {
    return fail(
      "live_evidence_route_unapproved",
      "Only AUTO_ROUTE or a ProofGate capability-selected Telegraph route may authorize live execution."
    );
  }

  if (request.routeMode === "CAPABILITY_ROUTE") {
    const miner = raw.miner;

    if (
      request.selectionPolicy !==
        CONTRACT_CONTROL_SELECTION_POLICY ||
      request.endpoint !== "/assess" ||
      !isObject(miner) ||
      miner.slug !==
        CONTRACT_CONTROL_MINER_SLUG
    ) {
      return fail(
        "live_evidence_capability_route_invalid",
        "Capability-routed evidence does not match ProofGate's locked contract-control selection policy."
      );
    }
  }

  if (request.actionHash !== action.actionHash) {
    return fail(
      "live_evidence_action_hash_mismatch",
      "Evidence was not acquired for this exact Action Contract."
    );
  }

  if (request.mandateHash !== mandate.mandateHash) {
    return fail(
      "live_evidence_mandate_hash_mismatch",
      "Evidence was not acquired under this exact Mandate Contract."
    );
  }

  if (!addressesEqual(request.target, action.payload.destination)) {
    return fail(
      "live_evidence_target_mismatch",
      "Evidence request target does not match the exact payment destination."
    );
  }

  if (
    request.chainId !== action.payload.chainId ||
    action.payload.chainId !== BASE_SEPOLIA_CHAIN_ID
  ) {
    return fail(
      "live_evidence_chain_mismatch",
      "Evidence request chain does not match the exact protected action chain."
    );
  }

  const payment = raw.payment;

  if (!isObject(payment)) {
    return fail(
      "live_evidence_payment_missing",
      "Final live execution requires a proven Telegraph x402 payment."
    );
  }

  if (payment.network !== TELEGRAPH_X402_POLICY.network) {
    return fail(
      "live_evidence_payment_network_mismatch",
      "Telegraph x402 settlement occurred on an unapproved network."
    );
  }

  if (!addressesEqual(payment.asset, BASE_SEPOLIA_USDC)) {
    return fail(
      "live_evidence_payment_asset_mismatch",
      "Telegraph x402 settlement used an unapproved asset."
    );
  }

  if (
    typeof payment.amountRaw !== "string" ||
    !/^[1-9][0-9]*$/.test(payment.amountRaw)
  ) {
    return fail(
      "live_evidence_payment_amount_invalid",
      "Telegraph x402 amount is missing or invalid."
    );
  }

  if (BigInt(payment.amountRaw) > TELEGRAPH_X402_POLICY.maxAmountRaw) {
    return fail(
      "live_evidence_payment_amount_exceeds_policy",
      "Telegraph x402 settlement exceeded ProofGate's standing proof-cost policy."
    );
  }

  const settlement = payment.settlement;

  if (
    !isObject(settlement) ||
    settlement.success !== true ||
    settlement.code !== "payment_settled"
  ) {
    return fail(
      "live_evidence_settlement_unproven",
      "HTTP success is not enough; definitive x402 settlement must be proven."
    );
  }

  if (
    typeof settlement.transaction !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(settlement.transaction)
  ) {
    return fail(
      "live_evidence_settlement_transaction_missing",
      "A successful x402 settlement must include its transaction hash."
    );
  }

  return {
    valid: true,
    code: "live_evidence_valid"
  };
}

export function assertLiveExecutionEvidenceEnvelope(
  raw: unknown,
  mandate: MandateContract,
  action: ActionContract
): void {
  const result = validateLiveExecutionEvidenceEnvelope(raw, mandate, action);

  if (!result.valid) {
    throw new Error(`${result.code}:${result.detail}`);
  }
}
