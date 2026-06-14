use crate::quote;
use crate::shadow::load;
use crate::types::{DarkQuoteInput, ExecuteFillInput, ShadowIdInput};
use crate::verify::verify_step;

pub fn get_dark_quote(input: &[u8], context: &Option<Vec<u8>>) -> Result<Vec<u8>, String> {
    let req: DarkQuoteInput =
        serde_json::from_slice(input).map_err(|e| format!("invalid get-dark-quote input: {e}"))?;
    let ok = verify_step(&req.shadow_intent_id, "get-dark-quote", context)?;

    let bound = quote::bind_dark_quote(&req, &req.shadow_intent_id)?;

    serde_json::to_vec(&serde_json::json!({
        "status": "ok",
        "shadow_intent_id": ok.shadow_intent_id,
        "step_index": ok.step_index,
        "function": ok.function,
        "routing": "private",
        "mempool": "bypassed",
        "provider": "uniswap_v3",
        "chain_id": 84532,
        "dark_quote": {
            "route_id": bound.route_id,
            "price": bound.price,
            "buy_amount": bound.buy_amount,
            "sell_amount": bound.sell_amount,
            "expires_at": bound.expires_at,
            "token_in": bound.token_in,
            "token_out": bound.token_out,
            "fee_tier": bound.fee_tier,
            "liquidity_source": "uniswap_v3",
        }
    }))
    .map_err(|e| e.to_string())
}

pub fn execute_fill(input: &[u8], context: &Option<Vec<u8>>) -> Result<Vec<u8>, String> {
    let req: ExecuteFillInput =
        serde_json::from_slice(input).map_err(|e| format!("invalid execute-fill input: {e}"))?;
    let ok = verify_step(&req.shadow_intent_id, "execute-fill", context)?;

    let shadow = load(&req.shadow_intent_id)?;
    let expected = shadow
        .route_id
        .as_ref()
        .ok_or("SHADOW_VIOLATION: no bound quote on shadow intent")?;
    if expected != &req.route_id {
        return Err(format!(
            "SHADOW_VIOLATION: route_id mismatch (expected {expected})"
        ));
    }

    serde_json::to_vec(&serde_json::json!({
        "status": "ok",
        "shadow_intent_id": ok.shadow_intent_id,
        "step_index": ok.step_index,
        "function": ok.function,
        "fill": {
            "route_id": req.route_id,
            "settlement": "dark_pool",
            "tx_visibility": "private",
            "fee_tier": shadow.fee_tier,
            "buy_amount": shadow.buy_amount,
            "sell_amount": shadow.sell_amount,
        }
    }))
    .map_err(|e| e.to_string())
}

pub fn submit_public_mempool(input: &[u8], context: &Option<Vec<u8>>) -> Result<Vec<u8>, String> {
    let req: ShadowIdInput = serde_json::from_slice(input)
        .map_err(|e| format!("invalid submit-public-mempool input: {e}"))?;
    let _ = verify_step(&req.shadow_intent_id, "submit-public-mempool", context);
    Err("SHADOW_VIOLATION: submit-public-mempool exposes intent to MEV — never permitted".into())
}
