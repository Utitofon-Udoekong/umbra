//! Bind orchestrator-supplied Uniswap QuoterV2 results inside TEE policy.
use crate::rules;
use crate::shadow::{load, persist};
use crate::types::DarkQuoteInput;

pub struct BoundQuote {
    pub route_id: String,
    pub price: String,
    pub expires_at: String,
    pub buy_amount: String,
    pub sell_amount: String,
    pub fee_tier: u32,
    pub token_in: String,
    pub token_out: String,
}

fn route_id_for_quote(
    token_in: &str,
    token_out: &str,
    sell_amount: &str,
    buy_amount: &str,
    fee_tier: u32,
) -> String {
    format!("uni-{token_in}-{token_out}-{sell_amount}-{buy_amount}-{fee_tier}")
}

pub fn bind_dark_quote(req: &DarkQuoteInput, shadow_intent_id: &str) -> Result<BoundQuote, String> {
    let sell_amount = req
        .sell_amount
        .as_ref()
        .ok_or("sell_amount required")?;
    let buy_amount = req
        .buy_amount
        .as_ref()
        .ok_or("buy_amount required")?;
    let fee_tier = req.fee_tier.ok_or("fee_tier required")?;
    let expires_at = req
        .expires_at
        .as_ref()
        .ok_or("expires_at required")?;

    let mut shadow = load(shadow_intent_id)?;

    let token_in = req
        .token_in
        .clone()
        .or(shadow.token_in.clone())
        .unwrap_or_else(|| "USDC".into());
    let token_out = req
        .token_out
        .clone()
        .or(shadow.token_out.clone())
        .unwrap_or_else(|| "WETH".into());

    if let Some(ref committed) = shadow.token_in {
        if &token_in != committed {
            return Err(format!("SHADOW_VIOLATION: token_in mismatch (expected {committed})"));
        }
    }
    if let Some(ref committed) = shadow.token_out {
        if &token_out != committed {
            return Err(format!("SHADOW_VIOLATION: token_out mismatch (expected {committed})"));
        }
    }
    if let Some(ref committed) = shadow.amount {
        if sell_amount != committed {
            return Err(format!("SHADOW_VIOLATION: sell_amount mismatch (expected {committed})"));
        }
    }

    if let Some(ref req_user) = req.user_address {
        if let Some(ref committed) = shadow.user_address {
            if !req_user.eq_ignore_ascii_case(committed) {
                return Err(format!(
                    "SHADOW_VIOLATION: user_address mismatch (expected {committed})"
                ));
            }
        }
    }

    let policy = rules::load().unwrap_or_default();
    if let Some(max_slip) = shadow.max_slippage_bps {
        if max_slip > policy.max_slippage_bps {
            return Err(format!(
                "SHADOW_VIOLATION: slippage {max_slip} exceeds policy {}",
                policy.max_slippage_bps
            ));
        }
    }

    let sell_u: u128 = sell_amount.parse().map_err(|_| "invalid sell_amount")?;
    let buy_u: u128 = buy_amount.parse().map_err(|_| "invalid buy_amount")?;
    if sell_u == 0 || buy_u == 0 {
        return Err("SHADOW_VIOLATION: zero quote amount".into());
    }

    let route_id = route_id_for_quote(&token_in, &token_out, sell_amount, buy_amount, fee_tier);

    shadow.route_id = Some(route_id.clone());
    shadow.buy_amount = Some(buy_amount.clone());
    shadow.sell_amount = Some(sell_amount.clone());
    shadow.fee_tier = Some(fee_tier);
    shadow.quote_hash = Some(route_id.clone());
    persist(&shadow)?;

    Ok(BoundQuote {
        route_id,
        price: buy_amount.clone(),
        expires_at: expires_at.clone(),
        buy_amount: buy_amount.clone(),
        sell_amount: sell_amount.clone(),
        fee_tier,
        token_in,
        token_out,
    })
}
