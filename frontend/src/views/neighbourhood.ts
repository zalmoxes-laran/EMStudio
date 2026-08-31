/**
 * The node's answer, turned into a Scene — the DTC neighbourhood of one asset.
 *
 * `stratigraph-server`'s `GET /v1/corpus/neighbourhood?sha256=…` answers with the
 * chain around a file: what made it, what it went on to make, and the context
 * (author, licence, embargo) hanging off each node. The traversal is the
 * library's (`s3dgraphy.dtc.neighbourhood`) — this file does not walk anything.
 * It ADAPTS, and the scene machine is the one that already exists
 * (`buildDtcScene`), so an answer is one more scene and not one more renderer.
 *
 * ## Two things it is careful about
 *
 * **The corpus is not loaded.** `store.doc` is ONE document and the corpus is not
 * it. What arrives is a transient scene: no second store, and no six thousand
 * nodes in memory to look at twelve. (And nothing is lost by that: the corpus IS
 * an em.json, so the day a curator wants the whole thing they open it like any
 * other document — a consequence of having kept one grammar and two documents,
 * not a feature to build.)
 *
 * **A group stays a group.** A photographic series is an acquisition with N
 * members, and the members hang off it by `dtc_had_output` — a CHAIN edge, so the
 * expansion legitimately returns all two hundred. Drawing two hundred boxes to
 * say "a flight" is what makes a provenance picture unreadable, so the fold
 * happens HERE, in the adapter, and not as collapse logic inside the view: a
 * member is kept when it is the asset we asked about, or when it takes part in
 * some OTHER chain edge (it went on to make something). The rest become a count
 * on the group.
 */

import type { EmEdge, EmNode } from "../types";

/** One node as the endpoint describes it. Deliberately the shape the server
 *  sends, so a reader can compare this file with the route and see nothing in
 *  between. */
export interface NeighbourCard {
  id: string;
  type?: string | null;
  name?: string | null;
  dtc_kind?: string | null;
  hop?: number;
  context?: Array<{
    id?: string | null;
    type?: string | null;
    name?: string | null;
    edge_type?: string | null;
    role?: string | null;
  }>;
}

export interface NeighbourhoodAnswer {
  sha256?: string;
  start?: string | null;
  hops?: number;
  truncated?: boolean;
  frontier?: string[];
  nodes?: NeighbourCard[];
  edges?: Array<{ edge_type?: string; source?: string; target?: string }>;
  version?: string;
}

/** The node types that are a LOT rather than a file. Read from the card's own
 *  type — the server sends what the graph says — and kept as a set here because
 *  a lot is a shape of the DTC profile and not a datamodel flag: an acquisition
 *  is the one node whose members are its outputs. */
const GROUP_TYPES = new Set(["dtc_acquisition"]);

export interface AdaptedNeighbourhood {
  nodes: EmNode[];
  edges: EmEdge[];
  /** how many members each group swallowed, so the view can say «·203» */
  folded: Map<string, number>;
}

/**
 * The answer as nodes and edges `buildDtcScene` accepts.
 *
 * The context is NOT turned into nodes: it arrives on the card and stays there,
 * carried in `data.context` so an inspector can show it. That is the whole rule
 * of the expansion — an author is an attribute of a file, not a place — and
 * turning it into a box here would undo it on the last metre.
 */
export function adaptNeighbourhood(answer: NeighbourhoodAnswer): AdaptedNeighbourhood {
  const cards = answer.nodes ?? [];
  const edges = (answer.edges ?? []).filter(
    (e): e is { edge_type: string; source: string; target: string } =>
      !!e.source && !!e.target,
  );
  const start = answer.start ?? null;

  // ── which members a group swallows ────────────────────────────────────────
  const groups = new Set(cards.filter((c) => GROUP_TYPES.has(c.type ?? ""))
                              .map((c) => c.id));
  const foldable = new Map<string, string>();      // member → its group
  for (const e of edges) {
    if (e.edge_type === "dtc_had_output" && groups.has(e.source)) {
      foldable.set(e.target, e.source);
    }
  }
  // …minus the ones that earn their own box: the asset we asked about, and any
  // member that takes part in another chain edge (it went on to make something,
  // and hiding it would hide the reason the picture was opened).
  const busy = new Set<string>();
  for (const e of edges) {
    const own = e.edge_type === "dtc_had_output" && foldable.get(e.target) === e.source;
    if (own) continue;
    busy.add(e.source);
    busy.add(e.target);
  }
  const folded = new Map<string, number>();
  const hidden = new Set<string>();
  for (const [member, group] of foldable) {
    if (member === start || busy.has(member)) continue;
    hidden.add(member);
    folded.set(group, (folded.get(group) ?? 0) + 1);
  }

  const nodes: EmNode[] = [];
  for (const card of cards) {
    if (hidden.has(card.id)) continue;
    const data: Record<string, unknown> = {};
    if (card.dtc_kind) data.dtc_kind = card.dtc_kind;
    if (card.context?.length) data.context = card.context;
    if (typeof card.hop === "number") data.hop = card.hop;
    const swallowed = folded.get(card.id);
    if (swallowed) data.member_count = swallowed;
    nodes.push({
      id: card.id,
      name: (card.name ?? card.id) + (swallowed ? ` · ${swallowed}` : ""),
      node_type: card.type ?? "resource",
      data,
    });
  }
  const present = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: edges
      .filter((e) => present.has(e.source) && present.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, edge_type: e.edge_type })),
    folded,
  };
}
