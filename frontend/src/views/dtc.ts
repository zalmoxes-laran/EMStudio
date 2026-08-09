// DTC view: the digital-twin-creation substrate of the WHOLE graph — the
// provenance of the digital resources the EM record rests on, read as one
// picture instead of one resource at a time.
//
// Where `buildDtcGenesisScene` (views/context.ts) answers "how was THIS resource
// made?" by walking upstream from a single Resource, this answers "what digital
// work does this graph stand on?" for every DTC chain at once.
//
// FULL RENDERING (2026-08-09). The first cut laid the substrate out with the
// generic layered algorithm, which drew a correct graph that said nothing about
// what a DTC chain IS. This lays it out as the chain reads: a lane per STAGE of
// making, in order, from what was acquired to what the record cites.
//
//   ┌ Ingressi ─────────  resources nothing produced — what entered the study
//   ├ Processi ─────────  the acquisition / processing events
//   ├ Prodotti ─────────  what they produced
//   ├ Processi (2) ─────  a second act, consuming those products…
//   ├ Prodotti (2) ─────  …and producing more
//   └ Uso nel record ───  the EM nodes that cite them
//
// The lanes are RANKS, not four fixed roles (2026-08-09b). A chain of two
// processes — scan, then model from the scan — used to fold onto four bands with
// the second process's input drawn in "Prodotti" and its arrow running back UP,
// against invariant 3. A rank is the longest path from the start of the chain,
// so every arrow points DOWN by construction and a longer chain simply gets more
// lanes. Each lane is NAMED after what it holds, and repeated roles are numbered.
//
// Same swimlane mechanism as the Matrix, so the renderer already draws the bands
// and their labels; reading down is reading one act of digital making, reading
// across a lane is comparing the same stage across the whole graph.
//
// Arrows still point DOWN (invariant 3): a process is below what it consumed
// and above what it produced.
import { t } from "../i18n";
import { isDtcNodeType } from "../rules";
import type { Lane, Scene, SceneNode } from "../scene";
import type { EmEdge, EmNode } from "../types";

/** The EM→DTC bridge: an EM node citing a resource a DTC chain produced. One
 *  hop of it is kept so the projection shows where the digital output lands —
 *  the point of the view is provenance, and provenance nobody consumes is half
 *  the story. */
const BRIDGE_EDGE = "has_linked_resource";

/** The chain relations of the substrate (`dtc_had_input`, `dtc_had_output`,
 *  `dtc_derived_from`, and whatever the datamodel adds next). */
export function isDtcEdge(edgeType: string | undefined): boolean {
  return (edgeType ?? "").startsWith("dtc_");
}

/** A node that is DTC by its own nature: a `dtc_nodes` class, or any node
 *  stamped with a DTC kind — the DTC OUTPUT is a plain ResourceNode, so the kind
 *  is the marker, not the class (rules.ts `dtcAuthoringKinds`). Including these
 *  keeps a just-placed, not-yet-wired DTC chunk visible in the very view it was
 *  placed in. */
function isDtcNode(node: EmNode): boolean {
  if (isDtcNodeType(node.node_type)) return true;
  return !!(node.data as Record<string, unknown> | undefined)?.dtc_kind;
}

// Geometry. Boxes match the Graph projection so the two read at the same scale.
const NODE_W = 120;
const NODE_H = 34;
const H_GAP = 26;
const LANE_PAD = 26; // breathing room above/below a row inside its lane
const COL_GAP = 44; // between two process columns

/** What a lane holds — decides its name and its colour. The colour tints the
 *  lane the way an epoch's own colour tints its swimlane. */
type Role = "input" | "process" | "output" | "use";
const ROLE_STYLE: Record<Role, { labelKey: string; color: string }> = {
  input: { labelKey: "dtc.laneInput", color: "#2f4f6f" },
  process: { labelKey: "dtc.laneProcess", color: "#5b3f77" },
  output: { labelKey: "dtc.laneOutput", color: "#2c6249" },
  use: { labelKey: "dtc.laneUse", color: "#6f5326" },
};

/** Deterministic order: by name, then id — the same document must always draw
 *  the same picture (invariant 7 in spirit). */
function byName(a: EmNode, b: EmNode): number {
  const an = (a.name ?? "").toString();
  const bn = (b.name ?? "").toString();
  return an < bn ? -1 : an > bn ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Project the filtered graph onto its DTC substrate, laid out as provenance
 * lanes with one column per process.
 *
 * Takes the SAME filtered node/edge lists the other projections consume (so the
 * circles of detail and folding still apply). Manual drags arrive as
 * `overrides`, exactly as in Graph view.
 */
export function buildDtcScene(
  nodes: EmNode[],
  edges: EmEdge[],
  overrides?: Map<string, { x: number; y: number }>,
): Scene {
  const present = new Set(nodes.map((n) => n.id));
  const keep = new Set<string>();
  for (const n of nodes) if (isDtcNode(n)) keep.add(n.id);

  const chain: EmEdge[] = [];
  for (const e of edges) {
    if (!isDtcEdge(e.edge_type)) continue;
    if (!present.has(e.source) || !present.has(e.target)) continue;
    chain.push(e);
    keep.add(e.source);
    keep.add(e.target);
  }

  // one hop out to the EM side, resolved against the chain-derived set (so a
  // bridge never drags in a second bridge and the view stays the substrate).
  const bridges: EmEdge[] = [];
  for (const e of edges) {
    if (e.edge_type !== BRIDGE_EDGE) continue;
    if (!present.has(e.source) || !present.has(e.target)) continue;
    if (keep.has(e.source) || keep.has(e.target)) bridges.push(e);
  }
  for (const e of bridges) {
    keep.add(e.source);
    keep.add(e.target);
  }

  const members = nodes.filter((n) => keep.has(n.id));
  const scene: Scene = { nodes: [], byId: new Map(), edges: [], lanes: [] };
  if (!members.length) return scene;

  // ── RANKS · how far down the chain each node sits ─────────────────────────
  //
  // The flow is not the edge direction: `dtc_had_input` points from the process
  // to the resource it CONSUMED, so the resource comes first. Same for
  // `dtc_derived_from` (output → the input it derives from) and for the bridge
  // (an EM node cites a resource). Reversing those three is what makes every
  // arrow in the finished picture point down.
  const flow = new Map<string, string[]>(); // from → to, in chain order
  const addFlow = (from: string, to: string): void => {
    if (!flow.has(from)) flow.set(from, []);
    flow.get(from)!.push(to);
  };
  for (const e of chain) {
    if (e.edge_type === "dtc_had_input") addFlow(e.target, e.source); // resource → process
    else if (e.edge_type === "dtc_had_output") addFlow(e.source, e.target); // process → resource
    else if (e.edge_type === "dtc_derived_from") addFlow(e.target, e.source);
    else addFlow(e.source, e.target);
  }
  for (const e of bridges) addFlow(e.target, e.source); // resource → the EM node citing it

  // longest path from a source, computed by relaxation. A cycle (a chain that
  // consumes its own product) cannot raise a rank forever: the pass count is
  // bounded by the node count, and what is left keeps the rank it reached.
  const rank = new Map<string, number>(members.map((n) => [n.id, 0]));
  for (let pass = 0; pass < members.length; pass++) {
    let changed = false;
    for (const [from, tos] of flow) {
      const rf = rank.get(from);
      if (rf == null) continue;
      for (const to of tos)
        if ((rank.get(to) ?? 0) < rf + 1) {
          rank.set(to, rf + 1);
          changed = true;
        }
    }
    if (!changed) break;
  }

  // ── what each node IS, for naming its lane ────────────────────────────────
  const isOutput = new Set<string>();
  for (const e of chain)
    if (e.edge_type === "dtc_had_output") isOutput.add(e.target);
  const roleOf = (n: EmNode): Role => {
    if (isDtcNodeType(n.node_type)) return "process";
    if (!isDtcNode(n)) return "use"; // an EM node citing a product
    return isOutput.has(n.id) ? "output" : "input";
  };

  // ── group by rank, and inside a rank keep the process columns together ────
  const byRank = new Map<number, EmNode[]>();
  for (const n of members) {
    const r = rank.get(n.id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(n);
  }
  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  // a stable horizontal key: the process a node belongs to (its own id for a
  // process), so a chain reads as a column even across many ranks
  const columnKey = new Map<string, string>();
  for (const n of members) columnKey.set(n.id, n.id);
  for (const e of chain) {
    if (e.edge_type === "dtc_had_input" || e.edge_type === "dtc_had_output")
      columnKey.set(e.target, columnKey.get(e.source) ?? e.source);
  }
  for (const e of bridges)
    columnKey.set(e.source, columnKey.get(e.target) ?? e.target);

  const laneH = NODE_H + LANE_PAD * 2;
  const rowWidth = (n: number): number =>
    n > 0 ? n * NODE_W + (n - 1) * H_GAP : 0;
  let widest = NODE_W;
  ranks.forEach((r, i) => {
    const row = byRank
      .get(r)!
      .sort(
        (a, b) =>
          (columnKey.get(a.id) ?? "").localeCompare(columnKey.get(b.id) ?? "") ||
          byName(a, b),
      );
    widest = Math.max(widest, rowWidth(row.length));
    row.forEach((n, j) => {
      const sn: SceneNode = {
        id: n.id,
        x: j * (NODE_W + H_GAP) + COL_GAP,
        y: i * laneH + LANE_PAD,
        w: NODE_W,
        h: NODE_H,
        node: n,
      };
      scene.nodes.push(sn);
      scene.byId.set(sn.id, sn);
    });
  });

  // ── the lanes: named after what they hold, repeats numbered ───────────────
  const seen: Partial<Record<Role, number>> = {};
  scene.lanes = ranks.map((r, i): Lane => {
    const row = byRank.get(r)!;
    const tally = new Map<Role, number>();
    for (const n of row) {
      const role = roleOf(n);
      tally.set(role, (tally.get(role) ?? 0) + 1);
    }
    const role = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const nth = (seen[role] = (seen[role] ?? 0) + 1);
    const style = ROLE_STYLE[role];
    return {
      id: `dtc-lane-${r}`,
      // "Processi · 2" is the count; "Processi (2) · 1" is the second act of
      // making — the ordinal only appears when a role comes round again.
      label: `${t(style.labelKey)}${nth > 1 ? ` (${nth})` : ""} · ${row.length}`,
      y: i * laneH,
      height: laneH,
      color: style.color,
    };
  });

  for (const e of [...chain, ...bridges])
    if (scene.byId.has(e.source) && scene.byId.has(e.target))
      scene.edges.push({ source: e.source, target: e.target, edge: e });

  if (overrides)
    for (const sn of scene.nodes) {
      const o = overrides.get(sn.id);
      if (o) {
        sn.x = o.x;
        sn.y = o.y;
      }
    }
  return scene;
}
