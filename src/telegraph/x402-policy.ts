export const TELEGRAPH_X402_POLICY = {
  x402Version: 2,
  scheme: "exact",
  network: "eip155:84532",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  maxAmountRaw: 10_000n
} as const;

export interface X402PaymentLane {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: unknown;
}

export interface X402PaymentRequired {
  x402Version: number;
  error?: string;
  accepts: X402PaymentLane[];
}

export type X402LaneDecisionCode =
  | "payment_lane_approved"
  | "unsupported_x402_version"
  | "approved_payment_lane_unavailable"
  | "payment_amount_invalid"
  | "payment_amount_exceeds_policy"
  | "payment_recipient_invalid";

export type X402LaneDecision =
  | {
      approved: true;
      code: "payment_lane_approved";
      lane: X402PaymentLane;
    }
  | {
      approved: false;
      code: Exclude<X402LaneDecisionCode, "payment_lane_approved">;
      lane?: X402PaymentLane;
    };

export type X402SettlementCode =
  | "payment_settled"
  | "payment_response_missing"
  | "payment_response_malformed"
  | "facilitator_insufficient_credits"
  | "facilitator_forbidden"
  | "payment_settlement_failed";

export interface X402SettlementResult {
  success: boolean;
  code: X402SettlementCode;
  retryable: boolean;
  transaction: string | null;
  errorReason: string | null;
}

function decodeBase64Json(value: string): unknown {
  const decoded = Buffer.from(value, "base64").toString("utf8");
  return JSON.parse(decoded);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAddressLike(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isNonZeroAddress(value: string): boolean {
  return (
    isAddressLike(value) &&
    value.toLowerCase() !== "0x0000000000000000000000000000000000000000"
  );
}

function addressesEqual(a: string, b: string): boolean {
  return isAddressLike(a) && isAddressLike(b) && a.toLowerCase() === b.toLowerCase();
}

export function parsePaymentRequiredHeader(header: string): X402PaymentRequired {
  const raw = decodeBase64Json(header);

  if (!isPlainObject(raw)) {
    throw new Error("payment_required_malformed");
  }

  if (!Number.isInteger(raw.x402Version)) {
    throw new Error("payment_required_malformed");
  }

  if (!Array.isArray(raw.accepts)) {
    throw new Error("payment_required_malformed");
  }

  const accepts: X402PaymentLane[] = raw.accepts.map((value) => {
    if (!isPlainObject(value)) {
      throw new Error("payment_required_malformed");
    }

    const lane = {
      scheme: value.scheme,
      network: value.network,
      asset: value.asset,
      amount: value.amount,
      payTo: value.payTo,
      maxTimeoutSeconds: value.maxTimeoutSeconds,
      extra: value.extra
    };

    if (
      typeof lane.scheme !== "string" ||
      typeof lane.network !== "string" ||
      typeof lane.asset !== "string" ||
      typeof lane.amount !== "string" ||
      typeof lane.payTo !== "string" ||
      (lane.maxTimeoutSeconds !== undefined &&
        typeof lane.maxTimeoutSeconds !== "number")
    ) {
      throw new Error("payment_required_malformed");
    }

    return lane as X402PaymentLane;
  });

  return {
    x402Version: raw.x402Version as number,
    error: typeof raw.error === "string" ? raw.error : undefined,
    accepts
  };
}

export function selectApprovedTelegraphPaymentLane(
  challenge: X402PaymentRequired
): X402LaneDecision {
  if (challenge.x402Version !== TELEGRAPH_X402_POLICY.x402Version) {
    return {
      approved: false,
      code: "unsupported_x402_version"
    };
  }

  const lane = challenge.accepts.find(
    (candidate) =>
      candidate.scheme === TELEGRAPH_X402_POLICY.scheme &&
      candidate.network === TELEGRAPH_X402_POLICY.network &&
      addressesEqual(candidate.asset, TELEGRAPH_X402_POLICY.asset)
  );

  if (!lane) {
    return {
      approved: false,
      code: "approved_payment_lane_unavailable"
    };
  }

  if (!isNonZeroAddress(lane.payTo)) {
    return {
      approved: false,
      code: "payment_recipient_invalid",
      lane
    };
  }

  if (!/^[1-9][0-9]*$/.test(lane.amount)) {
    return {
      approved: false,
      code: "payment_amount_invalid",
      lane
    };
  }

  const amount = BigInt(lane.amount);

  if (amount > TELEGRAPH_X402_POLICY.maxAmountRaw) {
    return {
      approved: false,
      code: "payment_amount_exceeds_policy",
      lane
    };
  }

  return {
    approved: true,
    code: "payment_lane_approved",
    lane
  };
}

export function classifyPaymentResponseHeader(
  header: string | null
): X402SettlementResult {
  if (!header) {
    return {
      success: false,
      code: "payment_response_missing",
      retryable: false,
      transaction: null,
      errorReason: null
    };
  }

  let raw: unknown;

  try {
    raw = decodeBase64Json(header);
  } catch {
    return {
      success: false,
      code: "payment_response_malformed",
      retryable: false,
      transaction: null,
      errorReason: null
    };
  }

  if (!isPlainObject(raw)) {
    return {
      success: false,
      code: "payment_response_malformed",
      retryable: false,
      transaction: null,
      errorReason: null
    };
  }

  const success = raw.success === true;
  const transaction = typeof raw.transaction === "string" && raw.transaction.length > 0
    ? raw.transaction
    : null;
  const errorReason = typeof raw.errorReason === "string"
    ? raw.errorReason
    : null;

  if (success) {
    return {
      success: true,
      code: "payment_settled",
      retryable: false,
      transaction,
      errorReason
    };
  }

  const normalized = (errorReason ?? "").toLowerCase();

  if (normalized.includes("insufficient_credits")) {
    return {
      success: false,
      code: "facilitator_insufficient_credits",
      retryable: false,
      transaction,
      errorReason
    };
  }

  if (normalized.includes("facilitator returned 403")) {
    return {
      success: false,
      code: "facilitator_forbidden",
      retryable: false,
      transaction,
      errorReason
    };
  }

  return {
    success: false,
    code: "payment_settlement_failed",
    retryable: false,
    transaction,
    errorReason
  };
}
