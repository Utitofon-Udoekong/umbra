import type { Command } from "commander";
import { apiRequest, failFromResponse, resolveBaseUrl } from "../client.js";
import { printJson, printPool } from "../format.js";

export function registerPool(program: Command): void {
  program
    .command("pool")
    .description("Pool USDC inventory (on-chain balance in contract)")
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals() as { url?: string; json?: boolean };
      const baseUrl = resolveBaseUrl(opts.url);
      const { ok, status, data } = await apiRequest<{
        pool: string;
        usdc: string;
        usdc_decimals: number;
        error?: string;
      }>(baseUrl, "/pool/balance");

      if (!ok) failFromResponse(data, status);
      if (opts.json) printJson(data);
      else printPool(data);
    });
}
