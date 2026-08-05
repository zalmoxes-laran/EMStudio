// FUNNEL1 · Data Funnel — propagative property resolution (EM 1.5 manual
// "Data Funnel"): a propagable property resolves from the MOST SPECIFIC to the
// most general, FIRST non-null wins (SUBSTITUTIVE). In EMStudio the chain is
//
//     Node → Activity (group) → Epoch (swimlane) → Canvas (header)
//
// mirroring the canonical s3dgraphy resolver `resolve_with_source`
// (property_resolver.py: node > swimlane > graph, first non-null, with a
// `source` label) and EMtools' DP-32 `resolve_propagative_property`. EMStudio
// adds the **Activity** tier between node and epoch and, since EM 1.6 formalises
// AuthorNode/LicenseNode/EmbargoNode as PDG members (PDMEM1), it READS the
// node/swimlane values that s3dgraphy's builtin getters still stub to None
// (pending DP-51). See the parity TODO at the bottom.
//
// The funnel RESOLVES; it never MATERIALISES — em.json is untouched, no
// inherited value is ever written onto a node (E.D. / the manual).
import type { EmDocument } from "./types";

/** Rule ids, kept general so the two temporal properties (already propagative in
 *  the manual) drop in without touching the resolver. Primary set for badges =
 *  author / license / embargo. */
export type RuleId =
  | "author"
  | "license"
  | "embargo"
  | "absolute_time_start"
  | "absolute_time_end";

/** The four funnel scopes, most-specific first. */
export type Scope = "node" | "activity" | "epoch" | "canvas";

export interface Effective {
  /** the resolved value, or null when nothing in the chain declares it */
  value: string | null;
  /** which scope supplied it, or null when unresolved */
  source: Scope | null;
  /** true when the value is declared on the NODE's own scope (source === node) */
  explicit: boolean;
}

/** ornament node_types that satisfy a rule id (the value = the member's name). */
const RULE_NODE_TYPES: Record<string, string[]> = {
  author: ["author", "author_ai"],
  license: ["license"],
  embargo: ["embargo"],
};

/** Canvas-header key per rule id — mirrors s3dgraphy's graph-level getter
 *  (`graph.attributes['author_name' | 'license' | 'embargo']`, builtin_rules.py).
 *  This is the ONE place the canvas value is read; swapping it for the DP-65
 *  graph-scope PDG is a change to `readScopeValue`'s canvas branch alone. */
const CANVAS_KEY: Record<string, string> = {
  author: "author_name",
  license: "license",
  embargo: "embargo",
  absolute_time_start: "start_time",
  absolute_time_end: "end_time",
};

type Node = EmDocument["graph"]["nodes"][number];
type Edge = EmDocument["graph"]["edges"][number];

const nodeName = (n: Node | undefined): string | null =>
  n && n.name != null && String(n.name).trim() !== "" ? String(n.name) : null;

/**
 * The value a SCOPE declares for a rule — the SINGLE place that reads a scope,
 * so the future migration to the DP-65 graph-scope PDG is one swap here.
 *
 *  - node / activity / epoch (A2): the ornament (or temporal property) that is a
 *    MEMBER of that scope's ParadataNodeGroup (PDMEM1's `is_in_paradata_nodegroup`
 *    ← the scope's `has_paradata_nodegroup`). An author in the epoch's PDG IS the
 *    epoch's authorship declaration.
 *  - canvas (A1): the header field (DP-40 coexistence — NOT a PDG), read behind
 *    this same function so DP-65 is a local change.
 */
export function readScopeValue(
  doc: EmDocument,
  scope: Scope,
  scopeNodeId: string | null,
  ruleId: RuleId,
): string | null {
  const g = doc.graph;
  if (scope === "canvas") {
    const key = CANVAS_KEY[ruleId];
    const top = (g as unknown as Record<string, unknown>)[key];
    if (top != null && String(top).trim() !== "") return String(top);
    const data = (g as unknown as { data?: Record<string, unknown> }).data;
    const dv = data?.[key];
    return dv != null && String(dv).trim() !== "" ? String(dv) : null;
  }
  if (!scopeNodeId) return null;
  // the scope's ParadataNodeGroup (has_paradata_nodegroup: scope → PDG)
  let pdgId: string | null = null;
  for (const e of g.edges)
    if (e.edge_type === "has_paradata_nodegroup" && e.source === scopeNodeId) {
      pdgId = e.target;
      break;
    }
  if (!pdgId) return null;
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const wantTypes = RULE_NODE_TYPES[ruleId];
  for (const e of g.edges) {
    if (e.edge_type !== "is_in_paradata_nodegroup" || e.target !== pdgId) continue;
    const m = byId.get(e.source);
    if (!m) continue;
    if (wantTypes) {
      if (wantTypes.includes(m.node_type)) return nodeName(m);
    } else if (m.node_type === "property") {
      // temporal rule: the property whose property_type matches; value in
      // description (EM convention) or the name fallback
      const pt = (m.data as Record<string, unknown> | undefined)?.property_type;
      if (pt === ruleId) {
        const d = m.description;
        return d != null && String(d).trim() !== "" ? String(d) : nodeName(m);
      }
    }
  }
  return null;
}

/** ids of the ActivityNodeGroups that CONTAIN a node (is_in_activity). */
function activitiesOf(edges: Edge[], nodeId: string): string[] {
  const out: string[] = [];
  for (const e of edges)
    if (e.edge_type === "is_in_activity" && e.source === nodeId)
      out.push(e.target);
  return out;
}

/** the node's epoch (has_first_epoch: node → epoch), or null. */
function epochOf(edges: Edge[], nodeId: string): string | null {
  for (const e of edges)
    if (e.edge_type === "has_first_epoch" && e.source === nodeId) return e.target;
  return null;
}

/**
 * Resolve the EFFECTIVE value of a propagative property for a node, walking
 * Node → Activity → Epoch → Canvas and returning the FIRST non-null (substitutive
 * — the more specific scope overrides, no summing). `explicit` marks a value
 * declared on the node's own scope. Same shape as DP-32's
 * `resolve_propagative_property → (value, source)`.
 */
export function resolveEffective(
  doc: EmDocument,
  nodeId: string,
  ruleId: RuleId,
): Effective {
  const edges = doc.graph.edges;
  // 1 · node
  const own = readScopeValue(doc, "node", nodeId, ruleId);
  if (own != null) return { value: own, source: "node", explicit: true };
  // 2 · activity (a node can be in several; first that declares wins)
  for (const a of activitiesOf(edges, nodeId)) {
    const v = readScopeValue(doc, "activity", a, ruleId);
    if (v != null) return { value: v, source: "activity", explicit: false };
  }
  // 3 · epoch (swimlane)
  const ep = epochOf(edges, nodeId);
  if (ep) {
    const v = readScopeValue(doc, "epoch", ep, ruleId);
    if (v != null) return { value: v, source: "epoch", explicit: false };
  }
  // 4 · canvas (header)
  const cv = readScopeValue(doc, "canvas", null, ruleId);
  if (cv != null) return { value: cv, source: "canvas", explicit: false };
  return { value: null, source: null, explicit: false };
}

/** The three badge rule ids, in display order. */
export const BADGE_RULES: RuleId[] = ["author", "license", "embargo"];

/** Human label for a source scope (tooltip: "proprio" / "da Epoca …"). */
export function sourceLabel(source: Scope | null): string {
  switch (source) {
    case "node":
      return "proprio";
    case "activity":
      return "da Attività";
    case "epoch":
      return "da Epoca";
    case "canvas":
      return "da Canvas";
    default:
      return "";
  }
}

// PARITY TODO (s3dgraphy ↔ EMStudio): the canonical resolver lives in
// s3dgraphy (`resolvers/property_resolver.py::resolve_with_source` +
// `builtin_rules.py`), but its author node/swimlane getters return None until
// DP-51 formalises AuthorNode/has_author in yEd — EMStudio reads them here from
// the PDG membership (PDMEM1), and adds the Activity tier absent from
// s3dgraphy's node>swimlane>graph. To keep the two worlds resolving identically,
// the shared extraction should (a) add the Activity tier to s3dgraphy and
// (b) implement the PDG-member getters there; until then EMStudio is ahead and
// this file is the single EMStudio-side mirror of DP-32.
