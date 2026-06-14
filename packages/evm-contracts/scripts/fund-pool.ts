import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "hardhat";
import { BASE_SEPOLIA, ERC20_ABI, POOL_ABI } from "./constants";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const poolAddress = process.env.INSTITUTIONAL_POOL_ADDRESS;
  const routerKey = process.env.ROUTER_PRIVATE_KEY;
  const amountArg = process.argv[2] ?? "5";

  if (!poolAddress) throw new Error("INSTITUTIONAL_POOL_ADDRESS required");
  if (!routerKey) throw new Error("ROUTER_PRIVATE_KEY required");

  const wallet = new ethers.Wallet(routerKey, ethers.provider);
  const usdc = new ethers.Contract(BASE_SEPOLIA.usdc, ERC20_ABI, wallet);
  const decimals = await usdc.decimals();
  const amount = ethers.parseUnits(amountArg, decimals);

  console.log(`Funding pool ${poolAddress} with ${amountArg} USDC from ${wallet.address}`);

  const approveTx = await usdc.approve(poolAddress, amount);
  await approveTx.wait();

  const pool = new ethers.Contract(poolAddress, POOL_ABI, wallet);
  const depositTx = await pool.deposit(BASE_SEPOLIA.usdc, amount);
  await depositTx.wait();

  const balance = await usdc.balanceOf(poolAddress);
  console.log(`Pool USDC balance: ${ethers.formatUnits(balance, decimals)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
