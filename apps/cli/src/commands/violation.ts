import type { Command } from "commander";
import { apiRequest, failFromResponse, resolveBaseUrl } from "../client.js";
import { printJson, printViolation } from "../format.js";

export function registerViolation(program: Command): void {
  program
    .command("violation")
    .description("Simulate mempool leak (TEE policy denial)")
    .argument("<intentId>", "shadow intent id")
    .action(async function (this: Command, intentId: string) {
      const opts = this.optsWithGlobals() as { url?: string; json?: boolean };
      const baseUrl = resolveBaseUrl(opts.url);
      const { ok, status, data } = await apiRequest<{
        shadow_intent_id: string;
        violation_message: string;
        error?: string;
      }>(baseUrl, `/violation/${encodeURIComponent(intentId)}`, {
        method: "POST",
        timeoutMs: 60_000,
      });

      if (!ok) failFromResponse(data, status);
      if (opts.json) printJson(data);
      else printViolation(data);
    });
}
