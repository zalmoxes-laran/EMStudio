//! In-memory model. Mirrors the `.em.json` v1 sections (header/graph/layout).
//! Node/edge *types* are open strings validated against the runtime-loaded
//! s3Dgraphy datamodels — adding a node type to the JSON must never require
//! recompiling EMStudio.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Document {
    pub header: Header,
    pub graph: Graph,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout: Option<Layout>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Header {
    pub format: String,  // "em.json"
    pub version: String, // semver of the format
    #[serde(default)]
    pub datamodel_versions: BTreeMap<String, String>,
    #[serde(default)]
    pub ontology_versions: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Graph {
    pub graph_id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub nodes: Vec<Node>,
    #[serde(default)]
    pub edges: Vec<Edge>,
    /// Graph-level metadata (authors, license, embargo…), pass-through.
    #[serde(default)]
    pub data: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Node {
    pub id: String,
    /// s3Dgraphy node_type string ("US", "USVs", "property", "epoch", …).
    pub node_type: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    /// Type-specific payload, schema-free at this level.
    #[serde(default)]
    pub data: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Edge {
    pub id: String,
    /// s3Dgraphy edge_type string ("is_after", "has_property", …).
    pub edge_type: String,
    pub source: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Layout {
    #[serde(default)]
    pub canvas: Canvas,
    #[serde(default)]
    pub swimlanes: Vec<Swimlane>,
    #[serde(default)]
    pub sectors: Vec<Sector>,
    #[serde(default)]
    pub positions: BTreeMap<String, Rect>,
    /// Groups currently folded into a proxy node (hypergraph navigation).
    #[serde(default)]
    pub folded_groups: Vec<String>,
    /// Per-group-context positions (coordinates local to the group canvas).
    #[serde(default)]
    pub group_spaces: BTreeMap<String, GroupSpace>,
    #[serde(default)]
    pub edge_routes: BTreeMap<String, Vec<(f64, f64)>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Canvas {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub width: f64,
    #[serde(default)]
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Swimlane {
    pub epoch_id: String,
    pub order: u32,
    pub y: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Sector {
    pub id: String,
    pub order: u32,
    pub x: f64,
    pub width: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GroupSpace {
    #[serde(default)]
    pub positions: BTreeMap<String, Rect>,
}
