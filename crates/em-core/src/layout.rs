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

    // ── 2. vertical sub-layering: directed edges point DOWN ──────────────
    // Arrows flow downwards (E.D., 12 July 2026): if A --is_after--> B then
    // A sits above B — never beside it. Every directed edge between two
    // nodes of the same lane is a vertical constraint (source above
    // target); this covers the stratigraphic sequence AND the paradata
    // chain alike. Only the symmetric / equivalence connectors
    // (contemporaneity, physical equality, bonds) keep their endpoints side
    // by side. Membership edges (is_in_*) are containment, not sequence;
    // epoch nodes are lane labels, not flow participants.
    let symmetric = |t: &str| {
        matches!(
            t,
            "has_same_time"
                | "is_physically_equal_to"
                | "equals"
                | "bonded_to"
                | "is_bonded_to"
                | "contrasts_with"
        )
    };
    let membership = |t: &str| {
        matches!(
            t,
            "is_in_activity"
                | "is_in_paradata_nodegroup"
                | "is_in_location"
                | "is_in_timebranch"
        )
    };
    let is_epoch: Vec<bool> = graph
        .nodes
        .iter()
        .map(|nd| nd.node_type == "epoch" || nd.node_type == "EpochNode")
        .collect();

    let mut down: Vec<Vec<usize>> = vec![Vec::new(); n];
    let mut sym_pairs: Vec<(usize, usize)> = Vec::new();
    for e in &graph.edges {
        let (Some(&s), Some(&t)) =
            (node_ix.get(e.source.as_str()), node_ix.get(e.target.as_str()))
        else {
            continue;
        };
        if s == t || lane[s] != lane[t] || is_epoch[s] || is_epoch[t] {
            continue;
        }
        let et = e.edge_type.as_str();
        if membership(et) {
            continue;
        }
        if symmetric(et) {
            sym_pairs.push((s, t));
        } else {
            down[s].push(t);
        }
    }

    // DAG-ify: deterministic iterative DFS, back edges (cycles) skipped
    let mut dag: Vec<Vec<usize>> = vec![Vec::new(); n];
    {
        let mut color = vec![0u8; n]; // 0 white, 1 grey, 2 black
        let mut stack: Vec<(usize, usize)> = Vec::new();
        for root in 0..n {
            if color[root] != 0 {
                continue;
            }
            color[root] = 1;
            stack.push((root, 0));
            while let Some(top) = stack.last_mut() {
                let u = top.0;
                if top.1 < down[u].len() {
                    let v = down[u][top.1];
                    top.1 += 1;
                    if color[v] == 1 {
                        continue; // back edge → cycle, skip
                    }
                    dag[u].push(v);
                    if color[v] == 0 {
                        color[v] = 1;
                        stack.push((v, 0));
                    }
                } else {
                    color[u] = 2;
                    stack.pop();
                }
            }
        }
    }

    // longest-path layering (edges never cross lanes here)
    let mut indeg = vec![0usize; n];
    for u in 0..n {
        for &v in &dag[u] {
            indeg[v] += 1;
        }
    }
    let mut sub = vec![0u32; n];
    let mut topo: Vec<usize> = (0..n).filter(|&i| indeg[i] == 0).collect();
    let mut qi = 0;
    while qi < topo.len() {
        let u = topo[qi];
        qi += 1;
        for k in 0..dag[u].len() {
            let v = dag[u][k];
            if sub[v] < sub[u] + 1 {
                sub[v] = sub[u] + 1;
            }
            indeg[v] -= 1;
            if indeg[v] == 0 {
                topo.push(v);
            }
        }
    }

    // symmetric endpoints side by side: pull to a common level, then repair
    // any directed violation this may introduce
    for _ in 0..2 {
        for &(a, b) in &sym_pairs {
            let m = sub[a].max(sub[b]);
            sub[a] = m;
            sub[b] = m;
        }
        let mut guard = 0;
        loop {
            let mut changed = false;
            for u in 0..n {
                for k in 0..dag[u].len() {
                    let v = dag[u][k];
                    if sub[v] <= sub[u] {
                        sub[v] = sub[u] + 1;
                        changed = true;
                    }
                }
            }
            guard += 1;
            if !changed || guard > 12 {
                break;
            }
        }
    }

    // global layers = (lane, topological sub-layer). Epoch nodes are NOT
    // placed: in the swimlane projection the epoch IS the lane (it renders
    // as a node only in graph view, which computes its own layout).
    let mut layers: Vec<Vec<usize>> = Vec::new();
    let layer_key: Vec<(usize, u32)> = {
        let mut keys: Vec<(usize, u32)> = (0..n)
            .filter(|&i| !is_epoch[i])
            .map(|i| (lane[i], sub[i]))
            .collect();
        keys.sort();
        keys.dedup();
        let key_ix: HashMap<(usize, u32), usize> =
            keys.iter().enumerate().map(|(ix, k)| (*k, ix)).collect();
        layers.resize(keys.len(), Vec::new());
        for i in 0..n {
            if is_epoch[i] {
                continue;
            }
            layers[key_ix[&(lane[i], sub[i])]].push(i);
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
                        .filter(|&&j| (lane[j], sub[j]) != layer_key[li])
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

    // ── 3b. bands: every EM node group is a horizontal cluster ───────────
    // Each node maps to its ROOT group (groups can nest: paradata group
    // inside activity). Bands stay contiguous in x across every sub-layer
    // of the lane, so a group occupies one vertical column band and the
    // frontend can draw its container around it. Ungrouped nodes share one
    // pseudo-band per lane.
    // direct membership, MOST SPECIFIC first (paradata group > location >
    // timebranch > activity): a property inside a PD group inside an
    // activity has direct = PD group, root band = activity.
    let direct_of: Vec<Option<usize>> = {
        let mut best: Vec<Option<(u8, usize)>> = vec![None; n];
        let prio = |et: &str| -> u8 {
            match et {
                "is_in_paradata_nodegroup" => 0,
                "is_in_location" => 1,
                "is_in_timebranch" => 2,
                _ => 3, // is_in_activity
            }
        };
        for e in &graph.edges {
            let et = e.edge_type.as_str();
            if !membership(et) {
                continue;
            }
            if let (Some(&s), Some(&t)) =
                (node_ix.get(e.source.as_str()), node_ix.get(e.target.as_str()))
            {
                let cand = (prio(et), t);
                if best[s].is_none() || cand < best[s].unwrap() {
                    best[s] = Some(cand);
                }
            }
        }
        best.into_iter().map(|b| b.map(|(_, t)| t)).collect()
    };
    let walk_root = |i: usize| -> usize {
        let mut cur = i;
        for _ in 0..10 {
            match direct_of[cur] {
                Some(g) if g != cur => cur = g,
                _ => break,
            }
        }
        cur
    };
    let band_roots: std::collections::BTreeSet<usize> = (0..n)
        .filter(|&i| direct_of[i].is_some())
        .map(walk_root)
        .collect();
    let band_of: Vec<usize> = (0..n)
        .map(|i| {
            if direct_of[i].is_some() {
                walk_root(i)
            } else if band_roots.contains(&i) {
                i // a root group node belongs to its own band
            } else {
                usize::MAX // ungrouped: lane-level pseudo-band
            }
        })
        .collect();
    // sub-band inside the root band: the direct (nested) group, e.g. the
    // paradata group — its members get their own column slot, so PD boxes
    // can never overlap each other or foreign nodes.
    let sub_of: Vec<usize> = (0..n)
        .map(|i| match direct_of[i] {
            Some(d) if band_of[i] != usize::MAX && d != band_of[i] => d,
            _ => usize::MAX, // loose within its band
        })
        .collect();

    // contiguity: reorder every layer clustering two-level — first by root
    // band, then by sub-band (nested group) — blocks ordered by mean
    // barycenter position (deterministic tie-breaks on ids)
    if opts.respect_groups {
        for layer in layers.iter_mut() {
            let mut blocks: Vec<(usize, usize, Vec<usize>)> = Vec::new(); // (band, sub, members)
            let mut block_ix: HashMap<(usize, usize), usize> = HashMap::new();
            for &i in layer.iter() {
                let key = (band_of[i], sub_of[i]);
                let bix = *block_ix.entry(key).or_insert_with(|| {
                    blocks.push((key.0, key.1, Vec::new()));
                    blocks.len() - 1
                });
                blocks[bix].2.push(i);
            }
            // band-level average position in this layer
            let mut band_stat: HashMap<usize, (f64, usize)> = HashMap::new();
            for &i in layer.iter() {
                let s = band_stat.entry(band_of[i]).or_insert((0.0, 0));
                s.0 += pos_in_layer[i] as f64;
                s.1 += 1;
            }
            let scored: Vec<(f64, usize, f64, usize, usize, Vec<usize>)> = blocks
                .into_iter()
                .map(|(band, sb, members)| {
                    let (bs, bc) = band_stat[&band];
                    let band_avg = bs / bc.max(1) as f64;
                    let sub_avg = members
                        .iter()
                        .map(|&i| pos_in_layer[i] as f64)
                        .sum::<f64>()
                        / members.len().max(1) as f64;
                    (band_avg, band, sub_avg, sb, members.iter().map(|&i| pos_in_layer[i]).min().unwrap_or(0), members)
                })
                .collect();
            let mut scored = scored;
            scored.sort_by(|a, b| {
                a.0.partial_cmp(&b.0)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then(a.1.cmp(&b.1))
                    .then(a.2.partial_cmp(&b.2).unwrap_or(std::cmp::Ordering::Equal))
                    .then(a.3.cmp(&b.3))
                    .then(a.4.cmp(&b.4))
            });
            *layer = scored.into_iter().flat_map(|b| b.5).collect();
        }
        refresh(&layers, &mut pos_in_layer);
    }

    // ── 4. coordinates: band columns per lane, wrapped sub-rows ──────────
    let node_w = opts.default_node_w;
    let node_h = opts.default_node_h;
    let cell = node_w + opts.node_to_node;
    let max_cols: usize = if opts.max_row_nodes > 0 {
        opts.max_row_nodes
    } else {
        (((n as f64).sqrt() * 2.0).ceil() as usize).clamp(8, 40)
    };
    let sub_gap = opts.layer_to_layer * 0.45;
    let band_gap = opts.node_to_node * 2.0;

    let lane_count = unassigned_lane + 1;
    let mut layers_of_lane: Vec<Vec<usize>> = vec![Vec::new(); lane_count];
    for (li, &(l, _)) in layer_key.iter().enumerate() {
        layers_of_lane[l].push(li); // layer_key sorted by (lane, sub)
    }

    // per lane: nested column slots — band (root group) → sub-band (nested
    // group, e.g. paradata group) → members. Slots are disjoint by
    // construction, so group boxes can never overlap.
    struct SubSlot {
        sub: usize,
        x0: f64, // relative to the band
        cols: usize,
    }
    struct BandSlot {
        band: usize,
        x0: f64, // relative to the lane
        subs: Vec<SubSlot>,
    }
    struct LaneBands {
        slots: Vec<BandSlot>,
        /// (local layer index, band, sub) → members in layer order
        members: HashMap<(usize, usize, usize), Vec<usize>>,
        width: f64,
        /// rows needed per local layer index
        rows: Vec<usize>,
    }
    let mut lane_bands: Vec<LaneBands> = Vec::new();
    for l in 0..lane_count {
        let locals = &layers_of_lane[l];
        let mut members: HashMap<(usize, usize, usize), Vec<usize>> = HashMap::new();
        // (band, sub) → (Σpos, cnt, max per-layer count); band → (Σpos, cnt)
        let mut sub_stats: HashMap<(usize, usize), (f64, usize, usize)> = HashMap::new();
        let mut band_stats: HashMap<usize, (f64, usize)> = HashMap::new();
        for (k, &li) in locals.iter().enumerate() {
            let mut per_key_count: HashMap<(usize, usize), usize> = HashMap::new();
            for &i in &layers[li] {
                let key = (band_of[i], sub_of[i]);
                members.entry((k, key.0, key.1)).or_default().push(i);
                *per_key_count.entry(key).or_insert(0) += 1;
                let s = sub_stats.entry(key).or_insert((0.0, 0, 0));
                s.0 += pos_in_layer[i] as f64;
                s.1 += 1;
                let b = band_stats.entry(key.0).or_insert((0.0, 0));
                b.0 += pos_in_layer[i] as f64;
                b.1 += 1;
            }
            for (key, c) in per_key_count {
                let s = sub_stats.entry(key).or_insert((0.0, 0, 0));
                s.2 = s.2.max(c);
            }
        }
        // band order by lane-wide average position
        let mut band_order: Vec<(f64, usize)> = band_stats
            .iter()
            .map(|(&b, &(sum, cnt))| (sum / cnt.max(1) as f64, b))
            .collect();
        band_order.sort_by(|a, b| {
            a.0.partial_cmp(&b.0)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(a.1.cmp(&b.1))
        });
        let mut x = 0.0;
        let mut slots: Vec<BandSlot> = Vec::new();
        for (bix, &(_, band)) in band_order.iter().enumerate() {
            if bix > 0 {
                x += band_gap;
            }
            // sub order within the band, by average position
            let mut subs: Vec<(f64, usize, usize)> = sub_stats
                .iter()
                .filter(|((b, _), _)| *b == band)
                .map(|(&(_, sb), &(sum, cnt, maxc))| (sum / cnt.max(1) as f64, sb, maxc))
                .collect();
            subs.sort_by(|a, b| {
                a.0.partial_cmp(&b.0)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then(a.1.cmp(&b.1))
            });
            let mut sx = 0.0;
            let mut sub_slots: Vec<SubSlot> = Vec::new();
            for (six, &(_, sb, maxc)) in subs.iter().enumerate() {
                if six > 0 {
                    sx += opts.node_to_node;
                }
                let cols = maxc.min(max_cols).max(1);
                sub_slots.push(SubSlot { sub: sb, x0: sx, cols });
                sx += cols as f64 * cell - opts.node_to_node;
            }
            slots.push(BandSlot {
                band,
                x0: x,
                subs: sub_slots,
            });
            x += sx;
        }
        let width = x.max(node_w);
        let rows: Vec<usize> = locals
            .iter()
            .enumerate()
            .map(|(k, _)| {
                slots
                    .iter()
                    .flat_map(|bs| bs.subs.iter().map(move |ss| (bs.band, ss.sub, ss.cols)))
                    .map(|(b, sb, cols)| {
                        members
                            .get(&(k, b, sb))
                            .map(|m| m.len().div_ceil(cols))
                            .unwrap_or(0)
                    })
                    .max()
                    .unwrap_or(1)
                    .max(1)
            })
            .collect();
        lane_bands.push(LaneBands {
            slots,
            members,
            width,
            rows,
        });
    }

    // lane geometry
    let mut lane_y = vec![0.0f64; lane_count];
    let mut lane_h = vec![0.0f64; lane_count];
    let mut layer_y_in_lane = vec![0.0f64; layers.len()];
    let mut y_cursor = 0.0;
    for l in 0..lane_count {
        let locals = &layers_of_lane[l];
        let mut h = opts.lane_min_insets;
        for (k, &li) in locals.iter().enumerate() {
            if k > 0 {
                h += opts.layer_to_layer;
            }
            layer_y_in_lane[li] = h;
            let rows = lane_bands[l].rows[k] as f64;
            h += rows * node_h + (rows - 1.0) * sub_gap;
        }
        h += opts.lane_min_insets;
        if locals.is_empty() {
            h = opts.lane_min_insets * 2.0 + node_h;
        }
        lane_y[l] = y_cursor;
        lane_h[l] = h;
        y_cursor += h;
    }

    let max_row_w = lane_bands
        .iter()
        .map(|lb| lb.width)
        .fold(0.0f64, f64::max)
        .max(node_w);

    let mut positions: std::collections::BTreeMap<String, Rect> = std::collections::BTreeMap::new();
    for l in 0..lane_count {
        let locals = &layers_of_lane[l];
        let lb = &lane_bands[l];
        let lane_x0 = if opts.symmetric_placement {
            (max_row_w - lb.width) / 2.0
        } else {
            0.0
        };
        for (k, &li) in locals.iter().enumerate() {
            let base_y = lane_y[l] + layer_y_in_lane[li];
            for bs in &lb.slots {
                for ss in &bs.subs {
                    let Some(ms) = lb.members.get(&(k, bs.band, ss.sub)) else {
                        continue;
                    };
                    for (p, &i) in ms.iter().enumerate() {
                        let row = p / ss.cols;
                        let col = p % ss.cols;
                        positions.insert(
                            graph.nodes[i].id.clone(),
                            Rect {
                                x: lane_x0 + bs.x0 + ss.x0 + col as f64 * cell,
                                y: base_y + row as f64 * (node_h + sub_gap),
                                w: node_w,
                                h: node_h,
                            },
                        );
                    }
                }
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
    fn directed_edges_point_down_within_lane() {
        // USM10 --is_after--> USM20 in the SAME epoch: USM10 above, USM20
        // below — never side by side (E.D., 12 July 2026). Contemporaneity
        // keeps nodes on the same level instead.
        let g = Graph {
            graph_id: "g".into(),
            name: None,
            description: None,
            nodes: vec![
                epoch("EP1", 100.0),
                node("USM10", "US"),
                node("USM20", "US"),
                node("USM30", "US"),
                node("USM40", "US"),
            ],
            edges: vec![
                edge("e1", "has_first_epoch", "USM10", "EP1"),
                edge("e2", "has_first_epoch", "USM20", "EP1"),
                edge("e3", "has_first_epoch", "USM30", "EP1"),
                edge("e4", "has_first_epoch", "USM40", "EP1"),
                edge("e5", "is_after", "USM10", "USM20"),
                edge("e6", "is_after", "USM20", "USM30"),
                edge("e7", "has_same_time", "USM40", "USM20"),
            ],
            data: std::collections::BTreeMap::new(),
        };
        let l = compute(&g, &LayoutOptions::default());
        let (u10, u20, u30, u40) = (
            &l.positions["USM10"],
            &l.positions["USM20"],
            &l.positions["USM30"],
            &l.positions["USM40"],
        );
        assert!(u10.y < u20.y, "USM10 must sit above USM20");
        assert!(u20.y < u30.y, "USM20 must sit above USM30");
        assert_eq!(u40.y, u20.y, "contemporaneous units sit side by side");
        assert!(u40.x != u20.x, "contemporaneous units must not overlap");
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
