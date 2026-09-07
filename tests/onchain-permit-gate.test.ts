import { describe, expect, it } from "vitest";
import { ethers } from "ethers";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import type { Permit } from "../src/permit/permit.js";
import {
  AUCTORAIL_EXECUTION_PERMIT_TYPES,
  createOnchainExecutionPermit,
  InsufficientPermitGateBalanceError,
  permitGateDomain,
  permitHashForOnchainGate,
  signOnchainExecutionPermit
} from "../src/executor/onchain-permit-gate.js";

const VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const OTHER = "0x1111111111111111111111111111111111111111";
const GATE = "0x2222222222222222222222222222222222222222";
const PRIVATE_KEY =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function fixture() {
  const action = createActionContract({
    type: "payment",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    amountRaw: "1000000",
    destination: VENDOR,
    reason: "Supplier invoice #4471",
    policyId: "payments.adaptive.v1",
    policyVersion: 1
  });

  const permit: Permit = {
    payload: {
      permitId: "451e1416-09da-445c-8c0c-a046e0ac65b5",
      mandateHash: `0x${"aa".repeat(32)}`,
      actionHash: action.actionHash,
      decisionHash: `0x${"bb".repeat(32)}`,
      nonce: "00112233445566778899aabbccddeeff",
      policyId: "payments.adaptive.v1",
      policyVersion: 1,
      keyId: "auctorail-test-ed25519",
      algorithm: "Ed25519",
      signingVersion: 1,
      issuedAt: "2026-09-07T07:00:00.000Z",
      expiresAt: "2026-09-07T08:00:00.000Z"
    },
    signature: `0x${"cc".repeat(64)}`
  };

  return { action, permit };
}

describe("Auctorail on-chain execution permit", () => {
  it("exposes a user-actionable error when the permit gate lacks USDC", () => {
    const error = new InsufficientPermitGateBalanceError(GATE, 1_000_000n, 470_000n);

    expect(error.code).toBe("insufficient_gate_balance");
    expect(error.gateAddress).toBe(GATE);
    expect(error.requiredRaw).toBe(1_000_000n);
    expect(error.availableRaw).toBe(470_000n);
    expect(error.message).toContain("available=470000");
    expect(error.message).toContain("required=1000000");
  });

  it("derives the on-chain permit from the upstream Auctorail authorization", () => {
    const { action, permit } = fixture();
    const derived = createOnchainExecutionPermit(action, permit);

    expect(derived.permitHash).toBe(permitHashForOnchainGate(permit));
    expect(derived.actionHash).toBe(action.actionHash);
    expect(derived.decisionHash).toBe(permit.payload.decisionHash);
    expect(ethers.getAddress(derived.token)).toBe(ethers.getAddress(BASE_SEPOLIA_USDC));
    expect(ethers.getAddress(derived.destination)).toBe(ethers.getAddress(VENDOR));
    expect(derived.amount).toBe(1_000_000n);
    expect(derived.deadline).toBe(BigInt(Math.floor(Date.parse(permit.payload.expiresAt) / 1000)));
  });

  it("signs a domain-bound EIP-712 permit that recovers only the configured signer", async () => {
    const { action, permit } = fixture();
    const derived = createOnchainExecutionPermit(action, permit);
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    const signature = await signOnchainExecutionPermit({
      wallet,
      gateAddress: GATE,
      permit: derived
    });

    const recovered = ethers.verifyTypedData(
      permitGateDomain(GATE),
      AUCTORAIL_EXECUTION_PERMIT_TYPES,
      derived,
      signature
    );

    expect(recovered).toBe(wallet.address);
  });

  it("invalidates the signature when the amount is changed", async () => {
    const { action, permit } = fixture();
    const derived = createOnchainExecutionPermit(action, permit);
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    const signature = await signOnchainExecutionPermit({
      wallet,
      gateAddress: GATE,
      permit: derived
    });

    const mutated = { ...derived, amount: 100_000_000n };
    const recovered = ethers.verifyTypedData(
      permitGateDomain(GATE),
      AUCTORAIL_EXECUTION_PERMIT_TYPES,
      mutated,
      signature
    );

    expect(recovered).not.toBe(wallet.address);
  });

  it("invalidates the signature when the recipient is changed", async () => {
    const { action, permit } = fixture();
    const derived = createOnchainExecutionPermit(action, permit);
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    const signature = await signOnchainExecutionPermit({
      wallet,
      gateAddress: GATE,
      permit: derived
    });

    const mutated = { ...derived, destination: OTHER };
    const recovered = ethers.verifyTypedData(
      permitGateDomain(GATE),
      AUCTORAIL_EXECUTION_PERMIT_TYPES,
      mutated,
      signature
    );

    expect(recovered).not.toBe(wallet.address);
  });

  it("invalidates a signature replayed against a different gate contract", async () => {
    const { action, permit } = fixture();
    const derived = createOnchainExecutionPermit(action, permit);
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    const signature = await signOnchainExecutionPermit({
      wallet,
      gateAddress: GATE,
      permit: derived
    });

    const recovered = ethers.verifyTypedData(
      permitGateDomain("0x3333333333333333333333333333333333333333"),
      AUCTORAIL_EXECUTION_PERMIT_TYPES,
      derived,
      signature
    );

    expect(recovered).not.toBe(wallet.address);
  });

  it("refuses to derive a gate permit from an authorization for another action", () => {
    const { action, permit } = fixture();
    const mismatched: Permit = {
      ...permit,
      payload: {
        ...permit.payload,
        actionHash: `0x${"dd".repeat(32)}`
      }
    };

    expect(() => createOnchainExecutionPermit(action, mismatched)).toThrow(
      "onchain_gate_authorization_action_mismatch"
    );
  });
});
