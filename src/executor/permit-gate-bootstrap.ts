import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC
} from "../core/action-contract.js";
import { AmbiguousExecutionError } from "./controlled-executor.js";
import { FileOperationJournal } from "./operation-journal.js";
import { DEFAULT_PERMIT_GATE_RPCS } from "./onchain-permit-gate.js";

const NETWORK = { name: "base-sepolia", chainId: BASE_SEPOLIA_CHAIN_ID };
const ERC20 = new ethers.Interface([
  "function transfer(address to,uint256 value) returns (bool)",
  "function balanceOf(address account) view returns (uint256)"
]);
const GATE_VIEW = new ethers.Interface([
  "function token() view returns (address)",
  "function permitSigner() view returns (address)"
]);

export interface PermitGateBootstrapResult {
  gateAddress: string;
  signer: string;
  token: string;
  fundedRaw: string;
  deploymentTransactionHash: string;
  deploymentBlockNumber: number;
  fundingTransactionHash: string;
  fundingBlockNumber: number;
}

function providerFor(rpc: string): ethers.JsonRpcProvider {
  const request = new ethers.FetchRequest(rpc);
  request.timeout = 20_000;
  return new ethers.JsonRpcProvider(request, NETWORK, { staticNetwork: true });
}

function uniqueRpcs(values: Array<string | undefined>): string[] {
  return values
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) => all.indexOf(value) === index);
}

async function healthyProvider(rpcs: string[]) {
  for (const rpc of rpcs) {
    try {
      const provider = providerFor(rpc);
      const raw = await provider.send("eth_chainId", []);
      if (Number(BigInt(String(raw))) !== BASE_SEPOLIA_CHAIN_ID) continue;
      await provider.getBlockNumber();
      return { rpc, provider };
    } catch {
      // Read-only failover is safe.
    }
  }
  throw new Error("base_sepolia_rpc_unavailable");
}

async function reconcile(
  transactionHash: string,
  rpcs: string[],
  attempts = 20,
  delayMs = 1_500
): Promise<{ receipt: ethers.TransactionReceipt; rpc: string } | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    for (const rpc of rpcs) {
      try {
        const provider = providerFor(rpc);
        const receipt = await provider.getTransactionReceipt(transactionHash);
        if (receipt?.status === 0) throw new Error("transaction_reverted");
        if (receipt?.status === 1) return { receipt, rpc };
      } catch (error) {
        if (error instanceof Error && error.message === "transaction_reverted") {
          throw error;
        }
      }
    }
    if (attempt + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

function readGateArtifact(): { abi: ethers.InterfaceAbi; bytecode: string } {
  const artifactPath = path.join(
    process.cwd(),
    "artifacts",
    "permit-gate",
    "AuctorailPermitGate.json"
  );
  const parsed = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as {
    abi?: ethers.InterfaceAbi;
    bytecode?: string;
  };
  if (!parsed.abi || typeof parsed.bytecode !== "string" || !/^0x[0-9a-fA-F]+$/.test(parsed.bytecode)) {
    throw new Error("permit_gate_artifact_invalid");
  }
  return { abi: parsed.abi, bytecode: parsed.bytecode };
}

async function signAndBroadcastOnce(input: {
  wallet: ethers.Wallet;
  provider: ethers.JsonRpcProvider;
  rpc: string;
  rpcs: string[];
  transaction: ethers.TransactionRequest;
  journal: FileOperationJournal;
  kind: "contract_deployment" | "onchain_execution";
  target: string;
  metadata: Record<string, unknown>;
}): Promise<{ transactionHash: string; receipt: ethers.TransactionReceipt; rpc: string }> {
  const feeData = await input.provider.getFeeData();
  const unsigned: ethers.TransactionRequest = { ...input.transaction };
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    unsigned.type = 2;
    unsigned.maxFeePerGas = feeData.maxFeePerGas;
    unsigned.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
  } else if (feeData.gasPrice) {
    unsigned.gasPrice = feeData.gasPrice;
  }

  const signed = await input.wallet.signTransaction(unsigned);
  const transactionHash = ethers.keccak256(signed);
  const operation = input.journal.create({
    kind: input.kind,
    target: input.target,
    transactionHash,
    metadata: {
      ...input.metadata,
      chainId: BASE_SEPOLIA_CHAIN_ID,
      broadcastAttemptsAllowed: 1,
      initialRpc: input.rpc
    }
  });
  input.journal.update(operation.operationId, {
    state: "BROADCAST",
    transactionHash,
    metadata: { broadcastRpc: input.rpc }
  });

  try {
    await input.provider.broadcastTransaction(signed);
  } catch (error) {
    input.journal.update(operation.operationId, {
      state: "AMBIGUOUS",
      transactionHash,
      metadata: {
        automaticRetry: false,
        broadcastError: error instanceof Error ? error.message : String(error)
      }
    });
  }

  const reconciled = await reconcile(transactionHash, input.rpcs);
  if (!reconciled) {
    input.journal.update(operation.operationId, {
      state: "AMBIGUOUS",
      transactionHash,
      metadata: { automaticRetry: false, reason: "confirmation_timeout" }
    });
    throw new AmbiguousExecutionError("permit_gate_bootstrap_ambiguous", transactionHash);
  }

  input.journal.update(operation.operationId, {
    state: "CONFIRMED",
    transactionHash,
    metadata: {
      blockNumber: reconciled.receipt.blockNumber,
      confirmedVia: reconciled.rpc
    }
  });
  return { transactionHash, receipt: reconciled.receipt, rpc: reconciled.rpc };
}

export async function bootstrapPermitGate(input: {
  privateKey: string;
  fundRaw: bigint;
  rpcUrls?: string[];
  journal?: FileOperationJournal;
}): Promise<PermitGateBootstrapResult> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.privateKey)) {
    throw new Error("executor_private_key_invalid");
  }
  if (input.fundRaw <= 0n || input.fundRaw > 10_000_000n) {
    throw new Error("permit_gate_bootstrap_funding_out_of_range");
  }

  const rpcs = uniqueRpcs([
    ...(input.rpcUrls ?? []),
    process.env.BASE_SEPOLIA_RPC_URL,
    ...DEFAULT_PERMIT_GATE_RPCS
  ]);
  const { rpc, provider } = await healthyProvider(rpcs);
  const wallet = new ethers.Wallet(input.privateKey, provider);
  const artifact = readGateArtifact();
  const journal = input.journal ?? new FileOperationJournal();

  const nonce = await provider.getTransactionCount(wallet.address, "pending");
  const expectedAddress = ethers.getCreateAddress({ from: wallet.address, nonce });
  const existingCode = await provider.getCode(expectedAddress);
  if (existingCode && existingCode !== "0x") {
    throw new Error("permit_gate_predicted_address_already_used");
  }

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const deploymentRequest = await factory.getDeployTransaction(
    wallet.address,
    BASE_SEPOLIA_USDC
  );
  const deployGas = await provider.estimateGas({
    ...deploymentRequest,
    from: wallet.address
  });
  const deployment = await signAndBroadcastOnce({
    wallet,
    provider,
    rpc,
    rpcs,
    journal,
    kind: "contract_deployment",
    target: expectedAddress,
    transaction: {
      ...deploymentRequest,
      chainId: BASE_SEPOLIA_CHAIN_ID,
      nonce,
      gasLimit: (deployGas * 120n) / 100n
    },
    metadata: {
      deployment: "AuctorailPermitGate",
      permitSigner: wallet.address,
      token: BASE_SEPOLIA_USDC,
      predictedAddress: expectedAddress
    }
  });

  const code = await provider.getCode(expectedAddress);
  if (!code || code === "0x") throw new Error("permit_gate_deployment_code_missing");
  const gate = new ethers.Contract(expectedAddress, GATE_VIEW.fragments, provider);
  const signer = ethers.getAddress(String(await gate.permitSigner()));
  const token = ethers.getAddress(String(await gate.token()));
  if (signer !== ethers.getAddress(wallet.address)) throw new Error("permit_gate_signer_mismatch");
  if (token !== ethers.getAddress(BASE_SEPOLIA_USDC)) throw new Error("permit_gate_token_mismatch");

  const tokenContract = new ethers.Contract(BASE_SEPOLIA_USDC, ERC20.fragments, provider);
  const walletBalance = BigInt(String(await tokenContract.balanceOf(wallet.address)));
  if (walletBalance < input.fundRaw) throw new Error("permit_gate_bootstrap_usdc_insufficient");
  const fundingData = ERC20.encodeFunctionData("transfer", [expectedAddress, input.fundRaw]);
  const fundingNonce = await provider.getTransactionCount(wallet.address, "pending");
  const fundingGas = await provider.estimateGas({
    from: wallet.address,
    to: BASE_SEPOLIA_USDC,
    data: fundingData,
    value: 0n
  });
  const funding = await signAndBroadcastOnce({
    wallet,
    provider,
    rpc,
    rpcs,
    journal,
    kind: "onchain_execution",
    target: expectedAddress,
    transaction: {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      nonce: fundingNonce,
      to: BASE_SEPOLIA_USDC,
      data: fundingData,
      value: 0n,
      gasLimit: (fundingGas * 120n) / 100n
    },
    metadata: {
      executionPath: "permit_gate_bootstrap_funding",
      token: BASE_SEPOLIA_USDC,
      amountRaw: input.fundRaw.toString(),
      gateAddress: expectedAddress
    }
  });

  const gateBalance = BigInt(String(await tokenContract.balanceOf(expectedAddress)));
  if (gateBalance < input.fundRaw) throw new Error("permit_gate_funding_not_observed");

  return {
    gateAddress: expectedAddress,
    signer,
    token,
    fundedRaw: input.fundRaw.toString(),
    deploymentTransactionHash: deployment.transactionHash,
    deploymentBlockNumber: deployment.receipt.blockNumber,
    fundingTransactionHash: funding.transactionHash,
    fundingBlockNumber: funding.receipt.blockNumber
  };
}
