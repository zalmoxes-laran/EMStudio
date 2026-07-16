// Contextual "circles of detail" filter (EM progressive disclosure).
// Each node / edge is assigned to a CIRCLE derived from the datamodel (never
// hardcoded): real stratigraphic units at the core, then virtual units, then
// paradata, with continuity as an orthogonal ring; authors/licenses and
// links/other split out. Edges split into temporal, paradata, author/license,
// other and generic. Structural things (group containers, epoch swimlanes,
// membership edges) are NOT filterable — they carry the drawing's structure —
// so they map to `null`.
import { MEMBERSHIP_EDGES } from "./folding";
import {
  ancestorsOf,
  classOf,
  edgeEndpointClasses,
  GENERIC_EDGE,
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
  | "authors_licenses"
  | "links_other"
  | "edges_temporal"
  | "edges_paradata"
  | "edges_author"
  | "edges_other"
  | "edges_generic";

export interface Circle {
  key: CircleKey;
  label: string;
  kind: "node" | "edge";
  /** default visibility per view (Matrix hides the outer rings by default) */
  matrix: boolean;
  graph: boolean;
}

// Order = concentric rings, core first. The panel renders them top→down.
export const CIRCLES: Circle[] = [
  { key: "real", label: "Real stratigraphic units", kind: "node", matrix: true, graph: true },
  { key: "virtual", label: "Virtual stratigraphic units", kind: "node", matrix: true, graph: true },
  { key: "continuity", label: "Continuity (BR)", kind: "node", matrix: true, graph: true },
  { key: "paradata_nodes", label: "Paradata nodes", kind: "node", matrix: true, graph: true },
  { key: "authors_licenses", label: "Authors & licenses", kind: "node", matrix: false, graph: true },
  { key: "links_other", label: "Links & other", kind: "node", matrix: false, graph: true },
  { key: "edges_temporal", label: "Temporal edges", kind: "edge", matrix: true, graph: true },
  { key: "edges_paradata", label: "Paradata edges", kind: "edge", matrix: true, graph: true },
  { key: "edges_author", label: "Author & license edges", kind: "edge", matrix: false, graph: true },
  { key: "edges_other", label: "Other edges", kind: "edge", matrix: false, graph: true },
  { key: "edges_generic", label: "Generic edges", kind: "edge", matrix: false, graph: true },
];

const NODE_KEYS: CircleKey[] = [
  "real",
  "virtual",
  "continuity",
  "paradata_nodes",
  "authors_licenses",
  "links_other",
];
const EDGE_KEYS: CircleKey[] = [
  "edges_temporal",
  "edges_paradata",
  "edges_author",
  "edges_other",
  "edges_generic",
];

/** Detail-level presets applied at the top of the Detail panel — one click
 *  sets BOTH the node and edge rings. */
export interface DetailTemplate {
  key: string;
  label: string;
  circles: CircleKey[];
}
export const TEMPLATES: DetailTemplate[] = [
  { key: "full", label: "Full detail (all)", circles: [...NODE_KEYS, ...EDGE_KEYS] },
  {
    key: "harris",
    label: "Harris Matrix",
    circles: ["real", "continuity", "edges_temporal"],
  },
  {
    key: "em-compact",
    label: "EM compact",
    circles: ["real", "virtual", "continuity", "edges_temporal"],
  },
  {
    key: "em-complete",
    label: "EM complete",
    circles: [
      "real",
      "virtual",
      "continuity",
      "paradata_nodes",
      "edges_temporal",
      "edges_paradata",
    ],
  },
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
  const anc = ancestorsOf(nodeType);
  if (anc.includes("AuthorNode") || anc.includes("LicenseNode"))
    return "authors_licenses";
  return "links_other"; // links, geo-position, representations, … the rest
}

/** Which circle an edge belongs to, or null for structural membership edges
 *  (is_part_of / is_in_*) that build the containers and are never filtered. */
export function edgeCircle(edgeType: string | undefined): CircleKey | null {
  const t = edgeType ?? "";
  if (MEMBERSHIP_EDGES.has(t)) return null; // container structure
  if (t === GENERIC_EDGE) return "edges_generic";
  const cls = edgeEndpointClasses(t);
  if (cls.has("AuthorNode") || cls.has("LicenseNode") || cls.has("EmbargoNode"))
    return "edges_author";
  // epoch links are structural in the swimlane view (epochs ARE lanes), plus
  // resources/geo/representation/HDT — none of these is a paradata edge
  if (
    cls.has("EpochNode") ||
    cls.has("LinkNode") ||
    cls.has("GeoPositionNode") ||
    cls.has("RepresentationNode") ||
    cls.has("HDTNode") ||
    cls.has("SemanticShapeNode")
  )
    return "edges_other";
  if (cls.has("ParadataNode")) return "edges_paradata";
  if (cls.has("StratigraphicNode")) return "edges_temporal";
  return "edges_other";
}

/** The set of circles visible by default in a given view. */
export function defaultVisibleCircles(view: ViewKind): Set<CircleKey> {
  const out = new Set<CircleKey>();
  for (const c of CIRCLES) if (view === "matrix" ? c.matrix : c.graph) out.add(c.key);
  return out;
}
