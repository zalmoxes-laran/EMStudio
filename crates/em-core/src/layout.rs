//! Layout engine — constrained Sugiyama with semantic lane assignment.
//!
//! See docs/ARCHITECTURE.md §4. Pipeline implemented in v1:
//!   1. lane assignment (SEMANTIC): epoch lanes read from the graph
//!      (`has_first_epoch` edges; paradata inherits the lane of the unit it
//!      documents by walking the provenance chain); unassigned nodes fall
//!      into a trailing lane;
//!   2. intra-lane sub-layering by paradata role
//!      (unit 0 → property 1 → combiner 2 → extractor 3 → document 4);
//!   3. crossing minimisation: barycenter sweeps over the global layer
//!      sequence (deterministic, stable sorts);
//!   4. x-coordinate assignment: sequential packing with minimum distances,
//!      layers centred on a common axis.
//!
//! v2 (planned): group-contiguity constraints, sector columns, orthogonal
//! edge routing with ports, "from sketch" incremental mode, Brandes–Köpf
//! compaction. Determinism is a contract: same document → same layout,
//! across desktop, server and CLI (CI-diffable).

use crate::model::{Graph, Layout, Rect, Swimlane};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct LayoutOptions {
    // General (yEd-parity, docs/yed-parity.md)
    pub symmetric_placement: bool,
    pub use_sketch: bool, // v2: treat current positions as soft constraints
    pub node_to_node: f64,
    pub node_to_edge: f64,
    pub edge_to_edge: f64,
    pub layer_to_layer: f64,
    pub time_budget_ms: u64,
    // Edges (consumed by the v2 router)
    pub min_first_segment: f64,
    pub min_last_segment: f64,
    pub min_length: f64,
    pub min_edge_distance: f64,
    pub edge_grouping: bool,
    pub straighten: bool,
    // Groups
    pub respect_groups: bool,
    pub group_compaction_strong: bool,
    // Swimlanes
    pub lane_min_insets: f64,
    pub compact_lanes: bool,
    // Node geometry defaults (until per-type sizes come from the palette)
    pub default_node_w: f64,
    pub default_node_h: f64,
    // Crossing-minimisation sweeps
    pub barycenter_sweeps: u32,
    /// Maximum nodes per sub-row before a layer wraps (compaction v2):
    /// keeps the matrix top-down instead of arbitrarily wide. 0 = auto
    /// (≈ 2·√N, clamped to 8..40).
    pub max_row_nodes: usize,
}

impl Default for LayoutOptions {
    fn default() -> Self {
        Self {
            symmetric_placement: true,
            use_sketch: false,
            node_to_node: 30.0,
            node_to_edge: 15.0,
            edge_to_edge: 15.0,
            layer_to_layer: 40.0,
            time_budget_ms: 30_000,
            min_first_segment: 10.0,
            min_last_segment: 15.0,
            min_length: 20.0,
            min_edge_distance: 15.0,
            edge_grouping: false,
            straighten: false,
            respect_groups: true,
            group_compaction_strong: true,
            lane_min_insets: 24.0,
            compact_lanes: true,
            default_node_w: 90.0,
            default_node_h: 32.0,
            barycenter_sweeps: 4,
            max_row_nodes: 0,
        }
    }
}

/// Paradata role rank within a lane (sub-layer). Unknown types rank with units.
fn role_rank(node_type: &str) -> u32 {
    match node_type {
        "property" => 1,
        "combiner" => 2,
        "extractor" => 3,
        "document" => 4,
        _ => 0,
    }
}

/// Edge types along which a paradata node inherits the lane of its "anchor".
/// Directions as canonically stored: unit --has_property--> property,
/// property --has_data_provenance--> extractor/combiner,
/// combiner --combines--> extractor, extractor --extracted_from--> document.
const CHAIN_EDGES: [&str; 4] = [
    "has_property",
    "has_data_provenance",
    "combines",
    "extracted_from",
];

/// Compute a layout for `graph`. Pure function: no I/O, deterministic.
pub fn compute(graph: &Graph, opts: &LayoutOptions) -> Layout {
    let node_ix: HashMap<&str, usize> = graph
        .nodes
        .iter()
        .enumerate()
        .map(|(i, n)| (n.id.as_str(), i))
        .collect();

    // ── 1a. epoch lanes, newest first ────────────────────────────────────
    // Epoch order: descending by numeric `start_time` in node.data when
    // available (EM convention: most recent epoch on top), otherwise stable
    // by declaration order.
    let mut epochs: Vec<(usize, f64)> = graph
        .nodes
        .iter()
        .enumerate()
        .filter(|(_, n)| n.node_type == "epoch" || n.node_type == "EpochNode")
        .map(|(i, n)| {
            let start = n
                .data
                .get("start_time")
                .and_then(|v| v.as_f64())
                .unwrap_or(f64::MIN);
            (i, start)
        })
        .collect();
    epochs.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let lane_of_epoch: HashMap<usize, usize> = epochs
        .iter()
        .enumerate()
        .map(|(lane, (ix, _))| (*ix, lane))
        .collect();
    let unassigned_lane = epochs.len(); // trailing lane

    // ── 1b. lane of each node ────────────────────────────────────────────
    // Direct: has_first_epoch edge → epoch's lane. Epoch nodes live in their
    // own lane. Everything else: inherit through the paradata chain (walk
    // reversed CHAIN_EDGES from anchored nodes), else unassigned.
    let n = graph.nodes.len();
    let mut lane: Vec<Option<usize>> = vec![None; n];
    for (i, node) in graph.nodes.iter().enumerate() {
        if let Some(l) = lane_of_epoch.get(&i) {
            lane[i] = Some(*l);
        } else if node.node_type == "epoch" || node.node_type == "EpochNode" {
            lane[i] = Some(unassigned_lane);
        }
    }
    for e in &graph.edges {
        if e.edge_type == "has_first_epoch" {
            if let (Some(&s), Some(&t)) = (node_ix.get(e.source.as_str()), node_ix.get(e.target.as_str())) {
                if let Some(l) = lane_of_epoch.get(&t) {
                    lane[s] = Some(*l);
                }
            }
        }
    }
    // Chain inheritance: propagate source lane to target along chain edges,
    // repeated until fixpoint (chains are short; bounded by 8 sweeps).
    for _ in 0..8 {
        let mut changed = false;
        for e in &graph.edges {
            if CHAIN_EDGES.contains(&e.edge_type.as_str()) {
                if let (Some(&s), Some(&t)) = (node_ix.get(e.source.as_str()), node_ix.get(e.target.as_str())) {
                    if lane[t].is_none() && lane[s].is_some() {
                        lane[t] = lane[s];
                        changed = true;
                    }
                }
            }
        }
        if !changed {
            break;
        }
    }
    let lane: Vec<usize> = lane
        .into_iter()
        .map(|l| l.unwrap_or(unassigned_lane))
        .collect();

    // ── 2. global layers = (lane, role_rank) ─────────────────────────────
    let rank: Vec<u32> = graph.nodes.iter().map(|n| role_rank(&n.node_type)).collect();
    let mut layers: Vec<Vec<usize>> = Vec::new();
    let layer_key: Vec<(usize, u32)> = {
        let mut keys: Vec<(usize, u32)> = (0..n).map(|i| (lane[i], rank[i])).collect();
        keys.sort();
        keys.dedup();
        let key_ix: HashMap<(usize, u32), usize> =
            keys.iter().enumerate().map(|(ix, k)| (*k, ix)).collect();
        layers.resize(keys.len(), Vec::new());
        for i in 0..n {
            layers[key_ix[&(lane[i], rank[i])]].push(i);
        }
        keys
    };

    // ── 3. crossing minimisation (barycenter sweeps) ─────────────────────
    // position of node within its layer
    let mut pos_in_layer: Vec<usize> = vec![0; n];
    let refresh = |layers: &Vec<Vec<usize>>, pos: &mut Vec<usize>| {
        for layer in layers {
            for (p, &i) in layer.iter().enumerate() {
                pos[i] = p;
            }
        }
    };
    refresh(&layers, &mut pos_in_layer);

    // adjacency (undirected, for barycenter)
    let mut adj: Vec<Vec<usize>> = vec![Vec::new(); n];
    for e in &graph.edges {
        if let (Some(&s), Some(&t)) = (node_ix.get(e.source.as_str()), node_ix.get(e.target.as_str())) {
            adj[s].push(t);
            adj[t].push(s);
        }
    }

    for sweep in 0..opts.barycenter_sweeps {
        let forward = sweep % 2 == 0;
        let order: Vec<usize> = if forward {
            (0..layers.len()).collect()
        } else {
            (0..layers.len()).rev().collect()
        };
        for li in order {
            let mut scored: Vec<(f64, usize, usize)> = layers[li]
                .iter()
                .map(|&i| {
                    let neigh: Vec<f64> = adj[i]
                        .iter()
                        .filter(|&&j| (lane[j], rank[j]) != layer_key[li])
                        .map(|&j| pos_in_layer[j] as f64)
                        .collect();
                    let bc = if neigh.is_empty() {
                        pos_in_layer[i] as f64
                    } else {
                        neigh.iter().sum::<f64>() / neigh.len() as f64
                    };
                    (bc, pos_in_layer[i], i)
                })
                .collect();
            // stable: barycenter, then previous position (determinism)
            scored.sort_by(|a, b| {
                a.0.partial_cmp(&b.0)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then(a.1.cmp(&b.1))
            });
            layers[li] = scored.into_iter().map(|(_, _, i)| i).collect();
            refresh(&layers, &mut pos_in_layer);
        }
    }

    // ── 3b. group contiguity within layers (compaction v2) ───────────────
    // Members of the same activity / paradata group become contiguous
    // blocks; blocks keep the barycenter flow (ordered by mean position).
    if opts.respect_groups {
        let mut member_group: Vec<Option<usize>> = vec![None; n];
        for e in &graph.edges {
            if e.edge_type == "is_in_activity" || e.edge_type == "is_in_paradata_nodegroup" {
                if let (Some(&s), Some(&t)) =
                    (node_ix.get(e.source.as_str()), node_ix.get(e.target.as_str()))
                {
                    member_group[s] = Some(t);
                }
            }
        }
        for layer in layers.iter_mut() {
            let mut blocks: Vec<(f64, usize, Vec<usize>)> = Vec::new();
            let mut block_of_group: HashMap<usize, usize> = HashMap::new();
            for &i in layer.iter() {
                match member_group[i] {
                    Some(g) => {
                        let bix = *block_of_group.entry(g).or_insert_with(|| {
                            blocks.push((0.0, usize::MAX, Vec::new()));
                            blocks.len() - 1
                        });
                        blocks[bix].2.push(i);
                    }
                    None => blocks.push((0.0, usize::MAX, vec![i])),
                }
            }
            for b in blocks.iter_mut() {
                b.0 = b.2.iter().map(|&i| pos_in_layer[i] as f64).sum::<f64>()
                    / b.2.len() as f64;
                b.1 = b.2.iter().map(|&i| pos_in_layer[i]).min().unwrap_or(0);
            }
            blocks.sort_by(|a, b| {
                a.0.partial_cmp(&b.0)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then(a.1.cmp(&b.1))
            });
            *layer = blocks.into_iter().flat_map(|b| b.2).collect();
        }
        refresh(&layers, &mut pos_in_layer);
    }

    // ── 4. coordinates (compaction v2: layers wrap into sub-rows) ────────
    let node_w = opts.default_node_w;
    let node_h = opts.default_node_h;
    let max_cols: usize = if opts.max_row_nodes > 0 {
        opts.max_row_nodes
    } else {
        (((n as f64).sqrt() * 2.0).ceil() as usize).clamp(8, 40)
    };
    let sub_gap = opts.layer_to_layer * 0.45;

    // wrapped sub-rows per layer (barycenter + contiguity order preserved)
    let chunked: Vec<Vec<Vec<usize>>> = layers
        .iter()
        .map(|layer| layer.chunks(max_cols).map(|c| c.to_vec()).collect())
        .collect();

    // lane heights from the sub-row counts of each rank present in the lane
    let lane_count = unassigned_lane + 1;
    let mut layers_of_lane: Vec<Vec<usize>> = vec![Vec::new(); lane_count];
    for (li, &(l, _)) in layer_key.iter().enumerate() {
        layers_of_lane[l].push(li); // layer_key is sorted by (lane, rank)
    }
    let mut lane_y = vec![0.0f64; lane_count];
    let mut lane_h = vec![0.0f64; lane_count];
    let mut layer_y_in_lane = vec![0.0f64; layers.len()];
    let mut y_cursor = 0.0;
    for l in 0..lane_count {
        let mut h = opts.lane_min_insets;
        for (k, &li) in layers_of_lane[l].iter().enumerate() {
            if k > 0 {
                h += opts.layer_to_layer;
            }
            layer_y_in_lane[li] = h;
            let rows = chunked[li].len().max(1) as f64;
            h += rows * node_h + (rows - 1.0) * sub_gap;
        }
        h += opts.lane_min_insets;
        if layers_of_lane[l].is_empty() {
            h = opts.lane_min_insets * 2.0 + node_h;
        }
        lane_y[l] = y_cursor;
        lane_h[l] = h;
        y_cursor += h;
    }

    // widest sub-row, for centring and canvas width
    let max_row_w = chunked
        .iter()
        .flat_map(|c| c.iter())
        .map(|row| row.len() as f64 * (node_w + opts.node_to_node) - opts.node_to_node)
        .fold(0.0f64, f64::max)
        .max(node_w);

    let mut positions: std::collections::BTreeMap<String, Rect> = std::collections::BTreeMap::new();
    for (li, chunks) in chunked.iter().enumerate() {
        let (l, _) = layer_key[li];
        for (ri, row) in chunks.iter().enumerate() {
            let y = lane_y[l] + layer_y_in_lane[li] + ri as f64 * (node_h + sub_gap);
            let row_w = row.len() as f64 * (node_w + opts.node_to_node) - opts.node_to_node;
            let x0 = if opts.symmetric_placement {
                (max_row_w - row_w) / 2.0
            } else {
                0.0
            };
            for (p, &i) in row.iter().enumerate() {
                positions.insert(
                    graph.nodes[i].id.clone(),
                    Rect {
                        x: x0 + p as f64 * (node_w + opts.node_to_node),
                        y,
                        w: node_w,
                        h: node_h,
                    },
                );
            }
        }
    }

    let swimlanes: Vec<Swimlane> = epochs
        .iter()
        .enumerate()
        .map(|(order, (ix, _))| Swimlane {
            epoch_id: graph.nodes[*ix].id.clone(),
            order: order as u32,
            y: lane_y[order],
            height: lane_h[order],
        })
        .collect();

    Layout {
        canvas: crate::model::Canvas {
            title: graph.name.clone(),
            width: max_row_w,
            height: y_cursor,
        },
        swimlanes,
        sectors: Vec::new(),
        positions,
        folded_groups: Vec::new(),
        group_spaces: std::collections::BTreeMap::new(),
        edge_routes: std::collections::BTreeMap::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Edge, Graph, Node};
    use std::collections::HashMap;

    fn node(id: &str, t: &str) -> Node {
        Node {
            id: id.into(),
            node_type: t.into(),
            name: None,
            description: None,
            data: std::collections::BTreeMap::new(),
        }
    }
    fn epoch(id: &str, start: f64) -> Node {
        let mut n = node(id, "epoch");
        n.data.insert("start_time".into(), serde_json::json!(start));
        n
    }
    fn edge(id: &str, t: &str, s: &str, tg: &str) -> Edge {
        Edge {
            id: id.into(),
            edge_type: t.into(),
            source: s.into(),
            target: tg.into(),
        }
    }

    fn fixture() -> Graph {
        Graph {
            graph_id: "g".into(),
            name: Some("test".into()),
            description: None,
            nodes: vec![
                epoch("EP_modern", 1900.0),
                epoch("EP_roman", -27.0),
                node("US1", "US"),
                node("US2", "US"),
                node("PR1", "property"),
                node("EX1", "extractor"),
                node("D1", "document"),
            ],
            edges: vec![
                edge("e1", "has_first_epoch", "US1", "EP_roman"),
                edge("e2", "has_first_epoch", "US2", "EP_modern"),
                edge("e3", "has_property", "US1", "PR1"),
                edge("e4", "has_data_provenance", "PR1", "EX1"),
                edge("e5", "extracted_from", "EX1", "D1"),
                edge("e6", "is_after", "US2", "US1"),
            ],
            data: std::collections::BTreeMap::new(),
        }
    }

    #[test]
    fn lanes_newest_first_and_units_assigned() {
        let g = fixture();
        let layout = compute(&g, &LayoutOptions::default());
        assert_eq!(layout.swimlanes.len(), 2);
        // newest (modern, start 1900) on top → order 0
        assert_eq!(layout.swimlanes[0].epoch_id, "EP_modern");
        assert_eq!(layout.swimlanes[1].epoch_id, "EP_roman");
        let us1 = &layout.positions["US1"];
        let us2 = &layout.positions["US2"];
        // US2 (modern) above US1 (roman)
        assert!(us2.y < us1.y);
    }

    #[test]
    fn paradata_inherits_lane_and_ranks_below_unit() {
        let g = fixture();
        let layout = compute(&g, &LayoutOptions::default());
        let us1 = &layout.positions["US1"];
        let pr = &layout.positions["PR1"];
        let ex = &layout.positions["EX1"];
        let d = &layout.positions["D1"];
        // same lane as US1 (roman), stacked in rank order below the unit
        assert!(pr.y > us1.y);
        assert!(ex.y > pr.y);
        assert!(d.y > ex.y);
        // and inside the roman lane
        let roman = &layout.swimlanes[1];
        for r in [pr, ex, d] {
            assert!(r.y >= roman.y && r.y <= roman.y + roman.height);
        }
    }

    #[test]
    fn no_overlap_within_layer_and_deterministic() {
        let g = fixture();
        let opts = LayoutOptions::default();
        let a = compute(&g, &opts);
        let b = compute(&g, &opts);
        assert_eq!(
            serde_json::to_string(&a).unwrap(),
            serde_json::to_string(&b).unwrap(),
            "layout must be deterministic"
        );
        // nodes sharing (y) must not overlap in x
        let mut by_y: HashMap<i64, Vec<&Rect>> = HashMap::new();
        for r in a.positions.values() {
            by_y.entry(r.y as i64).or_default().push(r);
        }
        for row in by_y.values() {
            for (i, r1) in row.iter().enumerate() {
                for r2 in row.iter().skip(i + 1) {
                    assert!(
                        r1.x + r1.w <= r2.x || r2.x + r2.w <= r1.x,
                        "overlap in layer"
                    );
                }
            }
        }
    }
}
