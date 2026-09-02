import "dotenv/config";

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
  evaluatePaymentsAdaptiveV1
} from "../src/policy/payments-adaptive-v1.js";
import {
  createProofReceipt
} from "../src/receipt/proof-receipt.js";
import {
  ADAPTIVE_EVIDENCE_INTENTS,
  createAdaptiveEvidencePlan
} from "../src/telegraph/adaptive-evidence-plan.js";
import {
  collectAdaptiveEvidence
} from "../src/telegraph/adaptive-orchestrator.js";
import {
  describeIntentCoverage,
  missingIntentCoverage
} from "../src/telegraph/intent-route.js";
import {
  createLiveIntentAcquirer
} from "../src/telegraph/live-intent-client.js";
import type {
  TelegraphMinerRecord
} from "../src/telegraph/routed-evidence.js";

const CANONICAL_VENDOR =
  "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const AGENT_ID =
  "procurement-agent";

const privateKey =
  process.env.TELEGRAPH_EVM_PRIVATE_KEY as
    | `0x${string}`
    | undefined;
const amountArg = process.argv[2];

if (!privateKey) {
  throw new Error(
    "TELEGRAPH_EVM_PRIVATE_KEY is missing"
  );
}

if (!amountArg) {
  throw new Error(
    "Usage: npm run proof:adaptive -- <AMOUNT_USDC>\nExample: npm run proof:adaptive -- 7"
  );
}

function parseUsdc(value: string): string {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(value)) {
    throw new Error(
      "AMOUNT_USDC must be a positive decimal with at most 6 decimal places"
    );
  }

  const [whole, fraction = ""] =
    value.split(".");
  const raw =
    BigInt(whole) * 1_000_000n +
    BigInt((fraction + "000000").slice(0, 6));

  if (raw <= 0n || raw > 10_000_000n) {
    throw new Error(
      "Adaptive demo amount must be > 0 and <= 10 USDC"
    );
  }

  return raw.toString();
}

function loadMiners(): TelegraphMinerRecord[] {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(
        path.join("data", "miners.json"),
        "utf8"
      )
    );

    return Array.isArray(parsed)
      ? parsed as TelegraphMinerRecord[]
      : [];
  } catch {
    return [];
  }
}

function saveJson(
  directory: string,
  prefix: string,
  value: unknown
): string {
  fs.mkdirSync(directory, {
    recursive: true
  });
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  const file = path.join(
    directory,
    `${prefix}-${stamp}.json`
  );
  fs.writeFileSync(
    file,
    JSON.stringify(value, null, 2),
    { mode: 0o600 }
  );
  return file;
}

const amountRaw = parseUsdc(amountArg);
const now = new Date();
const mandate = createMandateContract({
  mandateId: "treasury-adaptive-demo-v1",
  principalId: "company-demo",
  agentId: AGENT_ID,
  allowedActionTypes: ["payment"],
  allowedChainIds: [BASE_SEPOLIA_CHAIN_ID],
  allowedAssets: [BASE_SEPOLIA_USDC],
  allowedDestinations: [CANONICAL_VENDOR],
  maxPerActionRaw: "10000000",
  requiredIntents: [
    ...ADAPTIVE_EVIDENCE_INTENTS
  ],
  policyId: "payments.adaptive.v1",
  policyVersion: 1,
  status: "ACTIVE",
  issuedAt:
    new Date(
      now.getTime() - 60_000
    ).toISOString(),
  expiresAt:
    new Date(
      now.getTime() + 24 * 60 * 60 * 1000
    ).toISOString(),
  version: 1
});

const action = createActionContract({
  type: "payment",
  chainId: BASE_SEPOLIA_CHAIN_ID,
  token: BASE_SEPOLIA_USDC,
  amountRaw,
  destination: CANONICAL_VENDOR,
  reason:
    `Adaptive authorization demo: ${amountArg} USDC`,
  policyId: "payments.adaptive.v1",
  policyVersion: 1
});

const plan = createAdaptiveEvidencePlan(action);
const miners = loadMiners();
const coverage = describeIntentCoverage(
  miners,
  plan
);
const missingCoverage = missingIntentCoverage(
  miners,
  plan
);

console.log("");
console.log("PROOFGATE ADAPTIVE AUTHORIZATION");
console.log("================================");
console.log("Mode: LIVE TELEGRAPH / CHECK ONLY");
console.log("Action:", `${amountArg} USDC → ${CANONICAL_VENDOR}`);
console.log("Action hash:", action.actionHash);
console.log("Mandate hash:", mandate.mandateHash);
console.log("Risk tier:", plan.riskTier);
console.log("Evidence budget raw:", plan.maxEvidenceSpendRaw);
console.log("Latency budget ms:", plan.maxEvidenceLatencyMs);
console.log("Required Intents:");
for (const item of coverage) {
  console.log(
    `  ${item.intent}: ${item.activeMinerCount} active Miner(s)`
  );
}
console.log("");

if (missingCoverage.length > 0) {
  console.log("PROOFGATE: HOLD");
  console.log(
    "Reason: required Telegraph Intent has no active Miner coverage"
  );
  console.log(
    "Missing:",
    missingCoverage.join(", ")
  );
  process.exit(2);
}

console.log(
  `About to make ${plan.requirements.length} provider-neutral Telegraph Intent request(s).`
);
console.log(
  "Each paid request is preflighted and must fit both the per-request x402 policy and the remaining total evidence budget."
);
console.log(
  "Paid transport ambiguity is never blindly retried."
);
console.log("");

const acquire = createLiveIntentAcquirer({
  privateKey,
  miners
});

const collection = await collectAdaptiveEvidence(
  action,
  plan,
  acquire
);

const bundlePath = saveJson(
  path.join(
    "data",
    "evidence",
    "bundles"
  ),
  "adaptive-bundle",
  collection.bundle
);

const decision = evaluatePaymentsAdaptiveV1(
  mandate,
  action,
  plan,
  collection.bundle,
  {
    agentId: AGENT_ID,
    now: new Date()
  }
);

console.log("Collection:", collection.status);
console.log("Collection code:", collection.code);
if (collection.failedIntent) {
  console.log("Failed Intent:", collection.failedIntent);
}
if (collection.error) {
  console.log("Collection detail:", collection.error);
}
console.log("Bundle:", bundlePath);
console.log("Bundle hash:", collection.bundle.bundleHash);
console.log(
  "Evidence spend raw:",
  collection.bundle.totalEvidenceSpendRaw
);
console.log("");

for (const item of collection.bundle.items) {
  console.log(`${item.intent}`);
  console.log(
    `  routed Miner: ${item.miner.name} (${item.miner.id})`
  );
  console.log(
    `  Miner slug: ${item.miner.slug}`
  );
  console.log(
    `  signal hash: ${item.signalHash ?? "(missing)"}`
  );
  console.log(
    `  label: ${item.label ?? "(none)"}`
  );
  console.log(
    `  confidence: ${item.confidence ?? "(none)"}`
  );
  console.log(
    `  applicability: ${item.applicability}`
  );
  console.log(
    `  x402 raw spend: ${item.payment.amountRaw}`
  );
}

console.log("");
console.log("PROOFGATE:", decision.decision);
console.log("Reason:", decision.reason);
for (const item of decision.checks) {
  console.log(
    `${item.status.padEnd(5)} | ${item.name}`
  );
}
console.log("");

const receipt = createProofReceipt({
  mandate,
  action,
  evidence: collection.bundle,
  decision,
  permit: null,
  execution: {
    status:
      decision.decision === "BLOCK"
        ? "BLOCKED"
        : "NOT_EXECUTED",
    code:
      collection.status === "COMPLETE"
        ? `adaptive_${decision.decision.toLowerCase()}`
        : collection.code,
    chainId: BASE_SEPOLIA_CHAIN_ID
  }
});

const receiptPath = saveJson(
  path.join("data", "receipts"),
  receipt.receiptId,
  receipt
);

console.log("Proof receipt:", receiptPath);
console.log("Receipt hash:", receipt.receiptHash);
console.log("Transaction sent: NO");
console.log(
  "This command proves adaptive authorization only; execution remains a separate protected step."
);

process.exitCode =
  decision.decision === "ALLOW"
    ? 0
    : decision.decision === "HOLD"
      ? 2
      : 3;
