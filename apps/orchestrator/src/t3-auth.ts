import {
  buildDelegationCredential,
  VC_ID_LEN,
  type DelegationCredential,
  type T3nClient,
} from "@terminal3/t3n-sdk";
import { createHash, randomBytes } from "node:crypto";
import { CONTRACT_TAIL } from "./lib/contract.js";

export function computeMrEnclave(wasmBytes: Uint8Array, version: string): string {
  const hash = createHash("sha256").update(wasmBytes).digest("hex");
  return `umbra-${version}-${hash.slice(0, 16)}`;
}

export function buildTradeCredential(opts: {
  userDid: string;
  agentDid: string;
  tenantDid: string;
  functions: string[];
  quoteHash: string;
  ttlSecs?: number;
}): DelegationCredential {
  const now = Math.floor(Date.now() / 1000);
  const ttl = opts.ttlSecs ?? 3600;
  const vcId = randomBytes(VC_ID_LEN);

  return buildDelegationCredential({
    user_did: opts.userDid,
    agent_pubkey: randomBytes(33),
    org_did: opts.tenantDid,
    // Delegation credential contract id must be short (not full z:<tid>:tail path).
    contract: `tee:${CONTRACT_TAIL}`,
    functions: [...opts.functions].sort(),
    scopes: ["TRADE"],
    metadata: {
      quote_hash: opts.quoteHash,
      agent_did: opts.agentDid,
    },
    not_before_secs: now,
    not_after_secs: now + ttl,
    vc_id: vcId,
  });
}

export function credentialToJson(credential: DelegationCredential): Record<string, unknown> {
  return {
    v: credential.v,
    user_did: credential.user_did,
    org_did: credential.org_did,
    contract: credential.contract,
    functions: credential.functions,
    scopes: credential.scopes,
    metadata: credential.metadata,
    not_before_secs: credential.not_before_secs.toString(),
    not_after_secs: credential.not_after_secs.toString(),
    vc_id: Buffer.from(credential.vc_id).toString("base64url"),
    agent_pubkey: Buffer.from(credential.agent_pubkey).toString("base64url"),
  };
}

export function hashCredential(credential: DelegationCredential): `0x${string}` {
  const canonical = JSON.stringify(credentialToJson(credential));
  return `0x${createHash("sha256").update(canonical).digest("hex")}` as `0x${string}`;
}

export async function fetchAuditTail(t3n: T3nClient, limit = 5): Promise<unknown[]> {
  try {
    const events = await t3n.getAuditEvents({ limit });
    return Array.isArray(events) ? events : [];
  } catch {
    return [];
  }
}
