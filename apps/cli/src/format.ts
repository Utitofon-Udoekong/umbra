import type { ActivityEntry, AttestationReport } from "@umbra/shared";

const BASESCAN = "https://sepolia.basescan.org/tx/";

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printHealth(data: {
  status: string;
  contract_version?: string;
  chain_id?: number;
  pool?: string;
  router?: string;
  mrenclave?: string;
}): void {
  console.log(`status:       ${data.status}`);
  if (data.contract_version) console.log(`contract:     ${data.contract_version}`);
  if (data.chain_id) console.log(`chain_id:     ${data.chain_id}`);
  if (data.pool) console.log(`pool:         ${data.pool}`);
  if (data.router) console.log(`router:       ${data.router}`);
  if (data.mrenclave) console.log(`mrenclave:    ${data.mrenclave}`);
}

export function printPool(data: {
  pool: string;
  usdc: string;
  usdc_decimals: number;
}): void {
  const usdc = formatRawUnits(data.usdc, data.usdc_decimals);
  console.log(`pool:              ${data.pool}`);
  console.log(`pool inventory:    ${usdc} USDC`);
  console.log(`note:              swap output (WETH) goes to user wallets, not pool inventory`);
}

export function printCredit(data: {
  user: string;
  credit: string;
  decimals: number;
  token?: string;
}): void {
  const formatted = formatRawUnits(data.credit, data.decimals);
  console.log(`user:    ${data.user}`);
  console.log(`credit:  ${formatted} ${data.token ?? "USDC"}`);
}

export function printSwap(data: AttestationReport & { vc_hash?: string; settlement?: unknown }): void {
  console.log(`status:            ${data.status}`);
  console.log(`shadow_intent_id:  ${data.shadow_intent_id}`);
  console.log(`mrenclave:         ${data.mrenclave}`);
  const buy = data.dark_quote.buy_amount ?? data.dark_quote.price;
  console.log(`dark quote:        ${data.dark_quote.sell_amount ?? "?"} ${data.dark_quote.token_in ?? "USDC"} → ${buy} ${data.dark_quote.token_out ?? "WETH"}`);
  const tx = data.settlement_tx_hash ?? data.base_tx_hash;
  if (tx) console.log(`settlement tx:     ${tx}`);
  if (tx) console.log(`basescan:          ${BASESCAN}${tx}`);
  if (data.vc_hash) console.log(`vc_hash:           ${data.vc_hash}`);
  if (data.violation_message) console.log(`violation:         ${data.violation_message}`);
}

export function printAttest(data: AttestationReport & { vc_hash?: string }): void {
  console.log(`status:            ${data.status}`);
  console.log(`shadow_intent_id:  ${data.shadow_intent_id}`);
  console.log(`agent_did:         ${data.agent_did}`);
  console.log(`mrenclave:         ${data.mrenclave}`);
  console.log(`route_id:          ${data.dark_quote.route_id}`);
  const tx = data.settlement_tx_hash ?? data.base_tx_hash;
  if (tx) console.log(`settlement tx:     ${tx}`);
  if (data.violation_message) console.log(`violation:         ${data.violation_message}`);
}

export function printViolation(data: {
  shadow_intent_id: string;
  violation_message: string;
}): void {
  console.log(`shadow_intent_id:  ${data.shadow_intent_id}`);
  console.log(`violation:         ${data.violation_message}`);
}

export function printActivity(data: { user: string; entries: ActivityEntry[] }): void {
  console.log(`user: ${data.user}`);
  if (data.entries.length === 0) {
    console.log("no activity");
    return;
  }
  for (const entry of data.entries) {
    const amounts =
      entry.type === "deposit"
        ? `${entry.amount_in ?? "?"} ${entry.token_in ?? ""}`
        : `${entry.amount_in ?? "?"} ${entry.token_in ?? ""} → ${entry.amount_out ?? "?"} ${entry.token_out ?? ""}`;
    const tx = entry.tx_hash ? ` tx ${entry.tx_hash.slice(0, 10)}…` : "";
    console.log(`  [${entry.type}] ${amounts.trim()}${tx}`);
  }
}

function formatRawUnits(raw: string, decimals: number): string {
  const value = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = value % base;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}
