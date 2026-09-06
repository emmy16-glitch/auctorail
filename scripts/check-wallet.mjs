import "dotenv/config";
import { ethers } from "ethers";

const PRIVATE_KEY =
  process.env.TELEGRAPH_EVM_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  throw new Error(
    "TELEGRAPH_EVM_PRIVATE_KEY is missing"
  );
}

const USDC =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const RPCS = [
  process.env.BASE_SEPOLIA_RPC_URL,
  "https://sepolia-preconf.base.org",
  "https://sepolia.base.org"
].filter(Boolean);

const uniqueRpcs =
  [...new Set(RPCS)];

const network = {
  name: "base-sepolia",
  chainId: 84532
};

const wallet =
  new ethers.Wallet(PRIVATE_KEY);

let lastError = null;

for (const rpc of uniqueRpcs) {
  try {
    console.log(
      `Trying RPC: ${rpc}`
    );

    const request =
      new ethers.FetchRequest(rpc);

    request.timeout = 20_000;

    const provider =
      new ethers.JsonRpcProvider(
        request,
        network,
        {
          staticNetwork: true
        }
      );

    // Force an actual RPC call.
    await provider.getBlockNumber();

    const token =
      new ethers.Contract(
        USDC,
        [
          "function balanceOf(address) view returns (uint256)",
          "function decimals() view returns (uint8)"
        ],
        provider
      );

    const [
      ethBalance,
      usdcBalance,
      decimals
    ] = await Promise.all([
      provider.getBalance(
        wallet.address
      ),

      token.balanceOf(
        wallet.address
      ),

      token.decimals()
    ]);

    console.log("");
    console.log(
      "Auctorail Burner Wallet"
    );
    console.log(
      "-----------------------"
    );
    console.log(
      "Address:",
      wallet.address
    );
    console.log(
      "Network:",
      "Base Sepolia (84532)"
    );
    console.log(
      "RPC:",
      rpc
    );
    console.log(
      "ETH:",
      ethers.formatEther(
        ethBalance
      )
    );
    console.log(
      "USDC:",
      ethers.formatUnits(
        usdcBalance,
        decimals
      )
    );
    console.log("");

    process.exit(0);
  } catch (error) {
    lastError = error;

    console.log(
      "RPC unavailable, trying next..."
    );
  }
}

console.error("");
console.error(
  "All configured Base Sepolia RPCs failed."
);

console.error(
  lastError?.shortMessage ??
  lastError?.message ??
  String(lastError)
);

process.exit(1);
