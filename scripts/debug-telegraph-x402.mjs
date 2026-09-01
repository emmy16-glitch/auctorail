import "dotenv/config";
import fs from "node:fs";

import {
  wrapFetchWithPayment,
  x402Client
} from "@x402/fetch";

import {
  ExactEvmScheme,
  toClientEvmSigner
} from "@x402/evm";

import {
  privateKeyToAccount
} from "viem/accounts";

const PRIVATE_KEY =
  process.env
    .TELEGRAPH_EVM_PRIVATE_KEY;

const TARGET =
  process.argv[2];

if (!PRIVATE_KEY) {
  throw new Error(
    "TELEGRAPH_EVM_PRIVATE_KEY missing"
  );
}

if (
  !TARGET ||
  !/^0x[0-9a-fA-F]{40}$/.test(TARGET)
) {
  throw new Error(
    "Usage: node scripts/debug-telegraph-x402.mjs <TARGET>"
  );
}

const miners =
  JSON.parse(
    fs.readFileSync(
      "data/miners.json",
      "utf8"
    )
  );

const miner =
  miners.find(
    (m) =>
      m.slug ===
        "refut-onchain-risk" &&
      m.activation_status ===
        "active"
  );

if (!miner) {
  throw new Error(
    "Active Refut Miner unavailable"
  );
}

const account =
  privateKeyToAccount(
    PRIVATE_KEY
  );

const signer =
  toClientEvmSigner(
    account
  );

const client =
  x402Client.fromConfig({
    schemes: [
      {
        network:
          "eip155:84532",

        client:
          new ExactEvmScheme(
            signer
          )
      }
    ]
  });

let requestNumber = 0;

async function tracedFetch(
  input,
  init = {}
) {
  requestNumber++;

  const headers =
    new Headers(
      init.headers ?? {}
    );

  const signature =
    headers.get(
      "payment-signature"
    );

  console.log("");
  console.log(
    `HTTP ATTEMPT ${requestNumber}`
  );

  console.log(
    "Payment signature:",
    signature
      ? `present (${signature.length} chars)`
      : "absent"
  );

  // Never print the actual signature.
  const response =
    await fetch(
      input,
      init
    );

  console.log(
    "Status:",
    response.status
  );

  const required =
    response.headers.get(
      "payment-required"
    );

  const settlement =
    response.headers.get(
      "payment-response"
    );

  console.log(
    "PAYMENT-REQUIRED:",
    required
      ? "present"
      : "absent"
  );

  console.log(
    "PAYMENT-RESPONSE:",
    settlement
      ? "present"
      : "absent"
  );

  if (required) {
    try {
      const decoded =
        JSON.parse(
          Buffer.from(
            required,
            "base64"
          ).toString(
            "utf8"
          )
        );

      console.log(
        "x402 error:",
        decoded.error ??
          "(none)"
      );

      console.log(
        "Accepted lanes:",
        (decoded.accepts ?? [])
          .map(
            (x) =>
              `${x.scheme}:${x.network}:${x.amount}`
          )
          .join(", ")
      );
    } catch {
      console.log(
        "Could not decode PAYMENT-REQUIRED"
      );
    }
  }

  if (settlement) {
    try {
      const decoded =
        JSON.parse(
          Buffer.from(
            settlement,
            "base64"
          ).toString(
            "utf8"
          )
        );

      console.log(
        "Settlement success:",
        decoded.success
      );

      console.log(
        "Settlement transaction:",
        decoded.transaction ??
          "(none)"
      );

      console.log(
        "Settlement error:",
        decoded.errorReason ??
          "(none)"
      );
    } catch {
      console.log(
        "PAYMENT-RESPONSE present but could not decode"
      );
    }
  }

  return response;
}

const paidFetch =
  wrapFetchWithPayment(
    tracedFetch,
    client
  );

const engine =
  process.env
    .TELEGRAPH_ENGINE_URL ||
  "https://devnode.telegraphprotocol.com/engine";

const url =
  `${engine}/v1/ask/${miner.id}`;

console.log("");
console.log(
  "PROOFGATE X402 TRACE"
);

console.log(
  "===================="
);

console.log(
  "Payer:",
  account.address
);

console.log(
  "Target:",
  TARGET
);

console.log(
  "Miner:",
  miner.name
);

console.log("");

const response =
  await paidFetch(
    url,
    {
      method:
        "POST",

      headers: {
        "Content-Type":
          "application/json"
      },

      body:
        JSON.stringify({
          method:
            "POST",

          endpoint:
            "/assess",

          payload: {
            address:
              TARGET,

            chainId:
              84532
          }
        })
    }
  );

const body =
  await response.text();

console.log("");
console.log(
  "FINAL STATUS:",
  response.status
);

console.log(
  "FINAL BODY:",
  body || "(empty)"
);

console.log("");
