use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct DynamicContext {
    authenticated_did: Option<String>,
}

/// Resolve the calling principal DID from host-trusted context.
pub fn caller_did(context: &Option<Vec<u8>>) -> Result<String, String> {
    if let Some(bytes) = context {
        if let Ok(dc) = serde_json::from_slice::<DynamicContext>(bytes) {
            if let Some(did) = dc.authenticated_did.filter(|d| !d.is_empty()) {
                return Ok(did);
            }
        }
    }

    if let Some(raw) = crate::host::tenant::tenant_context::calling_user_did() {
        return Ok(format!("did:t3n:{}", hex::encode(raw)));
    }

    Err("no authenticated caller in context".into())
}

pub fn cluster_timestamp_secs() -> u64 {
    crate::host::tenant::tenant_context::cluster_timestamp_secs()
}
