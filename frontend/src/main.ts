import "./style.css";
import { applyFolding, buildMembership } from "./folding";
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
      edgeVisible,
      filterKey: edgeFilter,
      connect,
      editable: true,
    },
    w,
    h,
  );
  overview.update(s, viewport(), w, h);
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
  refreshInspector();
  nodeList.setSelected(nodeId);
  draw();
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
  scenes.graph = buildGraphScene(doc, foldedView);
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

function loadDocument(d: EmDocument, sourceName: string): void {
  if (!d?.graph?.nodes) {
    info.textContent = `${sourceName}: not an .em.json document (missing graph.nodes)`;
    return;
  }
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
  setView(scenes.matrix ? "matrix" : "graph");
}

function loadFile(file: File): void {
  file
    .text()
    .then((t) => loadDocument(JSON.parse(t) as EmDocument, file.name))
    .catch((e) => (info.textContent = `parse error: ${e}`));
}

function saveDocument(): void {
  if (!store) return;
  const g = store.doc.graph;
  const name =
    (g["name"] as string | undefined) ?? g.graph_id ?? "graph";
  const blob = new Blob([store.toJSON()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${String(name).replace(/[^\w.-]+/g, "_")}.em.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  store.dirty = false;
  updateToolbar();
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
  const id = store.freshId(placingType);
  const w = isGroupType(placingType) ? 120 : 90;
  const h = 30;
  const node = { id, name: id, node_type: placingType, description: "" };
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
const fileInput = document.getElementById("file-input") as HTMLInputElement;
document
  .getElementById("btn-open")!
  .addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files?.[0]) loadFile(fileInput.files[0]);
  fileInput.value = "";
});
document.getElementById("btn-save")!.addEventListener("click", saveDocument);
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
btnLayout.addEventListener("click", async () => {
  if (!store) return;
  btnLayout.disabled = true;
  try {
    const { computeLayout } = await import("./emcore");
    const layout = await computeLayout(store.doc.graph);
    store.setLayout(layout);
    if (view !== "matrix" && !inContext()) setView("matrix");
    fit();
    toast("Layout recomputed (em-core)");
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
type DragMode = "none" | "pan" | "node" | "connect";
let dragMode: DragMode = "none";
let moved = false;
let lastX = 0;
let lastY = 0;
let dragNodeId: string | null = null;
let dragMemberIds: string[] | null = null;
let dragCheckpointed = false;
let lastClickTime = 0;
let lastClickId: string | null = null;

function worldPos(e: PointerEvent | WheelEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return viewport().toWorld(e.clientX - rect.left, e.clientY - rect.top);
}

canvas.addEventListener("pointerdown", (e) => {
  hideEdgeMenu();
  moved = false;
  lastX = e.clientX;
  lastY = e.clientY;
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
    // dragging a group container moves the whole group (recursive members)
    dragMemberIds = null;
    if (s.groupsById?.has(hit.id) && store) {
      const mm = buildMembership(store.doc);
      const acc: string[] = [];
      const stack = [hit.id];
      while (stack.length) {
        const g = stack.pop()!;
        for (const m of mm.membersOf.get(g) ?? []) {
          if (m !== hit.id && !acc.includes(m)) {
            acc.push(m);
            stack.push(m);
          }
        }
      }
      dragMemberIds = acc;
    }
  } else {
    dragMode = "pan";
    canvas.classList.add("panning");
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
  if (dragMode === "node" && dragNodeId && store) {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    if (moved) {
      const s = scene();
      const n = s?.byId.get(dragNodeId);
      if (n && s && dragMemberIds && store && !inContext()) {
        // whole-group drag: shift the group node and every member
        store.moveNodesBy(
          [dragNodeId, ...dragMemberIds],
          dx / vp.scale,
          dy / vp.scale,
          !dragCheckpointed,
        );
        dragCheckpointed = true;
        lastX = e.clientX;
        lastY = e.clientY;
        return;
      }
      if (n && s) {
        const nx = n.x + dx / vp.scale;
        const ny = n.y + dy / vp.scale;
        const containerId = s.memberOf?.get(dragNodeId);
        if (inContext()) {
          store.moveInGroupSpace(
            contextStack[contextStack.length - 1],
            dragNodeId,
            { x: nx, y: ny, w: n.w, h: n.h },
            !dragCheckpointed,
          );
        } else if (containerId) {
          // member of an open container: persist the local position
          const g = s.groupsById!.get(containerId)!;
          store.moveInGroupSpace(
            containerId,
            dragNodeId,
            {
              x: nx - (g.x + GROUP_PAD),
              y: ny - (g.y + GROUP_HEADER + GROUP_PAD),
              w: n.w,
              h: n.h,
            },
            !dragCheckpointed,
          );
        } else {
          store.moveNode(dragNodeId, nx, ny, !dragCheckpointed);
        }
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
    select(hit?.id ?? null);
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

window.addEventListener("keydown", (e) => {
  const inField =
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveDocument();
    return;
  }
  if (inField) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (e.shiftKey) store?.redo();
    else store?.undo();
    return;
  }
  if (e.key === "0") fit();
  if (e.key === "Escape") {
    if (placingType) cancelPlacing();
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

window.addEventListener("beforeunload", (e) => {
  if (store?.dirty) e.preventDefault();
});

new ResizeObserver(resizeCanvas).observe(wrap);
resizeCanvas();
// repaint when an official icon finishes decoding
import("./icons").then(({ setIconRedraw }) => setIconRedraw(() => draw()));

// ---------- boot ----------
if (window.__EM_TEST_DATA__) {
  loadDocument(window.__EM_TEST_DATA__, "embedded test data");
} else if (location.protocol !== "file:") {
  fetch("./testdata/TempluMare.em.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (d && !store) loadDocument(d as EmDocument, "TempluMare sample");
    })
    .catch(() => void 0);
}
