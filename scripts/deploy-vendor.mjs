import "dotenv/config";

import fs from "node:fs";

import {
  ethers
} from "ethers";

const KEY =
  process.env
    .TELEGRAPH_EVM_PRIVATE_KEY;

if (!KEY) {
  throw new Error(
    "Burner wallet key missing"
  );
}

const RPCS =
  [
    process.env
      .BASE_SEPOLIA_RPC_URL,

    "https://sepolia-preconf.base.org",

    "https://sepolia.base.org"
  ]
    .filter(Boolean)
    .filter(
      (value, index, array) =>
        array.indexOf(value) ===
        index
    );

const NETWORK = {
  name:
    "base-sepolia",

  chainId:
    84532
};

function providerFor(
  rpc
) {
  const request =
    new ethers.FetchRequest(
      rpc
    );

  request.timeout =
    20_000;

  return new ethers.JsonRpcProvider(
    request,
    NETWORK,
    {
      staticNetwork:
        true
    }
  );
}

async function healthyProvider() {
  for (
    const rpc
    of RPCS
  ) {
    try {
      const provider =
        providerFor(rpc);

      const block =
        await provider
          .getBlockNumber();

      console.log(
        "RPC healthy:",
        rpc
      );

      console.log(
        "Block:",
        block
      );

      return {
        provider,
        rpc
      };
    } catch {
      console.log(
        "RPC unavailable:",
        rpc
      );
    }
  }

  throw new Error(
    "No Base Sepolia RPC available"
  );
}

async function receiptAcrossRpcs(
  txHash,
  expectedAddress
) {
  for (
    let attempt = 0;
    attempt < 40;
    attempt++
  ) {
    for (
      const rpc
      of RPCS
    ) {
      try {
        const provider =
          providerFor(rpc);

        const receipt =
          await provider
            .getTransactionReceipt(
              txHash
            );

        if (receipt) {
          return {
            receipt,
            rpc
          };
        }

        // If receipt lookup is unhealthy but
        // deployed code exists, deployment
        // definitely happened.
        const code =
          await provider
            .getCode(
              expectedAddress
            );

        if (
          code &&
          code !== "0x"
        ) {
          return {
            receipt: null,
            rpc,
            codeConfirmed:
              true
          };
        }
      } catch {
        // Try next provider.
      }
    }

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          3000
        )
    );
  }

  return null;
}

const artifact =
  JSON.parse(
    fs.readFileSync(
      "artifacts/vendor/ProofGateVendor.json",
      "utf8"
    )
  );

const {
  provider,
  rpc
} =
  await healthyProvider();

const wallet =
  new ethers.Wallet(
    KEY,
    provider
  );

console.log("");
console.log(
  "PROOFGATE VENDOR DEPLOYMENT"
);

console.log(
  "==========================="
);

console.log(
  "Deployer:",
  wallet.address
);

console.log(
  "RPC:",
  rpc
);

const balance =
  await provider
    .getBalance(
      wallet.address
    );

console.log(
  "ETH:",
  ethers.formatEther(
    balance
  )
);

if (
  balance === 0n
) {
  throw new Error(
    "No ETH available for gas"
  );
}

const nonce =
  await provider
    .getTransactionCount(
      wallet.address,
      "latest"
    );

const expectedAddress =
  ethers.getCreateAddress({
    from:
      wallet.address,

    nonce
  });

const vendorId =
  ethers.keccak256(
    ethers.toUtf8Bytes(
      "proofgate.vendor.alpha.v1"
    )
  );

console.log(
  "Vendor ID:",
  vendorId
);

console.log(
  "Predicted address:",
  expectedAddress
);

const factory =
  new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );

const contract =
  await factory.deploy(
    vendorId
  );

const tx =
  contract
    .deploymentTransaction();

if (!tx) {
  throw new Error(
    "Deployment transaction missing"
  );
}

console.log("");
console.log(
  "Deployment tx:",
  tx.hash
);

console.log(
  "Waiting with RPC failover..."
);

const confirmation =
  await receiptAcrossRpcs(
    tx.hash,
    expectedAddress
  );

if (!confirmation) {
  fs.mkdirSync(
    ".proofgate",
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    ".proofgate/pending-vendor-deployment.json",
    JSON.stringify(
      {
        txHash:
          tx.hash,

        expectedAddress,

        vendorId,

        chainId:
          84532
      },
      null,
      2
    )
  );

  console.log("");
  console.log(
    "Deployment state is ambiguous."
  );

  console.log(
    "ProofGate will NOT redeploy blindly."
  );

  console.log(
    "Pending deployment metadata saved."
  );

  process.exit(2);
}

if (
  confirmation.receipt &&
  confirmation.receipt.status !==
    1
) {
  throw new Error(
    "Deployment reverted"
  );
}

const verifyProvider =
  providerFor(
    confirmation.rpc
  );

const code =
  await verifyProvider
    .getCode(
      expectedAddress
    );

if (
  !code ||
  code === "0x"
) {
  throw new Error(
    "Deployment has no runtime code"
  );
}

const deployment = {
  contract:
    "ProofGateVendor",

  address:
    expectedAddress,

  vendorId,

  chainId:
    84532,

  network:
    "base-sepolia",

  deployer:
    wallet.address,

  transactionHash:
    tx.hash,

  blockNumber:
    confirmation
      .receipt
      ?.blockNumber ??
    null,

  confirmedVia:
    confirmation.rpc,

  deployedAt:
    new Date()
      .toISOString()
};

fs.mkdirSync(
  "data/deployments",
  {
    recursive: true
  }
);

fs.writeFileSync(
  "data/deployments/base-sepolia-vendor.json",
  JSON.stringify(
    deployment,
    null,
    2
  )
);

console.log("");
console.log(
  "VENDOR DEPLOYED"
);

console.log(
  "==============="
);

console.log(
  "Contract:",
  expectedAddress
);

console.log(
  "Transaction:",
  tx.hash
);

console.log(
  "Code size:",
  (code.length - 2) / 2,
  "bytes"
);

console.log(
  "Confirmed via:",
  confirmation.rpc
);

console.log("");
