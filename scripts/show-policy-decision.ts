import path from "node:path";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import {
  findLatestMatchingTelegraphEvidence
} from "../src/evidence/evidence-store.js";
import {
  loadTelegraphEvidence
} from "../src/evidence/telegraph.js";
import {
  evaluatePaymentsStrictV1
} from "../src/policy/payments-strict-v1.js";

const target = process.argv[2];
const explicitEvidence = process.argv[3];

if (!target || !/^0x[0-9a-fA-F]{40}$/.test(target)) {
  throw new Error(
    "Usage: npx tsx scripts/show-policy-decision.ts <ACTION_TARGET> [EVIDENCE_FILE]"
  );
}

// The proposal is frozen first. Evidence is never allowed to choose or mutate
// the destination, amount, token, chain, or policy.
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
let evidence = null;

if (explicitEvidence) {
  evidencePath = path.resolve(explicitEvidence);
  evidence = loadTelegraphEvidence(evidencePath);
} else {
  const match = findLatestMatchingTelegraphEvidence(
    path.join(process.cwd(), "data", "evidence"),
    action.payload.destination,
    action.payload.chainId
  );

  evidencePath = match?.filePath ?? null;
  evidence = match?.evidence ?? null;
}

const decision = evaluatePaymentsStrictV1(action, evidence);

console.log("");
console.log("PROOFGATE POLICY DECISION");
console.log("=========================");
console.log("");
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
