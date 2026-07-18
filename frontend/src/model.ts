// Editable document store with snapshot-based undo/redo. The graph section
// stays the single source of truth; layout mutations (positions, folding)
// live in the optional layout section, exactly as persisted in .em.json.
// NOTE: this is the phase-4 in-frontend editing model; it migrates behind
// em-core (WASM / Tauri IPC) when the core editing API lands.
import type { EmDocument, EmEdge, EmNode, LayoutRect, Swimlane } from "./types";
import { MEMBERSHIP_EDGES } from "./folding";

/** A structured graph mutation for the live op-log bridge (ADR-002 phase 2).
 * Kept small and additive; more variants (add/delete node/edge) land next. */
export type GraphOp =
  | { op: "update_node"; node_id: string; patch: Partial<EmNode> }
  | { op: "add_node"; node: EmNode }
  | { op: "delete_node"; node_id: string }
  | { op: "add_edge"; edge: EmEdge }
  | { op: "delete_edge"; edge: EmEdge };

interface Snapshot {
  graph: string;
  layout: string;
}

const MAX_UNDO = 80;

export class DocumentStore {
  doc: EmDocument;
  dirty = false;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private listeners: Array<() => void> = [];
  // op-log listener (ADR-002 phase 2): every mutation also emits a structured
  // operation for the live bridge. Suppressed while APPLYING a remote op.
  private opFn: ((op: GraphOp) => void) | null = null;
  private suppressOp = false;

  constructor(doc: EmDocument) {
    this.doc = doc;
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  onOp(fn: (op: GraphOp) => void): void {
    this.opFn = fn;
  }

  private emit(): void {
    this.dirty = true;
    for (const fn of this.listeners) fn();
  }

  private emitOp(op: GraphOp): void {
    if (!this.suppressOp) this.opFn?.(op);
  }

  /** Apply an operation that arrived from a peer, WITHOUT re-emitting it. */
  applyRemoteOp(op: GraphOp): void {
    this.suppressOp = true;
    try {
      switch (op.op) {
        case "update_node":
          this.updateNode(op.node_id, op.patch);
          break;
        case "add_node":
          if (!this.node(op.node.id)) this.addNode(op.node);
          break;
        case "delete_node":
          this.deleteNode(op.node_id);
          break;
        case "add_edge":
          if (!this.doc.graph.edges.some((e) => e.id === op.edge.id)) {
            this.doc.graph.edges.push(op.edge);
            this.emit();
          }
          break;
        case "delete_edge":
          this.deleteEdge(op.edge);
          break;
      }
    } finally {
      this.suppressOp = false;
    }
  }

  private take(): Snapshot {
    return {
      graph: JSON.stringify(this.doc.graph),
      layout: JSON.stringify(this.doc.layout ?? null),
    };
  }

  private restore(s: Snapshot): void {
    this.doc.graph = JSON.parse(s.graph);
    const layout = JSON.parse(s.layout);
    if (layout === null) delete this.doc.layout;
    else this.doc.layout = layout;
  }

  private checkpoint(): void {
    this.undoStack.push(this.take());
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push(this.take());
    this.restore(s);
    this.emit();
  }

  redo(): void {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(this.take());
    this.restore(s);
    this.emit();
  }

  // ---------- lookups ----------
  node(id: string): EmNode | undefined {
    return this.doc.graph.nodes.find((n) => n.id === id);
  }

  /** A globally-unique node identity (UUID). New nodes MUST use this so
   * they never collide with EMtools / imported nodes when graphs are merged
   * or synced — the id is the identity, the human label is `name`. */
  newId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto)
      return crypto.randomUUID();
    // Fallback for non-secure contexts (shouldn't happen on localhost/Tauri).
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /** A fresh human-readable label ("US_01", "US_02", …), unique among the
   * existing node NAMES. This is the display name, NOT the id (see newId). */
  freshLabel(nodeType: string): string {
    const names = new Set(
      this.doc.graph.nodes.map((n) => String(n.name ?? "")),
    );
    const base = nodeType.replace(/[^A-Za-z0-9]/g, "") || "node";
    let i = 1;
    while (names.has(`${base}_${String(i).padStart(2, "0")}`)) i++;
    return `${base}_${String(i).padStart(2, "0")}`;
  }

  // ---------- mutations ----------
  addNode(node: EmNode, pos?: LayoutRect): EmNode {
    this.checkpoint();
    this.doc.graph.nodes.push(node);
    if (pos) {
      const layout = (this.doc.layout ??= {});
      (layout.positions ??= {})[node.id] = pos;
    }
    this.emit();
    this.emitOp({ op: "add_node", node });
    return node;
  }

  /** Create an epoch: an EpochNode in the graph PLUS a swimlane in the layout
   * so it shows as a lane in Matrix view (it renders as a node in Graph view,
   * invariant 4). The lane is appended below the existing ones; the optional
   * `pos` places the node for the graph view. */
  addEpoch(name?: string, pos?: LayoutRect): EmNode {
    this.checkpoint();
    const id = this.newId();
    const node: EmNode = {
      id,
      name: name ?? this.freshLabel("Epoch"),
      node_type: "EpochNode",
      description: "",
    };
    this.doc.graph.nodes.push(node);
    const layout = (this.doc.layout ??= {});
    const lanes = (layout.swimlanes ??= []);
    const DEFAULT_H = 200;
    const y = lanes.length ? Math.max(...lanes.map((l) => l.y + l.height)) : 0;
    const lane: Swimlane = { epoch_id: id, y, height: DEFAULT_H, order: lanes.length };
    lanes.push(lane);
    (layout.positions ??= {})[id] = pos ?? { x: 0, y, w: 140, h: 30 };
    this.emit();
    this.emitOp({ op: "add_node", node }); // swimlane is layout; the EpochNode is the graph part
    // a new epoch always gets its temporal paradata scaffold (group + the two
    // absolute_time_* properties), so the chronology is authorable as paradata
    this.ensureEpochTemporalParadata(id);
    return node;
  }

  /** Create an epoch and insert its swimlane at a given position in the
   *  top-level lane stack (index 0 = top/newest). Optional numeric start/end
   *  seed the chronology (used by the spatial insert to interpolate between
   *  neighbours). Layout-only for the ordering — the caller runs a from-sketch
   *  relayout so em-core re-lays nodes into the new lane order. */
  addEpochAt(index: number, name?: string, start?: number, end?: number): EmNode {
    this.checkpoint();
    const id = this.newId();
    const node: EmNode = {
      id,
      name: name ?? this.freshLabel("Epoch"),
      node_type: "EpochNode",
      description: "",
    };
    if (start != null || end != null) {
      const d: Record<string, unknown> = {};
      if (start != null) d.start_time = start;
      if (end != null) d.end_time = end;
      node.data = d;
    }
    this.doc.graph.nodes.push(node);
    const layout = (this.doc.layout ??= {});
    const lanes = (layout.swimlanes ??= []);
    const DEFAULT_H = 200;
    const tops = lanes.filter((l) => this.parentEpoch(l.epoch_id) == null);
    const lane: Swimlane = { epoch_id: id, y: 0, height: DEFAULT_H, order: 0 };
    lanes.push(lane);
    // splice the new lane into the top-level order, then re-flow y/order so the
    // stack stays contiguous with the new lane at `index`.
    const clamped = Math.max(0, Math.min(index, tops.length));
    const ordered = [...tops];
    ordered.splice(clamped, 0, lane);
    let y = tops.length ? Math.min(...tops.map((l) => l.y)) : 0;
    ordered.forEach((l, i) => {
      l.order = i;
      l.y = y;
      y += l.height;
    });
    (layout.positions ??= {})[id] = { x: 0, y: lane.y, w: 140, h: 30 };
    this.emit();
    this.emitOp({ op: "add_node", node });
    this.ensureEpochTemporalParadata(id);
    return node;
  }

  /** Move an epoch's swimlane one slot up (dir -1) or down (dir +1) in the
   *  stack, restacking the y of all lanes. Layout-only (no op-log: lane order
   *  is a visualisation concern; epoch membership stays semantic via edges). */
  reorderEpoch(epochId: string, dir: -1 | 1): boolean {
    // reordering an epoch that already holds units risks upward-connection
    // errors (arrows point down within the stack) — block it (E.D.'s rule)
    if (!this.isEpochEmpty(epochId)) return false;
    const lanes = this.doc.layout?.swimlanes;
    if (!lanes || lanes.length < 2) return false;
    const sorted = [...lanes].sort((a, b) => a.y - b.y); // current visual order
    const i = sorted.findIndex((l) => l.epoch_id === epochId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return false;
    this.checkpoint();
    // Set the new lane order + y. The caller then runs a FROM-SKETCH relayout,
    // which reads this swimlane order (em-core `compute_with_sketch`) and re-lays
    // out every node into its lane semantically — so nodes follow their lane and
    // lane heights are recomputed (a phased lane with sub-bands stays correct),
    // instead of a geometric node-shift that broke on phased/taller lanes.
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    let y = Math.min(...lanes.map((l) => l.y)); // keep the stack's top anchor
    sorted.forEach((l, idx) => {
      l.order = idx;
      l.y = y;
      y += l.height;
    });
    this.emit();
    return true;
  }

  // ---- Epoch temporal paradata (EM 1.6) --------------------------------
  // An epoch's absolute chronology (start/end) is authored as two PropertyNodes
  // — absolute_time_start / absolute_time_end — inside the epoch's
  // ParadataNodeGroup (has_paradata_nodegroup, datamodel 1.6.1). The property
  // VALUE mirrors the epoch's start_time/end_time attribute (what Matrix reads),
  // and the property is the anchor for a provenance chain
  // (combiner → extractor → document). The two views stay in sync via
  // setEpochBound / setPropertyValue.

  /** The ParadataNodeGroup attached to an epoch, or null. */
  epochParadataGroup(epochId: string): string | null {
    for (const e of this.doc.graph.edges)
      if (e.source === epochId && e.edge_type === "has_paradata_nodegroup")
        return e.target;
    return null;
  }

  /** The PropertyNode of a given property_type inside a paradata group. */
  private propInGroup(pdgId: string, propType: string): EmNode | undefined {
    for (const e of this.doc.graph.edges) {
      if (e.edge_type === "is_in_paradata_nodegroup" && e.target === pdgId) {
        const n = this.node(e.source);
        if (
          n &&
          n.node_type === "property" &&
          (n.data as Record<string, unknown> | undefined)?.property_type ===
            propType
        )
          return n;
      }
    }
    return undefined;
  }

  /** The epoch owning the paradata group a temporal PropertyNode lives in. */
  epochOfTemporalProperty(propId: string): string | null {
    let pdgId: string | null = null;
    for (const e of this.doc.graph.edges)
      if (e.edge_type === "is_in_paradata_nodegroup" && e.source === propId) {
        pdgId = e.target;
        break;
      }
    if (!pdgId) return null;
    for (const e of this.doc.graph.edges)
      if (e.edge_type === "has_paradata_nodegroup" && e.target === pdgId)
        return e.source;
    return null;
  }

  /** Ensure an epoch has a ParadataNodeGroup holding absolute_time_start /
   *  absolute_time_end PropertyNodes, seeding each value from the epoch's
   *  start_time/end_time. Idempotent — returns the group + property ids. */
  ensureEpochTemporalParadata(
    epochId: string,
  ): { pdgId: string; startId: string; endId: string } | null {
    const epoch = this.node(epochId);
    if (!epoch || epoch.node_type !== "EpochNode") return null;
    // A phase (sub-epoch) is an EpochNode too, and gets its own temporal PDG —
    // but NO em-core anchor: a phase has no swimlane, so its box is placed
    // view-side at its sub-band's bottom-left (matrix.ts) and hidden when the
    // phase bands are off. Epochs keep the portable em-core bottom-left anchor.
    const isPhase = this.parentEpoch(epochId) != null;
    const ed = (epoch.data ?? {}) as Record<string, unknown>;
    // A stored position matters: Matrix skips nodes without one, so a
    // freshly-created group/property would be invisible. Seed positions in the
    // epoch's lane; the matrix anchoring pass then tucks them bottom-left.
    const lane = this.doc.layout?.swimlanes?.find((l) => l.epoch_id === epochId);
    const laneY = lane?.y ?? 0;
    const laneH = lane?.height ?? 200;
    const baseY = laneY + Math.max(0, laneH - 46);
    let pdgId = this.epochParadataGroup(epochId);
    if (!pdgId) {
      const g = this.addNode(
        {
          id: this.newId(),
          name: `${epoch.name ?? "Epoch"} · paradata`,
          node_type: "ParadataNodeGroup",
          description: "",
        },
        { x: 10, y: baseY - 4, w: 200, h: 44 },
      );
      pdgId = g.id;
      this.addEdge(epochId, pdgId, "has_paradata_nodegroup");
    }
    let slot = 0;
    const ensureProp = (propType: string, boundKey: string): string => {
      const existing = this.propInGroup(pdgId!, propType);
      if (existing) {
        // keep its system anchor current even for a pre-existing prop (epochs
        // only — phases are placed view-side against their sub-band)
        if (!isPhase) this.setAnchor(existing.id, epochId, "bl", slot++ * 100, 8);
        else slot++;
        return existing.id;
      }
      const seed = ed[boundKey] != null ? String(ed[boundKey]) : "";
      // A PropertyNode's VALUE lives in `description` (the EM convention: real
      // graphml-imported properties carry the value there, `value` stays null).
      // property_type is the only thing we keep in data.
      const s = slot++;
      const p = this.addNode(
        {
          id: this.newId(),
          name: propType,
          node_type: "property",
          description: seed,
          data: { property_type: propType },
        },
        { x: 20 + s * 100, y: baseY, w: 90, h: 30 },
      );
      this.addEdge(p.id, pdgId!, "is_in_paradata_nodegroup");
      // system anchor: the box sits bottom-left of the epoch (rule pin, so a
      // Layout run keeps it there — resolved by em-core, portable to Heriverse).
      // Phases get no anchor: they're placed view-side against their sub-band.
      if (!isPhase) this.setAnchor(p.id, epochId, "bl", s * 100, 8);
      return p.id;
    };
    const startId = ensureProp("absolute_time_start", "start_time");
    const endId = ensureProp("absolute_time_end", "end_time");
    return { pdgId, startId, endId };
  }

  /** Ensure EVERY epoch has its temporal ParadataNodeGroup — a SILENT
   *  load-time completion: pushes nodes/edges/positions straight onto the doc,
   *  with NO checkpoint, NO op emission and NO change event (so it neither
   *  pollutes undo nor pushes structural additions to a sync host). */
  ensureAllEpochParadata(): void {
    const g = this.doc.graph;
    const layout = (this.doc.layout ??= {});
    const positions = (layout.positions ??= {});
    // phases (has_sub_epoch targets) also get their temporal box, but with NO
    // em-core anchor — they have no swimlane, so matrix.ts places their box at
    // the phase sub-band's bottom-left and hides it when phase bands are off.
    const phaseIds = new Set<string>();
    for (const e of g.edges)
      if (e.edge_type === "has_sub_epoch") phaseIds.add(e.target);
    for (const epoch of [...g.nodes]) {
      if (epoch.node_type !== "EpochNode") continue;
      // every EpochNode (top-level epoch OR phase) gets a box. NOTE: do NOT gate
      // on having a swimlane — a Blender sync snapshot has NO swimlanes at load
      // (em-core computes them after), yet those epochs still need their box.
      const isPhase = phaseIds.has(epoch.id);
      const existingPdg = this.epochParadataGroup(epoch.id);
      if (existingPdg) {
        // PDG already present (e.g. a Blender sync snapshot, or an earlier
        // session): don't recreate it. For epochs, STILL ensure the bottom-left
        // system anchor exists (setAnchor is idempotent) so a Layout run
        // positions it; phases carry no anchor (placed view-side), so skip.
        if (isPhase) continue;
        const order = ["absolute_time_start", "absolute_time_end"];
        g.edges
          .filter(
            (e) =>
              e.edge_type === "is_in_paradata_nodegroup" && e.target === existingPdg,
          )
          .map((e) => this.node(e.source))
          .filter(
            (n): n is EmNode =>
              !!n &&
              n.node_type === "property" &&
              order.includes(
                String((n.data as Record<string, unknown> | undefined)?.property_type),
              ),
          )
          .sort(
            (a, b) =>
              order.indexOf(String((a.data as Record<string, unknown>).property_type)) -
              order.indexOf(String((b.data as Record<string, unknown>).property_type)),
          )
          .forEach((p, s) => this.setAnchor(p.id, epoch.id, "bl", s * 100, 8));
        continue;
      }
      const ed = (epoch.data ?? {}) as Record<string, unknown>;
      const lane = layout.swimlanes?.find((l) => l.epoch_id === epoch.id);
      const baseY = (lane?.y ?? 0) + Math.max(0, (lane?.height ?? 200) - 46);
      const pdgId = this.newId();
      g.nodes.push({
        id: pdgId,
        name: `${epoch.name ?? "Epoch"} · paradata`,
        node_type: "ParadataNodeGroup",
        description: "",
      });
      positions[pdgId] = { x: 10, y: baseY - 4, w: 200, h: 44 };
      g.edges.push({
        id: `${epoch.id}__has_paradata_nodegroup__${pdgId}`,
        source: epoch.id,
        target: pdgId,
        edge_type: "has_paradata_nodegroup",
      });
      let slot = 0;
      for (const [pt, bk] of [
        ["absolute_time_start", "start_time"],
        ["absolute_time_end", "end_time"],
      ] as const) {
        const pid = this.newId();
        g.nodes.push({
          id: pid,
          name: pt,
          node_type: "property",
          // value lives in description (uniform with real EM property data)
          description: ed[bk] != null ? String(ed[bk]) : "",
          data: { property_type: pt },
        });
        const s = slot++;
        positions[pid] = { x: 20 + s * 100, y: baseY, w: 90, h: 30 };
        g.edges.push({
          id: `${pid}__is_in_paradata_nodegroup__${pdgId}`,
          source: pid,
          target: pdgId,
          edge_type: "is_in_paradata_nodegroup",
        });
        // system anchor: epoch bottom-left (resolved by em-core on layout).
        // Phases carry no anchor — matrix.ts places their box view-side.
        if (!isPhase)
          (layout.anchors ??= []).push({
            node: pid,
            to: epoch.id,
            corner: "bl",
            dx: s * 100,
            dy: 8,
          });
      }
    }
  }

  // ---- Phases (sub-epochs, EM 1.6 periodisation) -----------------------
  // A phase is an EpochNode connected to its parent epoch by has_sub_epoch
  // (reverse is_in_epoch). Phases partition the parent's time-span. Rendering
  // as lane sub-bands comes later; here we manage the data + coherence.

  /** The sub-epochs (phases) of an epoch, in creation order. */
  epochPhases(epochId: string): string[] {
    const out: string[] = [];
    for (const e of this.doc.graph.edges)
      if (e.edge_type === "has_sub_epoch" && e.source === epochId)
        out.push(e.target);
    return out;
  }

  /** The parent epoch of a phase (via has_sub_epoch), or null if top-level. */
  parentEpoch(phaseId: string): string | null {
    for (const e of this.doc.graph.edges)
      if (e.edge_type === "has_sub_epoch" && e.target === phaseId)
        return e.source;
    return null;
  }

  /** True if no unit is attributed to this epoch (or its phases) via
   *  has_first_epoch / survive_in_epoch — i.e. it is safe to reorder without
   *  risking upward-connection errors. */
  isEpochEmpty(epochId: string): boolean {
    const ids = new Set([epochId, ...this.epochPhases(epochId)]);
    for (const e of this.doc.graph.edges)
      if (
        (e.edge_type === "has_first_epoch" ||
          e.edge_type === "survive_in_epoch") &&
        ids.has(e.target)
      )
        return false;
    return true;
  }

  /** Create a phase (sub-epoch) under an epoch: an EpochNode joined by
   *  has_sub_epoch. No swimlane (rendering as a lane sub-band comes later). */
  addPhase(epochId: string, name?: string, pos?: LayoutRect): EmNode {
    this.checkpoint();
    // the FIRST phase of a top-level epoch absorbs all the epoch's directly
    // attributed units, so there is no confusing "unphased" residual; the user
    // then adds more phases and repartitions (E.D., 2026-07).
    const isFirstPhase =
      this.parentEpoch(epochId) == null && this.epochPhases(epochId).length === 0;
    const id = this.newId();
    const n = this.epochPhases(epochId).length + 1;
    const node: EmNode = {
      id,
      name: name ?? `Phase ${n}`,
      node_type: "EpochNode",
      description: "",
    };
    this.doc.graph.nodes.push(node);
    if (pos) {
      const layout = (this.doc.layout ??= {});
      (layout.positions ??= {})[id] = pos;
    }
    this.emit();
    this.emitOp({ op: "add_node", node });
    this.addEdge(epochId, id, "has_sub_epoch");
    // give the new phase its temporal PDG right away (auto for all phases, like
    // epochs). The has_sub_epoch edge is in place, so ensureEpochTemporalParadata
    // sees it as a phase and skips the em-core anchor (view-side placement).
    this.ensureEpochTemporalParadata(id);
    // absorb the epoch's units into this first phase (re-target has_first_epoch /
    // survive_in_epoch that pointed at the epoch to the new phase)
    if (isFirstPhase) {
      const g = this.doc.graph;
      const removed = g.edges.filter(
        (e) =>
          (e.edge_type === "has_first_epoch" ||
            e.edge_type === "survive_in_epoch") &&
          e.target === epochId,
      );
      if (removed.length) {
        const rset = new Set(removed);
        g.edges = g.edges.filter((e) => !rset.has(e));
        const added: EmEdge[] = removed.map((e) => ({
          id: `${e.source}__${e.edge_type}__${id}`,
          source: e.source,
          target: id,
          edge_type: e.edge_type,
        }));
        g.edges.push(...added);
        this.emit();
        for (const e of removed) this.emitOp({ op: "delete_edge", edge: e });
        for (const e of added) this.emitOp({ op: "add_edge", edge: e });
      }
    }
    return node;
  }

  /** Chronology-coherence warnings for an epoch and its phases: bounds order,
   *  phases within the parent span, sibling phase overlap. Empty = coherent. */
  epochCoherenceWarnings(epochId: string): string[] {
    const warns: string[] = [];
    const num = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const bounds = (
      id: string,
    ): { s: number | null; e: number | null; name: string } => {
      const d = (this.node(id)?.data ?? {}) as Record<string, unknown>;
      return {
        s: num(d.start_time),
        e: num(d.end_time),
        name: this.node(id)?.name ?? id,
      };
    };
    // A bound that was typed but doesn't parse as a number is silently ignored
    // by the ordering/coherence maths — flag it so the user knows their date
    // won't sort the lane.
    const nonNumericWarn = (id: string): void => {
      const d = (this.node(id)?.data ?? {}) as Record<string, unknown>;
      const name = this.node(id)?.name ?? id;
      for (const [k, lbl] of [
        ["start_time", "start"],
        ["end_time", "end"],
      ] as const) {
        const raw = d[k];
        if (raw != null && String(raw).trim() !== "" && num(raw) == null)
          warns.push(`${name}: ${lbl} "${raw}" is not a number.`);
      }
    };
    // If this is a PHASE, report ITS conflicts (vs the parent span + siblings)
    // so the same warnings show at phase level, not only on the parent epoch.
    const parentId = this.parentEpoch(epochId);
    if (parentId != null) {
      const par = bounds(parentId);
      const ph = bounds(epochId);
      nonNumericWarn(epochId);
      if (ph.s != null && ph.e != null && ph.s > ph.e)
        warns.push(`${ph.name}: start (${ph.s}) is after end (${ph.e}).`);
      if (par.s != null && ph.s != null && ph.s < par.s)
        warns.push(`${ph.name}: starts before its epoch (${ph.s} < ${par.s}).`);
      if (par.e != null && ph.e != null && ph.e > par.e)
        warns.push(`${ph.name}: ends after its epoch (${ph.e} > ${par.e}).`);
      for (const sid of this.epochPhases(parentId)) {
        if (sid === epochId) continue;
        const sib = bounds(sid);
        if (
          ph.s != null &&
          ph.e != null &&
          sib.s != null &&
          sib.e != null &&
          ph.s < sib.e &&
          sib.s < ph.e
        )
          warns.push(`${ph.name} overlaps ${sib.name}.`);
      }
      return warns;
    }
    const ep = bounds(epochId);
    nonNumericWarn(epochId);
    for (const pid of this.epochPhases(epochId)) nonNumericWarn(pid);
    if (ep.s != null && ep.e != null && ep.s > ep.e)
      warns.push(`${ep.name}: start (${ep.s}) is after end (${ep.e}).`);
    const phases = this.epochPhases(epochId).map(bounds);
    for (const ph of phases) {
      if (ph.s != null && ph.e != null && ph.s > ph.e)
        warns.push(`${ph.name}: start (${ph.s}) is after end (${ph.e}).`);
      if (ep.s != null && ph.s != null && ph.s < ep.s)
        warns.push(`${ph.name}: starts before its epoch (${ph.s} < ${ep.s}).`);
      if (ep.e != null && ph.e != null && ph.e > ep.e)
        warns.push(`${ph.name}: ends after its epoch (${ph.e} > ${ep.e}).`);
    }
    const withStart = phases.filter((p) => p.s != null) as {
      s: number;
      e: number | null;
      name: string;
    }[];
    withStart.sort((a, b) => a.s - b.s);
    for (let i = 1; i < withStart.length; i++)
      if (
        withStart[i - 1].e != null &&
        withStart[i].s < (withStart[i - 1].e as number)
      )
        warns.push(`${withStart[i].name} overlaps ${withStart[i - 1].name}.`);
    return warns;
  }

  // ---- chronology ordering & cross-epoch validation (item 10) ----------

  /** Numeric start_time of an epoch/phase, or null if unset/non-numeric. */
  private startOf(id: string): number | null {
    const n = Number((this.node(id)?.data as { start_time?: unknown })?.start_time);
    return Number.isFinite(n) ? n : null;
  }
  private endOf(id: string): number | null {
    const n = Number((this.node(id)?.data as { end_time?: unknown })?.end_time);
    return Number.isFinite(n) ? n : null;
  }

  /** Ids of the top-level epochs (EpochNodes that are not a phase). */
  topEpochIds(): string[] {
    return this.doc.graph.nodes
      .filter(
        (n) =>
          (n.node_type === "EpochNode" || n.node_type === "epoch") &&
          this.parentEpoch(n.id) == null,
      )
      .map((n) => n.id);
  }

  /** Does the current lane stack (top→bottom) follow newest-first chronology?
   *  Undated epochs are skipped (can't judge). True when there's nothing to
   *  order or dates agree with the visual order. */
  lanesMatchDateOrder(): boolean {
    const lanes = this.doc.layout?.swimlanes;
    if (!lanes || lanes.length < 2) return true;
    const order = lanes
      .filter((l) => this.parentEpoch(l.epoch_id) == null)
      .slice()
      .sort((a, b) => a.y - b.y)
      .map((l) => l.epoch_id);
    let prev: number | null = null;
    for (const id of order) {
      const s = this.startOf(id);
      if (s == null) continue;
      if (prev != null && s > prev) return false; // a lower lane is NEWER
      prev = s;
    }
    return true;
  }

  /** Reorder the top-level swimlanes newest-first by start_time (undated → tail,
   *  stable). Layout-only, like reorderEpoch — NOT gated by isEpochEmpty because
   *  this is canonicalisation, not an arbitrary move; the caller runs a
   *  from-sketch relayout so em-core re-lays nodes into the new lane order. */
  sortLanesByDate(): void {
    const lanes = this.doc.layout?.swimlanes;
    if (!lanes || lanes.length < 2) return;
    const tops = lanes.filter((l) => this.parentEpoch(l.epoch_id) == null);
    if (tops.length < 2) return;
    this.checkpoint();
    const idx = new Map(tops.map((l, i) => [l, i]));
    const sorted = [...tops].sort((a, b) => {
      const sa = this.startOf(a.epoch_id);
      const sb = this.startOf(b.epoch_id);
      if (sa == null && sb == null) return idx.get(a)! - idx.get(b)!;
      if (sa == null) return 1;
      if (sb == null) return -1;
      if (sb !== sa) return sb - sa; // newest (larger start) on top
      return idx.get(a)! - idx.get(b)!;
    });
    let y = Math.min(...tops.map((l) => l.y));
    sorted.forEach((l, i) => {
      l.order = i;
      l.y = y;
      y += l.height;
    });
    this.emit();
  }

  /** Overlaps between the date spans of top-level epochs (a real chronology
   *  conflict — two epochs claiming the same absolute time). Gaps are NOT
   *  reported: a hiatus between epochs is legitimate in archaeology. */
  crossEpochWarnings(): string[] {
    const out: string[] = [];
    const tops = this.topEpochIds()
      .map((id) => ({
        name: this.node(id)?.name ?? id,
        s: this.startOf(id),
        e: this.endOf(id),
      }))
      .filter((x) => x.s != null && x.e != null) as {
      name: string;
      s: number;
      e: number;
    }[];
    tops.sort((a, b) => a.s - b.s); // oldest first
    for (let i = 1; i < tops.length; i++) {
      const prev = tops[i - 1];
      const cur = tops[i];
      if (cur.s < prev.e)
        out.push(`${cur.name} overlaps ${prev.name} (${cur.s} < ${prev.e}).`);
    }
    return out;
  }

  /** All chronology problems across the document: cross-epoch span overlaps +
   *  every top-level epoch's coherence warnings (start>end, phases outside the
   *  parent span, sibling-phase overlaps, non-numeric bounds — the per-epoch
   *  call already covers that epoch's phases). Deduped, for the ingestion /
   *  banner report. Lane ordering (lanesMatchDateOrder) is reported separately
   *  because it has a one-click fix. */
  chronologyIssues(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (w: string) => {
      if (!seen.has(w)) {
        seen.add(w);
        out.push(w);
      }
    };
    for (const w of this.crossEpochWarnings()) add(w);
    for (const id of this.topEpochIds())
      for (const w of this.epochCoherenceWarnings(id)) add(w);
    return out;
  }

  /** Set an epoch's start/end bound; mirror the value into its
   *  absolute_time_* PropertyNode when the paradata group exists. */
  setEpochBound(epochId: string, which: "start" | "end", value: string): void {
    const epoch = this.node(epochId);
    if (!epoch) return;
    const v = value.trim();
    const boundKey = which === "start" ? "start_time" : "end_time";
    const propType =
      which === "start" ? "absolute_time_start" : "absolute_time_end";
    const d = { ...((epoch.data ?? {}) as Record<string, unknown>) };
    // Store the bound as a NUMBER when it parses (canonical sort key — em-core
    // reads it with as_f64 to order the lanes, and a JSON string there sorts to
    // f64::MIN). A non-numeric entry is kept as-is (surfaced by
    // epochCoherenceWarnings) so nothing the user typed is silently dropped.
    if (v === "") delete d[boundKey];
    else {
      const n = Number(v);
      d[boundKey] = Number.isFinite(n) && v !== "" ? n : v;
    }
    this.updateNode(epochId, { data: d });
    const pdgId = this.epochParadataGroup(epochId);
    if (pdgId) {
      const p = this.propInGroup(pdgId, propType);
      if (p) this.updateNode(p.id, { description: v }); // value = description
    }
  }

  /** Set a PropertyNode's value; if it is an epoch temporal property, mirror
   *  the value back onto the owning epoch's start_time/end_time. */
  setPropertyValue(propId: string, value: string): void {
    const p = this.node(propId);
    if (!p) return;
    const v = value.trim();
    // the value lives in `description` (uniform with real EM property data)
    this.updateNode(propId, { description: v });
    const propType = ((p.data ?? {}) as Record<string, unknown>).property_type;
    if (propType === "absolute_time_start" || propType === "absolute_time_end") {
      const epochId = this.epochOfTemporalProperty(propId);
      const epoch = epochId ? this.node(epochId) : undefined;
      if (epoch) {
        const boundKey =
          propType === "absolute_time_start" ? "start_time" : "end_time";
        const ed = { ...((epoch.data ?? {}) as Record<string, unknown>) };
        if (v === "") delete ed[boundKey];
        else ed[boundKey] = v;
        this.updateNode(epoch.id, { data: ed });
      }
    }
  }

  addEdge(source: string, target: string, edgeType: string): EmEdge {
    this.checkpoint();
    const ids = new Set(this.doc.graph.edges.map((e) => e.id));
    let id = `${source}__${edgeType}__${target}`;
    let i = 2;
    while (ids.has(id)) id = `${source}__${edgeType}__${target}__${i++}`;
    const edge: EmEdge = { id, source, target, edge_type: edgeType };
    this.doc.graph.edges.push(edge);
    this.emit();
    this.emitOp({ op: "add_edge", edge });
    return edge;
  }

  hasEdge(source: string, target: string, edgeType: string): boolean {
    return this.doc.graph.edges.some(
      (e) =>
        e.source === source && e.target === target && e.edge_type === edgeType,
    );
  }

  deleteNode(id: string): void {
    this.checkpoint();
    const g = this.doc.graph;
    g.nodes = g.nodes.filter((n) => n.id !== id);
    g.edges = g.edges.filter((e) => e.source !== id && e.target !== id);
    const layout = this.doc.layout;
    if (layout) {
      if (layout.positions) delete layout.positions[id];
      if (layout.folded_groups)
        layout.folded_groups = layout.folded_groups.filter((f) => f !== id);
      if (layout.group_spaces) {
        delete layout.group_spaces[id];
        for (const space of Object.values(layout.group_spaces))
          delete space[id];
      }
    }
    this.emit();
    this.emitOp({ op: "delete_node", node_id: id });
  }

  /** Delete several nodes as ONE undo step (multi-selection). */
  deleteNodes(ids: string[]): void {
    if (!ids.length) return;
    if (ids.length === 1) return this.deleteNode(ids[0]);
    this.checkpoint();
    const set = new Set(ids);
    const g = this.doc.graph;
    g.nodes = g.nodes.filter((n) => !set.has(n.id));
    g.edges = g.edges.filter((e) => !set.has(e.source) && !set.has(e.target));
    const layout = this.doc.layout;
    if (layout) {
      for (const id of ids) {
        if (layout.positions) delete layout.positions[id];
        if (layout.group_spaces) {
          delete layout.group_spaces[id];
          for (const space of Object.values(layout.group_spaces))
            delete space[id];
        }
      }
      if (layout.folded_groups)
        layout.folded_groups = layout.folded_groups.filter((f) => !set.has(f));
    }
    this.emit();
    for (const id of ids) this.emitOp({ op: "delete_node", node_id: id });
  }

  deleteEdge(edge: EmEdge): void {
    this.checkpoint();
    const g = this.doc.graph;
    const ix = g.edges.findIndex(
      (e) =>
        (edge.id && e.id === edge.id) ||
        (e.source === edge.source &&
          e.target === edge.target &&
          e.edge_type === edge.edge_type),
    );
    let removed: EmEdge | null = null;
    if (ix >= 0) {
      removed = g.edges[ix];
      g.edges.splice(ix, 1);
    }
    this.emit();
    if (removed) this.emitOp({ op: "delete_edge", edge: removed });
  }

  /** Remove a node from a container/group: drop the membership edge(s) from
   * `nodeId` to `containerId` (is_part_of / is_in_*). Other memberships stay.
   * `pos` places the freed node on the canvas at the drop point. */
  removeFromGroup(nodeId: string, containerId: string, pos?: LayoutRect): void {
    this.checkpoint();
    const g = this.doc.graph;
    const removed: EmEdge[] = [];
    g.edges = g.edges.filter((e) => {
      const drop =
        e.source === nodeId &&
        e.target === containerId &&
        MEMBERSHIP_EDGES.has(e.edge_type ?? "");
      if (drop) removed.push(e);
      return !drop;
    });
    if (pos) {
      const layout = (this.doc.layout ??= {});
      (layout.positions ??= {})[nodeId] = pos;
    }
    this.emit();
    for (const e of removed) this.emitOp({ op: "delete_edge", edge: e });
  }

  /** Move a node INTO a group (drop-into-group, inverse of removeFromGroup):
   * re-parent by dropping the OLD primary membership (secondaries stay) and
   * adding a new membership edge of `edgeType` to `groupId`. */
  moveToGroup(
    nodeId: string,
    groupId: string,
    edgeType: string,
    oldContainerId: string | null,
  ): void {
    if (groupId === nodeId) return;
    this.checkpoint();
    const g = this.doc.graph;
    const removed: EmEdge[] = [];
    if (oldContainerId) {
      g.edges = g.edges.filter((e) => {
        const drop =
          e.source === nodeId &&
          e.target === oldContainerId &&
          MEMBERSHIP_EDGES.has(e.edge_type ?? "");
        if (drop) removed.push(e);
        return !drop;
      });
      // drop the stale group-local position so it re-grids in the new box
      const sp = this.doc.layout?.group_spaces?.[oldContainerId];
      if (sp) delete sp[nodeId];
    }
    const exists = g.edges.some(
      (e) => e.source === nodeId && e.target === groupId && e.edge_type === edgeType,
    );
    let addedEdge: EmEdge | null = null;
    if (!exists) {
      addedEdge = {
        id: `${nodeId}__${edgeType}__${groupId}`,
        source: nodeId,
        target: groupId,
        edge_type: edgeType,
      };
      g.edges.push(addedEdge);
    }
    this.emit();
    for (const e of removed) this.emitOp({ op: "delete_edge", edge: e });
    if (addedEdge) this.emitOp({ op: "add_edge", edge: addedEdge });
  }

  /** Create a NEW group node of `groupType` and make each of `nodeIds` a
   * member of it (edge `edgeType`). Used by right-click → Group (D3). */
  groupNodes(
    nodeIds: string[],
    groupType: string,
    edgeType: string,
    pos?: LayoutRect,
  ): EmNode {
    this.checkpoint();
    const id = this.newId();
    const group: EmNode = {
      id,
      name: this.freshLabel(groupType),
      node_type: groupType,
      description: "",
    };
    this.doc.graph.nodes.push(group);
    const added: EmEdge[] = [];
    for (const nid of nodeIds) {
      if (nid === id) continue;
      const dup = this.doc.graph.edges.some(
        (e) => e.source === nid && e.target === id && e.edge_type === edgeType,
      );
      if (!dup) {
        const edge: EmEdge = {
          id: `${nid}__${edgeType}__${id}`,
          source: nid,
          target: id,
          edge_type: edgeType,
        };
        this.doc.graph.edges.push(edge);
        added.push(edge);
      }
    }
    if (pos) {
      const l = (this.doc.layout ??= {});
      (l.positions ??= {})[id] = pos;
    }
    this.emit();
    this.emitOp({ op: "add_node", node: group });
    for (const edge of added) this.emitOp({ op: "add_edge", edge });
    return group;
  }

  /** Re-assign the FIRST epoch (swimlane) of one or more nodes: drop each
   * node's existing has_first_epoch edge and point it at `epochId`. Used when
   * a node/group is dragged into a different lane. */
  setFirstEpoch(nodeIds: string[], epochId: string): void {
    this.checkpoint();
    const g = this.doc.graph;
    const removed: EmEdge[] = [];
    const added: EmEdge[] = [];
    for (const nid of nodeIds) {
      if (nid === epochId) continue;
      g.edges = g.edges.filter((e) => {
        const drop = e.source === nid && e.edge_type === "has_first_epoch";
        if (drop) removed.push(e);
        return !drop;
      });
      const edge: EmEdge = {
        id: `${nid}__has_first_epoch__${epochId}`,
        source: nid,
        target: epochId,
        edge_type: "has_first_epoch",
      };
      g.edges.push(edge);
      added.push(edge);
    }
    this.emit();
    for (const e of removed) this.emitOp({ op: "delete_edge", edge: e });
    for (const e of added) this.emitOp({ op: "add_edge", edge: e });
  }

  /** Units attributed to a phase (has_first_epoch / survive_in_epoch) plus its
   *  own sub-phases — the nodes orphaned if the phase is deleted. */
  phaseOrphans(phaseId: string): { units: string[]; subPhases: string[] } {
    const units: string[] = [];
    const subPhases: string[] = [];
    for (const e of this.doc.graph.edges) {
      if (
        e.target === phaseId &&
        (e.edge_type === "has_first_epoch" || e.edge_type === "survive_in_epoch")
      )
        units.push(e.source);
      if (e.source === phaseId && e.edge_type === "has_sub_epoch")
        subPhases.push(e.target);
    }
    return { units, subPhases };
  }

  /** Delete a phase (sub-epoch), re-homing the units attributed to it — and any
   *  sub-phases it holds — onto `reassignTo` (typically the parent epoch, to
   *  un-phase the units, or an adjacent sibling phase). Emits granular edge ops
   *  so a synced host replays the same retargeting, then drops the phase node. */
  deletePhase(phaseId: string, reassignTo: string): void {
    this.checkpoint();
    const g = this.doc.graph;
    // the phase's temporal PDG + its property members are deleted too — otherwise
    // they'd be orphaned (no has_paradata_nodegroup source) and render as stray
    // "· paradata" boxes on the canvas.
    const pdgId = g.edges.find(
      (e) => e.edge_type === "has_paradata_nodegroup" && e.source === phaseId,
    )?.target;
    const propIds = pdgId
      ? g.edges
          .filter(
            (e) => e.edge_type === "is_in_paradata_nodegroup" && e.target === pdgId,
          )
          .map((e) => e.source)
      : [];
    const del = new Set<string>([
      phaseId,
      ...(pdgId ? [pdgId] : []),
      ...propIds,
    ]);
    const removed: EmEdge[] = [];
    const added: EmEdge[] = [];
    const kept: EmEdge[] = [];
    for (const e of g.edges) {
      if (
        e.target === phaseId &&
        (e.edge_type === "has_first_epoch" || e.edge_type === "survive_in_epoch")
      ) {
        removed.push(e);
        const ne: EmEdge = {
          id: `${e.source}__${e.edge_type}__${reassignTo}`,
          source: e.source,
          target: reassignTo,
          edge_type: e.edge_type,
        };
        added.push(ne);
        kept.push(ne);
      } else if (e.source === phaseId && e.edge_type === "has_sub_epoch") {
        // reparent this sub-phase under the new home
        removed.push(e);
        const ne: EmEdge = {
          id: `${reassignTo}__has_sub_epoch__${e.target}`,
          source: reassignTo,
          target: e.target,
          edge_type: "has_sub_epoch",
        };
        added.push(ne);
        kept.push(ne);
      } else if (del.has(e.source) || del.has(e.target)) {
        // edges on the phase, its PDG or its props (incl. the parent→phase link)
        removed.push(e);
      } else {
        kept.push(e);
      }
    }
    g.edges = kept;
    g.nodes = g.nodes.filter((n) => !del.has(n.id));
    const layout = this.doc.layout;
    if (layout?.positions) for (const id of del) delete layout.positions[id];
    if (layout?.anchors)
      layout.anchors = layout.anchors.filter(
        (a) => !del.has(a.node) && !del.has(a.to),
      );
    this.emit();
    for (const e of removed) this.emitOp({ op: "delete_edge", edge: e });
    for (const e of added) this.emitOp({ op: "add_edge", edge: e });
    for (const id of del) this.emitOp({ op: "delete_node", node_id: id });
  }

  updateNode(id: string, patch: Partial<EmNode>): void {
    const n = this.node(id);
    if (!n) return;
    this.checkpoint();
    Object.assign(n, patch);
    this.emit();
    this.emitOp({ op: "update_node", node_id: id, patch });
  }

  /** Edit the canvas header metadata (graph name + id). The GraphML/em.json
   * header shows these; both are user-editable (identity + display). */
  updateGraphMeta(patch: { name?: string; graph_id?: string }): void {
    this.checkpoint();
    const g = this.doc.graph as Record<string, unknown> & {
      graph_id: string;
    };
    if (patch.name !== undefined) g["name"] = patch.name;
    if (patch.graph_id) g.graph_id = patch.graph_id;
    this.emit();
  }

  /** Persisted position (matrix canvas). */
  moveNode(id: string, x: number, y: number, checkpoint: boolean): void {
    const layout = (this.doc.layout ??= {});
    const positions = (layout.positions ??= {});
    const r = positions[id];
    if (!r) return;
    if (checkpoint) this.checkpoint();
    r.x = x;
    r.y = y;
    this.emit();
  }

  /** Shift a set of nodes by a delta (dragging a whole group). */
  moveNodesBy(ids: string[], dx: number, dy: number, checkpoint: boolean): void {
    const positions = this.doc.layout?.positions;
    if (!positions) return;
    if (checkpoint) this.checkpoint();
    for (const id of ids) {
      const r = positions[id];
      if (r) {
        r.x += dx;
        r.y += dy;
      }
    }
    this.emit();
  }

  /** Position inside a group context (layout.group_spaces). */
  moveInGroupSpace(
    groupId: string,
    id: string,
    rect: LayoutRect,
    checkpoint: boolean,
  ): void {
    const layout = (this.doc.layout ??= {});
    const spaces = (layout.group_spaces ??= {});
    if (checkpoint) this.checkpoint();
    (spaces[groupId] ??= {})[id] = rect;
    this.emit();
  }

  /** Replace the layout (recompute), preserving fold state + group spaces. */
  setLayout(layout: import("./types").EmLayout): void {
    this.checkpoint();
    const old = this.doc.layout;
    if (old?.folded_groups?.length) layout.folded_groups = old.folded_groups;
    if (old?.group_spaces && Object.keys(old.group_spaces).length)
      layout.group_spaces = old.group_spaces;
    this.doc.layout = layout;
    this.emit();
  }

  /** Fold/unfold a whole set of groups as ONE undo step. */
  setFoldedMany(groupIds: string[], folded: boolean): void {
    if (!groupIds.length) return;
    this.checkpoint();
    const layout = (this.doc.layout ??= {});
    const set = new Set(layout.folded_groups ?? []);
    for (const id of groupIds) {
      if (folded) set.add(id);
      else set.delete(id);
    }
    layout.folded_groups = [...set].sort();
    this.emit();
  }

  isFolded(groupId: string): boolean {
    return this.doc.layout?.folded_groups?.includes(groupId) ?? false;
  }

  setFolded(groupId: string, folded: boolean): void {
    this.checkpoint();
    const layout = (this.doc.layout ??= {});
    const set = new Set(layout.folded_groups ?? []);
    if (folded) set.add(groupId);
    else set.delete(groupId);
    layout.folded_groups = [...set].sort();
    this.emit();
  }

  // ---- Node pinning (position lock) ------------------------------------
  // A pinned node keeps its exact Rect through a re-layout (em-core honours
  // layout.pinned). Pins are set by the user (a lock) or by the system.

  isPinned(nodeId: string): boolean {
    return this.doc.layout?.pinned?.includes(nodeId) ?? false;
  }

  /** Add/replace a rule pin: place `node` at `corner` of container `to` (+dx,dy).
   *  Deduped by node id. Written straight onto the layout (no checkpoint) — used
   *  by system anchoring (e.g. the epoch paradata box). */
  setAnchor(
    node: string,
    to: string,
    corner = "bl",
    dx = 0,
    dy = 0,
  ): void {
    const layout = (this.doc.layout ??= {});
    const list = (layout.anchors ??= []);
    const i = list.findIndex((a) => a.node === node);
    const anchor = { node, to, corner, dx, dy };
    if (i >= 0) list[i] = anchor;
    else list.push(anchor);
  }

  /** Pin/unpin one or more nodes. When pinning, the node's CURRENT position is
   *  frozen into layout.positions so the engine has an exact Rect to keep. */
  setPinned(nodeIds: string[], pinned: boolean, checkpoint = true): void {
    if (checkpoint) this.checkpoint();
    const layout = (this.doc.layout ??= {});
    const set = new Set(layout.pinned ?? []);
    for (const id of nodeIds) {
      if (pinned) set.add(id);
      else set.delete(id);
    }
    layout.pinned = [...set].sort();
    if (checkpoint) this.emit();
  }

  toJSON(): string {
    const header = { ...(this.doc.header ?? {}) };
    header["last_editor"] = "EMStudio 0.1.0";
    return JSON.stringify(
      { header, graph: this.doc.graph, layout: this.doc.layout },
      null,
      1,
    );
  }
}
