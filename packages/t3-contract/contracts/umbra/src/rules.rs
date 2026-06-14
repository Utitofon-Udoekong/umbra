use crate::kv::{self, MAP_RULES};
use crate::types::PoolPolicy;

const RULES_KEY: &[u8] = b"active";

pub fn load() -> Result<PoolPolicy, String> {
    let bytes = kv::get(MAP_RULES, RULES_KEY)?
        .ok_or("pool policy not set — call set-pool-policy first")?;
    serde_json::from_slice(&bytes).map_err(|e| format!("invalid policy JSON: {e}"))
}

pub fn save(rules: &PoolPolicy) -> Result<(), String> {
    let bytes = serde_json::to_vec(rules).map_err(|e| e.to_string())?;
    kv::put(MAP_RULES, RULES_KEY, &bytes)
}

pub fn set_pool_policy(input: &[u8]) -> Result<Vec<u8>, String> {
    let rules: PoolPolicy =
        serde_json::from_slice(input).map_err(|e| format!("invalid policy: {e}"))?;
    if rules.allowed_functions.is_empty() {
        return Err("allowed_functions must not be empty".into());
    }
    save(&rules)?;
    serde_json::to_vec(&serde_json::json!({ "status": "ok", "version": rules.version }))
        .map_err(|e| e.to_string())
}
