import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  canonicalize,
  createActionContract,
  hashCanonicalPayload,
  type ActionContract,
  type PaymentPolicyId
} from "../src/core/action-contract.js";
import {
  createMandateContract,
  evaluateMandate,
  type MandateContract
} from "../src/core/mandate-contract.js";
import {
  normalizeTelegraphEvidence,
  type TelegraphEvidenceRecord
} from "../src/evidence/telegraph.js";
import {
  acquireVendorRuntimeAttestation,
  saveVendorRuntimeAttestation,
  supplementalRefFromVendorAttestation,
  type VendorRuntimeAttestation
} from "../src/evidence/vendor-runtime.js";
import { FileOperationJournal } from "../src/executor/operation-journal.js";
import {
  evaluatePaymentsStrictV1,
  type DecisionRecord
} from "../src/policy/payments-strict-v1.js";
import {
  evaluatePaymentsAttestedVendorV1
} from "../src/policy/payments-attested-vendor-v1.js";
import { createProofReceipt } from "../src/receipt/proof-receipt.js";
import {
  TELEGRAPH_X402_POLICY,
  classifyPaymentResponseHeader,
  parsePaymentRequiredHeader,
  selectApprovedTelegraphPaymentLane,
  type X402PaymentLane,
  type X402SettlementResult
} from "../src/telegraph/x402-policy.js";
import {
  createPaymentVerificationPlan,
  type TelegraphVerificationPlan
} from "../src/telegraph/verification-planner.js";
import {
  buildTelegraphEngineAskBody
} from "../src/telegraph/engine-ask.js";
import {
  CONTRACT_CONTROL_SELECTION_POLICY,
  selectContractControlMiner
} from "../src/telegraph/capability-route.js";
import {
  adaptBoundMinerResultForPolicy,
  proofExitCode,
  resolveServingMiner,
  validateExplicitEvidenceBinding,
  type ServingMinerIdentity,
  type TelegraphMinerRecord
} from "../src/telegraph/routed-evidence.js";

type MinerRecord = TelegraphMinerRecord;

type RouteMode =
  | "AUTO_ROUTE"
  | "CAPABILITY_ROUTE"
  | "DIRECT_REFUT_DIAGNOSTIC";

interface TelegraphRequestPlan {
  routeMode: RouteMode;
  url: string;
  requestBody: Record<string, unknown>;
  requestEndpoint: string;
  requestedMiner: MinerRecord | null;
  selectionPolicy: string | null;
  verificationPlan: TelegraphVerificationPlan;
}

const DEMO_AGENT_ID = "procurement-agent";
const CANONICAL_VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";

const PRIVATE_KEY = process.env.TELEGRAPH_EVM_PRIVATE_KEY as
  | `0x${string}`
  | undefined;
const TARGET = process.argv[2];
const DIRECT_REFUT =
  process.argv.includes("--direct-refut");
const CAPABILITY_ROUTE =
  process.argv.includes("--capability-route");
const ATTESTED_VENDOR_POLICY =
  process.argv.includes("--attested-vendor-policy");

if (DIRECT_REFUT && CAPABILITY_ROUTE) {
  throw new Error(
    "Choose only one Telegraph route mode: --capability-route or --direct-refut."
  );
}

if (!PRIVATE_KEY) {
  throw new Error("TELEGRAPH_EVM_PRIVATE_KEY is missing");
}

if (!TARGET || !/^0x[0-9a-fA-F]{40}$/.test(TARGET)) {
  throw new Error(
    "Usage: npx tsx scripts/prove-telegraph.ts <VENDOR_ADDRESS> [--capability-route|--direct-refut] [--attested-vendor-policy]"
  );
}

const POLICY_ID: PaymentPolicyId =
  ATTESTED_VENDOR_POLICY
    ? "payments.attested-vendor.v1"
    : "payments.strict.v1";

const mandate = createMandateContract({
  mandateId:
    ATTESTED_VENDOR_POLICY
      ? "treasury-demo-attested-v1"
      : "treasury-demo-v1",
  principalId: "company-demo",
  agentId: DEMO_AGENT_ID,
  allowedActionTypes: ["payment"],
  allowedChainIds: [BASE_SEPOLIA_CHAIN_ID],
  allowedAssets: [BASE_SEPOLIA_USDC],
  allowedDestinations: [CANONICAL_VENDOR],
  maxPerActionRaw: "10000000",
  requiredIntents: ["FRAUD_DETECTION"],
  policyId: POLICY_ID,
  issuedAt: "2026-09-01T00:00:00.000Z",
  expiresAt: "2026-09-08T01:00:00.000Z",
  version: 1
});

const action = createActionContract({
  type: "payment",
  chainId: BASE_SEPOLIA_CHAIN_ID,
  token: BASE_SEPOLIA_USDC,
  amountRaw: "1000000",
  destination: TARGET,
  reason: "Invoice INV-1042",
  policyId: POLICY_ID
});

const verificationPlan = createPaymentVerificationPlan(action);
const miners = loadMinerRegistry();
const account = privateKeyToAccount(PRIVATE_KEY);
const signer = toClientEvmSigner(account);
const engine = process.env.TELEGRAPH_ENGINE_URL || "https://devnode.telegraphprotocol.com/engine";
const requestPlan = buildRequestPlan({
  engine,
  verificationPlan,
  miners,
  capabilityRoute: CAPABILITY_ROUTE,
  directRefut: DIRECT_REFUT
});

const journal = new FileOperationJournal();
const operation = journal.create({
  kind: "telegraph_proof",
  actionHash: action.actionHash,
  target: action.payload.destination,
  metadata: {
    mandateId: mandate.mandateId,
    mandateHash: mandate.mandateHash,
    principalId: mandate.principalId,
    agentId: DEMO_AGENT_ID,
    routeMode: requestPlan.routeMode,
    requiredIntent: verificationPlan.requiredIntent,
    requestEndpoint: requestPlan.requestEndpoint,
    requestedMinerId: requestPlan.requestedMiner
      ? String(requestPlan.requestedMiner.id)
      : null,
    requestedMinerName: requestPlan.requestedMiner?.name ?? null,
    selectionPolicy: requestPlan.selectionPolicy
  }
});

console.log("");
console.log("PROOFGATE LIVE PROOF");
console.log("====================");
console.log("Operation:", operation.operationId);
console.log("Mandate:", mandate.mandateId);
console.log("Mandate hash:", mandate.mandateHash);
console.log("Action hash:", action.actionHash);
console.log("Action: 1 USDC →", action.payload.destination);
console.log("Required Intent:", verificationPlan.requiredIntent);
if (requestPlan.routeMode === "AUTO_ROUTE") {
  console.log(
    "Engine context:",
    "exact address + chainId supplied as routing/request context only"
  );
}
console.log(
  "Telegraph route:",
  requestPlan.routeMode === "AUTO_ROUTE"
    ? "AUTO / ranked Engine routing"
    : requestPlan.routeMode === "CAPABILITY_ROUTE"
      ? `CAPABILITY / ${requestPlan.requestedMiner?.name ?? "selected Miner"} / ${requestPlan.selectionPolicy}`
      : `DIRECT DIAGNOSTIC / ${requestPlan.requestedMiner?.name ?? "Refut"}`
);
console.log("x402 payer:", account.address);
console.log("");

// Refuse to spend on Telegraph proof for an action that is already outside
// delegated authority. External evidence can never override a mandate breach.
const mandatePrecheck = evaluateMandate(
  mandate,
  action,
  DEMO_AGENT_ID,
  new Date()
);

if (!mandatePrecheck.valid) {
  const failed = mandatePrecheck.checks.find((item) => item.status === "BLOCK");
  const reason = failed?.code ?? "mandate_violation";

  journal.update(operation.operationId, {
    state: "BLOCKED",
    metadata: {
      reason,
      telegraphCalled: false
    }
  });

  await finishWithoutEvidence(
    mandate,
    DEMO_AGENT_ID,
    action,
    reason,
    failed?.reason ?? "Action is outside delegated authority.",
    operation.operationId
  );
  process.exit(3);
}

let preflight: Response;

try {
  preflight = await fetchWithReadRetry(requestPlan.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestPlan.requestBody)
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
    mandate,
    DEMO_AGENT_ID,
    action,
    "telegraph_preflight_unavailable",
    errorMessage(error),
    operation.operationId
  );
  process.exit(2);
}

if (preflight.ok) {
  await completeSuccessfulProof({
    response: preflight,
    mandate,
    agentId: DEMO_AGENT_ID,
    action,
    operationId: operation.operationId,
    requestPlan,
    miners,
    paymentLane: null,
    settlement: null
  });
  process.exit(Number(process.exitCode ?? 0));
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
    mandate,
    DEMO_AGENT_ID,
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
    metadata: { reason: "payment_challenge_missing" }
  });

  await finishWithoutEvidence(
    mandate,
    DEMO_AGENT_ID,
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
      metadata: { reason: laneDecision.code }
    });

    await finishWithoutEvidence(
      mandate,
      DEMO_AGENT_ID,
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
    mandate,
    DEMO_AGENT_ID,
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
  response = await paidFetch(requestPlan.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestPlan.requestBody)
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
    mandate,
    DEMO_AGENT_ID,
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

if (response.ok && !settlement.success) {
  const detail =
    settlement.errorReason ??
    `Telegraph returned HTTP ${response.status}, but ProofGate could not prove x402 settlement (${settlement.code}).`;

  const rawBody = await readResponseBody(response.clone());
  const quarantinePath = saveQuarantinedEvidence(
    {
      mandate,
      action,
      operationId: operation.operationId,
      requestPlan,
      paymentLane: lane,
      settlement
    },
    rawBody,
    "payment_settlement_unproven",
    detail,
    null
  );

  journal.update(operation.operationId, {
    state: "HOLD",
    metadata: {
      reason: "payment_settlement_unproven",
      httpStatus: response.status,
      settlement,
      quarantinePath,
      automaticRetry: false
    }
  });

  console.log("PROOFGATE: HOLD");
  console.log("Reason: payment_settlement_unproven");
  console.log("Settlement:", settlement.code);
  console.log("Quarantined response:", quarantinePath);
  console.log("Automatic retry: NO");

  await finishWithoutEvidence(
    mandate,
    DEMO_AGENT_ID,
    action,
    "payment_settlement_unproven",
    detail,
    operation.operationId
  );
  process.exit(2);
}

if (!response.ok) {
  if (
    !settlement.success &&
    settlement.code !== "payment_response_missing" &&
    settlement.code !== "payment_response_malformed"
  ) {
    journal.update(operation.operationId, {
      state: "HOLD",
      metadata: {
        reason: settlement.code,
        httpStatus: response.status,
        settlement,
        automaticRetry: false
      }
    });

    console.log("PROOFGATE: HOLD");
    console.log("Reason:", settlement.code);
    console.log("HTTP:", response.status);
    console.log("Settlement:", settlement.errorReason ?? "(no reason)");
    console.log("Automatic retry: NO");

    await finishWithoutEvidence(
      mandate,
      DEMO_AGENT_ID,
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
      mandate,
      DEMO_AGENT_ID,
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
    mandate,
    DEMO_AGENT_ID,
    action,
    "payment_outcome_ambiguous",
    "Telegraph returned a failed response without a definitive settlement result. No automatic retry.",
    operation.operationId
  );
  process.exit(2);
}

await completeSuccessfulProof({
  response,
  mandate,
  agentId: DEMO_AGENT_ID,
  action,
  operationId: operation.operationId,
  requestPlan,
  miners,
  paymentLane: lane,
  settlement
});

function buildRequestPlan(input: {
  engine: string;
  verificationPlan: TelegraphVerificationPlan;
  miners: MinerRecord[];
  capabilityRoute: boolean;
  directRefut: boolean;
}): TelegraphRequestPlan {
  if (input.capabilityRoute) {
    const selection =
      selectContractControlMiner(input.miners);

    if (!selection.selected) {
      throw new Error(selection.code);
    }

    return {
      routeMode: "CAPABILITY_ROUTE",
      url:
        `${input.engine}/v1/ask/${selection.miner.id}`,
      requestBody: {
        method: "POST",
        endpoint: "/assess",
        payload: {
          address:
            input.verificationPlan.subject,
          chainId:
            input.verificationPlan.chainId
        }
      },
      requestEndpoint: "/assess",
      requestedMiner: selection.miner,
      selectionPolicy:
        CONTRACT_CONTROL_SELECTION_POLICY,
      verificationPlan:
        input.verificationPlan
    };
  }

  if (!input.directRefut) {
    return {
      routeMode: "AUTO_ROUTE",
      url: `${input.engine}/v1/ask`,
      requestBody:
        buildTelegraphEngineAskBody(
          input.verificationPlan
        ),
      requestEndpoint: "/v1/ask",
      requestedMiner: null,
      selectionPolicy: null,
      verificationPlan:
        input.verificationPlan
    };
  }

  const refut = input.miners.find(
    (candidate) =>
      candidate.slug ===
        "refut-onchain-risk" &&
      candidate.activation_status ===
        "active"
  );

  if (!refut) {
    throw new Error(
      "direct_refut_miner_unavailable"
    );
  }

  return {
    routeMode:
      "DIRECT_REFUT_DIAGNOSTIC",
    url:
      `${input.engine}/v1/ask/${refut.id}`,
    requestBody: {
      method: "POST",
      endpoint: "/assess",
      payload: {
        address:
          input.verificationPlan.subject,
        chainId:
          input.verificationPlan.chainId
      }
    },
    requestEndpoint: "/assess",
    requestedMiner: refut,
    selectionPolicy: null,
    verificationPlan:
      input.verificationPlan
  };
}

async function completeSuccessfulProof(input: {
  response: Response;
  mandate: MandateContract;
  agentId: string;
  action: ActionContract;
  operationId: string;
  requestPlan: TelegraphRequestPlan;
  miners: MinerRecord[];
  paymentLane: X402PaymentLane | null;
  settlement: X402SettlementResult | null;
}): Promise<void> {
  let body: Record<string, unknown>;

  try {
    const parsed = await input.response.json();
    if (!isObject(parsed)) throw new Error("miner_response_not_object");
    body = parsed;
  } catch (error) {
    await holdInvalidEvidence(input, "miner_response_invalid", errorMessage(error));
    return;
  }

  if (!isObject(body.result)) {
    const quarantinePath = saveQuarantinedEvidence(
      input,
      body,
      "miner_result_missing",
      "Telegraph returned HTTP 200 without a usable Miner result.",
      null
    );
    console.log("Quarantined Telegraph response:", quarantinePath);

    await holdInvalidEvidence(
      input,
      "miner_result_missing",
      "Telegraph returned HTTP 200 without a usable Miner result."
    );
    return;
  }

  const servingMiner = resolveServingMiner(
    body,
    input.requestPlan.requestedMiner,
    input.miners
  );

  if (!servingMiner) {
    const quarantinePath = saveQuarantinedEvidence(
      input,
      body,
      "serving_miner_identity_missing",
      "Telegraph returned evidence without enough Miner identity to record provenance.",
      null
    );
    console.log("Quarantined Telegraph response:", quarantinePath);

    await holdInvalidEvidence(
      input,
      "serving_miner_identity_missing",
      "Telegraph returned evidence without enough Miner identity to record provenance."
    );
    return;
  }

  const binding = validateExplicitEvidenceBinding({
    result: body.result,
    miner: servingMiner.record,
    expectedSubject: input.action.payload.destination,
    expectedChainId: input.action.payload.chainId
  });

  if (!binding.valid) {
    const quarantinePath = saveQuarantinedEvidence(
      input,
      body,
      binding.code,
      binding.detail,
      servingMiner
    );
    console.log("Quarantined Telegraph response:", quarantinePath);

    await holdInvalidEvidence(
      input,
      binding.code,
      binding.detail
    );
    return;
  }

  const canonicalResult = adaptBoundMinerResultForPolicy(
    body.result,
    servingMiner.record,
    binding
  );

  const returnedIntent =
    typeof body.intent === "string"
      ? body.intent
      : input.requestPlan.verificationPlan.requiredIntent;

  if (returnedIntent !== input.requestPlan.verificationPlan.requiredIntent) {
    const detail =
      `Telegraph returned intent ${returnedIntent}, but ProofGate required ${input.requestPlan.verificationPlan.requiredIntent}.`;

    const quarantinePath = saveQuarantinedEvidence(
      input,
      body,
      "routed_intent_mismatch",
      detail,
      servingMiner
    );
    console.log("Quarantined Telegraph response:", quarantinePath);

    await holdInvalidEvidence(
      input,
      "routed_intent_mismatch",
      detail
    );
    return;
  }

  const finishedAt = new Date().toISOString();
  const savedEvidence = {
    schemaVersion: "proofgate.telegraph-evidence.v1",
    source: "telegraph" as const,
    intent: returnedIntent,
    miner: {
      id: servingMiner.id,
      name: servingMiner.name,
      slug: servingMiner.slug
    },
    request: {
      endpoint: input.requestPlan.requestEndpoint,
      target: input.action.payload.destination,
      chainId: input.action.payload.chainId,
      routeMode: input.requestPlan.routeMode,
      actionHash: input.action.actionHash,
      mandateHash: input.mandate.mandateHash,
      selectionPolicy:
        input.requestPlan.selectionPolicy,
      query:
        input.requestPlan.routeMode === "AUTO_ROUTE"
          ? input.requestPlan.verificationPlan.query
          : null
    },
    result: canonicalResult,
    telegraph: {
      signalHash: typeof body.signal_hash === "string" ? body.signal_hash : null,
      costUsd: typeof body.cost_usd === "number" ? body.cost_usd : null,
      durationMs: typeof body.duration_ms === "number" ? body.duration_ms : null,
      timestamp: typeof body.timestamp === "string" ? body.timestamp : null,
      binding: {
        subjectField: binding.subjectField,
        chainField: binding.chainField
      }
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
    await holdInvalidEvidence(
      input,
      "evidence_normalization_failed",
      errorMessage(error)
    );
    return;
  }

  const evidenceDirectory = path.join("data", "evidence");
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  const evidencePath = path.join(
    evidenceDirectory,
    `telegraph-${finishedAt.replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(evidencePath, JSON.stringify(savedEvidence, null, 2), {
    mode: 0o600
  });

  let attestation:
    VendorRuntimeAttestation |
    null =
    null;

  if (
    input.action.policyId ===
    "payments.attested-vendor.v1"
  ) {
    try {
      attestation =
        await acquireVendorRuntimeAttestation();

      const attestationPath =
        saveVendorRuntimeAttestation(
          attestation
        );

      console.log(
        "Vendor attestation:",
        attestationPath
      );
      console.log(
        "Vendor runtime hash:",
        attestation.runtimeKeccak256
      );
      console.log(
        "Vendor attestation hash:",
        attestation.attestationHash
      );
    } catch (error) {
      console.log(
        "Vendor attestation unavailable:",
        errorMessage(error)
      );
    }
  }

  const decision =
    evaluateCurrentPolicy(
      input.mandate,
      input.action,
      evidence,
      attestation,
      input.agentId,
      new Date()
    );

  journal.update(input.operationId, {
    state: "CONFIRMED",
    metadata: {
      mandateHash: input.mandate.mandateHash,
      routeMode: input.requestPlan.routeMode,
      requiredIntent: input.requestPlan.verificationPlan.requiredIntent,
      servingMinerId: servingMiner.id,
      servingMinerName: servingMiner.name,
      servingMinerSlug: servingMiner.slug,
      evidencePath,
      signalHash: evidence.signalHash,
      rawResponseHash: evidence.rawResponseHash,
      policyDecision: decision.decision,
      policyReason: decision.reason,
      settlement: input.settlement
    }
  });

  console.log("REAL TELEGRAPH EVIDENCE SAVED");
  console.log("Route mode:", input.requestPlan.routeMode);
  console.log("Serving Miner:", `${servingMiner.name} (${servingMiner.id})`);
  console.log("Evidence:", evidencePath);
  console.log("Signal hash:", evidence.signalHash ?? "(missing)");
  console.log("Miner verdict:", evidence.label ?? "(missing)");
  console.log("Confidence:", evidence.confidence ?? "(missing)");
  console.log("Applicability:", evidence.applicability);
  console.log("");
  printDecision(decision);

  if (decision.decision !== "ALLOW") {
    saveReceipt(
      input.mandate,
      input.action,
      evidence,
      decision,
      `policy_${decision.decision.toLowerCase()}`,
      input.operationId,
      attestation
    );

    process.exitCode = proofExitCode(decision.decision);
  }
}

async function holdInvalidEvidence(
  input: {
    mandate: MandateContract;
    agentId: string;
    action: ActionContract;
    operationId: string;
  },
  reason: string,
  detail: string
): Promise<void> {
  journal.update(input.operationId, {
    state: "HOLD",
    metadata: { reason, detail }
  });

  await finishWithoutEvidence(
    input.mandate,
    input.agentId,
    input.action,
    reason,
    detail,
    input.operationId
  );
}

interface QuarantineContext {
  mandate: MandateContract;
  action: ActionContract;
  operationId: string;
  requestPlan: TelegraphRequestPlan;
  paymentLane: X402PaymentLane | null;
  settlement: X402SettlementResult | null;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function saveQuarantinedEvidence(
  input: QuarantineContext,
  rawResponse: unknown,
  reason: string,
  detail: string,
  servingMiner: ServingMinerIdentity | null
): string {
  const capturedAt = new Date().toISOString();
  const directory = path.join("data", "evidence", "quarantine");
  fs.mkdirSync(directory, { recursive: true });

  const rawResponseHash = hashCanonicalPayload(
    canonicalize(rawResponse)
  );

  const record = {
    schemaVersion: "proofgate.telegraph-quarantine.v1",
    reason,
    detail,
    operationId: input.operationId,
    mandate: {
      mandateId: input.mandate.mandateId,
      mandateHash: input.mandate.mandateHash
    },
    action: {
      actionId: input.action.id,
      actionHash: input.action.actionHash,
      subject: input.action.payload.destination,
      chainId: input.action.payload.chainId
    },
    routing: {
      routeMode: input.requestPlan.routeMode,
      requiredIntent: input.requestPlan.verificationPlan.requiredIntent,
      endpoint: input.requestPlan.requestEndpoint
    },
    servingMiner: servingMiner
      ? {
          id: servingMiner.id,
          name: servingMiner.name,
          slug: servingMiner.slug
        }
      : null,
    payment: input.paymentLane
      ? {
          network: input.paymentLane.network,
          asset: input.paymentLane.asset,
          amountRaw: input.paymentLane.amount,
          payTo: input.paymentLane.payTo,
          settlement: input.settlement
        }
      : {
          mode: "free",
          settlement: input.settlement
        },
    rawResponseHash,
    rawResponse,
    capturedAt
  };

  const file = path.join(
    directory,
    `telegraph-invalid-${capturedAt.replace(/[:.]/g, "-")}.json`
  );

  fs.writeFileSync(
    file,
    JSON.stringify(record, null, 2),
    { mode: 0o600 }
  );

  return file;
}

async function finishWithoutEvidence(
  mandate: MandateContract,
  agentId: string,
  proposedAction: ActionContract,
  reason: string,
  detail: string,
  operationId?: string
): Promise<void> {
  const decision =
    evaluateCurrentPolicy(
      mandate,
      proposedAction,
      null,
      null,
      agentId,
      new Date()
    );

  console.log("PROOFGATE:", decision.decision);
  console.log("Reason:", decision.reason === "telegraph_evidence" ? reason : decision.reason);
  console.log("Detail:", detail);
  console.log("Action remains unexecuted.");
  console.log("");

  saveReceipt(
    mandate,
    proposedAction,
    null,
    decision,
    reason,
    operationId
  );

  process.exitCode = proofExitCode(decision.decision);
}

function saveReceipt(
  mandate: MandateContract,
  proposedAction: ActionContract,
  evidence: TelegraphEvidenceRecord | null,
  decision: DecisionRecord,
  executionCode: string,
  operationId?: string,
  attestation?: VendorRuntimeAttestation | null
): string {
  const receipt = createProofReceipt({
    mandate,
    action: proposedAction,
    evidence,
    decision,
    permit: null,
    execution: {
      status: decision.decision === "BLOCK" ? "BLOCKED" : "NOT_EXECUTED",
      code: executionCode,
      chainId: proposedAction.payload.chainId
    },
    operationId,
    ...(attestation
      ? {
          supplementalEvidence: [
            supplementalRefFromVendorAttestation(
              attestation
            )
          ]
        }
      : {})
  });

  const directory = path.join("data", "receipts");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${receipt.receiptId}.json`);
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2), { mode: 0o600 });

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

function evaluateCurrentPolicy(
  mandate: MandateContract,
  action: ActionContract,
  evidence: TelegraphEvidenceRecord | null,
  attestation: VendorRuntimeAttestation | null,
  agentId: string,
  now: Date
): DecisionRecord {
  if (
    action.policyId ===
    "payments.attested-vendor.v1"
  ) {
    return evaluatePaymentsAttestedVendorV1(
      mandate,
      action,
      evidence,
      attestation,
      {
        agentId,
        now
      }
    );
  }

  return evaluatePaymentsStrictV1(
    mandate,
    action,
    evidence,
    {
      agentId,
      now
    }
  );
}

function loadMinerRegistry(): MinerRecord[] {
  try {
    return JSON.parse(fs.readFileSync("data/miners.json", "utf8")) as MinerRecord[];
  } catch {
    return [];
  }
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
