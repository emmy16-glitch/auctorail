import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

const SIGNAL_HASH = process.argv[2];

if (!SIGNAL_HASH || !/^0x[0-9a-fA-F]{64}$/.test(SIGNAL_HASH)) {
  throw new Error(
    "Usage: npx tsx scripts/verify-telegraph-signal.ts <SIGNAL_HASH>"
  );
}

const engine =
  process.env.TELEGRAPH_ENGINE_URL ||
  "https://devnode.telegraphprotocol.com/engine";
const url = `${engine}/v1/signal/${SIGNAL_HASH}`;
const delays = [0, 500, 1_000];
let response: Response | null = null;
let lastError: unknown = null;

for (const delay of delays) {
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  try {
    const candidate = await fetch(url, { method: "GET" });

    if (candidate.ok) {
      response = candidate;
      break;
    }

    // A 4xx is a definitive lookup result and is not improved by retrying.
    if (candidate.status >= 400 && candidate.status < 500) {
      response = candidate;
      break;
    }

    lastError = new Error(`Telegraph signal lookup HTTP ${candidate.status}`);
  } catch (error) {
    lastError = error;
  }
}

if (!response) {
  throw lastError ?? new Error("telegraph_signal_lookup_unavailable");
}

const text = await response.text();
let body: unknown;

try {
  body = JSON.parse(text);
} catch {
  body = { raw: text };
}

if (!response.ok) {
  console.log("Signal verification: FAILED");
  console.log("HTTP:", response.status);
  console.log(JSON.stringify(body, null, 2));
  process.exit(2);
}

const verifiedAt = new Date().toISOString();
const record = {
  schemaVersion: "proofgate.telegraph-signal-verification.v1",
  signalHash: SIGNAL_HASH,
  verifiedAt,
  response: body
};
const directory = path.join("data", "verifications");
fs.mkdirSync(directory, { recursive: true });
const file = path.join(
  directory,
  `signal-${SIGNAL_HASH.slice(2, 14)}-${verifiedAt.replace(/[:.]/g, "-")}.json`
);
fs.writeFileSync(file, JSON.stringify(record, null, 2), { mode: 0o600 });

console.log("Signal verification: SUCCESS");
console.log("Signal hash:", SIGNAL_HASH);
console.log("Saved:", file);
