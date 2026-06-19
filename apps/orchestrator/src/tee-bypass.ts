import type { TradeIntent } from "@umbra/shared";
import type { T3nClient, TenantClient } from "@terminal3/t3n-sdk";
import type { DarkQuoteResponse, EnclaveFlowResult } from "./enclave-client.js";
import type { CommitTradeResult, SessionBundle } from "./lib/types.js";
import { quoteFromIntent } from "./uniswap-client.js";

const DEFI_STEPS = ["get-dark-quote", "execute-fill"] as const;
const BYPASS_TENANT_DID = "did:t3n:bypassdemo000000000000000000000000";

export function isTeeBypassEnabled(): boolean {
  return process.env.UMBRA_BYPASS_TEE === "true";
}

function stubSession(): SessionBundle {
  return {
    t3n: null as unknown as T3nClient,
    tenant: null as unknown as TenantClient,
    tenantDid: BYPASS_TENANT_DID,
    address: "0x0000000000000000000000000000000000000000",
  };
}

function routeIdForQuote(
  tokenIn: string,
  tokenOut: string,
  sellAmount: string,
  buyAmount: string,
  feeTier: number,
): string {
  return `uni-${tokenIn}-${tokenOut}-${sellAmount}-${buyAmount}-${feeTier}`;
}

export async function runShadowFlowBypass(intent: TradeIntent): Promise<EnclaveFlowResult> {
  const uniswapQuote = await quoteFromIntent(intent);
  const sellAmount = uniswapQuote.sellAmount.toString();
  const buyAmount = uniswapQuote.buyAmount.toString();
  const shadowIntentId = `shadow-demo-${Date.now()}`;
  const routeId = routeIdForQuote(
    intent.tokenIn,
    intent.tokenOut,
    sellAmount,
    buyAmount,
    uniswapQuote.feeTier,
  );

  const commit: CommitTradeResult = {
    shadow_intent_id: shadowIntentId,
    steps_count: DEFI_STEPS.length,
    agent_did: BYPASS_TENANT_DID,
    expires_at_secs: Math.floor(Date.now() / 1000) + 3600,
    token_in: intent.tokenIn,
    token_out: intent.tokenOut,
    amount: intent.amount,
  };

  const quote: DarkQuoteResponse = {
    status: "ok",
    shadow_intent_id: shadowIntentId,
    dark_quote: {
      route_id: routeId,
      price: buyAmount,
      expires_at: uniswapQuote.expiresAt,
      token_in: intent.tokenIn,
      token_out: intent.tokenOut,
      buy_amount: buyAmount,
      sell_amount: sellAmount,
      fee_tier: uniswapQuote.feeTier,
      liquidity_source: "uniswap_v3",
    },
    routing: "private",
    mempool: "bypassed",
    chain_id: 84532,
    provider: "uniswap_v3",
  };

  const session = stubSession();

  return {
    institution: session,
    invoke: session,
    dualKey: false,
    commit,
    quote,
    uniswapQuote,
    committedSteps: [...DEFI_STEPS],
  };
}

export function simulateMempoolViolationBypass(): string {
  return "Compliance Block: The enclave policy blocked execution because a step in the transaction routing path attempted to leak the trade intent ('submit-public-mempool') to the public mempool. This action was stopped to prevent MEV front-running and protect user assets.";
}
