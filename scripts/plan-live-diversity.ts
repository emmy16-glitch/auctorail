import fs from "node:fs";
import path from "node:path";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import type {
  AdaptiveEvidenceIntent
} from "../src/telegraph/adaptive-evidence-plan.js";
import {
  planDirectDiversity
} from "../src/telegraph/diversity-planner.js";
import type {
  TelegraphMinerRecord
} from "../src/telegraph/routed-evidence.js";

const CANONICAL_VENDOR =
  "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const ALLOWED_INTENTS = new Set<AdaptiveEvidenceIntent>([
  "FRAUD_DETECTION",
  "ONCHAIN_TX_LOOKUP",
  "WALLET_BALANCE_CHECK"
]);

function loadMiners(): TelegraphMinerRecord[] {
  const file = path.join("data", "miners.json");
  const parsed = JSON.parse(
    fs.readFileSync(file, "utf8")
  );
  if (!Array.isArray(parsed)) {
    throw new Error("data/miners.json must contain an array");
  }
  return parsed as TelegraphMinerRecord[];
}

function parseUsdc(value: string): string {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(value)) {
    throw new Error(
      "AMOUNT_USDC must be a positive decimal with at most 6 decimal places"
    );
  }

  const [whole, fraction = ""] = value.split(".");
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

const amountArg = process.argv[2] ?? "7";
const requestedIntent =
  (process.argv[3] ?? "FRAUD_DETECTION") as AdaptiveEvidenceIntent;
if (!ALLOWED_INTENTS.has(requestedIntent)) {
  throw new Error(
    `Unsupported intent ${requestedIntent}. Use FRAUD_DETECTION, ONCHAIN_TX_LOOKUP, or WALLET_BALANCE_CHECK.`
  );
}

const excludedMinerIds = process.argv
  .slice(4)
  .flatMap((value) => value.split(","))
  .map((value) => value.trim())
  .filter(Boolean);

const action = createActionContract({
  type: "payment",
  chainId: BASE_SEPOLIA_CHAIN_ID,
  token: BASE_SEPOLIA_USDC,
  amountRaw: parseUsdc(amountArg),
  destination: CANONICAL_VENDOR,
  reason:
    `Adaptive authorization demo: ${amountArg} USDC`,
  policyId: "payments.adaptive.v1",
  policyVersion: 1
});

const plan = planDirectDiversity({
  action,
  intent: requestedIntent,
  miners: loadMiners(),
  excludeMinerIds: excludedMinerIds,
  count: 3
});

console.log("");
console.log("PROOFGATE LIVE DIVERSITY PLAN");
console.log("=============================");
console.log("Mode: READ-ONLY / ZERO X402 SPEND");
console.log("Amount:", `${amountArg} USDC`);
console.log("Intent:", plan.intent);
console.log("Action hash:", action.actionHash);
console.log(
  "Excluded Miner IDs:",
  plan.excludedMinerIds.join(", ") || "(none)"
);
console.log("Eligible direct candidates:", plan.eligibleCount);
console.log("");

if (plan.selected.length === 0) {
  console.log("No usable direct diversity candidates were found.");
} else {
  console.log("Deterministically selected candidates:");
  for (const [index, candidate] of plan.selected.entries()) {
    console.log(
      `${index + 1}. ${candidate.miner.name} (${candidate.miner.id})`
    );
    console.log(`   slug: ${candidate.miner.slug}`);
    console.log(
      `   official rank: ${candidate.officialRank ?? "unranked"}`
    );
    console.log(
      `   route: ${candidate.method} ${candidate.endpoint}`
    );
    console.log(
      `   payload fields: ${Object.keys(candidate.payload).join(", ") || "(none)"}`
    );
    console.log(
      `   selection hash: ${candidate.selectionHash}`
    );
  }
}

if (plan.skipped.length > 0) {
  console.log("");
  console.log("Skipped candidates:");
  for (const item of plan.skipped) {
    console.log(
      `- ${item.slug} (${item.minerId}): ${item.reason}`
    );
  }
}

console.log("");
console.log("No Telegraph request was sent and no USDC was spent.");
console.log(
  "Selection uses only live registry metadata, official rank when present, the exact frozen action hash, and prior-Miner exclusions. It never uses Miner verdicts."
);
