use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolPolicy {
    pub version: u32,
    pub allowed_functions: Vec<String>,
    pub denied_functions: Vec<String>,
    pub max_steps_per_intent: u32,
    pub max_intent_ttl_secs: u64,
    #[serde(default)]
    pub allowed_pairs: Vec<String>,
    #[serde(default)]
    pub max_slippage_bps: u32,
}

impl Default for PoolPolicy {
    fn default() -> Self {
        Self {
            version: 1,
            allowed_functions: vec![
                "get-dark-quote".into(),
                "execute-fill".into(),
            ],
            denied_functions: vec!["submit-public-mempool".into(), "book-travel".into()],
            max_steps_per_intent: 4,
            max_intent_ttl_secs: 3600,
            allowed_pairs: vec!["USDC/ETH".into(), "USDC/WETH".into()],
            max_slippage_bps: 100,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShadowRecord {
    pub shadow_intent_id: String,
    pub agent_did: String,
    pub steps: Vec<String>,
    pub current_index: u32,
    pub status: String,
    pub created_at_secs: u64,
    pub expires_at_secs: u64,
    #[serde(default)]
    pub token_in: Option<String>,
    #[serde(default)]
    pub token_out: Option<String>,
    #[serde(default)]
    pub amount: Option<String>,
    #[serde(default)]
    pub max_slippage_bps: Option<u32>,
    #[serde(default)]
    pub route_id: Option<String>,
    #[serde(default)]
    pub quote_hash: Option<String>,
    #[serde(default)]
    pub buy_amount: Option<String>,
    #[serde(default)]
    pub sell_amount: Option<String>,
    #[serde(default)]
    pub fee_tier: Option<u32>,
    #[serde(default)]
    pub user_address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViolationRecord {
    pub audit_id: String,
    pub shadow_intent_id: String,
    pub agent_did: String,
    pub attempted_function: String,
    pub expected_function: Option<String>,
    pub reason: String,
    pub ts_secs: u64,
}

#[derive(Debug, Deserialize)]
pub struct CommitTradeInput {
    pub steps: Vec<String>,
    #[serde(default)]
    pub token_in: Option<String>,
    #[serde(default)]
    pub token_out: Option<String>,
    #[serde(default)]
    pub amount: Option<String>,
    #[serde(default)]
    pub max_slippage_bps: Option<u32>,
    #[serde(default)]
    pub user_address: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ShadowIdInput {
    pub shadow_intent_id: String,
}

#[derive(Debug, Deserialize)]
pub struct DarkQuoteInput {
    pub shadow_intent_id: String,
    #[serde(default)]
    pub token_in: Option<String>,
    #[serde(default)]
    pub token_out: Option<String>,
    /// Orchestrator-supplied QuoterV2 sell amount (base units).
    #[serde(default)]
    pub sell_amount: Option<String>,
    /// Orchestrator-supplied QuoterV2 buy amount (base units).
    #[serde(default)]
    pub buy_amount: Option<String>,
    #[serde(default)]
    pub fee_tier: Option<u32>,
    #[serde(default)]
    pub expires_at: Option<String>,
    #[serde(default)]
    pub user_address: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ExecuteFillInput {
    pub shadow_intent_id: String,
    pub route_id: String,
}

#[derive(Debug, Deserialize)]
pub struct BookTravelInput {
    pub shadow_intent_id: String,
    pub origin: String,
    pub destination: String,
    #[serde(default)]
    pub departure_date: Option<String>,
}
