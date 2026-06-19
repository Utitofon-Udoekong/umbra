import type { ActivityEntry } from "@umbra/shared";
import type { Command } from "commander";
import { apiRequest, failFromResponse, resolveBaseUrl } from "../client.js";
import { printActivity, printJson } from "../format.js";

export function registerActivity(program: Command): void {
  program
    .command("activity")
    .description("User activity ledger (deposits + swaps)")
    .argument("<address>", "user wallet 0x…")
    .action(async function (this: Command, address: string) {
      const opts = this.optsWithGlobals() as { url?: string; json?: boolean };
      const baseUrl = resolveBaseUrl(opts.url);
      const { ok, status, data } = await apiRequest<{
        user: string;
        entries: ActivityEntry[];
        error?: string;
      }>(baseUrl, `/user/${address}/activity`, { timeoutMs: 60_000 });

      if (!ok) failFromResponse(data, status);
      if (opts.json) printJson(data);
      else printActivity(data);
    });
}
