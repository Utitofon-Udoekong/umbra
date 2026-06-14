import { ethers } from "hardhat";
import { BASE_SEPOLIA } from "./constants";

async function main() {
  const user = process.argv[2];
  const tokenArg = process.argv[3] ?? "usdc";

  if (!user) {
    throw new Error("Usage: user-credit <0xUserAddress> [usdc|weth]");
  }

  const poolAddress = process.env.INSTITUTIONAL_POOL_ADDRESS;
  if (!poolAddress) throw new Error("INSTITUTIONAL_POOL_ADDRESS required");

  const token =
    tokenArg.toLowerCase() === "weth" ? BASE_SEPOLIA.weth : BASE_SEPOLIA.usdc;

  const pool = await ethers.getContractAt(
    ["function creditOf(address user, address token) view returns (uint256)"],
    poolAddress,
  );

  const credit = await pool.creditOf(user, token);
  const erc20 = new ethers.Contract(
    token,
    ["function decimals() view returns (uint8)"],
    ethers.provider,
  );
  const decimals = await erc20.decimals();

  console.log(
    JSON.stringify(
      {
        user,
        pool: poolAddress,
        token,
        credit: credit.toString(),
        creditFormatted: ethers.formatUnits(credit, decimals),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
