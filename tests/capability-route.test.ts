import {
  describe,
  expect,
  it
} from "vitest";

import {
  CONTRACT_CONTROL_MINER_SLUG,
  CONTRACT_CONTROL_SELECTION_POLICY,
  selectContractControlMiner
} from "../src/telegraph/capability-route.js";
import type {
  TelegraphMinerRecord
} from "../src/telegraph/routed-evidence.js";

const refut: TelegraphMinerRecord = {
  id: "95822412",
  name: "Refut On-Chain Risk",
  slug: "refut-onchain-risk",
  activation_status: "active",
  supported_intents: [
    "FRAUD_DETECTION"
  ],
  output_schema: {
    properties: {
      confidence: {
        type: "number"
      },
      reasoning: {
        type: "string"
      },
      verdict: {
        type: "string"
      }
    }
  },
  signal_mapping: {
    confidence_field:
      "confidence",
    label_field:
      "verdict",
    reason_field:
      "reasoning"
  }
};

describe(
  "ProofGate capability-selected Telegraph routing",
  () => {
    it(
      "selects the locked active contract-control Miner deterministically",
      () => {
        const selection =
          selectContractControlMiner([
            {
              id: "302",
              name: "ChainSight",
              slug: "chainsight-oracle",
              activation_status:
                "active",
              supported_intents: [
                "FRAUD_DETECTION"
              ]
            },
            refut
          ]);

        expect(selection).toMatchObject({
          selected: true,
          policyId:
            CONTRACT_CONTROL_SELECTION_POLICY,
          miner: {
            slug:
              CONTRACT_CONTROL_MINER_SLUG
          }
        });
      }
    );

    it(
      "fails closed when the required capability Miner is unavailable",
      () => {
        const selection =
          selectContractControlMiner([
            {
              ...refut,
              activation_status:
                "inactive"
            }
          ]);

        expect(selection).toEqual({
          selected: false,
          policyId:
            CONTRACT_CONTROL_SELECTION_POLICY,
          code:
            "capability_miner_unavailable",
          reason:
            "No active Telegraph Miner satisfies ProofGate's locked v1 contract-control evidence profile."
        });
      }
    );

    it(
      "does not substitute a different FRAUD_DETECTION Miner merely because it is active",
      () => {
        const selection =
          selectContractControlMiner([
            {
              id: "302",
              name: "ChainSight",
              slug: "chainsight-oracle",
              activation_status:
                "active",
              supported_intents: [
                "FRAUD_DETECTION"
              ]
            }
          ]);

        expect(selection).toMatchObject({
          selected: false,
          code:
            "capability_miner_unavailable"
        });
      }
    );
  }
);
