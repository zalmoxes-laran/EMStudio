//! Connection validation against the s3Dgraphy connections datamodel.
//!
//! The datamodel JSON (`s3Dgraphy_connections_datamodel.json`) is loaded at
//! runtime; `allowed_connections.source/target` drive live socket validation
//! while the user draws an edge. NOTHING here hardcodes the EM language.
//!
//! Phase 1 stub: API surface only.

use std::collections::HashMap;

/// Parsed subset of the connections datamodel needed for validation.
#[derive(Debug, Default)]
pub struct ConnectionRules {
    /// edge_type → (allowed source classes, allowed target classes)
    pub allowed: HashMap<String, (Vec<String>, Vec<String>)>,
    /// edge_type → deprecated flag (deprecated edges are not offered).
    pub deprecated: HashMap<String, bool>,
}

impl ConnectionRules {
    /// Load from the raw JSON text of s3Dgraphy_connections_datamodel.json.
    pub fn from_datamodel_json(_json: &str) -> Result<Self, String> {
        // TODO(phase 1): parse edge_types{}.allowed_connections + deprecated.
        Err("not yet implemented".into())
    }

    /// Would connecting `source_class` → `target_class` with `edge_type` be valid?
    pub fn is_valid(&self, edge_type: &str, source_class: &str, target_class: &str) -> bool {
        match self.allowed.get(edge_type) {
            None => false,
            Some((src, tgt)) => {
                src.iter().any(|s| s == source_class) && tgt.iter().any(|t| t == target_class)
            }
        }
    }
}
