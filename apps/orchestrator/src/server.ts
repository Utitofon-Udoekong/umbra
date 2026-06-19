import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import {
  ActivityResponseSchema,
  AttestationReportSchema,
  TradeIntentSchema,
  type AttestationReport,
} from "@umbra/shared";
import { buildUserActivity } from "./activity.js";
import { DepositLedger } from "./deposit-ledger.js";
import { runShadowFlow, simulateMempoolViolation } from "./enclave-client.js";
import { isTeeBypassEnabled } from "./tee-bypass.js";
import { AttestationLedger } from "./ledger.js";
import { settleOnBaseSepolia } from "./router.js";
import { formatT3Error } from "./t3-errors.js";
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

const ledger = new AttestationLedger();
const depositLedger = new DepositLedger();

const activityCache = new Map<string, { at: number; payload: unknown }>();
const ACTIVITY_CACHE_TTL_MS = 60_000;

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

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
    const tokenSymbol = (req.query.token as string) ?? "USDC";
    const token = tokenAddress(tokenSymbol);
    const credit = await readUserCredit(address as `0x${string}`, token);
    const decimals = tokenSymbol.toUpperCase() === "WETH" ? 18 : 6;
    res.json({
      user: address,
      pool,
      chain_id: BASE_SEPOLIA.chainId,
      token: tokenSymbol,
      token_address: token,
      credit: credit.toString(),
      decimals,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get("/user/:address/activity", async (req, res) => {
  try {
    const address = req.params.address;
    if (!isValidAddress(address)) {
      res.status(400).json({ error: "invalid address" });
      return;
    }

    const cacheKey = address.toLowerCase();
    const cached = activityCache.get(cacheKey);
    if (cached && Date.now() - cached.at < ACTIVITY_CACHE_TTL_MS) {
      res.json(cached.payload);
      return;
    }

    const pool = requirePoolAddress();
    const user = address as `0x${string}`;
    const attestations = ledger.getByUser(user);
    const deposits = depositLedger.getByUser(user);
    const entries = await buildUserActivity(user, pool, attestations, deposits);

    const payload = ActivityResponseSchema.parse({
      user: address,
      chain_id: BASE_SEPOLIA.chainId,
      entries,
    });
    activityCache.set(cacheKey, { at: Date.now(), payload });
    res.json(payload);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/user/:address/deposit", async (req, res) => {
  try {
    const address = req.params.address;
    if (!isValidAddress(address)) {
      res.status(400).json({ error: "invalid address" });
      return;
    }

    const { txHash, token, amount } = req.body as {
      txHash?: string;
      token?: string;
      amount?: string;
    };

    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      res.status(400).json({ error: "invalid txHash" });
      return;
    }
    if (!token || !amount) {
      res.status(400).json({ error: "token and amount required" });
      return;
    }

    await depositLedger.save({
      id: txHash,
      user_address: address,
      tx_hash: txHash,
      token,
      amount,
      saved_at: Date.now(),
    });
    activityCache.delete(address.toLowerCase());

    res.json({ ok: true, tx_hash: txHash });
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
    if (!isTeeBypassEnabled()) {
      await assertUserCredit(intent);
    }
    const flow = await runShadowFlow(intent);

    if (intent.simulateViolation) {
      const violationMessage = await simulateMempoolViolation(flow.commit.shadow_intent_id);
      const audit = isTeeBypassEnabled() ? [] : await fetchAuditTail(flow.institution.t3n);
      
      const report: AttestationReport = {
        mrenclave: await getMrEnclave(),
        shadow_intent_id: flow.commit.shadow_intent_id,
        agent_did: flow.invoke.tenantDid,
        user_address: intent.userAddress,
        delegation_credential: {},
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
        audit_events: audit,
        status: "violation",
        violation_message: violationMessage,
      };

      AttestationReportSchema.parse(report);
      await ledger.save(report);
      activityCache.delete(intent.userAddress.toLowerCase());

      res.json(report);
      return;
    }

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

    const audit = isTeeBypassEnabled() ? [] : await fetchAuditTail(flow.institution.t3n);
    const vcHash = hashCredential(credential);

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
    await ledger.save({ ...report, vc_hash: vcHash });
    activityCache.delete(intent.userAddress.toLowerCase());

    res.json({
      ...report,
      vc_hash: vcHash,
      dual_key_mode: flow.dualKey,
      routing_note: "Intent committed in TEE before Uniswap V3 settlement on Base Sepolia",
      settlement: {
        amount_in: settlement.amount_in,
        amount_out: settlement.amount_out,
        fee_tier: settlement.fee_tier,
      },
    });
  } catch (err) {
    console.error("[umbra/intent]", err);
    res.status(400).json({
      error: formatT3Error(err),
    });
  }
});

app.get("/attestation/:intentId", (req, res) => {
  const report = ledger.get(req.params.intentId);
  if (!report) {
    res.status(404).json({ error: "attestation not found" });
    return;
  }
  res.json(report);
});

app.post("/violation/:intentId", async (req, res) => {
  try {
    const message = await simulateMempoolViolation(req.params.intentId);
    // Simulation only — do not rewrite settled attestations or activity ledger.
    res.json({ shadow_intent_id: req.params.intentId, violation_message: message });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

const port = Number(process.env.ORCHESTRATOR_PORT ?? 3001);

await ledger.load();
await depositLedger.load();
app.listen(port, () => {
  console.log(`Umbra orchestrator listening on http://localhost:${port}`);
});
