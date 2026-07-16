import "./style.css";
import { applyFolding, buildMembership, MEMBERSHIP_EDGES } from "./folding";
import { renderInspector } from "./inspector";
import { DocumentStore } from "./model";
import { buildNodeList } from "./nodelist";
import { buildOverview } from "./overview";
import { edgeStyle, SEQUENCE_EDGES } from "./palette";
import { buildPalette, SECTIONS } from "./palette-ui";
import { render, type ConnectDrag } from "./renderer";
import {
  allowedEdgeTypes,
  connectValidity,
  edgeTypeLabel,
  EM_VERSION,
  GENERIC_EDGE,
  isGroupType,
  isStratigraphicType,
  typeDescription,
} from "./rules";
import { sceneToSvg } from "./svg-export";
import {
  isTauri,
  openEmJson,
  writeEmJson,
  saveAsEmJson,
  setWindowTitle,
  baseName,
} from "./tauri";
import { SyncClient } from "./sync";
import {
  getSettings,
  getSyncUrl,
  saveSettings,
  SYNC_TOOLS,
  type Settings,
} from "./settings";
import {
  CIRCLES,
  type CircleKey,
  defaultVisibleCircles,
  edgeCircle,
  nodeCircle,
} from "./filters";
import { type Qualia, vocabularyFor } from "./vocab";
import { versionBreakdown } from "./versions";
import {
  hitGroupToggle,
  hitHandle,
  hitTest,
  sceneBounds,
  Viewport,
  type Scene,
} from "./scene";
import { GROUP_HEADER, GROUP_PAD } from "./views/matrix";
import { setupSearch } from "./search";
import type { EmDocument, ViewKind } from "./types";
import { buildGroupScene } from "./views/context";
import { buildGraphScene, type GraphAlgorithm } from "./views/graph";
import { buildMatrixScene } from "./views/matrix";

declare global {
  interface Window {
    __EM_TEST_DATA__?: EmDocument;
  }
}

// ---------- state ----------
let store: DocumentStore | null = null;
// Absolute path of the currently-open file on desktop (Tauri). null =
// no file yet (Save falls back to Save As) or running in a browser.
let currentFilePath: string | null = null;

// Live-sync (ADR-002 phase 1: selection). EMStudio is always the WS client.
const sync = new SyncClient();
// True while applying a selection that ARRIVED from the peer, so we don't
// echo it straight back (loop guard).
let applyingRemoteSelect = false;
// Sync endpoint is configured in Settings (see settings.ts); resolved fresh
// on each connect so a settings change takes effect on the next connect.
let view: ViewKind = "matrix";
// Graph-view layout: chosen algorithm + manual position overrides (drags /
// liquid clustering). Overrides persist across rebuilds in-session and are
// cleared on a fresh Layout, an algorithm change, or a new/loaded document.
let graphAlgorithm: GraphAlgorithm = "layered";
const graphOverrides = new Map<string, { x: number; y: number }>();
// Matrix VIEW layout: an em-core layout of the FILTERED subgraph, so the Matrix
// recompacts (no gaps) when detail-rings hide nodes. null = use the archival
// doc.layout. Recomputed on filter change / view→matrix (see refreshMatrixViewLayout).
let matrixViewLayout: import("./types").EmLayout | null = null;
const scenes: Partial<Record<ViewKind, Scene | null>> = {};
const viewports: Record<ViewKind, Viewport> = {
  matrix: new Viewport(),
  graph: new Viewport(),
};
let hoverId: string | null = null;
let selectedId: string | null = null;
let edgeFilter: "all" | "sequence" | "none" = "all";
let placingType: string | null = null;
let connect: ConnectDrag | null = null;
/** graph-view "liquid" filters: hidden node / edge types */
// hidden type sets are DERIVED from the visible circles of the CURRENT view
// (recomputeHiddenFromCircles); they are what buildScenes applies.
const hiddenNodeTypes = new Set<string>();
const hiddenEdgeTypes = new Set<string>();
// "circles of detail" — which detail rings are visible, per view. Matrix and
// Graph keep independent visibility so each view has its own default depth.
const circleState: Record<ViewKind, Set<CircleKey>> = {
  matrix: defaultVisibleCircles("matrix"),
  graph: defaultVisibleCircles("graph"),
};
// Recompute the hidden type sets from the current view's visible circles.
function recomputeHiddenFromCircles(): void {
  hiddenNodeTypes.clear();
  hiddenEdgeTypes.clear();
  if (!store) return;
  const visible = circleState[view];
  for (const n of store.doc.graph.nodes) {
    const c = nodeCircle(n.node_type);
    if (c && !visible.has(c)) hiddenNodeTypes.add(n.node_type);
  }
  for (const e of store.doc.graph.edges) {
    const t = e.edge_type ?? "";
    const c = edgeCircle(t);
    if (c && !visible.has(c)) hiddenEdgeTypes.add(t);
  }
}
// If a freshly-created node's detail ring is hidden in the current view, turn
// it back on — otherwise you "create" a node you can't see.
function ensureCircleVisibleFor(nodeType: string | undefined): void {
  const c = nodeCircle(nodeType);
  if (!c || circleState[view].has(c)) return;
  circleState[view].add(c);
  recomputeHiddenFromCircles();
  buildScenes();
  draw();
  if (filterPanelOpen()) renderCirclesPanel();
  const label = CIRCLES.find((x) => x.key === c)?.label ?? c;
  toast(`Filter: showing “${label}” (new node was hidden)`);
}
/** group-context navigation stack; empty = full canvas */
let contextStack: string[] = [];
let contextScene: Scene | null = null;
const contextViewport = new Viewport();

// ---------- dom ----------
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const wrap = document.getElementById("canvas-wrap")!;
const info = document.getElementById("info")!;
const tooltip = document.getElementById("tooltip")!;
const dropHint = document.getElementById("drop-hint")!;
const hintBar = document.getElementById("hint-bar")!;
const legend = document.getElementById("legend")!;
const inspector = document.getElementById("inspector")!;
const breadcrumb = document.getElementById("breadcrumb")!;
const edgeMenu = document.getElementById("edge-menu")!;
const toastEl = document.getElementById("toast")!;
const btnMatrix = document.getElementById("btn-matrix") as HTMLButtonElement;
const btnGraph = document.getElementById("btn-graph") as HTMLButtonElement;
const btnUndo = document.getElementById("btn-undo") as HTMLButtonElement;
const btnRedo = document.getElementById("btn-redo") as HTMLButtonElement;
const dirtyDot = document.getElementById("dirty-dot")!;
const sidePanel = document.getElementById("side")!;
const tabInspector = document.getElementById("tab-inspector") as HTMLButtonElement;
const tabNodes = document.getElementById("tab-nodes") as HTMLButtonElement;
const nodelistEl = document.getElementById("nodelist")!;

// EM-version pill → click for the version breakdown (config files + ontologies)
const verBtn = document.getElementById("em-version")!;
verBtn.textContent = `EM ${EM_VERSION}`;
let verPop: HTMLDivElement | null = null;
function closeVerPop(): void {
  verPop?.remove();
  verPop = null;
  document.removeEventListener("pointerdown", onVerOutside, true);
  document.removeEventListener("keydown", onVerKey, true);
}
function onVerOutside(e: PointerEvent): void {
  if (verPop && !verPop.contains(e.target as Node) && e.target !== verBtn)
    closeVerPop();
}
function onVerKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.stopPropagation();
    closeVerPop();
  }
}
verBtn.addEventListener("click", () => {
  if (verPop) {
    closeVerPop();
    return;
  }
  const b = versionBreakdown();
  const pop = document.createElement("div");
  pop.className = "ver-pop";
  const title = document.createElement("h4");
  title.textContent = `Extended Matrix ${b.emLanguage}`;
  pop.appendChild(title);
  const sect = (t: string): void => {
    const d = document.createElement("div");
    d.className = "ver-sect";
    d.textContent = t;
    pop.appendChild(d);
  };
  const row = (label: string, ver: string, srcTitle?: string): void => {
    const r = document.createElement("div");
    r.className = "ver-row";
    if (srcTitle) r.title = srcTitle;
    const s = document.createElement("span");
    s.textContent = label;
    const v = document.createElement("b");
    v.textContent = ver;
    r.append(s, v);
    pop.appendChild(r);
  };
  sect("JSON config files");
  for (const c of b.configs) row(c.label, c.version);
  sect("Reference ontologies");
  for (const o of b.ontologies) row(o.name, o.version, o.source);
  document.body.appendChild(pop);
  const rect = verBtn.getBoundingClientRect();
  pop.style.left = Math.min(rect.left, window.innerWidth - 316) + "px";
  pop.style.top = rect.bottom + 6 + "px";
  verPop = pop;
  setTimeout(() => {
    document.addEventListener("pointerdown", onVerOutside, true);
    document.addEventListener("keydown", onVerKey, true);
  }, 0);
});

let toastTimer: number | undefined;
function toast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.add("hidden"), 2600);
}

function viewSize(): { w: number; h: number } {
  // Fall back through canvas → window if the wrapper reports 0 (transient
  // relayout) so fit() never collapses the viewport to the min-scale.
  const w = wrap.clientWidth || canvas.clientWidth || window.innerWidth || 800;
  const h = wrap.clientHeight || canvas.clientHeight || window.innerHeight || 600;
  return { w, h };
}

function resizeCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  const { w, h } = viewSize();
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  draw();
}

const edgeVisible = (t: string | undefined): boolean => {
  if (edgeFilter === "none") return false;
  if (edgeFilter === "sequence") return SEQUENCE_EDGES.has(t ?? "");
  return true;
};

const inContext = (): boolean => contextStack.length > 0;

function scene(): Scene | null {
  return inContext() ? contextScene : (scenes[view] ?? null);
}

function viewport(): Viewport {
  return inContext() ? contextViewport : viewports[view];
}

function draw(): void {
  const s = scene();
  const { w, h } = viewSize();
  if (!s) {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    overview.update(null, viewport(), w, h);
    return;
  }
  render(
    ctx,
    s,
    viewport(),
    {
      hoverId,
      selectedId,
      selectedIds,
      edgeVisible,
      filterKey: edgeFilter,
      connect,
      editable: true,
    },
    w,
    h,
  );
  overview.update(s, viewport(), w, h);
  // selection overlay (screen space): a translucent wash + ring so the whole
  // multi-selection is unmistakable regardless of node colour. Active node is
  // bolder than the other selected ones (two-tier feedback).
  if (selectedIds.size) {
    const vp = viewport();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    for (const id of selectedIds) {
      const sn = s.byId.get(id);
      if (!sn) continue;
      const x = sn.x * vp.scale + vp.x - 3;
      const y = sn.y * vp.scale + vp.y - 3;
      const bw = sn.w * vp.scale + 6;
      const bh = sn.h * vp.scale + 6;
      const active = id === selectedId;
      ctx.fillStyle = active ? "rgba(31,111,235,0.22)" : "rgba(91,155,240,0.15)";
      ctx.strokeStyle = active ? "#1F6FEB" : "#5b9bf0";
      ctx.lineWidth = active ? 3 : 2;
      ctx.fillRect(x, y, bw, bh);
      ctx.strokeRect(x, y, bw, bh);
    }
    ctx.restore();
  }
  if (marquee) {
    const vp = viewport();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ax = marquee.x0 * vp.scale + vp.x;
    const ay = marquee.y0 * vp.scale + vp.y;
    const bx = marquee.x1 * vp.scale + vp.x;
    const by = marquee.y1 * vp.scale + vp.y;
    const rx = Math.min(ax, bx),
      ry = Math.min(ay, by),
      rw = Math.abs(bx - ax),
      rh = Math.abs(by - ay);
    ctx.save();
    ctx.fillStyle = "rgba(31,111,235,0.12)";
    ctx.strokeStyle = "#1F6FEB";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.restore();
  }
}

function fit(): void {
  const s = scene();
  if (!s) return;
  const { w, h } = viewSize();
  viewport().fit(sceneBounds(s), w, h);
  draw();
}

function centerOn(nodeId: string): void {
  const s = scene();
  const n = s?.byId.get(nodeId);
  if (!n) return;
  const vp = viewport();
  const { w, h } = viewSize();
  vp.scale = Math.max(vp.scale, 0.8);
  vp.x = w / 2 - (n.x + n.w / 2) * vp.scale;
  vp.y = h / 2 - (n.y + n.h / 2) * vp.scale;
  draw();
}

function select(nodeId: string | null): void {
  selectedId = nodeId;
  selectedIds = new Set(nodeId ? [nodeId] : []);
  refreshInspector();
  nodeList.setSelected(nodeId);
  draw();
  // mirror the selection to a connected peer (Blender), unless this
  // selection just arrived FROM the peer (avoid the echo loop)
  if (!applyingRemoteSelect) sync.sendSelect(nodeId, [...selectedIds]);
}

/** Shift/Cmd-click: toggle a node in the multi-selection (D3). */
function toggleSelect(nodeId: string): void {
  if (selectedIds.has(nodeId)) {
    selectedIds.delete(nodeId);
    if (selectedId === nodeId)
      selectedId = selectedIds.size ? [...selectedIds][selectedIds.size - 1] : null;
  } else {
    selectedIds.add(nodeId);
    selectedId = nodeId;
  }
  refreshInspector();
  nodeList.setSelected(selectedId);
  draw();
  if (!applyingRemoteSelect) sync.sendSelect(selectedId, [...selectedIds]);
}

/** Replace the selection with a set (marquee result). */
function selectMany(ids: string[]): void {
  selectedIds = new Set(ids);
  selectedId = ids.length ? ids[ids.length - 1] : null;
  refreshInspector();
  nodeList.setSelected(selectedId);
  draw();
  if (!applyingRemoteSelect) sync.sendSelect(selectedId, [...selectedIds]);
}

function refreshInspector(): void {
  if (!store) return;
  renderInspector(inspector, store, selectedId, {
    onJump: (id) => {
      select(id);
      centerOn(id);
    },
    onClose: () => select(null),
    onDeleteNode: (id) => {
      store!.deleteNode(id);
      select(null);
    },
    onDeleteEdge: (edge) => store!.deleteEdge(edge),
    onToggleFold: (gid) => store!.setFolded(gid, !store!.isFolded(gid)),
    onEnterGroup: enterGroup,
    onEpochAddProperty: addEpochParadataProperty,
  });
}

function updateLegend(): void {
  legend.innerHTML = "";
  const s = scene();
  if (!s || edgeFilter === "none") {
    legend.classList.add("hidden");
    return;
  }
  const types = new Set<string>();
  for (const e of s.edges)
    if (edgeVisible(e.edge.edge_type)) types.add(e.edge.edge_type ?? "edge");
  if (!types.size) {
    legend.classList.add("hidden");
    return;
  }
  for (const t of [...types].sort()) {
    const st = edgeStyle(t);
    const item = document.createElement("span");
    item.className = "legend-item";
    const sw = document.createElement("span");
    sw.className = "legend-swatch";
    sw.style.borderBottomColor = st.color;
    sw.style.borderBottomStyle = st.dash.length ? "dashed" : "solid";
    item.appendChild(sw);
    item.appendChild(document.createTextNode(st.label));
    legend.appendChild(item);
  }
  legend.classList.remove("hidden");
}

function updateToolbar(): void {
  btnUndo.disabled = !store?.canUndo;
  btnRedo.disabled = !store?.canRedo;
  dirtyDot.classList.toggle("hidden", !store?.dirty);
  updateWindowTitle();
}

// On desktop, reflect the open file + dirty state in the OS window title
// (e.g. "TempluMare.em.json ● — EMStudio"). No-op in a browser.
function updateWindowTitle(): void {
  if (!isTauri()) return;
  let title = "EMStudio";
  if (store) {
    const g = store.doc.graph;
    const name = currentFilePath
      ? baseName(currentFilePath)
      : String(g["name"] ?? g.graph_id ?? "untitled");
    title = `${name}${store.dirty ? " ●" : ""} — EMStudio`;
  }
  void setWindowTitle(title);
}

function updateBreadcrumb(): void {
  if (!inContext() || !store) {
    breadcrumb.classList.add("hidden");
    breadcrumb.innerHTML = "";
    return;
  }
  breadcrumb.innerHTML = "";
  const mk = (label: string, depth: number): void => {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", () => {
      contextStack = contextStack.slice(0, depth);
      rebuildContext();
    });
    breadcrumb.appendChild(b);
    if (depth < contextStack.length) {
      breadcrumb.appendChild(document.createTextNode(" ▸ "));
    }
  };
  mk("Canvas", 0);
  contextStack.forEach((gid, i) => {
    const g = store!.node(gid);
    mk(String(g?.name || gid), i + 1);
  });
  breadcrumb.classList.remove("hidden");
}

function enterGroup(groupId: string): void {
  contextStack.push(groupId);
  rebuildContext();
}

function rebuildContext(): void {
  if (!store) return;
  select(null);
  hoverId = null;
  if (inContext()) {
    contextScene = buildGroupScene(store.doc, contextStack[contextStack.length - 1]);
  } else {
    contextScene = null;
  }
  updateBreadcrumb();
  updateLegend();
  fit();
}

function updateInfo(): void {
  if (!store) return;
  const g = store.doc.graph;
  const lanes = scenes.matrix?.lanes.length ?? 0;
  const title =
    (g["name"] as string | undefined) ??
    (store.doc.header?.["name"] as string | undefined) ??
    g.graph_id ??
    "untitled";
  info.textContent =
    `${title} — ${g.nodes.length} nodes, ${g.edges.length} edges` +
    (lanes ? `, ${lanes} epochs` : "");
}

// The visible subgraph after folding + the "circles of detail" filter — one
// filtered view shared by both projections. Structural nodes/edges (containers,
// epoch, membership) are never filtered (see filters.ts).
function filteredView(): {
  nodes: EmDocument["graph"]["nodes"];
  edges: EmDocument["graph"]["edges"];
  badges: Map<string, number>;
} {
  const doc = store!.doc;
  const folded = new Set(doc.layout?.folded_groups ?? []);
  const foldedView = folded.size
    ? applyFolding(doc, buildMembership(doc), folded)
    : undefined;
  let vNodes = foldedView?.nodes ?? doc.graph.nodes;
  let vEdges = foldedView?.edges ?? doc.graph.edges;
  if (hiddenNodeTypes.size || hiddenEdgeTypes.size) {
    vNodes = vNodes.filter((n) => !hiddenNodeTypes.has(n.node_type));
    // drop group containers left with NO visible member (else hollow boxes);
    // keep genuinely-empty authored groups.
    const mm = buildMembership(doc);
    let vis = new Set(vNodes.map((n) => n.id));
    vNodes = vNodes.filter((n) => {
      if (!isGroupType(n.node_type)) return true;
      const kids = [...(mm.childrenOf.get(n.id) ?? [])];
      return kids.length === 0 || kids.some((c) => vis.has(c));
    });
    vis = new Set(vNodes.map((n) => n.id));
    vEdges = vEdges.filter(
      (e) =>
        !hiddenEdgeTypes.has(e.edge_type ?? "") &&
        vis.has(e.source) &&
        vis.has(e.target),
    );
  }
  return {
    nodes: vNodes,
    edges: vEdges,
    badges: foldedView?.badges ?? new Map<string, number>(),
  };
}

function buildScenes(): void {
  if (!store) return;
  const doc = store.doc;
  const fview = filteredView();
  scenes.matrix = buildMatrixScene(doc, fview, matrixViewLayout ?? undefined);
  scenes.graph = buildGraphScene(doc, fview, {
    algorithm: graphAlgorithm,
    overrides: graphOverrides,
  });
}

// Recompute the Matrix VIEW layout (em-core on the visible subgraph) so the
// Matrix recompacts under a filter; clears it when nothing is hidden. Async
// (WASM); rebuilds + redraws when done. Matrix-only.
// True when the Matrix filter is TIGHTER than its per-view default (the user
// actively hid a ring that's on by default) — only then do we recompact, so
// the default Matrix keeps the archival em-core layout and pays no WASM cost.
function matrixTighterThanDefault(): boolean {
  const def = defaultVisibleCircles("matrix");
  const cur = circleState.matrix;
  return [...def].some((k) => !cur.has(k));
}
async function refreshMatrixViewLayout(): Promise<void> {
  if (!store) return;
  const filtered = matrixTighterThanDefault();
  if (!filtered) {
    if (matrixViewLayout !== null) {
      matrixViewLayout = null;
      buildScenes();
      draw();
    }
    return;
  }
  const v = filteredView();
  const doc = store.doc;
  try {
    const { computeLayout } = await import("./emcore");
    const subGraph = {
      ...doc.graph,
      nodes: v.nodes,
      edges: v.edges,
    } as EmDocument["graph"];
    // seed with the archival layout (From-Sketch) so kept nodes barely move
    matrixViewLayout = await computeLayout(subGraph, doc.layout ?? undefined);
  } catch {
    matrixViewLayout = null; // fall back to archival on failure
  }
  buildScenes();
  draw();
}

function setView(v: ViewKind): void {
  const changed = view !== v;
  view = v;
  btnMatrix.classList.toggle("active", v === "matrix");
  btnGraph.classList.toggle("active", v === "graph");
  // Layout controls are per-view: Matrix uses the "Layout" button (em-core
  // swimlanes); Graph uses the algorithm dropdown (layered/radial/force). Show
  // only the relevant one so they don't look redundant.
  const graphLayoutSel = document.getElementById("graph-layout");
  if (graphLayoutSel) graphLayoutSel.style.display = v === "graph" ? "" : "none";
  btnLayout.style.display = v === "graph" ? "none" : "";
  // each view keeps its own "circles of detail" depth → re-derive the hidden
  // sets and rebuild when the active view changes.
  if (changed && store) {
    recomputeHiddenFromCircles();
    buildScenes();
    if (filterPanelOpen()) renderCirclesPanel();
    // entering Matrix under a filter → recompact via the em-core view layout
    if (v === "matrix") void refreshMatrixViewLayout();
    else matrixViewLayout = null;
  }
  if (contextStack.length) {
    contextStack = [];
    rebuildContext();
  }
  if (scenes[v] === null && v === "matrix") {
    info.textContent =
      "no layout section — run: emstudio layout file.em.json -o out.em.json";
  } else {
    updateInfo();
  }
  updateLegend();
  fit();
}

function loadDocument(
  d: EmDocument,
  sourceName: string,
  path: string | null = null,
): void {
  if (!d?.graph?.nodes) {
    info.textContent = `${sourceName}: not an .em.json document (missing graph.nodes)`;
    return;
  }
  currentFilePath = path; // desktop: enables in-place Save; null in browser
  store = new DocumentStore(d);
  store.onChange(() => {
    recomputeHiddenFromCircles(); // keep hidden sets in sync with new types
    buildScenes();
    if (filterPanelOpen()) renderCirclesPanel(); // refresh circle counts
    if (inContext()) {
      contextScene = buildGroupScene(
        store!.doc,
        contextStack[contextStack.length - 1],
      );
    }
    updateInfo();
    updateLegend();
    updateToolbar();
    refreshInspector();
    nodeList.refresh();
    draw();
  });
  // forward local graph mutations to a connected peer (op-log, ADR-002 §2).
  // Remote-applied ops don't re-emit (DocumentStore suppresses), so no echo.
  store.onOp((op) => sync.sendOp(op));
  contextStack = [];
  contextScene = null;
  hoverId = null;
  selectedId = null;
  recomputeHiddenFromCircles(); // derive hidden types for the current view
  graphOverrides.clear(); // graph-view drags don't carry across documents
  matrixViewLayout = null; // stale for the new document
  buildScenes();
  select(null);
  dropHint.classList.add("hidden");
  sidePanel.classList.remove("hidden");
  nodeList.refresh();
  updateToolbar();
  updateBreadcrumb();
  if (d.layout) {
    setView(scenes.matrix ? "matrix" : "graph");
  } else {
    // No layout section (e.g. a live snapshot from Blender, which exports
    // layout=None) → the Matrix view has no positions. Compute a fresh layout
    // via em-core so it renders, then show Matrix instead of falling to Graph.
    void runLayout(true)
      .then(() => {
        setView("matrix");
        fit();
      })
      .catch((e) => {
        info.textContent = `auto-layout failed: ${e instanceof Error ? e.message : e}`;
        setView(scenes.matrix ? "matrix" : "graph");
      });
  }
}

// Sidecar (sync) ↔ Standalone. Opening/importing a file replaces the live view,
// so if we are in Sidecar mode warn first and offer to ask the host to persist
// its em.json (the host owns the canonical data — ADR-002 §4).
function syncToolLabel(): string {
  const t = getSettings().sync.tool;
  return SYNC_TOOLS.find((x) => x.value === t)?.label ?? t;
}
function confirmLeaveSidecar(action: string): Promise<boolean> {
  if (!sync.connected) return Promise.resolve(true);
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal";
    const card = document.createElement("div");
    card.className = "modal-card";
    card.innerHTML =
      `<div class="modal-head"><span>Leave Sidecar mode?</span></div>` +
      `<div class="modal-body">` +
      `<p>EMStudio is in <b>Sidecar</b> (sync) mode with <b>${syncToolLabel()}</b>. ` +
      `${action} disconnects and switches to a <b>Standalone</b> document.</p>` +
      `<p class="settings-hint">The synced graph lives in the host, not here — ` +
      `disconnecting does not save it. You can ask the host to write its ` +
      `<code>.em.json</code> first.</p>` +
      `</div>` +
      `<div class="modal-foot">` +
      `<button data-a="cancel">Cancel</button>` +
      `<button data-a="leave">Disconnect &amp; continue</button>` +
      `<button data-a="save" class="primary">Ask host to save &amp; continue</button>` +
      `</div>`;
    modal.appendChild(card);
    const finish = (proceed: boolean, save: boolean): void => {
      modal.remove();
      document.removeEventListener("keydown", onKey, true);
      if (proceed) {
        if (save) {
          sync.sendRequestSave();
          toast("Asked the host (EMtools) to save its em.json");
        }
        sync.disconnect(); // → Standalone; the new document replaces the view
      }
      resolve(proceed);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        finish(false, false);
      }
    };
    (card.querySelector('[data-a="cancel"]') as HTMLButtonElement).onclick = () =>
      finish(false, false);
    (card.querySelector('[data-a="leave"]') as HTMLButtonElement).onclick = () =>
      finish(true, false);
    (card.querySelector('[data-a="save"]') as HTMLButtonElement).onclick = () =>
      finish(true, true);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) finish(false, false);
    });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(modal);
  });
}

async function loadFile(file: File): Promise<void> {
  if (!(await confirmLeaveSidecar("Opening a file"))) return;
  try {
    const t = await file.text();
    loadDocument(JSON.parse(t) as EmDocument, file.name);
  } catch (e) {
    info.textContent = `parse error: ${e}`;
  }
}

// Create a fresh, empty .em.json document. New nodes minted in the GUI get a
// UUID id (ADR-002 §6). An empty layout is included so the Matrix view renders
// (empty) without invoking em-core on nothing.
function newDocument(): void {
  const doc: EmDocument = {
    graph: {
      graph_id: crypto.randomUUID(),
      name: "untitled graph",
      nodes: [],
      edges: [],
    },
    layout: { canvas: { width: 1200, height: 800 }, swimlanes: [], positions: {} },
  };
  loadDocument(doc, "new graph");
  info.textContent = "new empty graph";
}

// Tear the document down to an empty canvas (used when Sync is turned off — the
// synced graph is the host's, so it should not linger locally).
function clearDocument(): void {
  store = null;
  currentFilePath = null;
  scenes.matrix = null;
  scenes.graph = null;
  contextStack = [];
  contextScene = null;
  hoverId = null;
  selectedId = null;
  selectedIds = new Set();
  marquee = null;
  dropHint.classList.remove("hidden");
  sidePanel.classList.add("hidden");
  info.textContent = "open or drop an .em.json file";
  updateToolbar();
  updateBreadcrumb();
  updateLegend();
  nodeList.refresh();
  draw();
}

function defaultFileName(): string {
  const g = store!.doc.graph;
  const name = (g["name"] as string | undefined) ?? g.graph_id ?? "graph";
  return `${String(name).replace(/[^\w.-]+/g, "_")}.em.json`;
}

// Save: on desktop overwrite the open file in place (Save As if none yet);
// in a browser, download a fresh .em.json (no filesystem access).
async function saveDocument(): Promise<void> {
  if (!store) return;
  if (isTauri()) {
    if (!currentFilePath) return saveAsDocument();
    try {
      await writeEmJson(currentFilePath, store.toJSON());
      store.dirty = false;
      info.textContent = `saved ${baseName(currentFilePath)}`;
      updateToolbar();
    } catch (e) {
      toast(`save failed: ${e instanceof Error ? e.message : e}`);
    }
    return;
  }
  browserDownload(store.toJSON(), defaultFileName());
  store.dirty = false;
  updateToolbar();
}

// Save As: on desktop prompt for a path and remember it; in a browser this
// is the same as Save (a download with a fresh name).
async function saveAsDocument(): Promise<void> {
  if (!store) return;
  if (isTauri()) {
    try {
      const path = await saveAsEmJson(store.toJSON(), defaultFileName());
      if (!path) return; // user cancelled
      currentFilePath = path;
      store.dirty = false;
      info.textContent = `saved ${baseName(path)}`;
      updateToolbar();
    } catch (e) {
      toast(`save failed: ${e instanceof Error ? e.message : e}`);
    }
    return;
  }
  browserDownload(store.toJSON(), defaultFileName());
  store.dirty = false;
  updateToolbar();
}

function browserDownload(text: string, filename: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Open: native dialog on desktop, <input type=file> in a browser.
async function openDocument(): Promise<void> {
  if (isTauri()) {
    try {
      const res = await openEmJson();
      if (!res) return; // cancelled
      if (!(await confirmLeaveSidecar("Opening a file"))) return;
      loadDocument(
        JSON.parse(res.text) as EmDocument,
        baseName(res.path),
        res.path,
      );
    } catch (e) {
      info.textContent = `open failed: ${e instanceof Error ? e.message : e}`;
    }
    return;
  }
  fileInput.click();
}

// ---------- placing (palette) ----------
const paletteUi = buildPalette(document.getElementById("palette")!, (t) => {
  if (!store) {
    toast("Open a document first");
    return;
  }
  placingType = placingType === t ? null : t;
  paletteUi.setActive(placingType);
  canvas.classList.toggle("placing", !!placingType);
  if (placingType) {
    hintBar.textContent = `Click the canvas to place a ${placingType} — Esc to cancel`;
    hintBar.classList.remove("hidden");
  } else {
    hintBar.classList.add("hidden");
  }
});

function cancelPlacing(): void {
  placingType = null;
  paletteUi.setActive(null);
  canvas.classList.remove("placing");
  hintBar.classList.add("hidden");
}

// ---------- accessory views ----------
const nodeList = buildNodeList(
  nodelistEl,
  () => store?.doc ?? null,
  (id) => {
    if (inContext()) {
      contextStack = [];
      rebuildContext();
    }
    select(id);
    centerOn(id);
  },
  {
    isFolded: (id) => store?.isFolded(id) ?? false,
    onToggleFold: (id) => store?.setFolded(id, !store.isFolded(id)),
    onExplode: (id) => {
      contextStack = [];
      enterGroup(id);
    },
    onFoldGroups: (ids, folded) => store?.setFoldedMany(ids, folded),
    isContainer: (id) => {
      if (!store) return false;
      const mm = buildMembership(store.doc);
      return (mm.membersOf.get(id)?.filter((m) => m !== id).length ?? 0) > 0;
    },
  },
);

const overview = buildOverview(
  document.getElementById("overview") as HTMLCanvasElement,
  (wx, wy) => {
    const vp = viewport();
    const { w, h } = viewSize();
    vp.x = w / 2 - wx * vp.scale;
    vp.y = h / 2 - wy * vp.scale;
    draw();
  },
);

function placeNode(wx: number, wy: number): void {
  if (!store || !placingType) return;
  // Epochs are special: an EpochNode + a swimlane (Matrix lane / Graph node,
  // invariant 4). Lets you populate epochs in a fresh graph.
  if (placingType === "EpochNode") {
    const w = 140,
      h = 30;
    const ep = store.addEpoch(undefined, { x: wx - w / 2, y: wy - h / 2, w, h });
    select(ep.id);
    cancelPlacing();
    toast(`epoch ${ep.name} created`);
    return;
  }
  // id = UUID (identity, collision-free across tools); name = human label
  const id = store.newId();
  const name = store.freshLabel(placingType);
  const w = isGroupType(placingType) ? 120 : 90;
  const h = 30;
  const node = { id, name, node_type: placingType, description: "" };
  if (inContext()) {
    const gid = contextStack[contextStack.length - 1];
    store.addNode(node);
    store.moveInGroupSpace(gid, id, { x: wx - w / 2, y: wy - h / 2, w, h }, false);
    // membership edge into the group we are inside
    const g = store.node(gid);
    const types = allowedEdgeTypes(placingType, g?.node_type);
    const membership = types.find((t) => t.startsWith("is_in_"));
    if (membership) store.addEdge(id, gid, membership);
  } else {
    store.addNode(node, { x: wx - w / 2, y: wy - h / 2, w, h });
    // matrix view: assign the epoch of the lane the node was dropped in
    if (view === "matrix" && isStratigraphicType(placingType)) {
      const lane = scenes.matrix?.lanes.find(
        (l) => wy >= l.y && wy <= l.y + l.height,
      );
      if (lane) store.addEdge(id, lane.id, "has_first_epoch");
    }
  }
  ensureCircleVisibleFor(placingType); // reveal its ring if the filter hid it
  select(id);
  if (vocabularyFor(placingType)) openQualiaPicker(id, wx, wy); // pick its label
  cancelPlacing();
  toast(`${id} created`);
}

// After a node/group DRAG ends (D2 inverse): landing inside a group box adds/
// re-parents membership — the innermost (smallest) box of a matryoshka wins;
// landing in a different epoch lane re-assigns has_first_epoch (a group carries
// its epoch-placed members along).
function handleDrop(nodeId: string, wx: number, wy: number): void {
  if (!store || view !== "matrix" || inContext()) return;
  const st = store; // non-null capture (narrowing is lost inside callbacks)
  const s = scene();
  if (!s) return;
  // act on the WHOLE selection when the dragged node is part of a multi-selection
  const ids =
    selectedIds.has(nodeId) && selectedIds.size > 1 ? [...selectedIds] : [nodeId];
  const mm = buildMembership(store.doc);

  // forbid dropping a group into itself or its own descendants
  const forbidden = new Set<string>(ids);
  for (const id of ids) {
    const stk = [id];
    while (stk.length) {
      const g = stk.pop()!;
      for (const c of mm.childrenOf.get(g) ?? []) {
        if (!forbidden.has(c)) {
          forbidden.add(c);
          stk.push(c);
        }
      }
    }
  }

  // 1) innermost group box (smallest area) at the drop point → move the whole
  //    selection into it (each node only if the datamodel allows a membership)
  const boxes = (s.groups ?? []).filter(
    (g) =>
      !forbidden.has(g.id) &&
      !g.folded &&
      wx >= g.x &&
      wx <= g.x + g.w &&
      wy >= g.y &&
      wy <= g.y + g.h,
  );
  boxes.sort((a, b) => a.w * a.h - b.w * b.h);
  const target = boxes[0];
  if (target) {
    const groupNode = store.node(target.id);
    let moved = 0;
    for (const id of ids) {
      if (id === target.id) continue;
      const primary = mm.primaryOf.get(id) ?? null;
      if (primary === target.id) continue; // already primarily in it
      const edgeType = allowedEdgeTypes(
        store.node(id)?.node_type,
        groupNode?.node_type,
      ).find((t) => MEMBERSHIP_EDGES.has(t));
      if (edgeType) {
        store.moveToGroup(id, target.id, edgeType, primary);
        moved++;
      }
    }
    if (moved) {
      toast(`moved ${moved} into ${groupNode?.name ?? "group"}`);
      return;
    }
  }

  // 2) not into a group → re-assign the epoch of the lane at the drop point.
  //    A dragged group carries its epoch-placed members along.
  const lane = s.lanes.find((l) => wy >= l.y && wy <= l.y + l.height);
  if (!lane) return;
  const candidates = new Set<string>(ids);
  for (const id of ids) {
    if (isGroupType(store.node(id)?.node_type)) {
      const stk = [id];
      while (stk.length) {
        const g = stk.pop()!;
        for (const c of mm.childrenOf.get(g) ?? []) {
          if (!candidates.has(c)) {
            candidates.add(c);
            stk.push(c);
          }
        }
      }
    }
  }
  const placed = new Set(
    store.doc.graph.edges
      .filter((e) => e.edge_type === "has_first_epoch")
      .map((e) => e.source),
  );
  let targets = [...candidates].filter((id) => placed.has(id));
  if (!targets.length)
    targets = ids.filter((id) =>
      isStratigraphicType(st.node(id)?.node_type),
    );
  if (!targets.length) return;
  st.setFirstEpoch(targets, lane.id);
  toast(`moved ${targets.length} to epoch ${lane.label}`);
}

// ---------- connect (edge drawing with live socket validation) ----------
function beginConnect(fromId: string): void {
  connect = { fromId, x: 0, y: 0, targetId: null, validity: null };
  canvas.classList.add("connecting");
}

function updateConnect(wx: number, wy: number): void {
  if (!connect || !store) return;
  connect.x = wx;
  connect.y = wy;
  const s = scene();
  const hit = s ? hitTest(s, wx, wy) : null;
  if (hit && hit.id !== connect.fromId) {
    connect.targetId = hit.id;
    connect.validity = connectValidity(
      store.node(connect.fromId)?.node_type,
      hit.node.node_type,
    );
  } else {
    connect.targetId = null;
    connect.validity = null;
  }
  draw();
}

function finishConnect(forceCreate = false): void {
  if (!connect || !store) return;
  const { fromId, targetId, validity, x, y } = connect;
  connect = null;
  canvas.classList.remove("connecting");
  draw();
  // Dropped in the void → offer to CREATE a target node. Hold Shift/Alt to
  // FORCE this even when the drop lands on a node or (often) inside a
  // container box that hitTest would otherwise treat as the target — handy
  // when containers cover all the empty space (e.g. a node inside a PD group).
  if (forceCreate || !targetId) {
    showCreateNodeMenu(fromId, x, y);
    return;
  }
  if (!validity) return;
  const src = store.node(fromId)?.node_type;
  const tgt = store.node(targetId)?.node_type;
  if (validity === "invalid") {
    toast(`No EM connection allows ${src} → ${tgt}`);
    return;
  }
  const types =
    validity === "valid" ? allowedEdgeTypes(src, tgt) : [GENERIC_EDGE];
  if (types.length === 1) {
    createEdge(fromId, targetId, types[0]);
  } else {
    showEdgeMenu(fromId, targetId, types);
  }
}

function createEdge(source: string, target: string, edgeType: string): void {
  if (!store) return;
  if (store.hasEdge(source, target, edgeType)) {
    toast(`${edgeTypeLabel(edgeType)} already exists`);
    return;
  }
  store.addEdge(source, target, edgeType);
  toast(
    `${store.node(source)?.name || source} — ${edgeTypeLabel(edgeType)} → ${store.node(target)?.name || target}`,
  );
}

function showEdgeMenu(
  source: string,
  target: string,
  types: string[],
): void {
  edgeMenu.innerHTML = "";
  const title = document.createElement("div");
  title.className = "edge-menu-title";
  title.textContent = `${store?.node(source)?.name || source} → ${store?.node(target)?.name || target}`;
  edgeMenu.appendChild(title);
  for (const t of types) {
    const b = document.createElement("button");
    const sw = document.createElement("span");
    sw.className = "legend-swatch";
    const st = edgeStyle(t);
    sw.style.borderBottomColor = st.color;
    sw.style.borderBottomStyle = st.dash.length ? "dashed" : "solid";
    b.appendChild(sw);
    b.appendChild(document.createTextNode(" " + edgeTypeLabel(t)));
    b.addEventListener("click", () => {
      hideEdgeMenu();
      createEdge(source, target, t);
    });
    edgeMenu.appendChild(b);
  }
  const cancel = document.createElement("button");
  cancel.className = "edge-menu-cancel";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", hideEdgeMenu);
  edgeMenu.appendChild(cancel);
  const s = scene()!;
  const t = s.byId.get(target)!;
  const vp = viewport();
  edgeMenu.style.left =
    Math.min((t.x + t.w) * vp.scale + vp.x + 10, wrap.clientWidth - 240) + "px";
  edgeMenu.style.top =
    Math.min(t.y * vp.scale + vp.y, wrap.clientHeight - 40 * (types.length + 2)) +
    "px";
  edgeMenu.classList.remove("hidden");
}

function hideEdgeMenu(): void {
  edgeMenu.classList.add("hidden");
  edgeMenu.innerHTML = "";
}

// ---------- create a node at a point (shared by placeNode & connect-create) ----------
function createNodeAt(type: string, wx: number, wy: number): string | null {
  if (!store) return null;
  if (type === "EpochNode") {
    const w = 140,
      h = 30;
    return store.addEpoch(undefined, { x: wx - w / 2, y: wy - h / 2, w, h }).id;
  }
  const id = store.newId();
  const name = store.freshLabel(type);
  const w = isGroupType(type) ? 120 : 90;
  const h = 30;
  const node = { id, name, node_type: type, description: "" };
  if (inContext()) {
    const gid = contextStack[contextStack.length - 1];
    store.addNode(node);
    store.moveInGroupSpace(gid, id, { x: wx - w / 2, y: wy - h / 2, w, h }, false);
    const membership = allowedEdgeTypes(type, store.node(gid)?.node_type).find(
      (t) => t.startsWith("is_in_"),
    );
    if (membership) store.addEdge(id, gid, membership);
  } else {
    store.addNode(node, { x: wx - w / 2, y: wy - h / 2, w, h });
    if (view === "matrix" && isStratigraphicType(type)) {
      const lane = scenes.matrix?.lanes.find(
        (l) => wy >= l.y && wy <= l.y + l.height,
      );
      if (lane) store.addEdge(id, lane.id, "has_first_epoch");
    }
  }
  return id;
}

// ---------- connect-drag dropped in the void → create a target node ----------
// Menu is datamodel-driven: only node types the EM rules allow as the target
// of an edge from the source, grouped by the palette taxonomy, with search.
let createMenuEl: HTMLDivElement | null = null;
function hideCreateMenu(): void {
  if (createMenuEl) {
    createMenuEl.remove();
    createMenuEl = null;
    document.removeEventListener("pointerdown", onCreateMenuOutside, true);
    document.removeEventListener("keydown", onCreateMenuKey, true);
  }
}
function onCreateMenuOutside(e: PointerEvent): void {
  if (createMenuEl && !createMenuEl.contains(e.target as Node)) hideCreateMenu();
}
function onCreateMenuKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.stopPropagation();
    hideCreateMenu();
  }
}
function onPickCreate(
  fromId: string,
  type: string,
  wx: number,
  wy: number,
): void {
  if (!store) return;
  hideCreateMenu();
  const srcType = store.node(fromId)?.node_type;
  const newId = createNodeAt(type, wx, wy);
  if (!newId) return;
  const eTypes = allowedEdgeTypes(srcType, type);
  if (eTypes.length > 1) showEdgeMenu(fromId, newId, eTypes);
  else createEdge(fromId, newId, eTypes[0] ?? GENERIC_EDGE);
  ensureCircleVisibleFor(type); // reveal its ring if the filter hid it
  select(newId);
  if (vocabularyFor(type)) openQualiaPicker(newId, wx, wy); // pick its label
}
function showCreateNodeMenu(fromId: string, wx: number, wy: number): void {
  if (!store) return;
  const srcType = store.node(fromId)?.node_type;
  // group the datamodel-allowed target types by the palette taxonomy
  const groups: { label: string; types: string[] }[] = [];
  for (const sec of SECTIONS) {
    const allowed = sec.types.filter(
      (t) => connectValidity(srcType, t) === "valid",
    );
    if (allowed.length) groups.push({ label: sec.label, types: allowed });
  }
  hideCreateMenu();
  const menu = document.createElement("div");
  menu.className = "connect-menu";
  const title = document.createElement("div");
  title.className = "cm-title";
  title.textContent = `New node from ${store.node(fromId)?.name || srcType}`;
  menu.appendChild(title);
  if (!groups.length) {
    const empty = document.createElement("div");
    empty.className = "cm-empty";
    empty.textContent = "No node type is a valid edge target from here.";
    menu.appendChild(empty);
  } else {
    const search = document.createElement("input");
    search.className = "cm-search";
    search.type = "search";
    search.placeholder = "Search node types…";
    menu.appendChild(search);
    const list = document.createElement("div");
    list.className = "cm-list";
    menu.appendChild(list);
    const renderList = (q: string): void => {
      list.innerHTML = "";
      const ql = q.trim().toLowerCase();
      for (const g of groups) {
        const hits = g.types.filter(
          (t) =>
            !ql ||
            t.toLowerCase().includes(ql) ||
            (typeDescription(t) || "").toLowerCase().includes(ql),
        );
        if (!hits.length) continue;
        const h = document.createElement("div");
        h.className = "cm-sect";
        h.textContent = g.label;
        list.appendChild(h);
        for (const t of hits) {
          const b = document.createElement("button");
          b.className = "cm-item";
          b.textContent = t;
          b.title = typeDescription(t) || t;
          b.addEventListener("click", () => onPickCreate(fromId, t, wx, wy));
          list.appendChild(b);
        }
      }
    };
    search.addEventListener("input", () => renderList(search.value));
    renderList("");
    setTimeout(() => search.focus(), 0);
  }
  const vp = viewport();
  const sx = Math.min(wx * vp.scale + vp.x, wrap.clientWidth - 244);
  const sy = Math.min(wy * vp.scale + vp.y, wrap.clientHeight - 280);
  menu.style.left = Math.max(4, sx) + "px";
  menu.style.top = Math.max(4, sy) + "px";
  wrap.appendChild(menu);
  createMenuEl = menu;
  document.addEventListener("pointerdown", onCreateMenuOutside, true);
  document.addEventListener("keydown", onCreateMenuKey, true);
}

// ---------- controlled-vocabulary picker (PropertyNode → qualia label) ----------
let vocabMenuEl: HTMLDivElement | null = null;
function hideVocabMenu(): void {
  if (vocabMenuEl) {
    vocabMenuEl.remove();
    vocabMenuEl = null;
    document.removeEventListener("pointerdown", onVocabOutside, true);
    document.removeEventListener("keydown", onVocabKey, true);
  }
}
function onVocabOutside(e: PointerEvent): void {
  if (vocabMenuEl && !vocabMenuEl.contains(e.target as Node)) hideVocabMenu();
}
function onVocabKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.stopPropagation();
    hideVocabMenu();
  }
}
// Open the qualia catalogue on a just-created (or selected) PropertyNode so its
// label is picked from the controlled vocabulary; each term shows its
// rationale + example. Cancelling leaves the default label.
function openQualiaPicker(nodeId: string, wx: number, wy: number): void {
  if (!store) return;
  const vocab = vocabularyFor(store.node(nodeId)?.node_type);
  if (!vocab) return;
  hideVocabMenu();
  const menu = document.createElement("div");
  menu.className = "connect-menu vocab-menu";
  const title = document.createElement("div");
  title.className = "cm-title";
  title.textContent = "Property — pick a vocabulary term";
  menu.appendChild(title);
  const search = document.createElement("input");
  search.className = "cm-search";
  search.type = "search";
  search.placeholder = "Search qualia…";
  menu.appendChild(search);
  const listEl = document.createElement("div");
  listEl.className = "cm-list";
  menu.appendChild(listEl);
  const detail = document.createElement("div");
  detail.className = "vocab-detail";
  menu.appendChild(detail);
  const showDetail = (q: Qualia): void => {
    const bits: string[] = [];
    if (q.rationale) bits.push(`<b>Why</b> ${q.rationale}`);
    if (q.example) bits.push(`<b>e.g.</b> ${q.example}`);
    if (!bits.length && q.description) bits.push(q.description);
    detail.innerHTML =
      bits.join("<br>") || "<i>no rationale in the vocabulary yet</i>";
  };
  const pick = (q: Qualia): void => {
    hideVocabMenu();
    const prev = (store!.node(nodeId)?.data ?? {}) as Record<string, unknown>;
    store!.updateNode(nodeId, {
      name: q.name,
      data: {
        ...prev,
        property_type: q.id,
        ...(q.dataType ? { data_type: q.dataType } : {}),
      },
    });
    select(nodeId);
    toast(`property → ${q.name}`);
  };
  const render = (query: string): void => {
    listEl.innerHTML = "";
    const ql = query.trim().toLowerCase();
    const match = (q: Qualia): boolean =>
      !ql ||
      [q.name, q.id, q.description, q.rationale, q.categoryLabel, q.subcategoryLabel].some(
        (s) => (s ?? "").toLowerCase().includes(ql),
      );
    let lastCat = "",
      lastSub = "";
    let first: Qualia | null = null;
    for (const q of vocab) {
      if (!match(q)) continue;
      if (!first) first = q;
      if (q.category !== lastCat) {
        lastCat = q.category;
        lastSub = "";
        const h = document.createElement("div");
        h.className = "cm-sect";
        h.textContent = q.categoryLabel;
        listEl.appendChild(h);
      }
      if (q.subcategory !== lastSub) {
        lastSub = q.subcategory;
        const sh = document.createElement("div");
        sh.className = "cm-subsect";
        sh.textContent = q.subcategoryLabel;
        listEl.appendChild(sh);
      }
      const b = document.createElement("button");
      b.className = "cm-item";
      b.textContent = q.name;
      b.title = q.rationale || q.description || q.name;
      b.addEventListener("mouseenter", () => showDetail(q));
      b.addEventListener("focus", () => showDetail(q));
      b.addEventListener("click", () => pick(q));
      listEl.appendChild(b);
    }
    if (first) showDetail(first);
    else detail.textContent = "no match";
  };
  search.addEventListener("input", () => render(search.value));
  render("");
  const vp = viewport();
  const sx = Math.min(wx * vp.scale + vp.x, wrap.clientWidth - 264);
  const sy = Math.min(wy * vp.scale + vp.y, wrap.clientHeight - 340);
  menu.style.left = Math.max(4, sx) + "px";
  menu.style.top = Math.max(4, sy) + "px";
  wrap.appendChild(menu);
  vocabMenuEl = menu;
  setTimeout(() => search.focus(), 0);
  document.addEventListener("pointerdown", onVocabOutside, true);
  document.addEventListener("keydown", onVocabKey, true);
}

// Add a temporal PropertyNode to an epoch's ParadataNodeGroup, creating the
// group + has_paradata_nodegroup edge on first use (datamodel 1.6.1 lets an
// EpochNode own a paradata group), then open the qualia picker to label it
// (start/end…). Realises the epoch-paradata paradigm.
function addEpochParadataProperty(epochId: string): void {
  if (!store) return;
  const st = store;
  const vc = viewport().toWorld(wrap.clientWidth / 2, wrap.clientHeight / 2);
  let pdgId: string | null = null;
  for (const e of st.doc.graph.edges)
    if (e.source === epochId && e.edge_type === "has_paradata_nodegroup") {
      pdgId = e.target;
      break;
    }
  if (!pdgId) {
    pdgId = st.newId();
    st.addNode(
      {
        id: pdgId,
        name: `${st.node(epochId)?.name ?? "Epoch"} · paradata`,
        node_type: "ParadataNodeGroup",
        description: "",
      },
      { x: vc.x - 90, y: vc.y - 50, w: 180, h: 100 },
    );
    st.addEdge(epochId, pdgId, "has_paradata_nodegroup");
  }
  const propId = st.newId();
  st.addNode(
    {
      id: propId,
      name: st.freshLabel("property"),
      node_type: "property",
      description: "",
    },
    { x: vc.x, y: vc.y, w: 90, h: 30 },
  );
  st.addEdge(propId, pdgId, "is_in_paradata_nodegroup");
  ensureCircleVisibleFor("property");
  select(propId);
  openQualiaPicker(propId, vc.x, vc.y);
}

// ---------- toolbar wiring ----------
// header dropdown menus (File / Export): toggle on click, close on outside
// click, close after picking an item (the item's own handler still fires).
function closeAllDropdowns(): void {
  document.querySelectorAll(".dd-menu").forEach((m) => m.classList.add("hidden"));
}
document.querySelectorAll<HTMLElement>(".dropdown").forEach((dd) => {
  const toggle = dd.querySelector<HTMLButtonElement>(".dd-toggle")!;
  const menu = dd.querySelector<HTMLElement>(".dd-menu")!;
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = menu.classList.contains("hidden");
    closeAllDropdowns();
    if (willOpen) menu.classList.remove("hidden");
  });
  menu.addEventListener("click", () => menu.classList.add("hidden"));
});
document.addEventListener("click", closeAllDropdowns);

const fileInput = document.getElementById("file-input") as HTMLInputElement;
document
  .getElementById("btn-new")!
  .addEventListener("click", () => newDocument());
document
  .getElementById("btn-open")!
  .addEventListener("click", () => void openDocument());
fileInput.addEventListener("change", () => {
  if (fileInput.files?.[0]) loadFile(fileInput.files[0]);
  fileInput.value = "";
});
document
  .getElementById("btn-save")!
  .addEventListener("click", () => void saveDocument());
document
  .getElementById("btn-save-as")!
  .addEventListener("click", () => void saveAsDocument());
document.getElementById("btn-svg")!.addEventListener("click", () => {
  const s = scene();
  if (!s || !store) return;
  const g = store.doc.graph;
  const title = String(g["name"] ?? g.graph_id ?? "graph");
  const svg = sceneToSvg(s, edgeVisible, title);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${title.replace(/[^\w.-]+/g, "_")}_${inContext() ? "group" : view}.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// Export as yEd GraphML via the local dev bridge (tools/em_bridge.py). The
// frontend cannot run s3Dgraphy (ADR-001 invariant 2), so we POST the current
// .em.json to the bridge and download the GraphML it returns. Bridge URL is
// overridable with ?bridge= or window.EM_BRIDGE (default localhost:8765).
const BRIDGE_URL =
  new URLSearchParams(location.search).get("bridge") ??
  (window as unknown as { EM_BRIDGE?: string }).EM_BRIDGE ??
  "http://localhost:8765";
document.getElementById("btn-graphml")!.addEventListener("click", async () => {
  if (!store) {
    toast("Open a document first");
    return;
  }
  const g = store.doc.graph;
  const name = String(g["name"] ?? g.graph_id ?? "graph");
  toast("Exporting GraphML…");
  try {
    const res = await fetch(`${BRIDGE_URL}/graphml`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: store.toJSON(),
    });
    if (!res.ok) {
      let msg = `bridge error ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* non-JSON error body */
      }
      toast(`GraphML export failed: ${msg}`);
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/[^\w.-]+/g, "_")}.graphml`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("GraphML exported");
  } catch {
    toast(
      "GraphML bridge not reachable — start it with ./dev.sh (or python3 tools/em_bridge.py)",
    );
  }
});

// Import a yEd GraphML file → em.json via the dev bridge (s3Dgraphy importer),
// then load it. Same bridge/constraint as export (invariant 2).
document
  .getElementById("btn-import-graphml")!
  .addEventListener("click", () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".graphml,.xml";
    inp.addEventListener("change", async () => {
      const file = inp.files?.[0];
      if (!file) return;
      if (!(await confirmLeaveSidecar("Importing GraphML"))) return;
      toast("Importing GraphML…");
      try {
        const text = await file.text();
        const res = await fetch(`${BRIDGE_URL}/import-graphml`, {
          method: "POST",
          headers: { "Content-Type": "application/xml" },
          body: text,
        });
        if (!res.ok) {
          let msg = `bridge error ${res.status}`;
          try {
            const j = await res.json();
            if (j?.error) msg = j.error;
          } catch {
            /* non-JSON error body */
          }
          toast(`GraphML import failed: ${msg}`);
          return;
        }
        const doc = (await res.json()) as EmDocument;
        loadDocument(doc, file.name); // no layout → auto fresh-layout on load
        toast(`Imported ${file.name}`);
      } catch {
        toast(
          "GraphML bridge not reachable — start it with ./dev.sh (or python3 tools/em_bridge.py)",
        );
      }
    });
    inp.click();
  });

// Sync toggle: connect/disconnect the live selection bridge (ADR-002).
const btnSync = document.getElementById("btn-sync") as HTMLButtonElement;
btnSync.addEventListener("click", () => {
  if (sync.connected) {
    sync.disconnect();
    clearDocument(); // the synced graph is the host's — don't leave it lingering
    return;
  }
  const syncUrl = getSyncUrl();
  sync.connect(syncUrl, {
    onSelect: (id, ids) => {
      // selection arrived from the peer → reflect it without echoing back
      applyingRemoteSelect = true;
      if (ids && ids.length > 1) {
        // multi-selection: keep the peer's active node as the primary (last)
        const others = ids.filter((x) => x !== id);
        selectMany(id ? [...others, id] : others);
      } else {
        select(id || null);
      }
      if (id) centerOn(id);
      applyingRemoteSelect = false;
    },
    onOp: (op) => {
      // a graph mutation arrived from the peer/host → apply to our replica
      // (DocumentStore.applyRemoteOp suppresses re-emission, no echo)
      store?.applyRemoteOp(op);
    },
    onSnapshot: (doc) => {
      // the host sent its full graph on connect → become a live view of it
      // (ADR-002: "sync mode = see the host's data"). Replaces the document.
      loadDocument(doc, "Blender (sync)");
      info.textContent = "sync: loaded Blender's graph";
    },
    onStatus: (state) => {
      btnSync.classList.toggle("active", state === "open");
      // clear, high-visibility signal that we are in live-sync mode
      document.body.classList.toggle("sync-active", state === "open");
      btnSync.textContent = state === "open" ? "Sync ●" : "Sync";
      if (state === "open") info.textContent = `sync: connected to ${syncUrl}`;
      else if (state === "closed")
        info.textContent = "sync: disconnected (is Blender's server running?)";
    },
  });
});

// ---------- Settings modal (sync target, …) ----------
const settingsModal = document.getElementById("settings-modal")!;
const setToolSel = document.getElementById("set-sync-tool") as HTMLSelectElement;
const setProtoSel = document.getElementById(
  "set-sync-protocol",
) as HTMLSelectElement;
const setHostInp = document.getElementById("set-sync-host") as HTMLInputElement;
const setPortInp = document.getElementById("set-sync-port") as HTMLInputElement;
const setUrlOut = document.getElementById("set-sync-url")!;
const setDevUuid = document.getElementById("set-dev-uuid") as HTMLInputElement;

for (const t of SYNC_TOOLS) {
  const o = document.createElement("option");
  o.value = t.value;
  o.textContent = t.label;
  o.disabled = !t.enabled;
  setToolSel.appendChild(o);
}

function refreshSyncUrlPreview(): void {
  const proto = setProtoSel.value;
  const host = setHostInp.value.trim() || "localhost";
  const port = setPortInp.value.trim() || "8788";
  setUrlOut.textContent = `${proto}://${host}:${port}`;
}
function openSettings(): void {
  const s = getSettings();
  setToolSel.value = s.sync.tool;
  setProtoSel.value = s.sync.protocol;
  setHostInp.value = s.sync.host;
  setPortInp.value = String(s.sync.port);
  setDevUuid.checked = s.developer.showNodeIds;
  refreshSyncUrlPreview();
  settingsModal.classList.remove("hidden");
}
function closeSettings(): void {
  settingsModal.classList.add("hidden");
}
for (const el of [setProtoSel, setHostInp, setPortInp])
  el.addEventListener("input", refreshSyncUrlPreview);
(document.getElementById("btn-settings") as HTMLButtonElement).addEventListener(
  "click",
  openSettings,
);
(document.getElementById("settings-close") as HTMLButtonElement).addEventListener(
  "click",
  closeSettings,
);
(
  document.getElementById("settings-cancel") as HTMLButtonElement
).addEventListener("click", closeSettings);
settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) closeSettings(); // click on the backdrop
});
(
  document.getElementById("settings-save") as HTMLButtonElement
).addEventListener("click", () => {
  const port = Math.min(
    65535,
    Math.max(1, parseInt(setPortInp.value, 10) || 8788),
  );
  const next: Settings = {
    sync: {
      tool: setToolSel.value,
      protocol: setProtoSel.value === "wss" ? "wss" : "ws",
      host: setHostInp.value.trim() || "localhost",
      port,
    },
    developer: { showNodeIds: setDevUuid.checked },
  };
  saveSettings(next);
  closeSettings();
  refreshInspector(); // reflect the UUID-visibility toggle immediately
  toast(
    sync.connected
      ? "Sync settings saved — reconnect to apply"
      : `Sync target: ${getSyncUrl()}`,
  );
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !settingsModal.classList.contains("hidden")) {
    e.stopPropagation();
    closeSettings();
  }
});

// "Circles of detail" panel — progressive disclosure, per view. Each ring
// bundles node/edge types (filters.ts); toggling a ring re-derives the hidden
// sets and rebuilds. Applies to BOTH views (matrix hides paradata by default;
// each view keeps its own visible-ring set in circleState).
const filterPanel = document.getElementById("filter-panel")!;
function filterPanelOpen(): boolean {
  return !filterPanel.classList.contains("hidden");
}
function renderCirclesPanel(): void {
  filterPanel.innerHTML = "";
  if (!store) return;
  // per-circle present counts, for the current document
  const nodeCount = new Map<CircleKey, number>();
  for (const n of store.doc.graph.nodes) {
    const c = nodeCircle(n.node_type);
    if (c) nodeCount.set(c, (nodeCount.get(c) ?? 0) + 1);
  }
  const edgeCount = new Map<CircleKey, number>();
  for (const e of store.doc.graph.edges) {
    const c = edgeCircle(e.edge_type ?? "");
    if (c) edgeCount.set(c, (edgeCount.get(c) ?? 0) + 1);
  }
  const visible = circleState[view];

  const hint = document.createElement("div");
  hint.className = "fp-hint";
  hint.textContent = `Detail level — ${view === "matrix" ? "Matrix" : "Graph"} view`;
  filterPanel.appendChild(hint);

  const addSection = (title: string, kind: "node" | "edge"): void => {
    const h = document.createElement("div");
    h.className = "fp-sect";
    h.textContent = title;
    filterPanel.appendChild(h);
    for (const circle of CIRCLES.filter((c) => c.kind === kind)) {
      const count =
        (kind === "node" ? nodeCount : edgeCount).get(circle.key) ?? 0;
      const row = document.createElement("label");
      row.className = "fp-row";
      if (!count) row.style.opacity = "0.45";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = visible.has(circle.key);
      cb.addEventListener("change", () => {
        if (cb.checked) visible.add(circle.key);
        else visible.delete(circle.key);
        recomputeHiddenFromCircles();
        buildScenes();
        updateLegend();
        draw();
        // Matrix recompacts on the filtered subgraph (em-core view layout);
        // in Graph the layout already reflows, so just invalidate for later.
        if (view === "matrix") void refreshMatrixViewLayout();
        else matrixViewLayout = null;
      });
      row.appendChild(cb);
      row.appendChild(document.createTextNode(` ${circle.label} (${count})`));
      filterPanel.appendChild(row);
    }
  };
  addSection("Nodes", "node");
  addSection("Edges", "edge");

  const reset = document.createElement("button");
  reset.className = "fp-reset";
  reset.textContent = "Reset this view";
  reset.addEventListener("click", () => {
    circleState[view] = defaultVisibleCircles(view);
    recomputeHiddenFromCircles();
    buildScenes();
    updateLegend();
    draw();
    renderCirclesPanel();
    if (view === "matrix") void refreshMatrixViewLayout();
    else matrixViewLayout = null;
  });
  filterPanel.appendChild(reset);
}
document.getElementById("btn-filters")!.addEventListener("click", () => {
  if (filterPanel.classList.contains("hidden")) {
    renderCirclesPanel();
    filterPanel.classList.remove("hidden");
  } else {
    filterPanel.classList.add("hidden");
  }
});

// side panel tabs
function showTab(which: "inspector" | "nodes"): void {
  tabInspector.classList.toggle("active", which === "inspector");
  tabNodes.classList.toggle("active", which === "nodes");
  inspector.classList.toggle("hidden", which !== "inspector");
  nodelistEl.classList.toggle("hidden", which !== "nodes");
}
tabInspector.addEventListener("click", () => showTab("inspector"));
tabNodes.addEventListener("click", () => showTab("nodes"));
btnUndo.addEventListener("click", () => store?.undo());
btnRedo.addEventListener("click", () => store?.redo());
btnMatrix.addEventListener("click", () => setView("matrix"));
btnGraph.addEventListener("click", () => setView("graph"));
document.getElementById("btn-fit")!.addEventListener("click", fit);
const btnLayout = document.getElementById("btn-layout") as HTMLButtonElement;
btnLayout.title =
  "Recompute the layout of the CURRENT view (Matrix = em-core swimlanes, " +
  "Graph = graph layout). Does not switch view or auto-fit. In Matrix, " +
  "keeps your manual arrangement (From Sketch); Alt-click = fresh layout.";
// Compute a layout via em-core and apply it to the store. `fresh` ignores the
// existing sketch. Shared by the Layout button and the auto-layout on loading
// a layout-less document (e.g. a live snapshot).
async function runLayout(fresh: boolean): Promise<void> {
  if (!store) return;
  const { computeLayout } = await import("./emcore");
  const layout = await computeLayout(
    store.doc.graph,
    fresh ? undefined : store.doc.layout,
  );
  store.setLayout(layout);
}

btnLayout.addEventListener("click", async (ev) => {
  if (!store) return;
  btnLayout.disabled = true;
  try {
    // Layout is VIEW-AWARE: recompute the layout of the CURRENT view, never
    // force a switch to Matrix. And do NOT auto-fit afterwards — the user
    // re-fits manually (Fit / "0") so the recompute keeps the current zoom.
    if (view === "graph" && !inContext()) {
      // Graph has its own client-side layout (views/graph.ts). "Layout" = a
      // fresh arrangement in the chosen algorithm → drop manual drags.
      graphOverrides.clear();
      buildScenes();
      draw();
      toast(`Graph layout: ${graphAlgorithm}`);
    } else if (matrixTighterThanDefault()) {
      // Matrix filtered beyond its default → recompute the VIEW layout on the
      // visible subgraph (recompact), leaving the archival layout untouched.
      await refreshMatrixViewLayout();
      toast("Layout (filtered subgraph)");
    } else {
      const fresh = (ev as MouseEvent).altKey;
      await runLayout(fresh); // store.setLayout → onChange → buildScenes + draw
      toast(fresh ? "Fresh layout (em-core)" : "Layout from sketch (em-core)");
    }
  } catch (e) {
    toast(`layout failed: ${e instanceof Error ? e.message : e}`);
  } finally {
    btnLayout.disabled = false;
  }
});
(document.getElementById("edge-filter") as HTMLSelectElement).addEventListener(
  "change",
  (ev) => {
    edgeFilter = (ev.target as HTMLSelectElement).value as typeof edgeFilter;
    updateLegend();
    draw();
  },
);
(document.getElementById("graph-layout") as HTMLSelectElement).addEventListener(
  "change",
  (ev) => {
    graphAlgorithm = (ev.target as HTMLSelectElement).value as GraphAlgorithm;
    graphOverrides.clear(); // new algorithm = fresh arrangement
    if (view === "graph" && !inContext()) {
      buildScenes();
      draw();
      fit(); // new coordinate space (radial/force centre on origin) → frame it
    } else {
      setView("graph"); // show the effect (setView rebuilds + fits)
    }
    toast(`Graph layout: ${graphAlgorithm}`);
  },
);

setupSearch(
  document.getElementById("search") as HTMLInputElement,
  document.getElementById("search-results")!,
  () => store?.doc ?? null,
  (id) => {
    if (inContext()) {
      contextStack = [];
      rebuildContext();
    }
    select(id);
    centerOn(id);
  },
);

// ---------- drag & drop ----------
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
});

// ---------- canvas interactions ----------
type DragMode =
  | "none"
  | "pan"
  | "node"
  | "graphnode"
  | "connect"
  | "marquee";
let dragMode: DragMode = "none";
// multi-selection (D3): the primary stays `selectedId`; the set is all selected
let selectedIds = new Set<string>();
// rubber-band marquee rect in WORLD coords while dragging on empty canvas
let marquee: { x0: number; y0: number; x1: number; y1: number } | null = null;
let moved = false;
let lastX = 0;
let lastY = 0;
let dragNodeId: string | null = null;
let graphLiquid = false; // Shift held at graph-drag start → drag the cluster
let dragMemberIds: string[] | null = null;
// true = group-drag (move the group node, members follow); false = multi-select
// move (move each selected node, respecting its container)
let dragIsGroupMove = false;
let dragCheckpointed = false;
let dragDetachPending = false; // Shift+drag a member → pull it out of its group
// nodes to pull out of their groups on shift+drag (whole selection if multi)
let dragDetachSet: { id: string; container: string }[] = [];
let spaceHeld = false; // Space → pan-always gesture (see pointerdown)
let lastClickTime = 0;
let lastClickId: string | null = null;

function worldPos(e: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return viewport().toWorld(e.clientX - rect.left, e.clientY - rect.top);
}

// Move ONE node by a world delta, respecting its container: a member of an
// open container keeps its group-local position (moveInGroupSpace); a free
// node moves on the canvas. Used for single-node AND multi-selection drags —
// the latter needs this so container members actually move (moveNodesBy only
// touches layout.positions, which the container pass overrides for members).
function moveOneByDelta(
  id: string,
  ddx: number,
  ddy: number,
  checkpoint: boolean,
): void {
  const s = scene();
  if (!s || !store) return;
  const sn = s.byId.get(id);
  if (!sn) return;
  const nx = sn.x + ddx;
  const ny = sn.y + ddy;
  const containerId = s.memberOf?.get(id);
  if (inContext()) {
    store.moveInGroupSpace(
      contextStack[contextStack.length - 1],
      id,
      { x: nx, y: ny, w: sn.w, h: sn.h },
      checkpoint,
    );
  } else if (containerId) {
    const g = s.groupsById!.get(containerId)!;
    store.moveInGroupSpace(
      containerId,
      id,
      {
        x: nx - (g.x + GROUP_PAD),
        y: ny - (g.y + GROUP_HEADER + GROUP_PAD),
        w: sn.w,
        h: sn.h,
      },
      checkpoint,
    );
  } else {
    store.moveNode(id, nx, ny, checkpoint);
  }
}

canvas.addEventListener("pointerdown", (e) => {
  hideEdgeMenu();
  moved = false;
  lastX = e.clientX;
  lastY = e.clientY;
  // Pan-always gesture, evaluated BEFORE any hit logic: middle mouse button,
  // or Space held (portable — Mac trackpads have no middle button). With many
  // hypergraphs covering the canvas there may be no empty space to grab, so
  // this pans regardless of what is under the cursor.
  if (e.button === 1 || spaceHeld) {
    dragMode = "pan";
    canvas.classList.add("panning");
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }
  const s = scene();
  if (!s) return;
  const w = worldPos(e);
  if (placingType) {
    dragMode = "none";
    return; // click placement handled on pointerup
  }
  // connect handle? The bullet shows on the hovered/selected node always, and
  // on EVERY node when zoomed in (renderer) — so allow starting a connect from
  // any node's right-edge handle there, not only the focused one (the handle
  // sits just outside the body, where hover is otherwise lost).
  const focus = hoverId ?? selectedId;
  const fn = focus ? s.byId.get(focus) : null;
  let handleNode =
    fn && hitHandle(fn, w.x, w.y, viewport().scale) ? fn : null;
  if (!handleNode && viewport().scale > 0.5) {
    for (const n of s.nodes) {
      if (hitHandle(n, w.x, w.y, viewport().scale)) {
        handleNode = n;
        break;
      }
    }
  }
  if (handleNode) {
    dragMode = "connect";
    beginConnect(handleNode.id);
    updateConnect(w.x, w.y);
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  const hit = hitTest(s, w.x, w.y);
  if (hit && (view === "matrix" || inContext())) {
    dragMode = "node";
    dragNodeId = hit.id;
    dragCheckpointed = false;
    // Shift+drag a member node → detach it from its container (D2). Membership
    // is read from the GRAPH (buildMembership.primaryOf), not the rendered
    // memberOf map — the latter only covers relocate-type groups, not outline
    // (is_part_of US/USD/VSF) containers.
    dragDetachPending = false;
    dragDetachSet = [];
    if (e.shiftKey && !inContext() && store) {
      const mm = buildMembership(store.doc);
      // shift+drag detaches the WHOLE selection when dragging a selected node
      const multi = selectedIds.has(hit.id) && selectedIds.size > 1;
      const targets = multi ? [...selectedIds] : [hit.id];
      for (const id of targets) {
        const c = mm.primaryOf.get(id);
        if (c) dragDetachSet.push({ id, container: c });
      }
      dragDetachPending = dragDetachSet.length > 0;
    }
    // dragging a group container moves the whole group — but only along
    // the PRIMARY containment tree: a shared document whose master lives
    // in another group must NOT follow (its local instance moves with the
    // extractors of THIS group anyway)
    dragMemberIds = null;
    dragIsGroupMove = false;
    if (s.groupsById?.has(hit.id) && store) {
      const mm = buildMembership(store.doc);
      const acc: string[] = [];
      const stack = [hit.id];
      while (stack.length) {
        const g = stack.pop()!;
        for (const m of mm.childrenOf.get(g) ?? []) {
          if (m !== hit.id && !acc.includes(m)) {
            acc.push(m);
            stack.push(m);
          }
        }
      }
      dragMemberIds = acc;
      dragIsGroupMove = true; // group node moves; members follow via container pass
    }
    // multi-selection: dragging any selected node moves the WHOLE selection
    if (!dragMemberIds && selectedIds.has(hit.id) && selectedIds.size > 1) {
      dragMemberIds = [...selectedIds].filter((id) => id !== hit.id);
      dragIsGroupMove = false; // move each node respecting its own container
    }
  } else if (hit && view === "graph" && !inContext()) {
    // Graph view: drag a node to place it (persisted as a graphOverride).
    // Shift = LIQUID — the connected 1-hop cluster follows, for manual grouping.
    dragMode = "graphnode";
    dragNodeId = hit.id;
    graphLiquid = e.shiftKey;
  } else {
    // Matrix: a click in the left swimlane-label strip selects that epoch, so
    // the Inspector exposes reorder + start/end (T7). Otherwise → marquee.
    const rect = canvas.getBoundingClientRect();
    const sxScreen = e.clientX - rect.left;
    const syScreen = e.clientY - rect.top;
    const vp2 = viewport();
    const lane =
      view === "matrix" && !inContext() && sxScreen < 160
        ? scene()?.lanes.find((l) => {
            const ly = l.y * vp2.scale + vp2.y;
            return syScreen >= ly && syScreen <= ly + l.height * vp2.scale;
          })
        : undefined;
    if (lane) {
      dragMode = "none"; // prevent marquee; the select happens on pointerup
      return;
    }
    // empty canvas → rubber-band marquee selection (pan is middle/Space, D1)
    dragMode = "marquee";
    marquee = { x0: w.x, y0: w.y, x1: w.x, y1: w.y };
  }
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const vp = viewport();
  const w = vp.toWorld(sx, sy);

  if (dragMode === "connect") {
    updateConnect(w.x, w.y);
    return;
  }
  if (dragMode === "pan") {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    if (moved) {
      vp.x += dx;
      vp.y += dy;
      lastX = e.clientX;
      lastY = e.clientY;
      tooltip.classList.add("hidden");
      draw();
    }
    return;
  }
  if (dragMode === "marquee") {
    if (marquee) {
      marquee.x1 = w.x;
      marquee.y1 = w.y;
      if (Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) > 3) moved = true;
      draw();
    }
    return;
  }
  if (dragMode === "graphnode" && dragNodeId && store) {
    if (Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) > 3)
      moved = true;
    if (moved) {
      const ddx = (e.clientX - lastX) / vp.scale;
      const ddy = (e.clientY - lastY) / vp.scale;
      const s = scene();
      const targets = new Set<string>([dragNodeId]);
      if (graphLiquid) {
        for (const ed of store.doc.graph.edges) {
          if (ed.source === dragNodeId) targets.add(ed.target);
          else if (ed.target === dragNodeId) targets.add(ed.source);
        }
      }
      for (const id of targets) {
        const sn = s?.byId.get(id);
        const base = graphOverrides.get(id) ?? (sn ? { x: sn.x, y: sn.y } : null);
        if (base) graphOverrides.set(id, { x: base.x + ddx, y: base.y + ddy });
      }
      lastX = e.clientX;
      lastY = e.clientY;
      buildScenes();
      draw();
    }
    return;
  }
  if (dragMode === "node" && dragNodeId && store) {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    if (moved) {
      const s = scene();
      const n = s?.byId.get(dragNodeId);
      // Shift+drag detach (D2): drop the membership edge, free the node at its
      // current canvas position, then let subsequent frames move it normally.
      if (dragDetachPending && n && s && store && dragDetachSet.length) {
        for (const d of dragDetachSet) {
          const dn = s.byId.get(d.id);
          store.removeFromGroup(
            d.id,
            d.container,
            dn ? { x: dn.x, y: dn.y, w: dn.w, h: dn.h } : undefined,
          );
        }
        toast(
          dragDetachSet.length > 1
            ? `moved ${dragDetachSet.length} out of group`
            : "moved out of group",
        );
        dragDetachPending = false;
        dragDetachSet = [];
        dragCheckpointed = true;
        lastX = e.clientX;
        lastY = e.clientY;
        return;
      }
      if (n && s && dragMemberIds && store && !inContext()) {
        if (dragIsGroupMove) {
          // whole-group drag: move the group node; members follow (container pass)
          store.moveNodesBy(
            [dragNodeId, ...dragMemberIds],
            dx / vp.scale,
            dy / vp.scale,
            !dragCheckpointed,
          );
        } else {
          // multi-selection move: shift EACH node respecting its own container
          for (const id of [dragNodeId, ...dragMemberIds])
            moveOneByDelta(id, dx / vp.scale, dy / vp.scale, !dragCheckpointed);
        }
        dragCheckpointed = true;
        lastX = e.clientX;
        lastY = e.clientY;
        return;
      }
      if (n && s) {
        moveOneByDelta(dragNodeId, dx / vp.scale, dy / vp.scale, !dragCheckpointed);
        dragCheckpointed = true;
      }
      lastX = e.clientX;
      lastY = e.clientY;
    }
    return;
  }

  // hover / tooltip
  const s = scene();
  if (!s) return;
  const hit = hitTest(s, w.x, w.y);
  const newHover = hit?.id ?? null;
  if (newHover !== hoverId) {
    hoverId = newHover;
    draw();
  }
  if (hit && !placingType) {
    tooltip.innerHTML = `<b></b> <span class="tt-type"></span><br><span class="tt-desc"></span>`;
    (tooltip.children[0] as HTMLElement).textContent = String(
      hit.node.name || hit.id,
    );
    (tooltip.children[1] as HTMLElement).textContent =
      `[${hit.node.node_type}] ${hit.id}`;
    (tooltip.children[3] as HTMLElement).textContent = String(
      hit.node.description ?? "",
    ).slice(0, 220);
    tooltip.style.left = Math.min(e.clientX + 14, innerWidth - 380) + "px";
    tooltip.style.top = e.clientY + 14 + "px";
    tooltip.classList.remove("hidden");
  } else {
    tooltip.classList.add("hidden");
  }
});

canvas.addEventListener("pointerup", (e) => {
  canvas.classList.remove("panning");
  const mode = dragMode;
  dragMode = "none";
  dragDetachPending = false;
  dragDetachSet = [];
  if (mode === "connect") {
    finishConnect(e.shiftKey || e.altKey); // Shift/Alt = force "create node"
    return;
  }
  if (mode === "graphnode") {
    if (!moved && dragNodeId) select(dragNodeId); // click (no drag) = select
    dragNodeId = null;
    graphLiquid = false;
    return;
  }
  const s = scene();
  if (!s) return;
  const w = worldPos(e);
  if (placingType) {
    placeNode(w.x, w.y);
    return;
  }
  if (mode === "marquee") {
    const m = marquee;
    marquee = null;
    if (moved && m) {
      const x0 = Math.min(m.x0, m.x1),
        x1 = Math.max(m.x0, m.x1),
        y0 = Math.min(m.y0, m.y1),
        y1 = Math.max(m.y0, m.y1);
      const ids = s.nodes
        .filter(
          (n) =>
            n.x < x1 && n.x + n.w > x0 && n.y < y1 && n.y + n.h > y0,
        )
        .map((n) => n.id);
      selectMany(ids);
    } else {
      select(null); // click on empty canvas clears the selection
    }
    dragNodeId = null;
    dragMemberIds = null;
    return;
  }
  if (!moved) {
    // matrix: click in the left swimlane-label strip → select that epoch (T7)
    const rect2 = canvas.getBoundingClientRect();
    const sxS = e.clientX - rect2.left;
    const syS = e.clientY - rect2.top;
    if (view === "matrix" && !inContext() && sxS < 160) {
      const vp2 = viewport();
      const lane = s.lanes.find((l) => {
        const ly = l.y * vp2.scale + vp2.y;
        return syS >= ly && syS <= ly + l.height * vp2.scale;
      });
      if (lane) {
        select(lane.id);
        return;
      }
    }
    // group container ± toggle
    const toggle = hitGroupToggle(s, w.x, w.y);
    if (toggle && store) {
      store.setFolded(toggle.id, !store.isFolded(toggle.id));
      return;
    }
    const hit = hitTest(s, w.x, w.y);
    const now = Date.now();
    if (
      hit &&
      hit.id === lastClickId &&
      now - lastClickTime < 400 &&
      isGroupType(hit.node.node_type)
    ) {
      // double-click on a group → enter its isolated canvas
      enterGroup(hit.id);
      lastClickId = null;
      return;
    }
    lastClickTime = now;
    lastClickId = hit?.id ?? null;
    // a document instance resolves to its real node (same outliner row);
    // Shift/Cmd-click toggles it in the multi-selection (D3)
    if (hit && (e.shiftKey || e.metaKey || e.ctrlKey))
      toggleSelect(hit.instanceOf ?? hit.id);
    else select(hit ? (hit.instanceOf ?? hit.id) : null);
  } else if (mode === "node" && dragNodeId) {
    // drag ended → route the drop (into a group box, or a different epoch lane)
    handleDrop(dragNodeId, w.x, w.y);
  }
  dragNodeId = null;
  dragMemberIds = null;
});

canvas.addEventListener("pointerleave", () => {
  tooltip.classList.add("hidden");
  if (hoverId) {
    hoverId = null;
    draw();
  }
});

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    viewport().zoomAt(
      e.clientX - rect.left,
      e.clientY - rect.top,
      Math.exp(-e.deltaY * 0.0016),
    );
    draw();
  },
  { passive: false },
);

// ---------- right-click context menu → Group (D3) ----------
const GROUP_CANDIDATES = [
  "ParadataNodeGroup",
  "ActivityNodeGroup",
  "TimeBranchNodeGroup",
  "LocationNodeGroup",
];

// group types whose membership edge is valid (per the datamodel) for EVERY
// selected node type — so we only ever offer a legal grouping.
function validGroupTargets(
  nodeTypes: string[],
): { groupType: string; edgeType: string }[] {
  const out: { groupType: string; edgeType: string }[] = [];
  for (const G of GROUP_CANDIDATES) {
    let edge: string | null = null;
    let ok = true;
    for (const nt of nodeTypes) {
      const m = allowedEdgeTypes(nt, G).find((t) => MEMBERSHIP_EDGES.has(t));
      if (!m) {
        ok = false;
        break;
      }
      edge = m;
    }
    if (ok && edge) out.push({ groupType: G, edgeType: edge });
  }
  return out;
}

let ctxMenuEl: HTMLDivElement | null = null;
function hideContextMenu(): void {
  ctxMenuEl?.remove();
  ctxMenuEl = null;
}
function showContextMenu(clientX: number, clientY: number): void {
  hideContextMenu();
  if (!store || !selectedIds.size) return;
  const ids = [...selectedIds];
  const types = ids.map((id) => store!.node(id)?.node_type ?? "");
  const targets = validGroupTargets(types);
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.style.left = Math.min(clientX, innerWidth - 210) + "px";
  menu.style.top = clientY + "px";
  const header = document.createElement("div");
  header.className = "ctx-header";
  header.textContent = `${ids.length} node${ids.length > 1 ? "s" : ""} selected`;
  menu.appendChild(header);
  if (targets.length) {
    for (const t of targets) {
      const b = document.createElement("button");
      b.textContent = `Group into ${t.groupType.replace("NodeGroup", "")} group`;
      b.onclick = () => {
        // position the new group at the members' bounding box so the matrix
        // draws it (nodes without a layout position are skipped)
        const sc = scene();
        let minX = Infinity,
          minY = Infinity;
        for (const id of ids) {
          const sn = sc?.byId.get(id);
          if (sn) {
            minX = Math.min(minX, sn.x);
            minY = Math.min(minY, sn.y);
          }
        }
        const pos = Number.isFinite(minX)
          ? { x: minX - 24, y: minY - 24, w: 200, h: 140 }
          : undefined;
        const g = store!.groupNodes(ids, t.groupType, t.edgeType, pos);
        hideContextMenu();
        select(g.id);
        toast(`grouped ${ids.length} into ${g.name}`);
      };
      menu.appendChild(b);
    }
  } else {
    const d = document.createElement("div");
    d.className = "ctx-disabled";
    d.textContent = "No legal group for this selection";
    menu.appendChild(d);
  }
  document.body.appendChild(menu);
  ctxMenuEl = menu;
}

canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const wp = worldPos(e);
  const s = scene();
  const hit = s ? hitTest(s, wp.x, wp.y) : null;
  // right-clicking a node outside the current selection selects it first
  if (hit && !selectedIds.has(hit.id)) select(hit.instanceOf ?? hit.id);
  if (!selectedIds.size) {
    hideContextMenu();
    return;
  }
  showContextMenu(e.clientX, e.clientY);
});
// close the menu on any pointerdown outside it
window.addEventListener(
  "pointerdown",
  (e) => {
    if (ctxMenuEl && !ctxMenuEl.contains(e.target as Node)) hideContextMenu();
  },
  true,
);

window.addEventListener("keydown", (e) => {
  const inField =
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (e.shiftKey) void saveAsDocument();
    else void saveDocument();
    return;
  }
  if (inField) return;
  if (e.code === "Space") {
    // hold Space → pan-always (grab) gesture; prevent page scroll
    spaceHeld = true;
    canvas.classList.add("space-pan");
    e.preventDefault();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (e.shiftKey) store?.redo();
    else store?.undo();
    return;
  }
  if (e.key === "0") fit();
  if (e.key === "Escape") {
    if (ctxMenuEl) hideContextMenu();
    else if (placingType) cancelPlacing();
    else if (!edgeMenu.classList.contains("hidden")) hideEdgeMenu();
    else if (inContext()) {
      contextStack.pop();
      rebuildContext();
    } else select(null);
  }
  if ((e.key === "Delete" || e.key === "Backspace") && selectedId && store) {
    e.preventDefault();
    store.deleteNode(selectedId);
    select(null);
  }
  if (e.key === "+" || e.key === "=") {
    viewport().zoomAt(viewSize().w / 2, viewSize().h / 2, 1.25);
    draw();
  }
  if (e.key === "-") {
    viewport().zoomAt(viewSize().w / 2, viewSize().h / 2, 0.8);
    draw();
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    spaceHeld = false;
    canvas.classList.remove("space-pan");
  }
});

window.addEventListener("beforeunload", (e) => {
  if (store?.dirty) e.preventDefault();
});

new ResizeObserver(resizeCanvas).observe(wrap);
resizeCanvas();
// repaint when an official icon finishes decoding
import("./icons").then(({ setIconRedraw }) => setIconRedraw(() => draw()));

// ---------- boot ----------
// Start from an EMPTY canvas (more natural than auto-loading a sample): use
// New, Open…, drop a file, or Sync. __EM_TEST_DATA__ still injects a fixture
// for automated tests.
if (window.__EM_TEST_DATA__) {
  loadDocument(window.__EM_TEST_DATA__, "embedded test data");
}
