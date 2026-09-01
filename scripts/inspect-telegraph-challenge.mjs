import "dotenv/config";
import fs from "node:fs";

const TARGET =
  process.argv[2];

if (
  !TARGET ||
  !/^0x[0-9a-fA-F]{40}$/.test(TARGET)
) {
  throw new Error(
    "Usage: node scripts/inspect-telegraph-challenge.mjs <ADDRESS>"
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
    "Active Refut Miner not found"
  );
}

const engine =
  process.env
    .TELEGRAPH_ENGINE_URL ||
  "https://devnode.telegraphprotocol.com/engine";

const url =
  `${engine}/v1/ask/${miner.id}`;

const request = {
  method: "POST",

  endpoint:
    "/assess",

  payload: {
    address:
      TARGET,

    chainId:
      84532
  }
};

console.log("");
console.log(
  "TELEGRAPH X402 CHALLENGE INSPECTOR"
);
console.log(
  "================================="
);
console.log(
  "Miner:",
  miner.name
);
console.log(
  "Target:",
  TARGET
);
console.log("");
console.log(
  "NO PAYMENT WILL BE MADE."
);
console.log("");

const response =
  await fetch(
    url,
    {
      method:
        "POST",

      headers: {
        "Content-Type":
          "application/json"
      },

      body:
        JSON.stringify(
          request
        )
    }
  );

console.log(
  "HTTP:",
  response.status
);

console.log("");
console.log(
  "Relevant response headers"
);
console.log(
  "-------------------------"
);

for (
  const [name, value]
  of response.headers
) {
  const lower =
    name.toLowerCase();

  if (
    lower.includes("payment") ||
    lower.includes("x402")
  ) {
    console.log(
      `${name}: ${value}`
    );
  }
}

const paymentRequired =
  response.headers.get(
    "payment-required"
  );

if (paymentRequired) {
  console.log("");
  console.log(
    "Decoded PAYMENT-REQUIRED"
  );
  console.log(
    "------------------------"
  );

  try {
    const decoded =
      Buffer.from(
        paymentRequired,
        "base64"
      ).toString(
        "utf8"
      );

    const challenge =
      JSON.parse(
        decoded
      );

    console.log(
      "x402Version:",
      challenge.x402Version
    );

    console.log(
      "error:",
      challenge.error ??
        "(none)"
    );

    console.log("");

    for (
      const [
        index,
        option
      ]
      of (
        challenge.accepts ??
        []
      ).entries()
    ) {
      console.log(
        `OPTION ${index + 1}`
      );

      console.log(
        "scheme:",
        option.scheme
      );

      console.log(
        "network:",
        option.network
      );

      console.log(
        "asset:",
        option.asset
      );

      console.log(
        "amount:",
        option.amount
      );

      console.log(
        "payTo:",
        option.payTo
      );

      console.log(
        "maxTimeoutSeconds:",
        option.maxTimeoutSeconds
      );

      console.log(
        "extra:",
        JSON.stringify(
          option.extra ??
            null,
          null,
          2
        )
      );

      console.log("");
    }
  } catch (error) {
    console.log(
      "Could not decode header:"
    );

    console.log(
      error?.message ??
        String(error)
    );
  }
}

const text =
  await response.text();

console.log(
  "Response body:",
  text || "(empty)"
);

console.log("");
