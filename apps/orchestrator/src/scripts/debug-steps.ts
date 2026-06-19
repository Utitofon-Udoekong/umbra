import type { TradeIntent } from "@umbra/shared";
import { executeAsAgent, executeAsTenant } from "../lib/contract.js";
import { issueScopedGrant } from "../lib/grants.js";
import { resolveSessions } from "../lib/t3-session.js";
import { DEFAULT_POOL_POLICY, type CommitTradeResult } from "../lib/types.js";
import { quoteFromIntent } from "../uniswap-client.js";

const intent: TradeIntent = {
  userAddress: "0xbEB6d51dB6a4A12ebf0b1f870927FfEADd720Aa6",
  tokenIn: "USDC",
  tokenOut: "WETH",
  amount: "300000",
  maxSlippageBps: 50,
};

const DEFI_STEPS = ["get-dark-quote", "execute-fill"] as const;

try {
  const { institution, invoke } = await resolveSessions();
  const tenantDid = institution.tenantDid;

  console.log("1. set-pool-policy...");
  await executeAsTenant(institution.tenant, tenantDid, "set-pool-policy", DEFAULT_POOL_POLICY);
  console.log("   ok");

  console.log("2. commit-trade...");
  const commit = await executeAsAgent<CommitTradeResult>(invoke.t3n, tenantDid, "commit-trade", {
    steps: [...DEFI_STEPS],
    token_in: intent.tokenIn,
    token_out: intent.tokenOut,
    amount: intent.amount,
    max_slippage_bps: intent.maxSlippageBps,
    user_address: intent.userAddress,
  });
  console.log("   ok", commit.shadow_intent_id);

  console.log("3. issueScopedGrant...");
  await issueScopedGrant(institution.t3n, tenantDid, invoke.tenantDid, [...DEFI_STEPS], []);
  console.log("   ok");

  console.log("4. uniswap quote...");
  const uniswapQuote = await quoteFromIntent(intent);
  console.log("   ok buyAmount", uniswapQuote.buyAmount.toString());

  console.log("5. get-shadow-status...");
  const status = await executeAsAgent(invoke.t3n, tenantDid, "get-shadow-status", {
    shadow_intent_id: commit.shadow_intent_id,
  });
  console.log("   ok", status);

  console.log("6. execute-fill early (expect violation)...");
  try {
    const early = await executeAsAgent(invoke.t3n, tenantDid, "execute-fill", {
      shadow_intent_id: commit.shadow_intent_id,
      route_id: "fake",
    });
    console.log("   unexpected", early);
  } catch (err) {
    console.log(
      "   err",
      err instanceof Error ? err.message.slice(0, 300) : err,
    );
  }

  console.log("7. get-dark-quote (raw)...");
  const scriptName = (await import("@terminal3/t3n-sdk")).canonicalTenantName(
    tenantDid,
    "umbra",
  );
  const scriptVersion = await (await import("@terminal3/t3n-sdk")).getScriptVersion(
    (await import("@terminal3/t3n-sdk")).getNodeUrl(),
    scriptName,
  );
  const raw = await invoke.t3n.execute({
    script_name: scriptName,
    script_version: scriptVersion,
    function_name: "get-dark-quote",
    input: {
      shadow_intent_id: commit.shadow_intent_id,
      token_in: intent.tokenIn,
      token_out: intent.tokenOut,
      sell_amount: intent.amount,
      buy_amount: "1000",
      fee_tier: 500,
      expires_at: uniswapQuote.expiresAt,
    },
  });
  console.log("   raw", JSON.stringify(raw).slice(0, 500));
} catch (err) {
  console.error("FAILED at step:", err);
  process.exit(1);
}
