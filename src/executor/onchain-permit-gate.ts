import { ethers } from "ethers";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  canonicalize,
  hashCanonicalPayload,
  type ActionContract
} from "../core/action-contract.js";
import type { Permit } from "../permit/permit.js";
import type { PaymentExecutionArtifact } from "../gateway/payment-gateway.js";
import { AmbiguousExecutionError } from "./controlled-executor.js";
import { FileOperationJournal } from "./operation-journal.js";

const NETWORK = {
  name: "base-sepolia",
  chainId: BASE_SEPOLIA_CHAIN_ID
};

export const AUCTORAIL_PERMIT_GATE_DOMAIN_NAME =
  "AuctorailPermitGate";
export const AUCTORAIL_PERMIT_GATE_DOMAIN_VERSION = "1";

export const AUCTORAIL_EXECUTION_PERMIT_TYPES = {
  ExecutionPermit: [
    { name: "permitHash", type: "bytes32" },
    { name: "actionHash", type: "bytes32" },
    { name: "decisionHash", type: "bytes32" },
    { name: "token", type: "address" },
    { name: "destination", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ]
} as const;

const GATE_INTERFACE = new ethers.Interface([
  "function token() view returns (address)",
  "function permitSigner() view returns (address)",
  "function consumed(bytes32) view returns (bool)",
  "function execute((bytes32 permitHash,bytes32 actionHash,bytes32 decisionHash,address token,address destination,uint256 amount,uint256 deadline) permit,bytes signature) returns (bool)"
]);

export const DEFAULT_PERMIT_GATE_RPCS = [
  "https://sepolia-preconf.base.org",
  "https://sepolia.base.org"
] as const;

export interface OnchainExecutionPermit {
  permitHash: string;
  actionHash: string;
  decisionHash: string;
  token: string;
  destination: string;
  amount: bigint;
  deadline: bigint;
}

export interface ExecutePermitGatedUsdcInput {
  action: ActionContract;
  authorizationPermit: Permit;
  privateKey: string;
  gateAddress: string;
  rpcUrls?: string[];
  journal?: FileOperationJournal;
  confirmationAttempts?: number;
  confirmationDelayMs?: number;
}

function assertBytes32(value: string, code: string): void {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(code);
}

function addressesEqual(a: string, b: string): boolean {
  try {
    return ethers.getAddress(a) === ethers.getAddress(b);
  } catch {
    return false;
  }
}

function uniqueRpcs(values: Array<string | undefined>): string[] {
  return values
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) => all.indexOf(value) === index);
}

function providerFor(rpc: string): ethers.JsonRpcProvider {
  const request = new ethers.FetchRequest(rpc);
  request.timeout = 20_000;
  return new ethers.JsonRpcProvider(request, NETWORK, {
    staticNetwork: true
  });
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
      if (await actualChainId(provider) !== BASE_SEPOLIA_CHAIN_ID) continue;
      await provider.getBlockNumber();
      return { rpc, provider };
    } catch {
      // Read-only provider failover is allowed.
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
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt?.status === 0) {
          return { state: "FAILED", receipt, rpc };
        }
        if (receipt?.status === 1) {
          return { state: "CONFIRMED", receipt, rpc };
        }
      } catch {
        // Confirmation reads may fail over.
      }
    }
    if (attempt + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return { state: "AMBIGUOUS", receipt: null, rpc: null };
}

export function permitHashForOnchainGate(permit: Permit): string {
  return hashCanonicalPayload(canonicalize(permit));
}

export function createOnchainExecutionPermit(
  action: ActionContract,
  authorizationPermit: Permit
): OnchainExecutionPermit {
  if (action.type !== "payment") {
    throw new Error("onchain_gate_action_type_mismatch");
  }
  if (action.payload.chainId !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Error("onchain_gate_chain_mismatch");
  }
  if (!addressesEqual(action.payload.token, BASE_SEPOLIA_USDC)) {
    throw new Error("onchain_gate_asset_mismatch");
  }
  if (authorizationPermit.payload.actionHash !== action.actionHash) {
    throw new Error("onchain_gate_authorization_action_mismatch");
  }
  assertBytes32(action.actionHash, "onchain_gate_action_hash_invalid");
  assertBytes32(
    authorizationPermit.payload.decisionHash,
    "onchain_gate_decision_hash_invalid"
  );

  const deadlineMs = Date.parse(authorizationPermit.payload.expiresAt);
  if (!Number.isFinite(deadlineMs)) {
    throw new Error("onchain_gate_permit_expiry_invalid");
  }
  const deadline = BigInt(Math.floor(deadlineMs / 1_000));
  if (deadline <= 0n) {
    throw new Error("onchain_gate_permit_expiry_invalid");
  }

  return {
    permitHash: permitHashForOnchainGate(authorizationPermit),
    actionHash: action.actionHash,
    decisionHash: authorizationPermit.payload.decisionHash,
    token: ethers.getAddress(action.payload.token),
    destination: ethers.getAddress(action.payload.destination),
    amount: BigInt(action.payload.amountRaw),
    deadline
  };
}

export function permitGateDomain(gateAddress: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(gateAddress)) {
    throw new Error("onchain_gate_address_invalid");
  }
  return {
    name: AUCTORAIL_PERMIT_GATE_DOMAIN_NAME,
    version: AUCTORAIL_PERMIT_GATE_DOMAIN_VERSION,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    verifyingContract: ethers.getAddress(gateAddress)
  } as const;
}

export async function signOnchainExecutionPermit(input: {
  wallet: ethers.Wallet;
  gateAddress: string;
  permit: OnchainExecutionPermit;
}): Promise<string> {
  const domain = permitGateDomain(input.gateAddress);
  const signature = await input.wallet.signTypedData(
    domain,
    AUCTORAIL_EXECUTION_PERMIT_TYPES,
    input.permit
  );
  const recovered = ethers.verifyTypedData(
    domain,
    AUCTORAIL_EXECUTION_PERMIT_TYPES,
    input.permit,
    signature
  );
  if (!addressesEqual(recovered, input.wallet.address)) {
    throw new Error("onchain_gate_local_signature_verification_failed");
  }
  return signature;
}

export async function executeBaseSepoliaPermitGatedUsdcTransfer(
  input: ExecutePermitGatedUsdcInput
): Promise<PaymentExecutionArtifact> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.privateKey)) {
    throw new Error("executor_private_key_invalid");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.gateAddress)) {
    throw new Error("onchain_gate_address_invalid");
  }

  const onchainPermit = createOnchainExecutionPermit(
    input.action,
    input.authorizationPermit
  );
  const rpcs = uniqueRpcs([
    ...(input.rpcUrls ?? []),
    process.env.BASE_SEPOLIA_RPC_URL,
    ...DEFAULT_PERMIT_GATE_RPCS
  ]);
  if (rpcs.length === 0) {
    throw new Error("base_sepolia_rpc_unavailable");
  }

  const { rpc, provider } = await firstHealthyProvider(rpcs);
  const gateAddress = ethers.getAddress(input.gateAddress);
  const code = await provider.getCode(gateAddress);
  if (!code || code === "0x") {
    throw new Error("onchain_gate_code_missing");
  }

  const gate = new ethers.Contract(
    gateAddress,
    GATE_INTERFACE.fragments,
    provider
  );
  const configuredToken = String(await gate.token());
  if (!addressesEqual(configuredToken, BASE_SEPOLIA_USDC)) {
    throw new Error("onchain_gate_token_mismatch");
  }

  const wallet = new ethers.Wallet(input.privateKey, provider);
  const configuredSigner = String(await gate.permitSigner());
  if (!addressesEqual(configuredSigner, wallet.address)) {
    throw new Error("onchain_gate_signer_mismatch");
  }

  const alreadyConsumed = Boolean(
    await gate.consumed(onchainPermit.permitHash)
  );
  if (alreadyConsumed) {
    throw new Error("onchain_gate_permit_already_consumed");
  }

  const nowSeconds = BigInt(Math.floor(Date.now() / 1_000));
  if (nowSeconds >= onchainPermit.deadline) {
    throw new Error("onchain_gate_permit_expired");
  }

  const signature = await signOnchainExecutionPermit({
    wallet,
    gateAddress,
    permit: onchainPermit
  });
  const data = GATE_INTERFACE.encodeFunctionData("execute", [
    onchainPermit,
    signature
  ]);

  // Dry-run through gas estimation before any irreversible broadcast. Invalid
  // signature, expiry, replay, gate balance, or token transfer failures stop
  // here with no transaction sent.
  const gasEstimate = await provider.estimateGas({
    from: wallet.address,
    to: gateAddress,
    data,
    value: 0n
  });
  const nonce = await provider.getTransactionCount(
    wallet.address,
    "pending"
  );
  const feeData = await provider.getFeeData();
  const unsigned: ethers.TransactionRequest = {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    nonce,
    to: gateAddress,
    data,
    value: 0n,
    gasLimit: (gasEstimate * 120n) / 100n
  };

  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    unsigned.type = 2;
    unsigned.maxFeePerGas = feeData.maxFeePerGas;
    unsigned.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
  } else if (feeData.gasPrice) {
    unsigned.gasPrice = feeData.gasPrice;
  }

  const signedTransaction = await wallet.signTransaction(unsigned);
  const transactionHash = ethers.keccak256(signedTransaction);
  const journal = input.journal ?? new FileOperationJournal();
  const operation = journal.create({
    kind: "onchain_execution",
    actionHash: input.action.actionHash,
    target: gateAddress,
    transactionHash,
    metadata: {
      executionPath: "auctorail_permit_gate_v1",
      chainId: BASE_SEPOLIA_CHAIN_ID,
      token: input.action.payload.token,
      amountRaw: input.action.payload.amountRaw,
      destination: input.action.payload.destination,
      permitHash: onchainPermit.permitHash,
      decisionHash: onchainPermit.decisionHash,
      signer: wallet.address,
      relayer: wallet.address,
      nonce,
      broadcastAttemptsAllowed: 1,
      initialRpc: rpc
    }
  });

  journal.update(operation.operationId, {
    state: "BROADCAST",
    transactionHash,
    metadata: {
      broadcastRpc: rpc,
      broadcastStartedAt: new Date().toISOString()
    }
  });

  try {
    // Exactly one irreversible broadcast attempt.
    await provider.broadcastTransaction(signedTransaction);
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

  const reconciliation = await reconcileTransaction(
    transactionHash,
    rpcs,
    input.confirmationAttempts ?? 30,
    input.confirmationDelayMs ?? 2_000
  );

  if (reconciliation.state === "FAILED") {
    journal.update(operation.operationId, {
      state: "FAILED",
      transactionHash,
      metadata: {
        blockNumber: reconciliation.receipt.blockNumber,
        confirmedVia: reconciliation.rpc,
        reason: "onchain_permit_gate_execution_reverted"
      }
    });
    throw new Error("onchain_permit_gate_execution_reverted");
  }

  if (reconciliation.state === "AMBIGUOUS") {
    journal.update(operation.operationId, {
      state: "AMBIGUOUS",
      transactionHash,
      metadata: {
        reason: "onchain_permit_gate_confirmation_timeout",
        automaticRetry: false
      }
    });
    throw new AmbiguousExecutionError(
      "onchain_permit_gate_confirmation_ambiguous",
      transactionHash
    );
  }

  const consumedAfter = Boolean(
    await new ethers.Contract(
      gateAddress,
      GATE_INTERFACE.fragments,
      providerFor(reconciliation.rpc)
    ).consumed(onchainPermit.permitHash)
  );
  if (!consumedAfter) {
    journal.update(operation.operationId, {
      state: "FAILED",
      transactionHash,
      metadata: {
        reason: "onchain_permit_consumption_not_observed",
        blockNumber: reconciliation.receipt.blockNumber
      }
    });
    throw new Error("onchain_permit_consumption_not_observed");
  }

  journal.update(operation.operationId, {
    state: "CONFIRMED",
    transactionHash,
    metadata: {
      blockNumber: reconciliation.receipt.blockNumber,
      confirmedVia: reconciliation.rpc,
      confirmedAt: new Date().toISOString(),
      onchainPermitConsumed: true
    }
  });

  return {
    transactionHash,
    blockNumber: reconciliation.receipt.blockNumber,
    confirmedAt: new Date().toISOString(),
    confirmedVia: reconciliation.rpc,
    sender: wallet.address,
    nonce,
    operationId: operation.operationId
  };
}
