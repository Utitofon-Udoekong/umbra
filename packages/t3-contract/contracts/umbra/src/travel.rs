//! book-travel: Duffel flight search via authorized HTTP egress (no PII in WASM).

use crate::types::BookTravelInput;
use crate::verify::verify_step;

const DUFFEL_BASE: &str = "https://api.duffel.com";
const DUFFEL_VERSION: &str = "v2";

pub fn book_travel(input: &[u8], context: &Option<Vec<u8>>) -> Result<Vec<u8>, String> {
    let req: BookTravelInput =
        serde_json::from_slice(input).map_err(|e| format!("invalid book-travel input: {e}"))?;
    let ok = verify_step(&req.shadow_intent_id, "book-travel", context)?;

    #[cfg(target_arch = "wasm32")]
    {
        let offers = search_duffel(&req)?;
        return serde_json::to_vec(&serde_json::json!({
            "status": "ok",
            "shadow_intent_id": ok.shadow_intent_id,
            "step_index": ok.step_index,
            "function": ok.function,
            "routing": "private",
            "offers": offers,
        }))
        .map_err(|e| e.to_string());
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = (req, ok);
        Err("book-travel is only implemented on wasm32".into())
    }
}

#[cfg(target_arch = "wasm32")]
use crate::host::{
    interfaces::{http as http_iface, kv_store, logging},
    tenant::tenant_context,
};

#[cfg(target_arch = "wasm32")]
fn duffel_headers(api_key: &str) -> Vec<(String, String)> {
    vec![
        ("Authorization".into(), format!("Bearer {api_key}")),
        ("Duffel-Version".into(), DUFFEL_VERSION.into()),
        ("Content-Type".into(), "application/json".into()),
        ("Accept".into(), "application/json".into()),
    ]
}

#[cfg(target_arch = "wasm32")]
fn mock_offers() -> Vec<serde_json::Value> {
    vec![serde_json::json!({
        "id": "off_mock_travel",
        "total_amount": "420.00",
        "total_currency": "USD",
        "note": "mock — seed secrets.duffel_api_key for live Duffel"
    })]
}

#[cfg(target_arch = "wasm32")]
fn search_duffel(req: &BookTravelInput) -> Result<Vec<serde_json::Value>, String> {
    let tid = tenant_context::tenant_did();
    let secrets_map = format!("z:{}:secrets", hex::encode(tid));
    let api_key_bytes = match kv_store::get(&secrets_map, b"duffel_api_key") {
        Ok(Some(b)) => b,
        _ => {
            logging::info("umbra: no duffel_api_key — mock travel offers");
            return Ok(mock_offers());
        }
    };
    let api_key =
        String::from_utf8(api_key_bytes).map_err(|e| format!("invalid duffel_api_key: {e}"))?;

    let departure = req
        .departure_date
        .clone()
        .unwrap_or_else(|| "2026-09-01".into());

    let body = serde_json::json!({
        "data": {
            "slices": [{
                "origin": req.origin,
                "destination": req.destination,
                "departure_date": departure
            }],
            "passengers": [{ "type": "adult" }],
            "cabin_class": "economy"
        }
    });

    logging::info("umbra: Duffel offer request (private egress)");

    let create_resp = http_iface::call(&http_iface::Request {
        method: http_iface::Verb::Post,
        url: format!("{DUFFEL_BASE}/air/offer_requests?return_offers=false"),
        headers: Some(duffel_headers(&api_key)),
        payload: Some(serde_json::to_vec(&body).map_err(|e| e.to_string())?),
    })
    .map_err(|e| format!("duffel create: {e}"))?;

    if create_resp.code != 201 {
        logging::info(&format!("duffel create HTTP {} — mock fallback", create_resp.code));
        return Ok(mock_offers());
    }

    let parsed: serde_json::Value =
        serde_json::from_slice(&create_resp.payload).map_err(|e| format!("duffel parse: {e}"))?;
    let offer_request_id = parsed["data"]["id"]
        .as_str()
        .ok_or("missing offer_request_id")?;

    let list_resp = http_iface::call(&http_iface::Request {
        method: http_iface::Verb::Get,
        url: format!("{DUFFEL_BASE}/air/offers?offer_request_id={offer_request_id}&limit=3"),
        headers: Some(duffel_headers(&api_key)),
        payload: None,
    })
    .map_err(|e| format!("duffel list: {e}"))?;

    if list_resp.code != 200 {
        logging::info(&format!("duffel list HTTP {} — mock fallback", list_resp.code));
        return Ok(mock_offers());
    }

    let offers_json: serde_json::Value =
        serde_json::from_slice(&list_resp.payload).map_err(|e| format!("duffel offers parse: {e}"))?;

    let mut offers = Vec::new();
    if let Some(arr) = offers_json["data"].as_array() {
        for (i, o) in arr.iter().take(3).enumerate() {
            offers.push(serde_json::json!({
                "id": o["id"].as_str().unwrap_or(&format!("off_{i}")),
                "total_amount": o["total_amount"].as_str().unwrap_or("0"),
                "total_currency": o["total_currency"].as_str().unwrap_or("USD"),
            }));
        }
    }

    if offers.is_empty() {
        return Ok(mock_offers());
    }

    Ok(offers)
}
