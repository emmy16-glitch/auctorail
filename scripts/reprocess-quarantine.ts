import fs from "node:fs";
import path from "node:path";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import {
  createMandateContract
} from "../src/core/mandate-contract.js";
import {
  normalizeTelegraphEvidence
} from "../src/evidence/telegraph.js";
import {
  evaluatePaymentsStrictV1
} from "../src/policy/payments-strict-v1.js";
import {
  createProofReceipt,
  verifyProofReceipt
} from "../src/receipt/proof-receipt.js";
import {
  adaptBoundMinerResultForPolicy,
  resolveServingMiner,
  validateExplicitEvidenceBinding,
  type TelegraphMinerRecord
} from "../src/telegraph/routed-evidence.js";

const DEMO_AGENT_ID = "procurement-agent";
const CANONICAL_VENDOR =
  "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";

const file = process.argv[2];

if (!file) {
  throw new Error(
    "Usage: npm run proof:reprocess -- <quarantine.json>"
  );
}

if (!fs.existsSync(file)) {
  throw new Error(`quarantine_file_not_found:${file}`);
}

const rawQuarantine = JSON.parse(
  fs.readFileSync(file, "utf8")
) as unknown;

if (!isObject(rawQuarantine)) {
  throw new Error("quarantine_record_malformed");
}

if (
  rawQuarantine.schemaVersion !==
  "proofgate.telegraph-quarantine.v1"
) {
  throw new Error("unsupported_quarantine_schema");
}

const mandate = createMandateContract({
  mandateId: "treasury-demo-v1",
  principalId: "company-demo",
  agentId: DEMO_AGENT_ID,
  allowedActionTypes: ["payment"],
  allowedChainIds: [BASE_SEPOLIA_CHAIN_ID],
  allowedAssets: [BASE_SEPOLIA_USDC],
  allowedDestinations: [CANONICAL_VENDOR],
  maxPerActionRaw: "10000000",
  requiredIntents: ["FRAUD_DETECTION"],
  policyId: "payments.strict.v1",
  issuedAt: "2026-09-01T00:00:00.000Z",
  expiresAt: "2026-09-08T01:00:00.000Z",
  version: 1
});

const action = createActionContract({
  type: "payment",
  chainId: BASE_SEPOLIA_CHAIN_ID,
  token: BASE_SEPOLIA_USDC,
  amountRaw: "1000000",
  destination: CANONICAL_VENDOR,
  reason: "Invoice INV-1042",
  policyId: "payments.strict.v1"
});

const quarantineAction =
  isObject(rawQuarantine.action)
    ? rawQuarantine.action
    : null;

const quarantineMandate =
  isObject(rawQuarantine.mandate)
    ? rawQuarantine.mandate
    : null;

const routing =
  isObject(rawQuarantine.routing)
    ? rawQuarantine.routing
    : null;

if (
  !quarantineAction ||
  quarantineAction.actionHash !== action.actionHash ||
  quarantineAction.subject !== action.payload.destination ||
  quarantineAction.chainId !== action.payload.chainId
) {
  throw new Error("quarantine_action_binding_mismatch");
}

if (
  !quarantineMandate ||
  quarantineMandate.mandateHash !== mandate.mandateHash
) {
  throw new Error("quarantine_mandate_binding_mismatch");
}

if (
  !routing ||
  routing.routeMode !== "AUTO_ROUTE" ||
  routing.requiredIntent !== "FRAUD_DETECTION"
) {
  throw new Error("quarantine_route_not_authorizable");
}

const payment =
  isObject(rawQuarantine.payment)
    ? rawQuarantine.payment
    : null;

const settlement =
  payment && isObject(payment.settlement)
    ? payment.settlement
    : null;

if (
  !payment ||
  payment.network !== "eip155:84532" ||
  typeof payment.asset !== "string" ||
  payment.asset.toLowerCase() !== BASE_SEPOLIA_USDC.toLowerCase() ||
  payment.amountRaw !== "10000" ||
  !settlement ||
  settlement.success !== true ||
  settlement.code !== "payment_settled" ||
  typeof settlement.transaction !== "string" ||
  !/^0x[0-9a-fA-F]{64}$/.test(settlement.transaction)
) {
  throw new Error("quarantine_x402_settlement_unproven");
}

const rawResponse = rawQuarantine.rawResponse;

if (!isObject(rawResponse) || !isObject(rawResponse.result)) {
  throw new Error("quarantine_miner_result_missing");
}

const miners = JSON.parse(
  fs.readFileSync("data/miners.json", "utf8")
) as TelegraphMinerRecord[];

const servingMiner = resolveServingMiner(
  rawResponse,
  null,
  miners
);

if (!servingMiner) {
  throw new Error("serving_miner_identity_missing");
}

const binding = validateExplicitEvidenceBinding({
  result: rawResponse.result,
  miner: servingMiner.record,
  expectedSubject: action.payload.destination,
  expectedChainId: action.payload.chainId
});

if (!binding.valid) {
  throw new Error(`${binding.code}:${binding.detail}`);
}

const canonicalResult =
  adaptBoundMinerResultForPolicy(
    rawResponse.result,
    servingMiner.record,
    binding
  );

const recoveredAt = new Date().toISOString();

const telegraphTimestamp =
  typeof rawResponse.timestamp === "string"
    ? rawResponse.timestamp
    : (
        typeof rawQuarantine.capturedAt === "string"
          ? rawQuarantine.capturedAt
          : recoveredAt
      );

const capturedAt =
  typeof rawQuarantine.capturedAt === "string"
    ? rawQuarantine.capturedAt
    : telegraphTimestamp;

const savedEvidence = {
  schemaVersion:
    "proofgate.telegraph-evidence.v1",
  source:
    "telegraph" as const,
  intent:
    "FRAUD_DETECTION",
  miner: {
    id: servingMiner.id,
    name: servingMiner.name,
    slug: servingMiner.slug
  },
  request: {
    endpoint:
      typeof routing.endpoint === "string"
        ? routing.endpoint
        : "/v1/ask",
    target:
      action.payload.destination,
    chainId:
      action.payload.chainId,
    routeMode:
      "AUTO_ROUTE",
    actionHash:
      action.actionHash,
    mandateHash:
      mandate.mandateHash,
    recoveredFromQuarantine:
      file
  },
  result:
    canonicalResult,
  telegraph: {
    signalHash:
      typeof rawResponse.signal_hash === "string"
        ? rawResponse.signal_hash
        : null,
    costUsd:
      typeof rawResponse.cost_usd === "number"
        ? rawResponse.cost_usd
        : null,
    durationMs:
      typeof rawResponse.duration_ms === "number"
        ? rawResponse.duration_ms
        : null,
    timestamp:
      telegraphTimestamp,
    binding: {
      subjectField:
        binding.subjectField,
      chainField:
        binding.chainField
    }
  },
  payment,
  capturedAt: {
    startedAt:
      capturedAt,
    finishedAt:
      capturedAt
  },
  rawResponse
};

const evidence =
  normalizeTelegraphEvidence(savedEvidence);

const evidenceDirectory =
  path.join("data", "evidence");

fs.mkdirSync(
  evidenceDirectory,
  { recursive: true }
);

const evidenceFile =
  path.join(
    evidenceDirectory,
    `telegraph-recovered-${recoveredAt.replace(/[:.]/g, "-")}.json`
  );

fs.writeFileSync(
  evidenceFile,
  JSON.stringify(savedEvidence, null, 2),
  { mode: 0o600 }
);

const decision =
  evaluatePaymentsStrictV1(
    mandate,
    action,
    evidence,
    {
      agentId:
        DEMO_AGENT_ID,
      now:
        new Date()
    }
  );

const receipt =
  createProofReceipt({
    mandate,
    action,
    evidence,
    decision,
    permit: null,
    execution: {
      status:
        decision.decision === "BLOCK"
          ? "BLOCKED"
          : "NOT_EXECUTED",
      code:
        `reprocessed_${decision.decision.toLowerCase()}`,
      chainId:
        action.payload.chainId
    }
  });

if (!verifyProofReceipt(receipt)) {
  throw new Error("reprocessed_receipt_verification_failed");
}

const receiptDirectory =
  path.join("data", "receipts");

fs.mkdirSync(
  receiptDirectory,
  { recursive: true }
);

const receiptFile =
  path.join(
    receiptDirectory,
    `${receipt.receiptId}.json`
  );

fs.writeFileSync(
  receiptFile,
  JSON.stringify(receipt, null, 2),
  { mode: 0o600 }
);

console.log("");
console.log("PROOFGATE QUARANTINE REPROCESS");
console.log("==============================");
console.log("Network calls: NONE");
console.log("New x402 payment: NONE");
console.log("Protected transaction: NONE");
console.log("");
console.log(
  "Serving Miner:",
  `${servingMiner.name} (${servingMiner.id})`
);
console.log(
  "Binding:",
  `${binding.subjectField} / ${binding.chainField}`
);
console.log(
  "x402 transaction:",
  settlement.transaction
);
console.log(
  "Signal hash:",
  evidence.signalHash ?? "(missing)"
);
console.log(
  "Evidence label:",
  evidence.label ?? "(missing)"
);
console.log(
  "Confidence:",
  evidence.confidence ?? "(missing)"
);
console.log(
  "Applicability:",
  evidence.applicability
);
console.log("");
console.log(
  "PROOFGATE:",
  decision.decision
);
console.log(
  "Reason:",
  decision.reason
);

for (const item of decision.checks) {
  console.log(
    `${item.status.padEnd(5)} | ${item.name}`
  );
}

console.log("");
console.log(
  "Recovered evidence:",
  evidenceFile
);
console.log(
  "Proof receipt:",
  receiptFile
);
console.log(
  "Receipt hash:",
  receipt.receiptHash
);
console.log("");

process.exit(
  decision.decision === "ALLOW"
    ? 0
    : decision.decision === "HOLD"
      ? 2
      : 3
);

function isObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}
