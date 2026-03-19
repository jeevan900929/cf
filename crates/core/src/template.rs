use wasm_bindgen::prelude::*;

pub fn render_template_inner(template: &str, vars_json: &str) -> Result<String, String> {
    let vars: serde_json::Value =
        serde_json::from_str(vars_json).map_err(|e| format!("JSON error: {e}"))?;

    let obj = vars
        .as_object()
        .ok_or_else(|| "vars must be a JSON object".to_string())?;

    let mut result = template.to_string();
    // Replace {{key}} placeholders with values from the JSON object.
    for (key, value) in obj {
        let placeholder = format!("{{{{{key}}}}}");
        let replacement = match value {
            serde_json::Value::String(s) => s.clone(),
            other => other.to_string(),
        };
        result = result.replace(&placeholder, &replacement);
    }

    // Remove any remaining unreplaced placeholders.
    let re_start = "{{";
    while let Some(start) = result.find(re_start) {
        if let Some(end) = result[start + 2..].find("}}") {
            result.replace_range(start..start + 2 + end + 2, "");
        } else {
            break;
        }
    }

    Ok(result)
}

#[wasm_bindgen(js_name = "renderTemplate")]
pub fn render_template(template: &str, vars_json: &str) -> Result<String, JsError> {
    render_template_inner(template, vars_json).map_err(|e| JsError::new(&e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_placeholders() {
        let result = render_template_inner(
            "Job {{id}} for {{name}}: {{message}}",
            r#"{"id":"j1","name":"Ada","message":"Hello"}"#,
        )
        .unwrap();
        assert_eq!(result, "Job j1 for Ada: Hello");
    }

    #[test]
    fn missing_key_becomes_empty() {
        let result =
            render_template_inner("{{exists}} and {{missing}}", r#"{"exists":"yes"}"#).unwrap();
        assert_eq!(result, "yes and ");
    }

    #[test]
    fn handles_numeric_values() {
        let result = render_template_inner("count: {{n}}", r#"{"n":42}"#).unwrap();
        assert_eq!(result, "count: 42");
    }
}
