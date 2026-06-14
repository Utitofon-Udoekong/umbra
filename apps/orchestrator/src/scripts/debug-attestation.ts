import { runShadowFlow } from "../enclave-client.js";
import { createHash } from "node:crypto";
import { buildTradeCredential, credentialToJson, hashCredential } from "../t3-auth.js";
import { settleOnBaseSepolia } from "../router.js";
import { AttestationReportSchema } from "@umbra/shared";

const flow = await runShadowFlow({
  userAddress: process.env.TEST_USER_ADDRESS ?? "0x0000000000000000000000000000000000000001",
  tokenIn: "USDC",
  tokenOut: "WETH",
  amount: "500000",
  maxSlippageBps: 50,
});

const quoteHash = createHash("sha256").update(JSON.stringify(flow.quote.dark_quote)).digest("hex");

const credential = buildTradeCredential({
  userDid: flow.institution.tenantDid,
  agentDid: flow.invoke.tenantDid,
  tenantDid: flow.institution.tenantDid,
  functions: flow.committedSteps,
  quoteHash,
});

console.log("credential ok", hashCredential(credential));

const settlement = await settleOnBaseSepolia({
  credential,
  quote: flow.quote,
  uniswapQuote: flow.uniswapQuote,
  maxSlippageBps: 50,
  userAddress: process.env.TEST_USER_ADDRESS ?? "0x0000000000000000000000000000000000000001",
});
console.log("settlement", settlement);

const report = {
  mrenclave: "test",
  shadow_intent_id: flow.commit.shadow_intent_id,
  agent_did: flow.invoke.tenantDid,
  delegation_credential: credentialToJson(credential),
  dark_quote: {
    route_id: flow.quote.dark_quote.route_id,
    price: flow.quote.dark_quote.price,
    expires_at: flow.quote.dark_quote.expires_at,
    routing: "private" as const,
  },
  settlement_tx_hash: settlement.tx_hash,
  base_tx_hash: settlement.tx_hash,
  status: "settled" as const,
};

const parsed = AttestationReportSchema.safeParse(report);
console.log("schema", parsed.success ? "ok" : parsed.error);
