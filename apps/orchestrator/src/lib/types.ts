export interface PoolPolicy {
  version: number;
  allowed_functions: string[];
  denied_functions: string[];
  max_steps_per_intent: number;
  max_intent_ttl_secs: number;
  allowed_pairs?: string[];
  max_slippage_bps?: number;
}

export const DEFAULT_POOL_POLICY: PoolPolicy = {
  version: 1,
  allowed_functions: ["get-dark-quote", "execute-fill"],
  denied_functions: ["submit-public-mempool", "book-travel"],
  max_steps_per_intent: 4,
  max_intent_ttl_secs: 3600,
  allowed_pairs: ["USDC/ETH", "USDC/WETH", "ETH/USDC"],
  max_slippage_bps: 500,
};

export interface CommitTradeResult {
  shadow_intent_id: string;
  steps_count: number;
  agent_did: string;
  expires_at_secs: number;
  token_in?: string;
  token_out?: string;
  amount?: string;
}

export interface ShadowStatus {
  shadow_intent_id: string;
  agent_did: string;
  steps: string[];
  current_index: number;
  status: string;
  expires_at_secs: number;
}

export interface SessionBundle {
  t3n: import("@terminal3/t3n-sdk").T3nClient;
  tenant: import("@terminal3/t3n-sdk").TenantClient;
  tenantDid: string;
  address: string;
}
