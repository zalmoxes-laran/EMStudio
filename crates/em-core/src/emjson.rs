//! `.em.json` reading/writing (v1 draft — see docs/emjson-v1-draft.md).
//!
//! Conformance rules implemented here:
//! * header.format/version mandatory; unknown MAJOR versions are rejected;
//! * unknown top-level keys are ignored (forward compatibility);
//! * layout is optional; dangling layout ids are dropped with a warning list.

use crate::model::Document;

pub const FORMAT_NAME: &str = "em.json";
pub const SUPPORTED_MAJOR: u64 = 1;

#[derive(Debug)]
pub enum EmJsonError {
    Parse(String),
    UnsupportedFormat(String),
    UnsupportedVersion(String),
}

pub fn from_str(s: &str) -> Result<(Document, Vec<String>), EmJsonError> {
    let doc: Document =
        serde_json::from_str(s).map_err(|e| EmJsonError::Parse(e.to_string()))?;
    let mut warnings = Vec::new();

    if doc.header.format != FORMAT_NAME {
        return Err(EmJsonError::UnsupportedFormat(doc.header.format.clone()));
    }
    let major = doc
        .header
        .version
        .split('.')
        .next()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
    if major != SUPPORTED_MAJOR {
        return Err(EmJsonError::UnsupportedVersion(doc.header.version.clone()));
    }

    // Drop dangling layout references (conformance rule 4).
    let mut doc = doc;
    if let Some(layout) = doc.layout.as_mut() {
        let ids: std::collections::HashSet<&str> =
            doc.graph.nodes.iter().map(|n| n.id.as_str()).collect();
        layout.positions.retain(|k, _| {
            let keep = ids.contains(k.as_str());
            if !keep {
                warnings.push(format!("layout.positions: dangling node id '{k}' dropped"));
            }
            keep
        });
    }
    Ok((doc, warnings))
}

pub fn to_string_pretty(doc: &Document) -> Result<String, EmJsonError> {
    serde_json::to_string_pretty(doc).map_err(|e| EmJsonError::Parse(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_minimal() {
        let src = r#"{
            "header": {"format": "em.json", "version": "1.0"},
            "graph": {"graph_id": "g1",
                      "nodes": [{"id": "US1", "node_type": "US"}],
                      "edges": []}
        }"#;
        let (doc, warnings) = from_str(src).expect("parse");
        assert!(warnings.is_empty());
        assert_eq!(doc.graph.nodes[0].node_type, "US");
        let out = to_string_pretty(&doc).expect("serialize");
        let (doc2, _) = from_str(&out).expect("reparse");
        assert_eq!(doc2.graph.graph_id, "g1");
    }

    #[test]
    fn rejects_unknown_major() {
        let src = r#"{"header": {"format": "em.json", "version": "2.0"},
                      "graph": {"graph_id": "g"}}"#;
        assert!(matches!(
            from_str(src),
            Err(EmJsonError::UnsupportedVersion(_))
        ));
    }
}
