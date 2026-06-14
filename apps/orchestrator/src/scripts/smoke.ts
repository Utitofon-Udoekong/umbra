import { setEnvironment, getNodeUrl } from "@terminal3/t3n-sdk";
import { createSession, requireEnv } from "../lib/t3-session.js";

setEnvironment("testnet");
console.log(`Node URL: ${getNodeUrl()}`);

const session = await createSession(requireEnv("T3N_API_KEY"));
const me = await session.tenant.tenant.me();
const usage = await session.t3n.getUsage();

console.log("Tenant DID:", session.tenantDid);
console.log("Tenant:", JSON.stringify(me, null, 2));
console.log("Balance:", JSON.stringify(usage, null, 2));
console.log("\nSmoke test passed.");
