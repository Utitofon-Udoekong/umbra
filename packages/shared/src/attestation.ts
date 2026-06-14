import { z } from "zod";

export const DarkQuoteSchema = z.object({
  route_id: z.string(),
  price: z.string(),
  expires_at: z.string(),
  buy_amount: z.string().optional(),
  sell_amount: z.string().optional(),
  fee_tier: z.number().int().optional(),
  liquidity_source: z.string().optional(),
  chain_id: z.number().int().optional(),
  amount: z.string().optional(),
  token_in: z.string().optional(),
  token_out: z.string().optional(),
  routing: z.literal("private").default("private"),
});

export const DelegationCredentialSchema = z.object({
  v: z.string(),
  user_did: z.string(),
  agent_pubkey: z.union([z.instanceof(Uint8Array), z.string()]),
  org_did: z.string(),
  contract: z.string(),
  functions: z.array(z.string()).min(1),
  scopes: z.array(z.string()).optional(),
  metadata: z.record(z.string()).optional(),
  not_before_secs: z.union([z.bigint(), z.number(), z.string()]),
  not_after_secs: z.union([z.bigint(), z.number(), z.string()]),
  vc_id: z.union([z.instanceof(Uint8Array), z.string()]),
});

export const AttestationReportSchema = z.object({
  mrenclave: z.string(),
  shadow_intent_id: z.string(),
  agent_did: z.string(),
  user_address: z.string().optional(),
  delegation_credential: z.record(z.unknown()),
  dark_quote: DarkQuoteSchema,
  settlement_tx_hash: z.string().optional(),
  base_tx_hash: z.string().optional(),
  audit_events: z.array(z.unknown()).optional(),
  status: z.enum(["pending", "quoted", "settled", "violation"]).default("pending"),
  violation_message: z.string().optional(),
});

export type DarkQuote = z.infer<typeof DarkQuoteSchema>;
export type AttestationReport = z.infer<typeof AttestationReportSchema>;

export const TradeIntentSchema = z.object({
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tokenIn: z.string(),
  tokenOut: z.string(),
  amount: z.string(),
  maxSlippageBps: z.number().int().min(0).max(10_000).default(50),
});

export type TradeIntent = z.infer<typeof TradeIntentSchema>;
