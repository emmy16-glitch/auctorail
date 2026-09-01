import {
  describe,
  expect,
  it
} from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";

const vendor =
  "0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8";

const attacker =
  "0xaFb077A0869c6B5bD3DC2aAF7aBb2f971Eb53d08";

function baseAction() {
  return {
    type: "payment" as const,

    chainId:
      BASE_SEPOLIA_CHAIN_ID,

    token:
      BASE_SEPOLIA_USDC,

    amountRaw:
      "5000000",

    destination:
      vendor,

    reason:
      "Invoice INV-1042",

    policyId:
      "payments.strict.v1" as const
  } as const;
}

describe("ProofGate Action Contract", () => {
  it(
    "produces the same hash for the same semantic action",
    () => {
      const a =
        createActionContract(
          baseAction()
        );

      const b =
        createActionContract(
          baseAction()
        );

      expect(a.actionHash)
        .toBe(b.actionHash);

      expect(a.canonicalPayload)
        .toBe(b.canonicalPayload);
    }
  );

  it(
    "changes hash when amount changes",
    () => {
      const approved =
        createActionContract(
          baseAction()
        );

      const tampered =
        createActionContract({
          ...baseAction(),
          amountRaw:
            "15000000"
        });

      expect(
        tampered.actionHash
      ).not.toBe(
        approved.actionHash
      );
    }
  );

  it(
    "changes hash when destination changes",
    () => {
      const approved =
        createActionContract(
          baseAction()
        );

      const tampered =
        createActionContract({
          ...baseAction(),
          destination:
            attacker
        });

      expect(
        tampered.actionHash
      ).not.toBe(
        approved.actionHash
      );
    }
  );

  it(
    "normalizes equivalent address casing",
    () => {
      const checksum =
        createActionContract(
          baseAction()
        );

      const lowercase =
        createActionContract({
          ...baseAction(),
          destination:
            vendor.toLowerCase()
        });

      expect(
        checksum.actionHash
      ).toBe(
        lowercase.actionHash
      );
    }
  );

  it(
    "rejects floating point amounts",
    () => {
      expect(() =>
        createActionContract({
          ...baseAction(),
          amountRaw:
            "5.25"
        })
      ).toThrow();
    }
  );
});
