import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC
} from "../src/core/action-contract.js";
import { FileOperationJournal } from "../src/executor/operation-journal.js";

const NETWORK = {
  name: "base-sepolia",
  chainId: BASE_SEPOLIA_CHAIN_ID
};
const DEPLOYMENT_FILE =
  "data/deployments/base-sepolia-permit-gate.json";
const ARTIFACT_FILE =
  "artifacts/permit-gate/AuctorailPermitGate.json";
const MAX_FUND_RAW = 5_000_000n;
const DEFAULT_FUND_RAW = 2_000_000n;

function privateKey(): `0x${string}` {
  const value =
    process.env.AUCTORAIL_ONCHAIN_PERMIT_PRIVATE_KEY ??
    process.env.PROOFGATE_EXECUTOR_PRIVATE_KEY ??
    process.env.TELEGRAPH_EVM_PRIVATE_KEY;

  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(
      "AUCTORAIL_ONCHAIN_PERMIT_PRIVATE_KEY, PROOFGATE_EXECUTOR_PRIVATE_KEY or TELEGRAPH_EVM_PRIVATE_KEY is required"
    );
  }

  return value as `0x${string}`;
}

function fundRaw(): bigint {
  const value = process.env.AUCTORAIL_GATE_FUND_RAW;
  if (!value) return DEFAULT_FUND_RAW;
  if (!/^\d+$/.test(value)) {
    throw new Error("AUCTORAIL_GATE_FUND_RAW must be an unsigned integer");
  }
  const parsed = BigInt(value);
  if (parsed > MAX_FUND_RAW) {
    throw new Error("AUCTORAIL_GATE_FUND_RAW exceeds 5 USDC safety cap");
  }
  return parsed;
}

const RPCS = [
  process.env.BASE_SEPOLIA_RPC_URL,
  "https://sepolia-preconf.base.org",
  "https://sepolia.base.org"
]
  .filter((value): value is string => Boolean(value))
  .filter((value, index, values) => values.indexOf(value) === index);

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
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== BASE_SEPOLIA_CHAIN_ID) continue;
      await provider.getBlockNumber();
      return { rpc, provider };
    } catch {
      // Try the next configured RPC.
    }
  }
  throw new Error("base_sepolia_rpc_unavailable");
}

async function reconcile(
  txHash: string,
  attempts = 40
): Promise<{
  receipt: ethers.TransactionReceipt;
  rpc: string;
}> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    for (const rpc of RPCS) {
      try {
        const receipt = await providerFor(rpc).getTransactionReceipt(txHash);
        if (receipt?.status === 0) {
          throw new Error(`transaction_reverted:${txHash}`);
        }
        if (receipt?.status === 1) return { receipt, rpc };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("transaction_reverted:")
        ) {
          throw error;
        }
      }
    }
    if (attempt + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  }
  throw new Error(`transaction_confirmation_ambiguous:${txHash}`);
}

async function signAndBroadcastOnce(input: {
  wallet: ethers.Wallet;
  provider: ethers.JsonRpcProvider;
  rpc: string;
  request: ethers.TransactionRequest;
  kind: string;
  target: string;
}): Promise<{
  transactionHash: string;
  receipt: ethers.TransactionReceipt;
  confirmedVia: string;
  nonce: number;
}> {
  const nonce = await input.provider.getTransactionCount(
    input.wallet.address,
    "pending"
  );
  const gasEstimate = await input.provider.estimateGas({
    ...input.request,
    from: input.wallet.address
  });
  const feeData = await input.provider.getFeeData();
  const unsigned: ethers.TransactionRequest = {
    ...input.request,
    chainId: BASE_SEPOLIA_CHAIN_ID,
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

  const signed = await input.wallet.signTransaction(unsigned);
  const transactionHash = ethers.keccak256(signed);
  const journal = new FileOperationJournal();
  const operation = journal.create({
    kind: input.kind,
    target: input.target,
    transactionHash,
    metadata: {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      sender: input.wallet.address,
      nonce,
      initialRpc: input.rpc,
      broadcastAttemptsAllowed: 1
    }
  });

  journal.update(operation.operationId, {
    state: "BROADCAST",
    transactionHash,
    metadata: {
      broadcastRpc: input.rpc,
      broadcastStartedAt: new Date().toISOString()
    }
  });

  try {
    // Exactly one irreversible broadcast attempt.
    await input.provider.broadcastTransaction(signed);
  } catch (error) {
    journal.update(operation.operationId, {
      state: "AMBIGUOUS",
      transactionHash,
      metadata: {
        reason: "broadcast_response_ambiguous",
        automaticRetry: false,
        error: error instanceof Error ? error.message : String(error)
      }
    });
  }

  const confirmed = await reconcile(transactionHash);
  journal.update(operation.operationId, {
    state: "CONFIRMED",
    transactionHash,
    metadata: {
      blockNumber: confirmed.receipt.blockNumber,
      confirmedVia: confirmed.rpc,
      confirmedAt: new Date().toISOString()
    }
  });

  return {
    transactionHash,
    receipt: confirmed.receipt,
    confirmedVia: confirmed.rpc,
    nonce
  };
}

if (!fs.existsSync(ARTIFACT_FILE)) {
  throw new Error(
    `missing ${ARTIFACT_FILE}; run node scripts/compile-permit-gate.mjs first`
  );
}
if (fs.existsSync(DEPLOYMENT_FILE)) {
  throw new Error(
    `${DEPLOYMENT_FILE} already exists; verify the recorded deployment instead of creating a duplicate`
  );
}

const artifact = JSON.parse(
  fs.readFileSync(ARTIFACT_FILE, "utf8")
) as {
  abi: ethers.InterfaceAbi;
  bytecode: string;
};

const { provider, rpc } = await firstHealthyProvider();
const wallet = new ethers.Wallet(privateKey(), provider);
const nativeBalance = await provider.getBalance(wallet.address);
if (nativeBalance === 0n) {
  throw new Error("no_base_sepolia_eth_for_permit_gate_deployment");
}

const token = new ethers.Contract(
  BASE_SEPOLIA_USDC,
  [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address,uint256) returns (bool)"
  ],
  provider
);

const requestedFundRaw = fundRaw();
const signerUsdcBalance = BigInt(
  await token.balanceOf(wallet.address)
);
if (signerUsdcBalance < requestedFundRaw) {
  throw new Error(
    `insufficient_base_sepolia_usdc_for_gate_funding:${signerUsdcBalance.toString()}`
  );
}

const factory = new ethers.ContractFactory(
  artifact.abi,
  artifact.bytecode,
  wallet
);
const deploymentRequest = await factory.getDeployTransaction(
  BASE_SEPOLIA_USDC,
  wallet.address
);
const expectedNonce = await provider.getTransactionCount(
  wallet.address,
  "pending"
);
const expectedAddress = ethers.getCreateAddress({
  from: wallet.address,
  nonce: expectedNonce
});

console.log("AUCTORAIL PERMIT GATE — BASE SEPOLIA");
console.log("====================================");
console.log("Deployer / immutable permit signer:", wallet.address);
console.log("Protected token:", BASE_SEPOLIA_USDC);
console.log("Predicted gate:", expectedAddress);
console.log("Initial protected funding:", requestedFundRaw.toString(), "USDC minor units");

const deployed = await signAndBroadcastOnce({
  wallet,
  provider,
  rpc,
  request: deploymentRequest,
  kind: "permit_gate_deployment",
  target: expectedAddress
});

const code = await provider.getCode(expectedAddress);
if (!code || code === "0x") {
  throw new Error("permit_gate_deployed_code_missing");
}

const gate = new ethers.Contract(expectedAddress, artifact.abi, provider);
const configuredToken = String(await gate.token());
const configuredSigner = String(await gate.permitSigner());
if (
  ethers.getAddress(configuredToken) !== ethers.getAddress(BASE_SEPOLIA_USDC) ||
  ethers.getAddress(configuredSigner) !== ethers.getAddress(wallet.address)
) {
  throw new Error("permit_gate_constructor_verification_failed");
}

let funding: {
  transactionHash: string;
  blockNumber: number;
  confirmedVia: string;
  amountRaw: string;
} | null = null;

if (requestedFundRaw > 0n) {
  const tokenInterface = new ethers.Interface([
    "function transfer(address,uint256) returns (bool)"
  ]);
  const funded = await signAndBroadcastOnce({
    wallet,
    provider,
    rpc,
    request: {
      to: BASE_SEPOLIA_USDC,
      data: tokenInterface.encodeFunctionData("transfer", [
        expectedAddress,
        requestedFundRaw
      ]),
      value: 0n
    },
    kind: "permit_gate_funding",
    target: expectedAddress
  });

  funding = {
    transactionHash: funded.transactionHash,
    blockNumber: funded.receipt.blockNumber,
    confirmedVia: funded.confirmedVia,
    amountRaw: requestedFundRaw.toString()
  };
}

const gateBalance = BigInt(await token.balanceOf(expectedAddress));
if (gateBalance < requestedFundRaw) {
  throw new Error("permit_gate_funding_balance_mismatch");
}

const record = {
  schemaVersion: "auctorail.permit-gate-deployment.v1",
  network: "Base Sepolia",
  chainId: BASE_SEPOLIA_CHAIN_ID,
  contract: "AuctorailPermitGate",
  address: expectedAddress,
  token: BASE_SEPOLIA_USDC,
  permitSigner: wallet.address,
  deployment: {
    transactionHash: deployed.transactionHash,
    blockNumber: deployed.receipt.blockNumber,
    confirmedVia: deployed.confirmedVia,
    nonce: deployed.nonce
  },
  funding,
  gateBalanceRaw: gateBalance.toString(),
  deployedAt: new Date().toISOString(),
  guarantees: {
    eip712DomainBound: true,
    exactActionBound: true,
    decisionBound: true,
    amountRecipientBound: true,
    oneUseOnchainReplayProtection: true,
    immutablePermitSigner: true,
    ownerOrAdminBypass: false
  }
};

fs.mkdirSync(path.dirname(DEPLOYMENT_FILE), { recursive: true });
fs.writeFileSync(
  DEPLOYMENT_FILE,
  `${JSON.stringify(record, null, 2)}\n`,
  { mode: 0o600 }
);

console.log("");
console.log("PERMIT GATE DEPLOYED AND VERIFIED");
console.log("Gate:", expectedAddress);
console.log("Deployment tx:", deployed.transactionHash);
console.log("Deployment block:", deployed.receipt.blockNumber);
if (funding) {
  console.log("Funding tx:", funding.transactionHash);
  console.log("Funding block:", funding.blockNumber);
}
console.log("Gate USDC balance:", gateBalance.toString());
console.log("Record:", DEPLOYMENT_FILE);
