import fs from "node:fs";

import {
  describe,
  expect,
  it
} from "vitest";

import {
  BASE_SEPOLIA_USDC,
  canonicalize,
  createActionContract,
  hashCanonicalPayload
} from "../src/core/action-contract.js";
import {
  createMandateContract
} from "../src/core/mandate-contract.js";
import type {
  TelegraphEvidenceRecord
} from "../src/evidence/telegraph.js";
import {
  ATTESTED_VENDOR_PROFILE,
  buildExpectedVendorRuntimeCode,
  type VendorRuntimeAttestation
} from "../src/evidence/vendor-runtime.js";
import {
  evaluatePaymentsAttestedVendorV1
} from "../src/policy/payments-attested-vendor-v1.js";
import {
  evaluatePaymentsStrictV1
} from "../src/policy/payments-strict-v1.js";

const AGENT =
  "procurement-agent";

function setup() {
  const mandate =
    createMandateContract({
      mandateId:
        "treasury-demo-attested-v1",
      principalId:
        "company-demo",
      agentId:
        AGENT,
      allowedActionTypes:
        ["payment"],
      allowedChainIds:
        [84532],
      allowedAssets:
        [BASE_SEPOLIA_USDC],
      allowedDestinations:
        [
          ATTESTED_VENDOR_PROFILE
            .address
        ],
      maxPerActionRaw:
        "10000000",
      requiredIntents:
        ["FRAUD_DETECTION"],
      policyId:
        "payments.attested-vendor.v1",
      issuedAt:
        "2026-09-01T00:00:00.000Z",
      expiresAt:
        "2026-09-08T01:00:00.000Z",
      version:
        1
    });

  const action =
    createActionContract({
      type:
        "payment",
      chainId:
        84532,
      token:
        BASE_SEPOLIA_USDC,
      amountRaw:
        "1000000",
      destination:
        ATTESTED_VENDOR_PROFILE
          .address,
      reason:
        "Invoice INV-1042",
      policyId:
        "payments.attested-vendor.v1"
    });

  return {
    mandate,
    action
  };
}

function evidence(
  confidence:
    number,
  label:
    string =
      "ALLOW"
): TelegraphEvidenceRecord {
  return {
    source:
      "telegraph",
    intent:
      "FRAUD_DETECTION",
    miner: {
      id:
        "95822412",
      name:
        "Refut On-Chain Risk",
      slug:
        "refut-onchain-risk"
    },
    subject:
      ATTESTED_VENDOR_PROFILE
        .address
        .toLowerCase(),
    chainId:
      84532,
    label,
    confidence,
    reason:
      "Contract-control assessment.",
    applicability:
      "APPLICABLE",
    signalHash:
      "0x" +
      "a".repeat(64),
    costUsd:
      0.01,
    durationMs:
      25,
    rawResponseHash:
      "0x" +
      "b".repeat(64),
    receivedAt:
      "2026-09-01T22:50:00.000Z",
    rawResponse:
      {}
  };
}

function attestation():
  VendorRuntimeAttestation {
  const artifact =
    JSON.parse(
      fs.readFileSync(
        "artifacts/vendor/ProofGateVendor.json",
        "utf8"
      )
    ) as {
      deployedBytecode:
        string;
    };

  const runtime =
    buildExpectedVendorRuntimeCode(
      artifact.deployedBytecode,
      ATTESTED_VENDOR_PROFILE
        .vendorId
    );

  const body = {
    schemaVersion:
      "proofgate.vendor-runtime-attestation.v1" as const,
    source:
      "base_sepolia_rpc" as const,
    chainId:
      84532,
    address:
      ATTESTED_VENDOR_PROFILE
        .address
        .toLowerCase(),
    blockNumber:
      46260000,
    blockHash:
      "0x" +
      "1".repeat(64),
    runtimeCode:
      runtime.toLowerCase(),
    runtimeBytes:
      165,
    runtimeKeccak256:
      ATTESTED_VENDOR_PROFILE
        .runtimeKeccak256,
    expectedRuntimeKeccak256:
      ATTESTED_VENDOR_PROFILE
        .runtimeKeccak256,
    vendorId:
      ATTESTED_VENDOR_PROFILE
        .vendorId,
    version:
      1,
    compiler:
      ATTESTED_VENDOR_PROFILE
        .compiler,
    exactCompiledRuntimeMatch:
      true,
    capturedAt:
      "2026-09-01T22:50:10.000Z"
  };

  return {
    ...body,
    attestationHash:
      hashCanonicalPayload(
        canonicalize(
          body
        )
      )
  };
}

describe(
  "payments.attested-vendor.v1",
  () => {
    it(
      "allows 0.70 corroborative Telegraph confidence only with exact fresh runtime attestation",
      () => {
        const {
          mandate,
          action
        } =
          setup();

        const decision =
          evaluatePaymentsAttestedVendorV1(
            mandate,
            action,
            evidence(
              0.70
            ),
            attestation(),
            {
              agentId:
                AGENT,
              now:
                new Date(
                  "2026-09-01T22:50:20.000Z"
                )
            }
          );

        expect(
          decision.decision
        ).toBe(
          "ALLOW"
        );

        expect(
          decision.evidenceRefs
            ?.vendorRuntimeAttestationHash
        ).toBeTruthy();

        expect(
          decision.checks.every(
            (item) =>
              item.status ===
              "PASS"
          )
        ).toBe(true);
      }
    );

    it(
      "holds below the composite corroboration floor",
      () => {
        const {
          mandate,
          action
        } =
          setup();

        const decision =
          evaluatePaymentsAttestedVendorV1(
            mandate,
            action,
            evidence(
              0.69
            ),
            attestation(),
            {
              agentId:
                AGENT,
              now:
                new Date(
                  "2026-09-01T22:50:20.000Z"
                )
            }
          );

        expect(
          decision.decision
        ).toBe(
          "HOLD"
        );
        expect(
          decision.reason
        ).toBe(
          "corroborative_confidence"
        );
      }
    );

    it(
      "blocks tampered runtime evidence even when Telegraph says ALLOW",
      () => {
        const {
          mandate,
          action
        } =
          setup();

        const bad = {
          ...attestation(),
          runtimeBytes:
            164
        };

        const decision =
          evaluatePaymentsAttestedVendorV1(
            mandate,
            action,
            evidence(
              0.95
            ),
            bad,
            {
              agentId:
                AGENT,
              now:
                new Date(
                  "2026-09-01T22:50:20.000Z"
                )
            }
          );

        expect(
          decision.decision
        ).toBe(
          "BLOCK"
        );
        expect(
          decision.reason
        ).toBe(
          "vendor_runtime_attestation"
        );
      }
    );

    it(
      "never lets deterministic attestation override a negative Miner result",
      () => {
        const {
          mandate,
          action
        } =
          setup();

        const decision =
          evaluatePaymentsAttestedVendorV1(
            mandate,
            action,
            evidence(
              0.95,
              "BLOCK"
            ),
            attestation(),
            {
              agentId:
                AGENT,
              now:
                new Date(
                  "2026-09-01T22:50:20.000Z"
                )
            }
          );

        expect(
          decision.decision
        ).toBe(
          "BLOCK"
        );
        expect(
          decision.reason
        ).toBe(
          "miner_result"
        );
      }
    );

    it(
      "leaves payments.strict.v1 unchanged at a 0.80 minimum",
      () => {
        const strictMandate =
          createMandateContract({
            mandateId:
              "strict",
            principalId:
              "company-demo",
            agentId:
              AGENT,
            allowedActionTypes:
              ["payment"],
            allowedChainIds:
              [84532],
            allowedAssets:
              [
                BASE_SEPOLIA_USDC
              ],
            allowedDestinations:
              [
                ATTESTED_VENDOR_PROFILE
                  .address
              ],
            maxPerActionRaw:
              "10000000",
            requiredIntents:
              [
                "FRAUD_DETECTION"
              ],
            policyId:
              "payments.strict.v1",
    policyVersion: 1,
            issuedAt:
              "2026-09-01T00:00:00.000Z",
            expiresAt:
              "2026-09-08T01:00:00.000Z",
            version:
              1
          });

        const strictAction =
          createActionContract({
            type:
              "payment",
            chainId:
              84532,
            token:
              BASE_SEPOLIA_USDC,
            amountRaw:
              "1000000",
            destination:
              ATTESTED_VENDOR_PROFILE
                .address,
            reason:
              "Invoice INV-1042",
            policyId:
              "payments.strict.v1"
          });

        expect(
          evaluatePaymentsStrictV1(
            strictMandate,
            strictAction,
            evidence(
              0.70
            ),
            {
              agentId:
                AGENT,
              now:
                new Date(
                  "2026-09-01T22:50:20.000Z"
                )
            }
          ).decision
        ).toBe(
          "HOLD"
        );
      }
    );
  }
);
