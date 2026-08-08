// DTC view (WIN2): the digital-twin-creation substrate of the WHOLE graph — the
// provenance of the digital resources the EM record rests on, read as one
// picture instead of one resource at a time.
//
// Where `buildDtcGenesisScene` (views/context.ts) answers "how was THIS resource
// made?" by walking upstream from a single Resource, this answers "what digital
// work does this graph stand on?" for every DTC chain at once. Same ingredients:
// the `dtc_*` edges as the chain, `layoutLayered` as the arrangement, the
// existing glyphs from `data.dtc_kind` — a PROJECTION of the same nodes, never a
// second model.
import { isDtcNodeType } from "../rules";
import type { Scene } from "../scene";
import type { EmEdge, EmNode } from "../types";
import { layoutLayered } from "./graph";

/** The EM→DTC bridge: an EM node citing a resource a DTC chain produced. ONE hop
 *  of it is kept so the projection shows where the digital output lands — the
 *  point of the view is provenance, and provenance nobody consumes is half the
 *  story. */
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

/**
 * Project the filtered graph onto its DTC substrate.
 *
 * Takes the SAME filtered node/edge lists the other projections consume (so the
 * circles of detail and folding still apply), keeps the DTC chain plus one
 * bridge hop, and lays it out with the deterministic layered algorithm. Manual
 * drags arrive as `overrides`, exactly as in Graph view.
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

  const scene = layoutLayered(
    nodes.filter((n) => keep.has(n.id)),
    [...chain, ...bridges],
  );
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
