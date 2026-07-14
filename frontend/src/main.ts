import "./style.css";
import { applyFolding, buildMembership, MEMBERSHIP_EDGES } from "./folding";
import { renderInspector } from "./inspector";
import { DocumentStore } from "./model";
import { buildNodeList } from "./nodelist";
import { buildOverview } from "./overview";
import { edgeStyle, SEQUENCE_EDGES } from "./palette";
import { buildPalette } from "./palette-ui";
import { render, type ConnectDrag } from "./renderer";
import {
  allowedEdgeTypes,
  connectValidity,
  edgeTypeLabel,
  EM_VERSION,
  GENERIC_EDGE,
  isGroupType,
  isStratigraphicType,
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
import { buildGraphScene } from "./views/graph";
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
const SYNC_URL = "ws://localhost:8788";
let view: ViewKind = "matrix";
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
const hiddenNodeTypes = new Set<string>();
const hiddenEdgeTypes = new Set<string>();
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

document.getElementById("em-version")!.textContent = `EM ${EM_VERSION}`;

let toastTimer: number | undefined;
function toast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.add("hidden"), 2600);
}

function viewSize(): { w: number; h: number } {
  return { w: wrap.clientWidth, h: wrap.clientHeight };
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

function buildScenes(): void {
  if (!store) return;
  const doc = store.doc;
  const folded = new Set(doc.layout?.folded_groups ?? []);
  const foldedView = folded.size
    ? applyFolding(doc, buildMembership(doc), folded)
    : undefined;
  scenes.matrix = buildMatrixScene(doc, foldedView);
  // graph view: apply the liquid type filters on top of the folding
  let gNodes = foldedView?.nodes ?? doc.graph.nodes;
  let gEdges = foldedView?.edges ?? doc.graph.edges;
  if (hiddenNodeTypes.size || hiddenEdgeTypes.size) {
    gNodes = gNodes.filter((n) => !hiddenNodeTypes.has(n.node_type));
    const present = new Set(gNodes.map((n) => n.id));
    gEdges = gEdges.filter(
      (e) =>
        !hiddenEdgeTypes.has(e.edge_type ?? "") &&
        present.has(e.source) &&
        present.has(e.target),
    );
  }
  scenes.graph = buildGraphScene(doc, {
    nodes: gNodes,
    edges: gEdges,
    badges: foldedView?.badges ?? new Map(),
  });
}

function setView(v: ViewKind): void {
  view = v;
  btnMatrix.classList.toggle("active", v === "matrix");
  btnGraph.classList.toggle("active", v === "graph");
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
    buildScenes();
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

function loadFile(file: File): void {
  file
    .text()
    .then((t) => loadDocument(JSON.parse(t) as EmDocument, file.name))
    .catch((e) => (info.textContent = `parse error: ${e}`));
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
    onFoldAll: (folded) => {
      if (!store) return;
      const ids = store.doc.graph.nodes
        .filter((n) => n.node_type === "ParadataNodeGroup")
        .map((n) => n.id);
      store.setFoldedMany(ids, folded);
    },
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
  select(id);
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

function finishConnect(): void {
  if (!connect || !store) return;
  const { fromId, targetId, validity } = connect;
  connect = null;
  canvas.classList.remove("connecting");
  draw();
  if (!targetId || !validity) return;
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

// Sync toggle: connect/disconnect the live selection bridge (ADR-002).
const btnSync = document.getElementById("btn-sync") as HTMLButtonElement;
btnSync.addEventListener("click", () => {
  if (sync.connected) {
    sync.disconnect();
    clearDocument(); // the synced graph is the host's — don't leave it lingering
    return;
  }
  sync.connect(SYNC_URL, {
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
      if (state === "open") info.textContent = `sync: connected to ${SYNC_URL}`;
      else if (state === "closed")
        info.textContent = "sync: disconnected (is Blender's server running?)";
    },
  });
});

// liquid filters panel (graph view): include/exclude node & edge types
const filterPanel = document.getElementById("filter-panel")!;
function rebuildFilterPanel(): void {
  filterPanel.innerHTML = "";
  if (!store) return;
  const nodeCounts = new Map<string, number>();
  for (const n of store.doc.graph.nodes)
    nodeCounts.set(n.node_type, (nodeCounts.get(n.node_type) ?? 0) + 1);
  const edgeCounts = new Map<string, number>();
  for (const e of store.doc.graph.edges)
    edgeCounts.set(e.edge_type ?? "?", (edgeCounts.get(e.edge_type ?? "?") ?? 0) + 1);

  const section = (
    title: string,
    counts: Map<string, number>,
    hiddenSet: Set<string>,
  ): void => {
    const h = document.createElement("div");
    h.className = "fp-sect";
    h.textContent = title;
    filterPanel.appendChild(h);
    for (const [t, c] of [...counts.entries()].sort()) {
      const row = document.createElement("label");
      row.className = "fp-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !hiddenSet.has(t);
      cb.addEventListener("change", () => {
        if (cb.checked) hiddenSet.delete(t);
        else hiddenSet.add(t);
        buildScenes();
        updateLegend();
        draw();
      });
      row.appendChild(cb);
      row.appendChild(document.createTextNode(` ${t} (${c})`));
      filterPanel.appendChild(row);
    }
  };
  const hint = document.createElement("div");
  hint.className = "fp-hint";
  hint.textContent = "Filters apply to the graph view";
  filterPanel.appendChild(hint);
  section("Node types", nodeCounts, hiddenNodeTypes);
  section("Edge types", edgeCounts, hiddenEdgeTypes);
}
document.getElementById("btn-filters")!.addEventListener("click", () => {
  if (filterPanel.classList.contains("hidden")) {
    rebuildFilterPanel();
    filterPanel.classList.remove("hidden");
    if (view !== "graph" && !inContext()) setView("graph");
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
  "Recompute the layout (em-core). Keeps your manual arrangement (From " +
  "Sketch); Alt-click for a fresh layout from scratch.";
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
    const fresh = (ev as MouseEvent).altKey;
    await runLayout(fresh);
    if (view !== "matrix" && !inContext()) setView("matrix");
    fit();
    toast(fresh ? "Fresh layout (em-core)" : "Layout from sketch (em-core)");
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
type DragMode = "none" | "pan" | "node" | "connect" | "marquee";
let dragMode: DragMode = "none";
// multi-selection (D3): the primary stays `selectedId`; the set is all selected
let selectedIds = new Set<string>();
// rubber-band marquee rect in WORLD coords while dragging on empty canvas
let marquee: { x0: number; y0: number; x1: number; y1: number } | null = null;
let moved = false;
let lastX = 0;
let lastY = 0;
let dragNodeId: string | null = null;
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
  // connect handle?
  const focus = hoverId ?? selectedId;
  const fn = focus ? s.byId.get(focus) : null;
  if (fn && hitHandle(fn, w.x, w.y, viewport().scale)) {
    dragMode = "connect";
    beginConnect(fn.id);
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
  } else {
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
    finishConnect();
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
