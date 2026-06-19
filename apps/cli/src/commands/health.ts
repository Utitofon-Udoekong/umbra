import type { Command } from "commander";
import { apiRequest, failFromResponse, resolveBaseUrl } from "../client.js";
import { printHealth, printJson } from "../format.js";

export function registerHealth(program: Command): void {
  program
    .command("health")
    .description("Orchestrator status, pool, router, mrenclave")
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals() as { url?: string; json?: boolean };
      const baseUrl = resolveBaseUrl(opts.url);
      const { ok, status, data } = await apiRequest<{
        status: string;
        contract_version?: string;
        chain_id?: number;
        pool?: string;
        router?: string;
        mrenclave?: string;
        error?: string;
      }>(baseUrl, "/health");

      if (!ok) failFromResponse(data, status);
      if (opts.json) printJson(data);
      else printHealth(data);
    });
}
