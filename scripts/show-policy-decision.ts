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

const directory =
  path.join(
    process.cwd(),
    "data",
    "evidence"
  );

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

const evidence =
  loadTelegraphEvidence(
    path.join(
      directory,
      file
    )
  );

const action =
  createActionContract({
    type:
      "payment",

    chainId:
      BASE_SEPOLIA_CHAIN_ID,

    token:
      BASE_SEPOLIA_USDC,

    amountRaw:
      "5000000",

    destination:
      evidence.subject,

    reason:
      "Invoice INV-1042",

    policyId:
      "payments.strict.v1"
  });

const decision =
  evaluatePaymentsStrictV1(
    action,
    evidence,
    {
      now:
        new Date(
          new Date(
            evidence.receivedAt
          ).getTime() +
            1000
        )
    }
  );

console.log("");
console.log(
  "PROOFGATE POLICY DEMO"
);
console.log(
  "====================="
);

console.log("");
console.log(
  "Action:",
  "5 USDC →",
  action.payload.destination
);

console.log(
  "Action fingerprint:",
  action.actionHash
);

console.log("");
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
