//! Umbra — shields institutional trade intent inside T3N TEE contracts.
#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
extern crate alloc;

pub const CONTRACT_VERSION: &str = "0.2.4";

wit_bindgen::generate!({
    world: "umbra",
    path: "wit",
    additional_derives: [
        serde::Deserialize,
        serde::Serialize,
    ],
    generate_all,
});

mod actions;
mod context;
mod kv;
mod quote;
mod rules;
mod shadow;
mod travel;
mod types;
mod verify;

struct Component;

fn dispatch(
    input: Option<alloc::vec::Vec<u8>>,
    context: &Option<alloc::vec::Vec<u8>>,
    f: fn(&[u8], &Option<alloc::vec::Vec<u8>>) -> Result<alloc::vec::Vec<u8>, alloc::string::String>,
) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
    let bytes = input.ok_or("missing input")?;
    f(&bytes, context)
}

#[cfg(target_arch = "wasm32")]
impl exports::z::umbra::contracts::Guest for Component {
    fn set_pool_policy(
        req: exports::z::umbra::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let bytes = req.input.ok_or("set-pool-policy: missing input")?;
        rules::set_pool_policy(&bytes)
    }

    fn commit_trade(
        req: exports::z::umbra::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        dispatch(req.input, &req.context, shadow::commit_trade)
    }

    fn get_shadow_status(
        req: exports::z::umbra::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let bytes = req.input.ok_or("get-shadow-status: missing input")?;
        shadow::get_shadow_status(&bytes)
    }

    fn get_dark_quote(
        req: exports::z::umbra::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        dispatch(req.input, &req.context, actions::get_dark_quote)
    }

    fn execute_fill(
        req: exports::z::umbra::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        dispatch(req.input, &req.context, actions::execute_fill)
    }

    fn submit_public_mempool(
        req: exports::z::umbra::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        dispatch(req.input, &req.context, actions::submit_public_mempool)
    }

    fn book_travel(
        req: exports::z::umbra::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        dispatch(req.input, &req.context, travel::book_travel)
    }
}

#[cfg(target_arch = "wasm32")]
export!(Component);

#[cfg(test)]
mod tests {
    use super::CONTRACT_VERSION;

    #[test]
    fn contract_version_is_set() {
        assert_eq!(CONTRACT_VERSION, "0.2.4");
    }
}
