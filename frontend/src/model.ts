// Editable document store with snapshot-based undo/redo. The graph section
// stays the single source of truth; layout mutations (positions, folding)
// live in the optional layout section, exactly as persisted in .em.json.
// NOTE: this is the phase-4 in-frontend editing model; it migrates behind
// em-core (WASM / Tauri IPC) when the core editing API lands.
import type { EmDocument, EmEdge, EmNode, LayoutRect } from "./types";

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

  constructor(doc: EmDocument) {
    this.doc = doc;
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    this.dirty = true;
    for (const fn of this.listeners) fn();
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

  freshId(nodeType: string): string {
    const ids = new Set(this.doc.graph.nodes.map((n) => n.id));
    const base = nodeType.replace(/[^A-Za-z0-9]/g, "") || "node";
    let i = 1;
    while (ids.has(`${base}_${String(i).padStart(2, "0")}`)) i++;
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

  updateNode(id: string, patch: Partial<EmNode>): void {
    const n = this.node(id);
    if (!n) return;
    this.checkpoint();
    Object.assign(n, patch);
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
