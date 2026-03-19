use base64ct::{Base64UrlUnpadded, Encoding};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use wasm_bindgen::prelude::*;

type HmacSha256 = Hmac<Sha256>;

fn base64url_encode(data: &[u8]) -> String {
    Base64UrlUnpadded::encode_string(data)
}

fn base64url_decode(input: &str) -> Result<Vec<u8>, String> {
    Base64UrlUnpadded::decode_vec(input).map_err(|e| format!("base64 decode error: {e}"))
}

pub fn sign_jwt_inner(payload_json: &str, secret: &str) -> Result<String, String> {
    let header = base64url_encode(br#"{"alg":"HS256","typ":"JWT"}"#);
    let body = base64url_encode(payload_json.as_bytes());
    let signing_input = format!("{header}.{body}");

    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).map_err(|e| format!("HMAC error: {e}"))?;
    mac.update(signing_input.as_bytes());
    let signature = base64url_encode(&mac.finalize().into_bytes());

    Ok(format!("{signing_input}.{signature}"))
}

pub fn verify_jwt_inner(
    token: &str,
    secret: &str,
    current_timestamp_secs: f64,
) -> Result<Option<String>, String> {
    let parts: Vec<&str> = token.splitn(3, '.').collect();
    if parts.len() != 3 {
        return Ok(None);
    }

    let signing_input = format!("{}.{}", parts[0], parts[1]);
    let sig_bytes = match base64url_decode(parts[2]) {
        Ok(b) => b,
        Err(_) => return Ok(None),
    };

    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).map_err(|e| format!("HMAC error: {e}"))?;
    mac.update(signing_input.as_bytes());

    if mac.verify_slice(&sig_bytes).is_err() {
        return Ok(None);
    }

    let payload_bytes = base64url_decode(parts[1])?;
    let payload_str =
        String::from_utf8(payload_bytes).map_err(|e| format!("UTF-8 error: {e}"))?;

    let payload: serde_json::Value =
        serde_json::from_str(&payload_str).map_err(|e| format!("JSON error: {e}"))?;

    if let Some(exp) = payload.get("exp").and_then(|v| v.as_f64()) {
        if current_timestamp_secs > exp {
            return Ok(None);
        }
    }

    Ok(Some(payload_str))
}

#[wasm_bindgen(js_name = "signJwt")]
pub fn sign_jwt(payload_json: &str, secret: &str) -> Result<String, JsError> {
    sign_jwt_inner(payload_json, secret).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen(js_name = "verifyJwt")]
pub fn verify_jwt(
    token: &str,
    secret: &str,
    current_timestamp_secs: f64,
) -> Result<Option<String>, JsError> {
    verify_jwt_inner(token, secret, current_timestamp_secs).map_err(|e| JsError::new(&e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_sign_verify() {
        let payload = r#"{"sub":"demo","iat":1000,"exp":2000}"#;
        let token = sign_jwt_inner(payload, "test-secret").unwrap();
        let result = verify_jwt_inner(&token, "test-secret", 1500.0).unwrap();
        assert!(result.is_some());
        let parsed: serde_json::Value = serde_json::from_str(&result.unwrap()).unwrap();
        assert_eq!(parsed["sub"], "demo");
    }

    #[test]
    fn rejects_expired_token() {
        let payload = r#"{"sub":"demo","iat":1000,"exp":2000}"#;
        let token = sign_jwt_inner(payload, "secret").unwrap();
        let result = verify_jwt_inner(&token, "secret", 3000.0).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn rejects_wrong_secret() {
        let payload = r#"{"sub":"demo","iat":1000,"exp":2000}"#;
        let token = sign_jwt_inner(payload, "secret-a").unwrap();
        let result = verify_jwt_inner(&token, "secret-b", 1500.0).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn no_exp_field_passes() {
        let payload = r#"{"sub":"demo"}"#;
        let token = sign_jwt_inner(payload, "s").unwrap();
        let result = verify_jwt_inner(&token, "s", 999999.0).unwrap();
        assert!(result.is_some());
    }

    #[test]
    fn malformed_token_returns_none() {
        assert!(verify_jwt_inner("not.a.valid-token!", "s", 0.0)
            .unwrap()
            .is_none());
    }
}
