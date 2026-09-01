import "dotenv/config";
import fs from "node:fs";
import { ethers } from "ethers";

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
    "Recovery wallet key invalid"
  );
}

const oldWalletKey =
  process.env.TELEGRAPH_EVM_PRIVATE_KEY;

if (!oldWalletKey) {
  throw new Error(
    "Old wallet key missing"
  );
}

const newWalletKey =
  match[1];

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
    oldWalletKey,
    provider
  );

const newWallet =
  new ethers.Wallet(
    newWalletKey
  );

console.log("");
console.log("PROOFGATE WALLET REPLACEMENT");
console.log("============================");
console.log("Old:", oldWallet.address);
console.log("New:", newWallet.address);

const [
  oldBalance,
  newBalance,
  latestNonce
] = await Promise.all([
  provider.getBalance(
    oldWallet.address
  ),
  provider.getBalance(
    newWallet.address
  ),
  provider.getTransactionCount(
    oldWallet.address,
    "latest"
  )
]);

console.log(
  "Old ETH:",
  ethers.formatEther(oldBalance)
);

console.log(
  "New ETH:",
  ethers.formatEther(newBalance)
);

console.log(
  "Confirmed nonce:",
  latestNonce
);

// If ETH already arrived while we were
// troubleshooting, don't send anything.
if (newBalance > 0n) {
  console.log("");
  console.log(
    "New wallet already funded."
  );

  finalize();
  process.exit(0);
}

// The USDC transaction consumed nonce 0.
// The ETH rotation uses nonce 1.
if (latestNonce > 1) {
  throw new Error(
    "Nonce 1 has already confirmed but new wallet has no ETH. Stop and inspect."
  );
}

console.log("");
console.log(
  "Replacing pending nonce 1..."
);

// Send slightly less than before so we
// have a large fee safety margin.
const value =
  ethers.parseEther("0.023");

const maxPriorityFeePerGas =
  ethers.parseUnits(
    "3",
    "gwei"
  );

const maxFeePerGas =
  ethers.parseUnits(
    "35",
    "gwei"
  );

console.log(
  "Transfer:",
  ethers.formatEther(value),
  "ETH"
);

console.log(
  "Max priority fee:",
  ethers.formatUnits(
    maxPriorityFeePerGas,
    "gwei"
  ),
  "gwei"
);

console.log(
  "Max fee:",
  ethers.formatUnits(
    maxFeePerGas,
    "gwei"
  ),
  "gwei"
);

const tx =
  await oldWallet.sendTransaction({
    to: newWallet.address,

    value,

    nonce: 1,

    gasLimit: 21_000n,

    maxPriorityFeePerGas,

    maxFeePerGas
  });

console.log("");
console.log(
  "Replacement tx:",
  tx.hash
);

console.log(
  "Waiting for confirmation..."
);

let receipt = null;

for (
  let i = 0;
  i < 40;
  i++
) {
  try {
    receipt =
      await provider
        .getTransactionReceipt(
          tx.hash
        );

    if (receipt) {
      break;
    }
  } catch {
    // Temporary RPC failure:
    // keep polling.
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
    "Broadcast succeeded but confirmation check timed out."
  );

  console.log(
    "DO NOT rerun this script."
  );

  console.log(
    "Transaction:",
    tx.hash
  );

  process.exit(2);
}

if (receipt.status !== 1) {
  throw new Error(
    "Replacement transaction reverted"
  );
}

const finalBalance =
  await provider.getBalance(
    newWallet.address
  );

console.log("");
console.log(
  "TRANSFER CONFIRMED"
);

console.log(
  "New wallet ETH:",
  ethers.formatEther(
    finalBalance
  )
);

finalize();

function finalize() {
  let env =
    fs.readFileSync(
      ".env",
      "utf8"
    );

  env =
    env.replace(
      /^TELEGRAPH_EVM_PRIVATE_KEY=.*$/m,
      `TELEGRAPH_EVM_PRIVATE_KEY=${newWalletKey}`
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
    "WALLET ROTATION COMPLETE"
  );

  console.log(
    ".env now points to:",
    newWallet.address
  );

  console.log(
    "Recovery file removed."
  );
}
