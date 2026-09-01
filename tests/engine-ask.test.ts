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
import {
  buildTelegraphEngineAskBody
} from "../src/telegraph/engine-ask.js";
import {
  createPaymentVerificationPlan
} from "../src/telegraph/verification-planner.js";

const VENDOR =
  "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";

function plan() {
  const action =
    createActionContract({
      type:
        "payment",
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

  return createPaymentVerificationPlan(action);
}

describe(
  "Telegraph Engine AUTO_ROUTE request body",
  () => {
    it(
      "supplies exact caller context for routing and Miner input construction",
      () => {
        const verificationPlan =
          plan();

        const body =
          buildTelegraphEngineAskBody(
            verificationPlan
          );

        expect(body.query).toBe(
          verificationPlan.query
        );

        expect(body.context).toEqual({
          query:
            verificationPlan.query,
          address:
            verificationPlan.subject,
          wallet:
            verificationPlan.subject,
          chainId:
            verificationPlan.chainId
        });
      }
    );

    it(
      "does not collapse Base Sepolia into ambiguous Base mainnet context",
      () => {
        const body =
          buildTelegraphEngineAskBody(
            plan()
          );

        expect(body.context).not.toHaveProperty(
          "chain",
          "base"
        );

        expect(body.query).toContain(
          "Base Sepolia testnet"
        );
        expect(body.query).toContain(
          "Do not substitute Base mainnet"
        );
      }
    );
  }
);
