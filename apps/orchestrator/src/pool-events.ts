import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Address } from "viem";
import { BASE_SEPOLIA, createSepoliaClient } from "./uniswap-client.js";

type SepoliaClient = ReturnType<typeof createSepoliaClient>;

const SHADOW_FILL_ABI = [
  {
    type: "event",
    name: "ShadowFill",
    inputs: [
      { name: "routeId", type: "bytes32", indexed: true },
      { name: "vcHash", type: "bytes32", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "tokenIn", type: "address", indexed: false },
      { name: "tokenOut", type: "address", indexed: false },
      { name: "amountIn", type: "uint256", indexed: false },
      { name: "amountOut", type: "uint256", indexed: false },
      { name: "feeTier", type: "uint24", indexed: false },
    ],
  },
] as const;

const LOG_CHUNK_SIZE = 10n;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEPLOYMENTS_PATH = path.resolve(
  __dirname,
  "../../../packages/evm-contracts/deployments.json",
);

const TOKEN_SYMBOLS: Record<string, string> = {
  [BASE_SEPOLIA.usdc.toLowerCase()]: "USDC",
  [BASE_SEPOLIA.weth.toLowerCase()]: "WETH",
};

let cachedDeployBlock: { pool: string; block: bigint } | null = null;
const swapEventCache = new Map<string, { at: number; events: PoolSwapEvent[] }>();
const SWAP_CACHE_TTL_MS = 120_000;

function tokenSymbol(addr: Address): string {
  return TOKEN_SYMBOLS[addr.toLowerCase()] ?? addr;
}

export interface PoolSwapEvent {
  kind: "swap";
  transactionHash: `0x${string}`;
  blockNumber: bigint;
  logIndex: number;
  vcHash: `0x${string}`;
  routeId: `0x${string}`;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
  feeTier: number;
}

async function resolvePoolDeployBlock(client: SepoliaClient, pool: Address): Promise<bigint> {
  if (cachedDeployBlock?.pool.toLowerCase() === pool.toLowerCase()) {
    return cachedDeployBlock.block;
  }

  const fromEnv = process.env.POOL_DEPLOY_BLOCK;
  if (fromEnv) {
    const block = BigInt(fromEnv);
    cachedDeployBlock = { pool, block };
    return block;
  }

  try {
    const raw = await readFile(DEPLOYMENTS_PATH, "utf8");
    const deployments = JSON.parse(raw) as {
      baseSepolia?: { deployBlock?: number | string; InstitutionalPool?: string };
    };
    const entry = deployments.baseSepolia;
    if (
      entry?.deployBlock &&
      entry.InstitutionalPool?.toLowerCase() === pool.toLowerCase()
    ) {
      const block = BigInt(entry.deployBlock);
      cachedDeployBlock = { pool, block };
      return block;
    }
  } catch {
    // fall through to bytecode search
  }

  const latest = await client.getBlockNumber();
  let low = 0n;
  let high = latest;
  while (low < high) {
    const mid = (low + high) / 2n;
    const code = await client.getBytecode({ address: pool, blockNumber: mid });
    if (code && code !== "0x") {
      high = mid;
    } else {
      low = mid + 1n;
    }
  }

  cachedDeployBlock = { pool, block: low };
  return low;
}

async function getShadowFillEventsChunked(
  client: SepoliaClient,
  pool: Address,
  user: Address,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const logs = [];
  let start = fromBlock;

  while (start <= toBlock) {
    const end =
      start + LOG_CHUNK_SIZE - 1n > toBlock ? toBlock : start + LOG_CHUNK_SIZE - 1n;

    const chunk = await client.getContractEvents({
      address: pool,
      abi: SHADOW_FILL_ABI,
      eventName: "ShadowFill",
      args: { user },
      fromBlock: start,
      toBlock: end,
    });
    logs.push(...chunk);
    start = end + 1n;
  }

  return logs;
}

export async function getUserSwapEvents(user: Address, pool: Address): Promise<PoolSwapEvent[]> {
  const cacheKey = `${pool.toLowerCase()}:${user.toLowerCase()}`;
  const cached = swapEventCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SWAP_CACHE_TTL_MS) {
    return cached.events;
  }

  const client = createSepoliaClient();
  const fromBlock = await resolvePoolDeployBlock(client, pool);
  const toBlock = await client.getBlockNumber();
  const fills = await getShadowFillEventsChunked(client, pool, user, fromBlock, toBlock);

  const events: PoolSwapEvent[] = [];
  for (const log of fills) {
    if (!log.transactionHash || log.blockNumber === null || log.logIndex === undefined) continue;
    events.push({
      kind: "swap",
      transactionHash: log.transactionHash,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      vcHash: log.args.vcHash!,
      routeId: log.args.routeId!,
      tokenIn: tokenSymbol(log.args.tokenIn!),
      tokenOut: tokenSymbol(log.args.tokenOut!),
      amountIn: log.args.amountIn!,
      amountOut: log.args.amountOut!,
      feeTier: log.args.feeTier!,
    });
  }

  swapEventCache.set(cacheKey, { at: Date.now(), events });
  return events;
}

/** @deprecated use getUserSwapEvents — deposits come from deposit ledger */
export async function getUserPoolEvents(user: Address, pool: Address) {
  return getUserSwapEvents(user, pool);
}
