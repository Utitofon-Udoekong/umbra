#!/usr/bin/env node
import { Command } from "commander";
import { CliError } from "./client.js";
import { registerActivity } from "./commands/activity.js";
import { registerAttest } from "./commands/attest.js";
import { registerCredit } from "./commands/credit.js";
import { registerHealth } from "./commands/health.js";
import { registerPool } from "./commands/pool.js";
import { registerSwap } from "./commands/swap.js";
import { registerViolation } from "./commands/violation.js";

const program = new Command();

program
  .name("umbra")
  .description("Umbra institutional router — operator CLI (orchestrator HTTP)")
  .option("--url <url>", "orchestrator base URL (default ORCHESTRATOR_URL or localhost:3001)")
  .option("--json", "output raw JSON");

registerHealth(program);
registerPool(program);
registerCredit(program);
registerSwap(program);
registerAttest(program);
registerViolation(program);
registerActivity(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof CliError) {
    console.error(`error: ${err.message}`);
    process.exit(err.exitCode);
  }
  console.error(err);
  process.exit(1);
});
