use crate::context::{caller_did, cluster_timestamp_secs};
use crate::kv::{self, MAP_VIOLATIONS};
use crate::rules;
use crate::shadow::{advance_shadow, load, persist};
use crate::types::{PoolPolicy, ViolationRecord};

pub struct VerifyOk {
    pub shadow_intent_id: String,
    pub step_index: u32,
    pub function: String,
}

fn record_violation(
    shadow_intent_id: &str,
    agent_did: &str,
    attempted: &str,
    expected: Option<&str>,
    reason: &str,
) -> Result<(), String> {
    let ts = cluster_timestamp_secs();
    let audit_id = format!("vio-{shadow_intent_id}-{attempted}-{ts}");
    let record = ViolationRecord {
        audit_id: audit_id.clone(),
        shadow_intent_id: shadow_intent_id.into(),
        agent_did: agent_did.into(),
        attempted_function: attempted.into(),
        expected_function: expected.map(str::to_string),
        reason: reason.into(),
        ts_secs: ts,
    };
    let bytes = serde_json::to_vec(&record).map_err(|e| e.to_string())?;
    kv::put(MAP_VIOLATIONS, audit_id.as_bytes(), &bytes)?;
    Ok(())
}

/// Verify the caller may execute `function` as the next committed step.
pub fn verify_step(
    shadow_intent_id: &str,
    function: &str,
    context: &Option<Vec<u8>>,
) -> Result<VerifyOk, String> {
    let policy = rules::load().unwrap_or_else(|_| PoolPolicy::default());
    if policy.denied_functions.iter().any(|d| d == function) {
        let agent = caller_did(context).unwrap_or_else(|_| "unknown".into());
        let _ = record_violation(shadow_intent_id, &agent, function, None, "function denied by policy");
        return Err(format!("SHADOW_VIOLATION: function '{function}' is denied"));
    }

    let agent_did = match caller_did(context) {
        Ok(d) => d,
        Err(e) => {
            let _ = record_violation(shadow_intent_id, "unknown", function, None, &e);
            return Err(format!("SHADOW_VIOLATION: {e}"));
        }
    };

    let mut shadow = match load(shadow_intent_id) {
        Ok(s) => s,
        Err(e) => {
            let _ = record_violation(shadow_intent_id, &agent_did, function, None, &e);
            return Err(format!("SHADOW_VIOLATION: {e}"));
        }
    };

    let now = cluster_timestamp_secs();
    if now > shadow.expires_at_secs {
        shadow.status = "expired".into();
        let _ = persist(&shadow);
        let _ = record_violation(shadow_intent_id, &agent_did, function, None, "shadow intent expired");
        return Err("SHADOW_VIOLATION: shadow intent expired".into());
    }

    if shadow.status != "active" {
        let _ = record_violation(
            shadow_intent_id,
            &agent_did,
            function,
            None,
            &format!("shadow status is {}", shadow.status),
        );
        return Err(format!("SHADOW_VIOLATION: shadow intent is {}", shadow.status));
    }

    if shadow.agent_did != agent_did {
        let _ = record_violation(shadow_intent_id, &agent_did, function, None, "agent_did mismatch");
        return Err("SHADOW_VIOLATION: shadow bound to a different agent".into());
    }

    let expected = shadow
        .steps
        .get(shadow.current_index as usize)
        .ok_or_else(|| {
            let _ = record_violation(shadow_intent_id, &agent_did, function, None, "no remaining steps");
            "SHADOW_VIOLATION: no remaining steps in plan".to_string()
        })?;

    if expected != function {
        let _ = record_violation(
            shadow_intent_id,
            &agent_did,
            function,
            Some(expected),
            "step mismatch",
        );
        return Err(format!(
            "SHADOW_VIOLATION: expected '{expected}' but got '{function}'"
        ));
    }

    let step_index = shadow.current_index;
    advance_shadow(&mut shadow)?;

    Ok(VerifyOk {
        shadow_intent_id: shadow_intent_id.into(),
        step_index,
        function: function.into(),
    })
}
