/**
 * The em.json CONTAINER — a project is one file.
 *
 * Decided with E.D. (2026-08-13): an em.json/emj is **always a container**::
 *
 *   { "header": {…}, "graphs": { "<id>": <graph>, "shelf": <ShelfGraph> },
 *     "active_graph_id": "<id>" }
 *
 * A study is one or more graphs plus its shelf; a single graph is a
 * **container-of-one**. This is the shape **Heriverse already reads**, so
 * writing it means Heriverse does not change — the format was adopted, not
 * invented. s3Dgraphy reads and writes the same thing (`s3dgraphy/container.py`),
 * so the three tools agree on what a project file is.
 *
 * What changes for EMStudio: **Save writes every slot**, not just the active
 * one. Until now a workspace with three graphs saved one of them, and the other
 * two existed only until the tab closed — which is the kind of loss you discover
 * a week later.
 *
 * Reading accepts both shapes, always: every file written before today is a
 * single-graph document, and none of them may break.
 *
 * Pure module: no DOM, no store. It maps between container documents and the
 * per-graph `EmDocument` the DocumentStore already knows how to hold.
 */

import type { EmDocument } from "./types";

export const GRAPHS_KEY = "graphs";
export const SHELF_COLLECTION = "ShelfGraph";
export const SHELF_MEMBER_ID = "shelf";

type GraphSection = Record<string, unknown>;

export interface ContainerDoc {
  header?: Record<string, unknown>;
  graphs: Record<string, GraphSection>;
  active_graph_id?: string;
  layout?: Record<string, unknown>;
}

/** One member, ready for a DocumentStore: the per-graph document shape. */
export interface ContainerMember {
  id: string;
  doc: EmDocument;
}

export interface ParsedContainer {
  /** the study graphs, in the order the file lists them */
  members: ContainerMember[];
  /** the project shelf, when the container carries one */
  shelf: GraphSection | null;
  activeGraphId: string | null;
  /** true when the source was a legacy single-graph document */
  wasLegacy: boolean;
  warnings: string[];
}

/** Structural, never a guess about content: either the `graphs` map is there or
 *  this is a legacy single-graph document. */
export function isContainer(doc: unknown): doc is ContainerDoc {
  const graphs = (doc as ContainerDoc | null)?.graphs;
  return !!graphs && typeof graphs === "object" && !Array.isArray(graphs);
}

/** Is this member the shelf? From the MARKER, never from the member id — an id
 *  is a name somebody chose, the marker is what the graph says it is. */
export function isShelfSection(section: unknown): boolean {
  const data = (section as { data?: Record<string, unknown> } | null)?.data;
  return !!data && data.em_collection === SHELF_COLLECTION;
}

/**
 * Read a container OR a legacy single-graph document.
 *
 * A legacy document comes back as a container-of-one, so every caller downstream
 * has ONE shape to handle instead of two.
 */
export function parseContainer(doc: unknown): ParsedContainer {
  const warnings: string[] = [];
  if (!isContainer(doc)) {
    const single = doc as EmDocument | null;
    if (!single?.graph?.nodes) {
      return { members: [], shelf: null, activeGraphId: null, wasLegacy: true,
               warnings: ["not an .em.json document (missing graph.nodes)"] };
    }
    const id = String(single.graph.graph_id ?? "graph");
    return { members: [{ id, doc: single }], shelf: null, activeGraphId: id,
             wasLegacy: true, warnings };
  }

  const header = doc.header ?? { format: "em.json", version: "1.0" };
  const members: ContainerMember[] = [];
  let shelf: GraphSection | null = null;
  for (const [memberId, section] of Object.entries(doc.graphs)) {
    if (!section || typeof section !== "object") {
      // One broken member must not cost the rest of the project.
      warnings.push(`container member '${memberId}' is not a graph; skipped`);
      continue;
    }
    if (isShelfSection(section)) {
      shelf = section;
      continue;
    }
    const graph = { ...section, graph_id: section.graph_id ?? memberId };
    members.push({
      id: String(graph.graph_id),
      // The layout is a CONTAINER-level field in the file; each member document
      // gets it so a store that has positions keeps them. Per-member layouts are
      // a later refinement — today one project has one arrangement, and saying
      // that is better than pretending each graph has its own.
      doc: { header, graph, layout: doc.layout } as unknown as EmDocument,
    });
  }

  let activeGraphId = typeof doc.active_graph_id === "string" ? doc.active_graph_id : null;
  if (activeGraphId && !members.some((m) => m.id === activeGraphId)) {
    warnings.push(
      `active_graph_id '${activeGraphId}' is not a member of this container; ` +
        `showing the first graph`,
    );
    activeGraphId = null;
  }
  if (!activeGraphId) activeGraphId = members[0]?.id ?? null;

  if (!members.length && shelf) {
    warnings.push(
      "this project holds a shelf and no study graph — readable, but there is " +
        "nothing to draw",
    );
  }
  return { members, shelf, activeGraphId, wasLegacy: false, warnings };
}

/**
 * Build the container document from the graphs on screen.
 *
 * `graphs` are the per-graph documents (one per slot); `shelf` is the project
 * shelf's own graph section, when there is one.
 */
export function buildContainer(input: {
  graphs: Array<{ id: string; doc: EmDocument }>;
  shelf?: GraphSection | null;
  activeGraphId?: string | null;
}): ContainerDoc {
  const graphs: Record<string, GraphSection> = {};
  for (const { id, doc } of input.graphs) {
    const section = { ...(doc.graph as unknown as GraphSection) };
    section.graph_id = section.graph_id ?? id;
    graphs[id] = section;
  }
  if (input.shelf) {
    const shelfId = String(input.shelf.graph_id ?? SHELF_MEMBER_ID);
    graphs[shelfId] = input.shelf;
  }
  // The header comes from the first member so the format/version/datamodel
  // stamps stay written in one place (whoever wrote that document wrote them).
  const header =
    (input.graphs[0]?.doc.header as Record<string, unknown> | undefined) ??
    { format: "em.json", version: "1.0" };
  const out: ContainerDoc = { header, graphs };
  const active = input.activeGraphId ?? input.graphs[0]?.id ?? null;
  if (active) out.active_graph_id = active;
  // One project, one arrangement (see the note in `parseContainer`).
  const layout = input.graphs.find((g) => g.doc.layout)?.doc.layout;
  if (layout) out.layout = layout as Record<string, unknown>;
  return out;
}

// ── integrating later ───────────────────────────────────────────────────────

export interface MergeReport {
  addedGraphs: string[];
  mergedGraphs: string[];
  mergedNodes: number;
  addedNodes: number;
  addedEdges: number;
  warnings: string[];
}

/**
 * Fold an incoming graph section into an existing one, keyed by UUID.
 *
 * A node id IS the identity — that is what the UUID ids were for (ADR-002 §6
 * says so: they guard offline merges) — so a node already present is the same
 * node and is overwritten by the incoming one; a node absent is added. Edges are
 * identified by their (source, type, target) triple, the only definition that
 * survives two people minting edge ids independently.
 *
 * DECLARED LIMIT: this is add + merge-by-UUID, **not** conflict resolution. If
 * both authors edited the same node the incoming version wins and the local one
 * is gone, which is why the report counts `mergedNodes`: that number is exactly
 * the set where a conflict could have happened, and it is what a person should
 * look at before trusting the result.
 */
export function mergeGraphSections(
  target: GraphSection,
  incoming: GraphSection,
  report: MergeReport,
): void {
  const targetNodes = (target.nodes ?? []) as Array<Record<string, unknown>>;
  const incomingNodes = (incoming.nodes ?? []) as Array<Record<string, unknown>>;
  const byId = new Map(targetNodes.map((n) => [String(n.id), n]));
  for (const node of incomingNodes) {
    const id = String(node.id);
    const existing = byId.get(id);
    if (existing) {
      Object.assign(existing, node);
      report.mergedNodes++;
    } else {
      targetNodes.push(node);
      byId.set(id, node);
      report.addedNodes++;
    }
  }
  target.nodes = targetNodes;

  const targetEdges = (target.edges ?? []) as Array<Record<string, unknown>>;
  const incomingEdges = (incoming.edges ?? []) as Array<Record<string, unknown>>;
  const key = (e: Record<string, unknown>): string =>
    `${String(e.source)}|${String(e.edge_type)}|${String(e.target)}`;
  const seen = new Set(targetEdges.map(key));
  const ids = new Set(targetEdges.map((e) => String(e.id)));
  for (const edge of incomingEdges) {
    if (seen.has(key(edge))) continue;
    let id = String(edge.id ?? key(edge));
    while (ids.has(id)) id = `${id}_merged`;
    targetEdges.push({ ...edge, id });
    seen.add(key(edge));
    ids.add(id);
    report.addedEdges++;
  }
  target.edges = targetEdges;
}

/**
 * Take another project into this one — the offline "integrate later".
 *
 * ADDITIVE: a graph you do not have arrives whole; a graph you both have merges
 * by UUID. No server, no session, no lock.
 */
export function mergeContainers(
  into: { members: ContainerMember[]; shelf: GraphSection | null },
  other: ParsedContainer,
): MergeReport {
  const report: MergeReport = {
    addedGraphs: [], mergedGraphs: [], mergedNodes: 0,
    addedNodes: 0, addedEdges: 0, warnings: [...other.warnings],
  };
  for (const incoming of other.members) {
    const mine = into.members.find((m) => m.id === incoming.id);
    if (mine) {
      mergeGraphSections(
        mine.doc.graph as unknown as GraphSection,
        incoming.doc.graph as unknown as GraphSection,
        report,
      );
      report.mergedGraphs.push(incoming.id);
    } else {
      into.members.push(incoming);
      report.addedGraphs.push(incoming.id);
      report.addedNodes += ((incoming.doc.graph.nodes ?? []) as unknown[]).length;
      report.addedEdges += ((incoming.doc.graph.edges ?? []) as unknown[]).length;
    }
  }
  if (other.shelf) {
    if (!into.shelf) into.shelf = other.shelf;
    else mergeGraphSections(into.shelf, other.shelf, report);
  }
  return report;
}
