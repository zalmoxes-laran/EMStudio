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
import { sha256Hex } from "./sha256";

export const GRAPHS_KEY = "graphs";
export const SHELF_COLLECTION = "ShelfGraph";
export const SHELF_MEMBER_ID = "shelf";
/** P3 · where the project's revision travels. Deliberately NOT in `header`:
 *  the header describes the FORMAT, this describes the WORK. */
export const VERSION_KEY = "version";

type GraphSection = Record<string, unknown>;

/** P3 · which revision of the project this file is. Mirrors
 *  `s3dgraphy.container.ProjectVersion` field for field — one vocabulary. */
export interface ProjectVersion {
  number: number;
  /** content digest of this version, `sha256:<12 hex>` */
  id: string;
  was_revision_of?: string | null;
  modified_at?: string | null;
}

export interface ContainerDoc {
  header?: Record<string, unknown>;
  graphs: Record<string, GraphSection>;
  active_graph_id?: string;
  layout?: Record<string, unknown>;
  version?: ProjectVersion;
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
  /** P3 · the revision this file claims to be, when it says */
  version: ProjectVersion | null;
  warnings: string[];
}

/** P3 · read a version block defensively — a file may carry anything. */
export function readVersion(raw: unknown): ProjectVersion | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const n = Number(v.number);
  return {
    number: Number.isFinite(n) && n > 0 ? Math.floor(n) : 1,
    id: String(v.id ?? ""),
    was_revision_of: v.was_revision_of ? String(v.was_revision_of) : null,
    modified_at: v.modified_at ? String(v.modified_at) : null,
  };
}

/** "v3 (da v2)" — the sentence a status bar wants. */
export function versionLabel(v: ProjectVersion | null): string {
  if (!v) return "";
  return v.was_revision_of ? `v${v.number} (da ${v.was_revision_of})` : `v${v.number}`;
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
               version: null,
               warnings: ["not an .em.json document (missing graph.nodes)"] };
    }
    const id = String(single.graph.graph_id ?? "graph");
    return { members: [{ id, doc: single }], shelf: null, activeGraphId: id,
             wasLegacy: true,
             version: readVersion((single as unknown as ContainerDoc).version),
             warnings };
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
  return { members, shelf, activeGraphId, wasLegacy: false,
           version: readVersion(doc.version), warnings };
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

// ── P3 · light-weight versioning ────────────────────────────────────────────

/** JSON with the keys sorted, the way Python's `json.dumps(sort_keys=True,
 *  separators=(",",":"))` writes it — so the two tools hash the same bytes.
 *
 *  DECLARED LIMIT: numbers are spelled by each language's own rules, so a float
 *  Python writes as `1.0` and JS as `1` would give different digests. EM content
 *  carries integers and strings, and the layout (where the floats live) is not
 *  hashed at all — but if that ever changes, this is the seam that has to. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const parts = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${parts.join(",")}}`;
}

/**
 * `sha256:<12 hex>` over the project's CONTENT — the graphs and which one was
 * active. NOT the layout, and not the version block itself.
 *
 * This is what decides whether a save is a new version, so "did the content
 * change" is MEASURED. Moving a box is not a new version of a study, and
 * pressing save three times on an unchanged project must not invent three
 * revisions.
 */
export function contentDigest(doc: ContainerDoc): string {
  const payload = {
    graphs: doc.graphs ?? {},
    active_graph_id: doc.active_graph_id ?? null,
  };
  return `sha256:${sha256Hex(canonicalJson(payload)).slice(0, 12)}`;
}

/**
 * Advance the project's version IF the content changed, and stamp it on `doc`.
 *
 * `previous` is the version the project carried before this write. An unchanged
 * digest keeps it: a save is not an edit. A changed one records
 * `was_revision_of` pointing at the digest it grew out of — the chain a citation
 * follows backwards, and `prov:wasRevisionOf` in the RDF projection.
 */
export function bumpVersion(
  doc: ContainerDoc,
  previous: ProjectVersion | null,
  at?: string,
): ProjectVersion {
  const digest = contentDigest(doc);
  if (previous && previous.id === digest) {
    doc.version = previous;
    return previous;
  }
  const next: ProjectVersion = {
    number: previous ? previous.number + 1 : 1,
    id: digest,
    was_revision_of: previous?.id || null,
    modified_at: at ?? new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  };
  doc.version = next;
  return next;
}

// ── integrating later ───────────────────────────────────────────────────────

/** Why a contested node was resolved the way it was. Mirrors
 *  `s3dgraphy.container.CONFLICT_REASONS`. */
export type ConflictReason = "newer" | "tie" | "unstamped";

/** P3 · one node two people edited — who won, who lost, and why. */
export interface Conflict {
  nodeId: string;
  reason: ConflictReason;
  winner: { by: string | null; at: string | null; stamp: string | null; side: "mine" | "theirs" };
  loser: { by: string | null; at: string | null; stamp: string | null; side: "mine" | "theirs" };
  /** which fields diverged (`name`, `data.value`, …) — a pointer, not a diff */
  fieldHint: string[];
  /** the losing version verbatim, so "keep A's version" needs no second file */
  loserPayload: Record<string, unknown>;
}

export interface MergeReport {
  addedGraphs: string[];
  mergedGraphs: string[];
  mergedNodes: number;
  addedNodes: number;
  addedEdges: number;
  /** P3 · the contested nodes. `mergedNodes` says how many; this says WHICH. */
  conflicts: Conflict[];
  warnings: string[];
}

/** The four editorial fields — the stamps, kept out of the content comparison. */
const EDITORIAL_FIELDS = ["created_by", "created_at", "modified_by", "modified_at"];

/** `[instant, by, which]` — the stamp that dates a node. `modified_at` when
 *  there is one, else `created_at`: the last hand is what a merge compares, and
 *  a node nobody edited is dated by its creation. */
function stampOf(node: Record<string, unknown>): [string | null, string | null, string | null] {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (data.modified_at) return [String(data.modified_at), data.modified_by ? String(data.modified_by) : null, "modified_at"];
  if (data.created_at) return [String(data.created_at), data.created_by ? String(data.created_by) : null, "created_at"];
  return [null, null, null];
}

function instant(text: string | null): number | null {
  if (!text) return null;
  const t = Date.parse(text);
  return Number.isNaN(t) ? null : t;
}

/** The node without its editorial stamps: two versions that differ only in when
 *  they were saved are not a conflict — nobody's work is at stake, and a list
 *  that cries wolf is a list nobody reads. */
function contentOf(node: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "data") continue;
    out[k] = v;
  }
  const data = node.data as Record<string, unknown> | undefined;
  if (data && typeof data === "object") {
    const stripped: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (!EDITORIAL_FIELDS.includes(k)) stripped[k] = v;
    }
    if (Object.keys(stripped).length) out.data = stripped;
  }
  return out;
}

function divergingFields(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const hints: string[] = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of [...keys].sort()) {
    if (k === "data") continue;
    if (canonicalJson(a[k]) !== canonicalJson(b[k])) hints.push(k);
  }
  const da = (a.data ?? {}) as Record<string, unknown>;
  const db = (b.data ?? {}) as Record<string, unknown>;
  const dkeys = new Set([...Object.keys(da), ...Object.keys(db)]);
  for (const k of [...dkeys].sort()) {
    if (canonicalJson(da[k]) !== canonicalJson(db[k])) hints.push(`data.${k}`);
  }
  return hints;
}

/**
 * Which version of a contested node survives, and why.
 *
 * By DATE, not by arrival — that is what makes the outcome the same whichever
 * file you open first. An exact tie cannot be decided by the date, so a stable
 * tie-break does (smaller editor iD, then smaller serialisation): arbitrary, and
 * DECLARED arbitrary by `reason: "tie"`. What it must not be is random or
 * order-dependent, because then two people merging the same two files would end
 * up with different projects and no way to tell.
 *
 * When either side carries no stamp the date did NOT decide: the incoming
 * version is kept (the historical behaviour) and the reason says `unstamped`, so
 * nobody reads it as a judgement. An absent stamp is unknown, not older.
 */
/** Let the incoming version take the place of the local one, IN PLACE.
 *
 *  In place and not by swapping the array element, because the node object may
 *  already be referenced elsewhere (a store, a selection). And the local keys
 *  the incoming node does not have are DROPPED: `Object.assign` alone would
 *  leave a field the other author deleted quietly alive, which is a third
 *  version neither of them wrote. */
function replaceNode(
  nodes: Array<Record<string, unknown>>,
  byId: Map<string, Record<string, unknown>>,
  id: string,
  incoming: Record<string, unknown>,
): void {
  const existing = byId.get(id);
  if (!existing) {
    nodes.push(incoming);
    byId.set(id, incoming);
    return;
  }
  for (const key of Object.keys(existing)) {
    if (!(key in incoming)) delete existing[key];
  }
  Object.assign(existing, incoming);
}

function pickWinner(
  mine: Record<string, unknown>,
  theirs: Record<string, unknown>,
): ["mine" | "theirs", ConflictReason] {
  const [mineAt, mineBy] = stampOf(mine);
  const [theirsAt, theirsBy] = stampOf(theirs);
  const a = instant(mineAt);
  const b = instant(theirsAt);
  if (a === null || b === null) return ["theirs", "unstamped"];
  if (a > b) return ["mine", "newer"];
  if (b > a) return ["theirs", "newer"];
  const ka = mineBy ?? "";
  const kb = theirsBy ?? "";
  if (ka !== kb) return [ka < kb ? "mine" : "theirs", "tie"];
  return [canonicalJson(mine) <= canonicalJson(theirs) ? "mine" : "theirs", "tie"];
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
 * P3 · when the same node is on both sides with DIFFERENT content, the editorial
 * stamps decide (`pickWinner`) and the loser is recorded in `report.conflicts`.
 * The winner keeps ITS OWN stamps — never re-stamped with the session running
 * the merge, the same rule the audit applies to `applyRemoteOp`.
 *
 * DECLARED LIMIT: the unit of resolution is the NODE, not the field. If you
 * changed a description and somebody else changed a date, the newer node wins
 * whole and the other edit is in the conflict list, not merged in. Keeping both
 * needs a common ancestor (three-way) or a version vector — P4.
 */
/**
 * Resolve ONE node two sides both have. The single point where "who wins" is
 * decided — the merge calls it per node, and so does the live op-log
 * (`applyRemoteOp`), because a conflict that arrives one operation at a time is
 * the same conflict and must not be judged by a second rule.
 *
 * Returns which side wins and, when the two versions actually diverge, the
 * `Conflict` to report. `conflict` is null when the content is the same: no
 * work is at stake, and a list that cries wolf is a list nobody reads.
 */
export function resolveNodePair(
  nodeId: string,
  mine: Record<string, unknown>,
  theirs: Record<string, unknown>,
): { side: "mine" | "theirs"; reason: ConflictReason; conflict: Conflict | null } {
  const mineContent = contentOf(mine);
  const theirsContent = contentOf(theirs);
  const [side, reason] = pickWinner(mine, theirs);
  if (canonicalJson(mineContent) === canonicalJson(theirsContent)) {
    return { side, reason, conflict: null };
  }
  const winnerNode = side === "mine" ? mine : theirs;
  const loserNode = side === "mine" ? theirs : mine;
  const [wAt, wBy, wStamp] = stampOf(winnerNode);
  const [lAt, lBy, lStamp] = stampOf(loserNode);
  return {
    side,
    reason,
    conflict: {
      nodeId,
      reason,
      winner: { by: wBy, at: wAt, stamp: wStamp, side },
      loser: { by: lBy, at: lAt, stamp: lStamp,
               side: side === "mine" ? "theirs" : "mine" },
      fieldHint: divergingFields(mineContent, theirsContent),
      loserPayload: { ...loserNode },
    },
  };
}

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
      report.mergedNodes++;
      // ONE decision point, shared with the live op-log — see `resolveNodePair`.
      const { side, conflict } = resolveNodePair(id, existing, node);
      if (side === "theirs") replaceNode(targetNodes, byId, id, node);
      if (conflict) report.conflicts.push(conflict);
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
    addedNodes: 0, addedEdges: 0, conflicts: [], warnings: [...other.warnings],
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
