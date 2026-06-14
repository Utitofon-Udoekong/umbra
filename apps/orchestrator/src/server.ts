import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import {
  AttestationReportSchema,
  TradeIntentSchema,
  type AttestationReport,
} from "@umbra/shared";
import { runShadowFlow, simulateMempoolViolation } from "./enclave-client.js";
import { settleOnBaseSepolia } from "./router.js";
import {
  buildTradeCredential,
  computeMrEnclave,
  credentialToJson,
  fetchAuditTail,
  hashCredential,
} from "./t3-auth.js";
import {
  BASE_SEPOLIA,
  assertUserCredit,
  readPoolBalances,
  readUserCredit,
  requirePoolAddress,
  requireRouterKey,
  tokenAddress,
} from "./uniswap-client.js";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const WASM_PATH = path.join(
  ROOT,
  "packages/t3-contract/contracts/umbra/target/wasm32-wasip2/release/z_umbra.wasm",
);
const CONTRACT_VERSION = process.env.CONTRACT_VERSION ?? "0.2.4";

const app = express();
app.use(cors());
app.use(express.json());

const attestations = new Map<string, AttestationReport>();

async function getMrEnclave(): Promise<string> {
  try {
    const wasm = await readFile(WASM_PATH);
    return computeMrEnclave(wasm, CONTRACT_VERSION);
  } catch {
    return `umbra-${CONTRACT_VERSION}-unbuilt`;
  }
}

app.get("/health", async (_req, res) => {
  let routerAddress: string | undefined;
  try {
    routerAddress = privateKeyToAccount(requireRouterKey()).address;
  } catch {
    routerAddress = undefined;
  }

  res.json({
    status: "ok",
    contract_version: CONTRACT_VERSION,
    chain_id: BASE_SEPOLIA.chainId,
    pool: process.env.INSTITUTIONAL_POOL_ADDRESS ?? "not_deployed",
    router: routerAddress ?? "not_configured",
    mrenclave: await getMrEnclave(),
  });
});

app.get("/pool/balance", async (_req, res) => {
  try {
    const pool = requirePoolAddress();
    const balances = await readPoolBalances(pool);
    res.json({
      pool,
      chain_id: BASE_SEPOLIA.chainId,
      usdc: balances.usdc.raw.toString(),
      weth: balances.weth.raw.toString(),
      usdc_decimals: balances.usdc.decimals,
      weth_decimals: balances.weth.decimals,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get("/user/:address/credit", async (req, res) => {
  try {
    const address = req.params.address;
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      res.status(400).json({ error: "invalid address" });
      return;
    }
    const pool = requirePoolAddress();
    const usdc = tokenAddress("USDC");
    const credit = await readUserCredit(address as `0x${string}`, usdc);
    res.json({
      user: address,
      pool,
      chain_id: BASE_SEPOLIA.chainId,
      token: "USDC",
      token_address: usdc,
      credit: credit.toString(),
      decimals: 6,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/intent", async (req, res) => {
  try {
    requirePoolAddress();
    requireRouterKey();

    const intent = TradeIntentSchema.parse(req.body);
    await assertUserCredit(intent);
    const flow = await runShadowFlow(intent);

    const quoteHash = createHash("sha256")
      .update(JSON.stringify(flow.quote.dark_quote))
      .digest("hex");

    const credential = buildTradeCredential({
      userDid: flow.institution.tenantDid,
      agentDid: flow.invoke.tenantDid,
      tenantDid: flow.institution.tenantDid,
      functions: flow.committedSteps,
      quoteHash,
    });

    const settlement = await settleOnBaseSepolia({
      credential,
      quote: flow.quote,
      uniswapQuote: flow.uniswapQuote,
      maxSlippageBps: intent.maxSlippageBps,
      userAddress: intent.userAddress,
    });

    const audit = await fetchAuditTail(flow.institution.t3n);

    const report: AttestationReport = {
      mrenclave: await getMrEnclave(),
      shadow_intent_id: flow.commit.shadow_intent_id,
      agent_did: flow.invoke.tenantDid,
      user_address: intent.userAddress,
      delegation_credential: credentialToJson(credential),
      dark_quote: {
        route_id: flow.quote.dark_quote.route_id,
        price: flow.quote.dark_quote.price,
        expires_at: flow.quote.dark_quote.expires_at,
        token_in: flow.quote.dark_quote.token_in,
        token_out: flow.quote.dark_quote.token_out,
        buy_amount: flow.quote.dark_quote.buy_amount,
        sell_amount: flow.quote.dark_quote.sell_amount,
        fee_tier: flow.quote.dark_quote.fee_tier,
        liquidity_source: "uniswap_v3",
        chain_id: BASE_SEPOLIA.chainId,
        routing: "private",
      },
      settlement_tx_hash: settlement.tx_hash,
      base_tx_hash: settlement.tx_hash,
      audit_events: audit,
      status: "settled",
    };

    AttestationReportSchema.parse(report);
    attestations.set(flow.commit.shadow_intent_id, report);

    res.json({
      ...report,
      vc_hash: hashCredential(credential),
      dual_key_mode: flow.dualKey,
      routing_note: "Intent committed in TEE before Uniswap V3 settlement on Base Sepolia",
      settlement: {
        amount_in: settlement.amount_in,
        amount_out: settlement.amount_out,
        fee_tier: settlement.fee_tier,
      },
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get("/attestation/:intentId", (req, res) => {
  const report = attestations.get(req.params.intentId);
  if (!report) {
    res.status(404).json({ error: "attestation not found" });
    return;
  }
  res.json(report);
});

app.post("/violation/:intentId", async (req, res) => {
  try {
    const message = await simulateMempoolViolation(req.params.intentId);
    const existing = attestations.get(req.params.intentId);
    if (existing) {
      existing.status = "violation";
      existing.violation_message = message;
      attestations.set(req.params.intentId, existing);
    }
    res.json({ shadow_intent_id: req.params.intentId, violation_message: message });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

const port = Number(process.env.ORCHESTRATOR_PORT ?? 3001);
app.listen(port, () => {
  console.log(`Umbra orchestrator listening on http://localhost:${port}`);
});
