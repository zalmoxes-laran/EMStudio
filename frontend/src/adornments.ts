// BADGE1 · ornament nodes (author / license / embargo) as attached miniatures.
//
// In the formal matrix language these are annotations of a referent, not
// stratigraphic elements, so the VIEW collapses them: the ornament nodes are not
// drawn as boxes and their edges are not drawn as edges — instead each becomes a
// small badge pinned to a corner of its referent (the PD-tag pattern,
// generalised). The DOCUMENT never changes: the nodes and edges stay in em.json,
// narrative-authorship keeps reading them; only the drawing collapses.
//
// The "is it an ornament?" question and the "which edge attaches one?" set both
// live in filters.ts (anchored to the `authors_licenses` ring) — this module is
// pure geometry-free bookkeeping over the graph, so it can be unit-checked.
import { ADORNMENT_EDGE_TYPES, isAdornmentNodeType } from "./filters";
import type { EmEdge, EmNode } from "./types";

export interface AdornmentBadge {
  /** the REAL ornament node id — a click on the badge selects THIS node */
  ornamentId: string;
  /** runtime node_type: author | author_ai | license | embargo */
  kind: string;
  /** the node's name, for the tooltip */
  label: string;
}

// stable badge order on a referent: attribution first, then rights, then embargo
const KIND_ORDER = ["author", "author_ai", "license", "embargo"];

/**
 * Badges to draw per referent id, resolved from the FULL document edges (the
 * ornament edges are otherwise hidden by the `edges_author` ring, so resolution
 * cannot use the already-filtered edge list). Only ornament nodes present in
 * `nodes` produce a badge — so the `authors_licenses` ring, which removes those
 * nodes upstream when off, turns the badges off with them. A badge is attached
 * only when its referent resolves to a NON-ornament node that is itself visible.
 *
 * `has_embargo` may sit on a LicenseNode (embargo of a licence); the walk then
 * hops through the licence to the licence's own referent, so both the licence
 * and the embargo badge land on the same stratigraphic host.
 */
export function adornmentBadges(
  nodes: readonly EmNode[],
  allEdges: readonly EmEdge[],
  visibleIds: ReadonlySet<string>,
): Map<string, AdornmentBadge[]> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // ornament (edge target) → its immediate referent (edge source). First edge in
  // document order wins, deterministically, if an ornament is attached twice.
  const referentOf = new Map<string, string>();
  for (const e of allEdges) {
    if (!ADORNMENT_EDGE_TYPES.has(e.edge_type ?? "")) continue;
    if (!referentOf.has(e.target)) referentOf.set(e.target, e.source);
  }
  const resolve = (ornamentId: string): string | null => {
    let cur = referentOf.get(ornamentId);
    const seen = new Set<string>([ornamentId]);
    let depth = 0;
    while (cur && depth++ < 6) {
      if (seen.has(cur)) return null; // cycle guard
      seen.add(cur);
      const node = byId.get(cur);
      // stop at the first non-ornament host; if the host isn't in this node set
      // (byId), it isn't visible here — treat as unresolved
      if (node && !isAdornmentNodeType(node.node_type)) return cur;
      cur = referentOf.get(cur);
    }
    return null;
  };
  const out = new Map<string, AdornmentBadge[]>();
  for (const n of nodes) {
    if (!isAdornmentNodeType(n.node_type)) continue;
    const ref = resolve(n.id);
    if (!ref || !visibleIds.has(ref)) continue;
    const badge: AdornmentBadge = {
      ornamentId: n.id,
      kind: n.node_type ?? "author",
      label: n.name || n.node_type || "",
    };
    const arr = out.get(ref);
    if (arr) arr.push(badge);
    else out.set(ref, [badge]);
  }
  const rank = (k: string): number => {
    const i = KIND_ORDER.indexOf(k);
    return i < 0 ? KIND_ORDER.length : i;
  };
  for (const arr of out.values())
    arr.sort(
      (a, b) =>
        rank(a.kind) - rank(b.kind) ||
        a.label.localeCompare(b.label) ||
        a.ornamentId.localeCompare(b.ornamentId),
    );
  return out;
}
