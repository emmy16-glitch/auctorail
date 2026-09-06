import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const PRIVATE_KEY = process.env.TELEGRAPH_EVM_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  throw new Error("TELEGRAPH_EVM_PRIVATE_KEY is missing");
}

const miners = JSON.parse(
  fs.readFileSync("data/miners.json", "utf8")
);

const miner = miners.find(
  (m) =>
    m.slug === "refut-onchain-risk" &&
    m.activation_status === "active"
);

if (!miner) {
  throw new Error(
    "Refut miner is not active in current registry. Refresh discovery first."
  );
}

const account = privateKeyToAccount(PRIVATE_KEY);

const TARGET =
  process.argv[2] ??
  account.address;

if (!/^0x[0-9a-fA-F]{40}$/.test(TARGET)) {
  throw new Error(
    "Usage: node scripts/test-telegraph-x402.mjs <EVM_ADDRESS>"
  );
}

const signer = toClientEvmSigner(account);

const client = x402Client.fromConfig({
  schemes: [
    {
      network: "eip155:84532",
      client: new ExactEvmScheme(signer)
    }
  ]
});

const paidFetch = wrapFetchWithPayment(fetch, client);

const engine =
  process.env.TELEGRAPH_ENGINE_URL ||
  "https://devnode.telegraphprotocol.com/engine";

const url = `${engine}/v1/ask/${miner.id}`;

const request = {
  method: "POST",
  endpoint: "/assess",
  payload: {
    address: TARGET,
    chainId: 84532
  }
};

console.log("");
console.log("Auctorail → Telegraph LIVE x402");
console.log("--------------------------------");
console.log("Payment wallet:", account.address);
console.log("Assessment target:", TARGET);
console.log("Miner:", miner.name);
console.log("Miner ID:", miner.id);
console.log("Intent: FRAUD_DETECTION");
console.log("Network: Base Sepolia");
console.log("Expected cost: ~$0.01 test USDC");
console.log("");

const startedAt = new Date().toISOString();

const response = await paidFetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(request)
});

const finishedAt = new Date().toISOString();

const rawText = await response.text();

let body;

try {
  body = JSON.parse(rawText);
} catch {
  body = { raw: rawText };
}

const paymentResponse =
  response.headers.get("payment-response") ??
  response.headers.get("x-payment-response") ??
  null;

console.log("HTTP Status:", response.status);
console.log("");

if (!response.ok) {
  console.error("Telegraph request failed:");
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log("REAL TELEGRAPH RESPONSE");
console.log("-----------------------");
console.log(JSON.stringify(body, null, 2));

const evidence = {
  schemaVersion: "proofgate.telegraph-evidence.v1",

  source: "telegraph",

  intent:
    body.intent ??
    "FRAUD_DETECTION",

  miner: {
    id: String(body.miner_id ?? miner.id),
    name: body.miner_name ?? miner.name,
    slug: miner.slug
  },

  request: {
    endpoint: "/assess",
    target: TARGET,
    chainId: 84532
  },

  result: body.result ?? null,

  telegraph: {
    signalHash: body.signal_hash ?? null,
    costUsd: body.cost_usd ?? null,
    durationMs: body.duration_ms ?? null,
    timestamp: body.timestamp ?? null,
    reasoning: body.reasoning ?? null
  },

  payment: {
    network: "eip155:84532",
    settlementPresent: Boolean(paymentResponse),
    settlement: paymentResponse
  },

  capturedAt: {
    startedAt,
    finishedAt
  },

  rawResponse: body
};

fs.mkdirSync(
  path.join("data", "evidence"),
  { recursive: true }
);

const safeTimestamp =
  finishedAt.replace(/[:.]/g, "-");

const output =
  path.join(
    "data",
    "evidence",
    `telegraph-${safeTimestamp}.json`
  );

fs.writeFileSync(
  output,
  JSON.stringify(evidence, null, 2)
);

console.log("");
console.log("Evidence saved:");
console.log(output);

console.log("");
console.log("Signal hash:");
console.log(
  evidence.telegraph.signalHash ??
  "(none returned)"
);

console.log("");
console.log(
  "Payment settlement header:",
  paymentResponse ? "present" : "not present"
);
