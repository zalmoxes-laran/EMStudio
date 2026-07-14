// Editable document store with snapshot-based undo/redo. The graph section
// stays the single source of truth; layout mutations (positions, folding)
// live in the optional layout section, exactly as persisted in .em.json.
// NOTE: this is the phase-4 in-frontend editing model; it migrates behind
// em-core (WASM / Tauri IPC) when the core editing API lands.
import type { EmDocument, EmEdge, EmNode, LayoutRect, Swimlane } from "./types";
import { MEMBERSHIP_EDGES } from "./folding";

/** A structured graph mutation for the live op-log bridge (ADR-002 phase 2).
 * Kept small and additive; more variants (add/delete node/edge) land next. */
export type GraphOp = {
  op: "update_node";
  node_id: string;
  patch: Partial<EmNode>;
};

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
      if (op.op === "update_node") this.updateNode(op.node_id, op.patch);
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
    return node;
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
    if (ix >= 0) g.edges.splice(ix, 1);
    this.emit();
  }

  /** Remove a node from a container/group: drop the membership edge(s) from
   * `nodeId` to `containerId` (is_part_of / is_in_*). Other memberships stay.
   * `pos` places the freed node on the canvas at the drop point. */
  removeFromGroup(nodeId: string, containerId: string, pos?: LayoutRect): void {
    this.checkpoint();
    const g = this.doc.graph;
    g.edges = g.edges.filter(
      (e) =>
        !(
          e.source === nodeId &&
          e.target === containerId &&
          MEMBERSHIP_EDGES.has(e.edge_type ?? "")
        ),
    );
    if (pos) {
      const layout = (this.doc.layout ??= {});
      (layout.positions ??= {})[nodeId] = pos;
    }
    this.emit();
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
