import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import type { DarkQuoteResponse } from "./enclave-client.js";
import type { DelegationCredential } from "@terminal3/t3n-sdk";
import { hashCredential } from "./t3-auth.js";
import { createRpcTransport } from "./rpc.js";
import {
  minBuyAmount,
  POOL_EXECUTE_ABI,
  requirePoolAddress,
  requireRouterKey,
  tokenAddress,
  type UniswapQuote,
} from "./uniswap-client.js";

export interface SettlementResult {
  tx_hash: Hex;
  route_id: Hex;
  amount_in: string;
  amount_out: string;
  fee_tier: number;
}

export async function settleOnBaseSepolia(opts: {
  credential: DelegationCredential;
  quote: DarkQuoteResponse;
  uniswapQuote: UniswapQuote;
  maxSlippageBps: number;
  userAddress: string;
}): Promise<SettlementResult> {
  const poolAddress = requirePoolAddress();
  const routerKey = requireRouterKey();

  const vcHash = hashCredential(opts.credential) as Hex;
  const user = opts.userAddress as Hex;
  const tokenIn = tokenAddress(opts.quote.dark_quote.token_in ?? "USDC");
  const tokenOut = tokenAddress(opts.quote.dark_quote.token_out ?? "WETH");
  const amountIn = opts.uniswapQuote.sellAmount;
  const minOut = minBuyAmount(opts.uniswapQuote.buyAmount, opts.maxSlippageBps);
  const feeTier = opts.uniswapQuote.feeTier;

  const account = privateKeyToAccount(routerKey);

  // bypasses public mempool — private RPC; intent already committed in TEE before broadcast
  const transport = createRpcTransport();

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport,
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport,
  });

  const data = encodeFunctionData({
    abi: POOL_EXECUTE_ABI,
    functionName: "executeWithAttestation",
    args: [vcHash, user, tokenIn, tokenOut, amountIn, minOut, feeTier],
  });

  const hash = await walletClient.sendTransaction({
    to: poolAddress,
    data,
    chain: baseSepolia,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`settlement tx reverted: ${hash}`);
  }

  return {
    tx_hash: hash,
    route_id: vcHash,
    amount_in: amountIn.toString(),
    amount_out: opts.uniswapQuote.buyAmount.toString(),
    fee_tier: feeTier,
  };
}
