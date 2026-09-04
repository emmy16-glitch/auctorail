import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(
  root,
  "artifacts",
  "vendor",
  "ProofGateVendor.build.json"
);

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function requireFile(filePath, code) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${code}:${filePath}`);
  }
}

function requireHexBytecode(value, code) {
  if (
    typeof value !== "string" ||
    !/^0x[0-9a-fA-F]+$/.test(value) ||
    value.length % 2 !== 0
  ) {
    throw new Error(code);
  }
}

requireFile(manifestPath, "vendor_build_manifest_missing");

const manifestBytes = fs.readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));

if (manifest.schemaVersion !== "proofgate.vendor-build-manifest.v1") {
  throw new Error("vendor_build_manifest_schema_mismatch");
}

if (manifest.contractName !== "ProofGateVendor") {
  throw new Error("vendor_build_manifest_contract_mismatch");
}

const sourcePath = path.join(root, manifest.source?.path ?? "");
const artifactPath = path.join(root, manifest.artifact?.path ?? "");

requireFile(sourcePath, "vendor_source_missing");
requireFile(artifactPath, "vendor_artifact_missing");

const sourceBytes = fs.readFileSync(sourcePath);
const artifactBytes = fs.readFileSync(artifactPath);

const sourceDigest = sha256(sourceBytes);
if (sourceDigest !== manifest.source?.sha256) {
  throw new Error(
    `vendor_source_hash_mismatch:${sourceDigest}`
  );
}

const artifactDigest = sha256(artifactBytes);
if (artifactDigest !== manifest.artifact?.sha256) {
  throw new Error(
    `vendor_artifact_hash_mismatch:${artifactDigest}`
  );
}

const artifact = JSON.parse(artifactBytes.toString("utf8"));

if (artifact.contractName !== manifest.contractName) {
  throw new Error("vendor_artifact_contract_mismatch");
}

if (artifact.compiler !== manifest.compiler?.longVersion) {
  throw new Error("vendor_artifact_compiler_mismatch");
}

requireHexBytecode(
  artifact.bytecode,
  "vendor_creation_bytecode_invalid"
);
requireHexBytecode(
  artifact.deployedBytecode,
  "vendor_runtime_bytecode_invalid"
);

const creationBytes = Buffer.from(
  artifact.bytecode.slice(2),
  "hex"
);
const runtimeBytes = Buffer.from(
  artifact.deployedBytecode.slice(2),
  "hex"
);

if (
  creationBytes.length !==
  manifest.artifact?.creationBytecodeBytes
) {
  throw new Error("vendor_creation_bytecode_length_mismatch");
}

if (
  runtimeBytes.length !==
  manifest.artifact?.runtimeBytecodeBytes
) {
  throw new Error("vendor_runtime_bytecode_length_mismatch");
}

const creationDigest = sha256(creationBytes);
if (
  creationDigest !==
  manifest.artifact?.creationBytecodeSha256
) {
  throw new Error(
    `vendor_creation_bytecode_hash_mismatch:${creationDigest}`
  );
}

const runtimeDigest = sha256(runtimeBytes);
if (
  runtimeDigest !==
  manifest.artifact?.runtimeBytecodeSha256
) {
  throw new Error(
    `vendor_runtime_bytecode_hash_mismatch:${runtimeDigest}`
  );
}

console.log("");
console.log("ProofGateVendor tracked artifact verified.");
console.log("Source SHA-256:", sourceDigest);
console.log("Artifact SHA-256:", artifactDigest);
console.log("Compiler:", manifest.compiler.longVersion);
console.log("Canonical compiler platform:", manifest.compiler.platform);
console.log("Creation bytecode:", `${creationBytes.length} bytes`);
console.log("Runtime bytecode:", `${runtimeBytes.length} bytes`);
console.log("");
console.log(
  "This command verifies the committed source/artifact/manifest binding without executing solc."
);
console.log(
  "Canonical native recompilation remains enforced by CI on linux-x64."
);
