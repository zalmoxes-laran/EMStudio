// Contextual "circles of detail" filter (EM progressive disclosure).
// Each node / edge is assigned to a CIRCLE derived from the datamodel (never
// hardcoded): real stratigraphic units at the core, then virtual units, then
// paradata, with continuity as an orthogonal ring. Edges split into
// stratigraphic/temporal, epoch and paradata. Structural things (group
// containers, epoch swimlanes, membership edges) are NOT filterable — they
// carry the drawing's structure — so they map to `null`.
import { MEMBERSHIP_EDGES } from "./folding";
import {
  classOf,
  edgeEndpointClasses,
  isContinuityType,
  isGroupType,
  isParadataType,
  isStratigraphicType,
  isVirtualType,
} from "./rules";
import type { ViewKind } from "./types";

export type CircleKey =
  | "real"
  | "virtual"
  | "continuity"
  | "paradata_nodes"
  | "other_nodes"
  | "edges_strat"
  | "edges_epoch"
  | "edges_paradata"
  | "edges_other";

export interface Circle {
  key: CircleKey;
  label: string;
  kind: "node" | "edge";
  /** default visibility per view (Matrix hides paradata clutter by default) */
  matrix: boolean;
  graph: boolean;
}

// Order = concentric rings, core first. The panel renders them top→down.
export const CIRCLES: Circle[] = [
  { key: "real", label: "Real stratigraphic units", kind: "node", matrix: true, graph: true },
  { key: "virtual", label: "Virtual stratigraphic units", kind: "node", matrix: true, graph: true },
  { key: "continuity", label: "Continuity (BR)", kind: "node", matrix: true, graph: true },
  { key: "paradata_nodes", label: "Paradata nodes", kind: "node", matrix: true, graph: true },
  { key: "other_nodes", label: "Other nodes (links, authors, license…)", kind: "node", matrix: false, graph: true },
  { key: "edges_strat", label: "Stratigraphic / temporal edges", kind: "edge", matrix: true, graph: true },
  { key: "edges_epoch", label: "Epoch edges", kind: "edge", matrix: true, graph: true },
  { key: "edges_paradata", label: "Paradata edges", kind: "edge", matrix: true, graph: true },
  { key: "edges_other", label: "Other edges", kind: "edge", matrix: false, graph: true },
];

/** Which circle a node belongs to, or null if it is structural (group
 *  container / epoch swimlane) and therefore never filtered. */
export function nodeCircle(nodeType: string | undefined): CircleKey | null {
  if (isGroupType(nodeType)) {
    // a ParadataNodeGroup IS paradata — it hides/reveals with the paradata
    // ring; the other groups hold stratigraphic content and are structural.
    return classOf(nodeType) === "ParadataNodeGroup" ? "paradata_nodes" : null;
  }
  if (classOf(nodeType) === "EpochNode") return null; // swimlane
  if (isStratigraphicType(nodeType)) {
    if (isContinuityType(nodeType)) return "continuity";
    if (isVirtualType(nodeType)) return "virtual";
    return "real";
  }
  if (isParadataType(nodeType)) return "paradata_nodes";
  return "other_nodes";
}

/** Which circle an edge belongs to, or null for structural membership edges
 *  (is_part_of / is_in_*) that build the containers and are never filtered. */
export function edgeCircle(edgeType: string | undefined): CircleKey | null {
  const t = edgeType ?? "";
  if (MEMBERSHIP_EDGES.has(t)) return null; // container structure
  const cls = edgeEndpointClasses(t);
  if (cls.has("EpochNode")) return "edges_epoch";
  if (cls.has("ParadataNode")) return "edges_paradata";
  if (cls.has("StratigraphicNode")) return "edges_strat";
  return "edges_other";
}

/** The set of circles visible by default in a given view. */
export function defaultVisibleCircles(view: ViewKind): Set<CircleKey> {
  const out = new Set<CircleKey>();
  for (const c of CIRCLES) if (view === "matrix" ? c.matrix : c.graph) out.add(c.key);
  return out;
}
