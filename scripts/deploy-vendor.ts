import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

import { FileOperationJournal } from "../src/executor/operation-journal.js";

const CHAIN_ID = 84532;
const NETWORK = { name: "base-sepolia", chainId: CHAIN_ID };
const DEPLOYMENT_FILE = "data/deployments/base-sepolia-vendor.json";
const KEY = process.env.TELEGRAPH_EVM_PRIVATE_KEY;

if (!KEY) {
  throw new Error("TELEGRAPH_EVM_PRIVATE_KEY is missing");
}

const RPCS = [
  process.env.BASE_SEPOLIA_RPC_URL,
  "https://sepolia-preconf.base.org",
  "https://sepolia.base.org"
]
  .filter((value): value is string => Boolean(value))
  .filter((value, index, array) => array.indexOf(value) === index);

function providerFor(rpc: string): ethers.JsonRpcProvider {
  const request = new ethers.FetchRequest(rpc);
  request.timeout = 20_000;

  return new ethers.JsonRpcProvider(request, NETWORK, {
    staticNetwork: true
  });
}

async function firstHealthyProvider(): Promise<{
  rpc: string;
  provider: ethers.JsonRpcProvider;
}> {
  for (const rpc of RPCS) {
    try {
      const provider = providerFor(rpc);
      await provider.getBlockNumber();
      return { rpc, provider };
    } catch {
      // Try the next configured public RPC.
    }
  }

  throw new Error("base_sepolia_rpc_unavailable");
}

async function codeAcrossRpcs(address: string): Promise<{
  code: string;
  rpc: string;
} | null> {
  for (const rpc of RPCS) {
    try {
      const code = await providerFor(rpc).getCode(address);

      if (code && code !== "0x") {
        return { code, rpc };
      }
    } catch {
      // Continue across providers.
    }
  }

  return null;
}

async function reconcileDeployment(
  txHash: string,
  expectedAddress: string,
  attempts = 40
): Promise<{
  state: "CONFIRMED" | "FAILED" | "AMBIGUOUS";
  receipt: ethers.TransactionReceipt | null;
  rpc: string | null;
  code: string | null;
}> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    for (const rpc of RPCS) {
      try {
        const provider = providerFor(rpc);
        const receipt = await provider.getTransactionReceipt(txHash);

        if (receipt?.status === 0) {
          return {
            state: "FAILED",
            receipt,
            rpc,
            code: null
          };
        }

        const address = receipt?.contractAddress ?? expectedAddress;
        const code = await provider.getCode(address);

        if (receipt?.status === 1 && code && code !== "0x") {
          return {
            state: "CONFIRMED",
            receipt,
            rpc,
            code
          };
        }

        // A provider can expose state before its receipt index catches up.
        // Code at the deterministic CREATE address is sufficient to know the
        // deployment happened; another provider can supply the receipt later.
        if (!receipt && code && code !== "0x") {
          return {
            state: "CONFIRMED",
            receipt: null,
            rpc,
            code
          };
        }
      } catch {
        // Try the next provider.
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }

  return {
    state: "AMBIGUOUS",
    receipt: null,
    rpc: null,
    code: null
  };
}

async function verifyExistingDeployment(): Promise<boolean> {
  if (!fs.existsSync(DEPLOYMENT_FILE)) {
    return false;
  }

  const existing = JSON.parse(
    fs.readFileSync(DEPLOYMENT_FILE, "utf8")
  ) as {
    status?: string;
    address?: string;
    transactionHash?: string;
  };

  if (
    existing.status !== "confirmed" ||
    typeof existing.address !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(existing.address)
  ) {
    throw new Error(
      "deployment_record_exists_but_is_not_confirmed; reconcile it before deploying"
    );
  }

  const deployed = await codeAcrossRpcs(existing.address);

  if (!deployed) {
    throw new Error(
      "confirmed_deployment_record_has_no_observable_code; refusing duplicate deployment"
    );
  }

  console.log("");
  console.log("PROOFGATE VENDOR ALREADY DEPLOYED");
  console.log("=================================");
  console.log("Contract:", existing.address);
  console.log("Transaction:", existing.transactionHash ?? "(unknown)");
  console.log("Code size:", (deployed.code.length - 2) / 2, "bytes");
  console.log("Verified via:", deployed.rpc);
  console.log("No new transaction was created.");
  console.log("");

  return true;
}

if (await verifyExistingDeployment()) {
  process.exit(0);
}

const artifact = JSON.parse(
  fs.readFileSync("artifacts/vendor/ProofGateVendor.json", "utf8")
) as {
  abi: ethers.InterfaceAbi;
  bytecode: string;
};

const { provider, rpc } = await firstHealthyProvider();
const wallet = new ethers.Wallet(KEY, provider);
const balance = await provider.getBalance(wallet.address);

if (balance === 0n) {
  throw new Error("no_base_sepolia_eth_for_deployment");
}

const nonce = await provider.getTransactionCount(wallet.address, "latest");
const expectedAddress = ethers.getCreateAddress({
  from: wallet.address,
  nonce
});
const vendorId = ethers.keccak256(
  ethers.toUtf8Bytes("proofgate.vendor.alpha.v1")
);

const factory = new ethers.ContractFactory(
  artifact.abi,
  artifact.bytecode,
  wallet
);
const deploymentRequest = await factory.getDeployTransaction(vendorId);
const gasEstimate = await provider.estimateGas({
  ...deploymentRequest,
  from: wallet.address
});
const feeData = await provider.getFeeData();

const unsigned: ethers.TransactionRequest = {
  ...deploymentRequest,
  chainId: CHAIN_ID,
  nonce,
  gasLimit: (gasEstimate * 120n) / 100n
};

if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
  unsigned.type = 2;
  unsigned.maxFeePerGas = feeData.maxFeePerGas;
  unsigned.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
} else if (feeData.gasPrice) {
  unsigned.gasPrice = feeData.gasPrice;
}

// Sign before broadcast. This lets Auctorail know the deterministic tx hash
// and nonce before an RPC can accept the irreversible write.
const signedTransaction = await wallet.signTransaction(unsigned);
const transactionHash = ethers.keccak256(signedTransaction);

const journal = new FileOperationJournal();
const operation = journal.create({
  kind: "contract_deployment",
  target: expectedAddress,
  transactionHash,
  metadata: {
    chainId: CHAIN_ID,
    deployer: wallet.address,
    nonce,
    vendorId,
    preparedTransactionHash: transactionHash,
    initialRpc: rpc
  }
});

console.log("");
console.log("PROOFGATE VENDOR DEPLOYMENT");
console.log("===========================");
console.log("Operation:", operation.operationId);
console.log("Deployer:", wallet.address);
console.log("Nonce:", nonce);
console.log("Predicted contract:", expectedAddress);
console.log("Prepared tx hash:", transactionHash);
console.log("RPC:", rpc);
console.log("");

try {
  await provider.broadcastTransaction(signedTransaction);

  journal.update(operation.operationId, {
    state: "BROADCAST",
    transactionHash,
    metadata: {
      broadcastRpc: rpc,
      broadcastAt: new Date().toISOString()
    }
  });
} catch (error) {
  // The RPC can accept a transaction and still lose the response. Do not
  // assume a thrown transport error means the deployment did not happen.
  journal.update(operation.operationId, {
    state: "AMBIGUOUS",
    transactionHash,
    metadata: {
      reason: "broadcast_response_ambiguous",
      error: error instanceof Error ? error.message : String(error)
    }
  });
}

const reconciliation = await reconcileDeployment(
  transactionHash,
  expectedAddress
);

if (reconciliation.state === "FAILED") {
  journal.update(operation.operationId, {
    state: "FAILED",
    transactionHash,
    metadata: {
      blockNumber: reconciliation.receipt?.blockNumber ?? null,
      confirmedVia: reconciliation.rpc
    }
  });

  throw new Error("vendor_deployment_reverted");
}

if (reconciliation.state === "AMBIGUOUS") {
  const current = journal.get(operation.operationId);

  if (current?.state !== "AMBIGUOUS") {
    journal.update(operation.operationId, {
      state: "AMBIGUOUS",
      transactionHash,
      metadata: {
        reason: "deployment_confirmation_timeout",
        automaticRetry: false
      }
    });
  }

  console.log("Deployment outcome is AMBIGUOUS.");
  console.log("Transaction:", transactionHash);
  console.log("Auctorail will not redeploy blindly.");
  process.exit(2);
}

const current = journal.get(operation.operationId);

if (current?.state === "AMBIGUOUS") {
  journal.update(operation.operationId, {
    state: "CONFIRMED",
    transactionHash,
    metadata: {
      blockNumber: reconciliation.receipt?.blockNumber ?? null,
      confirmedVia: reconciliation.rpc
    }
  });
} else {
  journal.update(operation.operationId, {
    state: "CONFIRMED",
    transactionHash,
    metadata: {
      blockNumber: reconciliation.receipt?.blockNumber ?? null,
      confirmedVia: reconciliation.rpc
    }
  });
}

const contractAddress =
  reconciliation.receipt?.contractAddress ?? expectedAddress;

const deployment = {
  schemaVersion: "proofgate.deployment.v1",
  contract: "ProofGateVendor",
  address: contractAddress,
  chainId: CHAIN_ID,
  network: "base-sepolia",
  deployer: wallet.address,
  vendorId,
  transactionHash,
  blockNumber: reconciliation.receipt?.blockNumber ?? null,
  gasUsed: reconciliation.receipt?.gasUsed?.toString() ?? null,
  runtimeCodeBytes:
    reconciliation.code ? (reconciliation.code.length - 2) / 2 : null,
  confirmedVia: reconciliation.rpc,
  operationId: operation.operationId,
  status: "confirmed",
  deployedAt: new Date().toISOString()
};

fs.mkdirSync(path.dirname(DEPLOYMENT_FILE), { recursive: true });
fs.writeFileSync(
  DEPLOYMENT_FILE,
  JSON.stringify(deployment, null, 2)
);

console.log("VENDOR DEPLOYED");
console.log("===============");
console.log("Contract:", contractAddress);
console.log("Transaction:", transactionHash);
console.log("Code size:", deployment.runtimeCodeBytes, "bytes");
console.log("Confirmed via:", reconciliation.rpc);
console.log("");
