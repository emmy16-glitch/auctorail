import fs from "node:fs";
import { Wallet } from "ethers";

const envPath = ".env";

if (fs.existsSync(envPath)) {
  console.error("Refusing to overwrite existing .env");
  process.exit(1);
}

const wallet = Wallet.createRandom();

const env = [
  `TELEGRAPH_EVM_PRIVATE_KEY=${wallet.privateKey}`,
  `TELEGRAPH_NODE_URL=https://devnode.telegraphprotocol.com`,
  `TELEGRAPH_ENGINE_URL=https://devnode.telegraphprotocol.com/engine`,
  `BASE_SEPOLIA_RPC_URL=https://sepolia.base.org`,
  ""
].join("\n");

fs.writeFileSync(envPath, env, {
  encoding: "utf8",
  mode: 0o600
});

console.log("");
console.log("Auctorail burner wallet created.");
console.log("");
console.log("PUBLIC ADDRESS:");
console.log(wallet.address);
console.log("");
console.log("Private key saved to .env and NOT displayed.");
