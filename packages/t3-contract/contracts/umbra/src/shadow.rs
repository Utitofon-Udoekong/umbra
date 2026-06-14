use crate::context::{caller_did, cluster_timestamp_secs};
use crate::kv::{self, MAP_SHADOWS};
use crate::rules;
use crate::types::{CommitTradeInput, ShadowIdInput, ShadowRecord};

const SEQ_KEY: &[u8] = b"__seq__";

fn validate_user_address(addr: &str) -> Result<(), String> {
    let a = addr.trim();
    if a.len() != 42 || !a.starts_with("0x") {
        return Err("user_address must be 0x-prefixed 20-byte hex".into());
    }
    if !a[2..].chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("user_address contains invalid hex".into());
    }
    Ok(())
}

fn next_shadow_id() -> Result<String, String> {
    let seq = match kv::get(MAP_SHADOWS, SEQ_KEY)? {
        Some(bytes) => {
            let s = String::from_utf8(bytes).map_err(|e| e.to_string())?;
            s.parse::<u64>().unwrap_or(0) + 1
        }
        None => 1,
    };
    kv::put(MAP_SHADOWS, SEQ_KEY, seq.to_string().as_bytes())?;
    Ok(format!("shadow-{seq}"))
}

fn save_shadow(shadow: &ShadowRecord) -> Result<(), String> {
    let bytes = serde_json::to_vec(shadow).map_err(|e| e.to_string())?;
    kv::put(
        MAP_SHADOWS,
        shadow.shadow_intent_id.as_bytes(),
        &bytes,
    )
}

pub fn load(shadow_intent_id: &str) -> Result<ShadowRecord, String> {
    let bytes = kv::get(MAP_SHADOWS, shadow_intent_id.as_bytes())?
        .ok_or_else(|| format!("shadow intent not found: {shadow_intent_id}"))?;
    serde_json::from_slice(&bytes).map_err(|e| format!("invalid shadow record: {e}"))
}

pub fn commit_trade(input: &[u8], context: &Option<Vec<u8>>) -> Result<Vec<u8>, String> {
    let req: CommitTradeInput =
        serde_json::from_slice(input).map_err(|e| format!("invalid commit-trade input: {e}"))?;
    if req.steps.is_empty() {
        return Err("steps must not be empty".into());
    }

    let policy = rules::load()?;
    if req.steps.len() as u32 > policy.max_steps_per_intent {
        return Err(format!(
            "too many steps (max {})",
            policy.max_steps_per_intent
        ));
    }

    for step in &req.steps {
        if policy.denied_functions.iter().any(|d| d == step) {
            return Err(format!("step '{step}' is denied by policy"));
        }
        if !policy.allowed_functions.iter().any(|a| a == step) {
            return Err(format!("step '{step}' is not in allowed_functions"));
        }
    }

    if let (Some(tin), Some(tout)) = (&req.token_in, &req.token_out) {
        let pair = format!("{tin}/{tout}");
        if !policy.allowed_pairs.is_empty() && !policy.allowed_pairs.iter().any(|p| p == &pair) {
            return Err(format!("pair '{pair}' not allowed by pool policy"));
        }
    }

    if let Some(slip) = req.max_slippage_bps {
        if slip > policy.max_slippage_bps {
            return Err(format!(
                "max_slippage_bps {slip} exceeds policy cap {}",
                policy.max_slippage_bps
            ));
        }
    }

    let user_address = req
        .user_address
        .as_ref()
        .ok_or("user_address required")?;
    validate_user_address(user_address)?;

    let agent_did = caller_did(context)?;
    let now = cluster_timestamp_secs();
    let shadow_intent_id = next_shadow_id()?;

    let shadow = ShadowRecord {
        shadow_intent_id: shadow_intent_id.clone(),
        agent_did,
        steps: req.steps.clone(),
        current_index: 0,
        status: "active".into(),
        created_at_secs: now,
        expires_at_secs: now.saturating_add(policy.max_intent_ttl_secs),
        token_in: req.token_in.clone(),
        token_out: req.token_out.clone(),
        amount: req.amount.clone(),
        max_slippage_bps: req.max_slippage_bps,
        route_id: None,
        quote_hash: None,
        buy_amount: None,
        sell_amount: None,
        fee_tier: None,
        user_address: Some(user_address.clone()),
    };
    save_shadow(&shadow)?;

    serde_json::to_vec(&serde_json::json!({
        "shadow_intent_id": shadow_intent_id,
        "steps_count": req.steps.len(),
        "agent_did": shadow.agent_did,
        "expires_at_secs": shadow.expires_at_secs,
        "token_in": shadow.token_in,
        "token_out": shadow.token_out,
        "amount": shadow.amount,
        "user_address": user_address,
    }))
    .map_err(|e| e.to_string())
}

pub fn get_shadow_status(input: &[u8]) -> Result<Vec<u8>, String> {
    let req: ShadowIdInput = serde_json::from_slice(input)
        .map_err(|e| format!("invalid get-shadow-status input: {e}"))?;
    let shadow = load(&req.shadow_intent_id)?;
    serde_json::to_vec(&serde_json::json!({
        "shadow_intent_id": shadow.shadow_intent_id,
        "agent_did": shadow.agent_did,
        "steps": shadow.steps,
        "current_index": shadow.current_index,
        "status": shadow.status,
        "expires_at_secs": shadow.expires_at_secs,
    }))
    .map_err(|e| e.to_string())
}

pub fn persist(shadow: &ShadowRecord) -> Result<(), String> {
    save_shadow(shadow)
}

pub fn advance_shadow(shadow: &mut ShadowRecord) -> Result<(), String> {
    shadow.current_index = shadow.current_index.saturating_add(1);
    if shadow.current_index as usize >= shadow.steps.len() {
        shadow.status = "completed".into();
    }
    save_shadow(shadow)
}
