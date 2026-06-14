use crate::host::{interfaces::kv_store, tenant::tenant_context};

pub const MAP_RULES: &str = "rules";
pub const MAP_SHADOWS: &str = "shadows";
pub const MAP_VIOLATIONS: &str = "violations";
pub const MAP_SECRETS: &str = "secrets";

pub fn map_name(tail: &str) -> String {
    let tid = tenant_context::tenant_did();
    format!("z:{}:{tail}", hex::encode(tid))
}

pub fn get(map_tail: &str, key: &[u8]) -> Result<Option<Vec<u8>>, String> {
    kv_store::get(&map_name(map_tail), key).map_err(|e| format!("kv get: {e}"))
}

pub fn put(map_tail: &str, key: &[u8], value: &[u8]) -> Result<(), String> {
    kv_store::put(&map_name(map_tail), key, value).map_err(|e| format!("kv put: {e}"))
}
