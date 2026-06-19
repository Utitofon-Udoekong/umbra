import type { TradeIntent } from "@umbra/shared";
import { createPublicClient, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { createRpcTransport } from "./rpc.js";

export const BASE_SEPOLIA = {
  chainId: 84532,
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
  weth: "0x4200000000000000000000000000000000000006" as Address,
  swapRouter02: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4" as Address,
  quoterV2: "0xC5290058841028F1614F3A6F0F5816cAd0df5E27" as Address,
  v3Factory: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24" as Address,
  feeTiers: [500, 3000, 10_000] as const,
};

const QUOTER_V2_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
] as const;

const POOL_EXECUTE_ABI = [
  {
    type: "function",
    name: "executeWithAttestation",
    inputs: [
      { name: "vcHash", type: "bytes32" },
      { name: "user", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "minAmountOut", type: "uint256" },
      { name: "feeTier", type: "uint24" },
    ],
    outputs: [{ name: "routeId", type: "bytes32" }],
    stateMutability: "nonpayable",
  },
] as const;

const POOL_CREDIT_ABI = [
  {
    type: "function",
    name: "creditOf",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const;

export interface UniswapQuote {
  tokenIn: Address;
  tokenOut: Address;
  sellAmount: bigint;
  buyAmount: bigint;
  feeTier: number;
  expiresAt: string;
}

const SYMBOL_MAP: Record<string, Address> = {
  USDC: BASE_SEPOLIA.usdc,
  WETH: BASE_SEPOLIA.weth,
  ETH: BASE_SEPOLIA.weth,
};

export function tokenAddress(symbol: string): Address {
  const addr = SYMBOL_MAP[symbol.toUpperCase()];
  if (!addr) throw new Error(`unsupported token: ${symbol}`);
  return addr;
}

function rpcUrl() {
  return process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
}

export function createSepoliaClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: createRpcTransport(),
  });
}

export async function quoteExactInputSingle(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
): Promise<UniswapQuote> {
  const client = createSepoliaClient();
  let lastError: unknown;

  for (const feeTier of BASE_SEPOLIA.feeTiers) {
    try {
      const result = await client.simulateContract({
        address: BASE_SEPOLIA.quoterV2,
        abi: QUOTER_V2_ABI,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn,
            tokenOut,
            amountIn,
            fee: feeTier,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      const buyAmount = result.result[0];
      if (buyAmount > 0n) {
        return {
          tokenIn,
          tokenOut,
          sellAmount: amountIn,
          buyAmount,
          feeTier,
          expiresAt: String(Math.floor(Date.now() / 1000) + 300),
        };
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `Uniswap quote failed for ${tokenIn} → ${tokenOut}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

export async function quoteFromIntent(intent: TradeIntent): Promise<UniswapQuote> {
  const tokenIn = tokenAddress(intent.tokenIn);
  const tokenOut = tokenAddress(intent.tokenOut);
  const amountIn = BigInt(intent.amount);
  return quoteExactInputSingle(tokenIn, tokenOut, amountIn);
}

export function minBuyAmount(buyAmount: bigint, maxSlippageBps: number): bigint {
  return (buyAmount * BigInt(10_000 - maxSlippageBps)) / 10_000n;
}

export async function readPoolBalances(poolAddress: Address) {
  const client = createSepoliaClient();
  const [usdcBal, wethBal, usdcDecimals, wethDecimals] = await Promise.all([
    client.readContract({
      address: BASE_SEPOLIA.usdc,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [poolAddress],
    }),
    client.readContract({
      address: BASE_SEPOLIA.weth,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [poolAddress],
    }),
    client.readContract({
      address: BASE_SEPOLIA.usdc,
      abi: ERC20_ABI,
      functionName: "decimals",
    }),
    client.readContract({
      address: BASE_SEPOLIA.weth,
      abi: ERC20_ABI,
      functionName: "decimals",
    }),
  ]);

  return {
    usdc: { raw: usdcBal, decimals: usdcDecimals },
    weth: { raw: wethBal, decimals: wethDecimals },
  };
}

export async function readUserCredit(user: Address, token: Address): Promise<bigint> {
  const pool = requirePoolAddress();
  const client = createSepoliaClient();
  return client.readContract({
    address: pool,
    abi: POOL_CREDIT_ABI,
    functionName: "creditOf",
    args: [user, token],
  });
}

export async function assertUserCredit(intent: TradeIntent): Promise<void> {
  const user = intent.userAddress as Address;
  const token = tokenAddress(intent.tokenIn);
  const required = BigInt(intent.amount);
  const credit = await readUserCredit(user, token);
  if (credit < required) {
    throw new Error(
      `Insufficient pool credit: have ${credit.toString()} need ${required.toString()} — deposit USDC first`,
    );
  }
}

export { POOL_EXECUTE_ABI, POOL_CREDIT_ABI, ERC20_ABI };

export function requirePoolAddress(): Address {
  const addr = process.env.INSTITUTIONAL_POOL_ADDRESS as Address | undefined;
  if (!addr) {
    throw new Error(
      "INSTITUTIONAL_POOL_ADDRESS not set — run pnpm skill:deploy-pool and add to .env",
    );
  }
  return addr;
}

export function requireRouterKey(): Hex {
  const key = process.env.ROUTER_PRIVATE_KEY as Hex | undefined;
  if (!key) {
    throw new Error("ROUTER_PRIVATE_KEY not set — generate a dev wallet and fund from Base Sepolia faucet");
  }
  return key;
}
