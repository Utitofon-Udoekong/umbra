import type { Command } from "commander";
import { apiRequest, failFromResponse, resolveBaseUrl } from "../client.js";
import { printCredit, printJson } from "../format.js";

export function registerCredit(program: Command): void {
  program
    .command("credit")
    .description("Per-user pool credit (USDC)")
    .argument("<address>", "user wallet 0x…")
    .action(async function (this: Command, address: string) {
      const opts = this.optsWithGlobals() as { url?: string; json?: boolean };
      const baseUrl = resolveBaseUrl(opts.url);
      const { ok, status, data } = await apiRequest<{
        user: string;
        credit: string;
        decimals: number;
        token?: string;
        error?: string;
      }>(baseUrl, `/user/${address}/credit`);

      if (!ok) failFromResponse(data, status);
      if (opts.json) printJson(data);
      else printCredit(data);
    });
}
