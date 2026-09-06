import "dotenv/config";
import fs from "node:fs";
import { Wallet } from "ethers";

const miners = JSON.parse(
  fs.readFileSync("data/miners.json", "utf8")
);

const miner = miners.find(
  (m) =>
    m.slug === "refut-onchain-risk" &&
    m.activation_status === "active"
);

if (!miner) {
  console.error("Refut miner is not active in the current registry.");
  process.exit(1);
}

if (!process.env.TELEGRAPH_EVM_PRIVATE_KEY) {
  console.error("TELEGRAPH_EVM_PRIVATE_KEY is missing.");
  process.exit(1);
}

// Derive PUBLIC address only.
// Private key is never printed.
const wallet = new Wallet(
  process.env.TELEGRAPH_EVM_PRIVATE_KEY
);

const engine =
  process.env.TELEGRAPH_ENGINE_URL ||
  "https://devnode.telegraphprotocol.com/engine";

const url = `${engine}/v1/ask/${miner.id}`;

const requestBody = {
  method: "POST",
  endpoint: "/assess",
  payload: {
    address: wallet.address,
    chainId: 84532
  }
};

console.log("");
console.log("Auctorail → Telegraph Quote");
console.log("---------------------------");
console.log("Miner:", miner.name);
console.log("Miner ID:", miner.id);
console.log("Intent: FRAUD_DETECTION");
console.log("Target:", wallet.address);
console.log("Chain ID: 84532");
console.log("");
console.log("NO PAYMENT WILL BE MADE BY THIS SCRIPT.");
console.log("");

const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(requestBody)
});

console.log("HTTP Status:", response.status);

const paymentRequired =
  response.headers.get("payment-required");

if (paymentRequired) {
  console.log("PAYMENT-REQUIRED header: present");

  try {
    const decoded = Buffer.from(
      paymentRequired,
      "base64"
    ).toString("utf8");

    const challenge = JSON.parse(decoded);

    console.log("");
    console.log("Payment options:");

    for (const option of challenge.accepts ?? []) {
      console.log("---------------------------");
      console.log("Scheme:", option.scheme);
      console.log("Network:", option.network);
      console.log("Asset:", option.asset);
      console.log("Amount:", option.amount);
      console.log("Pay To:", option.payTo);

      if (option.amount) {
        console.log(
          "USDC:",
          Number(option.amount) / 1_000_000
        );
      }
    }
  } catch {
    console.log(
      "Could not decode PAYMENT-REQUIRED header."
    );
  }
} else {
  console.log("PAYMENT-REQUIRED header: missing");
}

const text = await response.text();

console.log("");
console.log("Response body:");
console.log(text);
console.log("");
