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
  createMandateContract
} from "../src/core/mandate-contract.js";
import {
  validateLiveExecutionEvidenceEnvelope
} from "../src/gateway/live-evidence-guard.js";
import {
  CONTRACT_CONTROL_SELECTION_POLICY
} from "../src/telegraph/capability-route.js";

const VENDOR =
  "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";

function setup() {
  const mandate =
    createMandateContract({
      mandateId:
        "treasury-demo-v1",
      principalId:
        "company-demo",
      agentId:
        "procurement-agent",
      allowedActionTypes:
        ["payment"],
      allowedChainIds:
        [BASE_SEPOLIA_CHAIN_ID],
      allowedAssets:
        [BASE_SEPOLIA_USDC],
      allowedDestinations:
        [VENDOR],
      maxPerActionRaw:
        "10000000",
      requiredIntents:
        ["FRAUD_DETECTION"],
      policyId:
        "payments.strict.v1",
      issuedAt:
        "2026-09-01T00:00:00.000Z",
      expiresAt:
        "2026-09-08T01:00:00.000Z",
      version: 1
    });

  const action =
    createActionContract({
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

  const raw = {
    schemaVersion:
      "proofgate.telegraph-evidence.v1",
    source: "telegraph",
    intent: "FRAUD_DETECTION",
    request: {
      routeMode: "AUTO_ROUTE",
      actionHash:
        action.actionHash,
      mandateHash:
        mandate.mandateHash,
      target:
        action.payload.destination,
      chainId:
        action.payload.chainId
    },
    payment: {
      network:
        "eip155:84532",
      asset:
        BASE_SEPOLIA_USDC,
      amountRaw:
        "10000",
      payTo:
        "0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8",
      settlement: {
        success: true,
        code:
          "payment_settled",
        retryable: false,
        transaction:
          "0x" + "a".repeat(64),
        errorReason: null
      }
    }
  };

  return {
    mandate,
    action,
    raw
  };
}

describe(
  "live execution evidence guard",
  () => {
    it(
      "accepts exact AUTO_ROUTE evidence with proven x402 settlement",
      () => {
        const {
          mandate,
          action,
          raw
        } = setup();

        expect(
          validateLiveExecutionEvidenceEnvelope(
            raw,
            mandate,
            action
          )
        ).toEqual({
          valid: true,
          code:
            "live_evidence_valid"
        });
      }
    );

    it(
      "rejects direct Miner diagnostic evidence",
      () => {
        const {
          mandate,
          action,
          raw
        } = setup();

        raw.request.routeMode =
          "DIRECT_REFUT_DIAGNOSTIC";

        const result =
          validateLiveExecutionEvidenceEnvelope(
            raw,
            mandate,
            action
          );

        expect(result).toMatchObject({
          valid: false,
          code:
            "live_evidence_route_unapproved"
        });
      }
    );

    it(
      "accepts exact capability-selected Refut evidence with proven x402 settlement",
      () => {
        const {
          mandate,
          action,
          raw
        } = setup();

        const capabilityRaw = {
          ...raw,
          miner: {
            id: "95822412",
            name: "Refut On-Chain Risk",
            slug: "refut-onchain-risk"
          },
          request: {
            ...raw.request,
            routeMode:
              "CAPABILITY_ROUTE",
            endpoint:
              "/assess",
            selectionPolicy:
              CONTRACT_CONTROL_SELECTION_POLICY
          }
        };

        expect(
          validateLiveExecutionEvidenceEnvelope(
            capabilityRaw,
            mandate,
            action
          )
        ).toEqual({
          valid: true,
          code:
            "live_evidence_valid"
        });
      }
    );

    it(
      "rejects forged capability-route provenance",
      () => {
        const {
          mandate,
          action,
          raw
        } = setup();

        const forged = {
          ...raw,
          miner: {
            id: "302",
            name: "ChainSight",
            slug: "chainsight-oracle"
          },
          request: {
            ...raw.request,
            routeMode:
              "CAPABILITY_ROUTE",
            endpoint:
              "/assess",
            selectionPolicy:
              CONTRACT_CONTROL_SELECTION_POLICY
          }
        };

        expect(
          validateLiveExecutionEvidenceEnvelope(
            forged,
            mandate,
            action
          )
        ).toMatchObject({
          valid: false,
          code:
            "live_evidence_capability_route_invalid"
        });
      }
    );

    it(
      "rejects evidence for a different actionHash",
      () => {
        const {
          mandate,
          action,
          raw
        } = setup();

        raw.request.actionHash =
          "0x" + "b".repeat(64);

        const result =
          validateLiveExecutionEvidenceEnvelope(
            raw,
            mandate,
            action
          );

        expect(result).toMatchObject({
          valid: false,
          code:
            "live_evidence_action_hash_mismatch"
        });
      }
    );

    it(
      "rejects unproven x402 settlement",
      () => {
        const {
          mandate,
          action,
          raw
        } = setup();

        raw.payment.settlement.success =
          false;

        const result =
          validateLiveExecutionEvidenceEnvelope(
            raw,
            mandate,
            action
          );

        expect(result).toMatchObject({
          valid: false,
          code:
            "live_evidence_settlement_unproven"
        });
      }
    );

    it(
      "rejects proof cost above standing policy",
      () => {
        const {
          mandate,
          action,
          raw
        } = setup();

        raw.payment.amountRaw =
          "10001";

        const result =
          validateLiveExecutionEvidenceEnvelope(
            raw,
            mandate,
            action
          );

        expect(result).toMatchObject({
          valid: false,
          code:
            "live_evidence_payment_amount_exceeds_policy"
        });
      }
    );
  }
);
