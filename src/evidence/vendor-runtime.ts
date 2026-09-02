import fs from "node:fs";
import path from "node:path";

import {
  decodeFunctionResult,
  encodeFunctionData,
  keccak256,
  parseAbi,
  type Hex
} from "viem";

import {
  BASE_SEPOLIA_CHAIN_ID,
  canonicalize,
  hashCanonicalPayload
} from "../core/action-contract.js";

export const ATTESTED_VENDOR_PROFILE = {
  address:
    "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
  chainId:
    BASE_SEPOLIA_CHAIN_ID,
  vendorId:
    "0x8842933eec069a2d7afcf59fe7d749634a38a6870c61ebe5b8d8b0dab5512911",
  version:
    1,
  runtimeBytes:
    165,
  runtimeKeccak256:
    "0x12c20655de1ed03a8e646cb98f8ce51e033ec28dc38b7c9383b8f96d02d07a93",
  compiler:
    "0.8.36+commit.8a079791",
  maxAgeSeconds:
    60
} as const;

export interface VendorRuntimeAttestationBody {
  schemaVersion:
    "proofgate.vendor-runtime-attestation.v1";
  source:
    "base_sepolia_rpc";
  chainId:
    number;
  address:
    string;
  blockNumber:
    number;
  blockHash:
    string;
  runtimeCode:
    string;
  runtimeBytes:
    number;
  runtimeKeccak256:
    string;
  expectedRuntimeKeccak256:
    string;
  vendorId:
    string;
  version:
    number;
  compiler:
    string;
  exactCompiledRuntimeMatch:
    boolean;
  capturedAt:
    string;
}

export interface VendorRuntimeAttestation
  extends VendorRuntimeAttestationBody {
  attestationHash:
    string;
}

export interface SupplementalEvidenceRef {
  type:
    "vendor_runtime_attestation";
  hash:
    string;
  source:
    "base_sepolia_rpc";
  chainId:
    number;
  address:
    string;
  blockNumber:
    number;
  blockHash:
    string;
  runtimeKeccak256:
    string;
  capturedAt:
    string;
}

interface DeploymentFile {
  address:
    string;
  chainId:
    number;
  vendorId:
    string;
  runtimeCodeBytes:
    number;
}

interface ArtifactFile {
  contractName:
    string;
  compiler:
    string;
  deployedBytecode:
    string;
}

const abi = parseAbi([
  "function vendorId() view returns (bytes32)",
  "function proofGateVendorVersion() view returns (uint256)"
]);

function addressesEqual(
  a: string,
  b: string
): boolean {
  return (
    /^0x[0-9a-fA-F]{40}$/.test(a) &&
    /^0x[0-9a-fA-F]{40}$/.test(b) &&
    a.toLowerCase() === b.toLowerCase()
  );
}

function readProfileFiles(): {
  deployment: DeploymentFile;
  artifact: ArtifactFile;
} {
  const deployment =
    JSON.parse(
      fs.readFileSync(
        path.join(
          "data",
          "deployments",
          "base-sepolia-vendor.json"
        ),
        "utf8"
      )
    ) as DeploymentFile;

  const artifact =
    JSON.parse(
      fs.readFileSync(
        path.join(
          "artifacts",
          "vendor",
          "ProofGateVendor.json"
        ),
        "utf8"
      )
    ) as ArtifactFile;

  if (
    !addressesEqual(
      deployment.address,
      ATTESTED_VENDOR_PROFILE.address
    ) ||
    deployment.chainId !==
      ATTESTED_VENDOR_PROFILE.chainId ||
    deployment.vendorId.toLowerCase() !==
      ATTESTED_VENDOR_PROFILE.vendorId.toLowerCase() ||
    deployment.runtimeCodeBytes !==
      ATTESTED_VENDOR_PROFILE.runtimeBytes ||
    artifact.compiler !==
      ATTESTED_VENDOR_PROFILE.compiler
  ) {
    throw new Error(
      "tracked_vendor_profile_mismatch"
    );
  }

  return {
    deployment,
    artifact
  };
}

export function buildExpectedVendorRuntimeCode(
  deployedBytecode: string,
  vendorId: string
): Hex {
  if (
    !/^0x[0-9a-fA-F]+$/.test(
      deployedBytecode
    )
  ) {
    throw new Error(
      "compiled_deployed_bytecode_invalid"
    );
  }

  if (
    !/^0x[0-9a-fA-F]{64}$/.test(
      vendorId
    )
  ) {
    throw new Error(
      "vendor_id_invalid"
    );
  }

  const template =
    deployedBytecode
      .slice(2)
      .toLowerCase();

  const immutable =
    vendorId
      .slice(2)
      .toLowerCase();

  const zeroWord =
    "0".repeat(64);

  const candidates: Hex[] = [];

  for (
    let offset =
      template.indexOf(zeroWord);
    offset !== -1;
    offset =
      template.indexOf(
        zeroWord,
        offset + 2
      )
  ) {
    if (offset % 2 !== 0) {
      continue;
    }

    candidates.push(
      (
        "0x" +
        template.slice(0, offset) +
        immutable +
        template.slice(
          offset +
          zeroWord.length
        )
      ) as Hex
    );
  }

  const profileMatches =
    candidates.filter(
      (candidate) =>
        keccak256(candidate)
          .toLowerCase() ===
        ATTESTED_VENDOR_PROFILE
          .runtimeKeccak256
          .toLowerCase()
    );

  if (
    profileMatches.length !== 1
  ) {
    throw new Error(
      "compiled_runtime_profile_match_not_unique"
    );
  }

  return profileMatches[0];
}

async function rpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[] = []
): Promise<unknown> {
  const response =
    await fetch(
      rpcUrl,
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json"
        },
        body:
          JSON.stringify({
            jsonrpc:
              "2.0",
            id:
              1,
            method,
            params
          })
      }
    );

  if (!response.ok) {
    throw new Error(
      `${method}:http_${response.status}`
    );
  }

  const body =
    await response.json() as {
      result?: unknown;
      error?: unknown;
    };

  if (body.error) {
    throw new Error(
      `${method}:${JSON.stringify(body.error)}`
    );
  }

  return body.result;
}

function requireHex(
  value: unknown,
  name: string
): Hex {
  if (
    typeof value !== "string" ||
    !/^0x[0-9a-fA-F]+$/.test(value)
  ) {
    throw new Error(
      `${name}_invalid`
    );
  }

  return value as Hex;
}

export async function acquireVendorRuntimeAttestation(
  rpcUrl:
    string =
      process.env
        .BASE_SEPOLIA_RPC_URL ||
      "https://sepolia-preconf.base.org"
): Promise<VendorRuntimeAttestation> {
  const {
    deployment,
    artifact
  } =
    readProfileFiles();

  const chainHex =
    requireHex(
      await rpcCall(
        rpcUrl,
        "eth_chainId"
      ),
      "chain_id"
    );

  const chainId =
    Number(
      BigInt(chainHex)
    );

  if (
    chainId !==
    ATTESTED_VENDOR_PROFILE.chainId
  ) {
    throw new Error(
      "vendor_attestation_chain_mismatch"
    );
  }

  const blockNumberHex =
    requireHex(
      await rpcCall(
        rpcUrl,
        "eth_blockNumber"
      ),
      "block_number"
    );

  const blockNumber =
    Number(
      BigInt(
        blockNumberHex
      )
    );

  const block =
    await rpcCall(
      rpcUrl,
      "eth_getBlockByNumber",
      [
        blockNumberHex,
        false
      ]
    ) as {
      hash?: unknown;
    } | null;

  if (
    !block ||
    typeof block.hash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(
      block.hash
    )
  ) {
    throw new Error(
      "block_hash_missing"
    );
  }

  const runtimeCode =
    requireHex(
      await rpcCall(
        rpcUrl,
        "eth_getCode",
        [
          deployment.address,
          blockNumberHex
        ]
      ),
      "runtime_code"
    );

  if (
    runtimeCode === "0x"
  ) {
    throw new Error(
      "runtime_code_missing"
    );
  }

  const vendorResult =
    requireHex(
      await rpcCall(
        rpcUrl,
        "eth_call",
        [
          {
            to:
              deployment.address,
            data:
              encodeFunctionData({
                abi,
                functionName:
                  "vendorId"
              })
          },
          blockNumberHex
        ]
      ),
      "vendor_id_result"
    );

  const versionResult =
    requireHex(
      await rpcCall(
        rpcUrl,
        "eth_call",
        [
          {
            to:
              deployment.address,
            data:
              encodeFunctionData({
                abi,
                functionName:
                  "proofGateVendorVersion"
              })
          },
          blockNumberHex
        ]
      ),
      "vendor_version_result"
    );

  const vendorId =
    decodeFunctionResult({
      abi,
      functionName:
        "vendorId",
      data:
        vendorResult
    });

  const version =
    decodeFunctionResult({
      abi,
      functionName:
        "proofGateVendorVersion",
      data:
        versionResult
    });

  const expectedRuntime =
    buildExpectedVendorRuntimeCode(
      artifact.deployedBytecode,
      deployment.vendorId
    );

  const runtimeKeccak256 =
    keccak256(
      runtimeCode
    );

  const body:
    VendorRuntimeAttestationBody =
    {
      schemaVersion:
        "proofgate.vendor-runtime-attestation.v1",
      source:
        "base_sepolia_rpc",
      chainId,
      address:
        deployment.address
          .toLowerCase(),
      blockNumber,
      blockHash:
        block.hash
          .toLowerCase(),
      runtimeCode:
        runtimeCode
          .toLowerCase(),
      runtimeBytes:
        (
          runtimeCode.length -
          2
        ) / 2,
      runtimeKeccak256,
      expectedRuntimeKeccak256:
        keccak256(
          expectedRuntime
        ),
      vendorId:
        String(
          vendorId
        ).toLowerCase(),
      version:
        Number(version),
      compiler:
        artifact.compiler,
      exactCompiledRuntimeMatch:
        runtimeCode.toLowerCase() ===
        expectedRuntime.toLowerCase(),
      capturedAt:
        new Date()
          .toISOString()
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

export function verifyVendorRuntimeAttestation(
  attestation:
    VendorRuntimeAttestation
): boolean {
  try {
    const {
      attestationHash,
      ...body
    } =
      attestation;

    if (
      hashCanonicalPayload(
        canonicalize(
          body
        )
      ) !==
      attestationHash
    ) {
      return false;
    }

    const {
      deployment,
      artifact
    } =
      readProfileFiles();

    if (
      body.schemaVersion !==
        "proofgate.vendor-runtime-attestation.v1" ||
      body.source !==
        "base_sepolia_rpc" ||
      body.chainId !==
        ATTESTED_VENDOR_PROFILE.chainId ||
      !addressesEqual(
        body.address,
        ATTESTED_VENDOR_PROFILE.address
      ) ||
      body.vendorId
        .toLowerCase() !==
        ATTESTED_VENDOR_PROFILE.vendorId
          .toLowerCase() ||
      body.version !==
        ATTESTED_VENDOR_PROFILE.version ||
      body.runtimeBytes !==
        ATTESTED_VENDOR_PROFILE.runtimeBytes ||
      body.runtimeKeccak256
        .toLowerCase() !==
        ATTESTED_VENDOR_PROFILE.runtimeKeccak256
          .toLowerCase() ||
      body.expectedRuntimeKeccak256
        .toLowerCase() !==
        ATTESTED_VENDOR_PROFILE.runtimeKeccak256
          .toLowerCase() ||
      body.compiler !==
        ATTESTED_VENDOR_PROFILE.compiler ||
      body.exactCompiledRuntimeMatch !==
        true ||
      !Number.isInteger(
        body.blockNumber
      ) ||
      body.blockNumber <= 0 ||
      !/^0x[0-9a-fA-F]{64}$/.test(
        body.blockHash
      ) ||
      !/^0x[0-9a-fA-F]+$/.test(
        body.runtimeCode
      )
    ) {
      return false;
    }

    if (
      keccak256(
        body.runtimeCode as Hex
      )
        .toLowerCase() !==
      body.runtimeKeccak256
        .toLowerCase()
    ) {
      return false;
    }

    const expectedRuntime =
      buildExpectedVendorRuntimeCode(
        artifact.deployedBytecode,
        deployment.vendorId
      );

    return (
      body.runtimeCode
        .toLowerCase() ===
      expectedRuntime
        .toLowerCase()
    );
  } catch {
    return false;
  }
}

export function supplementalRefFromVendorAttestation(
  attestation:
    VendorRuntimeAttestation
): SupplementalEvidenceRef {
  return {
    type:
      "vendor_runtime_attestation",
    hash:
      attestation
        .attestationHash,
    source:
      attestation.source,
    chainId:
      attestation.chainId,
    address:
      attestation.address,
    blockNumber:
      attestation.blockNumber,
    blockHash:
      attestation.blockHash,
    runtimeKeccak256:
      attestation
        .runtimeKeccak256,
    capturedAt:
      attestation.capturedAt
  };
}

export function saveVendorRuntimeAttestation(
  attestation:
    VendorRuntimeAttestation
): string {
  const directory =
    path.join(
      "data",
      "evidence",
      "vendor-attestations"
    );

  fs.mkdirSync(
    directory,
    {
      recursive:
        true
    }
  );

  const file =
    path.join(
      directory,
      `vendor-runtime-${attestation.capturedAt.replace(/[:.]/g, "-")}.json`
    );

  fs.writeFileSync(
    file,
    JSON.stringify(
      attestation,
      null,
      2
    ),
    {
      mode:
        0o600
    }
  );

  return file;
}
