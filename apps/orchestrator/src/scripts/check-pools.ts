import { createPublicClient } from "viem";
import { baseSepolia } from "viem/chains";
import { createRpcTransport } from "../rpc.js";
import { BASE_SEPOLIA } from "../uniswap-client.js";

const FACTORY = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24" as const;
const FACTORY_ABI = [
  {
    type: "function",
    name: "getPool",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "pool", type: "address" }],
    stateMutability: "view",
  },
] as const;

const client = createPublicClient({
  chain: baseSepolia,
  transport: createRpcTransport(),
});

for (const fee of [500, 3000, 10_000]) {
  const pool = await client.readContract({
    address: FACTORY,
    abi: FACTORY_ABI,
    functionName: "getPool",
    args: [BASE_SEPOLIA.usdc, BASE_SEPOLIA.weth, fee],
  });
  console.log(`fee ${fee}: pool ${pool}`);
}
