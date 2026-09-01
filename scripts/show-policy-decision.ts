import fs from "node:fs";
import path from "node:path";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";

import {
  loadTelegraphEvidence
} from "../src/evidence/telegraph.js";

import {
  evaluatePaymentsStrictV1
} from "../src/policy/payments-strict-v1.js";

const TARGET =
  process.argv[2];

const explicitEvidence =
  process.argv[3];

if (
  !TARGET ||
  !/^0x[0-9a-fA-F]{40}$/.test(TARGET)
) {
  throw new Error(
    "Usage: npx tsx scripts/show-policy-decision.ts <ACTION_TARGET> [EVIDENCE_FILE]"
  );
}

const directory =
  path.join(
    process.cwd(),
    "data",
    "evidence"
  );

let evidencePath;

if (explicitEvidence) {
  evidencePath =
    path.resolve(
      explicitEvidence
    );
} else {
  const file =
    fs.readdirSync(directory)
      .filter(
        (name) =>
          name.endsWith(".json")
      )
      .sort()
      .at(-1);

  if (!file) {
    throw new Error(
      "No Telegraph evidence found."
    );
  }

  evidencePath =
    path.join(
      directory,
      file
    );
}

const evidence =
  loadTelegraphEvidence(
    evidencePath
  );

// IMPORTANT:
// The action target comes from the proposed
// Action Contract, NEVER from evidence.
const action =
  createActionContract({
    type:
      "payment",

    chainId:
      BASE_SEPOLIA_CHAIN_ID,

    token:
      BASE_SEPOLIA_USDC,

    amountRaw:
      "1000000",

    destination:
      TARGET,

    reason:
      "Invoice INV-1042",

    policyId:
      "payments.strict.v1"
  });

const decision =
  evaluatePaymentsStrictV1(
    action,
    evidence
  );

console.log("");
console.log(
  "PROOFGATE POLICY DECISION"
);

console.log(
  "========================="
);

console.log("");
console.log(
  "Action target:",
  action.payload.destination
);

console.log(
  "Amount:",
  "1 USDC"
);

console.log(
  "Action hash:",
  action.actionHash
);

console.log("");
console.log(
  "Evidence file:",
  evidencePath
);

console.log(
  "Evidence subject:",
  evidence.subject
);

console.log(
  "Telegraph Miner:",
  evidence.miner.name
);

console.log(
  "Miner verdict:",
  evidence.label
);

console.log(
  "Miner confidence:",
  evidence.confidence
);

console.log(
  "Applicability:",
  evidence.applicability
);

console.log(
  "Signal hash:",
  evidence.signalHash
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

console.log("");

for (
  const item
  of decision.checks
) {
  console.log(
    `${item.status.padEnd(5)} | ${item.name}`
  );
}

console.log("");
