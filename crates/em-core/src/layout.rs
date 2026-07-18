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
    compute_with_sketch(graph, opts, None)
}

/// yEd "From Sketch" policy: when `sketch` (the previous layout) is given
/// and `opts.use_sketch` is on, the current arrangement is a soft
/// constraint — layer order and band order come from the sketched x
/// coordinates instead of the barycenter sweeps, so a manual arrangement
/// survives re-layout. The sketch's `folded_groups` COMPACT the layout:
/// members of folded groups release their band slots (they are parked at
/// the proxy position, invisible anyway), exactly like yEd's group
/// compaction on closed folders.
pub fn compute_with_sketch(
    graph: &Graph,
    opts: &LayoutOptions,
    sketch: Option<&Layout>,
) -> Layout {
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
    // In "from sketch" mode, preserve the sketched lane order (top→bottom by y)
    // so a manual Move up/down survives re-layout (invariant 8); epochs absent
    // from the sketch fall back to start_time. A FRESH layout (no sketch) always
    // orders by start_time.
    let sketch_lane_order: Option<HashMap<&str, usize>> = if opts.use_sketch {
        sketch.map(|s| {
            let mut ls: Vec<&Swimlane> = s.swimlanes.iter().collect();
            ls.sort_by(|a, b| a.y.partial_cmp(&b.y).unwrap_or(std::cmp::Ordering::Equal));
            ls.iter()
                .enumerate()
                .map(|(i, l)| (l.epoch_id.as_str(), i))
                .collect()
        })
    } else {
        None
    };
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
    epochs.sort_by(|a, b| {
        if let Some(map) = &sketch_lane_order {
            let ia = map.get(graph.nodes[a.0].id.as_str());
            let ib = map.get(graph.nodes[b.0].id.as_str());
            match (ia, ib) {
                (Some(x), Some(y)) => return x.cmp(y), // both sketched → sketch order
                (Some(_), None) => return std::cmp::Ordering::Less, // sketched before unseen
                (None, Some(_)) => return std::cmp::Ordering::Greater,
                (None, None) => {} // neither sketched → fall through to start_time
            }
        }
        b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal)
    });
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
    // Chain inheritance: propagate source lane to target along chain edges;
    // membership edges propagate in BOTH directions (a dangling paradata
    // node with only its is_in_* edge inherits the lane of its group, and a
    // group inherits from its members) — otherwise such nodes fall into the
    // trailing lane far away from their box (lenght_pipe bug, 12 July 2026).
    let membership_edge = |t: &str| {
        matches!(
            t,
            "is_in_activity"
                | "is_in_paradata_nodegroup"
                | "is_in_location"
                | "is_in_timebranch"
                | "is_part_of"
                | "has_paradata_nodegroup"
        )
    };
    for _ in 0..8 {
        let mut changed = false;
        for e in &graph.edges {
            let et = e.edge_type.as_str();
            let chain = CHAIN_EDGES.contains(&et);
            let member = membership_edge(et);
            if !chain && !member {
                continue;
            }
            if let (Some(&s), Some(&t)) =
                (node_ix.get(e.source.as_str()), node_ix.get(e.target.as_str()))
            {
                if lane[t].is_none() && lane[s].is_some() {
                    lane[t] = lane[s];
                    changed = true;
                }
                if member && lane[s].is_none() && lane[t].is_some() {
                    lane[s] = lane[t];
                    changed = true;
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

    // ── 2. shared structures for the recursive layout (v4) ───────────────
    // Arrows flow downwards (E.D., 12 July 2026): every directed edge is a
    // vertical constraint (source above target) INSIDE its container;
    // symmetric connectors stay side by side; membership edges are
    // containment, not sequence; epoch nodes are lane labels.
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
                | "is_part_of"
        )
    };
    let is_epoch: Vec<bool> = graph
        .nodes
        .iter()
        .map(|nd| nd.node_type == "epoch" || nd.node_type == "EpochNode")
        .collect();

    // global directed / symmetric relations (projected locally later)
    let mut down: Vec<Vec<usize>> = vec![Vec::new(); n];
    let mut sym_pairs: Vec<(usize, usize)> = Vec::new();
    for e in &graph.edges {
        let (Some(&s), Some(&t)) =
            (node_ix.get(e.source.as_str()), node_ix.get(e.target.as_str()))
        else {
            continue;
        };
        if s == t || is_epoch[s] || is_epoch[t] {
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

    // primary containment tree (most specific membership first)
    let direct_of: Vec<Option<usize>> = {
        let mut best: Vec<Option<(u8, usize)>> = vec![None; n];
        let prio = |et: &str| -> u8 {
            match et {
                "is_part_of" => 0,
                "is_in_paradata_nodegroup" => 1,
                "is_in_location" => 2,
                "is_in_timebranch" => 3,
                _ => 4, // is_in_activity
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
    let mut children_of: Vec<Vec<usize>> = vec![Vec::new(); n];
    for i in 0..n {
        if let Some(p) = direct_of[i] {
            if p != i {
                children_of[p].push(i);
            }
        }
    }

    // fold state from the sketch: members of folded groups release their
    // slots and are parked at the proxy afterwards
    let folded_ix: std::collections::BTreeSet<usize> = sketch
        .map(|l| {
            l.folded_groups
                .iter()
                .filter_map(|id| node_ix.get(id.as_str()).copied())
                .collect()
        })
        .unwrap_or_default();
    let hidden: Vec<bool> = (0..n)
        .map(|i| {
            if folded_ix.is_empty() {
                return false;
            }
            let mut cur = i;
            for _ in 0..10 {
                match direct_of[cur] {
                    Some(g) if g != cur => {
                        if folded_ix.contains(&g) {
                            return true;
                        }
                        cur = g;
                    }
                    _ => break,
                }
            }
            false
        })
        .collect();

    // ── 3. RECURSIVE GROUP LAYOUT (yEd technique) ─────────────────────────
    // Every group is laid out as its own hierarchic sub-graph (local
    // topological layering + local crossing minimisation + median X
    // alignment), then becomes a rigid macro-block in its parent. Blocks
    // reserve their column for the layers they span, so nothing overlaps.
    let node_w = opts.default_node_w;
    let node_h = opts.default_node_h;
    let gap_x = opts.node_to_node;
    let sub_gap = opts.layer_to_layer * 0.45;
    let pitch = node_h + sub_gap;
    let group_pad = 14.0f64;
    let group_header = 22.0f64;
    let closed_w = 150.0f64;
    let closed_h = 40.0f64;
    let sketching = opts.use_sketch && sketch.is_some();
    let sketch_x = |i: usize| -> f64 {
        sketch
            .and_then(|l| l.positions.get(&graph.nodes[i].id))
            .map(|r| r.x)
            .unwrap_or(f64::MAX)
    };

    struct Block {
        w: f64,
        h: f64,
        /// absolute-in-block rects for every descendant node (leafs AND
        /// group nodes, the latter spanning their whole box)
        places: Vec<(usize, f64, f64, f64, f64)>,
    }

    // context for the recursion (plain fn to allow recursion)
    struct Ctx<'a> {
        down: &'a [Vec<usize>],
        sym_pairs: &'a [(usize, usize)],
        direct_of: &'a [Option<usize>],
        children_of: &'a [Vec<usize>],
        hidden: &'a [bool],
        folded: &'a std::collections::BTreeSet<usize>,
        node_w: f64,
        node_h: f64,
        gap_x: f64,
        pitch: f64,
        group_pad: f64,
        group_header: f64,
        closed_w: f64,
        closed_h: f64,
        sketching: bool,
        barycenter_sweeps: u32,
    }

    #[allow(clippy::too_many_arguments)]
    fn layout_container(
        ctx: &Ctx,
        members: &[usize],
        sketch_x: &dyn Fn(usize) -> f64,
    ) -> Block {
        // 1. resolve item dimensions (leafs, open groups → recursive block,
        //    folded groups → closed tab)
        let mut item_dims: Vec<(usize, f64, f64, Option<Block>)> = Vec::new();
        for &m in members {
            let kids: Vec<usize> = ctx.children_of[m]
                .iter()
                .copied()
                .filter(|&c| !ctx.hidden[c])
                .collect();
            if ctx.folded.contains(&m) {
                item_dims.push((m, ctx.closed_w, ctx.closed_h, None));
            } else if !kids.is_empty() {
                let inner = layout_container(ctx, &kids, sketch_x);
                item_dims.push((
                    m,
                    inner.w + ctx.group_pad * 2.0,
                    inner.h + ctx.group_header + ctx.group_pad,
                    Some(inner),
                ));
            } else {
                item_dims.push((m, ctx.node_w, ctx.node_h, None));
            }
        }
        let index_of: std::collections::HashMap<usize, usize> = item_dims
            .iter()
            .enumerate()
            .map(|(k, (m, ..))| (*m, k))
            .collect();

        // 2. project global relations onto the local items: a descendant is
        //    represented by the member that contains it
        let member_set: std::collections::HashSet<usize> =
            members.iter().copied().collect();
        let project = |mut x: usize| -> Option<usize> {
            for _ in 0..12 {
                if member_set.contains(&x) {
                    return Some(x);
                }
                match ctx.direct_of[x] {
                    Some(p) if p != x => x = p,
                    _ => return None,
                }
            }
            None
        };
        let k = item_dims.len();
        let mut local_down: Vec<Vec<usize>> = vec![Vec::new(); k];
        for (s, outs) in ctx.down.iter().enumerate() {
            let Some(ps) = project(s) else { continue };
            for &t in outs {
                let Some(pt) = project(t) else { continue };
                if ps != pt {
                    local_down[index_of[&ps]].push(index_of[&pt]);
                }
            }
        }
        let mut local_syms: Vec<(usize, usize)> = Vec::new();
        for &(a, b) in ctx.sym_pairs {
            if let (Some(pa), Some(pb)) = (project(a), project(b)) {
                if pa != pb {
                    local_syms.push((index_of[&pa], index_of[&pb]));
                }
            }
        }

        // 3. local layering: DAG-ify (skip back edges) + longest path,
        //    symmetric endpoints pulled level (with repair)
        let mut dag: Vec<Vec<usize>> = vec![Vec::new(); k];
        {
            let mut color = vec![0u8; k];
            let mut stack: Vec<(usize, usize)> = Vec::new();
            for root in 0..k {
                if color[root] != 0 {
                    continue;
                }
                color[root] = 1;
                stack.push((root, 0));
                while let Some(top) = stack.last_mut() {
                    let u = top.0;
                    if top.1 < local_down[u].len() {
                        let v = local_down[u][top.1];
                        top.1 += 1;
                        if color[v] == 1 {
                            continue;
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
        // items spanning several layers (tall blocks) push their
        // successors BELOW the whole block, not beside it
        let span_of = |i: usize| -> u32 {
            ((item_dims[i].2 / ctx.pitch).ceil() as u32).max(1)
        };
        let mut indeg = vec![0usize; k];
        for u in 0..k {
            for &v in &dag[u] {
                indeg[v] += 1;
            }
        }
        let mut layer = vec![0u32; k];
        let mut topo: Vec<usize> = (0..k).filter(|&i| indeg[i] == 0).collect();
        let mut qi = 0;
        while qi < topo.len() {
            let u = topo[qi];
            qi += 1;
            for kk in 0..dag[u].len() {
                let v = dag[u][kk];
                if layer[v] < layer[u] + span_of(u) {
                    layer[v] = layer[u] + span_of(u);
                }
                indeg[v] -= 1;
                if indeg[v] == 0 {
                    topo.push(v);
                }
            }
        }
        for _ in 0..2 {
            for &(a, b) in &local_syms {
                let m = layer[a].max(layer[b]);
                layer[a] = m;
                layer[b] = m;
            }
            let mut guard = 0;
            loop {
                let mut changed = false;
                for u in 0..k {
                    for kk in 0..dag[u].len() {
                        let v = dag[u][kk];
                        if layer[v] < layer[u] + span_of(u) {
                            layer[v] = layer[u] + span_of(u);
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
        let n_layers = item_dims
            .iter()
            .enumerate()
            .map(|(i, _)| layer[i] + 1)
            .max()
            .unwrap_or(1) as usize;
        let mut rows: Vec<Vec<usize>> = vec![Vec::new(); n_layers];
        for i in 0..k {
            rows[layer[i] as usize].push(i);
        }

        // 4. in-layer order: sketch order when sketching, else barycenter
        let mut pos_in: Vec<usize> = vec![0; k];
        let refresh = |rows: &Vec<Vec<usize>>, pos: &mut Vec<usize>| {
            for row in rows {
                for (p, &i) in row.iter().enumerate() {
                    pos[i] = p;
                }
            }
        };
        for row in rows.iter_mut() {
            row.sort_by(|&a, &b| {
                let (ma, mb) = (item_dims[a].0, item_dims[b].0);
                if ctx.sketching {
                    sketch_x(ma)
                        .partial_cmp(&sketch_x(mb))
                        .unwrap_or(std::cmp::Ordering::Equal)
                        .then(ma.cmp(&mb))
                } else {
                    ma.cmp(&mb)
                }
            });
        }
        refresh(&rows, &mut pos_in);
        if !ctx.sketching {
            // undirected adjacency for the barycenter
            let mut adj: Vec<Vec<usize>> = vec![Vec::new(); k];
            for u in 0..k {
                for &v in &local_down[u] {
                    adj[u].push(v);
                    adj[v].push(u);
                }
            }
            for &(a, b) in &local_syms {
                adj[a].push(b);
                adj[b].push(a);
            }
            for _ in 0..ctx.barycenter_sweeps {
                for row in rows.iter_mut() {
                    let mut scored: Vec<(f64, usize, usize)> = row
                        .iter()
                        .map(|&i| {
                            let neigh: Vec<f64> = adj[i]
                                .iter()
                                .filter(|&&j| layer[j] != layer[i])
                                .map(|&j| pos_in[j] as f64)
                                .collect();
                            let bc = if neigh.is_empty() {
                                pos_in[i] as f64
                            } else {
                                neigh.iter().sum::<f64>() / neigh.len() as f64
                            };
                            (bc, pos_in[i], i)
                        })
                        .collect();
                    scored.sort_by(|x, y| {
                        x.0.partial_cmp(&y.0)
                            .unwrap_or(std::cmp::Ordering::Equal)
                            .then(x.1.cmp(&y.1))
                    });
                    *row = scored.into_iter().map(|(_, _, i)| i).collect();
                }
                refresh(&rows, &mut pos_in);
            }
        }

        // 4b. wrap over-wide rows (top-down aspect, like the global cap of
        // v2/v3): rows longer than ~2·√k split into sub-rows; every later
        // row shifts down accordingly, so vertical constraints still hold
        {
            // width-aware: aim at a roughly landscape block (area-based)
            let total_area: f64 = item_dims.iter().map(|(_, w, h, _)| w * h).sum();
            let target_w = (total_area.sqrt() * 1.9).max(1400.0);
            let needs_wrap = rows.iter().any(|r| {
                r.iter().map(|&i| item_dims[i].1 + ctx.gap_x).sum::<f64>() > target_w
            });
            if needs_wrap {
                let mut new_rows: Vec<Vec<usize>> = Vec::new();
                for row in rows.iter() {
                    let mut cur: Vec<usize> = Vec::new();
                    let mut wsum = 0.0f64;
                    for &i in row {
                        let w = item_dims[i].1 + ctx.gap_x;
                        if !cur.is_empty() && wsum + w > target_w {
                            new_rows.push(std::mem::take(&mut cur));
                            wsum = 0.0;
                        }
                        cur.push(i);
                        wsum += w;
                    }
                    if !cur.is_empty() {
                        new_rows.push(cur);
                    }
                }
                rows = new_rows;
                for (li, row) in rows.iter().enumerate() {
                    for &i in row {
                        layer[i] = li as u32;
                    }
                }
                refresh(&rows, &mut pos_in);
            }
        }

        // 5. X assignment: init sequential, then median alignment sweeps
        //    with a scanline that respects blocks spanning multiple layers
        let span = |i: usize| -> usize { span_of(i) as usize };
        let mut x = vec![0.0f64; k];
        let place_row = |row: &[usize],
                         desired: &dyn Fn(usize) -> f64,
                         x: &mut Vec<f64>,
                         active: &mut Vec<(f64, f64, usize)>,
                         li: usize,
                         gap: f64,
                         dims: &[(usize, f64, f64, Option<Block>)]| {
            active.retain(|&(_, _, until)| until >= li);
            active.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
            let mut cursor = 0.0f64;
            for &i in row {
                let w = dims[i].1;
                let mut xi = desired(i).max(cursor);
                // single forward pass over the (sorted) active block columns
                for &(bx0, bx1, _) in active.iter() {
                    if xi < bx1 && xi + w > bx0 {
                        xi = bx1 + gap;
                    }
                }
                x[i] = xi;
                cursor = xi + w + gap;
            }
        };
        // init pass
        {
            let mut active: Vec<(f64, f64, usize)> = Vec::new();
            for (li, row) in rows.iter().enumerate() {
                let des = |_: usize| 0.0f64;
                place_row(row, &des, &mut x, &mut active, li, gap_x_of(ctx), &item_dims);
                for &i in row {
                    if span(i) > 1 {
                        active.push((x[i], x[i] + item_dims[i].1, li + span(i) - 1));
                    }
                }
            }
        }
        // one downward median-alignment sweep only. The upward pass is
        // deliberately disabled: although it keeps the 8 contract tests
        // green and stays deterministic, on real graphs with multi-layer
        // block reservations (containers/series spanning layers, e.g.
        // TempluMare) it blows the canvas width up ~9x (28k px vs the
        // ~3.2k near-square target) — the "unstable with column
        // reservation" regression. Re-enabling needs a real fix to the
        // block-reservation interaction, not just the extra sweep.
        for sweep in 0..1 {
            let downward = sweep % 2 == 0;
            let mut active: Vec<(f64, f64, usize)> = Vec::new();
            let order: Vec<usize> = if downward {
                (0..rows.len()).collect()
            } else {
                (0..rows.len()).rev().collect()
            };
            for li in order {
                let row = &rows[li];
                let xs = x.clone();
                let des = |i: usize| -> f64 {
                    let mut refs: Vec<f64> = Vec::new();
                    if downward {
                        for u in 0..k {
                            if local_down[u].contains(&i) && layer[u] < layer[i] {
                                refs.push(xs[u] + item_dims[u].1 / 2.0);
                            }
                        }
                    } else {
                        for &v in &local_down[i] {
                            if layer[v] > layer[i] {
                                refs.push(xs[v] + item_dims[v].1 / 2.0);
                            }
                        }
                    }
                    if refs.is_empty() {
                        xs[i]
                    } else {
                        refs.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                        refs[refs.len() / 2] - item_dims[i].1 / 2.0
                    }
                };
                place_row(row, &des, &mut x, &mut active, li, gap_x_of(ctx), &item_dims);
                for &i in row {
                    if span(i) > 1 {
                        active.push((x[i], x[i] + item_dims[i].1, li + span(i) - 1));
                    }
                }
            }
        }
        // normalise to x >= 0
        let min_x = (0..k).map(|i| x[i]).fold(f64::INFINITY, f64::min).min(0.0);
        for xi in x.iter_mut() {
            *xi -= min_x;
        }

        // 6. assemble the block
        let mut places: Vec<(usize, f64, f64, f64, f64)> = Vec::new();
        let mut w_max = 0.0f64;
        let mut h_max = 0.0f64;
        for (i, (m, w, h, inner)) in item_dims.iter().enumerate() {
            let y = layer[i] as f64 * ctx.pitch;
            w_max = w_max.max(x[i] + w);
            h_max = h_max.max(y + h);
            places.push((*m, x[i], y, *w, *h));
            if let Some(b) = inner {
                for &(d, dx, dy, dw, dh) in &b.places {
                    places.push((
                        d,
                        x[i] + ctx.group_pad + dx,
                        y + ctx.group_header + dy,
                        dw,
                        dh,
                    ));
                }
            }
        }
        Block {
            w: w_max.max(ctx.node_w),
            h: h_max.max(ctx.node_h),
            places,
        }
    }

    fn gap_x_of(ctx: &Ctx) -> f64 {
        ctx.gap_x
    }

    let ctx = Ctx {
        down: &down,
        sym_pairs: &sym_pairs,
        direct_of: &direct_of,
        children_of: &children_of,
        hidden: &hidden,
        folded: &folded_ix,
        node_w,
        node_h,
        gap_x,
        pitch,
        group_pad,
        group_header,
        closed_w,
        closed_h,
        sketching,
        barycenter_sweeps: opts.barycenter_sweeps,
    };

    // top-level members per lane: alive nodes whose primary parent is
    // absent (or lives in another lane — containment then wins for its
    // children, which follow the root's lane)
    let lane_count = unassigned_lane + 1;
    let mut top_of_lane: Vec<Vec<usize>> = vec![Vec::new(); lane_count];
    for i in 0..n {
        if is_epoch[i] || hidden[i] {
            continue;
        }
        let top = match direct_of[i] {
            None => true,
            Some(p) => hidden[p] || is_epoch[p],
        };
        if top {
            top_of_lane[lane[i]].push(i);
        }
    }

    let mut positions: std::collections::BTreeMap<String, Rect> =
        std::collections::BTreeMap::new();
    let mut lane_y = vec![0.0f64; lane_count];
    let mut lane_h = vec![0.0f64; lane_count];
    let mut lane_blocks: Vec<Option<Block>> = Vec::new();
    let mut max_w = node_w;
    for l in 0..lane_count {
        if top_of_lane[l].is_empty() {
            lane_blocks.push(None);
            continue;
        }
        let block = layout_container(&ctx, &top_of_lane[l], &sketch_x);
        max_w = max_w.max(block.w);
        lane_blocks.push(Some(block));
    }
    let mut y_cursor = 0.0f64;
    for l in 0..lane_count {
        let h = match &lane_blocks[l] {
            Some(b) => b.h + opts.lane_min_insets * 2.0,
            None => opts.lane_min_insets * 2.0 + node_h,
        };
        lane_y[l] = y_cursor;
        lane_h[l] = h;
        y_cursor += h;
    }
    for l in 0..lane_count {
        let Some(block) = &lane_blocks[l] else { continue };
        let x0 = if opts.symmetric_placement {
            (max_w - block.w) / 2.0
        } else {
            0.0
        };
        let oy = lane_y[l] + opts.lane_min_insets;
        for &(m, dx, dy, dw, dh) in &block.places {
            positions.insert(
                graph.nodes[m].id.clone(),
                Rect {
                    x: x0 + dx,
                    y: oy + dy,
                    w: dw,
                    h: dh,
                },
            );
        }
    }
    let max_row_w = max_w;

    // park hidden members at their folded ancestor's position
    if !folded_ix.is_empty() {
        for i in 0..n {
            if !hidden[i] {
                continue;
            }
            let mut cur = i;
            let mut rep = None;
            for _ in 0..10 {
                match direct_of[cur] {
                    Some(g) if g != cur => {
                        if folded_ix.contains(&g) && !hidden[g] {
                            rep = Some(g);
                            break;
                        }
                        cur = g;
                    }
                    _ => break,
                }
            }
            if let Some(r) = rep {
                if let Some(rect) = positions.get(&graph.nodes[r].id).cloned() {
                    positions.insert(graph.nodes[i].id.clone(), rect);
                }
            }
        }
    }

    // Pinned nodes are immovable: after the flow has placed everything, snap
    // each pinned node back to its sketch Rect so a re-layout never shifts it.
    // (Empty unless the document pins nodes, so the layout contract is intact.)
    if let Some(s) = sketch {
        for id in &s.pinned {
            if let Some(r) = s.positions.get(id) {
                positions.insert(id.clone(), r.clone());
            }
        }
    }

    // Anchor (rule) pins: place a node at a CORNER of its container (an epoch
    // lane's content, resolved here) + offset. Evaluated after the flow so the
    // container's bounds exist. Reusable/portable (the rule, not a coordinate).
    if let Some(s) = sketch {
        if !s.anchors.is_empty() {
            let ix_of: std::collections::HashMap<&str, usize> = graph
                .nodes
                .iter()
                .enumerate()
                .map(|(i, n)| (n.id.as_str(), i))
                .collect();
            let anchored: std::collections::BTreeSet<&str> =
                s.anchors.iter().map(|a| a.node.as_str()).collect();
            for a in &s.anchors {
                let Some(&to_ix) = ix_of.get(a.to.as_str()) else { continue };
                let Some(&lane_idx) = lane_of_epoch.get(&to_ix) else { continue };
                // content bbox of the container's lane (skip epochs + anchored)
                let (mut minx, mut miny, mut maxx, mut maxy) =
                    (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
                for (i, n) in graph.nodes.iter().enumerate() {
                    if is_epoch[i] || anchored.contains(n.id.as_str()) {
                        continue;
                    }
                    if lane[i] != lane_idx {
                        continue;
                    }
                    if let Some(r) = positions.get(&n.id) {
                        minx = minx.min(r.x);
                        miny = miny.min(r.y);
                        maxx = maxx.max(r.x + r.w);
                        maxy = maxy.max(r.y + r.h);
                    }
                }
                if !minx.is_finite() {
                    continue; // empty container — nothing to anchor against
                }
                let (cx, cy) = match a.corner.as_str() {
                    "tl" => (minx, miny),
                    "tr" => (maxx, miny),
                    "br" => (maxx, maxy),
                    _ => (minx, maxy), // "bl" (default): bottom-left
                };
                if let Some(r) = positions.get_mut(&a.node) {
                    r.x = cx + a.dx;
                    r.y = cy + a.dy;
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
        // Persist sectors and edge_routes across a re-layout: the engine
        // does not compute them yet (v2 router / sector columns), so
        // carrying whatever the sketch held is strictly better than
        // clobbering to empty — a manual/router arrangement or data set by
        // another tool survives the Layout action, like positions do.
        sectors: sketch.map(|s| s.sectors.clone()).unwrap_or_default(),
        positions,
        folded_groups: Vec::new(),
        group_spaces: std::collections::BTreeMap::new(),
        edge_routes: sketch.map(|s| s.edge_routes.clone()).unwrap_or_default(),
        pinned: sketch.map(|s| s.pinned.clone()).unwrap_or_default(),
        anchors: sketch.map(|s| s.anchors.clone()).unwrap_or_default(),
    }
}

/// Diagnostic (E.D., 12 July 2026): arrows must point DOWN — a node that is
/// chronologically earlier sits below. The layering enforces this within
/// lanes and the epoch order across lanes; residual upward edges indicate
/// data anomalies (e.g. an is_after towards a newer epoch) and are counted
/// here rather than force-bent, so they can be reviewed.
pub fn upward_edges(
    graph: &Graph,
    positions: &std::collections::BTreeMap<String, Rect>,
) -> Vec<String> {
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
                | "is_part_of"
        )
    };
    let epoch_edge = |t: &str| matches!(t, "has_first_epoch" | "survive_in_epoch");
    let mut out = Vec::new();
    for e in &graph.edges {
        let t = e.edge_type.as_str();
        if symmetric(t) || membership(t) || epoch_edge(t) {
            continue;
        }
        let (Some(s), Some(tg)) = (positions.get(&e.source), positions.get(&e.target)) else {
            continue;
        };
        if tg.y + 0.5 < s.y {
            out.push(format!("{} --{}--> {}", e.source, t, e.target));
        }
    }
    out
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
    fn from_sketch_preserves_manual_order() {
        // two unrelated units in the same layer: a sketch with swapped x
        // must keep them swapped after re-layout
        let g = Graph {
            graph_id: "g".into(),
            name: None,
            description: None,
            nodes: vec![epoch("EP1", 100.0), node("A", "US"), node("B", "US")],
            edges: vec![
                edge("e1", "has_first_epoch", "A", "EP1"),
                edge("e2", "has_first_epoch", "B", "EP1"),
            ],
            data: std::collections::BTreeMap::new(),
        };
        let mut opts = LayoutOptions::default();
        let fresh = compute(&g, &opts);
        // fresh: A before B (id order); build a sketch with B left of A
        let mut sketch = fresh.clone();
        let (ax, bx) = (sketch.positions["A"].x, sketch.positions["B"].x);
        sketch.positions.get_mut("A").unwrap().x = bx.max(ax) + 100.0;
        sketch.positions.get_mut("B").unwrap().x = ax.min(bx);
        opts.use_sketch = true;
        let resketched = compute_with_sketch(&g, &opts, Some(&sketch));
        assert!(
            resketched.positions["B"].x < resketched.positions["A"].x,
            "from-sketch must preserve the manual left-right order"
        );
    }

    #[test]
    fn pinned_node_is_immovable_across_relayout() {
        // a pinned node keeps its EXACT sketch Rect, wherever the flow would
        // otherwise place it; the set persists on the output too.
        let g = Graph {
            graph_id: "g".into(),
            name: None,
            description: None,
            nodes: vec![epoch("EP1", 100.0), node("A", "US"), node("B", "US")],
            edges: vec![
                edge("e1", "has_first_epoch", "A", "EP1"),
                edge("e2", "has_first_epoch", "B", "EP1"),
            ],
            data: std::collections::BTreeMap::new(),
        };
        let mut opts = LayoutOptions::default();
        let mut sketch = compute(&g, &opts);
        // park B far away and pin it there
        sketch.positions.get_mut("B").unwrap().x = -777.0;
        sketch.positions.get_mut("B").unwrap().y = -555.0;
        sketch.pinned = vec!["B".into()];
        opts.use_sketch = true;
        let out = compute_with_sketch(&g, &opts, Some(&sketch));
        assert_eq!(out.positions["B"].x, -777.0, "pinned x is kept exactly");
        assert_eq!(out.positions["B"].y, -555.0, "pinned y is kept exactly");
        assert_eq!(out.pinned, vec!["B".to_string()], "pinned set persists");
    }

    #[test]
    fn anchor_places_node_at_container_corner() {
        // P is anchored to EP1's bottom-left: it lands at (min content x,
        // max content y) of the epoch's other content (A, B).
        let g = Graph {
            graph_id: "g".into(),
            name: None,
            description: None,
            nodes: vec![
                epoch("EP1", 100.0),
                node("A", "US"),
                node("B", "US"),
                node("P", "property"),
            ],
            edges: vec![
                edge("e1", "has_first_epoch", "A", "EP1"),
                edge("e2", "has_first_epoch", "B", "EP1"),
                edge("e3", "has_first_epoch", "P", "EP1"),
            ],
            data: std::collections::BTreeMap::new(),
        };
        let mut opts = LayoutOptions::default();
        let mut sketch = compute(&g, &opts);
        sketch.anchors = vec![crate::model::Anchor {
            node: "P".into(),
            to: "EP1".into(),
            corner: "bl".into(),
            dx: 0.0,
            dy: 0.0,
        }];
        opts.use_sketch = true;
        let out = compute_with_sketch(&g, &opts, Some(&sketch));
        let (a, b) = (&out.positions["A"], &out.positions["B"]);
        let minx = a.x.min(b.x);
        let maxy = (a.y + a.h).max(b.y + b.h);
        assert_eq!(out.positions["P"].x, minx, "anchored to content left edge");
        assert_eq!(out.positions["P"].y, maxy, "anchored to content bottom edge");
        assert_eq!(out.anchors.len(), 1, "anchors persist across re-layout");
    }

    #[test]
    fn folded_groups_compact_the_layout() {
        // an activity with three members: folding it must shrink the canvas
        // and park the hidden members at the proxy position
        let g = Graph {
            graph_id: "g".into(),
            name: None,
            description: None,
            nodes: vec![
                epoch("EP1", 100.0),
                node("ACT", "ActivityNodeGroup"),
                node("U1", "US"),
                node("U2", "US"),
                node("U3", "US"),
                node("LOOSE", "US"),
            ],
            edges: vec![
                edge("e1", "has_first_epoch", "U1", "EP1"),
                edge("e2", "has_first_epoch", "U2", "EP1"),
                edge("e3", "has_first_epoch", "U3", "EP1"),
                edge("e4", "has_first_epoch", "LOOSE", "EP1"),
                edge("e5", "has_first_epoch", "ACT", "EP1"),
                edge("m1", "is_in_activity", "U1", "ACT"),
                edge("m2", "is_in_activity", "U2", "ACT"),
                edge("m3", "is_in_activity", "U3", "ACT"),
            ],
            data: std::collections::BTreeMap::new(),
        };
        let opts = LayoutOptions::default();
        let fresh = compute(&g, &opts);
        let mut sketch = fresh.clone();
        sketch.folded_groups = vec!["ACT".into()];
        let folded = compute_with_sketch(&g, &opts, Some(&sketch));
        assert!(
            folded.canvas.width < fresh.canvas.width,
            "folding must shrink the canvas ({} < {})",
            folded.canvas.width,
            fresh.canvas.width
        );
        // hidden members parked at the proxy
        let act = &folded.positions["ACT"];
        for m in ["U1", "U2", "U3"] {
            assert_eq!(folded.positions[m].x, act.x);
            assert_eq!(folded.positions[m].y, act.y);
        }
        // untouched node still placed normally
        assert!(folded.positions["LOOSE"].x != act.x || folded.positions["LOOSE"].y != act.y);
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

    #[test]
    fn sectors_and_edge_routes_persist_across_relayout() {
        // The engine does not compute sectors / edge_routes yet, so a
        // re-layout must CARRY them from the sketch instead of clobbering
        // to empty — a manual/router arrangement or externally-set data
        // survives the Layout action, like positions do.
        use crate::model::Sector;
        let g = Graph {
            graph_id: "g".into(),
            name: None,
            description: None,
            nodes: vec![epoch("EP1", 100.0), node("A", "US")],
            edges: vec![edge("e1", "has_first_epoch", "A", "EP1")],
            data: std::collections::BTreeMap::new(),
        };
        let opts = LayoutOptions::default();
        let mut sketch = compute(&g, &opts);
        sketch.sectors = vec![Sector {
            id: "S1".into(),
            order: 0,
            x: 10.0,
            width: 50.0,
        }];
        sketch
            .edge_routes
            .insert("e1".into(), vec![(0.0, 0.0), (5.0, 5.0)]);

        let out = compute_with_sketch(&g, &opts, Some(&sketch));
        assert_eq!(out.sectors.len(), 1, "sectors must survive re-layout");
        assert_eq!(out.sectors[0].id, "S1");
        assert_eq!(
            out.edge_routes.get("e1").map(Vec::len),
            Some(2),
            "edge_routes must survive re-layout"
        );

        // A fresh layout (no sketch) has neither — the engine does not
        // synthesise them.
        let fresh = compute(&g, &opts);
        assert!(fresh.sectors.is_empty() && fresh.edge_routes.is_empty());
    }
}
