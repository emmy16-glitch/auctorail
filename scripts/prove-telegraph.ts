import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import {
  wrapFetchWithPayment,
  x402Client
} from "@x402/fetch";
import {
  ExactEvmScheme,
  toClientEvmSigner
} from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract,
  type ActionContract
} from "../src/core/action-contract.js";
import {
  normalizeTelegraphEvidence,
  type TelegraphEvidenceRecord
} from "../src/evidence/telegraph.js";
import { FileOperationJournal } from "../src/executor/operation-journal.js";
import {
  evaluatePaymentsStrictV1,
  type DecisionRecord
} from "../src/policy/payments-strict-v1.js";
import {
  createProofReceipt
} from "../src/receipt/proof-receipt.js";
import {
  TELEGRAPH_X402_POLICY,
  classifyPaymentResponseHeader,
  parsePaymentRequiredHeader,
  selectApprovedTelegraphPaymentLane,
  type X402PaymentLane,
  type X402SettlementResult
} from "../src/telegraph/x402-policy.js";

interface MinerRecord {
  id: string | number;
  name: string;
  slug: string;
  activation_status: string;
}

const PRIVATE_KEY = process.env.TELEGRAPH_EVM_PRIVATE_KEY as
  | `0x${string}`
  | undefined;

const TARGET = process.argv[2];

if (!PRIVATE_KEY) {
  throw new Error("TELEGRAPH_EVM_PRIVATE_KEY is missing");
}

if (!TARGET || !/^0x[0-9a-fA-F]{40}$/.test(TARGET)) {
  throw new Error(
    "Usage: npx tsx scripts/prove-telegraph.ts <VENDOR_ADDRESS>"
  );
}

const action = createActionContract({
  type: "payment",
  chainId: BASE_SEPOLIA_CHAIN_ID,
  token: BASE_SEPOLIA_USDC,
  amountRaw: "1000000",
  destination: TARGET,
  reason: "Invoice INV-1042",
  policyId: "payments.strict.v1"
});

const miners = JSON.parse(
  fs.readFileSync("data/miners.json", "utf8")
) as MinerRecord[];

const miner = miners.find(
  (candidate) =>
    candidate.slug === "refut-onchain-risk" &&
    candidate.activation_status === "active"
);

if (!miner) {
  await finishWithoutEvidence(
    action,
    "telegraph_miner_unavailable",
    "Refut On-Chain Risk is not active in the current live registry."
  );
  process.exit(2);
}

const account = privateKeyToAccount(PRIVATE_KEY);
const signer = toClientEvmSigner(account);
const engine =
  process.env.TELEGRAPH_ENGINE_URL ||
  "https://devnode.telegraphprotocol.com/engine";
const url = `${engine}/v1/ask/${miner.id}`;
const requestBody = {
  method: "POST",
  endpoint: "/assess",
  payload: {
    address: action.payload.destination,
    chainId: action.payload.chainId
  }
};

const journal = new FileOperationJournal();
const operation = journal.create({
  kind: "telegraph_proof",
  actionHash: action.actionHash,
  target: action.payload.destination,
  metadata: {
    minerId: String(miner.id),
    minerName: miner.name,
    intent: "FRAUD_DETECTION"
  }
});

console.log("");
console.log("PROOFGATE LIVE PROOF");
console.log("====================");
console.log("Operation:", operation.operationId);
console.log("Action hash:", action.actionHash);
console.log("Action: 1 USDC →", action.payload.destination);
console.log("Telegraph Miner:", miner.name);
console.log("x402 payer:", account.address);
console.log("");

let preflight: Response;

try {
  preflight = await fetchWithReadRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });
} catch (error) {
  journal.update(operation.operationId, {
    state: "HOLD",
    metadata: {
      reason: "telegraph_preflight_unavailable",
      error: errorMessage(error)
    }
  });

  await finishWithoutEvidence(
    action,
    "telegraph_preflight_unavailable",
    errorMessage(error),
    operation.operationId
  );
  process.exit(2);
}

// Telegraph may choose to make a route free. A genuine successful Miner
// response is still evidence even when no payment challenge is required.
if (preflight.ok) {
  await completeSuccessfulProof({
    response: preflight,
    action,
    operationId: operation.operationId,
    miner,
    paymentLane: null,
    settlement: null
  });
  process.exit(0);
}

if (preflight.status !== 402) {
  journal.update(operation.operationId, {
    state: "HOLD",
    metadata: {
      reason: "telegraph_preflight_http_error",
      httpStatus: preflight.status
    }
  });

  await finishWithoutEvidence(
    action,
    `telegraph_preflight_http_${preflight.status}`,
    `Telegraph preflight returned HTTP ${preflight.status}.`,
    operation.operationId
  );
  process.exit(2);
}

const paymentRequired = preflight.headers.get("payment-required");

if (!paymentRequired) {
  journal.update(operation.operationId, {
    state: "HOLD",
    metadata: {
      reason: "payment_challenge_missing"
    }
  });

  await finishWithoutEvidence(
    action,
    "payment_challenge_missing",
    "Telegraph returned 402 without PAYMENT-REQUIRED.",
    operation.operationId
  );
  process.exit(2);
}

let lane: X402PaymentLane;

try {
  const challenge = parsePaymentRequiredHeader(paymentRequired);
  const laneDecision = selectApprovedTelegraphPaymentLane(challenge);

  if (!laneDecision.approved) {
    journal.update(operation.operationId, {
      state: "HOLD",
      metadata: {
        reason: laneDecision.code
      }
    });

    await finishWithoutEvidence(
      action,
      laneDecision.code,
      "The x402 challenge did not satisfy ProofGate's standing payment policy.",
      operation.operationId
    );
    process.exit(2);
  }

  lane = laneDecision.lane;
} catch (error) {
  journal.update(operation.operationId, {
    state: "HOLD",
    metadata: {
      reason: "payment_challenge_malformed",
      error: errorMessage(error)
    }
  });

  await finishWithoutEvidence(
    action,
    "payment_challenge_malformed",
    errorMessage(error),
    operation.operationId
  );
  process.exit(2);
}

console.log("Approved x402 lane:");
console.log("  network:", lane.network);
console.log("  asset:", lane.asset);
console.log("  amountRaw:", lane.amount);
console.log("  payTo:", lane.payTo);
console.log("");

const client = x402Client.fromConfig({
  schemes: [
    {
      network: TELEGRAPH_X402_POLICY.network,
      client: new ExactEvmScheme(signer)
    }
  ]
});

const paidFetch = wrapFetchWithPayment(fetch, client);

journal.update(operation.operationId, {
  state: "PAYMENT_ATTEMPT_STARTED",
  metadata: {
    paymentNetwork: lane.network,
    paymentAsset: lane.asset,
    paymentAmountRaw: lane.amount,
    paymentRecipient: lane.payTo
  }
});

let response: Response;

try {
  // IMPORTANT: no automatic retry after this boundary. Once an x402 payment
  // attempt starts, a transport failure can be ambiguous with respect to
  // settlement and must be reconciled rather than blindly repeated.
  response = await paidFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });
} catch (error) {
  journal.update(operation.operationId, {
    state: "AMBIGUOUS",
    metadata: {
      reason: "x402_transport_ambiguous",
      error: errorMessage(error),
      automaticRetry: false
    }
  });

  await finishWithoutEvidence(
    action,
    "x402_transport_ambiguous",
    "The paid attempt lost a definitive response. ProofGate will not retry it blindly.",
    operation.operationId
  );
  process.exit(2);
}

const paymentResponse =
  response.headers.get("payment-response") ??
  response.headers.get("x-payment-response") ??
  null;
const settlement = classifyPaymentResponseHeader(paymentResponse);

if (!response.ok) {
  if (!settlement.success && settlement.code !== "payment_response_missing" && settlement.code !== "payment_response_malformed") {
    journal.update(operation.operationId, {
      state: "HOLD",
      metadata: {
        reason: settlement.code,
        httpStatus: response.status,
        settlement,
        automaticRetry: settlement.retryable
      }
    });

    console.log("PROOFGATE: HOLD");
    console.log("Reason:", settlement.code);
    console.log("HTTP:", response.status);
    console.log("Settlement:", settlement.errorReason ?? "(no reason)");
    console.log("Automatic retry: NO");

    await finishWithoutEvidence(
      action,
      settlement.code,
      settlement.errorReason ?? `Telegraph returned HTTP ${response.status}.`,
      operation.operationId
    );
    process.exit(2);
  }

  if (settlement.success) {
    journal.update(operation.operationId, {
      state: "HOLD",
      metadata: {
        reason: "miner_failed_after_payment",
        httpStatus: response.status,
        settlement,
        automaticRetry: false
      }
    });

    await finishWithoutEvidence(
      action,
      "miner_failed_after_payment",
      "The payment settled but Telegraph did not return successful Miner evidence. No automatic retry.",
      operation.operationId
    );
    process.exit(2);
  }

  journal.update(operation.operationId, {
    state: "AMBIGUOUS",
    metadata: {
      reason: "payment_outcome_ambiguous",
      httpStatus: response.status,
      settlement,
      automaticRetry: false
    }
  });

  await finishWithoutEvidence(
    action,
    "payment_outcome_ambiguous",
    "Telegraph returned a failed response without a definitive settlement result. No automatic retry.",
    operation.operationId
  );
  process.exit(2);
}

await completeSuccessfulProof({
  response,
  action,
  operationId: operation.operationId,
  miner,
  paymentLane: lane,
  settlement
});

async function completeSuccessfulProof(input: {
  response: Response;
  action: ActionContract;
  operationId: string;
  miner: MinerRecord;
  paymentLane: X402PaymentLane | null;
  settlement: X402SettlementResult | null;
}): Promise<void> {
  let body: Record<string, unknown>;

  try {
    const parsed = await input.response.json();

    if (!isObject(parsed)) {
      throw new Error("miner_response_not_object");
    }

    body = parsed;
  } catch (error) {
    journal.update(input.operationId, {
      state: "HOLD",
      metadata: {
        reason: "miner_response_invalid",
        error: errorMessage(error)
      }
    });

    await finishWithoutEvidence(
      input.action,
      "miner_response_invalid",
      errorMessage(error),
      input.operationId
    );
    return;
  }

  if (!isObject(body.result)) {
    journal.update(input.operationId, {
      state: "HOLD",
      metadata: {
        reason: "miner_result_missing"
      }
    });

    await finishWithoutEvidence(
      input.action,
      "miner_result_missing",
      "Telegraph returned HTTP 200 without a usable Miner result.",
      input.operationId
    );
    return;
  }

  const finishedAt = new Date().toISOString();
  const savedEvidence = {
    schemaVersion: "proofgate.telegraph-evidence.v1",
    source: "telegraph" as const,
    intent:
      typeof body.intent === "string"
        ? body.intent
        : "FRAUD_DETECTION",
    miner: {
      id: String(body.miner_id ?? input.miner.id),
      name:
        typeof body.miner_name === "string"
          ? body.miner_name
          : input.miner.name,
      slug: input.miner.slug
    },
    request: {
      endpoint: "/assess",
      target: input.action.payload.destination,
      chainId: input.action.payload.chainId
    },
    result: body.result,
    telegraph: {
      signalHash:
        typeof body.signal_hash === "string"
          ? body.signal_hash
          : null,
      costUsd:
        typeof body.cost_usd === "number"
          ? body.cost_usd
          : null,
      durationMs:
        typeof body.duration_ms === "number"
          ? body.duration_ms
          : null,
      timestamp:
        typeof body.timestamp === "string"
          ? body.timestamp
          : null
    },
    payment: input.paymentLane
      ? {
          network: input.paymentLane.network,
          asset: input.paymentLane.asset,
          amountRaw: input.paymentLane.amount,
          payTo: input.paymentLane.payTo,
          settlement: input.settlement
        }
      : {
          network: null,
          settlement: null,
          mode: "free"
        },
    capturedAt: {
      startedAt: operation.createdAt,
      finishedAt
    },
    rawResponse: body
  };

  let evidence: TelegraphEvidenceRecord;

  try {
    evidence = normalizeTelegraphEvidence(savedEvidence);
  } catch (error) {
    journal.update(input.operationId, {
      state: "HOLD",
      metadata: {
        reason: "evidence_normalization_failed",
        error: errorMessage(error)
      }
    });

    await finishWithoutEvidence(
      input.action,
      "evidence_normalization_failed",
      errorMessage(error),
      input.operationId
    );
    return;
  }

  const evidenceDirectory = path.join("data", "evidence");
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  const evidencePath = path.join(
    evidenceDirectory,
    `telegraph-${finishedAt.replace(/[:.]/g, "-")}.json`
  );

  fs.writeFileSync(
    evidencePath,
    JSON.stringify(savedEvidence, null, 2),
    { mode: 0o600 }
  );

  const decision = evaluatePaymentsStrictV1(
    input.action,
    evidence,
    { now: new Date() }
  );

  journal.update(input.operationId, {
    state: "CONFIRMED",
    metadata: {
      evidencePath,
      signalHash: evidence.signalHash,
      rawResponseHash: evidence.rawResponseHash,
      policyDecision: decision.decision,
      policyReason: decision.reason,
      settlement: input.settlement
    }
  });

  console.log("REAL TELEGRAPH EVIDENCE SAVED");
  console.log("Evidence:", evidencePath);
  console.log("Signal hash:", evidence.signalHash ?? "(missing)");
  console.log("Miner verdict:", evidence.label ?? "(missing)");
  console.log("Confidence:", evidence.confidence ?? "(missing)");
  console.log("Applicability:", evidence.applicability);
  console.log("");
  printDecision(decision);

  if (decision.decision !== "ALLOW") {
    saveReceipt(
      input.action,
      evidence,
      decision,
      `policy_${decision.decision.toLowerCase()}`,
      input.operationId
    );
  }
}

async function finishWithoutEvidence(
  proposedAction: ActionContract,
  reason: string,
  detail: string,
  operationId?: string
): Promise<void> {
  const decision = evaluatePaymentsStrictV1(
    proposedAction,
    null,
    { now: new Date() }
  );

  console.log("PROOFGATE: HOLD");
  console.log("Reason:", reason);
  console.log("Detail:", detail);
  console.log("Action remains unexecuted.");
  console.log("");

  saveReceipt(
    proposedAction,
    null,
    decision,
    reason,
    operationId
  );
}

function saveReceipt(
  proposedAction: ActionContract,
  evidence: TelegraphEvidenceRecord | null,
  decision: DecisionRecord,
  executionCode: string,
  operationId?: string
): string {
  const receipt = createProofReceipt({
    action: proposedAction,
    evidence,
    decision,
    permit: null,
    execution: {
      status: "NOT_EXECUTED",
      code: executionCode,
      chainId: proposedAction.payload.chainId
    },
    operationId
  });

  const directory = path.join("data", "receipts");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${receipt.receiptId}.json`);

  fs.writeFileSync(
    file,
    JSON.stringify(receipt, null, 2),
    { mode: 0o600 }
  );

  console.log("Proof receipt:", file);
  console.log("Receipt hash:", receipt.receiptHash);
  console.log("");

  return file;
}

function printDecision(decision: DecisionRecord): void {
  console.log("PROOFGATE:", decision.decision);
  console.log("Reason:", decision.reason);

  for (const item of decision.checks) {
    console.log(`${item.status.padEnd(5)} | ${item.name}`);
  }

  console.log("");
}

async function fetchWithReadRetry(
  input: string,
  init: RequestInit
): Promise<Response> {
  const delays = [0, 500, 1_000];
  let lastError: unknown = null;

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }

    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("telegraph_preflight_unavailable");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
