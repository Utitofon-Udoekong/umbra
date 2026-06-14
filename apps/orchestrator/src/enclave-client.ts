import type { TradeIntent } from "@umbra/shared";
import { executeAsAgent, executeAsTenant } from "./lib/contract.js";
import { issueScopedGrant } from "./lib/grants.js";
import { resolveSessions } from "./lib/t3-session.js";
import {
  DEFAULT_POOL_POLICY,
  type CommitTradeResult,
  type SessionBundle,
} from "./lib/types.js";
import { quoteFromIntent, type UniswapQuote } from "./uniswap-client.js";

export interface DarkQuoteResponse {
  status: string;
  shadow_intent_id: string;
  dark_quote: {
    route_id: string;
    price: string;
    expires_at: string;
    token_in?: string;
    token_out?: string;
    amount?: string;
    buy_amount?: string;
    sell_amount?: string;
    fee_tier?: number;
    liquidity_source?: string;
  };
  routing?: string;
  mempool?: string;
  chain_id?: number;
  provider?: string;
}

export interface EnclaveFlowResult {
  institution: SessionBundle;
  invoke: SessionBundle;
  dualKey: boolean;
  commit: CommitTradeResult;
  quote: DarkQuoteResponse;
  uniswapQuote: UniswapQuote;
  committedSteps: string[];
}

const DEFI_STEPS = ["get-dark-quote", "execute-fill"] as const;

export async function runShadowFlow(intent: TradeIntent): Promise<EnclaveFlowResult> {
  const { institution, invoke, dualKey } = await resolveSessions();
  const tenantDid = institution.tenantDid;

  await executeAsTenant(institution.tenant, tenantDid, "set-pool-policy", DEFAULT_POOL_POLICY);

  const commit = await executeAsAgent<CommitTradeResult>(
    invoke.t3n,
    tenantDid,
    "commit-trade",
    {
      steps: [...DEFI_STEPS],
      token_in: intent.tokenIn,
      token_out: intent.tokenOut,
      amount: intent.amount,
      max_slippage_bps: intent.maxSlippageBps,
      user_address: intent.userAddress,
    },
  );

  await issueScopedGrant(
    institution.t3n,
    tenantDid,
    invoke.tenantDid,
    [...DEFI_STEPS],
    [],
  );

  const uniswapQuote = await quoteFromIntent(intent);

  const bound = await executeAsAgent<DarkQuoteResponse>(invoke.t3n, tenantDid, "get-dark-quote", {
    shadow_intent_id: commit.shadow_intent_id,
    token_in: intent.tokenIn,
    token_out: intent.tokenOut,
    sell_amount: uniswapQuote.sellAmount.toString(),
    buy_amount: uniswapQuote.buyAmount.toString(),
    fee_tier: uniswapQuote.feeTier,
    expires_at: uniswapQuote.expiresAt,
    user_address: intent.userAddress,
  });

  const routeId = bound.dark_quote.route_id;
  await executeAsAgent(invoke.t3n, tenantDid, "execute-fill", {
    shadow_intent_id: commit.shadow_intent_id,
    route_id: routeId,
  });

  return {
    institution,
    invoke,
    dualKey,
    commit,
    quote: bound,
    uniswapQuote,
    committedSteps: [...DEFI_STEPS],
  };
}

export async function simulateMempoolViolation(shadowIntentId: string): Promise<string> {
  const { invoke, institution } = await resolveSessions();
  try {
    await executeAsAgent(invoke.t3n, institution.tenantDid, "submit-public-mempool", {
      shadow_intent_id: shadowIntentId,
    });
    return "unexpected success";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
