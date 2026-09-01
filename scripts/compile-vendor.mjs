import fs from "node:fs";
import solc from "solc";

const source =
  fs.readFileSync(
    "contracts/ProofGateVendor.sol",
    "utf8"
  );

const input = {
  language: "Solidity",

  sources: {
    "ProofGateVendor.sol": {
      content: source
    }
  },

  settings: {
    optimizer: {
      enabled: true,
      runs: 200
    },

    outputSelection: {
      "*": {
        "*": [
          "abi",
          "evm.bytecode.object",
          "evm.deployedBytecode.object"
        ]
      }
    }
  }
};

const output =
  JSON.parse(
    solc.compile(
      JSON.stringify(input)
    )
  );

const errors =
  output.errors ?? [];

for (const error of errors) {
  console.log(
    error.formattedMessage
  );
}

const fatal =
  errors.some(
    (error) =>
      error.severity === "error"
  );

if (fatal) {
  process.exit(1);
}

const contract =
  output.contracts[
    "ProofGateVendor.sol"
  ][
    "ProofGateVendor"
  ];

const artifact = {
  contractName:
    "ProofGateVendor",

  compiler:
    solc.version(),

  abi:
    contract.abi,

  bytecode:
    "0x" +
    contract.evm
      .bytecode
      .object,

  deployedBytecode:
    "0x" +
    contract.evm
      .deployedBytecode
      .object
};

fs.mkdirSync(
  "artifacts/vendor",
  {
    recursive: true
  }
);

fs.writeFileSync(
  "artifacts/vendor/ProofGateVendor.json",
  JSON.stringify(
    artifact,
    null,
    2
  )
);

console.log("");
console.log(
  "ProofGateVendor compiled."
);

console.log(
  "Compiler:",
  artifact.compiler
);

console.log(
  "Deployment bytecode:",
  artifact.bytecode.length / 2 - 1,
  "bytes"
);

console.log(
  "Runtime bytecode:",
  artifact.deployedBytecode.length / 2 - 1,
  "bytes"
);

console.log("");
