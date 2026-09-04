import {
  describe,
  expect,
  it
} from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract,
  type ActionContract
} from "../src/core/action-contract.js";
import {
  decodePreparedTransfer,
  prepareBaseSepoliaUsdcTransfer
} from "../src/executor/base-sepolia-usdc.js";

const VENDOR =
  "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";

function action() {
  return createActionContract({
    type: "payment",
    chainId:
      BASE_SEPOLIA_CHAIN_ID,
    token:
      BASE_SEPOLIA_USDC,
    amountRaw:
      "1000000",
    destination:
      VENDOR,
    reason:
      "Invoice INV-1042",
    policyId:
      "payments.strict.v1"
  });
}

describe(
  "Base Sepolia USDC executor preparation",
  () => {
    it(
      "encodes the exact destination and amount from the Action Contract",
      () => {
        const prepared =
          prepareBaseSepoliaUsdcTransfer(
            action()
          );

        const decoded =
          decodePreparedTransfer(
            prepared.data
          );

        expect(
          prepared.to.toLowerCase()
        ).toBe(
          BASE_SEPOLIA_USDC.toLowerCase()
        );
        expect(
          prepared.value
        ).toBe(0n);
        expect(
          decoded.destination.toLowerCase()
        ).toBe(
          VENDOR.toLowerCase()
        );
        expect(
          decoded.amountRaw
        ).toBe("1000000");
      }
    );

    it(
      "fails closed if chain semantics are mutated after Action creation",
      () => {
        const original =
          action();

        const mutated = {
          ...original,
          payload: {
            ...original.payload,
            chainId: 1
          }
        } as ActionContract;

        expect(() =>
          prepareBaseSepoliaUsdcTransfer(
            mutated
          )
        ).toThrow(
          "executor_action_chain_mismatch"
        );
      }
    );

    it(
      "fails closed if token semantics are mutated after Action creation",
      () => {
        const original =
          action();

        const mutated = {
          ...original,
          payload: {
            ...original.payload,
            token:
              "0x1111111111111111111111111111111111111111"
          }
        } as ActionContract;

        expect(() =>
          prepareBaseSepoliaUsdcTransfer(
            mutated
          )
        ).toThrow(
          "executor_action_asset_mismatch"
        );
      }
    );
  }
);
