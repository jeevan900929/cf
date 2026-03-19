use wasm_bindgen::prelude::*;

pub struct Greeting {
    pub subject: String,
    pub message: String,
}

pub fn normalize_subject_str(input: Option<&str>) -> String {
    match input {
        Some(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                "Cloudflare".to_string()
            } else {
                trimmed.to_string()
            }
        }
        None => "Cloudflare".to_string(),
    }
}

pub fn create_greeting_struct(input: Option<&str>) -> Greeting {
    let subject = normalize_subject_str(input);
    let message = format!("Hello, {subject}!");
    Greeting { subject, message }
}

#[wasm_bindgen(js_name = "normalizeSubject")]
pub fn normalize_subject(input: Option<String>) -> String {
    normalize_subject_str(input.as_deref())
}

#[wasm_bindgen(js_name = "createGreeting")]
pub fn create_greeting(input: Option<String>) -> String {
    let g = create_greeting_struct(input.as_deref());
    serde_json::json!({
        "subject": g.subject,
        "message": g.message,
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_cloudflare() {
        assert_eq!(normalize_subject_str(None), "Cloudflare");
        assert_eq!(normalize_subject_str(Some("")), "Cloudflare");
        assert_eq!(normalize_subject_str(Some("   ")), "Cloudflare");
    }

    #[test]
    fn trims_name() {
        assert_eq!(normalize_subject_str(Some("  Ada  ")), "Ada");
    }

    #[test]
    fn creates_greeting() {
        let g = create_greeting_struct(Some("Cloudflare"));
        assert_eq!(g.subject, "Cloudflare");
        assert_eq!(g.message, "Hello, Cloudflare!");
    }

    #[test]
    fn creates_greeting_json() {
        let json = create_greeting(Some("Test".to_string()));
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["subject"], "Test");
        assert_eq!(v["message"], "Hello, Test!");
    }
}
