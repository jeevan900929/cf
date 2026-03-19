use wasm_bindgen::prelude::*;

use crate::greeting::create_greeting_struct;

pub const SERVICE_NAME_STR: &str = "cf-boilerplate";

#[wasm_bindgen(js_name = "SERVICE_NAME")]
pub fn service_name() -> String {
    SERVICE_NAME_STR.to_string()
}

#[wasm_bindgen(js_name = "buildHelloResponse")]
pub fn build_hello_response(name: Option<String>) -> String {
    let g = create_greeting_struct(name.as_deref());
    serde_json::json!({
        "ok": true,
        "service": SERVICE_NAME_STR,
        "subject": g.subject,
        "message": g.message,
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_response_with_name() {
        let json = build_hello_response(Some("Ada".to_string()));
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["ok"], true);
        assert_eq!(v["service"], "cf-boilerplate");
        assert_eq!(v["subject"], "Ada");
        assert_eq!(v["message"], "Hello, Ada!");
    }

    #[test]
    fn builds_response_default() {
        let json = build_hello_response(None);
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["subject"], "Cloudflare");
    }
}
