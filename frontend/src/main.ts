import "./style.css";
import { applyFolding, buildMembership, MEMBERSHIP_EDGES } from "./folding";
import { renderInspector } from "./inspector";
import { DocumentStore } from "./model";
import { buildNodeList } from "./nodelist";
import { buildOverview } from "./overview";
import { edgeStyle } from "./palette";
import { buildPalette, SECTIONS } from "./palette-ui";
import {
  edgeAt,
  hitAddPhase,
  hitBandLabel,
  hitPdTag,
  render,
  type ConnectDrag,
} from "./renderer";
import {
  allowedEdgeTypes,
  classOf,
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
  openGraphml,
  saveGraphml,
  setWindowTitle,
  baseName,
  transformerUrl,
} from "./tauri";
import { type HostInfo, SyncClient } from "./sync";
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
  type DetailTemplate,
  edgeCircle,
  nodeCircle,
  TEMPLATES,
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
import type { EmDocument, EmEdge, ViewKind } from "./types";
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
// Epochs whose phases (sub-epochs) are shown as lane sub-bands in the Matrix.
// Pure view state — never persisted. Phase bands are shown BY DEFAULT for every
// epoch that has phases; this set holds the top-level epochs the user COLLAPSED
// back into a single lane (opt-out). Keyed by the top-level epoch (the lane).
const phasesCollapsed = new Set<string>();
const scenes: Partial<Record<ViewKind, Scene | null>> = {};
const viewports: Record<ViewKind, Viewport> = {
  matrix: new Viewport(),
  graph: new Viewport(),
};
let hoverId: string | null = null;
let selectedId: string | null = null;
// Connector (edge) hover/selection is separate from node selection: the
// selected edge is stored as the document edge (survives scene rebuilds, and
// is what Delete removes); hover is a transient index into the current scene.
let selectedEdge: EmEdge | null = null;
let hoverEdgeIdx: number | null = null;
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
const chronoBanner = document.getElementById("chrono-banner")!;
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
// Sits in the footer right after the "Extended Matrix" wordmark, so it reads
// "Extended Matrix 1.6" — the version alone, no redundant "EM" prefix.
verBtn.textContent = EM_VERSION;

// Footer word for the current authoring mode (ADR-002): Standalone = editing a
// local .em.json; Sidecar = live-synced to a host. Driven by the sync socket.
const modeIndicator = document.getElementById("mode-indicator")!;
const sidecarDetail = document.getElementById("sidecar-detail")!;
// What the connected host is editing (tool / file / database / endpoint). Tool
// + endpoint are known locally from settings; file/database arrive from the
// host's `host_info` (or a snapshot's `host`). Reset when we disconnect.
let hostInfo: HostInfo = {};
function renderSidecarDetail(): void {
  const segs: { k: string; v: string }[] = [];
  const tool = hostInfo.tool || syncToolLabel();
  if (tool) segs.push({ k: "tool", v: tool });
  // the host's document (.em.json / .graphml) and remote database are shown as
  // separate segments; a free-form label stands in if neither is reported
  if (hostInfo.file) segs.push({ k: "doc", v: hostInfo.file });
  if (hostInfo.database) segs.push({ k: "db", v: hostInfo.database });
  if (!hostInfo.file && !hostInfo.database && hostInfo.label)
    segs.push({ k: "doc", v: hostInfo.label });
  segs.push({ k: "at", v: getSyncUrl().replace(/^wss?:\/\//, "") });
  sidecarDetail.innerHTML = "";
  for (const s of segs) {
    const seg = document.createElement("span");
    seg.className = "sd-seg";
    const k = document.createElement("span");
    k.className = "sd-k";
    k.textContent = s.k;
    seg.append(k, document.createTextNode(s.v));
    sidecarDetail.appendChild(seg);
  }
}
function setModeIndicator(sidecar: boolean): void {
  modeIndicator.textContent = sidecar ? "Sidecar mode" : "Standalone mode";
  sidecarDetail.classList.toggle("hidden", !sidecar);
  if (sidecar) renderSidecarDetail();
  else {
    hostInfo = {};
    sidecarDetail.innerHTML = "";
  }
}
setModeIndicator(false);
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
  // The trigger now lives in the footer, so prefer opening UPWARD; only drop
  // below when there is not enough room above (short viewport).
  const ph = pop.offsetHeight;
  const openUp = rect.top - ph - 6 >= 0 || rect.top > window.innerHeight - rect.bottom;
  pop.style.top = (openUp ? Math.max(6, rect.top - ph - 6) : rect.bottom + 6) + "px";
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

// Edges are filtered by the detail-rings (buildScenes drops hidden edge types
// from the scene), so every edge in the scene is meant to be shown.
const edgeVisible = (_t?: string): boolean => true;

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
  const selectedEdgeIdx = selectedEdge
    ? s.edges.findIndex((se) => sameEdge(se.edge, selectedEdge!))
    : -1;
  render(
    ctx,
    s,
    viewport(),
    {
      hoverId,
      selectedId,
      selectedIds,
      edgeVisible,
      hoverEdgeIdx,
      selectedEdgeIdx,
      filterKey: "all",
      connect,
      editable: true,
      insertBoundary: view === "matrix" ? hoverInsertBoundary : null,
      monochrome,
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

/** Same document edge? Prefer id, else the (source, type, target) triple. */
function sameEdge(a: EmEdge, b: EmEdge): boolean {
  if (a.id && b.id) return a.id === b.id;
  return (
    a.source === b.source &&
    a.target === b.target &&
    a.edge_type === b.edge_type
  );
}

function select(nodeId: string | null): void {
  selectedId = nodeId;
  selectedIds = new Set(nodeId ? [nodeId] : []);
  selectedEdge = null; // node and connector selection are mutually exclusive
  refreshInspector();
  nodeList.setSelected(nodeId);
  draw();
  // mirror the selection to a connected peer (Blender), unless this
  // selection just arrived FROM the peer (avoid the echo loop)
  if (!applyingRemoteSelect) sync.sendSelect(nodeId, [...selectedIds]);
}

/** Index (into the current scene's edges) of the connector under a world point,
 *  within a scale-aware grab tolerance; -1 if none. Uses the SAME edgeVisible +
 *  filter the renderer draws with, so picking matches what is on screen. */
function pickEdgeAt(wx: number, wy: number): number {
  const s = scene();
  if (!s) return -1;
  const tol = 6 / viewport().scale; // ~6 screen px, easy to grab
  return edgeAt(
    s,
    { hoverId, selectedId, edgeVisible, filterKey: "all" },
    wx,
    wy,
    tol,
  );
}

/** Select a connector (edge). Clears any node selection so Delete/Backspace
 *  and the accent target the edge. Not mirrored to peers (nodes-only channel). */
function selectEdge(edge: EmEdge | null): void {
  selectedEdge = edge;
  if (edge) {
    selectedId = null;
    selectedIds = new Set();
    nodeList.setSelected(null);
  }
  refreshInspector();
  draw();
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
  renderInspector(
    inspector,
    store,
    selectedId,
    {
      onJump: (id) => {
        select(id);
        centerOn(id);
      },
      onClose: () => select(null),
      onDeleteNode: (id) => {
        store!.deleteNode(id);
        select(null);
      },
      onDeleteEdge: (edge) => {
        // clear first so the store's onChange re-render doesn't paint a panel
        // for the edge we're removing
        if (selectedEdge && sameEdge(selectedEdge, edge)) selectedEdge = null;
        store!.deleteEdge(edge);
      },
      onToggleFold: (gid) => store!.setFolded(gid, !store!.isFolded(gid)),
      onEnterGroup: enterGroup,
      onAddPhase: (epochId) => {
        const ph = store!.addPhase(epochId);
        select(ph.id);
        toast(`phase ${ph.name} created`);
      },
      onTogglePhases: (epochId) => {
        // epochId is the TOP-level epoch (the inspector resolves it); toggling
        // collapses/expands ALL of its phases & sub-phases at once.
        if (phasesCollapsed.has(epochId)) phasesCollapsed.delete(epochId);
        else phasesCollapsed.add(epochId);
        buildScenes();
        refreshInspector();
        draw();
      },
      isPhasesVisible: (epochId) => !phasesCollapsed.has(epochId),
      onDeletePhase: (phaseId) => promptDeletePhase(phaseId),
      onDeleteEpoch: (epochId) => promptDeleteEpoch(epochId),
      onReorderEpoch: (epochId, dir) => {
        // set the new lane order, then a from-sketch relayout re-lays out every
        // node into its lane (semantic) so phased lanes don't malform
        if (store!.reorderEpoch(epochId, dir))
          void runLayout(false).then(() => select(epochId));
      },
      onAssignEpoch: (nodeId, epochId) => {
        store!.setFirstEpoch([nodeId], epochId);
        // re-home + reflow are view-side, but a fresh em-core layout gives the
        // moved unit a clean position inside its new band
        void runLayout(false).then(() => {
          select(nodeId);
          toast(`moved to ${store!.node(epochId)?.name ?? "epoch"}`);
        });
      },
      onTogglePin: (nodeId) => {
        const pinning = !store!.isPinned(nodeId);
        // freeze the node's CURRENT scene position so the engine has an exact
        // Rect to hold, then pin.
        if (pinning) {
          const sn = scenes.matrix?.byId.get(nodeId);
          if (sn) {
            const layout = (store!.doc.layout ??= {});
            (layout.positions ??= {})[nodeId] = {
              x: sn.x,
              y: sn.y,
              w: sn.w,
              h: sn.h,
            };
          }
        }
        store!.setPinned([nodeId], pinning);
        toast(pinning ? "position locked" : "position unlocked");
      },
      isPinned: (nodeId) => store!.isPinned(nodeId),
    },
    selectedEdge,
  );
}

// Delete a phase, first asking where to re-home the units attributed to it (and
// any sub-phases): the parent epoch (un-phase them) or an adjacent sibling
// phase. When the phase is empty we skip the prompt and delete outright.
function promptDeletePhase(phaseId: string): void {
  if (!store) return;
  const parent = store.parentEpoch(phaseId);
  const { units, subPhases } = store.phaseOrphans(phaseId);
  const orphanN = units.length + subPhases.length;
  const phaseName = store.node(phaseId)?.name || "phase";
  const finishDelete = (reassignTo: string): void => {
    store!.deletePhase(phaseId, reassignTo);
    // a phase deletion is a structural change: regenerate the em-core layout
    // (from-sketch) so the dropped phase's swimlane is gone and its re-homed
    // units are laid out under their new epoch, then redraw.
    void runLayout(false).then(() => {
      select(parent);
      toast(`deleted ${phaseName}`);
    });
  };
  // nothing to re-home → delete straight away (parent is the natural fallback)
  if (orphanN === 0) {
    finishDelete(parent ?? phaseId);
    return;
  }
  // build the candidate targets: parent epoch + prev/next sibling phase (by time)
  const startOf = (id: string): number => {
    const v = Number((store!.node(id)?.data as Record<string, unknown>)?.start_time);
    return Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;
  };
  const targets: { id: string; label: string; hint: string }[] = [];
  if (parent)
    targets.push({
      id: parent,
      label: `${store.node(parent)?.name || "parent epoch"}`,
      hint: "un-phase — units go to the epoch itself",
    });
  if (parent) {
    const sibs = store
      .epochPhases(parent)
      .filter((s) => s !== phaseId)
      .sort((a, b) => startOf(a) - startOf(b));
    const s0 = startOf(phaseId);
    const prev = [...sibs].reverse().find((s) => startOf(s) <= s0);
    const next = sibs.find((s) => startOf(s) >= s0);
    if (prev)
      targets.push({
        id: prev,
        label: store.node(prev)?.name || "previous phase",
        hint: "previous phase",
      });
    if (next && next !== prev)
      targets.push({
        id: next,
        label: store.node(next)?.name || "next phase",
        hint: "next phase",
      });
  }
  if (!targets.length) {
    finishDelete(phaseId);
    return;
  }
  const modal = document.createElement("div");
  modal.className = "modal";
  const card = document.createElement("div");
  card.className = "modal-card";
  const parts = units.length
    ? `${units.length} unit${units.length > 1 ? "s" : ""}`
    : "";
  const parts2 = subPhases.length
    ? `${subPhases.length} sub-phase${subPhases.length > 1 ? "s" : ""}`
    : "";
  const what = [parts, parts2].filter(Boolean).join(" + ");
  card.innerHTML =
    `<div class="modal-head"><span>Delete “${phaseName}”</span></div>` +
    `<div class="modal-body">` +
    `<p>This phase holds <b>${what}</b>. Where should ${
      orphanN > 1 ? "they" : "it"
    } move?</p>` +
    `</div>` +
    `<div class="modal-foot"></div>`;
  const foot = card.querySelector(".modal-foot") as HTMLElement;
  const close = (): void => {
    modal.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };
  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.onclick = close;
  foot.appendChild(cancel);
  targets.forEach((t, i) => {
    const b = document.createElement("button");
    if (i === 0) b.className = "primary";
    b.textContent = `→ ${t.label}`;
    b.title = t.hint;
    b.onclick = () => {
      close();
      finishDelete(t.id);
    };
    foot.appendChild(b);
  });
  modal.appendChild(card);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(modal);
}

function promptDeleteEpoch(epochId: string): void {
  if (!store) return;
  const name = store.node(epochId)?.name || "epoch";
  const { units, phases } = store.epochDeletionImpact(epochId);
  const finishDelete = (): void => {
    store!.deleteEpoch(epochId);
    // structural change (lanes/PDGs removed): regenerate the em-core layout so
    // no phantom lane lingers, then clear the selection.
    void runLayout(false).then(() => {
      select(null);
      toast(`deleted ${name}`);
    });
  };
  // empty epoch → delete straight away
  if (units === 0 && phases === 0) {
    finishDelete();
    return;
  }
  const modal = document.createElement("div");
  modal.className = "modal";
  const card = document.createElement("div");
  card.className = "modal-card";
  const parts = [
    phases ? `${phases} phase${phases > 1 ? "s" : ""} (deleted)` : "",
    units
      ? `${units} unit${units > 1 ? "s" : ""} (kept, un-attributed)`
      : "",
  ].filter(Boolean);
  card.innerHTML =
    `<div class="modal-head"><span>Delete “${name}”</span></div>` +
    `<div class="modal-body"><p>This epoch holds <b>${parts.join(
      " + ",
    )}</b>. Sub-phases are removed; units are kept but lose their epoch. Continue?</p></div>` +
    `<div class="modal-foot"></div>`;
  const foot = card.querySelector(".modal-foot") as HTMLElement;
  const close = (): void => {
    modal.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };
  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.onclick = close;
  foot.appendChild(cancel);
  const del = document.createElement("button");
  del.className = "primary";
  del.textContent = "Delete epoch";
  del.onclick = () => {
    close();
    finishDelete();
  };
  foot.appendChild(del);
  modal.appendChild(card);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(modal);
}

function updateLegend(): void {
  legend.innerHTML = "";
  const s = scene();
  if (!s) {
    legend.classList.add("hidden");
    return;
  }
  const types = new Set<string>();
  for (const e of s.edges) types.add(e.edge.edge_type ?? "edge");
  if (!types.size) {
    legend.classList.add("hidden");
    return;
  }
  const head = document.createElement("div");
  head.className = "pal-sect";
  head.textContent = "Relations";
  legend.appendChild(head);
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
  // an epoch's temporal ParadataNodeGroup is a structural part of the epoch
  // (its chronology container), NOT regular paradata clutter — so it is always
  // visible, exempt from the "Paradata nodes" ring toggle.
  const byId = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  const epochPdg = new Set<string>();
  for (const e of doc.graph.edges)
    if (
      e.edge_type === "has_paradata_nodegroup" &&
      classOf(byId.get(e.source)?.node_type) === "EpochNode"
    )
      epochPdg.add(e.target);
  if (hiddenNodeTypes.size || hiddenEdgeTypes.size) {
    vNodes = vNodes.filter(
      (n) => epochPdg.has(n.id) || !hiddenNodeTypes.has(n.node_type),
    );
    // drop group containers left with NO visible member (else hollow boxes);
    // keep genuinely-empty authored groups.
    const mm = buildMembership(doc);
    let vis = new Set(vNodes.map((n) => n.id));
    vNodes = vNodes.filter((n) => {
      if (!isGroupType(n.node_type)) return true;
      // a FOLDED group intentionally hides its members but must still render as
      // a closed box, so never drop it as "hollow"
      if (folded.has(n.id)) return true;
      // epoch temporal paradata box: always kept (structural, custom-rendered)
      if (epochPdg.has(n.id)) return true;
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

/** Top-level epochs that have at least one phase in their subtree. */
function phasedTopEpochs(): Set<string> {
  const parent = new Map<string, string>();
  for (const e of store!.doc.graph.edges)
    if (e.edge_type === "has_sub_epoch") parent.set(e.target, e.source);
  const topOf = (id: string): string => {
    let c = id;
    const seen = new Set<string>();
    while (parent.has(c) && !seen.has(c)) {
      seen.add(c);
      c = parent.get(c)!;
    }
    return c;
  };
  const tops = new Set<string>();
  for (const ph of parent.keys()) tops.add(topOf(ph));
  return tops;
}

function buildScenes(): void {
  if (!store) return;
  const doc = store.doc;
  const fview = filteredView();
  // Phase bands show BY DEFAULT for every phased epoch, except those the user
  // collapsed — so a freshly created phase is visible with no extra click.
  const phasesVisible = new Set(
    [...phasedTopEpochs()].filter((id) => !phasesCollapsed.has(id)),
  );
  // epochs/phases with a chronology-coherence conflict → warning marker
  const warnIds = new Set<string>();
  for (const n of doc.graph.nodes)
    if (
      n.node_type === "EpochNode" &&
      store.epochCoherenceWarnings(n.id).length > 0
    )
      warnIds.add(n.id);
  scenes.matrix = buildMatrixScene(
    doc,
    fview,
    matrixViewLayout ?? undefined,
    phasesVisible,
    warnIds,
  );
  scenes.graph = buildGraphScene(doc, fview, {
    algorithm: graphAlgorithm,
    overrides: graphOverrides,
  });
  updateChronoBanner();
}

// ---- chronology validation banner (item 10) ----
// A dismissible strip above the canvas, shown in Matrix view when the lane
// stack doesn't follow newest-first chronology (offers a one-click sort) or
// adjacent epochs overlap / leave gaps (advisory). Document state, not
// selection state — so it lives above the canvas, not in the inspector.
let chronoBannerDismissed = false;
let chronoBannerExpanded = false;

function updateChronoBanner(): void {
  if (!store || view !== "matrix") {
    chronoBanner.classList.add("hidden");
    return;
  }
  const orderOk = store.lanesMatchDateOrder();
  const issues = store.chronologyIssues();
  if (chronoBannerDismissed || (orderOk && issues.length === 0)) {
    chronoBanner.classList.add("hidden");
    return;
  }
  chronoBanner.replaceChildren();

  const row = document.createElement("div");
  row.className = "cb-row";

  const msg = document.createElement("span");
  msg.className = "cb-msg";
  msg.append("⚠ ");
  if (!orderOk) {
    const b = document.createElement("b");
    b.textContent = "Lane fuori ordine cronologico.";
    msg.appendChild(b);
  } else if (issues.length) {
    msg.append("Problemi di coerenza cronologica.");
  }
  row.appendChild(msg);

  if (issues.length) {
    const n = issues.length;
    const toggle = document.createElement("button");
    toggle.className = "cb-toggle";
    toggle.textContent = `${chronoBannerExpanded ? "▾" : "▸"} ${n} problem${
      n === 1 ? "a" : "i"
    }`;
    toggle.addEventListener("click", () => {
      chronoBannerExpanded = !chronoBannerExpanded;
      updateChronoBanner();
    });
    row.appendChild(toggle);
  }

  if (!orderOk) {
    const sort = document.createElement("button");
    sort.className = "cb-sort";
    sort.textContent = "Ordina lane per data";
    sort.title = "Riordina le epoche newest-first per start_time";
    sort.addEventListener("click", () => {
      store!.sortLanesByDate();
      void runLayout(false).then(() => {
        buildScenes();
        fit();
      });
    });
    row.appendChild(sort);
  }

  const close = document.createElement("button");
  close.className = "cb-close";
  close.textContent = "✕";
  close.title = "Nascondi";
  close.addEventListener("click", () => {
    chronoBannerDismissed = true;
    chronoBanner.classList.add("hidden");
  });
  row.appendChild(close);
  chronoBanner.appendChild(row);

  if (issues.length && chronoBannerExpanded) {
    const list = document.createElement("ul");
    list.className = "cb-details";
    for (const w of issues) {
      const li = document.createElement("li");
      li.textContent = w;
      list.appendChild(li);
    }
    chronoBanner.appendChild(list);
  }

  chronoBanner.classList.remove("hidden");
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
  // Does the INCOMING doc already carry node positions? Capture this BEFORE
  // ensureAllEpochParadata (which adds positions for the boxes it creates) —
  // otherwise those few positions make the doc look "already laid out" and we
  // skip the em-core auto-layout, leaving every position-less node (e.g. a
  // whole Blender sync snapshot) unrendered. Only the boxes would show.
  const hadStoredPositions =
    Object.keys(d.layout?.positions ?? {}).length > 0;
  store = new DocumentStore(d);
  // every epoch always carries its temporal ParadataNodeGroup — ensure it now,
  // silently (before the change/op listeners are wired) so it neither pushes to
  // a sync host nor lands on the undo stack.
  store.ensureAllEpochParadata();
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
  chronoBannerDismissed = false; // re-evaluate chronology for the new document
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
  // Matrix needs stored node POSITIONS. A doc may carry a layout object with
  // NO usable positions — a fresh graph, or a Blender sync snapshot (its emjson
  // layout has no matrix coordinates). In that case DON'T fall back to Graph:
  // compute a fresh layout via em-core so the Matrix renders, then show it.
  if (hadStoredPositions) {
    setView(scenes.matrix ? "matrix" : "graph");
  } else {
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
  // Epochs are swimlanes in Matrix, not free-dropped nodes — clicking the
  // EpochNode palette entry adds a lane at the top (newest) and selects it for
  // dating (the chronology, not an xy click, decides its final position; the
  // "Ordina lane per data" banner sorts it in). Graph view keeps free-drop.
  if (t === "EpochNode" && view === "matrix") {
    if (placingType) cancelPlacing();
    addEpochEmMode();
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

// EM-mode add-epoch: insert a lane at `index` in the top-level stack (default
// top = newest) and select it for dating. INCREMENTAL — addEpochAt opens a gap
// and slides only the lanes/nodes below it; NO em-core relayout (the layout is
// recomputed only on the explicit Layout action), so existing nodes don't
// reshuffle. Optional start/end are the interpolated slot from a spatial insert.
function addEpochEmMode(index = 0, start?: number, end?: number): void {
  if (!store) {
    toast("Open a document first");
    return;
  }
  const node = store.addEpochAt(index, undefined, start, end);
  // addEpochAt emitted → onChange already rebuilt the scene; just select it.
  select(node.id);
  // date-driven add (top, undated) scrolls to the new lane so the user can date
  // it; a spatial insert happens at a boundary the user is already looking at.
  if (start == null && end == null) centerOn(node.id);
  toast(
    start != null || end != null
      ? "Nuova epoca inserita — controlla start/end"
      : "Nuova epoca — imposta start/end nell'inspector",
  );
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
// Returns true if the drop RE-ASSIGNED the node (into a group, or to a different
// epoch/phase band); false if it landed in the same place — the caller then
// persists the freely-dragged position instead of letting the rebuild snap it
// back.
function handleDrop(nodeId: string, wx: number, wy: number): boolean {
  if (!store || view !== "matrix" || inContext()) return false;
  const st = store; // non-null capture (narrowing is lost inside callbacks)
  const s = scene();
  if (!s) return false;
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
      return true;
    }
  }

  // 2) not into a group → re-assign the epoch of the lane at the drop point.
  //    A dragged group carries its epoch-placed members along.
  const lane = s.lanes.find((l) => wy >= l.y && wy <= l.y + l.height);
  if (!lane) return false;
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
  if (!targets.length) return false;
  // if the lane is showing phase sub-bands, resolve which band the drop landed
  // in and attribute to that phase (the residual band's phaseId is the epoch
  // itself → un-phased). Otherwise attribute to the epoch lane.
  let targetEpoch = lane.id;
  let targetLabel = lane.label;
  const bandsHere = (s.subBands ?? [])
    .filter((b) => b.laneId === lane.id)
    .sort((a, b) => a.y - b.y);
  if (bandsHere.length) {
    let chosen = bandsHere[0];
    for (const b of bandsHere) if (wy >= b.y - 13) chosen = b; // gaps → band below
    targetEpoch = chosen.phaseId;
    targetLabel = chosen.residual ? `${lane.label} (unphased)` : chosen.label;
  }
  // dropped back in the SAME epoch/band → not a reassignment; let the caller keep
  // the freely-dragged position (a single node dropped where it already belongs)
  if (ids.length === 1) {
    const cur = st.doc.graph.edges.find(
      (e) =>
        (e.edge_type === "has_first_epoch" ||
          e.edge_type === "survive_in_epoch") &&
        e.source === ids[0],
    )?.target;
    if (cur === targetEpoch) return false;
  }
  st.setFirstEpoch(targets, targetEpoch);
  toast(`moved ${targets.length} to ${targetLabel}`);
  if (bandsHere.length) void runLayout(false); // clean placement in the new band
  return true;
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
  .addEventListener("click", async () => {
    // In Sidecar (sync) mode the graph is the host's; a New document must
    // leave sync (optionally asking the host to save first) and return to
    // Standalone, mirroring the online build.
    if (!(await confirmLeaveSidecar("Starting a new document"))) return;
    newDocument();
  });
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

// Export/import GraphML via the s3Dgraphy "transformer" service — the frontend
// cannot run s3Dgraphy (ADR-001 invariant 2), so it POSTs the .em.json / GraphML
// to an HTTP endpoint. That endpoint is PLUGGABLE (precedence):
//   1. ?bridge= query param       (explicit override, dev/debug)
//   2. window.EM_BRIDGE           (injected)
//   3. desktop: the Rust `transformer_url` command — a remote StratiGraph
//      server if EM_TRANSFORMER_URL is set, else the local em-bridge sidecar
//   4. browser dev default        (./dev.sh bridge on :8765)
let _bridgeUrl: string | null = null;
async function bridgeUrl(): Promise<string> {
  if (_bridgeUrl) return _bridgeUrl;
  _bridgeUrl =
    new URLSearchParams(location.search).get("bridge") ??
    (window as unknown as { EM_BRIDGE?: string }).EM_BRIDGE ??
    (await transformerUrl()) ??
    "http://localhost:8765";
  return _bridgeUrl;
}
const BRIDGE_UNREACHABLE =
  "GraphML transformer not reachable — the local sidecar may still be starting; " +
  "otherwise start it with ./dev.sh (or set EM_TRANSFORMER_URL to a server)";
document.getElementById("btn-graphml")!.addEventListener("click", async () => {
  if (!store) {
    toast("Open a document first");
    return;
  }
  const g = store.doc.graph;
  const name = String(g["name"] ?? g.graph_id ?? "graph");
  toast("Exporting GraphML…");
  try {
    const res = await fetch(`${await bridgeUrl()}/graphml`, {
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
    const xml = await res.text();
    const filename = `${name.replace(/[^\w.-]+/g, "_")}.graphml`;
    if (isTauri()) {
      // Native "Save As…" dialog — the webview has no browser download UI.
      const path = await saveGraphml(xml, filename);
      if (!path) return; // cancelled
      toast(`GraphML exported → ${baseName(path)}`);
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("GraphML exported");
    }
  } catch {
    toast(BRIDGE_UNREACHABLE);
  }
});

// Import a yEd GraphML file → em.json via the transformer (s3Dgraphy
// importer), then load it. Same endpoint/constraint as export (invariant 2).
async function importGraphmlText(text: string, srcName: string): Promise<void> {
  if (!(await confirmLeaveSidecar("Importing GraphML"))) return;
  toast("Importing GraphML…");
  try {
    const res = await fetch(`${await bridgeUrl()}/import-graphml`, {
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
    loadDocument(doc, srcName); // no layout → auto fresh-layout on load
    toast(`Imported ${srcName}`);
  } catch {
    toast(BRIDGE_UNREACHABLE);
  }
}

document
  .getElementById("btn-import-graphml")!
  .addEventListener("click", async () => {
    // Native file dialog in the Tauri webview (a plain <input type=file>
    // doesn't open a picker there); <input type=file> in a real browser.
    if (isTauri()) {
      const picked = await openGraphml();
      if (!picked) return; // cancelled
      await importGraphmlText(picked.text, baseName(picked.path));
      return;
    }
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".graphml,.xml";
    inp.addEventListener("change", async () => {
      const file = inp.files?.[0];
      if (!file) return;
      await importGraphmlText(await file.text(), file.name);
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
      // provisional document label from the graph name, until the host reports
      // its actual file/database via host_info
      if (!hostInfo.file && !hostInfo.database) {
        const gname = (doc.graph as { name?: string }).name;
        if (gname) {
          hostInfo = { ...hostInfo, label: gname };
          renderSidecarDetail();
        }
      }
    },
    onHostInfo: (info2) => {
      // the host told us what it is editing (tool / file / database) → show it
      hostInfo = { ...hostInfo, ...info2 };
      renderSidecarDetail();
    },
    onStatus: (state) => {
      btnSync.classList.toggle("active", state === "open");
      // clear, high-visibility signal that we are in live-sync mode
      document.body.classList.toggle("sync-active", state === "open");
      setModeIndicator(state === "open");
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
const setEdgeTips = document.getElementById(
  "set-edge-tooltips",
) as HTMLInputElement;

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
  setEdgeTips.checked = s.interaction.edgeTooltips;
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
    interaction: { edgeTooltips: setEdgeTips.checked },
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
const btnViewProps = document.getElementById("btn-view-props")!;
function filterPanelOpen(): boolean {
  return !filterPanel.classList.contains("hidden");
}
// The panel and its floating opener are mutually exclusive in the top-right
// corner: opening hides the gear button, the panel's × restores it.
function openFilterPanel(): void {
  renderCirclesPanel();
  filterPanel.classList.remove("hidden");
  btnViewProps.classList.add("hidden");
}
function closeFilterPanel(): void {
  filterPanel.classList.add("hidden");
  btnViewProps.classList.remove("hidden");
}
// Monochrome (B/W) display toggle — every node draws black-bordered + white
// (shapes disambiguate). A pure presentation option (not a filter), so it lives
// as its own flag, exposed at the end of the detail panel.
let monochrome = false;
function applyTemplate(t: DetailTemplate): void {
  circleState[view] = new Set(t.circles);
  recomputeHiddenFromCircles();
  buildScenes();
  updateLegend();
  draw();
  renderCirclesPanel();
  if (view === "matrix") void refreshMatrixViewLayout();
  else matrixViewLayout = null;
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

  const head = document.createElement("div");
  head.className = "fp-head";
  const hint = document.createElement("span");
  hint.className = "fp-hint";
  hint.textContent = `Detail level — ${view === "matrix" ? "Matrix" : "Graph"} view`;
  const close = document.createElement("button");
  close.className = "fp-close";
  close.textContent = "✕";
  close.title = "Close (Esc)";
  close.setAttribute("aria-label", "Close view properties");
  close.addEventListener("click", closeFilterPanel);
  head.append(hint, close);
  filterPanel.appendChild(head);

  // Templates (at the top): one-click presets that set BOTH node and edge
  // rings (this replaced the old edge-only "All edges / Stratigraphic / None").
  const eq = (t: DetailTemplate): boolean =>
    t.circles.length === visible.size && t.circles.every((k) => visible.has(k));
  const tmpl = document.createElement("div");
  tmpl.className = "fp-template";
  const tlbl = document.createElement("span");
  tlbl.textContent = "Template";
  const tsel = document.createElement("select");
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "Custom…";
  tsel.appendChild(ph);
  for (const t of TEMPLATES) {
    const o = document.createElement("option");
    o.value = t.key;
    o.textContent = t.label;
    if (eq(t)) o.selected = true;
    tsel.appendChild(o);
  }
  tsel.addEventListener("change", () => {
    const t = TEMPLATES.find((x) => x.key === tsel.value);
    if (t) applyTemplate(t);
  });
  tmpl.append(tlbl, tsel);
  filterPanel.appendChild(tmpl);

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

  // Display options (presentation, not a filter): monochrome overrides every
  // node to a black border + white fill — the pre-EM-1.3 shape-only look.
  const dh = document.createElement("div");
  dh.className = "fp-sect";
  dh.textContent = "Display";
  filterPanel.appendChild(dh);
  const monoRow = document.createElement("label");
  monoRow.className = "fp-row";
  const monoCb = document.createElement("input");
  monoCb.type = "checkbox";
  monoCb.checked = monochrome;
  monoCb.addEventListener("change", () => {
    monochrome = monoCb.checked;
    draw();
  });
  monoRow.appendChild(monoCb);
  monoRow.appendChild(document.createTextNode(" Monochrome (B/W) — black borders"));
  filterPanel.appendChild(monoRow);

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
btnViewProps.addEventListener("click", () => {
  if (filterPanel.classList.contains("hidden")) openFilterPanel();
  else closeFilterPanel();
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
  const prev = store.doc.layout;
  // Pins & anchors are INTENT, not computed geometry — they must survive every
  // Layout, including a fresh (Alt) one. On fresh we drop the manual position
  // arrangement but still pass pins/anchors so em-core resolves them (a rule
  // anchor like the epoch paradata box needs no stored position; a fixed pin
  // without a frozen position simply releases, which is the point of "fresh").
  const sketch = fresh
    ? { pinned: prev?.pinned, anchors: prev?.anchors }
    : prev;
  const layout = await computeLayout(store.doc.graph, sketch);
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
// scene position of a single dragged node at drag start, so pointerup can persist
// the net delta to layout.positions (a single-node drag moves the scene node
// directly for smoothness; without this it would snap back on rebuild)
let dragStartScene: { x: number; y: number } | null = null;
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
let pdTagPending: string | null = null; // PD tag pressed → enter on click (pointerup)
let bandSelectPending: string | null = null; // phase band label pressed → select on click
let addPhasePending: string | null = null; // epoch "+" button pressed → add phase on click
let hoverInsertBoundary: number | null = null; // EM-mode insert-epoch: hovered lane boundary
let insertPending: number | null = null; // insert boundary pressed → add epoch on click

// Which top-level lane boundary (0 = above the top lane … lanes.length = below
// the last) is the cursor near? Only in Matrix, in the left strip, when idle —
// drives the "insert epoch here" affordance (hover indicator + click).
function insertBoundaryAt(sx: number, sy: number): number | null {
  if (view !== "matrix" || !store || placingType || dragMode !== "none")
    return null;
  const s = scenes.matrix;
  if (!s || !s.lanes.length) return null;
  if (sx > 150) return null; // left strip only — clear of content and node drags
  const vp = viewport();
  const TOL = 6;
  let best: number | null = null;
  let bestD = TOL + 1;
  for (let i = 0; i <= s.lanes.length; i++) {
    const worldY =
      i < s.lanes.length
        ? s.lanes[i].y
        : s.lanes[i - 1].y + s.lanes[i - 1].height;
    const by = worldY * vp.scale + vp.y;
    const d = Math.abs(sy - by);
    if (d <= TOL && d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

// Interpolate a chronological slot for an epoch inserted at boundary `bi`: fill
// the gap between the newer neighbour above and the older neighbour below.
function insertSlotDates(bi: number): { start?: number; end?: number } {
  const s = scenes.matrix;
  if (!s) return {};
  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const boundOf = (laneId: string, which: "start_time" | "end_time") =>
    num((store!.node(laneId)?.data as Record<string, unknown>)?.[which]);
  const upper = bi > 0 ? s.lanes[bi - 1] : null; // newer neighbour (above)
  const lower = bi < s.lanes.length ? s.lanes[bi] : null; // older neighbour (below)
  // start_time = older bound, end_time = newer bound; lanes sort by start desc.
  const start = lower ? boundOf(lower.id, "end_time") : undefined;
  const end = upper ? boundOf(upper.id, "start_time") : undefined;
  return { start, end };
}
// a single-node drag moves the SCENE node directly (no per-frame rebuild) so it
// tracks the cursor smoothly even inside phase sub-bands; the drop is committed
// on pointerup (reassign via handleDrop, else the scene resets on rebuild).
let dragSceneDirty = false;

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
    // Apply the delta straight to layout.positions. Reading the scene's
    // absolute y here (sn.y + ddy) would bake in the view-side swimlane
    // re-stack / sub-band shift on every frame — that shift is NOT in
    // layout.positions, so it compounds and the node runs away (worst on
    // free nodes like extractor/combiner in a lower, shifted lane).
    store.moveNodesBy([id], ddx, ddy, checkpoint);
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
  // "PD" tag in a lane / band label chip → enter that epoch/phase temporal PDG
  // (same as double-clicking the old box). Resolved on pointerup as a click.
  if (!placingType) {
    const rect = canvas.getBoundingClientRect();
    const lx = e.clientX - rect.left;
    const ly = e.clientY - rect.top;
    // EM-mode "insert epoch" boundary (left strip) takes priority over the
    // epoch-label select that also lives in the left strip.
    const ib = insertBoundaryAt(lx, ly);
    if (ib != null) {
      insertPending = ib;
      dragMode = "none";
      return;
    }
    // PD tag first (it sits inside the band chip): click it to ENTER the group
    const pd = hitPdTag(lx, ly);
    if (pd) {
      pdTagPending = pd;
      dragMode = "none";
      return;
    }
    // "+" quick-add-phase button on an epoch's rail
    const ap = hitAddPhase(lx, ly);
    if (ap) {
      addPhasePending = ap;
      dragMode = "none";
      return;
    }
    // elsewhere on a phase band label chip: click to SELECT the phase
    const bl = hitBandLabel(lx, ly);
    if (bl) {
      bandSelectPending = bl;
      dragMode = "none";
      return;
    }
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
    dragStartScene = { x: hit.x, y: hit.y };
    dragCheckpointed = false;
    dragSceneDirty = false;
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

  // EM-mode insert-epoch hover indicator (idle only; cleared during any drag)
  if (dragMode === "none") {
    const ib = insertBoundaryAt(sx, sy);
    if (ib !== hoverInsertBoundary) {
      hoverInsertBoundary = ib;
      canvas.style.cursor = ib != null ? "copy" : "";
      draw();
    }
  } else if (hoverInsertBoundary !== null) {
    hoverInsertBoundary = null;
  }

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
        // single-node drag: move the SCENE node directly so it follows the
        // cursor (a per-frame store rebuild would let the phase sub-band reflow
        // snap it back / jump). Committed on pointerup by handleDrop or reset.
        n.x += dx / vp.scale;
        n.y += dy / vp.scale;
        dragSceneDirty = true;
        draw();
      }
      lastX = e.clientX;
      lastY = e.clientY;
    }
    return;
  }

  // hover / tooltip
  const s = scene();
  if (!s) return;
  const showId = getSettings().developer.showNodeIds;
  const hit = hitTest(s, w.x, w.y);
  // A group container's big box shouldn't swallow a connector line running
  // through its empty interior: over a container we still probe for an edge,
  // so hover (and thus selection) reach it. Leaf nodes keep priority.
  const overContainer =
    !!hit && (s.groupsById?.has(hit.id) || isGroupType(hit.node.node_type));
  const eiHover =
    placingType || (hit && !overContainer) ? -1 : pickEdgeAt(w.x, w.y);
  const newHoverEdge = eiHover >= 0 ? eiHover : null;
  // when a connector is hovered, don't also accent the node/container under it
  const newHover = newHoverEdge != null ? null : (hit?.id ?? null);
  if (newHover !== hoverId || newHoverEdge !== hoverEdgeIdx) {
    hoverId = newHover;
    hoverEdgeIdx = newHoverEdge;
    draw();
  }
  // don't fight the Space-held pan cursor: leave the inline cursor empty so the
  // `.space-pan` grab/grabbing CSS wins while the spacebar is down
  canvas.style.cursor = spaceHeld
    ? ""
    : newHoverEdge != null
      ? "pointer"
      : "default";
  if (
    newHoverEdge != null &&
    !placingType &&
    getSettings().interaction.edgeTooltips
  ) {
    // connector tooltip: the edge type + its endpoints (endpoint labels follow
    // the same id-hiding rule as node tooltips)
    const se = s.edges[newHoverEdge];
    const endName = (id: string): string => {
      const n = s.byId.get(id)?.node;
      return String(n?.name || (showId ? id : (n?.node_type ?? id)));
    };
    tooltip.innerHTML = `<b></b> <span class="tt-type"></span><br><span class="tt-desc"></span>`;
    (tooltip.children[0] as HTMLElement).textContent = "connector";
    (tooltip.children[1] as HTMLElement).textContent =
      `[${se.edge.edge_type ?? "edge"}]`;
    (tooltip.children[3] as HTMLElement).textContent =
      `${endName(se.source)} → ${endName(se.target)}`;
    tooltip.style.left = Math.min(e.clientX + 14, innerWidth - 380) + "px";
    tooltip.style.top = e.clientY + 14 + "px";
    tooltip.classList.remove("hidden");
  } else if (hit && !placingType) {
    // The node id only surfaces when the developer "show node ids" setting is
    // on — otherwise both the title fallback and the type line stay id-free.
    tooltip.innerHTML = `<b></b> <span class="tt-type"></span><br><span class="tt-desc"></span>`;
    (tooltip.children[0] as HTMLElement).textContent = String(
      hit.node.name || (showId ? hit.id : hit.node.node_type),
    );
    (tooltip.children[1] as HTMLElement).textContent = showId
      ? `[${hit.node.node_type}] ${hit.id}`
      : `[${hit.node.node_type}]`;
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
  // "PD" tag click → enter the epoch/phase temporal PDG (a click, not a drag)
  if (pdTagPending) {
    const pd = pdTagPending;
    pdTagPending = null;
    if (!moved) enterGroup(pd);
    return;
  }
  // phase band label click → select that phase (residual → the epoch)
  if (bandSelectPending) {
    const id = bandSelectPending;
    bandSelectPending = null;
    if (!moved) select(id);
    return;
  }
  // epoch "+" button click → add a phase to that epoch
  if (addPhasePending) {
    const epochId = addPhasePending;
    addPhasePending = null;
    if (!moved && store) {
      const ph = store.addPhase(epochId);
      select(ph.id);
      toast(`phase ${ph.name} created`);
    }
    return;
  }
  // lane-boundary "+" click → insert an epoch at that chronological slot, with
  // start/end interpolated to fill the gap between the two neighbours
  if (insertPending != null) {
    const bi = insertPending;
    insertPending = null;
    hoverInsertBoundary = null;
    if (!moved) {
      const { start, end } = insertSlotDates(bi);
      addEpochEmMode(bi, start, end);
    }
    return;
  }
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
      // a click (no drag) on empty canvas: select a connector if one is under
      // the cursor, otherwise clear the selection
      const ei = pickEdgeAt(w.x, w.y);
      if (ei >= 0) selectEdge(s.edges[ei].edge);
      else select(null);
    }
    dragNodeId = null;
    dragMemberIds = null;
    return;
  }
  if (!moved) {
    const hit = hitTest(s, w.x, w.y);
    // group container ± toggle
    const toggle = hitGroupToggle(s, w.x, w.y);
    if (toggle && store) {
      store.setFolded(toggle.id, !store.isFolded(toggle.id));
      return;
    }
    // matrix: click in the left swimlane-label strip → select that epoch (T7),
    // but only when no node/box is under the cursor there (else the box wins).
    const rect2 = canvas.getBoundingClientRect();
    const sxS = e.clientX - rect2.left;
    const syS = e.clientY - rect2.top;
    if (view === "matrix" && !inContext() && sxS < 160 && !hit) {
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
    // A connector passing through a group container's empty interior would be
    // swallowed by the big box — if the click landed on an edge line, select
    // the connector instead. Leaf nodes still win (only containers defer).
    if (hit && (s.groupsById?.has(hit.id) || isGroupType(hit.node.node_type))) {
      const ei = pickEdgeAt(w.x, w.y);
      if (ei >= 0) {
        selectEdge(s.edges[ei].edge);
        dragNodeId = null;
        dragMemberIds = null;
        return;
      }
    }
    // a document instance resolves to its real node (same outliner row);
    // Shift/Cmd-click toggles it in the multi-selection (D3)
    if (hit && (e.shiftKey || e.metaKey || e.ctrlKey))
      toggleSelect(hit.instanceOf ?? hit.id);
    else select(hit ? (hit.instanceOf ?? hit.id) : null);
  } else if (mode === "node" && dragNodeId) {
    // drag ended → route the drop (into a group box, or a different epoch lane)
    const reassigned = handleDrop(dragNodeId, w.x, w.y);
    // a single-node drag moved the SCENE node directly. If the drop did NOT
    // reassign it (dropped where it already belongs), PERSIST the freely-dragged
    // position to layout.positions — otherwise the rebuild snaps it back. Use the
    // net delta (not the absolute scene y, which bakes in the view-side lane
    // re-stack / sub-band shift and would make the node run away — cf. 203c6c8).
    if (dragSceneDirty && !reassigned && dragStartScene) {
      const sn = scene()?.byId.get(dragNodeId);
      if (sn) {
        const ddx = sn.x - dragStartScene.x;
        const ddy = sn.y - dragStartScene.y;
        if (Math.abs(ddx) + Math.abs(ddy) > 0.5)
          moveOneByDelta(dragNodeId, ddx, ddy, true);
      }
    }
    // rebuild so the node settles into its committed spot (persisted position,
    // or reassigned band/lane)
    if (dragSceneDirty) {
      buildScenes();
      draw();
    }
  }
  dragSceneDirty = false;
  dragNodeId = null;
  dragStartScene = null;
  dragMemberIds = null;
});

// Double-click a group container → enter its isolated canvas. Uses the native
// dblclick event (browser fires it on a genuine double-click) instead of a
// manual two-pointerup timer — the timer was unreliable because heavy per-click
// work (buildMembership + a full redraw) could push the gap past its window.
canvas.addEventListener("dblclick", (e) => {
  const s = scene();
  if (!s) return;
  const w = worldPos(e);
  const hit = hitTest(s, w.x, w.y);
  if (hit && isGroupType(hit.node.node_type)) {
    e.preventDefault();
    enterGroup(hit.id);
  }
});

canvas.addEventListener("pointerleave", () => {
  tooltip.classList.add("hidden");
  canvas.style.cursor = "default";
  if (hoverId || hoverEdgeIdx != null) {
    hoverId = null;
    hoverEdgeIdx = null;
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
  if (e.code === "Space" && !spaceHeld) {
    // hold Space → pan-always (grab) gesture; prevent page scroll.
    spaceHeld = true;
    canvas.classList.add("space-pan");
    // clear the inline cursor NOW (a prior hover left it "default"/"pointer",
    // which would override the .space-pan grab until the mouse next moves)
    canvas.style.cursor = "";
    e.preventDefault();
    return;
  }
  if (e.code === "Space") {
    e.preventDefault(); // swallow auto-repeat without re-running the above
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
    else if (filterPanelOpen()) closeFilterPanel();
    else if (!edgeMenu.classList.contains("hidden")) hideEdgeMenu();
    else if (inContext()) {
      contextStack.pop();
      rebuildContext();
    } else select(null);
  }
  if (
    (e.key === "Delete" || e.key === "Backspace") &&
    (selectedIds.size || selectedId) &&
    store
  ) {
    e.preventDefault();
    // delete the WHOLE multi-selection, not just the active node
    const ids = selectedIds.size ? [...selectedIds] : selectedId ? [selectedId] : [];
    // epochs & phases must go through their dedicated flows (swimlane + temporal
    // PDG cleanup, unit re-home/un-attribution, relayout) — the generic
    // deleteNodes would leave a phantom lane and orphan PDGs.
    const isEpochish = (id: string) => store!.node(id)?.node_type === "EpochNode";
    if (ids.length === 1 && isEpochish(ids[0])) {
      if (store.parentEpoch(ids[0]) != null) promptDeletePhase(ids[0]);
      else promptDeleteEpoch(ids[0]);
      return;
    }
    const plain = ids.filter((id) => !isEpochish(id));
    if (plain.length !== ids.length)
      toast("Epochs/phases: use Delete epoch / Delete phase in the inspector");
    if (plain.length) {
      store.deleteNodes(plain);
      select(null);
    }
  }
  if ((e.key === "Delete" || e.key === "Backspace") && selectedEdge && store) {
    e.preventDefault();
    const edge = selectedEdge;
    selectedEdge = null; // clear before the store's onChange re-render
    store.deleteEdge(edge);
    refreshInspector();
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
    // restore a normal cursor immediately (the inline style was cleared to ""
    // while Space was held so the .space-pan grab cursor could show)
    canvas.style.cursor = "default";
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
