import { TradeIntentSchema, type AttestationReport } from "@umbra/shared";
import type { Command } from "commander";
import { apiRequest, failFromResponse, resolveBaseUrl } from "../client.js";
import { printJson, printSwap } from "../format.js";

export function registerSwap(program: Command): void {
  program
    .command("swap")
    .description("Submit shadow swap intent (TEE + on-chain settlement)")
    .requiredOption("--user <address>", "user wallet 0x…")
    .requiredOption("--amount <raw>", "amount in base units (e.g. 300000 = 0.3 USDC)")
    .option("--token-in <symbol>", "input token", "USDC")
    .option("--token-out <symbol>", "output token", "WETH")
    .option("--slippage-bps <n>", "max slippage bps", "50")
    .option("--simulate-violation", "Simulate a public mempool leak policy violation")
    .action(async function (this: Command) {
      const global = this.optsWithGlobals() as { url?: string; json?: boolean };
      const opts = this.opts() as {
        user: string;
        amount: string;
        tokenIn: string;
        tokenOut: string;
        slippageBps: string;
        simulateViolation?: boolean;
      };
      const baseUrl = resolveBaseUrl(global.url);

      const intent = TradeIntentSchema.parse({
        userAddress: opts.user,
        tokenIn: opts.tokenIn,
        tokenOut: opts.tokenOut,
        amount: opts.amount,
        maxSlippageBps: Number(opts.slippageBps),
        simulateViolation: opts.simulateViolation,
      });

      const { ok, status, data } = await apiRequest<
        AttestationReport & { vc_hash?: string; error?: string; settlement?: unknown }
      >(baseUrl, "/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intent),
        timeoutMs: 180_000,
      });

      if (!ok) failFromResponse(data, status);
      if (global.json) printJson(data);
      else printSwap(data);
    });
}
