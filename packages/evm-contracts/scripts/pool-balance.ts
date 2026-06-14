import { ethers } from "hardhat";
import { BASE_SEPOLIA, ERC20_ABI } from "./constants";

async function main() {
  const poolAddress = process.env.INSTITUTIONAL_POOL_ADDRESS;
  if (!poolAddress) throw new Error("INSTITUTIONAL_POOL_ADDRESS required");

  const provider = ethers.provider;
  const usdc = new ethers.Contract(BASE_SEPOLIA.usdc, ERC20_ABI, provider);
  const weth = new ethers.Contract(BASE_SEPOLIA.weth, ERC20_ABI, provider);

  const usdcBal = await usdc.balanceOf(poolAddress);
  const wethBal = await weth.balanceOf(poolAddress);
  const usdcDecimals = await usdc.decimals();
  const wethDecimals = await weth.decimals();

  console.log(JSON.stringify({
    pool: poolAddress,
    chainId: BASE_SEPOLIA.chainId,
    usdc: ethers.formatUnits(usdcBal, usdcDecimals),
    weth: ethers.formatUnits(wethBal, wethDecimals),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
