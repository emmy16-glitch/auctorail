import "dotenv/config";
import fs from "node:fs";
import { ethers } from "ethers";

const OLD_KEY =
  process.env.TELEGRAPH_EVM_PRIVATE_KEY;

if (!OLD_KEY) {
  throw new Error("Old wallet key missing from .env");
}

const recoveryFile =
  ".proofgate/new-wallet-recovery.env";

if (!fs.existsSync(recoveryFile)) {
  throw new Error("Recovery file missing");
}

const recoveryText =
  fs.readFileSync(
    recoveryFile,
    "utf8"
  );

const match =
  recoveryText.match(
    /^TELEGRAPH_EVM_PRIVATE_KEY=(0x[0-9a-fA-F]+)$/m
  );

if (!match) {
  throw new Error(
    "Could not read recovery wallet"
  );
}

const NEW_KEY = match[1];

const provider =
  new ethers.JsonRpcProvider(
    "https://sepolia-preconf.base.org",
    {
      name: "base-sepolia",
      chainId: 84532
    },
    {
      staticNetwork: true
    }
  );

const oldWallet =
  new ethers.Wallet(
    OLD_KEY,
    provider
  );

const newWallet =
  new ethers.Wallet(
    NEW_KEY
  );

console.log("");
console.log("FINISHING WALLET ROTATION");
console.log("=========================");
console.log(
  "Old:",
  oldWallet.address
);
console.log(
  "New:",
  newWallet.address
);

const oldBalance =
  await provider.getBalance(
    oldWallet.address
  );

console.log(
  "Old ETH:",
  ethers.formatEther(
    oldBalance
  )
);

// Move 0.024 ETH.
// Leave roughly 0.001 test ETH behind
// so gas estimation cannot accidentally
// consume the transfer amount.
const amount =
  ethers.parseEther("0.024");

if (oldBalance <= amount) {
  throw new Error(
    "Old wallet balance is too low"
  );
}

const nonce =
  await provider.getTransactionCount(
    oldWallet.address,
    "latest"
  );

const fee =
  await provider.getFeeData();

console.log(
  "Using nonce:",
  nonce
);

console.log(
  "Sending:",
  ethers.formatEther(amount),
  "ETH"
);

const tx =
  await oldWallet.sendTransaction({
    to: newWallet.address,
    value: amount,
    nonce,
    gasLimit: 21_000n,
    maxFeePerGas:
      fee.maxFeePerGas ??
      undefined,
    maxPriorityFeePerGas:
      fee.maxPriorityFeePerGas ??
      undefined
  });

console.log("");
console.log(
  "Transaction:",
  tx.hash
);

console.log(
  "Waiting for confirmation..."
);

let receipt = null;

for (
  let attempt = 0;
  attempt < 30;
  attempt++
) {
  receipt =
    await provider
      .getTransactionReceipt(
        tx.hash
      );

  if (receipt) {
    break;
  }

  await new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        3000
      )
  );
}

if (!receipt) {
  console.log("");
  console.log(
    "Transaction broadcast but confirmation timed out."
  );

  console.log(
    "DO NOT rerun this script."
  );

  console.log(
    "Check this transaction hash instead:"
  );

  console.log(tx.hash);

  process.exit(2);
}

if (receipt.status !== 1) {
  throw new Error(
    "ETH transfer transaction failed"
  );
}

console.log("");
console.log(
  "ETH transfer confirmed."
);

const newBalance =
  await provider.getBalance(
    newWallet.address
  );

console.log(
  "New wallet ETH:",
  ethers.formatEther(
    newBalance
  )
);

// Only after confirmed movement
// do we replace the compromised key.
let env =
  fs.readFileSync(
    ".env",
    "utf8"
  );

env =
  env.replace(
    /^TELEGRAPH_EVM_PRIVATE_KEY=.*$/m,
    `TELEGRAPH_EVM_PRIVATE_KEY=${NEW_KEY}`
  );

fs.writeFileSync(
  ".env",
  env,
  {
    mode: 0o600
  }
);

fs.rmSync(
  recoveryFile,
  {
    force: true
  }
);

console.log("");
console.log(
  "ROTATION COMPLETE"
);

console.log(
  ".env now points to:",
  newWallet.address
);

console.log(
  "Recovery file removed."
);
console.log("");
