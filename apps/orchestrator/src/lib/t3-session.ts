import {
  T3nClient,
  TenantClient,
  setEnvironment,
  loadWasmComponent,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  getNodeUrl,
  type WasmComponent,
} from "@terminal3/t3n-sdk";
import type { SessionBundle } from "./types.js";

let sharedWasm: WasmComponent | null = null;

async function getWasm(): Promise<WasmComponent> {
  if (!sharedWasm) {
    sharedWasm = await loadWasmComponent();
  }
  return sharedWasm;
}

export async function createSession(apiKey: string): Promise<SessionBundle> {
  setEnvironment("testnet");
  const wasmComponent = await getWasm();
  const address = eth_get_address(apiKey);

  const t3n = new T3nClient({
    wasmComponent,
    handlers: {
      EthSign: metamask_sign(address, undefined, apiKey),
    },
  });

  await t3n.handshake();
  const did = await t3n.authenticate(createEthAuthInput(address));
  const tenantDid = did.value;

  const tenant = new TenantClient({
    t3n,
    baseUrl: getNodeUrl(),
    tenantDid,
  });

  return { t3n, tenant, tenantDid, address };
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

const MIN_T3N_PER_CALL = 10_000;
/** commit + grant + quote + fill + policy headroom */
const MIN_T3N_FOR_SWAP = 50_000;

export async function assertT3Credits(t3n: T3nClient): Promise<void> {
  const usage = await t3n.getUsage();
  const available = usage.balance.available;
  if (available < MIN_T3N_FOR_SWAP) {
    throw new Error(
      `T3N credits exhausted (have ${available}, need ~${MIN_T3N_FOR_SWAP}) — claim more at https://www.terminal3.io/claim-page`,
    );
  }
}

export async function resolveSessions(): Promise<{
  institution: SessionBundle;
  invoke: SessionBundle;
  dualKey: boolean;
}> {
  const institutionKey = requireEnv("T3N_API_KEY");
  const institution = await createSession(institutionKey);

  const agentKey = process.env.AGENT_KEY?.trim();
  if (agentKey && agentKey !== institutionKey) {
    const invoke = await createSession(agentKey);
    const balance = (await invoke.t3n.getUsage()).balance.available;
    if (balance >= MIN_T3N_PER_CALL) {
      return { institution, invoke, dualKey: true };
    }
    console.warn(
      `AGENT_KEY has ${balance} T3N — falling back to self-grant with T3N_API_KEY`,
    );
  }

  return { institution, invoke: institution, dualKey: false };
}
