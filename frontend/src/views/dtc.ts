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
// what a DTC chain IS. This lays it out as the chain reads:
//
//   ┌ Ingressi ─────────  the resources a process consumed
//   ├ Processi ─────────  the acquisition / processing events
//   ├ Prodotti ─────────  the resources they produced
//   └ Uso nel record ───  the EM nodes that cite those products
//
// Four PROVENANCE LANES (the same swimlane mechanism the Matrix uses, so the
// renderer already draws the bands and their labels), and one COLUMN per
// process: its inputs above it, its outputs below, the EM nodes that cite them
// below that. Reading down a column is reading one act of digital making;
// reading across a lane is comparing the same stage across the whole graph.
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

/** The four stages of a chain, top to bottom. The colour tints the lane the way
 *  an epoch's own colour tints its swimlane. */
const STAGES = [
  { key: "input", labelKey: "dtc.laneInput", color: "#2f4f6f" },
  { key: "process", labelKey: "dtc.laneProcess", color: "#5b3f77" },
  { key: "output", labelKey: "dtc.laneOutput", color: "#2c6249" },
  { key: "use", labelKey: "dtc.laneUse", color: "#6f5326" },
] as const;
type StageKey = (typeof STAGES)[number]["key"];

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
  const byId = new Map(nodes.map((n) => [n.id, n]));
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

  // ── who is what ───────────────────────────────────────────────────────────
  const processes = members.filter((n) => isDtcNodeType(n.node_type)).sort(byName);
  const inputsOf = new Map<string, EmNode[]>();
  const outputsOf = new Map<string, EmNode[]>();
  for (const e of chain) {
    const target = byId.get(e.target);
    if (!target) continue;
    if (e.edge_type === "dtc_had_input") {
      if (!inputsOf.has(e.source)) inputsOf.set(e.source, []);
      inputsOf.get(e.source)!.push(target);
    } else if (e.edge_type === "dtc_had_output") {
      if (!outputsOf.has(e.source)) outputsOf.set(e.source, []);
      outputsOf.get(e.source)!.push(target);
    }
  }
  // the EM nodes that cite a produced resource
  const consumersOf = new Map<string, EmNode[]>();
  for (const e of bridges) {
    const src = byId.get(e.source);
    if (!src) continue;
    if (!consumersOf.has(e.target)) consumersOf.set(e.target, []);
    consumersOf.get(e.target)!.push(src);
  }

  // ── columns: one per process, then one for whatever no process claimed ────
  const claimed = new Set<string>();
  const claim = (list: EmNode[] | undefined): EmNode[] => {
    const out: EmNode[] = [];
    for (const n of (list ?? []).sort(byName)) {
      if (claimed.has(n.id)) continue; // a resource shared by two processes is
      claimed.add(n.id); // drawn once, in the first column that asked for it
      out.push(n);
    }
    return out;
  };

  interface Column {
    rows: Record<StageKey, EmNode[]>;
  }
  const columns: Column[] = [];
  for (const p of processes) {
    claimed.add(p.id);
    const inputs = claim(inputsOf.get(p.id));
    const outputs = claim(outputsOf.get(p.id));
    const use = claim(
      outputs.flatMap((o) => consumersOf.get(o.id) ?? []),
    );
    columns.push({ rows: { input: inputs, process: [p], output: outputs, use } });
  }
  // anything left: resources with no process (a just-placed chunk, a dangling
  // input) and EM nodes citing them. Shown rather than silently dropped.
  const orphans = members.filter((n) => !claimed.has(n.id)).sort(byName);
  if (orphans.length) {
    const orphanUse = orphans.filter((n) => !isDtcNode(n));
    const orphanRes = orphans.filter((n) => isDtcNode(n));
    columns.push({
      rows: { input: orphanRes, process: [], output: [], use: orphanUse },
    });
  }

  // ── place them: stages are rows, columns run left to right ────────────────
  const laneH = NODE_H + LANE_PAD * 2;
  const stageY: Record<StageKey, number> = {
    input: LANE_PAD,
    process: laneH + LANE_PAD,
    output: laneH * 2 + LANE_PAD,
    use: laneH * 3 + LANE_PAD,
  };
  const rowWidth = (n: number): number =>
    n > 0 ? n * NODE_W + (n - 1) * H_GAP : 0;

  let x = 0;
  for (const col of columns) {
    const widest = Math.max(
      ...STAGES.map((s) => rowWidth(col.rows[s.key].length)),
      NODE_W,
    );
    for (const stage of STAGES) {
      const row = col.rows[stage.key];
      if (!row.length) continue;
      // centre each row in its column, so a process sits under the middle of
      // its inputs and above the middle of its outputs
      const start = x + (widest - rowWidth(row.length)) / 2;
      row.forEach((n, i) => {
        const sn: SceneNode = {
          id: n.id,
          x: start + i * (NODE_W + H_GAP),
          y: stageY[stage.key],
          w: NODE_W,
          h: NODE_H,
          node: n,
        };
        scene.nodes.push(sn);
        scene.byId.set(sn.id, sn);
      });
    }
    x += widest + COL_GAP;
  }

  // ── the lanes themselves ──────────────────────────────────────────────────
  const counts: Record<StageKey, number> = {
    input: 0,
    process: 0,
    output: 0,
    use: 0,
  };
  for (const col of columns)
    for (const stage of STAGES) counts[stage.key] += col.rows[stage.key].length;
  // The count rides IN the label: the lane chip's second line is the epoch
  // bounds format ("start – end"), and borrowing it for a single number printed
  // "1 – " with a dangling dash.
  scene.lanes = STAGES.map((stage, i): Lane => ({
    id: `dtc-lane-${stage.key}`,
    label: `${t(stage.labelKey)} · ${counts[stage.key]}`,
    y: i * laneH,
    height: laneH,
    color: stage.color,
  }));

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
