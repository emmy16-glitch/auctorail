import "dotenv/config";
import { ethers } from "ethers";

const RPC = process.env.BASE_SEPOLIA_RPC_URL;
const PRIVATE_KEY = process.env.TELEGRAPH_EVM_PRIVATE_KEY;

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const erc20 = new ethers.Contract(
  USDC,
  [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ],
  provider
);

const [ethBalance, usdcBalance, decimals] = await Promise.all([
  provider.getBalance(wallet.address),
  erc20.balanceOf(wallet.address),
  erc20.decimals()
]);

console.log("");
console.log("ProofGate Burner Wallet");
console.log("-----------------------");
console.log("Address:", wallet.address);
console.log("ETH:", ethers.formatEther(ethBalance));
console.log("USDC:", ethers.formatUnits(usdcBalance, decimals));
console.log("");
