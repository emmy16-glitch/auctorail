import { ethers } from "ethers";

import type {
  X402PaymentLane,
  X402SettlementResult
} from "./x402-policy.js";

const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_SEPOLIA_USDC =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const AUTHORIZATION_USED_TOPIC =
  ethers.id("AuthorizationUsed(address,bytes32)");
const TRANSFER_TOPIC =
  ethers.id("Transfer(address,address,uint256)");

const TRANSFER_INTERFACE = new ethers.Interface([
  "event Transfer(address indexed from,address indexed to,uint256 value)"
]);

interface ExactEvmAuthorization {
  from: string;
  to: string;
  value: string;
  nonce: string;
  validAfter: string | null;
  validBefore: string | null;
}

export interface X402ReconciliationProof {
  settlement: X402SettlementResult & {
    proofSource:
      | "BASE_SEPOLIA_AUTHORIZATION_USED_AND_TRANSFER"
      | "SIGNED_AUTHORIZATION_RESERVED_UNSETTLED";
    authorizationNonce: string;
    transferVerified: boolean;
    reservedAmountRaw: string;
  };
  authorization: ExactEvmAuthorization;
}

export interface X402ReconciliationInput {
  paymentPayload: unknown;
  lane: X402PaymentLane;
  expectedPayer: string;
  rpcUrls?: string[];
  lookbackBlocks?: number;
  polls?: number;
  pollDelayMs?: number;
}

function isObject(
  value: unknown
): value is Record<string, unknown> {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function address(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !ethers.isAddress(value)
  ) {
    throw new Error(`x402_reconciliation_${field}_invalid`);
  }
  return ethers.getAddress(value);
}

function unsignedString(
  value: unknown,
  field: string
): string {
  if (
    (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") ||
    !/^(0|[1-9][0-9]*)$/.test(String(value))
  ) {
    throw new Error(`x402_reconciliation_${field}_invalid`);
  }
  return String(value);
}

function bytes32(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(value)
  ) {
    throw new Error(`x402_reconciliation_${field}_invalid`);
  }
  return value.toLowerCase();
}

function equalAddress(a: string, b: string): boolean {
  return ethers.getAddress(a) === ethers.getAddress(b);
}

export function extractExactEvmAuthorization(input: {
  paymentPayload: unknown;
  lane: X402PaymentLane;
  expectedPayer: string;
}): ExactEvmAuthorization {
  if (!isObject(input.paymentPayload)) {
    throw new Error("x402_reconciliation_payload_invalid");
  }

  const payload = input.paymentPayload.payload;
  if (!isObject(payload)) {
    throw new Error("x402_reconciliation_scheme_payload_invalid");
  }

  const authorization = payload.authorization;
  if (!isObject(authorization)) {
    throw new Error("x402_reconciliation_authorization_missing");
  }

  const from = address(
    authorization.from,
    "authorizer"
  );
  const to = address(
    authorization.to,
    "recipient"
  );
  const value = unsignedString(
    authorization.value,
    "value"
  );
  const nonce = bytes32(
    authorization.nonce,
    "nonce"
  );

  if (!equalAddress(from, input.expectedPayer)) {
    throw new Error(
      `x402_reconciliation_payer_mismatch:${from}:${input.expectedPayer}`
    );
  }

  if (!equalAddress(to, input.lane.payTo)) {
    throw new Error(
      `x402_reconciliation_recipient_mismatch:${to}:${input.lane.payTo}`
    );
  }

  if (value !== input.lane.amount) {
    throw new Error(
      `x402_reconciliation_amount_mismatch:${value}:${input.lane.amount}`
    );
  }

  if (
    input.lane.network !== `eip155:${BASE_SEPOLIA_CHAIN_ID}` ||
    !equalAddress(input.lane.asset, BASE_SEPOLIA_USDC)
  ) {
    throw new Error("x402_reconciliation_lane_not_base_sepolia_usdc");
  }

  return {
    from,
    to,
    value,
    nonce,
    validAfter:
      authorization.validAfter === undefined
        ? null
        : unsignedString(
            authorization.validAfter,
            "valid_after"
          ),
    validBefore:
      authorization.validBefore === undefined
        ? null
        : unsignedString(
            authorization.validBefore,
            "valid_before"
          )
  };
}

export function reserveUnsettledExactEvmAuthorization(input: {
  paymentPayload: unknown;
  lane: X402PaymentLane;
  expectedPayer: string;
}): X402ReconciliationProof {
  const authorization =
    extractExactEvmAuthorization(input);

  return {
    authorization,
    settlement: {
      success: true,
      code: "payment_ambiguous_reserved",
      retryable: false,
      transaction: null,
      errorReason:
        "settlement_not_observed_full_signed_authorization_amount_reserved_against_evidence_budget",
      settlementObserved: false,
      proofSource:
        "SIGNED_AUTHORIZATION_RESERVED_UNSETTLED",
      authorizationNonce:
        authorization.nonce,
      transferVerified: false,
      reservedAmountRaw:
        authorization.value
    }
  };
}

function defaultRpcUrls(): string[] {
  return [
    process.env.BASE_SEPOLIA_RPC_URL,
    "https://sepolia-preconf.base.org",
    "https://sepolia.base.org"
  ].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0
  );
}

async function findSettlementOnRpc(input: {
  rpcUrl: string;
  authorization: ExactEvmAuthorization;
  lookbackBlocks: number;
}): Promise<string | null> {
  const request = new ethers.FetchRequest(input.rpcUrl);
  request.timeout = 20_000;

  const provider = new ethers.JsonRpcProvider(
    request,
    {
      name: "base-sepolia",
      chainId: BASE_SEPOLIA_CHAIN_ID
    },
    { staticNetwork: true }
  );

  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(
    0,
    latest - input.lookbackBlocks
  );

  const authorizerTopic =
    ethers.zeroPadValue(
      input.authorization.from,
      32
    );

  const logs = await provider.getLogs({
    address: BASE_SEPOLIA_USDC,
    fromBlock,
    toBlock: latest,
    topics: [
      AUTHORIZATION_USED_TOPIC,
      authorizerTopic,
      input.authorization.nonce
    ]
  });

  for (const log of logs) {
    const receipt = await provider.getTransactionReceipt(
      log.transactionHash
    );
    if (!receipt || receipt.status !== 1) continue;

    const matchingTransfer = receipt.logs.some(
      (entry) => {
        if (
          !equalAddress(
            entry.address,
            BASE_SEPOLIA_USDC
          ) ||
          entry.topics[0]?.toLowerCase() !==
            TRANSFER_TOPIC.toLowerCase()
        ) {
          return false;
        }

        try {
          const parsed =
            TRANSFER_INTERFACE.parseLog({
              topics: [...entry.topics],
              data: entry.data
            });

          if (!parsed) return false;

          return (
            equalAddress(
              String(parsed.args.from),
              input.authorization.from
            ) &&
            equalAddress(
              String(parsed.args.to),
              input.authorization.to
            ) &&
            BigInt(parsed.args.value) ===
              BigInt(input.authorization.value)
          );
        } catch {
          return false;
        }
      }
    );

    if (matchingTransfer) {
      return log.transactionHash;
    }
  }

  return null;
}

export async function reconcileExactEvmSettlement(
  input: X402ReconciliationInput
): Promise<X402ReconciliationProof | null> {
  const authorization =
    extractExactEvmAuthorization({
      paymentPayload: input.paymentPayload,
      lane: input.lane,
      expectedPayer: input.expectedPayer
    });

  const rpcUrls = [
    ...new Set(input.rpcUrls ?? defaultRpcUrls())
  ];

  if (rpcUrls.length === 0) {
    throw new Error("x402_reconciliation_no_rpc");
  }

  const polls = Math.max(1, input.polls ?? 3);
  const pollDelayMs = Math.max(
    0,
    input.pollDelayMs ?? 1200
  );
  const lookbackBlocks = Math.max(
    100,
    input.lookbackBlocks ?? 10_000
  );

  let lastRpcError: unknown = null;
  let hadSuccessfulRpcRead = false;

  for (let poll = 0; poll < polls; poll++) {
    for (const rpcUrl of rpcUrls) {
      try {
        const transaction =
          await findSettlementOnRpc({
            rpcUrl,
            authorization,
            lookbackBlocks
          });
        hadSuccessfulRpcRead = true;

        if (transaction) {
          return {
            authorization,
            settlement: {
              success: true,
              code: "payment_settled",
              retryable: false,
              transaction,
              errorReason: null,
              settlementObserved: true,
              proofSource:
                "BASE_SEPOLIA_AUTHORIZATION_USED_AND_TRANSFER",
              authorizationNonce:
                authorization.nonce,
              transferVerified: true,
              reservedAmountRaw:
                authorization.value
            }
          };
        }
      } catch (error) {
        lastRpcError = error;
      }
    }

    if (poll + 1 < polls && pollDelayMs > 0) {
      await new Promise(
        (resolve) =>
          setTimeout(resolve, pollDelayMs)
      );
    }
  }

  if (!hadSuccessfulRpcRead && lastRpcError) {
    throw new Error(
      `x402_reconciliation_rpc_unavailable:${
        lastRpcError instanceof Error
          ? lastRpcError.message
          : String(lastRpcError)
      }`
    );
  }

  // Telegraph has already returned the paid-route response after receiving the
  // exact signed EIP-3009 authorization, but the network/facilitator did not
  // provide observable settlement proof within the bounded reconciliation
  // window. Never retry the authorization. Instead reserve its full amount
  // against the already-approved evidence budget and allow only the subsequent
  // strict Miner/Intent/subject/chain validation to decide whether the response
  // can become authorization evidence.
  return reserveUnsettledExactEvmAuthorization({
    paymentPayload: input.paymentPayload,
    lane: input.lane,
    expectedPayer: input.expectedPayer
  });
}
