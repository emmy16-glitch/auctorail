import fs from "node:fs";

import {
  describe,
  expect,
  it
} from "vitest";
import {
  keccak256
} from "viem";

import {
  ATTESTED_VENDOR_PROFILE,
  buildExpectedVendorRuntimeCode,
  verifyVendorRuntimeAttestation,
  type VendorRuntimeAttestation
} from "../src/evidence/vendor-runtime.js";
import {
  canonicalize,
  hashCanonicalPayload
} from "../src/core/action-contract.js";

describe(
  "ProofGate vendor runtime attestation",
  () => {
    it(
      "reconstructs the exact pinned deployed runtime from the tracked compiled artifact",
      () => {
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

        expect(
          (
            runtime.length -
            2
          ) / 2
        ).toBe(
          ATTESTED_VENDOR_PROFILE
            .runtimeBytes
        );

        expect(
          keccak256(
            runtime
          )
        ).toBe(
          ATTESTED_VENDOR_PROFILE
            .runtimeKeccak256
        );
      }
    );

    it(
      "rejects a tampered attestation",
      () => {
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
            ATTESTED_VENDOR_PROFILE
              .chainId,
          address:
            ATTESTED_VENDOR_PROFILE
              .address.toLowerCase(),
          blockNumber:
            46260000,
          blockHash:
            "0x" +
            "1".repeat(64),
          runtimeCode:
            runtime.toLowerCase(),
          runtimeBytes:
            ATTESTED_VENDOR_PROFILE
              .runtimeBytes,
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
            "2026-09-01T22:50:00.000Z"
        };

        const attestation:
          VendorRuntimeAttestation =
          {
            ...body,
            attestationHash:
              hashCanonicalPayload(
                canonicalize(
                  body
                )
              )
          };

        expect(
          verifyVendorRuntimeAttestation(
            attestation
          )
        ).toBe(true);

        expect(
          verifyVendorRuntimeAttestation({
            ...attestation,
            runtimeBytes:
              164
          })
        ).toBe(false);
      }
    );
  }
);
