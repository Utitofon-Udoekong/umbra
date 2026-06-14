/**
 * Register Umbra WASM and create KV maps (rules, shadows, violations, secrets).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACT_TAIL } from "./lib/contract.js";
import { createSession, requireEnv } from "./lib/t3-session.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const WASM_PATH = path.join(
  ROOT,
  "packages/t3-contract/contracts/umbra/target/wasm32-wasip2/release/z_umbra.wasm",
);
const CONTRACT_VERSION = process.env.CONTRACT_VERSION ?? "0.2.4";

async function ensureMapAcl(
  session: Awaited<ReturnType<typeof createSession>>,
  tail: string,
  contractId: number,
): Promise<void> {
  const isSecrets = tail === "secrets";
  const createInput = {
    tail,
    visibility: "private" as const,
    readers: { only: [contractId] },
    writers: isSecrets ? ("all" as const) : { only: [contractId] },
  };

  try {
    await session.tenant.maps.create(createInput);
    console.log(`Created map: ${tail}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("MapAlreadyExists") || message.includes("already exists")) {
      await session.tenant.maps.update(tail, {
        readers: { only: [contractId] },
        writers: isSecrets ? ("all" as const) : { only: [contractId] },
      });
      console.log(`Updated map ACLs: ${tail} → contract ${contractId}`);
    } else {
      throw err;
    }
  }
}

async function seedSecret(
  session: Awaited<ReturnType<typeof createSession>>,
  key: string,
  value: string,
): Promise<void> {
  const attempts = [
    { fn: "map-entry-set", input: { tail: "secrets", key, value } },
    { fn: "map-entry-set", input: { map: "secrets", key, value } },
    { fn: "kv-map-entry-set", input: { tail: "secrets", key, value } },
  ];
  for (const { fn, input } of attempts) {
    try {
      await session.tenant.executeControl(fn, input);
      console.log(`Seeded secrets.${key} via ${fn}`);
      return;
    } catch {
      // try next control function name
    }
  }
  console.warn(
    `Could not seed secrets.${key} via executeControl — orchestrator injects key at invoke time`,
  );
}

async function main() {
  const session = await createSession(requireEnv("T3N_API_KEY"));

  try {
    await session.tenant.tenant.claim();
  } catch {
    // Already claimed
  }

  const me = await session.tenant.tenant.me();
  console.log("Tenant:", JSON.stringify(me, null, 2));

  let contractId = Number(process.env.CONTRACT_ID ?? "0");

  const wasm = await readFile(WASM_PATH);
  console.log(`Registering ${CONTRACT_TAIL} v${CONTRACT_VERSION} (${wasm.byteLength} bytes)...`);

  try {
    const registered = (await session.tenant.contracts.register({
      tail: CONTRACT_TAIL,
      version: CONTRACT_VERSION,
      wasm,
    })) as { contract_id: number };
    contractId = registered.contract_id;
    console.log(`Registered contract id: ${contractId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("not higher than current") || message.includes("already")) {
      if (!contractId) {
        throw new Error(
          "Contract already registered at this version. Set CONTRACT_ID in .env (e.g. 50) and re-run.",
        );
      }
      console.log(`Using existing contract id: ${contractId}`);
    } else {
      throw err;
    }
  }

  for (const tail of ["rules", "shadows", "violations", "secrets"] as const) {
    await ensureMapAcl(session, tail, contractId);
  }

  if (process.env.ZERO_X_API_KEY) {
    await seedSecret(session, "zero_x_api_key", process.env.ZERO_X_API_KEY);
  }
  if (process.env.DUFFEL_API_KEY) {
    await seedSecret(session, "duffel_api_key", process.env.DUFFEL_API_KEY);
  }

  const usage = await session.t3n.getUsage();
  console.log("Token balance:", JSON.stringify(usage, null, 2));
  console.log("\nSetup complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
