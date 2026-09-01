import { ethers } from "ethers";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  type ActionContract
} from "../core/action-contract.js";
import {
  AmbiguousExecutionError
} from "./controlled-executor.js";
import {
  FileOperationJournal
} from "./operation-journal.js";
import type {
  PaymentExecutionArtifact
} from "../gateway/payment-gateway.js";

const NETWORK = {
  name: "base-sepolia",
  chainId: BASE_SEPOLIA_CHAIN_ID
};

const ERC20 = new ethers.Interface([
  "function transfer(address to, uint256 value) returns (bool)"
]);

export const DEFAULT_BASE_SEPOLIA_RPCS = [
  "https://sepolia-preconf.base.org",
  "https://sepolia.base.org"
] as const;

export interface PreparedUsdcTransfer {
  chainId: number;
  token: string;
  destination: string;
  amountRaw: string;
  to: string;
  data: string;
  value: bigint;
}

export interface ExecuteBaseSepoliaUsdcInput {
  action: ActionContract;
  privateKey: string;
  rpcUrls?: string[];
  journal?: FileOperationJournal;
  confirmationAttempts?: number;
  confirmationDelayMs?: number;
}

function addressesEqual(a: string, b: string): boolean {
  return (
    /^0x[0-9a-fA-F]{40}$/.test(a) &&
    /^0x[0-9a-fA-F]{40}$/.test(b) &&
    a.toLowerCase() === b.toLowerCase()
  );
}

function uniqueRpcs(values: Array<string | undefined>): string[] {
  return values
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) => all.indexOf(value) === index);
}

function providerFor(rpc: string): ethers.JsonRpcProvider {
  const request = new ethers.FetchRequest(rpc);
  request.timeout = 20_000;

  return new ethers.JsonRpcProvider(
    request,
    NETWORK,
    {
      staticNetwork: true
    }
  );
}

async function actualChainId(
  provider: ethers.JsonRpcProvider
): Promise<number> {
  const raw = await provider.send("eth_chainId", []);

  if (typeof raw !== "string") {
    throw new Error("rpc_chain_id_invalid");
  }

  return Number(BigInt(raw));
}

async function firstHealthyProvider(
  rpcs: string[]
): Promise<{
  rpc: string;
  provider: ethers.JsonRpcProvider;
}> {
  for (const rpc of rpcs) {
    try {
      const provider = providerFor(rpc);
      const chainId = await actualChainId(provider);

      if (chainId !== BASE_SEPOLIA_CHAIN_ID) {
        continue;
      }

      await provider.getBlockNumber();

      return {
        rpc,
        provider
      };
    } catch {
      // Read-only failover is allowed.
    }
  }

  throw new Error("base_sepolia_rpc_unavailable");
}

type Reconciliation =
  | {
      state: "CONFIRMED";
      receipt: ethers.TransactionReceipt;
      rpc: string;
    }
  | {
      state: "FAILED";
      receipt: ethers.TransactionReceipt;
      rpc: string;
    }
  | {
      state: "AMBIGUOUS";
      receipt: null;
      rpc: null;
    };

async function reconcileTransaction(
  txHash: string,
  rpcs: string[],
  attempts: number,
  delayMs: number
): Promise<Reconciliation> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    for (const rpc of rpcs) {
      try {
        const provider = providerFor(rpc);

        if (await actualChainId(provider) !== BASE_SEPOLIA_CHAIN_ID) {
          continue;
        }

        const receipt =
          await provider.getTransactionReceipt(txHash);

        if (receipt?.status === 0) {
          return {
            state: "FAILED",
            receipt,
            rpc
          };
        }

        if (receipt?.status === 1) {
          return {
            state: "CONFIRMED",
            receipt,
            rpc
          };
        }
      } catch {
        // Confirmation reads may fail over across providers.
      }
    }

    if (attempt + 1 < attempts) {
      await new Promise((resolve) =>
        setTimeout(resolve, delayMs)
      );
    }
  }

  return {
    state: "AMBIGUOUS",
    receipt: null,
    rpc: null
  };
}

export function prepareBaseSepoliaUsdcTransfer(
  action: ActionContract
): PreparedUsdcTransfer {
  if (action.type !== "payment") {
    throw new Error("executor_action_type_mismatch");
  }

  if (action.payload.chainId !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Error("executor_action_chain_mismatch");
  }

  if (!addressesEqual(action.payload.token, BASE_SEPOLIA_USDC)) {
    throw new Error("executor_action_asset_mismatch");
  }

  if (!/^[1-9][0-9]*$/.test(action.payload.amountRaw)) {
    throw new Error("executor_action_amount_invalid");
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(action.payload.destination)) {
    throw new Error("executor_action_destination_invalid");
  }

  return {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: action.payload.token,
    destination: action.payload.destination,
    amountRaw: action.payload.amountRaw,
    to: action.payload.token,
    data: ERC20.encodeFunctionData(
      "transfer",
      [
        action.payload.destination,
        BigInt(action.payload.amountRaw)
      ]
    ),
    value: 0n
  };
}

export async function executeBaseSepoliaUsdcTransfer(
  input: ExecuteBaseSepoliaUsdcInput
): Promise<PaymentExecutionArtifact> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.privateKey)) {
    throw new Error("executor_private_key_invalid");
  }

  const prepared =
    prepareBaseSepoliaUsdcTransfer(input.action);

  const rpcs = uniqueRpcs([
    ...(input.rpcUrls ?? []),
    process.env.BASE_SEPOLIA_RPC_URL,
    ...DEFAULT_BASE_SEPOLIA_RPCS
  ]);

  if (rpcs.length === 0) {
    throw new Error("base_sepolia_rpc_unavailable");
  }

  const journal =
    input.journal ??
    new FileOperationJournal();

  const {
    rpc,
    provider
  } = await firstHealthyProvider(rpcs);

  const wallet =
    new ethers.Wallet(
      input.privateKey,
      provider
    );

  const operation = journal.create({
    kind: "onchain_execution",
    actionHash: input.action.actionHash,
    target: input.action.payload.destination,
    metadata: {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      token: input.action.payload.token,
      amountRaw: input.action.payload.amountRaw,
      destination: input.action.payload.destination,
      sender: wallet.address,
      initialRpc: rpc,
      broadcastAttemptsAllowed: 1
    }
  });

  let transactionHash: string | null = null;
  let nonce: number | null = null;

  try {
    nonce = await provider.getTransactionCount(
      wallet.address,
      "pending"
    );

    const gasEstimate =
      await provider.estimateGas({
        from: wallet.address,
        to: prepared.to,
        data: prepared.data,
        value: prepared.value
      });

    const feeData =
      await provider.getFeeData();

    const unsigned: ethers.TransactionRequest = {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      nonce,
      to: prepared.to,
      data: prepared.data,
      value: prepared.value,
      gasLimit: (gasEstimate * 120n) / 100n
    };

    if (
      feeData.maxFeePerGas &&
      feeData.maxPriorityFeePerGas
    ) {
      unsigned.type = 2;
      unsigned.maxFeePerGas =
        feeData.maxFeePerGas;
      unsigned.maxPriorityFeePerGas =
        feeData.maxPriorityFeePerGas;
    } else if (feeData.gasPrice) {
      unsigned.gasPrice =
        feeData.gasPrice;
    }

    const signedTransaction =
      await wallet.signTransaction(unsigned);

    transactionHash =
      ethers.keccak256(signedTransaction);

    journal.update(
      operation.operationId,
      {
        state: "BROADCAST",
        transactionHash,
        metadata: {
          nonce,
          preparedTransactionHash:
            transactionHash,
          broadcastRpc: rpc,
          broadcastStartedAt:
            new Date().toISOString()
        }
      }
    );

    try {
      // Exactly one irreversible broadcast attempt.
      await provider.broadcastTransaction(
        signedTransaction
      );
    } catch (error) {
      journal.update(
        operation.operationId,
        {
          state: "AMBIGUOUS",
          transactionHash,
          metadata: {
            reason:
              "broadcast_response_ambiguous",
            automaticRetry: false,
            error:
              error instanceof Error
                ? error.message
                : String(error)
          }
        }
      );
    }
  } catch (error) {
    const current =
      journal.get(operation.operationId);

    if (
      current &&
      current.state === "PREPARED"
    ) {
      journal.update(
        operation.operationId,
        {
          state: "FAILED",
          metadata: {
            reason:
              "transaction_preparation_failed",
            error:
              error instanceof Error
                ? error.message
                : String(error)
          }
        }
      );
    }

    throw error;
  }

  if (!transactionHash || nonce === null) {
    throw new Error(
      "transaction_preparation_incomplete"
    );
  }

  const reconciliation =
    await reconcileTransaction(
      transactionHash,
      rpcs,
      input.confirmationAttempts ?? 30,
      input.confirmationDelayMs ?? 2_000
    );

  if (reconciliation.state === "FAILED") {
    journal.update(
      operation.operationId,
      {
        state: "FAILED",
        transactionHash,
        metadata: {
          blockNumber:
            reconciliation.receipt.blockNumber,
          confirmedVia:
            reconciliation.rpc,
          reason:
            "base_sepolia_payment_reverted"
        }
      }
    );

    throw new Error(
      "base_sepolia_payment_reverted"
    );
  }

  if (reconciliation.state === "AMBIGUOUS") {
    journal.update(
      operation.operationId,
      {
        state: "AMBIGUOUS",
        transactionHash,
        metadata: {
          reason:
            "payment_confirmation_timeout",
          automaticRetry: false
        }
      }
    );

    throw new AmbiguousExecutionError(
      "base_sepolia_payment_confirmation_ambiguous",
      transactionHash
    );
  }

  journal.update(
    operation.operationId,
    {
      state: "CONFIRMED",
      transactionHash,
      metadata: {
        blockNumber:
          reconciliation.receipt.blockNumber,
        confirmedVia:
          reconciliation.rpc,
        confirmedAt:
          new Date().toISOString()
      }
    }
  );

  return {
    transactionHash,
    blockNumber:
      reconciliation.receipt.blockNumber,
    confirmedAt:
      new Date().toISOString(),
    confirmedVia:
      reconciliation.rpc,
    sender:
      wallet.address,
    nonce,
    operationId:
      operation.operationId
  };
}

export function decodePreparedTransfer(
  data: string
): {
  destination: string;
  amountRaw: string;
} {
  const decoded =
    ERC20.decodeFunctionData(
      "transfer",
      data
    );

  return {
    destination:
      String(decoded[0]),
    amountRaw:
      BigInt(decoded[1]).toString()
  };
}
