// Live socket validation from s3Dgraphy's datamodels — the same versioned
// JSONs that drive the Python side (EM 1.5/1.6 connector rules). The class
// hierarchy lives in the node datamodel itself (node_types entries carry
// `parent` and `node_type`; kept in sync with the Python classes by
// s3dgraphy.tools.sync_node_datamodel — ADR-001). Refresh the local copies
// with scripts/sync-datamodels.sh.
import connections from "./assets/s3Dgraphy_connections_datamodel.json";
import nodeDatamodel from "./assets/s3Dgraphy_node_datamodel.json";

interface EdgeTypeDef {
  name?: string;
  label?: string;
  description?: string;
  allowed_connections?: { source?: string[]; target?: string[] };
}

interface NodeTypeEntry {
  class?: string;
  parent?: string | null;
  node_type?: string | null;
  description?: string;
}

const EDGE_TYPES = (
  connections as { edge_types: Record<string, EdgeTypeDef> }
).edge_types;

const CLASS_ENTRIES = (
  nodeDatamodel as unknown as { node_types: Record<string, NodeTypeEntry> }
).node_types;

// runtime node_type string → class name (e.g. "US" → "StratigraphicUnit")
const TYPE_TO_CLASS = new Map<string, string>();
for (const [className, entry] of Object.entries(CLASS_ENTRIES)) {
  if (entry.node_type) TYPE_TO_CLASS.set(entry.node_type, className);
}

// class name → ancestry, walking `parent` chains (the hierarchy is complete
// in the datamodel since the VirtualStratigraphicUnit curation of 2026-07-12)
const ANCESTRY = new Map<string, string[]>();
function classAncestors(className: string): string[] {
  const hit = ANCESTRY.get(className);
  if (hit) return hit;
  const out: string[] = [];
  let cur: string | null | undefined = className;
  let guard = 0;
  while (cur && guard++ < 20) {
    out.push(cur);
    cur = CLASS_ENTRIES[cur]?.parent;
  }
  ANCESTRY.set(className, out);
  return out;
}

export const GENERIC_EDGE = "generic_connection";

/** EM language version the palette/rules are aligned to (from the datamodel). */
export const DATAMODEL_VERSION = String(
  (connections as Record<string, unknown>)[
    "s3Dgraphy_connections_model_version"
  ] ?? "?",
);
export const EM_VERSION = DATAMODEL_VERSION.split(".").slice(0, 2).join(".");

/** Class ancestry for a runtime node_type (always includes "Node"). */
export function ancestorsOf(nodeType: string | undefined): string[] {
  const className = TYPE_TO_CLASS.get(nodeType ?? "");
  return className ? classAncestors(className) : ["Node"];
}

export function classOf(nodeType: string | undefined): string {
  return TYPE_TO_CLASS.get(nodeType ?? "") ?? "Node";
}

export function typeDescription(nodeType: string | undefined): string {
  const className = TYPE_TO_CLASS.get(nodeType ?? "");
  return (className && CLASS_ENTRIES[className]?.description) || "";
}

function intersects(allowed: string[] | undefined, anc: string[]): boolean {
  if (!allowed || !allowed.length) return false;
  return allowed.some((a) => anc.includes(a));
}

/**
 * Edge types permitted from a source node_type to a target node_type,
 * specific rules only (generic_connection excluded).
 */
export function allowedEdgeTypes(
  sourceType: string | undefined,
  targetType: string | undefined,
): string[] {
  const sa = ancestorsOf(sourceType);
  const ta = ancestorsOf(targetType);
  const out: string[] = [];
  for (const [name, def] of Object.entries(EDGE_TYPES)) {
    if (name === GENERIC_EDGE) continue;
    const ac = def.allowed_connections;
    if (!ac) continue;
    if (intersects(ac.source, sa) && intersects(ac.target, ta)) out.push(name);
  }
  return out;
}

export type ConnectValidity = "valid" | "generic" | "invalid";

export function connectValidity(
  sourceType: string | undefined,
  targetType: string | undefined,
): ConnectValidity {
  if (allowedEdgeTypes(sourceType, targetType).length) return "valid";
  const g = EDGE_TYPES[GENERIC_EDGE]?.allowed_connections;
  const ok =
    g &&
    intersects(g.source, ancestorsOf(sourceType)) &&
    intersects(g.target, ancestorsOf(targetType));
  return ok ? "generic" : "invalid";
}

export function edgeTypeLabel(edgeType: string): string {
  return EDGE_TYPES[edgeType]?.label ?? edgeType;
}

export function edgeTypeDescription(edgeType: string): string {
  return EDGE_TYPES[edgeType]?.description ?? "";
}

/** node_types whose class ancestry includes the given class name. */
export function typesOfClass(className: string): string[] {
  return [...TYPE_TO_CLASS.keys()].filter((t) =>
    ancestorsOf(t).includes(className),
  );
}

export function isGroupType(nodeType: string | undefined): boolean {
  return ancestorsOf(nodeType).includes("GroupNode");
}

export function isStratigraphicType(nodeType: string | undefined): boolean {
  return ancestorsOf(nodeType).includes("StratigraphicNode");
}

/** Reasoning-chain (paradata) node: property / extractor / combiner / document. */
export function isParadataType(nodeType: string | undefined): boolean {
  return ancestorsOf(nodeType).includes("ParadataNode");
}

/** Continuity node (BR) — the boundary marker of a unit's life-span. */
export function isContinuityType(nodeType: string | undefined): boolean {
  return ancestorsOf(nodeType).includes("ContinuityNode");
}

/** Virtual stratigraphic unit — detected from the datamodel class names
 *  (VirtualStratigraphicUnit / …VirtualSpecialFindUnit / SeriesOf…Virtual…),
 *  so it also covers VSF and the virtual series, not just USVn/USVs. */
export function isVirtualType(nodeType: string | undefined): boolean {
  return ancestorsOf(nodeType).some((c) => c.includes("Virtual"));
}

/** Union of the node classes (with ancestry) an edge type may connect —
 *  from the datamodel `allowed_connections`. Used to categorise edges
 *  (epoch / paradata / stratigraphic) without hardcoding edge names. */
export function edgeEndpointClasses(edgeType: string | undefined): Set<string> {
  const ac = EDGE_TYPES[edgeType ?? ""]?.allowed_connections;
  const out = new Set<string>();
  for (const c of [...(ac?.source ?? []), ...(ac?.target ?? [])])
    for (const a of classAncestors(c)) out.add(a);
  return out;
}
