import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const OLD_KEY = process.env.TELEGRAPH_EVM_PRIVATE_KEY;
const RPC =
  process.env.BASE_SEPOLIA_RPC_URL ||
  "https://sepolia-preconf.base.org";

if (!OLD_KEY) {
  throw new Error("Current burner private key missing");
}

const USDC =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const provider =
  new ethers.JsonRpcProvider(
    RPC,
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
  ethers.Wallet.createRandom();

fs.mkdirSync(
  ".proofgate",
  { recursive: true }
);

// Temporary recovery copy.
// .proofgate/ is gitignored.
const recoveryFile =
  path.join(
    ".proofgate",
    "new-wallet-recovery.env"
  );

fs.writeFileSync(
  recoveryFile,
  `TELEGRAPH_EVM_PRIVATE_KEY=${newWallet.privateKey}\n`,
  {
    mode: 0o600
  }
);

console.log("");
console.log("ROTATING PROOFGATE BURNER WALLET");
console.log("--------------------------------");
console.log("Old address:", oldWallet.address);
console.log("New address:", newWallet.address);
console.log("");
console.log("New private key is NOT displayed.");
console.log("");

const usdc =
  new ethers.Contract(
    USDC,
    [
      "function balanceOf(address) view returns (uint256)",
      "function transfer(address,uint256) returns (bool)"
    ],
    oldWallet
  );

const usdcBalance =
  await usdc.balanceOf(
    oldWallet.address
  );

if (usdcBalance > 0n) {
  console.log("Moving USDC...");

  const tx =
    await usdc.transfer(
      newWallet.address,
      usdcBalance
    );

  console.log(
    "USDC tx:",
    tx.hash
  );

  await tx.wait();

  console.log("USDC moved.");
}

console.log("Moving remaining ETH...");

const ethBalance =
  await provider.getBalance(
    oldWallet.address
  );

const feeData =
  await provider.getFeeData();

const feePerGas =
  feeData.maxFeePerGas ??
  feeData.gasPrice ??
  ethers.parseUnits(
    "1",
    "gwei"
  );

const gasLimit = 21_000n;

// Keep a generous reserve for the final transfer.
const gasReserve =
  gasLimit *
  feePerGas *
  2n;

if (
  ethBalance >
  gasReserve
) {
  const value =
    ethBalance -
    gasReserve;

  const ethTx =
    await oldWallet.sendTransaction({
      to: newWallet.address,
      value,
      gasLimit
    });

  console.log(
    "ETH tx:",
    ethTx.hash
  );

  await ethTx.wait();

  console.log("ETH moved.");
}

let env =
  fs.readFileSync(
    ".env",
    "utf8"
  );

env =
  env.replace(
    /^TELEGRAPH_EVM_PRIVATE_KEY=.*$/m,
    `TELEGRAPH_EVM_PRIVATE_KEY=${newWallet.privateKey}`
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
  { force: true }
);

console.log("");
console.log("ROTATION COMPLETE");
console.log("-----------------");
console.log(
  "New ProofGate address:",
  newWallet.address
);
console.log(
  "Local .env updated."
);
console.log(
  "Temporary recovery file removed."
);
console.log("");
