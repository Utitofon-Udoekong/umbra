import type { AttestationReport } from "@umbra/shared";
import type { Command } from "commander";
import { apiRequest, failFromResponse, resolveBaseUrl } from "../client.js";
import { printAttest, printJson } from "../format.js";

export function registerAttest(program: Command): void {
  program
    .command("attest")
    .description("Fetch attestation report by shadow_intent_id")
    .argument("<intentId>", "shadow intent id")
    .action(async function (this: Command, intentId: string) {
      const opts = this.optsWithGlobals() as { url?: string; json?: boolean };
      const baseUrl = resolveBaseUrl(opts.url);
      const { ok, status, data } = await apiRequest<
        AttestationReport & { vc_hash?: string; error?: string }
      >(baseUrl, `/attestation/${encodeURIComponent(intentId)}`);

      if (!ok) failFromResponse(data, status);
      if (opts.json) printJson(data);
      else printAttest(data);
    });
}
