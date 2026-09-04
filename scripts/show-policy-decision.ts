import path from "node:path";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import { createMandateContract } from "../src/core/mandate-contract.js";
import { findLatestMatchingTelegraphEvidence } from "../src/evidence/evidence-store.js";
import {
  loadTelegraphEvidence,
  type TelegraphEvidenceRecord
} from "../src/evidence/telegraph.js";
import { evaluatePaymentsStrictV1 } from "../src/policy/payments-strict-v1.js";

const DEMO_AGENT_ID = "procurement-agent";
const CANONICAL_VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";

const target = process.argv[2];
const explicitEvidence = process.argv[3];

if (!target || !/^0x[0-9a-fA-F]{40}$/.test(target)) {
  throw new Error(
    "Usage: npx tsx scripts/show-policy-decision.ts <ACTION_TARGET> [EVIDENCE_FILE]"
  );
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
  destination: target,
  reason: "Invoice INV-1042",
  policyId: "payments.strict.v1"
});

let evidencePath: string | null = null;
let evidence: TelegraphEvidenceRecord | null = null;

if (explicitEvidence) {
  evidencePath = path.resolve(explicitEvidence);
  evidence = loadTelegraphEvidence(path.resolve(explicitEvidence));
} else {
  const match = findLatestMatchingTelegraphEvidence(
    path.join(process.cwd(), "data", "evidence"),
    action.payload.destination,
    action.payload.chainId
  );

  evidencePath = match?.filePath ?? null;
  evidence = match?.evidence ?? null;
}

const decision = evaluatePaymentsStrictV1(mandate, action, evidence, {
  agentId: DEMO_AGENT_ID
});

console.log("");
console.log("PROOFGATE POLICY DECISION");
console.log("=========================");
console.log("");
console.log("Mandate:", mandate.mandateId);
console.log("Mandate hash:", mandate.mandateHash);
console.log("Principal:", mandate.principalId);
console.log("Agent:", DEMO_AGENT_ID);
console.log("Action target:", action.payload.destination);
console.log("Amount:", "1 USDC");
console.log("Action hash:", action.actionHash);
console.log("");
console.log("Evidence file:", evidencePath ?? "(no exact-target evidence)");
console.log("Evidence subject:", evidence?.subject ?? "(none)");
console.log("Telegraph Miner:", evidence?.miner.name ?? "(none)");
console.log("Miner verdict:", evidence?.label ?? "(none)");
console.log("Miner confidence:", evidence?.confidence ?? "(none)");
console.log("Applicability:", evidence?.applicability ?? "(none)");
console.log("Signal hash:", evidence?.signalHash ?? "(none)");
console.log("");
console.log("PROOFGATE:", decision.decision);
console.log("Reason:", decision.reason);
console.log("");

for (const item of decision.checks) {
  console.log(`${item.status.padEnd(5)} | ${item.name}`);
}

console.log("");
