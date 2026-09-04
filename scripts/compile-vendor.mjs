import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const COMPILER_VERSION = "0.8.36";
const COMPILER_LONG_VERSION = "0.8.36+commit.8a079791";
const COMPILER_BINARY_NAME = `solc-linux-amd64-v${COMPILER_LONG_VERSION}`;
const COMPILER_URL = `https://binaries.soliditylang.org/linux-amd64/${COMPILER_BINARY_NAME}`;
const COMPILER_SHA256 = "c8d35afdddc3cd2743ee88b8f25e0fecd16e2bdd5f2120f37e52cd9cc45ae0e6";
const OPTIMIZER_RUNS = 200;
const CONTRACT_NAME = "ProofGateVendor";
const SOURCE_NAME = "ProofGateVendor.sol";

const root = process.cwd();
const sourcePath = path.join(root, "contracts", SOURCE_NAME);
const toolsDir = path.join(root, ".tools", "solc");
const compilerPath = path.join(toolsDir, COMPILER_BINARY_NAME);
const artifactPath = path.join(root, "artifacts", "vendor", `${CONTRACT_NAME}.json`);
const manifestPath = path.join(root, "artifacts", "vendor", `${CONTRACT_NAME}.build.json`);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function assertNativeCompilerPlatform() {
  if (process.platform === "linux" && process.arch === "x64") {
    return;
  }

  throw new Error(
    `pinned_native_solc_unsupported_platform:${process.platform}-${process.arch}; ` +
    `the canonical compiler is linux-amd64. Run "npm run vendor:verify" on this host; ` +
    `GitHub CI performs the reproducible native recompilation on linux-x64.`
  );
}

async function ensureCompiler() {
  ensureDirectory(toolsDir);
  if (fs.existsSync(compilerPath)) {
    const digest = sha256(fs.readFileSync(compilerPath));
    if (digest !== COMPILER_SHA256) {
      throw new Error(`pinned_solc_hash_mismatch:${digest}`);
    }
    fs.chmodSync(compilerPath, 0o755);
    return;
  }

  console.log(`Downloading pinned native solc ${COMPILER_LONG_VERSION}...`);
  const response = await fetch(COMPILER_URL);
  if (!response.ok || !response.body) {
    throw new Error(`solc_download_failed:http_${response.status}`);
  }

  const temporaryPath = path.join(toolsDir, `${COMPILER_BINARY_NAME}.${process.pid}.tmp`);
  const file = fs.createWriteStream(temporaryPath, { mode: 0o700 });
  try {
    for await (const chunk of response.body) {
      file.write(chunk);
    }
    file.end();
    await new Promise((resolve, reject) => {
      file.once("finish", resolve);
      file.once("error", reject);
    });
    const digest = sha256(fs.readFileSync(temporaryPath));
    if (digest !== COMPILER_SHA256) {
      throw new Error(`downloaded_solc_hash_mismatch:${digest}`);
    }
    fs.renameSync(temporaryPath, compilerPath);
    fs.chmodSync(compilerPath, 0o755);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}

function runCompiler(input) {
  const result = spawnSync(compilerPath, ["--standard-json"], {
    input: JSON.stringify(input),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`solc_failed:${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

const source = fs.readFileSync(sourcePath, "utf8");
const input = {
  language: "Solidity",
  sources: { [SOURCE_NAME]: { content: source } },
  settings: {
    optimizer: { enabled: true, runs: OPTIMIZER_RUNS },
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] }
    }
  }
};

assertNativeCompilerPlatform();
await ensureCompiler();
const output = runCompiler(input);
for (const error of output.errors ?? []) console.log(error.formattedMessage);
if ((output.errors ?? []).some((error) => error.severity === "error")) {
  process.exit(1);
}

const contract = output.contracts?.[SOURCE_NAME]?.[CONTRACT_NAME];
if (!contract?.evm?.bytecode?.object || !contract?.evm?.deployedBytecode?.object) {
  throw new Error("compiled_vendor_artifact_missing");
}

const artifact = {
  contractName: CONTRACT_NAME,
  compiler: COMPILER_LONG_VERSION,
  abi: contract.abi,
  bytecode: `0x${contract.evm.bytecode.object}`,
  deployedBytecode: `0x${contract.evm.deployedBytecode.object}`
};

ensureDirectory(path.dirname(artifactPath));
fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });

const manifest = {
  schemaVersion: "proofgate.vendor-build-manifest.v1",
  contractName: CONTRACT_NAME,
  source: {
    path: `contracts/${SOURCE_NAME}`,
    sha256: sha256(source)
  },
  compiler: {
    version: COMPILER_VERSION,
    longVersion: COMPILER_LONG_VERSION,
    platform: "linux-amd64",
    binary: COMPILER_BINARY_NAME,
    url: COMPILER_URL,
    sha256: COMPILER_SHA256
  },
  settings: {
    optimizer: { enabled: true, runs: OPTIMIZER_RUNS },
    outputSelection: input.settings.outputSelection
  },
  artifact: {
    path: `artifacts/vendor/${CONTRACT_NAME}.json`,
    sha256: sha256(fs.readFileSync(artifactPath)),
    creationBytecodeBytes: artifact.bytecode.length / 2 - 1,
    creationBytecodeSha256: sha256(Buffer.from(artifact.bytecode.slice(2), "hex")),
    runtimeBytecodeBytes: artifact.deployedBytecode.length / 2 - 1,
    runtimeBytecodeSha256: sha256(Buffer.from(artifact.deployedBytecode.slice(2), "hex"))
  }
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log("");
console.log(`${CONTRACT_NAME} compiled with pinned native solc.`);
console.log(`Compiler: ${COMPILER_LONG_VERSION}`);
console.log(`Deployment bytecode: ${manifest.artifact.creationBytecodeBytes} bytes`);
console.log(`Runtime bytecode: ${manifest.artifact.runtimeBytecodeBytes} bytes`);
console.log(`Build manifest: ${manifestPath}`);
