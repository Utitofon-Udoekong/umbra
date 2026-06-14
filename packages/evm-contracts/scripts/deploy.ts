import { writeFileSync } from "node:fs";
import path from "node:path";
import { ethers } from "hardhat";
import { BASE_SEPOLIA } from "./constants";

async function main() {
  const routerKey = process.env.ROUTER_PRIVATE_KEY;
  if (!routerKey) {
    throw new Error("ROUTER_PRIVATE_KEY required in .env");
  }

  const wallet = new ethers.Wallet(routerKey, ethers.provider);
  console.log("Deployer / router:", wallet.address);

  const Pool = await ethers.getContractFactory("InstitutionalPool");
  const pool = await Pool.deploy(wallet.address, BASE_SEPOLIA.swapRouter02);
  await pool.waitForDeployment();
  const address = await pool.getAddress();

  console.log("InstitutionalPool deployed to:", address);
  console.log("Router:", wallet.address);
  console.log("SwapRouter02:", BASE_SEPOLIA.swapRouter02);
  console.log(`Explorer: https://sepolia.basescan.org/address/${address}`);
  console.log(`Set INSTITUTIONAL_POOL_ADDRESS=${address} in .env`);

  const deployment = {
    baseSepolia: {
      chainId: BASE_SEPOLIA.chainId,
      InstitutionalPool: address,
      router: wallet.address,
      swapRouter02: BASE_SEPOLIA.swapRouter02,
      quoterV2: BASE_SEPOLIA.quoterV2,
      usdc: BASE_SEPOLIA.usdc,
      weth: BASE_SEPOLIA.weth,
    },
  };

  writeFileSync(
    path.resolve(__dirname, "../deployments.json"),
    JSON.stringify(deployment, null, 2),
  );
  console.log("Wrote packages/evm-contracts/deployments.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
