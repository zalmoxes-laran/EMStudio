import "./style.css";
import { applyFolding, buildMembership, MEMBERSHIP_EDGES } from "./folding";
import { setBridgeResolver } from "./geo";
import {
  buildContainer,
  bumpVersion,
  mergeContainers,
  parseContainer,
  versionLabel,
} from "./container";
import type { Conflict, ProjectVersion } from "./container";
import {
  addToShelf,
  clearShelf,
  effectiveResidency,
  effectiveScope,
  isAnnotatable,
  loadShelfDocument,
  onShelfChange,
  removeFromShelf,
  restoreShelf,
  shelfEntries,
  shelfMeta,
  shelfToDocument,
  renameShelf,
  SHELF_SCOPES,
  type ShelfEntry,
  type ShelfScope,
} from "./shelf";
import {
  currentIdentity,
  declareIdentity,
  orcidProblem,
  forgetIdentity,
  knownIdentities,
  MockIdentityProvider,
  publishGate,
  useIdentity,
  verifyCurrentIdentity,
  type IdentityProvider,
} from "./identity";
import { renderInspector } from "./inspector";
import { narrativesIn, renderNarrativeView, VIEW_TYPE_MIME } from "./narrative";
import {
  addEpochChapter,
  scaffoldNarrativeFromGraph,
  undescribedEpochs,
} from "./narrative-scaffold";
import type { NarrativeEditor } from "./narrative";
import * as nauth from "./narrative-authorship";
import type { AuthorRef, DraftResult } from "./narrative-authorship";
import * as nedit from "./narrative-edit";
import {
  documentDiagnostics,
  logError,
  logInfo,
  logWarn,
  onLogChange,
  renderLogPanel,
  versionBanner,
} from "./logpanel";
import { DocumentStore } from "./model";
import {
  HAS_PARADATA_NODEGROUP,
  initialName,
  nameStatusMap,
  paradataGroupRenameOnAttach,
  renameOnAttach,
  type NameCheck,
} from "./naming";
import {
  applyTheme,
  storeMode,
  storedMode,
  watchSystemTheme,
  type ThemeMode,
} from "./theme";
import { buildNodeList } from "./nodelist";
import { buildOverview } from "./overview";
import { edgeStyle } from "./palette";
import {
  buildPalette,
  PALETTE_MIME,
  SECTIONS,
  type PaletteDragPayload,
} from "./palette-ui";
import { createResourceThumb } from "./resource-preview";
import {
  edgeAt,
  hitAddPhase,
  hitAdornmentBadge,
  hitBandLabel,
  hitPdDecorator,
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
  hdtoProfileTypes,
  isGroupType,
  isStratigraphicType,
  narrativeViewTypes,
  narrativeViewTypeDescription,
  nodeTypeForClass,
  resourceTypeOfLocator,
  typeDescription,
  // (the datamodel version exports are read by `versions.ts` for the footer's
  // breakdown popover — MENU-AUDIT removed this module's second, hardcoded copy)
} from "./rules";
import { sceneToSvg } from "./svg-export";
import {
  isTauri,
  openEmJson,
  readEmJsonPath,
  writeEmJson,
  saveAsEmJson,
  openGraphml,
  saveGraphml,
  saveTtl,
  setWindowTitle,
  baseName,
  transformerUrl,
  llmKeyStatus,
  setLlmKey,
  clearLlmKey,
  onForeignBridge,
  pickFolder,
  pickXlsx,
} from "./tauri";
import {
  describeExtraction,
  describeImport,
  initialState as initialStratiMinerState,
  renderStratiMiner,
  unreadWarnings,
} from "./stratiminer";
import { EMTree, renderEMTree, slotLabel } from "./emtree";
import type { EMTreeHandlers, SlotViewState } from "./emtree";
import {
  coverage,
  getLocale,
  initI18n,
  isValidated,
  isValidatedInBuild,
  LOCALES,
  onLocaleChange,
  setLocale,
  setValidated,
  t,
} from "./i18n";
import type { Locale } from "./i18n";
import type {
  ExtractResult,
  ImportResult,
  PromptResult,
  StratiMinerHandlers,
} from "./stratiminer";
import { type HostInfo, SyncClient, SYNC_DIRECTIONS, type SyncDirection } from "./sync";
import type { GraphOp } from "./model";
import { buildCommand, type CommandVerb } from "./commands";
import {
  type AwarenessNote, emptyPresence, type HubOp, noteForRemoteOp, noteForStale,
  opsForLocalChange, peerSelections, planRejoin, stampForResend,
  type PresenceState,
  reducePresence,
} from "./hub";
import { clearField as crdtClearField, writeField as crdtWriteField } from "./crdt";
import { isRemoved } from "./crdt";
import {
  AI_PROVIDERS,
  getSettings,
  getSyncUrl,
  iiifBase,
  miradorBase,
  saveSettings,
  SYNC_TOOLS,
  type Settings,
} from "./settings";
import { envelope as wireEnvelope } from "./wire";
import {
  fetchImageInfo,
  fittedUrl,
  type ImageInfo,
  imageService as iiifImageService,
  isImageResource,
  regionToWebAnnotation,
  webAnnotationToRegion,
  thumbnailUrl as iiifThumbnailUrl,
} from "./iiif";
import {
  ADORNMENT_EDGE_TYPES,
  CIRCLES,
  type CircleKey,
  defaultVisibleCircles,
  type DetailTemplate,
  edgeCircle,
  isAdornmentNodeType,
  nodeCircle,
  TEMPLATES,
} from "./filters";
import { adornmentBadges, type AdornmentBadge } from "./adornments";
import { BADGE_RULES, resolveEffective, sourceLabel } from "./funnel";
import { type Qualia, qualiaList, vocabularyFor } from "./vocab";
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
import {
  addEmDataHost,
  addEmDataRow,
  toggleEmDataClaimForm,
  removeEmDataHost,
  emDataFilter,
  setEmDataFilter,
  type EmDataHost,
  currentSheetKey,
  initEmData,
  renderEmData,
  setSheet,
  setVolatileProvider,
} from "./emdata";
import { addRow, deleteRow, EM_DATA_SHEETS } from "./em-data";
import { isVolatile } from "./volatile";
import { addRecent, removeRecent, type RecentFile } from "./recent";
import {
  WORKSPACES,
  WINDOW_TYPE_META,
  addWorkspace,
  removeWorkspace,
  renameWorkspace,
  workspaceLabel,
  workspacePreset,
  isTiled,
  activeWin,
  activeWorkspace,
  activeWindowType,
  closeWindow,
  GRAPH_MODES,
  applyAssetsLayout,
  applyDefaultLayout,
  canJoin,
  joinWindow,
  siblingIdsOf,
  layoutOf,
  maximizedWin,
  paneIds,
  toggleMaximize,
  setActiveWin,
  setActiveWorkspace,
  setWinCurrent,
  winCurrent,
  setWinMode,
  DISABLED_MODES,
  setWinModeOf,
  winModeOf,
  winModes,
  setWinType,
  syncActiveWorkspace,
  setSplitRatio,
  splitWindow,
  winMode,
  windowsOf,
  type Pane,
  type Win,
  type WorkspaceId,
  type WindowType,
} from "./workspace";
import type { CentralMode, EmDocument, EmEdge, EmNode, ViewKind } from "./types";
import {
  BridgeDownError,
  FileRefusedError,
  collectionFromFile,
  collectionFromFolder,
  collectionFromUrl,
  fsFileUrl,
  fsList,
  isDecodable,
  kindOfExt,
  pdfPageCount,
  setStorageBridgeResolver,
  type Collection,
  type CollectionItem,
  type FsEntry,
  type FsListing,
} from "./storage";
import {
  DEFAULT_ASSET_LICENSE,
  RESIDENCIES,
  SCOPES,
  acquisitions,
  bucketAcquisition,
  declareDerivation,
  defaultUse,
  findResource,
  kindOf,
  supersessionOf,
  type Residency,
  type ResourceKind,
  type ResourceUse,
  type Scope,
} from "./ingest";
import { buildDtcGenesisScene, buildGroupScene } from "./views/context";
import { buildDtcScene } from "./views/dtc";
import { buildGraphScene, type GraphAlgorithm } from "./views/graph";
import { buildMatrixScene } from "./views/matrix";

declare global {
  interface Window {
    __EM_TEST_DATA__?: EmDocument;
  }
}

// ---------- state ----------
// THE ACTIVE GRAPH. Still a single module-level pointer, still read directly by
// every consumer in this file — which is exactly why the mono→multi jump (ET1)
// did not require touching them: `emtree` below owns *which* document this is,
// and nothing else had to learn that there is more than one.
let store: DocumentStore | null = null;
// The workspace: every open graph, one active (see emtree.ts). The active slot's
// store IS `store` above; there is no second copy of the truth.
const emtree = new EMTree();
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
// DP-82 · the central area's MODE — the single decider of what the middle shows.
// `matrix`/`graph` are canvas projections and keep `view` in step (the canvas
// sub-view to restore when leaving narrative); `narrative` is a first-class mode,
// not a separate overlay toggle. `setMode` is the one entry point; the old
// `view`+`narrativeOpen` pair collapsed into this. Extension seam: add a token to
// CentralMode and a branch in `setMode`/the render dispatch — nothing else.
let centralMode: CentralMode = "matrix";
/** The modes the central-area selector offers, in order. Add `table`/`dtc` here
 *  (and a branch in `setMode`) when they land — the seam, not the feature. */
const CENTRAL_MODES: CentralMode[] = [
  "matrix",
  "graph",
  "dtc",
  "multigraph",
  "narrative",
];
// Graph-view layout: chosen algorithm + manual position overrides (drags /
// liquid clustering). Overrides persist across rebuilds in-session and are
// cleared on a fresh Layout, an algorithm change, or a new/loaded document.
let graphAlgorithm: GraphAlgorithm = "layered";
const graphOverrides = new Map<string, { x: number; y: number }>();
// WIN2 · the DTC projection keeps its OWN drag overrides: the same node sits at
// different places in the two projections, so one shared map would teleport a
// node in Graph view because it was arranged in DTC.
const dtcOverrides = new Map<string, { x: number; y: number }>();
// MULTIGRAPH · its own drag map, for the same reason: the node sits elsewhere in
// each projection.
const multigraphOverrides = new Map<string, { x: number; y: number }>();
/** The manual-drag map of the current canvas projection, or null where drags are
 *  not overrides at all (Matrix stores positions in the document layout). */
function canvasOverrides(): Map<string, { x: number; y: number }> | null {
  if (view === "graph") return graphOverrides;
  if (view === "dtc") return dtcOverrides;
  if (view === "multigraph") return multigraphOverrides;
  return null;
}
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
// WIN2b · the camera belongs to a (WINDOW, mode) pair, not to the app. Two graph
// windows in the same projection keep their own pan and zoom, and coming back to
// a window returns you where you left it. Keyed lazily: a window that never
// showed a projection has no camera to restore, which is exactly the signal
// "frame it on arrival" (see framedViews).
const winViewports = new Map<string, Viewport>();
/** (window, mode) pairs already framed for the CURRENT document — reset whenever
 *  the document changes, so every window re-frames on the new graph. */
const framedViews = new Set<string>();
/**
 * WIN7 · (window, mode) pairs whose camera the USER has moved — a pan, a zoom, a
 * fit they asked for. The app may re-frame a view it framed itself (see
 * `drawTile`: an area that changes size was framed for a rectangle it no longer
 * has, and a graph left as a speck in the corner is an area showing nothing);
 * it must never re-frame one somebody aimed by hand.
 */
const touchedViews = new Set<string>();
/** The size each secondary area's camera was last framed for. */
const framedSizes = new Map<string, string>();

/** Record that this window's camera is now the user's, not the app's. */
function markCameraTouched(winId: string, v: ViewKind): void {
  touchedViews.add(viewportKey(winId, v));
}
function viewportKey(winId: string, v: ViewKind): string {
  return `${winId}::${v}`;
}
function viewportFor(winId: string, v: ViewKind): Viewport {
  const key = viewportKey(winId, v);
  let vp = winViewports.get(key);
  if (!vp) {
    vp = new Viewport();
    winViewports.set(key, vp);
  }
  return vp;
}
/** Forget every window's camera — a different document needs different framing
 *  in every window, not the previous graph's pan and zoom. */
function resetWindowCameras(): void {
  winViewports.clear();
  framedViews.clear();
  touchedViews.clear();
  framedSizes.clear();
}
let hoverId: string | null = null;
let selectedId: string | null = null;
// Connector (edge) hover/selection is separate from node selection: the
// selected edge is stored as the document edge (survives scene rebuilds, and
// is what Delete removes); hover is a transient index into the current scene.
let selectedEdge: EmEdge | null = null;
let hoverEdgeIdx: number | null = null;
let placingType: string | null = null;
// for DTC palette items: the specific kind (photo, mesh, …) to stamp on the
// created node's data.dtc_kind; null for non-DTC placement.
let placingKind: string | null = null;
// true when the DTC item being placed is a RESOURCE (output → a ResourceNode) — so
// placeNode also stamps data.resource_type.
let placingIsResource = false;
let connect: ConnectDrag | null = null;
/** graph-view "liquid" filters: hidden node / edge types */
// hidden type sets are DERIVED from the visible circles of the CURRENT view
// (recomputeHiddenFromCircles); they are what buildScenes applies.
const hiddenNodeTypes = new Set<string>();
const hiddenEdgeTypes = new Set<string>();
// HDT-O-profile node types are ALWAYS hidden on the stratigraphic (EM-lens)
// canvas — they are graph-level metadata authored via the Canvas panel, kept in
// em.json for projection + the future HDT-O lens, never rendered as strat boxes.
// Derived from the datamodel (no hardcoded list); independent of the circles.
const HDTO_HIDDEN_TYPES = hdtoProfileTypes();
// "circles of detail" — which detail rings are visible, per view. Matrix and
// Graph keep independent visibility so each view has its own default depth.
const circleState: Record<ViewKind, Set<CircleKey>> = {
  matrix: defaultVisibleCircles("matrix"),
  graph: defaultVisibleCircles("graph"),
  dtc: defaultVisibleCircles("dtc"),
  multigraph: defaultVisibleCircles("multigraph"),
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
const inspector = document.getElementById("inspector")!;
const breadcrumb = document.getElementById("breadcrumb")!;
const edgeMenu = document.getElementById("edge-menu")!;
const toastEl = document.getElementById("toast")!;
const chronoBanner = document.getElementById("chrono-banner")!;
const btnMatrix = document.getElementById("btn-matrix") as HTMLButtonElement;
const btnGraph = document.getElementById("btn-graph") as HTMLButtonElement;
const btnNarrative = document.getElementById("btn-narrative") as HTMLButtonElement;
/** DP-82 · the central-area selector, one segment per CentralMode. A new mode
 *  adds its button here and a token to CENTRAL_MODES — `setMode` lights the right
 *  one from this map, so the active-state logic never grows a special case. */
const MODE_BUTTONS: Partial<Record<CentralMode, HTMLButtonElement>> = {
  matrix: btnMatrix,
  graph: btnGraph,
  narrative: btnNarrative,
};
const narrativeViewEl = document.getElementById("narrative-view")!;
const btnNarrativeEdit = document.getElementById(
  "btn-narrative-edit") as HTMLButtonElement;
const btnUndo = document.getElementById("btn-undo") as HTMLButtonElement;
const btnRedo = document.getElementById("btn-redo") as HTMLButtonElement;
const dirtyDot = document.getElementById("dirty-dot")!;
const sidePanel = document.getElementById("side")!;
const emtreeEl = document.getElementById("emtree") as HTMLDivElement;
// POL1: the always-present "+ epoch" for Matrix view. Declared up here with the
// other element refs because `updateToolbar` (much earlier in the file) toggles it.
const btnAddEpoch = document.getElementById("btn-add-epoch") as HTMLButtonElement;
const stratiminerEl = document.getElementById("stratiminer") as HTMLDivElement;
const nodelistEl = document.getElementById("nodelist")!;
const logpanelEl = document.getElementById("logpanel")!;

// EM-version pill → click for the version breakdown (config files + ontologies)
const verBtn = document.getElementById("em-version")!;
// Sits in the footer right after the "Extended Matrix" wordmark, so it reads
// "Extended Matrix 1.6" — the version alone, no redundant "EM" prefix.
verBtn.textContent = EM_VERSION;

// EMStudio app/build version (distinct from the EM language version above) —
// shown next to the header wordmark so testers know which build they're on.
const appVerEl = document.getElementById("app-version");
if (appVerEl) {
  appVerEl.textContent = __EMSTUDIO_VERSION__;
  appVerEl.title = `EMStudio ${__EMSTUDIO_VERSION__} — EM language ${EM_VERSION}`;
}

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
  // P4.3 · in a ROOM the endpoint is the hub, not the sidecar's host:port. Two
  // different destinations must not be shown by one label, or the footer says
  // where you are NOT connected.
  segs.push({
    k: sync.room ? "room" : "at",
    v: sync.room
      ? `${getSettings().sync.hubUrl.replace(/^https?:\/\//, "")}/${sync.room}`
      : getSyncUrl().replace(/^wss?:\/\//, ""),
  });
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
/**
 * MODES1 · the three operating modes, made explicit.
 *
 *   standalone — no live connection: a local .em.json, on your own
 *   sidecar    — connected to a HOST that owns the graph (Blender/EMtools)
 *   hub        — connected to an em-server (multi-user). NOT WIRED: the mode
 *                exists as a name and a menu entry, and says so. Showing it as
 *                available while faking a connection would be worse than not
 *                showing it.
 *
 * The mode is DERIVED (from the socket), never chosen directly — what is chosen
 * is the connection. It is read, not set.
 */
type SessionMode = "standalone" | "sidecar" | "hub";
let sessionMode: SessionMode = "standalone";

function setModeIndicator(mode: SessionMode | boolean): void {
  // back-compat with the boolean callers (the sync status handler)
  const m: SessionMode =
    typeof mode === "boolean" ? (mode ? "sidecar" : "standalone") : mode;
  sessionMode = m;
  const connected = m !== "standalone";
  modeIndicator.textContent = t(`mode.${m}`);
  modeIndicator.title = t(`mode.${m}Title`);
  sidecarDetail.classList.toggle("hidden", !connected);
  if (connected) renderSidecarDetail();
  else {
    hostInfo = {};
    sidecarDetail.innerHTML = "";
  }
  // MENU1 · reflect the active session mode in the Mode menu (a leading ✓).
  document.getElementById("btn-mode-standalone")
    ?.classList.toggle("mode-active", m === "standalone");
  document.getElementById("btn-mode-sidecar")
    ?.classList.toggle("mode-active", m === "sidecar");
  document.getElementById("btn-mode-hub")
    ?.classList.toggle("mode-active", m === "hub");
  renderSyncControl();
}

// ── MODES1 · the sync control ───────────────────────────────────────────────
//
// Four states, in the footer beside the mode, and only when there IS a channel
// to govern: a control over a connection that does not exist is furniture.
const syncControlEl = document.getElementById("sync-control")!;

function syncDirection(): SyncDirection {
  const raw = getSettings().sync.direction;
  return (SYNC_DIRECTIONS as string[]).includes(raw) ? raw : "both";
}

function setSyncDirection(direction: SyncDirection): void {
  const s = getSettings();
  saveSettings({ ...s, sync: { ...s.sync, direction } });
  sync.setDirection(direction);
  renderSyncControl();
  logInfo(t("sync.dirLogged", { dir: t(`sync.dir.${direction}`) }));
}

const SYNC_GLYPHS: Record<SyncDirection, string> = {
  off: "⃠", send: "→", receive: "←", both: "⇄",
};

/**
 * P5 · does the ROOM let this client write?
 *
 * The server decides (`host_info.can_write`, from the role it resolved at the
 * door) and this is where the client believes it. A host that says nothing —
 * every EMtools pairing — is writable: the question only arises where roles do.
 */
function hubReadOnly(): boolean {
  return hostInfo.can_write === false;
}

/**
 * Make the session match what the room allows.
 *
 * Reuses the sync DIRECTION rather than inventing a lockdown: `receive` is
 * already "listen, do not send", it is already respected by every send path in
 * `sync.ts`, and a second mechanism for the same idea is a second thing to keep
 * right. What is added on top is that the control cannot be turned back on —
 * an affordance that is offered and then refused is worse than one that is
 * greyed out with a reason.
 */
function applyRoomPermission(): void {
  if (hubReadOnly()) {
    sync.setDirection("receive");
  } else {
    sync.setDirection(syncDirection());
  }
  renderSyncControl();
}

function renderSyncControl(): void {
  if (!syncControlEl) return;
  const connected = sessionMode !== "standalone";
  syncControlEl.classList.toggle("hidden", !connected);
  if (!connected) {
    syncControlEl.innerHTML = "";
    return;
  }
  const readOnly = hubReadOnly();
  const active: SyncDirection = readOnly ? "receive" : syncDirection();
  syncControlEl.innerHTML = "";
  if (readOnly) {
    // Said once, where the session's state is shown, and not as a toast that
    // scrolls away: "you are reading" is a property of this connection, not an
    // event that happened.
    const badge = document.createElement("span");
    badge.className = "sync-readonly";
    badge.textContent = t("room.readOnly");
    badge.title = t("room.readOnlyHint", {
      role: hostInfo.role ?? t("room.roleUnknown"),
    });
    syncControlEl.appendChild(badge);
  }
  const label = document.createElement("span");
  label.className = "sync-ctl-label";
  label.textContent = t("sync.label");
  // The hint is the whole reason the control has four states and not two, so it
  // travels with it instead of living in a manual nobody opens.
  label.title = t("sync.hint");
  syncControlEl.appendChild(label);
  for (const dir of SYNC_DIRECTIONS) {
    const b = document.createElement("button");
    b.className = "sync-ctl-btn" + (dir === active ? " on" : "");
    b.textContent = SYNC_GLYPHS[dir];
    b.title = `${t(`sync.dir.${dir}`)} — ${t(`sync.dirTitle.${dir}`)}`;
    b.dataset.dir = dir;
    if (readOnly && (dir === "send" || dir === "both")) {
      // sending is not this client's to choose here: the room refuses the op
      // anyway, and a button that produces a refusal is a button that lies
      b.disabled = true;
      b.title = t("room.readOnlyHint", {
        role: hostInfo.role ?? t("room.roleUnknown"),
      });
    } else {
      b.addEventListener("click", () => setSyncDirection(dir));
    }
    syncControlEl.appendChild(b);
  }
}

// The client is told what to do BEFORE any connection exists, so a stored
// choice is in force from the first frame rather than from the first click.
sync.setDirection(syncDirection());
setModeIndicator("standalone");

// ---------- theme (DARK1) ----------
// Applied BEFORE the first draw: `applyTheme` stamps `data-theme` for the CSS and
// sets the canvas palette for the renderer, which cannot read CSS variables.
// The stored preference wins; with none, `auto` follows the system.
applyTheme(storedMode());
const setThemeSel = document.getElementById("set-theme") as HTMLSelectElement;
setThemeSel.value = storedMode();
setThemeSel.addEventListener("change", () => {
  const mode = setThemeSel.value as ThemeMode;
  storeMode(mode);
  applyTheme(mode);
  // the canvas does not repaint itself, and the overview lives on its own canvas
  draw();
});
// While the preference is `auto`, follow the system live (matchMedia, not a poll).
watchSystemTheme(() => {
  setThemeSel.value = storedMode();
  draw();
});
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
  const row = (
    label: string,
    ver: string,
    srcTitle?: string,
    href?: string,
  ): void => {
    const r = document.createElement("div");
    r.className = "ver-row";
    if (srcTitle) r.title = srcTitle;
    // An ontology whose `source` is a real URL becomes a link to its reference
    // page; everything else stays text (POL3). The URL is NOT a hardcoded
    // name→URL map: it is the datamodel's own `source` field (invariant 1), so
    // adopting a new ontology release moves the link with the version instead of
    // leaving a stale table behind in the UI.
    const s = document.createElement(href ? "a" : "span");
    s.textContent = label;
    if (href && s instanceof HTMLAnchorElement) {
      s.href = href;
      s.target = "_blank";
      s.rel = "noopener noreferrer";
      s.className = "ver-link";
    }
    const v = document.createElement("b");
    v.textContent = ver;
    r.append(s, v);
    pop.appendChild(r);
  };
  sect("JSON config files");
  // The JSON configs are FILES vendored in this build, not documents on the web:
  // there is nothing to open, so they stay text.
  for (const c of b.configs) row(c.label, c.version);
  sect("Reference ontologies");
  for (const o of b.ontologies) row(o.name, o.version, o.source, o.href);
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

/**
 * WIN4 · the height the DOCKED window bar takes from the canvas.
 *
 * The bar is not an overlay any more: the canvas is exactly this much shorter,
 * so nothing the bar covers is content (the epoch bands are pinned to the top of
 * the matrix, and a floating bar sat on them). Measured rather than declared —
 * the bar wraps to two rows on a narrow window, and a hardcoded height would go
 * wrong precisely when it matters.
 */
function windowBarHeight(): number {
  const bar = document.getElementById("window-header");
  if (!bar || bar.classList.contains("hidden")) return 0;
  return bar.offsetHeight;
}

function viewSize(): { w: number; h: number } {
  // WIN4 · the CANVAS ELEMENT is the drawing area, and CSS gives it its box
  // (`top: var(--winbar-h)` — i.e. below the docked bar). Reading the element
  // rather than the wrapper means the two can never disagree about where the
  // drawing starts. Fall back through wrapper → window if it reports 0 during a
  // transient relayout, so fit() never collapses to the min-scale.
  const w = canvas.clientWidth || wrap.clientWidth || window.innerWidth || 800;
  const h =
    canvas.clientHeight ||
    Math.max(1, (wrap.clientHeight || 0) - windowBarHeight()) ||
    window.innerHeight ||
    600;
  return { w, h };
}

function resizeCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  // publish the bar height so the canvas AND the canvas-area overlays (filters,
  // chrono banner, add-epoch, drop hint, narrative) sit BELOW it — one
  // measurement, one source, and CSS does the placing.
  wrap.style.setProperty("--winbar-h", `${windowBarHeight()}px`);
  const { w, h } = viewSize();
  // only the backing store is set here: the element's CSS box is laid out by the
  // stylesheet, so a missed observer callback can no longer leave a canvas that
  // is the wrong SIZE on screen — just one frame at the wrong resolution.
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
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
  return inContext() ? contextViewport : viewportFor(activeWin().id, view);
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
      nameStatus, // NAME1: orange/red labels, one answer shared with the menu
      peerSelections: hubPeerSelections,   // P4.3 · awareness, never a lock
    },
    w,
    h,
  );
  overview.update(s, viewport(), w, h);
  drawTiles(); // WIN5 · the other areas show the same document, live
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
      // BUGFIX-PDG · a collapsed-to-tablet PDG has no box on the canvas — the
      // selection wash must NOT paint a phantom box at its layout rect (its
      // selection is the ring on the "PD" tablet, drawn by the renderer).
      if (!sn || sn.collapsed) continue;
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
  // AUX2 volatile overlay (screen space): a dashed accent-blue ring around every
  // mapped-but-not-baked node, so a volatile node is unmistakable on the canvas
  // regardless of its own colour — the SAME state the EM-Data table paints blue
  // (single source of truth: the VOLATILE_KEY marker read via isVolatile).
  if (store) {
    const vp = viewport();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.strokeStyle = "#4c8dff";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    for (const sn of s.nodes) {
      if (sn.collapsed || !isVolatile(store.node(sn.id))) continue;
      ctx.strokeRect(
        sn.x * vp.scale + vp.x - 3,
        sn.y * vp.scale + vp.y - 3,
        sn.w * vp.scale + 6,
        sn.h * vp.scale + 6,
      );
    }
    ctx.setLineDash([]);
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
  // VIEWER · the preview answers the same question the Inspector does ("what am
  // I looking at?"), so it is repainted wherever the Inspector is. A2 · the
  // annotator asks it too ("which picture am I annotating?"), and a window that
  // followed the selection only on a DOCUMENT change would sit on the wrong
  // image for the whole of the next gesture.
  renderViewer();
  renderAnnotator();
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
      onToggleFold: (gid) => requestFold(gid),
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
      onReorderPhase: (phaseId, dir) => {
        // Same shape as the epoch reorder: change the order, then a from-sketch
        // relayout so the sub-bands and their members follow. `reorderPhase`
        // refuses a dated phase (its date decides the stack), so a false here is
        // the model saying no, not a failure to report.
        if (store!.reorderPhase(phaseId, dir))
          void runLayout(false).then(() => select(phaseId));
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
      resolveAuthority: resolveAuthority,
      onCommand: (verb, target) => sendHostCommand(verb, target),
      commandsBlocked: commandsBlockedReason,
      onClearField: (nodeId, field) => {
        store!.clearField(nodeId, field);
        refreshInspector();
        buildScenes();
        draw();
      },
    },
    selectedEdge,
  );
}

// HDT-O authority autocomplete → em-bridge /resolve-authority (P1-D, offline).
// Fully graceful: any non-200 / 501 / network error yields [] so the inspector
// falls back to plain free-text URI entry.
async function resolveAuthority(
  term: string,
  facet: string,
): Promise<import("./types").AuthorityCandidate[]> {
  if (!term.trim()) return [];
  try {
    const url = `${await bridgeUrl()}/resolve-authority?term=${encodeURIComponent(
      term,
    )}&facet=${encodeURIComponent(facet)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const j = (await res.json()) as { candidates?: unknown };
    return Array.isArray(j.candidates)
      ? (j.candidates as import("./types").AuthorityCandidate[])
      : [];
  } catch {
    return [];
  }
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

/**
 * The connector legend — WHAT THE EDGES MEAN, drawn into a Graph window's own
 * resources panel.
 *
 * STEP A moved it here from a singleton `#legend` in the app-wide column. It was
 * appearing under the NARRATIVE panel too, where it explains nothing: a story
 * has no edges on screen. It belongs where edges are drawn, so it is part of the
 * graph provider's offer and of nothing else.
 */
function renderLegendInto(host: HTMLElement): void {
  const s = scene();
  if (!s) return;
  const types = new Set<string>();
  for (const e of s.edges) types.add(e.edge.edge_type ?? "edge");
  if (!types.size) return;
  const box = document.createElement("div");
  box.className = "win-legend";
  const head = document.createElement("div");
  head.className = "pal-sect";
  head.textContent = "Relations";
  box.appendChild(head);
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
    box.appendChild(item);
  }
  host.appendChild(box);
}

/** The scene changed, so the edge types on screen may have: repaint the panels
 *  that show them. */
function updateLegend(): void {
  renderResourcePanels();
}

function updateToolbar(): void {
  btnUndo.disabled = !store?.canUndo;
  btnRedo.disabled = !store?.canRedo;
  dirtyDot.classList.toggle("hidden", !store?.dirty);
  // POL1: the two canvas overlays that only mean something with a document.
  // The filter panel filters nothing without a graph, and an enabled control that
  // does nothing is a worse answer than an absent one; the epoch "+" belongs to
  // Matrix, which is the EM mode.
  btnAddEpoch.classList.toggle("hidden", !store || view !== "matrix");
  refreshFunnel();
  if (!store && filterPanelOpen()) closeFilterPanel();
  paintColumnToggles(); // the right handle appears with the side panel
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

// PD1 · toggle a group's fold, but REFUSE to collapse a ParadataNodeGroup that
// has no referent (no `has_paradata_nodegroup` pointing at it): a collapsed PDG
// becomes a tablet ON its referent, so without one the decorator would float
// orphaned. Every other group, and un-folding, passes straight through.
function requestFold(groupId: string): void {
  if (!store) return;
  const folding = !store.isFolded(groupId);
  const node = store.doc.graph.nodes.find((n) => n.id === groupId);
  if (folding && node?.node_type === "ParadataNodeGroup") {
    const hasReferent = store.doc.graph.edges.some(
      (e) => e.edge_type === "has_paradata_nodegroup" && e.target === groupId,
    );
    if (!hasReferent) {
      toast(
        "Il gruppo paradati non è collegato a nessun nodo: non può essere compattato.",
      );
      return;
    }
  }
  store.setFolded(groupId, folding);
}

// A context id is either a group (→ its members) or a DTC-output Resource (→ its
// upstream DTC genesis). Pick the right scene builder, reusing the same fold.
function contextSceneFor(id: string): Scene | null {
  if (!store) return null;
  const n = store.node(id);
  if (n && isGroupType(n.node_type)) return buildGroupScene(store.doc, id);
  return buildDtcGenesisScene(store.doc, id);
}

/** The DTC-output Resource reachable from a double-clicked node, or null:
 *  the node itself when it IS a DTC output (target of dtc_had_output), else the
 *  Resource it references via has_linked_resource (the RM / Document facet). */
function resolveDtcResource(nodeId: string): string | null {
  if (!store) return null;
  const edges = store.doc.graph.edges;
  const isDtcOutput = (id: string): boolean =>
    edges.some((e) => e.edge_type === "dtc_had_output" && e.target === id);
  if (isDtcOutput(nodeId)) return nodeId;
  for (const e of edges)
    if (e.edge_type === "has_linked_resource" && e.source === nodeId && isDtcOutput(e.target))
      return e.target;
  return null;
}

function rebuildContext(): void {
  if (!store) return;
  select(null);
  hoverId = null;
  contextScene = inContext()
    ? contextSceneFor(contextStack[contextStack.length - 1])
    : null;
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
  // P4.5 · count what is THERE, not what the file still remembers. A removal
  // leaves a tombstone in the document (the merge needs it), so after somebody
  // else deletes a node the raw length is one MORE than what anybody can see —
  // and a status bar that disagrees with the canvas is a status bar nobody
  // trusts. The buried ones are named separately when there are any, because
  // they are still in the file that gets saved.
  const liveNodeCount = store.liveNodes().length;
  const liveEdgeCount = store.liveEdges().length;
  const buried = g.nodes.length - liveNodeCount;
  info.textContent =
    `${title} — ${liveNodeCount} nodes, ${liveEdgeCount} edges` +
    (lanes ? `, ${lanes} epochs` : "") +
    (buried > 0 ? ` (+${buried} deleted)` : "");
}

// The visible subgraph after folding + the "circles of detail" filter — one
// filtered view shared by every projection. Structural nodes/edges (containers,
// epoch, membership) are never filtered (see filters.ts).
//
// MULTIGRAPH · `wholeGraph` is the mode that says "show me everything hanging
// off this graph": it keeps the graph-scope / HDT-O layer (the GraphNode and its
// paradata group carrying author, licence, embargo, site position) and leaves
// every ornament a real node instead of a badge. The rings still apply on top —
// they simply all start on in that view — so this is one filter with a switch,
// not a second, divergible reader.
function filteredView(opts: { wholeGraph?: boolean } = {}): {
  nodes: EmDocument["graph"]["nodes"];
  edges: EmDocument["graph"]["edges"];
  badges: Map<string, number>;
  adornments: Map<string, AdornmentBadge[]>;
} {
  const doc = store!.doc;
  const wholeGraph = !!opts.wholeGraph;
  const folded = new Set(doc.layout?.folded_groups ?? []);
  const foldedView = folded.size
    ? applyFolding(doc, buildMembership(doc), folded)
    : undefined;
  let vNodes = foldedView?.nodes ?? doc.graph.nodes;
  let vEdges = foldedView?.edges ?? doc.graph.edges;
  // P4.1 · a TOMBSTONED node is deleted, and a view must not show it. The mark
  // stays in the document (the merge needs it: "deleted" and "not yet known to
  // you" are different states), so the hiding happens HERE — at the one place
  // that decides what is on screen — and nowhere else.
  if (vNodes.some((n) => isRemoved(n as unknown as Record<string, unknown>))) {
    const dead = new Set(
      vNodes.filter((n) => isRemoved(n as unknown as Record<string, unknown>))
        .map((n) => n.id));
    vNodes = vNodes.filter((n) => !dead.has(n.id));
    vEdges = vEdges.filter((e) => !dead.has(e.source) && !dead.has(e.target));
  }
  // ALWAYS drop HDT-O-profile nodes (and any node the panel tagged with
  // data.hdto_role) + their incident edges, so graph-level HDT-O metadata never
  // clutters the stratigraphic canvas. The nodes remain in em.json (single
  // source of truth) — only rendering is filtered.
  const isHdto = (n: EmDocument["graph"]["nodes"][number]): boolean =>
    HDTO_HIDDEN_TYPES.has(n.node_type) ||
    !!(n.data as Record<string, unknown> | undefined)?.hdto_role;
  if (!wholeGraph && vNodes.some(isHdto)) {
    vNodes = vNodes.filter((n) => !isHdto(n));
    const keep = new Set(vNodes.map((n) => n.id));
    vEdges = vEdges.filter((e) => keep.has(e.source) && keep.has(e.target));
  }
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
  // BADGE1 · collapse ornament nodes (author/license/embargo) into badges on
  // their referent. Resolved from the FULL document edges (the ornament edges are
  // hidden by the `edges_author` ring, so the filtered edge list can't resolve
  // them), but only for ornament nodes still present in vNodes — so the
  // `authors_licenses` node ring, which drops those nodes above, turns the badges
  // off with them. The ornament nodes and their edges are then removed from the
  // VIEW (never a box, never an edge); em.json keeps both.
  const visibleIds = new Set(vNodes.map((n) => n.id));
  const adornments = adornmentBadges(vNodes, doc.graph.edges, visibleIds);
  // FUNNEL1 · add an ATTENUATED badge for each author/license/embargo a node does
  // NOT declare itself but INHERITS down the funnel (activity/epoch/canvas). The
  // node's own (explicit) badges are already present from adornmentBadges. This
  // resolves per node — em.json is untouched (nothing materialised).
  const normRule = (kind: string): string =>
    kind === "author_ai" ? "author" : kind;
  for (const n of vNodes) {
    if (!isStratigraphicType(n.node_type)) continue;
    const own = new Set((adornments.get(n.id) ?? []).map((b) => normRule(b.kind)));
    for (const rule of BADGE_RULES) {
      if (own.has(rule)) continue; // declared on the node → explicit badge exists
      const eff = resolveEffective(doc, n.id, rule);
      if (eff.value == null || eff.explicit) continue;
      const arr = adornments.get(n.id) ?? [];
      arr.push({ ornamentId: "", kind: rule, label: `${eff.value} · ${sourceLabel(eff.source)}`, inherited: true });
      adornments.set(n.id, arr);
    }
  }
  // BUGS-UI · the badge is a PREVIEW, not a replacement. An ornament that is a
  // MEMBER of a paradata group stays a REAL node inside that group — it is
  // paradata like the qualia beside it — so it can be seen, selected and
  // edited; only ornaments floating loose on the canvas collapse into their
  // badge (which is what BADGE1 was actually after: no stray box + edge next to
  // every node). The membership edge keeps drawing; the semantic
  // `has_author`/… edge stays folded into the badge either way.
  const pdgMembers = new Set<string>();
  for (const e of doc.graph.edges)
    if (e.edge_type === "is_in_paradata_nodegroup") pdgMembers.add(e.source);
  if (!wholeGraph) {
    vNodes = vNodes.filter(
      (n) => !isAdornmentNodeType(n.node_type) || pdgMembers.has(n.id),
    );
    vEdges = vEdges.filter((e) => !ADORNMENT_EDGE_TYPES.has(e.edge_type ?? ""));
  }
  return {
    nodes: vNodes,
    edges: vEdges,
    badges: foldedView?.badges ?? new Map<string, number>(),
    adornments,
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
  // WIN2 · the DTC projection reads the SAME filtered view (folding + circles
  // still apply) through the digital-twin-creation relations.
  scenes.dtc = buildDtcScene(fview.nodes, fview.edges, dtcOverrides);
  // MULTIGRAPH · the same layered projection as Graph, over the WHOLE view:
  // ornaments as nodes and the graph-scope layer included, so author, licence,
  // embargo and the site position are visible and selectable (and therefore
  // editable in the Inspector) instead of living only in a side panel.
  scenes.multigraph = buildGraphScene(doc, filteredView({ wholeGraph: true }), {
    algorithm: graphAlgorithm,
    overrides: multigraphOverrides,
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

/**
 * DP-82 · the ONE point that decides what the central area shows. `view` +
 * `narrativeOpen` collapsed into this: matrix/graph route to the canvas
 * projection (`applyCanvasView`), narrative shows the story overlay. Exactly one
 * mode is active at a time. A future `table`/`dtc` mode adds a token to
 * `CentralMode` and a branch HERE — the single extension seam.
 */
function setMode(m: CentralMode): void {
  centralMode = m;
  const narrative = m === "narrative";
  // One selector segment active at a time — derived from CENTRAL_MODES, so a new
  // mode needs no new toggle line here.
  for (const mode of CENTRAL_MODES)
    MODE_BUTTONS[mode]?.classList.toggle("active", mode === m);
  // WIN2 · the mode belongs to the WINDOW and never moves the leader chip: the
  // workspace changes only when the user picks one. A Canvas workspace showing
  // DTC — or a narrative, after a transform — is a legitimate arrangement.
  const win = activeWin();
  if (!narrative && win.type === "graph") setWinMode(win, m);
  updateWindowHeader();
  // The narrative overlay's visibility IS "the mode is narrative" (this replaced
  // the separate `narrativeOpen` flag — no second, divergible state).
  narrativeViewEl.classList.toggle("hidden", !narrative);
  // WIN5 · entering a CANVAS mode also puts the canvas back in front: the table
  // and doc surfaces belong to their window types, not to a mode.
  if (!narrative && win.type === "graph") applyWindowSurface("graph");
  // HDR1 · the "Edit" affordance does NOT come back to the master header here.
  // Writing is a mode of a NARRATIVE WINDOW (the ✎ toggle in that window's
  // header, `buildAreaHeader`), and the master header belongs to no window — an
  // Edit button there could not say which narrative it edited. The element below
  // stays in the DOM, permanently hidden, as the handler owner: same arrangement
  // as #btn-fit / #btn-layout / #graph-layout, which the window header mirrors.
  // NARRWS1/PALETTE1 · the left palette is PER-MODE and PER-WINDOW, and it is
  // only there at all when you have opened it (Tools ▸ Palette).
  if (narrative) {
    // keep `view` (matrix/graph) as the canvas sub-view to restore on the way back.
    // NARR1 · entering narrative with no story yet → scaffold one from the graph
    // (a chapter per epoch, ordered + anchored, canonical intro). Idempotent:
    // scaffoldNarrativeFromGraph is a no-op when a narrative already exists, so a
    // written story is never disturbed.
    if (store) {
      const nid = scaffoldNarrativeFromGraph(store);
      if (nid) selectedNarrativeId = nid;
    }
    refreshNarrativeView();
    return;
  }
  // <extension seam> a `table`/`dtc` mode would branch above this line.
  applyCanvasView(m); // m is matrix | graph
}

/** A canvas view IS a central mode — back-compat entry for the many callers that
 *  ask for a specific canvas projection (viewState restore, boot, drops). */
function setView(v: ViewKind): void {
  setMode(v);
}

/** WIN2 · the view a LOADED document asks for. An arriving document must not
 *  seize the window's mode: a graph window left in DTC keeps showing the DTC
 *  projection of whatever is opened next — that is what makes the mode belong to
 *  the window. Only the two stratigraphic projections trade places on load. */
function setViewOnLoad(v: ViewKind): void {
  const win = activeWin();
  if (win.type === "graph" && winMode(win) === "dtc") {
    setMode("dtc");
    return;
  }
  setView(v);
}

/** Switch the canvas projection (matrix ↔ graph): per-view viewport, circles of
 *  detail, scene rebuild and fit. Called by `setMode` for the two canvas modes. */
function applyCanvasView(v: ViewKind): void {
  const changed = view !== v;
  view = v;
  // (selector "active" state is set by setMode, from CENTRAL_MODES; the layout
  // controls are per-mode and live in the window header — updateWindowHeader.)
  // WIN3 · the left panel's CONTENT follows the mode (DTC offers the DTC chunks,
  // not the stratigraphic types), so a mode change rebuilds it.
  if (changed) renderResourcePanels(); // the offer follows the mode
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
  } else if (v === "dtc" && (scenes.dtc?.nodes.length ?? 0) === 0) {
    // An empty canvas has to say WHY: this graph cites no digital-twin chain,
    // which is a fact about the document, not a failure of the view.
    info.textContent = t("dtc.empty");
  } else {
    updateInfo();
  }
  updateLegend();
  // The "+ epoch" overlay is Matrix-only, so switching view has to re-evaluate it.
  updateToolbar();
  // WIN2b · frame this projection the FIRST time this window shows it (for this
  // document), then leave the camera alone: switching mode or window and coming
  // back must return you where you were, not re-fit under your hands.
  const key = viewportKey(activeWin().id, v);
  if (framedViews.has(key)) draw();
  else {
    framedViews.add(key);
    fit();
  }
}

/** A slot's label: the document's own name if it declares one, else the source. */
function slotNameFor(d: EmDocument, sourceName: string): string {
  const g = d.graph as Record<string, unknown>;
  const declared = (g["name"] as string | undefined)?.trim();
  if (declared) return declared;
  // Strip the extension from a file name — "TempluMare.em.json" reads better as
  // "TempluMare" in a list of open graphs.
  return sourceName.replace(/\.(em\.json|json|graphml|xlsx)$/i, "");
}

/**
 * Wire a store's listeners. Called once per slot, at load.
 *
 * Per SLOT and not per activation: a listener added on every switch would fire
 * as many times as the graph had been activated, so one edit would rebuild the
 * scene five times and push five ops down the sync channel.
 */
function wireStore(s: DocumentStore): void {
  s.onChange(() => {
    // Guard: a background slot must not redraw the canvas. Today only the active
    // store is ever mutated (edits go through the active document), but the sync
    // channel and a future aux bake could touch another one, and the symptom of
    // that would be the canvas flickering to a graph nobody selected.
    if (s !== store) return;
    recomputeHiddenFromCircles(); // keep hidden sets in sync with new types
    refreshNameStatus();          // NAME1: label colours follow the graph
    buildScenes();
    if (filterPanelOpen()) renderCirclesPanel(); // refresh circle counts
    if (inContext()) {
      contextScene = contextSceneFor(contextStack[contextStack.length - 1]);
    }
    updateInfo();
    updateLegend();
    updateToolbar();
    refreshInspector();
    renderViewer();           // VIEWER · it follows the selection, like the Inspector
    renderAnnotator();        // A2 · and so does the annotator: same picture rule
    refreshNarrativeView();   // embeds are references: a graph edit shows here
    nodeList.refresh();
    refreshEMTree();          // node/edge counts and the dirty dot live there
    renderEmData();           // every mounted EM-Data table is a live view of it
    refreshTileSurfaces();    // WIN7 · and so is every secondary area
    draw();
  });
  // forward local graph mutations to a connected peer (op-log, ADR-002 §2).
  // Remote-applied ops don't re-emit (DocumentStore suppresses), so no echo.
  s.onOp((op) => {
    if (s !== store) return;
    // P4.3 · a ROOM speaks per-field CRDT operations; a sidecar speaks the
    // store's own op shape. One writing path, two vocabularies at the door —
    // and the translation happens once, where the door is.
    if (sync.room) hubSendLocal(op);
    else sync.sendOp(op);
  });
}

/**
 * Make a slot the active graph.
 *
 * This is the ONE place where "which graph?" changes, and the whole ET1 design
 * rests on that: `store` is reassigned here and every consumer reads it directly,
 * so none of them needed to learn about slots.
 *
 * View state travels WITH the slot (`graphOverrides`, the current view, collapsed
 * phase lanes) — swapped out on the way out and in on the way in. Without that,
 * switching tabs would silently discard the user's manual drags, which is the
 * first thing anyone would notice and the last thing they would suspect.
 *
 * `rebuildOnly` is set by `loadDocument`, which does its own logging and its own
 * layout decision afterwards; a plain switch does neither.
 */
function activateSlot(id: string, opts: { rebuildOnly?: boolean } = {}): void {
  const outgoing = emtree.active();
  const target = emtree.get(id);
  if (!target) return;

  // Park the outgoing slot's view state — unless the outgoing slot IS the target
  // (loadDocument's first activation, where `add` already made it active).
  if (outgoing && outgoing.id !== id) {
    // The cameras parked here are the ACTIVE window's (WIN2b): the other windows
    // re-frame on arrival, which is what they would need anyway on a document of
    // a different size. Only projections actually shown have one.
    const winId = activeWin().id;
    const camera: SlotViewState["camera"] = {};
    for (const v of ["matrix", "graph", "dtc", "multigraph"] as ViewKind[]) {
      const vp = winViewports.get(viewportKey(winId, v));
      if (vp) camera[v] = { x: vp.x, y: vp.y, scale: vp.scale };
    }
    outgoing.viewState = {
      view,
      graphOverrides: new Map(graphOverrides),
      phasesCollapsed: new Set(phasesCollapsed),
      camera,
    };
  }
  emtree.setActive(id);

  store = target.store;
  currentFilePath = target.path; // desktop: Save writes back to THIS slot's file

  // Transient state that belongs to the app, not to a graph: a selection or a
  // hypergraph breadcrumb from another document means nothing here.
  contextStack = [];
  contextScene = null;
  hoverId = null;
  selectedId = null;
  matrixViewLayout = null; // derived from filters; recomputed for this document
  resetWindowCameras(); // every window re-frames on the incoming document

  graphOverrides.clear();
  for (const [nodeId, position] of target.viewState.graphOverrides) {
    graphOverrides.set(nodeId, position);
  }
  // DTC / multigraph drags are not parked per slot (yet): another document's
  // substrate has other node ids, so carrying them over would place nothing and
  // confuse much.
  dtcOverrides.clear();
  multigraphOverrides.clear();
  phasesCollapsed.clear();
  for (const epoch of target.viewState.phasesCollapsed) {
    phasesCollapsed.add(epoch);
  }

  recomputeHiddenFromCircles(); // derive hidden types for this document
  buildScenes();
  select(null);
  nodeList.refresh();
  updateToolbar();
  refreshInspector();
  refreshNarrativeView();
  refreshEMTree();
  selectedNarrativeId = null; // a chapter selection belongs to its document
  if (!opts.rebuildOnly) {
    // A switch restores the view the slot was left in; a load lets
    // `loadDocument` decide (it may need a fresh em-core layout first).
    setViewOnLoad(target.viewState.view);
    // Restore this graph's camera, or frame it if it has never been shown. The
    // viewports are shared per view KIND, so without this the incoming graph
    // inherits the outgoing one's pan and zoom — a 17-node document arriving at a
    // 215-node document's scale is off screen, and looks like a broken switch.
    const camera = target.viewState.camera[target.viewState.view];
    if (camera) {
      const vp = viewportFor(activeWin().id, target.viewState.view);
      vp.x = camera.x;
      vp.y = camera.y;
      vp.scale = camera.scale;
      framedViews.add(viewportKey(activeWin().id, target.viewState.view));
      draw();
    } else {
      fit();
    }
    updateBreadcrumb();
    logInfo(t("toast.activeGraph", { name: slotLabel(target) }));
  }
}

/**
 * MULTIGRAPH · open a PROJECT — a container with 1..N graphs plus its shelf.
 *
 * An em.json is always a container now, and a legacy single-graph file is a
 * container-of-one, so this is the one door every open goes through. Each member
 * becomes a SLOT (which `loadDocument` was already doing per document — ET1), and
 * the shelf becomes the project shelf shared by all of them.
 *
 * `additive` is the offline "integrate later": with `false` this replaces the
 * workspace (opening a project), with `true` it folds the incoming project into
 * the open one, merging shared nodes by UUID.
 */
function loadContainerDocument(
  doc: unknown,
  sourceName: string,
  path: string | null = null,
  opts: { additive?: boolean } = {},
): void {
  const parsed = parseContainer(doc);
  if (!parsed.members.length && !parsed.shelf) {
    info.textContent = `${sourceName}: ${parsed.warnings[0] ?? "not an .em.json document"}`;
    logError(`${sourceName}: ${parsed.warnings[0] ?? "not an .em.json document"}`);
    return;
  }
  for (const w of parsed.warnings) toast(w);

  if (opts.additive) {
    // Integrate later: the graphs already open stay, the incoming ones are added
    // (or merged into their namesake by UUID).
    const mine = {
      members: emtree.slots.map((s) => ({
        id: String((s.store.doc.graph as Record<string, unknown>).graph_id ?? s.id),
        doc: s.store.doc,
      })),
      shelf: projectShelfSection(),
    };
    const before = new Set(mine.members.map((m) => m.id));
    const report = mergeContainers(mine, parsed);
    // Members that were merged in place: their store already holds the new
    // nodes (we mutated the very document the store owns), so it only has to be
    // told to redraw.
    for (const slot of emtree.slots) slot.store.touch();
    for (const member of mine.members) {
      if (before.has(member.id)) continue;
      adoptMemberAsSlot(member, sourceName, null);
    }
    if (mine.shelf) adoptProjectShelf(mine.shelf);
    toast(t("container.merged", {
      added: String(report.addedGraphs.length),
      merged: String(report.mergedGraphs.length),
      nodes: String(report.mergedNodes),
    }));
    // P3 · the silence becomes a list. A dated merge still overwrites somebody,
    // and the person who pressed "integrate" is the one who has to know.
    if (report.conflicts.length) {
      for (const c of report.conflicts) {
        logInfo(t("conflict.logged", {
          node: c.nodeId,
          winner: c.winner.by ?? "?", winnerAt: c.winner.at ?? "?",
          loser: c.loser.by ?? "?", loserAt: c.loser.at ?? "?",
          reason: c.reason,
        }));
      }
      showConflictPanel(report.conflicts);
    } else {
      showConflictPanel([]);
    }
    // integrating somebody else's graphs is a new version of the project
    refreshEMTree();
    draw();
    projectContainer();        // settles the new version and shows it
    return;
  }

  // Opening a project: the members become the workspace.
  // P3 · and its version comes with it. Only on a full open: integrating
  // somebody else's project does NOT adopt their revision number — the history
  // being counted is this project's, not theirs.
  projectVersion = parsed.version;
  updateVersionIndicator();
  showConflictPanel([]);       // a new project, not the last one's conflicts
  let activeSlotId: string | null = null;
  for (const member of parsed.members) {
    const slot = adoptMemberAsSlot(member, sourceName, path);
    if (member.id === parsed.activeGraphId) activeSlotId = slot.id;
  }
  if (parsed.shelf) adoptProjectShelf(parsed.shelf);
  if (activeSlotId) activateSlot(activeSlotId, { rebuildOnly: false });
  if (parsed.members.length > 1) {
    toast(t("container.opened", { n: String(parsed.members.length) }));
  }
  refreshEMTree();
}

/**
 * MULTIGRAPH · the project shelf as a container member.
 *
 * SHELF1 keeps the shelf in `shelf.ts` (and in localStorage between reloads).
 * The container is where it BELONGS: one shelf per project, travelling in the
 * project's own file, shared by every graph in it — which is the answer to "many
 * shelves" that the design note asks for. localStorage stays as the convenience
 * that survives a reload; the file is the save.
 */
function projectShelfSection(): Record<string, unknown> | null {
  if (!shelfEntries().length) return null;
  return shelfToDocument().graph as Record<string, unknown>;
}

function adoptProjectShelf(section: Record<string, unknown>): void {
  const res = loadShelfDocument({
    header: { format: "em.json", version: "1.0" },
    graph: section,
  });
  if (!res.ok) {
    toast(t("shelf.notAShelf"));
    return;
  }
  renderShelf();
}

/** One container member → one workspace slot, through the door every document
 *  already uses (so epoch paradata, wiring and layout behave identically). */
function adoptMemberAsSlot(
  member: { id: string; doc: EmDocument },
  sourceName: string,
  path: string | null,
) {
  loadDocument(member.doc, member.id || sourceName, path);
  return emtree.active()!;
}

function loadDocument(
  d: EmDocument,
  sourceName: string,
  path: string | null = null,
): void {
  if (!d?.graph?.nodes) {
    info.textContent = `${sourceName}: not an .em.json document (missing graph.nodes)`;
    logError(`${sourceName}: not an .em.json document (missing graph.nodes)`);
    return;
  }
  currentFilePath = path; // desktop: enables in-place Save; null in browser
  // QOL1 · remember this open (path for desktop reopen, name otherwise).
  addRecent({ path, name: path ? baseName(path) : sourceName }, Date.now());
  // Does the INCOMING doc already carry node positions? Capture this BEFORE
  // ensureAllEpochParadata (which adds positions for the boxes it creates) —
  // otherwise those few positions make the doc look "already laid out" and we
  // skip the em-core auto-layout, leaving every position-less node (e.g. a
  // whole Blender sync snapshot) unrendered. Only the boxes would show.
  const hadStoredPositions =
    Object.keys(d.layout?.positions ?? {}).length > 0;
  const loaded = new DocumentStore(d);
  // every epoch always carries its temporal ParadataNodeGroup — ensure it now,
  // silently (before the change/op listeners are wired) so it neither pushes to
  // a sync host nor lands on the undo stack.
  loaded.ensureAllEpochParadata();
  wireStore(loaded);
  // ET1: the document becomes a SLOT in the workspace, and `add` activates it.
  // Every entry point — Open, New, a drop, GraphML import, Blender sync,
  // StratiMiner — already came through here, so all of them get a slot from this
  // one line. (That closes the TODO SM1 left behind: a StratiMiner graph is now a
  // workspace slot rather than a document that replaced whatever was open.)
  const slot = emtree.add(loaded, slotNameFor(d, sourceName), path);
  activateSlot(slot.id, { rebuildOnly: true });
  chronoBannerDismissed = false; // re-evaluate chronology for the new document
  dropHint.classList.add("hidden");
  updateBreadcrumb();
  // Matrix needs stored node POSITIONS. A doc may carry a layout object with
  // NO usable positions — a fresh graph, or a Blender sync snapshot (its emjson
  // layout has no matrix coordinates). In that case DON'T fall back to Graph:
  // compute a fresh layout via em-core so the Matrix renders, then show it.
  // S6 — the load is the anchor of the activity log: what came in, from where,
  // which language version it declares, and what the document leaves unresolved.
  const declared = versionBanner(d);
  logInfo(
    `loaded "${sourceName}" — ${d.graph.nodes.length} nodes, ` +
      `${(d.graph.edges ?? []).length} edges` +
      (declared ? ` · ${declared}` : " · no version declared"),
  );
  selectedNarrativeId = null;
  const narratives = narrativesIn(d);
  if (narratives.length)
    logInfo(`${narratives.length} narrative(s) in this document — see the Narrative view`);
  refreshNarrativeView();
  const unresolved = documentDiagnostics(d);
  if (unresolved.length) {
    logWarn(
      unresolved
        .map((g) => `${g.records.length} ${g.label.toLowerCase()}`)
        .join(" · ") + " — see Document warnings above",
    );
  }
  if (hadStoredPositions) {
    // EM3 · the stored layout keeps its POSITIONS (user intent) but its SIZES are
    // re-asserted from the type by em-core. A document saved before a type's box
    // geometry existed — a pre-EM2 file whose glyph nodes are 90×32 — would
    // otherwise keep drawing the old box until somebody pressed Layout, and the
    // connect handle would keep floating away from the glyph. Sizes are geometry,
    // not state: em-core owns them, and `reassert_sizes` is the only place that
    // decides one (no `box_for_node` re-implemented in TypeScript).
    //
    // Silent and non-blocking: nothing moves, so there is nothing to explain, and
    // a failure leaves the document exactly as it was on disk.
    void reassertSizes().finally(() => {
      // BUGS-UI · the geometry is only FINAL here (sizes re-asserted / layout
      // computed). Any camera framed earlier in the load framed a half-built
      // scene, so forget them: the first entry into each mode now frames the
      // document as it actually is. Without this the WIN2 per-instance camera
      // kept a stale frame — the previous document's zoom, or an empty one.
      resetWindowCameras();
      setViewOnLoad(scenes.matrix ? "matrix" : "graph");
    });
  } else {
    logInfo("no stored positions — computing a fresh layout via em-core");
    void runLayout(true)
      .then(() => {
        resetWindowCameras(); // frame the FINISHED layout, not the empty scene
        setViewOnLoad("matrix");
        fit();
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        info.textContent = `auto-layout failed: ${msg}`;
        logError(`auto-layout failed: ${msg}`);
        resetWindowCameras();
        setViewOnLoad(scenes.matrix ? "matrix" : "graph");
      });
  }
  refreshLogPanel();
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
    // Every open goes through the container door: a project opens as its graphs,
    // and a legacy single-graph file as a container-of-one.
    loadContainerDocument(JSON.parse(t), file.name);
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
  // A default epoch, because in EM an epoch is the CONTAINER a unit goes into:
  // without one the palette accepts a click and nothing can be placed, which
  // reads as a broken tool rather than as a missing prerequisite (E.D., from real
  // use). "Epoch 1" is a starting point, not a claim — it carries no dates.
  //
  // Only for a NEW document, and only in EM mode. `loadDocument` on an empty doc
  // has no stored positions, so it runs a fresh layout and lands in Matrix — the
  // EM mode — every time; a graph-mode user who wants no lanes can delete it,
  // which is one gesture, whereas discovering you need one is not.
  if (store && view === "matrix" && store.topEpochIds().length === 0) {
    addEpochEmMode();
  }
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
/**
 * MULTIGRAPH · the document to SAVE is the whole project.
 *
 * Until today Save wrote `store.toJSON()` — the ACTIVE slot. A workspace with
 * three graphs saved one of them, and the other two existed until the tab
 * closed: the kind of loss you discover a week later. Now every slot goes into
 * one container, with the project shelf as a member.
 *
 * A single graph still produces a container-of-one, which is the shape Heriverse
 * already reads — so nothing downstream had to change to gain this.
 *
 * P3 · building the project is also the moment its VERSION is settled, so the
 * two can never disagree: there is no path that writes a file without deciding
 * which revision that file is.
 */
function projectContainer(): ReturnType<typeof buildContainer> {
  // Each member goes through its own `store.toJSON()` and is parsed back.
  // That round trip is NOT waste: toJSON is where the save rules live — it
  // stamps `last_editor` and, crucially, DROPS the volatile (mapped-but-not-baked)
  // nodes (AUX2). Reading `store.doc` directly would have written them into the
  // project file, which is exactly what that rule exists to prevent.
  const graphs = emtree.slots.map((slot) => ({
    id: String((slot.store.doc.graph as Record<string, unknown>).graph_id ?? slot.id),
    doc: JSON.parse(slot.store.toJSON()) as EmDocument,
  }));
  const activeSlot = emtree.active();
  const container = buildContainer({
    graphs,
    shelf: projectShelfSection(),
    activeGraphId: activeSlot
      ? String((activeSlot.store.doc.graph as Record<string, unknown>).graph_id ?? activeSlot.id)
      : null,
  });
  // P3 · a save that CHANGES THE CONTENT is a new version of the project. The
  // digest decides, so pressing ⌘S on an unchanged project does not invent a
  // revision — the counter measures the work, not the keystrokes.
  projectVersion = bumpVersion(container, projectVersion);
  updateVersionIndicator();
  return container;
}

function projectDocumentText(): string {
  return JSON.stringify(projectContainer(), null, 1);
}



// ── P4.3 · the room client: EMStudio as a live participant ──────────────────
//
// The arc closes here. P4.1 gave the algebra, P4.1b made the stamping real,
// P4.2 put a relay on the other end that speaks the wire this app already
// spoke. What is left is the part only a client can do: join a room, keep its
// own base, and know when that base is too old to be replayed.
//
// The rebase is the piece worth reading twice. A hub compacts what everybody has
// passed; a client that was away can come back holding operations about things
// the room has already settled and forgotten. Replaying those would resurrect
// them. So the hub announces `gc_watermark`, and a client whose base is older
// re-syncs from the snapshot — the state of record — and re-sends whatever of
// its own work survived, as NEW operations stamped now. Nothing is dropped in
// silence, and nothing comes back from the dead.

/** The room's roster, and what everybody is looking at (P4.3). */
let hubPresence: PresenceState = emptyPresence();
/** node id → who else has it selected. Read by the renderer; never by a gate. */
let hubPeerSelections: Map<string, string[]> | null = null;
/** How far this client is synced: the instant of the last operation it applied.
 *  It is what a reconnect resumes from and what the rebase check compares. */
let hubBase: string | null = null;
/** The hub's compaction point, as announced. */
let hubWatermark: string | null = null;
/** Local operations sent and not yet acknowledged — the ones a re-sync has to
 *  re-send rather than lose. */
const hubUnconfirmed = new Map<string, HubOp>();
/** STEP 4 · after a re-sync, the unconfirmed work waiting for the room's
 *  document to land before it is re-applied here and re-sent there. */
let hubResyncPending: HubOp[] = [];
/** The last few awareness notes ("B updated dating after you"). */
const hubNotes: AwarenessNote[] = [];

function hubKey(op: HubOp): string {
  return `${op.op}|${String(op.node_id ?? op.id ?? "")}|${String(op.field ?? "")}|${String(op.ts ?? "")}`;
}

function noteHub(note: AwarenessNote): void {
  hubNotes.unshift(note);
  hubNotes.splice(24);          // a feed, not a log
  logInfo(note.text);
  renderHubRoster();
}

/** Send one local change to the room, as the per-field operations the relay
 *  understands. The fields (and their clocks) come from the store, which
 *  stamped them — nothing is re-derived here. */
function hubSendLocal(op: GraphOp): void {
  const ops = opsForLocalChange(op as Parameters<typeof opsForLocalChange>[0]);
  for (const hubOp of ops) {
    hubUnconfirmed.set(hubKey(hubOp), hubOp);
    sync.sendCommand(wireEnvelope("op", hubOp as unknown as Record<string, unknown>));
  }
}

/**
 * Write one `update_field` operation into the local document, with ITS clock.
 *
 * Shared by the two paths that must produce exactly the same result: an edit
 * arriving from somebody else, and this client's own unconfirmed work being
 * re-applied on top of a re-synced document (STEP 4). Sharing it is the point —
 * a second implementation is how "the value came back but the emptying did not"
 * happens.
 *
 * A field that was EMPTIED goes through `crdtClearField`, which leaves the
 * tombstone. Writing `undefined` instead would drop the key, and a dropped key
 * says "I never had that" — which the merge is designed to overrule with the
 * other side's value. That is the resurrection this function exists to prevent.
 */
function hubWriteFieldLocally(op: HubOp): boolean {
  if (!store || op.op !== "update_field") return false;
  const nodeId = String(op.node_id ?? op.id ?? "");
  const node = store.node(nodeId);
  const field = String(op.field ?? "");
  if (!node || !field) return false;
  // through the store's remote path: `applyRemoteOp` does not re-stamp, so the
  // hand that made this edit stays the hand that made it (AUDIT1)
  const payload = JSON.parse(JSON.stringify(node)) as Record<string, unknown>;
  if (op.remove === true) crdtClearField(payload, field, { ts: op.ts, by: op.author });
  else crdtWriteField(payload, field, op.value, { ts: op.ts, by: op.author });
  store.applyRemoteOp({
    op: "update_node", node_id: nodeId,
    patch: { name: payload.name, description: payload.description,
             data: payload.data } as Partial<EmNode>,
  });
  return true;
}

/**
 * Apply an operation that arrived from the room, carrying ITS clock.
 *
 * **Every verb, live** (P4.5). Until now only `update_field` landed in real
 * time: a node or an edge somebody else created appeared at the next re-sync,
 * which made the structural graph a shared FILE rather than a shared canvas.
 * The CRDT already knew how to do all five (P4.1) — what was missing was this
 * wiring.
 *
 * `update_field` keeps its own path because it is the one that must go through
 * the field writer (clocks per field, tombstones per field, P4.1b) and because
 * it is the one that produces an awareness note naming who changed what. The
 * structural verbs go straight to `store.applyCrdtOp`, which is the same
 * algebra the relay and the library run — including the part that matters most:
 * a removal writes a TOMBSTONE, not a missing key.
 */
function hubApplyRemote(message: Record<string, unknown>): void {
  if (!store) return;
  const op = message as unknown as HubOp;
  const kind = String(op.op ?? "");

  if (kind === "update_field") {
    const node = store.node(String(op.node_id ?? op.id ?? ""));
    if (!hubWriteFieldLocally(op)) return;
    const who = hubPresence.members.find((m) => m.author === op.author)?.display
      ?? (op.author as string | null);
    noteHub(noteForRemoteOp(op, who, node?.name ? String(node.name) : null));
  } else if (kind === "add_node" || kind === "remove_node"
             || kind === "add_edge" || kind === "remove_edge") {
    // the name BEFORE the operation: after a `remove_node` there is a tombstone
    // and the note would have nothing to point at
    const subject = structuralSubject(op);
    const result = store.applyCrdtOp(message);
    if (!result.applied) {
      // not news: the room already knew, or this is older than what is here.
      // Said in the log rather than silently dropped, because "nothing
      // happened" and "it was refused" look identical on a canvas.
      logInfo(`${kind}: ${result.reason}`);
    } else {
      const who = hubPresence.members.find((m) => m.author === op.author)?.display
        ?? (op.author as string | null);
      noteHub(noteForStructuralOp(kind, subject, who, String(op.ts ?? "")));
    }
  }

  hubBase = String(op.ts ?? hubBase ?? "");
  sync.setSince(hubBase);
  buildScenes();
  draw();
  refreshInspector();
  nodeList.refresh();
  refreshEMTree();          // the node/edge counts are part of "it arrived"
}

/** What a structural operation is ABOUT, for the awareness feed. */
function structuralSubject(op: HubOp): string {
  const nodeId = String(op.id ?? op.node_id ?? "");
  const named = store?.node(nodeId);
  if (named?.name) return String(named.name);
  if (op.op === "add_node") {
    const node = (op as unknown as { node?: { name?: string; id?: string } }).node;
    if (node?.name) return String(node.name);
    if (node?.id) return String(node.id);
  }
  if (op.op === "add_edge" || op.op === "remove_edge") {
    const from = store?.node(String(op.source ?? ""))?.name ?? String(op.source ?? "");
    const to = store?.node(String(op.target ?? ""))?.name ?? String(op.target ?? "");
    return `${from} → ${to}`;
  }
  return nodeId;
}

/** The sentence for a structural operation somebody else made. */
function noteForStructuralOp(kind: string, subject: string, who: string | null,
                             at: string): AwarenessNote {
  const author = who || t("hub.somebody");
  const what = t(`hub.op.${kind}`, { subject });
  return { kind: "remote-edit", text: `${author} ${what}`, at };
}

/**
 * STEP 4 · put the unconfirmed work back, on top of the room's document.
 *
 * Called once the snapshot has been loaded, and doing both halves in this order
 * is the whole fix:
 *
 * 1. **re-apply locally** — with the operation's own clock, through the same
 *    writer the remote path uses, so an emptied field is emptied again (its
 *    tombstone, not a missing key) instead of coming back full from the room's
 *    older document;
 * 2. **re-send** — as new operations, stamped now, so the room converges to the
 *    same thing rather than to the state it had before this client reconnected.
 *
 * The operations this cannot re-apply locally (a node added while offline, an
 * edge) are still SENT, and counted in the note: the room takes them and the
 * next snapshot brings them back. That is a declared limit, not a silence —
 * `applyRemoteOp` speaks the store's vocabulary and the relay speaks per-field
 * CRDT, and widening that translation is P4.5, not a line here.
 */
function replayAfterResync(): void {
  if (!hubResyncPending.length) return;
  const pending = hubResyncPending;
  hubResyncPending = [];
  let reapplied = 0;
  for (const op of pending) {
    if (hubWriteFieldLocally(op)) reapplied += 1;
    hubUnconfirmed.set(hubKey(op), op);
    sync.sendCommand(wireEnvelope("op", op as unknown as Record<string, unknown>));
  }
  if (reapplied < pending.length) {
    noteHub({ kind: "resync", at: new Date().toISOString(),
              text: t("hub.resent.structural",
                      { n: String(pending.length - reapplied) }) });
  }
  buildScenes();
  draw();
  refreshInspector();
  nodeList.refresh();
}

/** The roster chip + the awareness map the canvas reads. */
function renderHubRoster(): void {
  hubPeerSelections = peerSelections(hubPresence);
  const chip = document.getElementById("hub-roster");
  if (!chip) return;
  const others = hubPresence.members.filter((m) => m.id !== hubPresence.me);
  const inRoom = hubPresence.members.length;
  chip.classList.toggle("hidden", !sync.room);
  chip.textContent = sync.room ? t("hub.roster", { n: String(inRoom) }) : "";
  chip.title = [
    sync.room ? `${t("hub.room")}: ${sync.room}` : "",
    ...hubPresence.members.map((m) =>
      `${m.id === hubPresence.me ? "▸ " : "  "}${m.display}` +
      (m.selection.length ? ` — ${m.selection.length} ${t("hub.selected")}` : "")),
    others.length ? "" : t("hub.alone"),
    hubNotes.length ? `\n${hubNotes.slice(0, 5).map((n) => `· ${n.text}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * Join a room on an em-server.
 *
 * The callbacks are where the client's whole behaviour lives, so they are worth
 * reading as a list: the snapshot decides the document, `host_info` decides
 * whether the local base is still usable, an op converges the graph, an
 * `op_result` that says `stale` becomes awareness rather than an error, and
 * presence is a roster nobody can turn into a lock.
 */
function connectToHub(url: string, room: string, token: string | null): void {
  sync.connectHub({ url, room, token, since: hubBase }, {
    // In a room a peer's selection is AWARENESS: it marks their node, it does
    // not move mine. (`onSelect` stays for the sidecar mirror, where following
    // IS the point — one person, two screens.)
    onSelect: () => { /* a room never moves your selection */ },
    onPeerSelect: (frame) => {
      hubPresence = reducePresence(hubPresence, { type: "select", ...frame });
      renderHubRoster();
      draw();
    },
    onOp: (op) => hubApplyRemote(op as unknown as Record<string, unknown>),
    onSnapshot: (doc) => {
      // A ROOM is a project: the relay sends a CONTAINER (P4.2 decided a room =
      // one em.json), so it is opened by the door that reads containers. Handing
      // it to the single-graph loader was the first thing that broke here — the
      // document arrived and nothing appeared, because it had no `.graph`.
      loadContainerDocument(doc, `${room} (hub)`);
      info.textContent = t("hub.joined", { room });
      // ASSETS · the object-store panel is gated on being IN a room, and joining
      // one is exactly the event that opens the gate. Measured live: the Assets
      // tab went on saying "standalone: there is no store to publish to" after
      // the room was joined, until something else happened to redraw it.
      renderStorage();
      // STEP 4 · and only NOW the work that was not confirmed before the
      // re-sync. The order is the fix: the snapshot the room sends was built
      // BEFORE it received these operations, so re-sending them without
      // re-applying them here would leave this screen showing the room's older
      // document — with an emptied field looking full again. The room converges
      // either way; the person watching does not.
      replayAfterResync();
    },
    onHostInfo: (info2) => {
      hostInfo = { ...hostInfo, ...info2 };
      renderSidecarDetail();
      // …and if it refuses something later, say so out loud (see onDenied).
      // P5 · the room said what this client may do. Believe it now, before the
      // first edit: discovering a role by having an operation refused shows an
      // editing UI that does not work, which reads as a broken app rather than
      // as a study somebody let you read.
      applyRoomPermission();
      // the same frame tells this client WHICH member it is — without that, the
      // roster cannot mark "you" and every halo would look like somebody else's
      hubPresence = reducePresence(hubPresence,
                                   { type: "host_info", ...(info2 as object) });
      const watermark = (info2 as Record<string, unknown>).gc_watermark as string | null;
      hubWatermark = watermark ?? null;
      const plan = planRejoin(hubBase, hubWatermark);
      if (plan.kind === "resync") {
        // the local history is older than what the room still remembers: it is
        // NOT replayed. The snapshot that follows is the truth, and the work
        // this client had not yet had acknowledged is re-sent as new operations,
        // stamped now — visible, not silently dropped.
        //
        // Held, not sent, until the snapshot has landed: see `replayAfterResync`.
        // Sending here and re-applying later would be two orders for the same
        // facts, and the one the screen shows would be the wrong one.
        const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
        hubResyncPending = stampForResend(hubUnconfirmed.values(), now);
        hubUnconfirmed.clear();
        hubBase = null;
        sync.setSince(null);
        noteHub({ kind: "resync", at: now,
                  text: t("hub.resynced", { n: String(hubResyncPending.length) }) });
      }
      renderHubRoster();
    },
    onPresence: (message) => {
      // `reducePresence` folds a FRAME (it switches on `type`); what arrives
      // here is the payload, because WIRE 2 hands the body to the callback and
      // keeps the envelope to itself. Naming the kind back is the whole
      // translation — without it the roster silently stayed empty, which is how
      // this was noticed.
      hubPresence = reducePresence(hubPresence, { type: "presence", ...message });
      renderHubRoster();
      draw();
    },
    onDenied: (info) => {
      // The room refused an operation, and said why. Told out loud: a refusal
      // that arrives and is dropped is indistinguishable from a message that
      // never arrived — the edit vanishes and the room looks broken.
      toast(String(info?.reason || t("room.denied")));
      if (info?.can_write === false) {
        // and if this is the first news that the room is read-only here, make
        // the session match rather than letting the next edit be refused too
        hostInfo = { ...hostInfo, can_write: false, role: info.role };
        applyRoomPermission();
      }
    },
    onOpResult: (message) => {
      const op = (message.op ?? {}) as HubOp;
      hubUnconfirmed.delete(hubKey(op));
      if (message.applied) {
        hubBase = String(op.ts ?? hubBase ?? "");
        sync.setSince(hubBase);
        return;
      }
      if (message.reason === "idempotent") return;   // nothing to say
      const node = store?.node(String(op.node_id ?? ""));
      noteHub(noteForStale(op, node?.name ? String(node.name) : null));
    },
    onReconnect: (attempt, delay) => {
      info.textContent = t("hub.reconnecting",
                           { n: String(attempt), s: String(Math.round(delay / 1000)) });
    },
    onStatus: (state) => {
      document.body.classList.toggle("sync-active", state === "open");
      setModeIndicator(state === "open" ? "hub" : "standalone");
      if (state === "open") info.textContent = t("hub.connected", { room });
      else if (state === "closed") {
        hubPresence = emptyPresence();
        renderHubRoster();
      }
    },
  });
}

// ── CMD1 · the command channel: EMStudio conducts, Blender is the 3D arm ────
//
// The affordance lives on the node it is about (Inspector); this is the part
// that talks. Three rules, and the third is the one that makes the feature
// trustworthy rather than merely working:
//
//  1. a command is an EXPLICIT act, so it is NOT gated by the sync direction
//     (turning the selection mirror off must not silently disable a button);
//  2. it IS gated by the host's CONSENT, which the host declares in `host_info`
//     — so the button greys out with a reason instead of failing after a click;
//  3. the result is merged as DATA (`addSubgraph`), with the stamps that came
//     with it: what Blender made is Blender's hand, not this session's.

/** Why a command cannot be sent right now, or null when it can. */
function commandsBlockedReason(): string | null {
  if (!sync.connected) return t("cmd.blocked.disconnected");
  if (!hostInfo.accepts_commands) return t("cmd.blocked.noConsent");
  return null;
}

/** Send a 3D command to the host and say, in the log, what was asked. */
function sendHostCommand(verb: string, target: string): void {
  const blocked = commandsBlockedReason();
  if (blocked) {
    toast(blocked);
    return;
  }
  const msg = buildCommand(verb as CommandVerb, target, {});
  if (!sync.sendCommand(msg)) {
    toast(t("cmd.blocked.disconnected"));
    return;
  }
  pendingCommands.set(msg.payload.cmd_id, { verb, target });
  logInfo(t("cmd.sent", { verb, target: nodeLabelFor(target) ?? target }));
  info.textContent = t("cmd.sent", { verb, target: nodeLabelFor(target) ?? target });
}

/** What we asked for, so the answer can be reported in those terms. */
const pendingCommands = new Map<string, { verb: string; target: string }>();

/**
 * The host answered. On success the DELTA is merged into the document the
 * command was about — that is what makes this a graph-first flow rather than a
 * remote control: the 3D was materialised over there, and what comes back is
 * the paradata chain, in the graph, saved with the project.
 */
function applyCommandResult(res: {
  cmd_id: string; ok: boolean;
  delta?: { nodes?: unknown[]; edges?: unknown[] };
  error?: string; repeated?: boolean; info?: Record<string, unknown>;
}): void {
  const asked = pendingCommands.get(res.cmd_id);
  pendingCommands.delete(res.cmd_id);
  const what = asked ? `${asked.verb} · ${nodeLabelFor(asked.target) ?? asked.target}` : res.cmd_id;
  if (!res.ok) {
    toast(t("cmd.failed", { what, error: res.error ?? "?" }));
    logError(t("cmd.failed", { what, error: res.error ?? "?" }));
    return;
  }
  const nodes = (res.delta?.nodes ?? []) as EmNode[];
  const edges = (res.delta?.edges ?? []) as EmEdge[];
  let added = { nodes: 0, edges: 0 };
  // The delta belongs to the graph the command was about. With one slot that is
  // the active store; with several, the one that HOLDS the target — otherwise a
  // proxy would land in whichever graph happened to be in front.
  const slot = asked
    ? emtree.slots.find((s) => s.store.node(asked.target)) ?? emtree.active()
    : emtree.active();
  if (slot && (nodes.length || edges.length)) {
    // `addSubgraph`: verbatim insert, ONE undo step, no re-stamping — the nodes
    // were made by the host and carry its hand (AUDIT1's rule for work that
    // arrives from elsewhere).
    added = slot.store.addSubgraph(nodes, edges);
  }
  buildScenes();
  draw();
  refreshInspector();
  nodeList.refresh();
  const msg = t(res.repeated ? "cmd.doneRepeat" : "cmd.done", {
    what, nodes: String(added.nodes), edges: String(added.edges),
  });
  toast(msg);
  logInfo(msg);
  info.textContent = msg;
}

// ── P3 · the project's revision ─────────────────────────────────────────────
//
// One project, one version — so it lives beside the workspace and not in a
// store: a DocumentStore holds ONE graph, and the version is a fact about all of
// them together.
let projectVersion: ProjectVersion | null = null;
/** The conflicts of the last integration, kept so the panel can be reopened. */
let lastMergeConflicts: Conflict[] = [];

/** "Progetto v3 (da sha256:…)" in the status bar, or nothing when the project
 *  has never been written. Discreet on purpose: it is a record, not a badge. */
function updateVersionIndicator(): void {
  const el = document.getElementById("project-version");
  if (!el) return;
  if (!projectVersion) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.classList.remove("hidden");
  el.textContent = `${t("version.project")} ${versionLabel(projectVersion)}`;
  const at = projectVersion.modified_at
    ? new Date(projectVersion.modified_at).toLocaleString()
    : "";
  el.title = [
    `${t("version.digest")}: ${projectVersion.id}`,
    projectVersion.was_revision_of
      ? `${t("version.wasRevisionOf")}: ${projectVersion.was_revision_of}`
      : "",
    at ? `${t("version.modifiedAt")}: ${at}` : "",
    t("version.hint"),
  ].filter(Boolean).join("\n");
}

/**
 * Pin the project: freeze it as the thing a citation can point at.
 *
 * The snapshot is a FILE, downloaded there and then — immutable by construction
 * rather than by promise, because later edits cannot reach into a file that has
 * already left. The DOI belongs to the Catalog; this is the stable thing it
 * would mint for.
 */
function pinProjectVersion(): void {
  if (!emtree.slots.length) {
    toast(t("version.pinEmpty"));
    return;
  }
  const doc = projectContainer();              // settles the version first
  if (!projectVersion) return;
  const snapshot = {
    id: projectVersion.id,
    pinned_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    version: projectVersion,
    document: doc,
  };
  const stem = defaultFileName().replace(/\.em\.json$/i, "").replace(/\.emj$/i, "");
  browserDownload(JSON.stringify(snapshot, null, 1),
                  `${stem}-v${projectVersion.number}.pinned.em.json`);
  logInfo(t("version.pinned", { v: String(projectVersion.number), id: projectVersion.id }));
  toast(t("version.pinned", { v: String(projectVersion.number), id: projectVersion.id }));
}

/**
 * P3 · the conflict panel — what used to be silence.
 *
 * A merge that resolves by date is still a merge that overwrote somebody: the
 * list says WHO overwrote WHOM and when, in that order, because that is the
 * sentence a person needs ("B (11:30) ha sovrascritto A (10:00) su US1"). It is
 * a REVIEWABLE NOTICE and not an error: nothing is blocked, and the panel can be
 * dismissed and reopened from the log.
 *
 * Each row offers "tieni la versione di A" — a revert of that one node to the
 * losing version, which the conflict carries with it (`loserPayload`). That
 * revert is MY edit, so it stamps my hand and now: the content is A's, the act
 * is mine, and both are true.
 */
function showConflictPanel(conflicts: Conflict[]): void {
  const host = document.getElementById("conflict-panel");
  if (!host) return;
  lastMergeConflicts = conflicts;
  const chip = document.getElementById("conflict-reopen");
  if (chip) {
    chip.classList.toggle("hidden", !conflicts.length);
    chip.textContent = conflicts.length
      ? t("conflict.chip", { n: String(conflicts.length) })
      : "";
    chip.title = t("conflict.chipTitle");
  }
  host.innerHTML = "";
  if (!conflicts.length) {
    host.classList.add("hidden");
    return;
  }
  const head = document.createElement("div");
  head.className = "conflict-head";
  const title = document.createElement("strong");
  title.textContent = t("conflict.title", { n: String(conflicts.length) });
  head.appendChild(title);
  const close = document.createElement("button");
  close.className = "conflict-close";
  close.textContent = "✕";
  close.title = t("conflict.close");
  close.addEventListener("click", () => host.classList.add("hidden"));
  head.appendChild(close);
  host.appendChild(head);

  const hint = document.createElement("div");
  hint.className = "conflict-hint";
  hint.textContent = t("conflict.hint");
  host.appendChild(hint);

  const when = (v: string | null): string =>
    v ? new Date(v).toLocaleString() : t("conflict.noStamp");
  const who = (v: string | null): string => v ?? t("conflict.noAuthor");

  const list = document.createElement("div");
  list.className = "conflict-list";
  for (const c of conflicts) {
    const row = document.createElement("div");
    row.className = "conflict-row";
    const line = document.createElement("div");
    line.className = "conflict-line";
    line.textContent = t("conflict.sentence", {
      winner: who(c.winner.by), winnerAt: when(c.winner.at),
      loser: who(c.loser.by), loserAt: when(c.loser.at),
      node: nodeLabelFor(c.nodeId) ?? c.nodeId,
    });
    row.appendChild(line);

    const meta = document.createElement("div");
    meta.className = "conflict-meta";
    meta.textContent = [
      t(`conflict.reason.${c.reason}`),
      c.fieldHint.length ? `${t("conflict.fields")}: ${c.fieldHint.join(", ")}` : "",
    ].filter(Boolean).join(" · ");
    row.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "conflict-actions";
    const reveal = document.createElement("button");
    reveal.className = "conflict-btn";
    reveal.textContent = t("conflict.reveal");
    reveal.addEventListener("click", () => revealFromWarning(c.nodeId));
    actions.appendChild(reveal);
    const keep = document.createElement("button");
    keep.className = "conflict-btn";
    keep.textContent = t("conflict.keepLoser", { who: who(c.loser.by) });
    keep.title = t("conflict.keepLoserTitle");
    keep.addEventListener("click", () => {
      if (revertToLoser(c)) {
        keep.disabled = true;
        keep.textContent = t("conflict.kept");
      }
    });
    actions.appendChild(keep);
    row.appendChild(actions);
    list.appendChild(row);
  }
  host.appendChild(list);
  host.classList.remove("hidden");
}

/** The name of a node, for a sentence — falls back to the id, never to nothing. */
function nodeLabelFor(nodeId: string): string | null {
  for (const slot of emtree.slots) {
    const node = slot.store.node(nodeId);
    if (node) return String(node.name || nodeId);
  }
  return null;
}

/** Put back the version that lost, for ONE node. Returns false if the node is
 *  no longer there (a project can move on between the merge and the click). */
function revertToLoser(c: Conflict): boolean {
  const payload = c.loserPayload as Record<string, unknown>;
  for (const slot of emtree.slots) {
    if (!slot.store.node(c.nodeId)) continue;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (k === "id") continue;
      patch[k] = v;
    }
    // The stamps in the payload are the LOSER's; the revert is my act, so
    // `updateNode` stamps my hand over them. Content theirs, decision mine —
    // both true, and neither invented.
    slot.store.updateNode(c.nodeId, patch as Partial<EmNode>);
    logInfo(t("conflict.revertLogged", { node: c.nodeId, who: c.loser.by ?? "?" }));
    return true;
  }
  toast(t("conflict.gone", { node: c.nodeId }));
  return false;
}

async function saveDocument(): Promise<void> {
  if (!store) return;
  if (isTauri()) {
    if (!currentFilePath) return saveAsDocument();
    try {
      await writeEmJson(currentFilePath, projectDocumentText());
      store.dirty = false;
      info.textContent = `saved ${baseName(currentFilePath)}`;
      updateToolbar();
    } catch (e) {
      toast(`save failed: ${e instanceof Error ? e.message : e}`);
    }
    return;
  }
  browserDownload(projectDocumentText(), defaultFileName());
  store.dirty = false;
  updateToolbar();
}

// Save As: on desktop prompt for a path and remember it; in a browser this
// is the same as Save (a download with a fresh name).
async function saveAsDocument(): Promise<void> {
  if (!store) return;
  if (isTauri()) {
    try {
      const path = await saveAsEmJson(projectDocumentText(), defaultFileName());
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

// QOL1 · reopen a recent file. A path-less recent (a browser drop) cannot be
// reopened by the sandbox; a path-bearing one reopens on the desktop and, if the
// file has since disappeared, is pruned from the list.
async function openRecentFile(r: RecentFile): Promise<void> {
  if (!r.path) {
    toast("Recente aperto per drag&drop: riaprilo trascinando di nuovo il file " +
          "(il browser non può riaprirlo per percorso).");
    return;
  }
  try {
    const res = await readEmJsonPath(r.path);
    if (!res) {
      toast("Riapertura per percorso disponibile solo nell'app desktop.");
      return;
    }
    if (!(await confirmLeaveSidecar("Opening a file"))) return;
    loadDocument(JSON.parse(res.text) as EmDocument, baseName(res.path), res.path);
  } catch {
    removeRecent(r.path);
    toast("Il file recente non è più leggibile — rimosso dai recenti.");
    renderEMTree(emtreeEl, emtree, emtreeHandlers, t);
  }
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
// WIN3 · the palette is rebuilt when the canvas projection changes, because its
// CONTENT is per-mode (DTC offers the DTC chunks, not the stratigraphic types).
// One factory, called again — not a second palette that could drift.
/** Every palette currently mounted — one per open panel. STEP A made the panel
 *  per-window, so there can be several, and the "what am I placing" highlight
 *  belongs to all of them. Cleared whenever the panels are rebuilt. */
const paletteUis: ReturnType<typeof buildPalette>[] = [];
function buildPaletteForMode(host: HTMLElement, win: Win): void {
  const ui = buildPalette(
  host,
  (t, kind, isResource) => {
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
    // toggle: same item again cancels. The key includes the DTC kind so two
    // DTC items of the same node_type toggle independently.
    const key = kind ? `${t}:${kind}` : t;
    const active = placingType === t && placingKind === (kind ?? null);
    placingType = active ? null : t;
    placingKind = active ? null : (kind ?? null);
    placingIsResource = active ? false : !!isResource;
    // STEP A · the placing type is a fact about the SESSION, not about one
    // panel: every mounted palette shows it, so two Graph windows with their
    // panels open never disagree about what you are holding.
    for (const p of paletteUis) p.setActive(placingType ? (placingKind ? key : t) : null);
    canvas.classList.toggle("placing", !!placingType);
    if (placingType) {
      const what = placingKind ?? placingType;
      hintBar.textContent = `Click the canvas to place a ${what} — Esc to cancel`;
      hintBar.classList.remove("hidden");
    } else {
      hintBar.classList.add("hidden");
    }
  },
  // The palette shows what THIS window can place. A graph window in DTC mode
  // offers the DTC glyphs, anywhere else the stratigraphic types (WIN3's
  // per-mode content, read from the WINDOW — in a tiled shell "the window's
  // projection" and "the app's view" are different things).
  { mode: winMode(win) },
  );
  paletteUis.push(ui);
}

// ── PALETTE1 · the palette is a PANEL you open ──────────────────────────────
//
// It used to be a fixed column, always there, showing one general offer for the
// whole workspace. Two things were wrong with that in a tiled shell: it cost the
// canvas its width whether or not you were placing anything, and "the types you
// can place" is a fact about a WINDOW — the focused one — not about the app.
//
// So: one palette, opened and closed from Tools, showing the types of the window
// that has the focus. Closed, the column is gone and the canvas has the space.
// The drop itself is untouched (DND1/WIN6: every area accepts a drop and places
// in its own camera), and so is the filter box at the top.

/**
 * ─────────────── STEP A · the RESOURCES panel, anchored to its window ─────────
 *
 * The panel used to belong to whichever window had the FOCUS: it lived inside
 * `#canvas-wrap`, so moving the mouse to another area took it away and moving
 * back brought it out again. It flickered, and worse, it was never really the
 * panel *of* anything — you opened it on the Graph and it followed you to the
 * table.
 *
 * It is a panel of a WINDOW INSTANCE now. It is built into that window's own
 * area, focused or not; it stays put when the pointer leaves; it closes only
 * from its own chevron `‹` or from Tools. Two Graph windows side by side each
 * have their own, independently.
 *
 * WHO has one is a REGISTRY, not a condition scattered through the code — and it
 * decides the CONTENTS too, because "what can this window offer" is not always
 * "the node types": a Graph offers the stratigraphic palette, a Narrative offers
 * the blocks of a story. A window type with no entry here has no panel and no
 * chevron, which is why a Tabular or an Inspector shows neither.
 */
interface ResourceProvider {
  /** Fill `host` with this window's offer. */
  render: (host: HTMLElement, win: Win) => void;
}

const RESOURCE_PROVIDERS: Partial<Record<WindowType, ResourceProvider>> = {
  // the 46 stratigraphic types — or, in DTC Mode, the DTC glyphs (WIN3)
  graph: {
    render: (host, win) => {
      buildPaletteForMode(host, win);
      renderLegendInto(host);
    },
  },
  // the narrative building blocks. NOT the node types, which are of no use
  // while reading or writing a story — and NOT the connector legend, which
  // explains EDGES and belongs where edges are drawn.
  narrative: { render: (host) => renderNarrativePalette(host) },
  // A2 · the annotator offers the ways of TRACING. Same registry, same panel,
  // same chevron — what a window offers was never "the node types".
  annotator: { render: (host) => renderAnnotatorTools(host) },
};

/** True when this window has something to offer — the ONE place that answers it. */
function hasResources(win: Win): boolean {
  return !!RESOURCE_PROVIDERS[win.type];
}

/** Is this window's panel open? Per INSTANCE, persisted with the window. */
function resourcesOpen(win: Win): boolean {
  return winCurrent(win, "resources") === true;
}

function setResourcesOpen(win: Win, open: boolean): void {
  setWinCurrent(win, "resources", open ? true : null);
  renderTiles(); // the panel is part of the area: the tree re-lays out with it
  requestAnimationFrame(() => {
    resizeCanvas();
    draw();
  });
}

/** The sidebar's width. One number: the CSS reads it through `--palette-w`. */
const PALETTE_W = 148;

/**
 * Build the resources sidebar and its chevron into ONE area.
 *
 * Called for every area that has a provider — the focused one and the others
 * alike, which is what makes the panel stay where it was put. The reserved width
 * is published on the AREA as `--palette-w`, so the canvas of that window is
 * narrowed by it in both states and the drawing never re-frames when the pointer
 * crosses a divider (SHELL-POLISH's no-reflow rule).
 */
function buildResourcePanel(area: HTMLElement, win: Win): void {
  const provider = RESOURCE_PROVIDERS[win.type];
  if (!provider) {
    area.style.setProperty("--palette-w", "0px");
    return;
  }
  const open = resourcesOpen(win);
  area.style.setProperty("--palette-w", open ? `${PALETTE_W}px` : "0px");
  if (open) {
    const panel = document.createElement("div");
    panel.className = "win-resources";
    // a gesture inside the panel is not a gesture on the window's content
    panel.addEventListener("pointerdown", (e) => e.stopPropagation());
    area.appendChild(panel);
    provider.render(panel, win);
  }
  const chev = document.createElement("button");
  chev.className = "win-res-chevron";
  chev.type = "button";
  chev.textContent = open ? "‹" : "›";
  chev.title = t(open ? "palette.close" : "palette.open");
  chev.setAttribute("aria-expanded", String(open));
  chev.addEventListener("pointerdown", (e) => e.stopPropagation());
  chev.addEventListener("click", (e) => {
    e.stopPropagation();
    setResourcesOpen(win, !open);
  });
  area.appendChild(chev);
}

/** Repaint every mounted panel in place — for a scene or document change, which
 *  must not cost a re-tile. */
function renderResourcePanels(): void {
  paletteUis.length = 0;
  for (const area of [
    ...document.querySelectorAll<HTMLElement>(".tile-area"),
    canvasWrapEl,
  ]) {
    const panel = area.querySelector<HTMLElement>(":scope > .win-resources");
    if (!panel) continue;
    const id = area === canvasWrapEl ? activeWin().id : area.dataset.win;
    const win = windowsOf().find((w) => w.id === id);
    const provider = win && RESOURCE_PROVIDERS[win.type];
    if (!win || !provider) continue;
    panel.textContent = "";
    provider.render(panel, win);
  }
}

/** Open or close the FOCUSED window's panel — Tools ▸ Palette nodi. The chevron
 *  on each area does the same for its own window; both go through
 *  `setResourcesOpen`, so there is one state and it belongs to the window. */
function togglePalette(): void {
  const win = activeWin();
  if (!hasResources(win)) {
    toast("Questa finestra non ha un pannello risorse.");
    return;
  }
  setResourcesOpen(win, !resourcesOpen(win));
}

document.getElementById("btn-tool-palette")?.addEventListener("click", togglePalette);
// STEP A · the chevrons are BUILT PER AREA (`buildResourcePanel`) and wired
// there, to their own window. There is no singleton to bind here any more —
// that singleton was the follow-the-focus bug.

/**
 * Ask em-core to re-assert node SIZES on the layout we already have (EM3).
 *
 * Positions are untouched — this is not a re-layout and must never behave like
 * one. Applied through `store.setLayout` so undo/redo and the sync channel see it
 * as the ordinary layout change it is; skipped silently when nothing is stale, so
 * opening an up-to-date document does not mark it dirty.
 */
async function reassertSizes(): Promise<void> {
  if (!store) return;
  const sketch = store.doc.layout;
  if (!sketch || !Object.keys(sketch.positions ?? {}).length) return;
  try {
    // lazily imported like the other two em-core call sites: the WASM is fetched
    // on first use, and opening a document must not wait for it
    const { computeLayout } = await import("./emcore");
    const fixed = await computeLayout(store.doc.graph, sketch, { sizesOnly: true });
    const changed = Object.entries(fixed.positions ?? {}).filter(([id, rect]) => {
      const before = sketch.positions?.[id];
      const r = rect as { w: number; h: number };
      return before && (before.w !== r.w || before.h !== r.h);
    });
    if (!changed.length) return;
    store.setLayout(fixed);
    logInfo(
      `${changed.length} node size(s) re-asserted from their type ` +
        `(a stored size never wins over the type's geometry)`,
    );
  } catch (e) {
    // A failure here must not stop a document from opening: the layout on disk is
    // still a valid layout, only its glyph boxes are out of date.
    logWarn(`size re-assert skipped: ${e instanceof Error ? e.message : e}`);
  }
}

function cancelPlacing(): void {
  placingType = null;
  placingKind = null;
  placingIsResource = false;
  for (const p of paletteUis) p.setActive(null);
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
    onToggleFold: (id) => requestFold(id),
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
  // NAME1 · the paradata chain has a convention (D.<n> / <doc>.<ord> / C.<n>);
  // every other type keeps the store's generic fresh label. A new extractor is
  // born unattached, so it gets a Temp name and is numbered when the
  // `extracted_from` edge appears — see `createEdge`.
  const name = initialName(store.doc, placingType) ?? store.freshLabel(placingType);
  const w = isGroupType(placingType) ? 120 : 90;
  const h = 30;
  const node: EmNode = { id, name, node_type: placingType, description: "" };
  // DTC palette items carry a kind → stamp it so the node renders its glyph and
  // projects its crm:P2_has_type (em.json = single source of truth).
  if (placingKind) {
    // DTC chunk (input/process) carries dtc_kind; a DTC OUTPUT is a Resource
    // (ResourceNode) → also stamp resource_type (slice b). em.json = source of truth.
    node.data = { dtc_kind: placingKind };
    if (placingIsResource) node.data.resource_type = placingKind;
  }
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
  // BUGFIX-GLYPH · a glyph/shape type must never keep the wide default box: ask
  // em-core (the size owner) to re-assert the new node's box from its TYPE, so a
  // freshly created extractor/combiner/SE/BR is born ~square with the handle
  // adjacent — not only after a Matrix re-load (EM2/EM3).
  void reassertSizes();
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
  // PDMEM1 · attaching an ornament (author/license/embargo) also makes it a
  // MEMBER of the referent's ParadataNodeGroup (created on demand): the badge
  // and the exploded PDG then read the same membership — one truth, two views.
  // Verso verified in filters.ts: the ornament is the edge TARGET, referent the
  // SOURCE, so attach onto `source`.
  if (ADORNMENT_EDGE_TYPES.has(edgeType))
    store.attachAdornmentToParadata(source, target);
  toast(
    `${store.node(source)?.name || source} — ${edgeTypeLabel(edgeType)} → ${store.node(target)?.name || target}`,
  );
  // NAME1 · attaching an extractor to a document is what NAMES it. EMStudio has
  // no "create from the document's handle and name it on the way" path — the
  // connect gesture creates the node first and the edge second — so the edge is
  // the trigger, which also covers an extractor attached by hand later.
  const renamed = renameOnAttach(store.doc, source);
  if (renamed) {
    store.updateNode(source, { name: renamed });
    toast(`numbered ${renamed}`);
  }
  // BUGS-UI · the same trigger for a paradata group: a PDG dropped from the
  // palette is born with a generic label and only learns its referent when this
  // edge is drawn — from then on it is `PD_<referent>`, like the groups created
  // by the ornament attach and by the epoch chronology.
  if (edgeType === HAS_PARADATA_NODEGROUP) {
    const pdgName = paradataGroupRenameOnAttach(store.doc, target);
    if (pdgName) {
      store.updateNode(target, { name: pdgName });
      toast(`named ${pdgName}`);
    }
  }
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
  const name = initialName(store.doc, type) ?? store.freshLabel(type);
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
  // BUGFIX-GLYPH · re-assert the new node's box from its TYPE via em-core (see
  // placeNode): a glyph/shape is born ~square, never with the wide default box.
  void reassertSizes();
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
function escapeHtml(text: string): string {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

/** The facts the vocabulary records about a term besides its prose: value type,
 *  admitted units or values, and the authority it maps onto. */
function qualiaFacts(q: Qualia): string[] {
  const out: string[] = [];
  if (q.dataType) out.push(`type: ${q.dataType}`);
  if (q.units?.length) out.push(`units: ${q.units.join(", ")}`);
  if (q.values?.length) out.push(`values: ${q.values.join(", ")}`);
  const cidoc = q.mappings?.["cidoc_crm"];
  if (cidoc) out.push(`CIDOC ${cidoc}`);
  return out;
}

/** A term's tooltip. It used to fall back to the term's own NAME, which reads
 *  as "no tooltip" — the label is already on screen. Where the vocabulary has
 *  no prose, say where the term sits and what it takes instead. */
function qualiaTooltip(q: Qualia): string {
  const prose = q.rationale || q.description;
  const facts = qualiaFacts(q);
  const place = `${q.categoryLabel} → ${q.subcategoryLabel}`;
  return [prose ?? place, ...(facts.length ? [facts.join(" · ")] : [])].join(
    "\n",
  );
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
  // The box under the list. Many terms carry no prose in the vocabulary yet
  // (19 of 88 at 1.6.0 — the dimensional ones especially), and it used to say
  // so and stop, which is a dead end for the reader. Nothing may be invented
  // here, so instead it falls back to what the vocabulary DOES record about
  // the term: where it sits, what type of value it takes, in which units, and
  // which authority it maps onto.
  const showDetail = (q: Qualia): void => {
    const bits: string[] = [];
    if (q.rationale) bits.push(`<b>Why</b> ${q.rationale}`);
    if (q.example) bits.push(`<b>e.g.</b> ${q.example}`);
    if (!bits.length && q.description) bits.push(q.description);
    if (!bits.length) {
      bits.push(`<i>${escapeHtml(q.categoryLabel)} → ${escapeHtml(q.subcategoryLabel)}</i>`);
      if (q.subcategoryDescription)
        bits.push(escapeHtml(q.subcategoryDescription));
    }
    const facts = qualiaFacts(q);
    if (facts.length) bits.push(facts.map(escapeHtml).join(" · "));
    detail.innerHTML = bits.join("<br>");
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
        // the category's gloss, straight from em_qualia_types.json — these
        // headers carried no tooltip at all while every item below them did
        if (q.categoryDescription) h.title = q.categoryDescription;
        listEl.appendChild(h);
      }
      if (q.subcategory !== lastSub) {
        lastSub = q.subcategory;
        const sh = document.createElement("div");
        sh.className = "cm-subsect";
        sh.textContent = q.subcategoryLabel;
        if (q.subcategoryDescription) sh.title = q.subcategoryDescription;
        listEl.appendChild(sh);
      }
      const b = document.createElement("button");
      b.className = "cm-item";
      b.textContent = q.name;
      b.title = qualiaTooltip(q);
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
    if (!willOpen) return;
    menu.classList.remove("hidden");
    // a menu in the window bar is `fixed` (the bar scrolls) → place it by hand
    if (dd.closest("#window-header")) placeBarMenu(toggle, menu);
  });
  menu.addEventListener("click", () => menu.classList.add("hidden"));
});
// BUGS-UI · nested sub-menus inside a dropdown (File ▸ Export). The toggle must
// NOT bubble: the parent menu closes on any click inside it, so an un-stopped
// click would close the very menu the flyout hangs from. Picking an item does
// bubble — that closes both, which is what finishing a command should do.
function closeAllSubmenus(): void {
  document.querySelectorAll(".dd-sub-menu").forEach((m) => m.classList.add("hidden"));
}
document.querySelectorAll<HTMLElement>(".dd-sub").forEach((sub) => {
  const toggle = sub.querySelector<HTMLButtonElement>(".dd-sub-toggle")!;
  const menu = sub.querySelector<HTMLElement>(".dd-sub-menu")!;
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = menu.classList.contains("hidden");
    closeAllSubmenus();
    if (willOpen) menu.classList.remove("hidden");
  });
});
document.addEventListener("click", () => {
  closeAllDropdowns();
  closeAllSubmenus();
});

const fileInput = document.getElementById("file-input") as HTMLInputElement;
/**
 * AUX1 · the auxiliary-file picker of the active slot.
 *
 * A second input rather than reusing `fileInput`: that one LOADS a document, and
 * one input serving two meanings is how a picked xlsx ends up replacing the graph.
 */
const auxFileInput = document.getElementById(
  "aux-file-input",
) as HTMLInputElement;
auxFileInput.addEventListener("change", () => {
  const f = auxFileInput.files?.[0];
  auxFileInput.value = ""; // so picking the same file again still fires
  const slot = emtree.active();
  if (!f || !slot) return;
  const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
  // Guess the TYPE from the extension, and only as a starting point: the dropdown
  // in the detail panel is what decides, because the same .xlsx can be an EMdb
  // workbook or a source list and no extension can tell them apart.
  const lower = f.name.toLowerCase();
  const fileType = lower.endsWith(".sqlite") || lower.endsWith(".db")
    ? "pyarchinit"
    : "emdb_xlsx";
  slot.auxiliaryFiles.push({
    id: crypto.randomUUID(),
    name: f.name,
    kind: "local",
    locator: rel || f.name,
    fileType,
    baked: false,
    mapped: false,
    expanded: true, // opened on arrival: the type usually needs correcting
  });
  refreshEMTree();
  toast(`${f.name} attached to ${slotLabel(slot)} — map it to see it in blue`);
});

/**
 * AUX2 · MAP a source into the graph as VOLATILE nodes.
 *
 * xlsx types go through the bridge (`/import-em-data`), which builds a document
 * from the workbook using an s3Dgraphy registry mapping (DP-61) — we do NOT
 * re-implement the mapping in TS. The returned nodes/edges are injected into the
 * live graph marked volatile (blue on the canvas and in the EM-Data table), and
 * excluded from `toJSON` until baked. The other types need a bridge endpoint that
 * is not exposed yet (flagged); they report that rather than pretend.
 */
async function mapAux(auxId: string): Promise<void> {
  const f = emtree.active()?.auxiliaryFiles.find((x) => x.id === auxId);
  if (!f || !store) return;
  // AUX-COMPLETE: the xlsx aux types map through the bridge /import-em-data.
  // emdb_xlsx / pyarchinit / source_list carry a registry `mapping` (their sheet
  // is transformed to nodes by the s3Dgraphy mapping); a bare em_data.xlsx has no
  // mapping (read directly). dosco / resource_collection are folder-based and use
  // a different endpoint — flagged as follow-up.
  // AUX2B · resource_collection is a FOLDER: scan it via the bridge
  // (/scan-resources, which already exists) and bring its orphan files in as
  // VOLATILE ResourceNodes (same volatile→bake cycle as the xlsx types). dosco
  // (documents harvest) still needs a dedicated endpoint — flagged.
  if (f.fileType === "resource_collection") {
    await mapResourceCollection(f, auxId);
    return;
  }
  if (
    f.fileType !== "emdb_xlsx" &&
    f.fileType !== "pyarchinit" &&
    f.fileType !== "source_list"
  ) {
    toast(`${f.fileType}: folder mapping needs a dedicated endpoint (follow-up) — see the note`);
    return;
  }
  const mapping = String((f.options ?? {}).mapping ?? "").trim();
  toast(`mapping ${f.name}…`);
  try {
    const res = await fetch(`${await bridgeUrl()}/import-em-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: f.locator,
        graph_id: String(
          (store.doc.graph as Record<string, unknown>).graph_id ?? "",
        ),
        ...(mapping ? { mapping } : {}),
      }),
    });
    if (!res.ok) throw new Error(`bridge ${res.status}`);
    const payload = (await res.json()) as { doc?: EmDocument };
    const g = payload.doc?.graph;
    if (!g || !Array.isArray(g.nodes)) throw new Error("no graph in response");
    const added = store.mapVolatile(auxId, g.nodes, g.edges ?? []);
    f.mapped = true;
    f.baked = false;
    refreshEMTree();
    toast(`mapped ${f.name} — ${added} volatile node(s) in blue; save excludes them until baked`);
  } catch (e) {
    toast(
      `map failed (${e instanceof Error ? e.message : e}). The bridge (dev.sh) ` +
        `must be running to map an xlsx via the s3Dgraphy registry.`,
    );
  }
}

/**
 * AUX2B · map a `resource_collection` FOLDER as VOLATILE ResourceNodes.
 *
 * Reuses the existing `/scan-resources` (which returns the folder's orphan files
 * with stable ids: `{resource_id, key_id, filename, rel_path}`) and the AUX2
 * volatile path (`store.mapVolatile`): the files enter the graph as ResourceNode
 * (node_type from the vendored registry) marked volatile — blue on the canvas
 * and the EM-Data table, excluded from save until baked. No new mapping logic;
 * no schema invention. Linking a resource to a node (the "hat") stays a later
 * step — here they arrive as the orphan resources the Shelf already models.
 */
async function mapResourceCollection(
  f: { id: string; name: string; locator: string },
  auxId: string,
): Promise<void> {
  if (!store) return;
  const nt = nodeTypeForClass("ResourceNode") ?? "resource";
  toast(`scanning ${f.name}…`);
  try {
    const res = await fetch(`${await bridgeUrl()}/scan-resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: f.locator, doc: store.doc }),
    });
    if (!res.ok) throw new Error(`bridge ${res.status}`);
    const payload = (await res.json()) as {
      shelf?: Array<{ resource_id: string; filename: string; rel_path: string }>;
    };
    const shelf = payload.shelf ?? [];
    const nodes: EmNode[] = shelf.map((r) => ({
      id: r.resource_id,
      name: r.filename,
      node_type: nt,
      description: "",
      data: { url: r.rel_path, url_type: resourceTypeOfLocator(r.filename) },
    }));
    const added = store.mapVolatile(auxId, nodes, []);
    const aux = emtree.active()?.auxiliaryFiles.find((x) => x.id === auxId);
    if (aux) {
      aux.mapped = true;
      aux.baked = false;
    }
    refreshEMTree();
    toast(`mapped ${f.name} — ${added} volatile resource(s) in blue; save excludes them until baked`);
  } catch (e) {
    toast(
      `scan failed (${e instanceof Error ? e.message : e}). The bridge (dev.sh) ` +
        `must be running to scan a resource folder.`,
    );
  }
}
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
document
  .getElementById("btn-pin-version")
  ?.addEventListener("click", () => pinProjectVersion());
// P3 · the panel can be dismissed; the chip is how it comes back. A notice you
// cannot re-read is a notice you were only allowed to see once.
document.getElementById("conflict-reopen")?.addEventListener("click", () => {
  if (lastMergeConflicts.length) showConflictPanel(lastMergeConflicts);
});
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
/** Which scope a URI added by hand gets — remembered between additions, because
 *  somebody adding comparanda adds several in a row. */
let shelfUrlScope: ShelfScope = "own-study";

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
// `geo.ts` needs the bridge for reprojection (G1) but must not import main.ts.
// Endpoint precedence stays owned here, in one place; the geo module is handed
// the resolver rather than reconstructing it.
setBridgeResolver(bridgeUrl);
// W1 · the Storage/Viewer file routes need the same endpoint, by the same rule.
setStorageBridgeResolver(bridgeUrl);
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

// DP-79 P1 · export the NARRATIVE — LaTeX, Word, HTML.
//
// Same shape as the Turtle button below and for the same reason (invariant 2):
// the exporters live in s3Dgraphy, this POSTs the document and downloads what
// comes back. Three formats through ONE route because they are three renderings
// of one bake — the moment they became three traversals of the graph they would
// start disagreeing about what the narrative said.
//
// A static target is a SNAPSHOT: the embeds are resolved once, at export. That
// is stated in the exported file itself, not only here — a reader who is handed
// the .docx has no other way to know.
const NARRATIVE_FORMATS: Record<string, { mime: string; ext: string; label: string }> = {
  html: { mime: "text/html", ext: "html", label: "HTML" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: "docx", label: "Word",
  },
  latex: { mime: "application/x-tex", ext: "tex", label: "LaTeX" },
  // The fourth, and the only live one: its cells QUERY the study instead of
  // quoting it, so re-running the notebook says what the study says then.
  ipynb: { mime: "application/x-ipynb+json", ext: "ipynb", label: "Jupyter" },
};

async function exportNarrative(format: string): Promise<void> {
  if (!store) {
    toast("Apri prima un documento");
    return;
  }
  const spec = NARRATIVE_FORMATS[format];
  const narratives = store.doc.graph.nodes.filter(
    (n) => n.node_type === "narrative");
  if (!narratives.length) {
    // Not an error: a graph without a narrative is an ordinary graph.
    toast("Questo grafo non contiene narrative da esportare");
    return;
  }
  // Which one: the open one when the narrative view is showing it, else the
  // only one there is. Guessing between several would export the wrong story.
  const chosen = (selectedNarrativeId
    && narratives.some((n) => n.id === selectedNarrativeId))
    ? selectedNarrativeId
    : (narratives.length === 1 ? narratives[0].id : null);
  if (!chosen) {
    toast("Ci sono più narrative: aprine una e riprova");
    return;
  }
  toast(`Esporto la narrativa in ${spec.label}…`);
  try {
    const res = await fetch(
      `${await bridgeUrl()}/export-narrative?format=${encodeURIComponent(format)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: JSON.parse(store.toJSON()),
                               narrative_id: chosen }),
      });
    if (!res.ok) {
      let msg = `bridge error ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch { /* non-JSON error body */ }
      toast(`Esportazione ${spec.label} fallita: ${msg}`);
      return;
    }
    const blob = await res.blob();
    const base = String(store.doc.graph["name"] ?? chosen)
      .replace(/[^\w.-]+/g, "_");
    downloadBlob(blob, `${base}.${spec.ext}`, spec.mime);
    // LaTeX comes with its bibliography: a .bib the author has to fetch
    // separately is a .bib the author forgets to fetch.
    const bib = res.headers.get("X-EM-Bib");
    if (bib) {
      const text = decodeURIComponent(escape(atob(bib)));
      downloadBlob(new Blob([text], { type: "text/plain" }), `${base}.bib`,
                   "text/plain");
      toast(`Narrativa esportata in ${spec.label} (+ .bib)`);
    } else {
      toast(`Narrativa esportata in ${spec.label}`);
    }
  } catch {
    toast(BRIDGE_UNREACHABLE);
  }
}

function downloadBlob(blob: Blob, filename: string, _mime: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

for (const format of Object.keys(NARRATIVE_FORMATS)) {
  document.getElementById(`btn-narr-${format}`)
    ?.addEventListener("click", () => { void exportNarrative(format); });
}

// Export the RDF/CIDOC Turtle projection via the transformer (s3Dgraphy
// rdf_exporter — invariant 2: produced in Python, never reimplemented in TS).
document.getElementById("btn-ttl")!.addEventListener("click", async () => {
  if (!store) {
    toast("Open a document first");
    return;
  }
  const g = store.doc.graph;
  const name = String(g["name"] ?? g.graph_id ?? "graph");
  toast("Exporting Turtle…");
  try {
    const res = await fetch(`${await bridgeUrl()}/export-ttl`, {
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
      toast(`Turtle export failed: ${msg}`);
      return;
    }
    const ttl = await res.text();
    const filename = `${name.replace(/[^\w.-]+/g, "_")}.ttl`;
    if (isTauri()) {
      const path = await saveTtl(ttl, filename);
      if (!path) return; // cancelled
      toast(`Turtle exported → ${baseName(path)}`);
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([ttl], { type: "text/turtle" }));
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Turtle exported");
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
      // CMD1 · consent can be toggled while connected; the affordance follows it
      refreshInspector();
    },
    onCommandResult: (res) => applyCommandResult(res),
    // WIRE 2 · a host that speaks another protocol version is SAID. Without
    // this it would look exactly like a host that has gone quiet.
    onWireMismatch: (reason) => {
      logInfo(reason);
      toast(t("sync.wireMismatch"));
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

// ---------- MENU1 · Mode menu (Standalone / Sidecar / Hub) ----------
// Reuses the existing sync toggle (btnSync) rather than reimplementing it:
// Sidecar connects if not connected, Standalone disconnects if connected. Hub
// is disabled (em-server, later). The active mode's ✓ is set by setModeIndicator.
document.getElementById("btn-mode-standalone")?.addEventListener("click", () => {
  if (sync.connected) btnSync.click(); // disconnect → back to local document
});
document.getElementById("btn-mode-sidecar")?.addEventListener("click", () => {
  if (!sync.connected) btnSync.click(); // connect → live-synced to the host
});
// P4.3 · Hub is now a real mode with a real server behind it (em-server, P4.2).
// The endpoint and the room live in Settings; the TOKEN is asked for and kept in
// memory only — the same rule the AI key follows, because a token written to
// disk is a token that leaks.
document.getElementById("btn-mode-hub")?.addEventListener("click", () => {
  const s = getSettings().sync;
  if (!s.hubUrl || !s.hubRoom) {
    toast(t("hub.needsConfig"));
    openSettings("settings-sect-sync");
    return;
  }
  if (sync.room === s.hubRoom && sync.connected) return;   // already there
  const token = hubToken ?? window.prompt(t("hub.tokenPrompt")) ?? "";
  hubToken = token || null;
  connectToHub(s.hubUrl, s.hubRoom, hubToken);
});

/** The access token for this session. In MEMORY: never localStorage, never the
 *  settings file — a token on disk outlives the reason it was issued. */
let hubToken: string | null = null;

// ---------- MENU1 · Help menu (About / Updates / Ontology models) ----------
const RELEASES_URL = "https://github.com/EmanuelDemetrescu/EMStudio/releases";
function helpPopover(title: string, rows: Array<[string, string]>): void {
  document.getElementById("help-pop")?.remove();
  const pop = document.createElement("div");
  pop.id = "help-pop";
  pop.className = "help-pop";
  const h = document.createElement("div");
  h.className = "help-pop-title";
  h.textContent = title;
  pop.appendChild(h);
  for (const [k, v] of rows) {
    const r = document.createElement("div");
    r.className = "help-pop-row";
    const kk = document.createElement("span");
    kk.className = "help-pop-k";
    kk.textContent = k;
    const vv = document.createElement("span");
    vv.textContent = v;
    r.append(kk, vv);
    pop.appendChild(r);
  }
  document.body.appendChild(pop);
  const close = (e: MouseEvent): void => {
    if (!pop.contains(e.target as Node)) {
      pop.remove();
      document.removeEventListener("pointerdown", close, true);
    }
  };
  setTimeout(() => document.addEventListener("pointerdown", close, true), 0);
}
document.getElementById("btn-help-about")?.addEventListener("click", () => {
  helpPopover("EMStudio", [
    ["Version", __EMSTUDIO_VERSION__],
    ["EM language", EM_VERSION],
    ["License", "GPL-3.0 · CNR ISPC — StratiGraph (HE GA 101232855)"],
  ]);
});
document.getElementById("btn-help-updates")?.addEventListener("click", () => {
  // No in-app updater yet — point at the releases page (stub, declared).
  toast("Nessun updater in-app: apri le release su GitHub.");
  window.open(RELEASES_URL, "_blank", "noopener,noreferrer");
});
// MENU-AUDIT · the Help ▸ "Ontology models…" item is gone: the version button in
// the footer opens the same breakdown, built from the datamodel's own
// `referenced_ontology_versions` (with source links) instead of five rows two of
// which were hardcoded here. One view, one place, and the data-driven one.

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
const setStrictDocNames = document.getElementById(
  "set-strict-doc-names",
) as HTMLInputElement;
const setAiProvider = document.getElementById(
  "set-ai-provider") as HTMLSelectElement;
const setAiModel = document.getElementById("set-ai-model") as HTMLInputElement;
const setAiKey = document.getElementById("set-ai-key") as HTMLInputElement;
const setAiKeyState = document.getElementById("set-ai-key-state")!;
const setAiKeySave = document.getElementById(
  "set-ai-key-save") as HTMLButtonElement;
const setAiKeyClear = document.getElementById(
  "set-ai-key-clear") as HTMLButtonElement;
const setAiKeyHint = document.getElementById("set-ai-key-hint")!;
const setAtonBase = document.getElementById(
  "set-aton-base") as HTMLInputElement;
const setHeriverseApp = document.getElementById(
  "set-heriverse-app") as HTMLInputElement;
const setAtonSceneUrl = document.getElementById("set-aton-scene-url")!;

for (const p of AI_PROVIDERS) {
  const o = document.createElement("option");
  o.value = p.value;
  o.textContent = p.label;
  setAiProvider.appendChild(o);
}

/**
 * Where the key lives, and therefore what Settings can offer (S3).
 *
 * Two modes, because the two ways of running EMStudio have different places to
 * keep a secret — and the difference is worth stating to the user rather than
 * hiding behind one button that means two things:
 *
 *   * **desktop** — the OS keychain. Persistent; survives a restart.
 *   * **browser dev** — no keychain to write to, so the key goes to em-bridge
 *     and lives in that PROCESS, in memory, for as long as it runs. Not saved.
 *
 * What both modes share is the part that matters: the key goes one way. There
 * is no call, in either, that hands it back.
 */
type KeyMode = "keychain" | "session" | "unavailable";

interface AiKeyState {
  mode: KeyMode;
  set: boolean;
  /** where a dev key came from, so "env" is not shown as "you pasted this" */
  source?: string;
  detail: string;
}

async function readAiKeyState(): Promise<AiKeyState> {
  if (isTauri()) {
    const { available, set, detail } = await llmKeyStatus();
    return {
      mode: available ? "keychain" : "unavailable",
      set,
      detail,
    };
  }
  // Browser: ask the bridge. If it is not running there is nowhere to put a
  // key, which is a different problem from "you have not set one".
  try {
    const res = await fetch(`${await bridgeUrl()}/llm-key-status`);
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { set: boolean; source: string };
    return { mode: "session", set: !!j.set, source: j.source, detail: "" };
  } catch {
    return {
      mode: "unavailable",
      set: false,
      detail:
        "em-bridge non raggiungibile: è lì che vive la key in modalità " +
        "sviluppo. Avvialo con ./dev.sh, poi riapri questa finestra.",
    };
  }
}

async function refreshAiKeyState(): Promise<void> {
  // On the desktop, saving restarts em-bridge (the key enters at spawn), which
  // would cut a generation off mid-request. In dev the key enters at runtime,
  // so there is nothing to restart and nothing to interrupt — the guard is
  // therefore desktop-only, not a blanket "don't touch anything while busy".
  const busy = generating.size > 0 && isTauri();
  const { mode, set, source, detail } = await readAiKeyState();
  const usable = mode !== "unavailable";

  setAiKey.disabled = !usable || busy;
  setAiKeySave.disabled = !usable || busy;
  setAiKeyClear.disabled = !set || busy || source === "env";

  if (!usable) setAiKeyState.textContent = isTauri()
    ? "portachiavi non disponibile"
    : "bridge non raggiungibile";
  else if (!set) setAiKeyState.textContent = "nessuna key impostata";
  else if (mode === "keychain") setAiKeyState.textContent = "✓ key impostata";
  else setAiKeyState.textContent = source === "env"
    ? "✓ key dall'ambiente"
    : "✓ key di sessione — non salvata";
  setAiKeyState.className = usable && set ? "ai-key-set" : "ai-key-unset";

  // K2 — the field is always EMPTY on reopen, because the key is not readable
  // (that asymmetry is the security invariant: set / clear / status, never get).
  // An empty box next to "✓ key impostata" reads as "not saved" though, and the
  // user pastes it again. So the PLACEHOLDER carries the state: a fixed run of
  // dots and a sentence. It is a placeholder, not a value — `setAiKey.value`
  // stays empty, nothing is read from anywhere, and typing behaves as before.
  setAiKey.placeholder = usable && set
    ? "•••••••••••• — impostata (incolla per sostituire)"
    : "Incolla qui la key";

  if (busy) {
    setAiKeyHint.textContent =
      "Generazione in corso: salvare la key riavvia em-bridge e la " +
      "interromperebbe. Attendi il termine.";
    return;
  }
  if (!usable) {
    setAiKeyHint.textContent = detail;
    return;
  }
  if (mode === "keychain") {
    setAiKeyHint.textContent = set
      ? "Salvata nel portachiavi di sistema. Non è leggibile da qui: puoi " +
        "sostituirla o rimuoverla."
      : "Incolla la key e premi Salva. Finisce nel portachiavi di sistema e " +
        "viene passata a em-bridge, che riparte per riceverla.";
    return;
  }
  // dev / session
  setAiKeyHint.textContent = source === "env"
    ? "Presa da ANTHROPIC_API_KEY nell'ambiente di em-bridge. Puoi incollarne " +
      "un'altra qui: varrà per questa sessione e avrà la precedenza."
    : set
      ? "Vive nella memoria di em-bridge — non è salvata da nessuna parte e " +
        "sparisce quando fermi il bridge. In modalità sviluppo non c'è un " +
        "portachiavi in cui metterla al sicuro; per una key persistente usa " +
        "l'app desktop."
      : "Incolla la key: vale solo per questa sessione, non viene salvata. " +
        "Vive nella memoria di em-bridge finché il bridge è acceso. In " +
        "alternativa esportala prima di avviarlo:  export ANTHROPIC_API_KEY=…";
}

/** Settings may be open while a generation starts or finishes — keep the guard
 *  honest instead of only correct at the moment the panel was opened. */
function refreshAiKeyStateIfOpen(): void {
  if (!settingsModal.classList.contains("hidden")) void refreshAiKeyState();
}

/** POST the key to em-bridge, which keeps it in memory for its own lifetime.
 *  Returns an error message, or null. */
async function postSessionKey(key: string | null): Promise<string | null> {
  const route = key === null ? "/clear-llm-key" : "/set-llm-key";
  try {
    const res = await fetch(`${await bridgeUrl()}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: key === null ? "{}" : JSON.stringify({ key }),
    });
    if (res.ok) return null;
    const j = await res.json().catch(() => null);
    return (j as { error?: string } | null)?.error ?? `bridge error ${res.status}`;
  } catch {
    return "em-bridge non raggiungibile";
  }
}

setAiKeySave.addEventListener("click", async () => {
  if (generating.size > 0 && isTauri()) {
    toast("Generazione in corso — attendi il termine prima di salvare la key");
    return;
  }
  const key = setAiKey.value.trim();
  if (!key) {
    toast("Incolla prima la key");
    return;
  }
  const err = isTauri() ? await setLlmKey(key) : await postSessionKey(key);
  setAiKey.value = "";          // never keep it in the DOM after saving
  if (err) {
    toast(`Key non salvata: ${err}`);
    return;
  }
  toast(isTauri()
    ? "Key salvata nel portachiavi — bridge riavviato"
    : "Key attiva per questa sessione — non salvata");
  await refreshAiKeyState();
});

setAiKeyClear.addEventListener("click", async () => {
  if (generating.size > 0 && isTauri()) {
    toast("Generazione in corso — attendi il termine prima di rimuovere la key");
    return;
  }
  const err = isTauri() ? await clearLlmKey() : await postSessionKey(null);
  if (err) {
    toast(`Key non rimossa: ${err}`);
    return;
  }
  setAiKey.value = "";
  toast(isTauri()
    ? "Key rimossa dal portachiavi — bridge riavviato"
    : "Key di sessione rimossa");
  await refreshAiKeyState();
});

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
// A worked example of the address being built, so a typo shows up here rather
// than as an empty frame inside a chapter.
function refreshAtonUrlPreview(): void {
  const root = setAtonBase.value.trim().replace(/\/+$/, "");
  const app = setHeriverseApp.value.trim().replace(/^\/+|\/+$/g, "")
    || "a/heriverse";
  setAtonSceneUrl.textContent = root
    ? `${root}/${app}/?scene=<id>`
    : "— nessun server: i blocchi 3D lo diranno";
}

/**
 * @param section id of a `.settings-sect` to open ON — scrolled into view and
 *   briefly outlined. Settings is a long dialog; a caller who knows which part
 *   of it the user came for should not make them look for it. (WIN7: the
 *   narrative window's ⌁ button comes here for the AI provider and key.)
 */

// ── IDENTITY · who is working, and who has been checked ─────────────────────
//
// The model in one line: the ORCID iD IS the identity; `verified` says whether
// anyone has confirmed it. Declaring works offline and unlocks everything about
// preparing data; verifying is what unlocks publishing AS that person.
//
// The seam lives in `identity.ts` (pure, checked by scripts/check-identity.mjs).
// This file only wires it to the dialog, the footer and the gate.

/** The provider used by the Verify button.
 *
 * TODAY it is the MOCK: it verifies the iD the user has declared, so the whole
 * flow — compare, promote, unlock, or report a mismatch — is exercisable with
 * no infrastructure at all. The real one (Keycloak brokering ORCID: PKCE in the
 * browser, Device flow on the desktop) drops in HERE, behind the same
 * interface, and nothing else in this file changes. That is the point of having
 * an interface rather than a fetch call in a button handler.
 *
 * It is deliberately NOT silent about being a mock — see `verifyIdentityFlow`,
 * which says so in the toast. A verification that pretends to have talked to
 * ORCID would be worse than no verification.
 */
function identityProvider(): IdentityProvider {
  const declared = currentIdentity();
  // A declared TEST BENCH, not a hidden feature: `?verifies=<orcid>` (or
  // `window.EM_VERIFIES`) makes the mock answer with a DIFFERENT iD, which is
  // the only way to see the mismatch path in the real UI before Keycloak
  // exists. Same shape as the `?bridge=` override — an override you have to
  // type, that changes nothing when you do not.
  const forced =
    new URLSearchParams(location.search).get("verifies") ??
    (window as unknown as { EM_VERIFIES?: string }).EM_VERIFIES ??
    null;
  if (forced) return new MockIdentityProvider({ orcid: forced });
  return new MockIdentityProvider(
    declared ? { orcid: declared.orcid } : new Error("nessuna identità dichiarata"),
  );
}

/** The footer chip: who is authoring, and whether they are verified. */
function refreshIdentityChip(): void {
  const chip = document.getElementById("footer-identity");
  if (!chip) return;
  const identity = currentIdentity();
  if (!identity) {
    chip.textContent = t("identity.none");
    chip.title = t("identity.noneTitle");
    chip.classList.remove("verified");
    return;
  }
  const who = identity.name || identity.surname
    ? `${identity.name ?? ""} ${identity.surname ?? ""}`.trim()
    : identity.orcid;
  chip.textContent = identity.verified ? `✔ ${who}` : `◌ ${who}`;
  chip.title = identity.verified
    ? t("identity.chipVerified", { orcid: identity.orcid })
    : t("identity.chipClaimed", { orcid: identity.orcid });
  chip.classList.toggle("verified", identity.verified);
}

/** The Settings section: declare, switch, verify. */
function refreshIdentityPanel(): void {
  const state = document.getElementById("set-orcid-state");
  const known = document.getElementById("set-orcid-known");
  const verifyBtn = document.getElementById("set-orcid-verify") as HTMLButtonElement | null;
  if (!state || !known || !verifyBtn) return;
  const identity = currentIdentity();
  state.textContent = identity
    ? identity.verified
      ? t("identity.stateVerified", { orcid: identity.orcid })
      : t("identity.stateClaimed", { orcid: identity.orcid })
    : t("identity.stateNone");
  verifyBtn.disabled = !identity || identity.verified;

  known.textContent = "";
  const others = knownIdentities();
  if (others.length <= 1) return;
  const title = document.createElement("p");
  title.className = "settings-hint";
  title.textContent = t("identity.knownOnThisMachine");
  known.appendChild(title);
  for (const other of others) {
    const row = document.createElement("p");
    row.className = "settings-url";
    const label = document.createElement("span");
    label.textContent = `${other.verified ? "✔" : "◌"} ${other.name ?? ""} ${other.orcid}`.trim();
    const use = document.createElement("button");
    use.type = "button";
    use.textContent = t("identity.use");
    use.disabled = other.orcid === identity?.orcid;
    use.addEventListener("click", () => {
      useIdentity(other.orcid);
      refreshIdentityPanel();
      refreshIdentityChip();
      toast(t("identity.switched", { orcid: other.orcid }));
    });
    const drop = document.createElement("button");
    drop.type = "button";
    drop.textContent = t("identity.forget");
    drop.addEventListener("click", () => {
      forgetIdentity(other.orcid);
      refreshIdentityPanel();
      refreshIdentityChip();
    });
    row.append(label, use, drop);
    known.appendChild(row);
  }
}

function declareIdentityFromPanel(): void {
  const input = document.getElementById("set-orcid") as HTMLInputElement;
  const name = (document.getElementById("set-orcid-name") as HTMLInputElement).value.trim();
  const surname = (document.getElementById("set-orcid-surname") as HTMLInputElement).value.trim();
  const res = declareIdentity(input.value, { name, surname });
  if (!res.ok) {
    // The REASON, not "invalid": a transposed pair and a half-typed iD are
    // different mistakes and the person fixing them needs to know which.
    toast(t(`identity.problem.${res.problem}`));
    return;
  }
  input.value = res.identity.orcid;   // show it back in canonical form
  applyIdentityToDocument();
  refreshIdentityPanel();
  refreshIdentityChip();
  toast(t("identity.declared", { orcid: res.identity.orcid }));
}

/**
 * Write the current identity onto the open document as its graph-scope author.
 *
 * The identity is a fact about the PERSON and lives in localStorage; the author
 * is a fact about the DOCUMENT and lives in the graph. Copying one into the
 * other is what makes "what I make carries my name" true — and it is a copy,
 * deliberately: a document authored today keeps saying who made it even after
 * this laptop is handed to somebody else.
 *
 * Only when a document is open, and never overwriting a DIFFERENT author who is
 * already there: a graph someone else authored is not re-attributed by opening
 * it. That is the same refusal as the mismatch case — a name is not ours to
 * change on somebody else's behalf.
 */
function applyIdentityToDocument(): void {
  if (!store) return;
  const identity = currentIdentity();
  if (!identity) return;
  const scope = store.readGraphScope();
  const who = `${identity.name ?? ""} ${identity.surname ?? ""}`.trim() || identity.orcid;
  if (scope.author && scope.orcid && scope.orcid !== identity.orcid) {
    toast(t("identity.documentHasAnotherAuthor", { orcid: scope.orcid }));
    return;
  }
  store.setGraphScope({
    author: who,
    orcid: identity.orcid,
    verified: identity.verified,
  });
  refreshInspector();
}

async function verifyIdentityFlow(): Promise<void> {
  const outcome = await verifyCurrentIdentity(identityProvider());
  switch (outcome.status) {
    case "verified":
      applyIdentityToDocument();   // the document learns it too
      refreshIdentityPanel();
      refreshIdentityChip();
      // Named as a mock, every time. The day this says nothing about being
      // simulated is the day someone believes a verification that never
      // happened.
      toast(t("identity.verifiedMock", { orcid: outcome.identity.orcid }));
      break;
    case "mismatch":
      // NOT promoted, NOT replaced: only the person in front of the screen
      // knows which of the two is the mistake, and adopting the verified one
      // silently would re-attribute everything they have authored so far.
      toast(t("identity.mismatch", {
        declared: outcome.declared, verified: outcome.verified,
      }));
      break;
    case "no-identity":
      toast(t("identity.stateNone"));
      break;
    default:
      toast(t("identity.verifyFailed", { detail: outcome.detail }));
  }
}

/**
 * THE GATE. Data preparation never asks this question; publishing always does.
 *
 * Returns true when the action may proceed. When it may not, it does NOT throw
 * an error at the user: it explains what is missing and opens the place where
 * it is fixed. Refusing an action is a moment to help, not to scold.
 */
function requireVerifiedIdentity(): boolean {
  const gate = publishGate();
  if (gate.allowed) return true;
  if (gate.reason === "no-identity") {
    toast(t("identity.gateNoIdentity"));
  } else {
    toast(t("identity.gateNotVerified", { orcid: gate.orcid }));
  }
  openSettings("settings-sect-identity");
  return false;
}

function openSettings(section?: string): void {
  const s = getSettings();
  setToolSel.value = s.sync.tool;
  setProtoSel.value = s.sync.protocol;
  setHostInp.value = s.sync.host;
  setPortInp.value = String(s.sync.port);
  const hubUrlInp = document.getElementById("set-hub-url") as HTMLInputElement | null;
  const hubRoomInp = document.getElementById("set-hub-room") as HTMLInputElement | null;
  if (hubUrlInp) hubUrlInp.value = s.sync.hubUrl ?? "";
  if (hubRoomInp) hubRoomInp.value = s.sync.hubRoom ?? "";
  setDevUuid.checked = s.developer.showNodeIds;
  setEdgeTips.checked = s.interaction.edgeTooltips;
  setStrictDocNames.checked = s.interaction.strictDocumentNames;
  setAiProvider.value = s.ai.provider;
  setAiModel.value = s.ai.model;
  setAiKey.value = "";
  setAtonBase.value = s.viewer.atonBase;
  setHeriverseApp.value = s.viewer.heriverseApp;
  const iiifInput = document.getElementById("set-iiif-base") as HTMLInputElement | null;
  if (iiifInput) iiifInput.value = s.iiif.base;
  const miradorInput = document.getElementById("set-mirador") as HTMLInputElement | null;
  if (miradorInput) miradorInput.value = s.iiif.mirador;
  void refreshAiKeyState();
  refreshIdentityPanel();
  refreshSyncUrlPreview();
  refreshAtonUrlPreview();
  settingsModal.classList.remove("hidden");
  // The tab FIRST, then the block: revealing something inside a hidden tab
  // scrolls against a panel that is not laid out, and lands nowhere.
  showSettingsTab(section ? tabOfSection(section) : lastSettingsTab());
  if (section) revealBlock(document.getElementById(section));
}

// ── the settings TABS ────────────────────────────────────────────────────────
//
// Nine sections in one scroll is a list you read by scrolling past what you did
// not come for. Tabs cost one thing — you can no longer see everything at once —
// and buy the thing that matters here: the panel opens ON what you asked for.
//
// Derived from the markup, never listed here: each `<section>` carries
// `data-settings-tab`, and the strip is whatever those attributes say, in DOM
// order. A hardcoded list would be a second place to edit and the first one to
// go stale — the rule this codebase already follows for node types and palettes.

/** Remembering where you were: a settings dialog that reopens on the first tab
 *  makes you navigate back every time you fix two related things. */
const SETTINGS_TAB_KEY = "emstudio.settings.tab";

function settingsSections(): HTMLElement[] {
  return [...settingsModal.querySelectorAll<HTMLElement>("[data-settings-tab]")];
}

function settingsTabIds(): string[] {
  const seen: string[] = [];
  for (const section of settingsSections()) {
    const tab = section.dataset.settingsTab ?? "";
    if (tab && !seen.includes(tab)) seen.push(tab);
  }
  return seen;
}

/** Which tab holds this section — by element id, the way every caller asks. */
function tabOfSection(sectionId: string): string | null {
  const section = document.getElementById(sectionId);
  return section?.dataset.settingsTab ?? null;
}

function lastSettingsTab(): string | null {
  try {
    return localStorage.getItem(SETTINGS_TAB_KEY);
  } catch {
    return null;                       // private mode: a forgotten tab, no more
  }
}

function showSettingsTab(wanted: string | null): void {
  const tabs = settingsTabIds();
  if (!tabs.length) return;
  // An unknown tab (a stale localStorage value after a section was renamed) is
  // not an error state to show: fall back to the first, silently.
  const active = wanted && tabs.includes(wanted) ? wanted : tabs[0];
  for (const section of settingsSections()) {
    section.classList.toggle("hidden", section.dataset.settingsTab !== active);
  }
  for (const button of settingsTabBar.querySelectorAll<HTMLButtonElement>(
    "[data-tab-target]")) {
    const isActive = button.dataset.tabTarget === active;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    // Roving tabindex: one stop for the whole strip, then ← → inside it. A
    // tab strip that costs nine tab-presses to walk past is a worse dialog
    // than the scrolling one it replaced.
    button.tabIndex = isActive ? 0 : -1;
  }
  // The scroll belongs to the tab, not to the dialog: arriving on a tab
  // half-way down the previous one's scroll is disorienting.
  settingsModal.querySelector(".modal-body")?.scrollTo({ top: 0 });
  try {
    localStorage.setItem(SETTINGS_TAB_KEY, active);
  } catch {
    /* not remembering is not a failure worth reporting */
  }
}

const settingsTabBar = document.getElementById("settings-tabs")!;

function buildSettingsTabs(): void {
  settingsTabBar.textContent = "";
  for (const tab of settingsTabIds()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "settings-tab";
    button.dataset.tabTarget = tab;
    button.setAttribute("role", "tab");
    // `data-i18n` rather than a label written here: a language switch
    // re-translates the static DOM in one pass, and these come along.
    button.dataset.i18n = `settings.tab.${tab}`;
    button.textContent = t(`settings.tab.${tab}`);
    button.addEventListener("click", () => showSettingsTab(tab));
    settingsTabBar.appendChild(button);
  }
  settingsTabBar.addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent).key;
    const step = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const tabs = settingsTabIds();
    const here = tabs.indexOf(lastSettingsTab() ?? tabs[0]);
    const next = tabs[(here + step + tabs.length) % tabs.length];
    showSettingsTab(next);
    settingsTabBar.querySelector<HTMLButtonElement>(
      `[data-tab-target="${next}"]`)?.focus();
  });
}

buildSettingsTabs();

/**
 * Bring a block into view and say so — the last step of every "open the panel ON
 * this" action (WIN7).
 *
 * The reflow read is not decoration: the caller has just un-hidden or rebuilt
 * the panel, and scrolling before the browser has laid it out scrolls against a
 * zero height. Doing it synchronously (rather than in a rAF) also means it works
 * in a window that is not being painted.
 */
function revealBlock(target: HTMLElement | null): void {
  if (!target) return;
  void target.offsetHeight; // flush layout before asking where it is
  target.scrollIntoView({ block: "start", behavior: "auto" });
  target.classList.add("settings-sect-flash");
  setTimeout(() => target.classList.remove("settings-sect-flash"), 1400);
}
function closeSettings(): void {
  settingsModal.classList.add("hidden");
}
for (const el of [setProtoSel, setHostInp, setPortInp])
  el.addEventListener("input", refreshSyncUrlPreview);
for (const el of [setAtonBase, setHeriverseApp])
  el.addEventListener("input", refreshAtonUrlPreview);
(document.getElementById("btn-settings") as HTMLButtonElement).addEventListener(
  "click",
  () => openSettings(),
);

// ── IDENTITY · the wiring ───────────────────────────────────────────────────
document.getElementById("set-orcid-declare")?.addEventListener(
  "click", () => declareIdentityFromPanel());
document.getElementById("set-orcid-verify")?.addEventListener(
  "click", () => void verifyIdentityFlow());
// Enter in the iD field declares: typing an identifier and pressing return is
// the gesture, and making people reach for a button afterwards is friction with
// no purpose.
document.getElementById("set-orcid")?.addEventListener("keydown", (e) => {
  if ((e as KeyboardEvent).key === "Enter") declareIdentityFromPanel();
});
document.getElementById("footer-identity")?.addEventListener(
  "click", () => openSettings("settings-sect-identity"));

// ── SHELF1 · the wide list's own verbs ──────────────────────────────────────
restoreShelf();                       // a saved list that vanishes on reload is not saved
onShelfChange(() => {
  if (activeWin().type === "shelf") renderShelf();
});
// MULTIGRAPH · take another project into this one (additive, merge-by-UUID).
document.getElementById("btn-add-project")?.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,.em.json,.emj";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      loadContainerDocument(JSON.parse(await file.text()), file.name, null,
                            { additive: true });
    } catch (e) {
      toast(`${file.name}: ${e instanceof Error ? e.message : e}`);
    }
  });
  input.click();
});

document.getElementById("storage-add-root")?.addEventListener(
  "click", () => void addStorageRoot());
document.getElementById("shelf-add-url")?.addEventListener("click", () => addUrlToShelf());
document.getElementById("shelf-url")?.addEventListener("keydown", (e) => {
  if ((e as KeyboardEvent).key === "Enter") addUrlToShelf();
});
document.getElementById("shelf-save")?.addEventListener("click", () => saveShelf());
document.getElementById("shelf-open")?.addEventListener("click", () => openShelfFile());
document.getElementById("shelf-name")?.addEventListener("change", (e) => {
  renameShelf((e.target as HTMLInputElement).value);
});
{
  // The scope of a hand-added URI, from the datamodel's own list — a comparandum
  // is `other-HDT`, and the person adding one says so here rather than editing
  // the entry afterwards.
  const sel = document.getElementById("shelf-url-scope") as HTMLSelectElement | null;
  if (sel) {
    for (const scope of SHELF_SCOPES) {
      const option = document.createElement("option");
      option.value = scope;
      option.textContent = t(`shelf.scope.${scope}`);
      sel.appendChild(option);
    }
    sel.value = shelfUrlScope;
    sel.addEventListener("change", () => {
      shelfUrlScope = sel.value as ShelfScope;
    });
  }
}

// THE GATE, on the one publication-shaped action there is. Note what is NOT
// here: Save, Save As, Export SVG/GraphML/TTL. Those put a file on your own
// disk — preparation, not publication — and gating them would make the tool
// useless exactly where it is most needed, in a trench with no network.
document.getElementById("btn-publish")?.addEventListener("click", () => {
  if (!requireVerifiedIdentity()) return;
  // Verified, and still nothing to publish TO: the StratiGraph delivery
  // endpoint is phase 2. Saying so is the honest end of this path — the gate is
  // real and measurable today, the destination is not there yet.
  toast(t("identity.publishNotConnected"));
});
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
      // MODES1 · the direction is not edited here: it is a live control in the
      // footer, changed while working. Carried through so saving the endpoint
      // does not silently reset what the channel is doing.
      direction: getSettings().sync.direction,
      // P4.3 · the room's address. The token is NOT here: it is asked for at
      // connection time and never written down.
      hubUrl: (document.getElementById("set-hub-url") as HTMLInputElement)?.value.trim() ?? "",
      hubRoom: (document.getElementById("set-hub-room") as HTMLInputElement)?.value.trim() ?? "",
    },
    developer: { showNodeIds: setDevUuid.checked },
    interaction: {
      edgeTooltips: setEdgeTips.checked,
      strictDocumentNames: setStrictDocNames.checked,
    },
    // provider + model only — the key is never part of what gets persisted
    ai: {
      provider: setAiProvider.value || "claude",
      model: setAiModel.value.trim(),
    },
    viewer: {
      atonBase: setAtonBase.value.trim().replace(/\/+$/, ""),
      heriverseApp:
        setHeriverseApp.value.trim().replace(/^\/+|\/+$/g, "") || "a/heriverse",
    },
    iiif: {
      base: (document.getElementById("set-iiif-base") as HTMLInputElement)
        ?.value.trim().replace(/\/+$/, "") ?? "",
      mirador: (document.getElementById("set-mirador") as HTMLInputElement)
        ?.value.trim() || getSettings().iiif.mirador,
    },
  };
  saveSettings(next);
  closeSettings();
  refreshInspector(); // reflect the UUID-visibility toggle immediately
  // A narrative on screen may hold 3D blocks that were waiting for exactly this.
  refreshNarrativeView();
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

// ── Resources panel (R5): the EMStudio face of the shared Resource layer, over
// the em-bridge (single connector). Sections Documents · RM · DTC · Shelf.
// Shelf = the orphans from /scan-resources on a chosen library/DosCo folder;
// hatting one creates a Document whose node_id ADOPTS the FS stable ID (mirror
// R4). Per-graph view; canvas/palette untouched (additive).
/** SHELF1 · a candidate from the ORPHAN SCAN of a folder — Model B.
 *
 * Renamed from `ShelfEntry`, because it is not the shelf: the design note is
 * explicit that the orphan scan is an ENTRANCE to the shelf, not the shelf
 * itself. Keeping the old name meant two different things called the same word
 * in one file, and the one that was NOT the shelf held the name.
 */
interface OrphanEntry {
  resource_id: string;
  key_id: string;
  filename: string;
  rel_path: string;
}
interface ResourceRow {
  id: string;
  name: string;
  locator: string;
  kind: string;
}
// The Document node_type comes from the datamodel (no hardcoded string).
const RES_DOC_TYPE = nodeTypeForClass("DocumentNode") ?? "document";
// The resource (link) node_type — datamodel-driven, not hardcoded.
const RES_LINK_TYPE = nodeTypeForClass("ResourceNode") ?? "resource";
const resourcesModal = document.getElementById("resources-modal")!;
const resFolderInp = document.getElementById("res-folder") as HTMLInputElement;
const resStatus = document.getElementById("res-status")!;
const resShelf = document.getElementById("res-shelf")!;
const resShelfCount = document.getElementById("res-shelf-count")!;
const resDocs = document.getElementById("res-docs")!;
const resDocsCount = document.getElementById("res-docs-count")!;
const resLinks = document.getElementById("res-links")!;
const resLinksCount = document.getElementById("res-links-count")!;
let resLastShelf: OrphanEntry[] = [];

function openResources(): void {
  if (!store) {
    toast("Open a document first");
    return;
  }
  renderResDocuments();
  void renderResLinks();
  resStatus.textContent = resFolderInp.value.trim()
    ? "Press Scan to refresh the Shelf."
    : "Set a library / DosCo folder, then Scan.";
  resourcesModal.classList.remove("hidden");
}
function closeResources(): void {
  resourcesModal.classList.add("hidden");
}

// ── previews (N10) ────────────────────────────────────────────────────────────
// Every asset row carries its own preview, lazily: the thumbnail fetches only
// when the row is scrolled into view, addressed by the resource's STABLE ID (the
// bridge resolves it through the folder manifest or the graph's resolver — the
// page never sees a filesystem path). See `resource-preview.ts`.
//
// The folder is passed whenever the user has set one, because the FS manifest and
// the graph share ONE id space: a hatted Document adopted its FS stable id, so it
// previews from the same manifest the Shelf uses, with no extra machinery.
function previewFolder(): string | undefined {
  return resFolderInp.value.trim() || undefined;
}

/** A row: preview · label(+badges) · actions. */
function resRow(thumb: HTMLElement | null, label: string,
                sub?: string): { row: HTMLElement; main: HTMLElement } {
  const row = document.createElement("div");
  row.className = "res-row";
  if (thumb) row.appendChild(thumb);
  const main = document.createElement("div");
  main.className = "res-row-main";
  const title = document.createElement("span");
  title.className = "res-row-title";
  title.textContent = label;
  main.appendChild(title);
  if (sub) {
    const s = document.createElement("span");
    s.className = "res-row-sub";
    s.textContent = sub;
    main.appendChild(s);
  }
  row.appendChild(main);
  return { row, main };
}

function renderResDocuments(): void {
  if (!store) return;
  const docs = store.doc.graph.nodes.filter(
    (n) => n.node_type === RES_DOC_TYPE,
  );
  resDocs.innerHTML = "";
  resDocsCount.textContent = docs.length ? `(${docs.length})` : "";
  if (!docs.length) {
    resDocs.innerHTML = `<div class="res-empty">— no documents yet</div>`;
    return;
  }
  const docJson = JSON.parse(store.toJSON());
  for (const d of docs) {
    const data = (d.data ?? {}) as Record<string, unknown>;
    const locator = typeof data.url === "string" ? data.url : undefined;
    const label = String(d.name || d.id.slice(0, 8));
    const thumb = createResourceThumb({
      resourceId: d.id,
      folder: previewFolder(),
      doc: docJson,
      bridge: bridgeUrl,
      // IIIF · a document that IS a published image gets its thumbnail from the
      // image server instead of a round trip through the bridge
      node: d,
      declaredType: typeof data.resource_type === "string"
        ? data.resource_type : undefined,
      locator,
      label,
    });
    const { row } = resRow(thumb, label);
    resDocs.appendChild(row);
  }
}

function renderResShelf(): void {
  resShelf.innerHTML = "";
  resShelfCount.textContent = resLastShelf.length
    ? `(${resLastShelf.length})`
    : "";
  if (!resLastShelf.length) {
    resShelf.innerHTML = `<div class="res-empty">— Shelf empty (all resources hatted / matched)</div>`;
    return;
  }
  for (const e of resLastShelf) {
    // A Shelf entry is not (yet) a graph node, so its preview resolves through
    // the FOLDER manifest alone — no em.json needs to travel per row.
    const thumb = createResourceThumb({
      resourceId: e.resource_id,
      folder: previewFolder(),
      bridge: bridgeUrl,
      locator: e.filename,
      label: e.filename,
    });
    const { row } = resRow(thumb, e.filename, e.key_id);
    const btn = document.createElement("button");
    btn.textContent = "→ Document";
    btn.title =
      "Create a Document adopting this resource's stable ID as its node id";
    btn.addEventListener("click", () => hatShelfEntry(e));
    row.appendChild(btn);
    resShelf.appendChild(row);
  }
}

async function scanResources(): Promise<void> {
  if (!store) return;
  const folder = resFolderInp.value.trim();
  if (!folder) {
    resStatus.textContent = "Set a folder first.";
    return;
  }
  resStatus.textContent = "Scanning…";
  try {
    const res = await fetch(`${await bridgeUrl()}/scan-resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder, doc: JSON.parse(store.toJSON()) }),
    });
    if (!res.ok) {
      let msg = `bridge error ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* non-JSON */
      }
      resStatus.textContent = `Scan failed: ${msg}`;
      return;
    }
    const j = await res.json();
    resLastShelf = (j.shelf ?? []) as OrphanEntry[];
    renderResShelf();
    resStatus.textContent = `Indexed folder — ${resLastShelf.length} on the Shelf.`;
  } catch {
    resStatus.textContent = BRIDGE_UNREACHABLE;
  }
}

// Hat: promote a Shelf orphan → a Document ADOPTING the FS stable ID as node_id.
// em.json is the source of truth (the mutation is a plain addNode in the store);
// the resource then leaves the Shelf because its stable ID is now a graph node.
function hatShelfEntry(entry: OrphanEntry): void {
  if (!store) return;
  if (store.node(entry.resource_id)) {
    toast("A node with this stable ID already exists");
    return;
  }
  store.addNode({
    id: entry.resource_id, // ADOPT the FS stable ID
    name: entry.key_id || entry.resource_id.slice(0, 8),
    node_type: RES_DOC_TYPE,
    description: "",
    data: {},
  });
  resLastShelf = resLastShelf.filter(
    (e) => e.resource_id !== entry.resource_id,
  );
  renderResShelf();
  renderResDocuments();
  toast(`Hatted ${entry.key_id || "resource"} → Document`);
}

// ── Resources (link nodes) list + "Promote to MinIO" ───────────────────────────
// Lists the graph's resources via the bridge (/list-resources — single connector).
// Promote uploads a LOCAL resource's bytes into the shared MinIO under its OWN
// stable ID (one ID space FS↔MinIO), then repoints its ResourceNode locator at the
// returned s3:// URI. The stable ID and every graph reference are unchanged.
async function renderResLinks(): Promise<void> {
  if (!store) return;
  resLinks.innerHTML = `<div class="res-empty">loading…</div>`;
  let rows: ResourceRow[] = [];
  try {
    const res = await fetch(`${await bridgeUrl()}/list-resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc: JSON.parse(store.toJSON()) }),
    });
    if (res.ok) rows = ((await res.json()).resources ?? []) as ResourceRow[];
    else rows = listResourcesFromStore(); // bridge down → local fallback
  } catch {
    rows = listResourcesFromStore();
  }
  resLinks.innerHTML = "";
  resLinksCount.textContent = rows.length ? `(${rows.length})` : "";
  if (!rows.length) {
    resLinks.innerHTML = `<div class="res-empty">— no resources yet</div>`;
    return;
  }
  const docJson = JSON.parse(store.toJSON());
  for (const r of rows) {
    const node = store.node(r.id);
    const data = (node?.data ?? {}) as Record<string, unknown>;
    const label = String(r.name || r.id.slice(0, 8));
    const thumb = createResourceThumb({
      resourceId: r.id,
      folder: previewFolder(),
      doc: docJson,
      bridge: bridgeUrl,
      node,
      declaredType: typeof data.resource_type === "string"
        ? data.resource_type : undefined,
      locator: r.locator,
      label,
    });
    const { row } = resRow(thumb, label, r.kind);
    // Promote is offered only for LOCAL resources (a path we can upload);
    // already-remote (s3/http) resources have nothing to push.
    if (r.kind === "local_path" || r.kind === "file_uri") {
      const btn = document.createElement("button");
      btn.textContent = "Promote to MinIO";
      btn.title = "Upload into the shared MinIO (keeps the stable ID) and repoint the locator";
      btn.addEventListener("click", () => void promoteToMinio(r, btn));
      row.appendChild(btn);
    }
    resLinks.appendChild(row);
  }
}

// Local fallback when the bridge is unreachable: read the link nodes straight
// from the in-memory em.json (kind classified the same way the bridge does).
function listResourcesFromStore(): ResourceRow[] {
  if (!store) return [];
  const out: ResourceRow[] = [];
  for (const n of store.doc.graph.nodes) {
    if (n.node_type !== RES_LINK_TYPE) continue;
    const url = String((n.data as Record<string, unknown>)?.url ?? "");
    const low = url.toLowerCase();
    const kind = low.startsWith("http://") || low.startsWith("https://")
      ? "http_url"
      : low.startsWith("s3://")
        ? "s3_uri"
        : low.startsWith("file://")
          ? "file_uri"
          : "local_path";
    out.push({ id: n.id, name: String(n.name ?? ""), locator: url, kind });
  }
  return out;
}

async function promoteToMinio(r: ResourceRow, btn: HTMLButtonElement): Promise<void> {
  if (!store) return;
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = "Promoting…";
  try {
    const res = await fetch(`${await bridgeUrl()}/ingest-minio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // resource_id = the resource's stable ID → same id in FS and MinIO
      body: JSON.stringify({ path: r.locator, resource_id: r.id }),
    });
    if (!res.ok) {
      let msg = `bridge error ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* non-JSON */
      }
      // 501 = the [minio] extra isn't bundled — a clear, graceful message.
      toast(res.status === 501 ? `MinIO unavailable: ${msg}` : `Promote failed: ${msg}`);
      btn.disabled = false;
      btn.textContent = prev;
      return;
    }
    const j = (await res.json()) as { s3_uri: string; object_key: string };
    // Repoint the ResourceNode locator at the shared-store URI (id + refs unchanged).
    const node = store.node(r.id);
    const data = { ...((node?.data as Record<string, unknown>) ?? {}), url: j.s3_uri };
    store.updateNode(r.id, { data });
    toast(`Promoted → ${j.s3_uri}`);
    await renderResLinks();
  } catch {
    toast(BRIDGE_UNREACHABLE);
    btn.disabled = false;
    btn.textContent = prev;
  }
}

(document.getElementById("btn-resources") as HTMLButtonElement).addEventListener(
  "click",
  openResources,
);
(
  document.getElementById("resources-close") as HTMLButtonElement
).addEventListener("click", closeResources);
(
  document.getElementById("resources-done") as HTMLButtonElement
).addEventListener("click", closeResources);
(document.getElementById("res-scan") as HTMLButtonElement).addEventListener(
  "click",
  scanResources,
);
resourcesModal.addEventListener("click", (e) => {
  if (e.target === resourcesModal) closeResources();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !resourcesModal.classList.contains("hidden")) {
    e.stopPropagation();
    closeResources();
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
  refreshFunnel();
}

/**
 * The funnel is shown when it has something to filter: a document open, a CANVAS
 * window (nodes and connectors are not on a table or a document), and the panel
 * itself not already open in its place. One rule, called from every route that
 * could change one of those three — otherwise each route re-decides and they
 * disagree, which is how the funnel ended up on the narrative.
 */
function refreshFunnel(): void {
  const belongs =
    !!store && activeWindowType() === "graph" && !filterPanelOpen();
  btnViewProps.classList.toggle("hidden", !belongs);
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
  hint.textContent = `Detail level — ${t(`mode.${view}`)} view`;
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

// WIN-FIX1 · the side-panel TABS are gone with the aside they belonged to.
//
// Inspector / Nodes / EMTree / Log are WINDOWS now (WIN6, WIN7), and StratiMiner
// is a floating tool. What was left of the aside was a strip of tabs whose
// panels lived somewhere else and a collapse handle for an empty column. The
// `#side` element stays in the DOM, permanently hidden, as the PARKING PLACE a
// panel returns to when nothing is showing it — those panels are singletons with
// handlers wired at boot, so they must always have somewhere to be.
//
// Everything that used to ask "which aside tab is active?" now asks the only
// question that is left: is this panel mounted in a window or a tool?

// ── EMTree ────────────────────────────────────────────────────────────────────

function refreshEMTree(): void {
  // WIN6/WIN7/WIN-FIX1 · the panel lives in a window (focused or not) or in the
  // floating tool. Skip the work only when it is nowhere visible.
  if (!panelIsMounted(emtreeEl)) return; // rebuilt on show; no work while hidden
  // The panel asks for its text by key and `t` resolves it in the active
  // language: ET1 already went through a key lookup, so I18N1 was this one line.
  renderEMTree(emtreeEl, emtree, emtreeHandlers, t);
}

/**
 * Open the EMtree — the graphs of this workspace — even with no document loaded.
 *
 * Reached from the empty-state hint ("open the workspace"), which is exactly the
 * moment it matters: the tree is where you go to OPEN a graph, so gating it
 * behind having one would put the tool behind the problem it solves.
 *
 * WIN-FIX1 · it is a WINDOW now, not an aside tab. If the arrangement already
 * has an EMtree area, go there; otherwise this window becomes one — the same
 * transform every other "show me that instead" performs.
 */
function openEMTree(): void {
  const existing = windowsOf().find((w) => w.type === "emtree");
  if (existing) {
    selectWindow(existing.id);
    return;
  }
  const win = activeWin();
  setWinType(win, "emtree");
  setWinCurrent(win, "panel", "emtree");
  mountWindow(win);
  renderTiles();
  renderAreaHeaders();
}

const emtreeHandlers: EMTreeHandlers = {
  onActivate: (id) => {
    if (id === emtree.activeId) return;
    activateSlot(id);
  },
  onRemove: (id) => {
    const slot = emtree.get(id);
    if (!slot) return;
    // Unsaved work is the one thing a close must not take silently.
    if (slot.store.dirty
        && !confirm(t("emtree.unsaved", { name: slotLabel(slot) }))) {
      return;
    }
    const nextId = emtree.remove(id);
    if (nextId) {
      // The neighbour becomes active. `activateSlot` refuses a no-op switch, so
      // force the swap by clearing our idea of "current" first — remove() has
      // already moved `activeId`, and the store still points at the closed slot.
      store = null;
      activateSlot(nextId);
    } else {
      closeWorkspace();
    }
    refreshEMTree();
  },
  onOpen: () => void openDocument(),
  onNew: () => newDocument(),
  onOpenRecent: (r) => void openRecentFile(r),
  // AUX1 · auxiliary files live on the SLOT and never in em.json, so every one of
  // these mutates `slot.auxiliaryFiles` and re-renders the tree — none of them
  // touches `store`, which is what keeps an un-baked aux out of a shared document.
  onAuxAdd: () => {
    const slot = emtree.active();
    if (!slot) {
      toast("Open a graph first");
      return;
    }
    // The BROWSER picker cannot give an absolute path (same limit as StratiMiner's
    // folder field): it gives a name, and `webkitRelativePath`'s first segment for
    // a directory. On desktop the native dialog gives the real path. Either way
    // the locator is what a future mapping will resolve — nothing reads it today.
    auxFileInput.click();
  },
  onAuxRemove: (auxId) => {
    const slot = emtree.active();
    if (!slot) return;
    const i = slot.auxiliaryFiles.findIndex((f) => f.id === auxId);
    if (i < 0) return;
    const [gone] = slot.auxiliaryFiles.splice(i, 1);
    // AUX2: if it was mapped, its volatile nodes must go with it (they were
    // never in em.json, so this only touches the in-memory graph).
    if (gone.mapped && store) store.dropVolatile(auxId);
    refreshEMTree();
    toast(`removed ${gone.name} (the document is untouched)`);
  },
  onAuxToggle: (auxId) => {
    const f = emtree.active()?.auxiliaryFiles.find((x) => x.id === auxId);
    if (!f) return;
    f.expanded = !f.expanded;
    refreshEMTree();
  },
  onAuxTypeChange: (auxId, fileType) => {
    const f = emtree.active()?.auxiliaryFiles.find((x) => x.id === auxId);
    if (!f) return;
    f.fileType = fileType;
    refreshEMTree();
  },
  onAuxOption: (auxId, key, value) => {
    const f = emtree.active()?.auxiliaryFiles.find((x) => x.id === auxId);
    if (!f) return;
    (f.options ??= {})[key] = value;
    // no re-render: the field already holds the value; a rebuild would drop focus
  },
  onAuxMap: (auxId) => void mapAux(auxId),
  onAuxUnmap: (auxId) => {
    const f = emtree.active()?.auxiliaryFiles.find((x) => x.id === auxId);
    if (!f || !store) return;
    const n = store.dropVolatile(auxId);
    f.mapped = false;
    f.baked = false;
    refreshEMTree();
    toast(`unmapped ${f.name} — ${n} volatile node(s) removed`);
  },
  onAuxBake: (auxId) => {
    const f = emtree.active()?.auxiliaryFiles.find((x) => x.id === auxId);
    if (!f || !store) return;
    if (!f.mapped) {
      toast("map the source first, then bake");
      return;
    }
    const n = store.bakeVolatile(auxId);
    f.baked = true;
    refreshEMTree();
    toast(`baked ${f.name} — ${n} node(s) now persistent (saved with em.json)`);
  },
  onRename: (id, name) => {
    // POL3: renaming a row renames the GRAPH — `emtree.rename` writes
    // `graph.name` in that slot's document, which is the single source. For the
    // ACTIVE slot the store's change listener already refreshes the tree, the
    // Inspector and the title; these calls cover the other case, a background
    // slot renamed from the list (whose listener deliberately returns early).
    emtree.rename(id, name);
    refreshEMTree();
    refreshInspector(); // the Inspector's Name field is the same fact
    updateWindowTitle();
  },
};

/**
 * Name problems in the active document, keyed by node id (NAME1).
 *
 * Computed ONCE per document change and read by the renderer (label colour) and
 * the context menu (the rename entry), so the two cannot disagree about what is
 * wrong. Recomputing per draw would also work — `naming.ts` is pure and the graph
 * is the only input — but the answer only changes when the graph does.
 *
 * There is no cache to invalidate: renaming a document makes its extractors
 * inconsistent, and that shows up because the map is rebuilt from the graph, not
 * patched.
 */
let nameStatus: Map<string, NameCheck> = new Map();

function namingOpts(): { strictDocumentNames: boolean } {
  return { strictDocumentNames: getSettings().interaction.strictDocumentNames };
}

function refreshNameStatus(): void {
  nameStatus = store ? nameStatusMap(store.doc, namingOpts()) : new Map();
}

/** The last graph was closed: back to the empty canvas, without a stale view. */
function closeWorkspace(): void {
  store = null;
  currentFilePath = null;
  contextStack = [];
  contextScene = null;
  hoverId = null;
  selectedId = null;
  selectedIds = new Set();
  selectedNarrativeId = null;
  matrixViewLayout = null;
  graphOverrides.clear();
  dtcOverrides.clear();
  multigraphOverrides.clear();
  resetWindowCameras();
  phasesCollapsed.clear();
  scenes.matrix = null;
  scenes.graph = null;
  scenes.dtc = null;
  scenes.multigraph = null;
  dropHint.classList.remove("hidden");
  info.textContent = t("toast.openOrDrop");
  select(null);
  nodeList.refresh();
  updateToolbar();
  updateBreadcrumb();
  updateLegend();
  refreshInspector();
  refreshNarrativeView();
  draw();
  logInfo(t("toast.workspaceEmpty"));
}

// ── language ──────────────────────────────────────────────────────────────────
//
// The selector, and what happens on a switch. Two kinds of string need two
// treatments and that is the whole design:
//
//  * **static chrome** (toolbar, tabs, Settings) carries `data-i18n` in the HTML
//    and is re-translated in place by `applyStaticTranslations`. Rewriting the
//    toolbar as TS just to make it translatable would have been a large change
//    for nothing; an attribute per element is the smaller promise.
//  * **rendered panels** (EMTree, StratiMiner, the inspector) call `t()` while
//    they build, so they only need re-rendering.
function populateLanguageSelect(): void {
  const select = document.getElementById("set-language") as HTMLSelectElement | null;
  if (!select) return;
  select.innerHTML = LOCALES.map((locale) => {
    // Two different facts, in order of what a reader needs to know:
    //  · not validated → say so. All six drafts answer 100% of the keys, so a
    //    percentage would now read as "finished" and hide the thing that matters:
    //    nobody has checked the terminology yet.
    //  · incomplete → the percentage, because then English shows through and
    //    somebody picking that language deserves to know why it barely changed.
    let suffix = "";
    if (!isValidated(locale.code)) {
      suffix = ` — ${t("settings.aiDraft")}`;
    } else {
      const done = Math.round(coverage(locale.code) * 100);
      if (done < 100) suffix = ` — ${done}% ${t("settings.translated")}`;
    }
    return `<option value="${locale.code}">${locale.label}${suffix}</option>`;
  }).join("");
  select.value = getLocale();
  refreshValidateToggle();
}

/**
 * The "mark validated" tick, for the language currently in use (POL3).
 *
 * Offered only for a locale that is NOT already validated in the source: for
 * `en`/`it` the row would be a control that cannot change anything, which reads
 * as broken rather than as settled.
 */
function refreshValidateToggle(): void {
  const row = document.getElementById("set-lang-validate-row");
  const hint = document.getElementById("set-lang-validate-hint");
  const box = document.getElementById("set-lang-validate") as HTMLInputElement | null;
  if (!row || !hint || !box) return;
  const code = getLocale();
  const inBuild = isValidatedInBuild(code);
  row.classList.toggle("hidden", inBuild);
  hint.classList.toggle("hidden", inBuild);
  box.checked = isValidated(code);
}

document.getElementById("set-lang-validate")?.addEventListener("change", (event) => {
  const on = (event.target as HTMLInputElement).checked;
  setValidated(getLocale(), on);
  // The badge lives in the selector's own option labels, so the selector has to be
  // rebuilt — which also re-reads the tick, keeping the two in step.
  populateLanguageSelect();
  toast(on ? t("settings.markValidated") : t("settings.aiDraft"));
});

function applyLanguage(code: Locale): void {
  setLocale(code);          // persists, sets dir/lang, re-translates the static DOM
  populateLanguageSelect(); // the percentages carry a translated word themselves
  // Everything that renders its own text:
  refreshEMTree();
  refreshStratiMiner();
  refreshInspector();
  nodeList.refresh();
  refreshNarrativeView();
  updateLegend();
  updateToolbar();
  draw();                   // the canvas draws no chrome, but the legend feeds it
}

document.getElementById("set-language")?.addEventListener("change", (event) => {
  applyLanguage((event.target as HTMLSelectElement).value as Locale);
});

// ── StratiMiner ───────────────────────────────────────────────────────────────
//
// The panel owns no logic: it renders state and calls back. The three bridge
// calls live here because endpoint precedence (`bridgeUrl`) is owned here, and
// because loading the produced document is `loadDocument`'s job — the same entry
// point Open… and drop use, so a StratiMiner graph is not a second kind of
// document with its own quirks.
let smState = initialStratiMinerState();

function refreshStratiMiner(): void {
  renderStratiMiner(stratiminerEl, smState, smHandlers, { native: isTauri() });
}

// ── WIN7 · the floating one-shot tool ───────────────────────────────────────
//
// StratiMiner was a tab of the Inspector, and it never belonged there: every
// other tab DESCRIBES the graph you have open, and StratiMiner exists to MAKE
// one. It is a tool, not a view — you reach for it, it does its job, and it goes
// away. So it lives under Tools ▸ and opens as a panel floating over whatever
// arrangement you had, which is exactly the relationship: it does not want an
// area, because it is not going to stay.
//
// The panel itself is the SAME element, moved in from `#side` and moved back on
// close — the re-parenting the window surfaces use (WIN6), for the same reason:
// one StratiMiner, wherever it happens to be showing.

const toolFloat = document.getElementById("tool-float")!;
const toolFloatBody = document.getElementById("tool-float-body")!;
const toolFloatTitle = document.getElementById("tool-float-title")!;

/** The panel element the float is currently showing, if any. */
let floatingToolId: string | null = null;

function openFloatingTool(panelId: string, title: string): void {
  if (floatingToolId && floatingToolId !== panelId) closeFloatingTool();
  const el = document.getElementById(panelId);
  if (!el) return;
  el.classList.remove("hidden");
  toolFloatBody.appendChild(el);
  toolFloatTitle.textContent = title;
  toolFloat.classList.remove("hidden");
  floatingToolId = panelId;
  refreshPanelById(panelId);
  reflectEmptyAside();
}

function closeFloatingTool(): void {
  if (!floatingToolId) return;
  const el = document.getElementById(floatingToolId);
  if (el) {
    el.classList.add("hidden");
    sidePanel.appendChild(el); // its parking spot, as before
  }
  toolFloat.classList.add("hidden");
  floatingToolId = null;
  reflectEmptyAside();
}

/** True while StratiMiner is the tool on screen — the only condition under which
 *  its state changes are worth re-rendering. */
function stratiMinerOpen(): boolean {
  return floatingToolId === "stratiminer";
}

document
  .getElementById("tool-float-close")
  ?.addEventListener("click", closeFloatingTool);

// Drag it by its bar. A floating tool that cannot be moved is a tool that covers
// the thing you opened it to work on.
document.getElementById("tool-float-bar")?.addEventListener("mousedown", (e) => {
  if ((e.target as HTMLElement).id === "tool-float-close") return;
  e.preventDefault();
  const r = toolFloat.getBoundingClientRect();
  const dx = e.clientX - r.left;
  const dy = e.clientY - r.top;
  const move = (ev: MouseEvent): void => {
    toolFloat.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - dx))}px`;
    toolFloat.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy))}px`;
    toolFloat.style.right = "auto";
    toolFloat.style.transform = "none";
  };
  const up = (): void => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
});

/** Open StratiMiner, document or no document.
 *
 * It exists to MAKE the graph, so gating it behind having one would put the tool
 * behind the problem it solves. Reached from Tools ▸ and from the empty-state
 * hint — the two moments you would want it. */
function openStratiMiner(): void {
  openFloatingTool("stratiminer", t("tab.stratiminer"));
}
document
  .getElementById("btn-tool-stratiminer")
  ?.addEventListener("click", openStratiMiner);
document
  .getElementById("drop-hint-stratiminer")
  ?.addEventListener("click", (e) => {
    // The hint sits over the canvas; without this the click also reaches the
    // canvas handler underneath and starts a selection marquee.
    e.stopPropagation();
    openStratiMiner();
  });
document.getElementById("drop-hint-emtree")?.addEventListener("click", (e) => {
  e.stopPropagation();
  openEMTree();
});

// POL1 · the one epoch gesture. Adds at the TOP of the stack (newest), which is
// where an undated epoch belongs until the chronology sorts it in — the same
// `addEpochEmMode` the between-lanes "+" uses, so there is one code path and one
// behaviour rather than a palette special case beside it.
btnAddEpoch.addEventListener("click", (e) => {
  e.stopPropagation(); // the button sits over the canvas
  if (!store) return;
  addEpochEmMode();
});

// PALETTE-FIX · the old app-level column handles are gone, both of them.
//
// The right one went with the aside (WIN-FIX1). The left one collapsed a column
// of `<main>` that no longer exists: the palette is a sidebar of the ACTIVE AREA
// now, and the thing that opens and closes it is the chevron on that area's own
// edge (plus Tools ▸ Palette nodi). Two handles for one panel, one of them
// outside the window the panel belongs to, was the shape of the confusion.

/** Kept as a no-op call site: `updateToolbar` still asks the chrome to repaint,
 *  and this is where anything about the area's own panels would go. */
function paintColumnToggles(): void {}



function smSet(patch: Partial<typeof smState>): void {
  smState = { ...smState, ...patch };
  // WIN7 · the panel is in the floating tool now, not in an aside tab
  if (stratiMinerOpen()) refreshStratiMiner();
}

/** Read a bridge error body the way the narrative path does: the endpoint's own
 *  message when there is one, the status when there is not. A 501 here means
 *  "this build cannot", a 502 "the model failed" — different fixes, so the text
 *  matters more than the code. */
async function smBridgeError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j?.error) return String(j.error);
  } catch {
    /* non-JSON error body */
  }
  return `bridge error ${res.status}`;
}

const smHandlers: StratiMinerHandlers = {
  // Switching branch does NOT clear the fields: someone who tried the AI path and
  // fell back to writing the table by hand still has the folder they typed, and
  // the xlsx path is the shared destination of both branches anyway.
  onSourceChange: (v) => smSet({ source: v }),
  onFolderChange: (v) => smSet({ folder: v }),
  onXlsxChange: (v) => smSet({ xlsxPath: v }),
  onLanguageChange: (v) => smSet({ language: v }),

  onExtract: async () => {
    smSet({ busy: "extract", report: "", warnings: [] });
    toast("StratiMiner: estrazione in corso…");
    try {
      const res = await fetch(`${await bridgeUrl()}/stratiminer-extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder: smState.folder.trim(),
          language: smState.language.trim(),
          provider: getSettings().ai.provider,
          // No `model`: the bridge picks the per-task default, which for
          // extraction is a frontier model rather than the prose default.
          // Settings' model is the narrative one; sending it here would quietly
          // downgrade the harder task.
        }),
      });
      if (!res.ok) {
        const msg = await smBridgeError(res);
        smSet({ busy: "", report: `Estrazione non riuscita: ${msg}` });
        logError(`StratiMiner extract: ${msg}`);
        return;
      }
      const r = (await res.json()) as ExtractResult;
      smSet({
        busy: "",
        // Prefill step 3 — the two paths converge on this field, and having
        // just written the file we know where it is.
        xlsxPath: r.xlsx_path,
        report: describeExtraction(r),
        // Both lists, in one place: a column the writer refused and a source
        // nobody read are equally things to look at before trusting the table.
        warnings: [...r.warnings, ...unreadWarnings(r)],
      });
      toast("em_data.xlsx scritta — aprila e controllala prima di convertirla");
    } catch {
      smSet({ busy: "", report: BRIDGE_UNREACHABLE });
      logError(`StratiMiner extract: ${BRIDGE_UNREACHABLE}`);
    }
  },

  onCopyPrompt: async () => {
    smSet({ busy: "prompt", report: "", warnings: [], promptFallback: "" });
    let prompt = "";
    try {
      const res = await fetch(`${await bridgeUrl()}/stratiminer-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder: smState.folder.trim(),
          language: smState.language.trim(),
        }),
      });
      if (!res.ok) {
        const msg = await smBridgeError(res);
        smSet({ busy: "", report: `Prompt non disponibile: ${msg}` });
        return;
      }
      prompt = ((await res.json()) as PromptResult).prompt;
    } catch {
      smSet({ busy: "", report: BRIDGE_UNREACHABLE });
      return;
    }
    // Two failures worth telling apart: the bridge could not build the prompt
    // (above — nothing to show), or the prompt exists and only the clipboard
    // refused. In the second case the text is the deliverable, so hand it over
    // in a field rather than apologising for losing it.
    const runIt =
      `Eseguilo in una sessione Cowork che possa leggere la cartella, poi ` +
      `indica qui sotto l'em_data.xlsx che ne esce.`;
    try {
      await navigator.clipboard.writeText(prompt);
      smSet({
        busy: "",
        report: `Prompt copiato (${prompt.length} caratteri). ${runIt}`,
      });
      toast("Prompt StratiMiner copiato");
    } catch {
      smSet({
        busy: "",
        report:
          `Il browser ha negato l'accesso agli appunti — il prompt è qui ` +
          `sotto (${prompt.length} caratteri). ${runIt}`,
        promptFallback: prompt,
      });
    }
  },

  onTransform: async () => {
    smSet({ busy: "import", report: "", warnings: [] });
    try {
      const res = await fetch(`${await bridgeUrl()}/import-em-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: smState.xlsxPath.trim() }),
      });
      if (!res.ok) {
        const msg = await smBridgeError(res);
        smSet({ busy: "", report: `Conversione non riuscita: ${msg}` });
        logError(`StratiMiner import: ${msg}`);
        return;
      }
      const r = (await res.json()) as ImportResult;
      // The xlsx path is the source name, not a file EMStudio can save back
      // into: passing it as `path` would point Save at the workbook.
      loadDocument(r.doc, smState.xlsxPath.trim().split("/").pop() ?? "em_data");
      smSet({ busy: "", report: describeImport(r), warnings: r.warnings });
      // WIN7 · ONE-SHOT: the tool has done the thing it was opened for, and the
      // graph it just made is behind it. Anything it still had to say (the
      // import report, the warnings) is in the Log, which is a panel that stays.
      closeFloatingTool();
      toast("Grafo creato da em_data.xlsx");
    } catch {
      smSet({ busy: "", report: BRIDGE_UNREACHABLE });
      logError(`StratiMiner import: ${BRIDGE_UNREACHABLE}`);
    }
  },

  // Third way out for Path B, after the clipboard and the textarea. 33k characters
  // is not something to select by hand, and a file is what a Cowork session wants
  // anyway. A download and not the native save dialog on purpose: it works in both
  // deliveries, and this path only exists because something else already failed.
  onSavePrompt: () => {
    if (!smState.promptFallback) return;
    const blob = new Blob([smState.promptFallback], {
      type: "text/markdown;charset=utf-8",
    });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "StratiMiner_prompt.md";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    toast("Prompt salvato come StratiMiner_prompt.md");
  },

  onPickFolder: async () => {
    const picked = await pickFolder();
    if (picked) smSet({ folder: picked });
  },

  onPickXlsx: async () => {
    const picked = await pickXlsx();
    if (picked) smSet({ xlsxPath: picked });
  },
};

/** Click a warning → select the element it names and bring it into view.
 *
 * The same two steps the inspector's cross-references use (`onJump`), so a
 * warning behaves like every other link in the app. A node can legitimately be
 * absent from the current scene — folded into a group, filtered out by the
 * circles of detail, or simply on the other view — and silently doing nothing
 * would read as a broken button, so say what happened instead. */
function revealFromWarning(nodeId: string): void {
  if (!store) return;
  if (!store.node(nodeId)) {
    toast("that node is no longer in the document");
    return;
  }
  select(nodeId);
  if (scene()?.byId.has(nodeId)) centerOn(nodeId);
  else toast("selected — not visible in this view (folded, or filtered out)");
}

/** Redraw the Log tab — only when it is the visible one; there is no point
 *  rebuilding a hidden DOM on every sync message. */
function refreshLogPanel(): void {
  // same as the EMTree: the log panel lives in an Inspector WINDOW, focused or not
  if (!panelIsMounted(logpanelEl)) return;
  renderLogPanel(logpanelEl, store?.doc ?? null, EM_VERSION, revealFromWarning);
}
onLogChange(refreshLogPanel);
// ── Narrative view (N2) ───────────────────────────────────────────────────
// Rendered as an overlay over the canvas (Matrix and Graph are built on scenes,
// layout and circles-of-detail; a story is none of those), but it is a
// first-class central MODE now (DP-82): its on/off IS `centralMode === "narrative"`,
// driven by `setMode` — there is no separate `narrativeOpen` flag to drift.
let narrativeEditing = false;
let selectedNarrativeId: string | null = null;
/** Who is signing endorsements in this session. NOT persisted in the document:
 *  it is a fact about the person at the keyboard, not about the graph. What
 *  gets written is the signature itself (`block.validated_by`). */
let signingAs: string | null = null;

/**
 * Who signs, when nobody has said.
 *
 * With exactly ONE human author in the graph there is no choice to make, and
 * asking for one is a riddle rather than a safeguard — the user is deep inside
 * a chapter, the picker is in the byline far above, and the refusal tells them
 * where it is instead of taking them there. With two or more the question is
 * real and stays unanswered.
 *
 * This does not make anyone sign by accident: the ACT is still pressing
 * "Valida". This only fills in the name when the graph admits a single one.
 */
function defaultSigner(): string | null {
  if (!store) return null;
  const humans = nauth.humanAuthorsIn(store.doc);
  return humans.length === 1 ? humans[0].id : null;
}

function currentSigner(): string | null {
  if (signingAs) return signingAs;
  signingAs = defaultSigner();
  return signingAs;
}

/**
 * Bring the "firmo come" picker to the user instead of describing where it is.
 *
 * Called when an endorsement is attempted with no signer chosen — which only
 * happens when the graph has several human authors, i.e. exactly when the
 * choice matters.
 */
function revealSignerPicker(): void {
  const sel = document.querySelector(
    "#narrative-view .nv-signing select") as HTMLSelectElement | null;
  if (!sel) {
    toast("Nessun autore umano nel grafo: aggiungine uno per poter avallare");
    return;
  }
  sel.scrollIntoView({ behavior: "smooth", block: "center" });
  sel.focus();
  sel.classList.add("nv-wants-attention");
  window.setTimeout(() => sel.classList.remove("nv-wants-attention"), 2400);
  toast("Scegli con quale nome firmi");
}
/** Chapters with a generation request in flight, so the button can say so and
 *  a double click cannot send two. */
const generating = new Set<number>();

/**
 * Ask the bridge for a draft of one chapter, and file the answer.
 *
 * The key is NEVER here. It lives in em-bridge's environment (N5); this side
 * only knows an endpoint. That is not a detail of the implementation, it is the
 * reason the frontend can be served from anywhere without becoming a place
 * where a credential could leak.
 */
async function generateChapterDraft(narrativeId: string,
                                    chapterIndex: number): Promise<void> {
  if (!store || generating.has(chapterIndex)) return;
  const narrative = narrativesIn(store.doc).find((n) => n.id === narrativeId);
  const chapter = narrative?.chapters[chapterIndex];
  // NARR-AI: the anchor may be an activity OR an epoch (a site-story chapter is
  // epoch-anchored); the bridge/context builder accepts either. Only a chapter
  // with NO anchor at all (e.g. the free intro) cannot be generated.
  const activityId = chapter?.anchor;
  if (!activityId) {
    toast("Questo capitolo non è ancorato (a un'attività o un'epoca): " +
          "ancoralo per generare la bozza.");
    return;
  }
  const ai = getSettings().ai;
  generating.add(chapterIndex);
  let reached = false;   // did we get an answer at all, or never leave the room?
  refreshNarrativeView();
  refreshAiKeyStateIfOpen();   // Settings may be open: lock the key controls
  toast(`Genero la bozza di «${chapter?.title ?? activityId}»…`);
  try {
    const res = await fetch(`${await bridgeUrl()}/generate-narrative-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doc: store.doc,
        activity_id: activityId,
        narrative_id: narrativeId,
        provider: ai.provider,
        model: ai.model,
        // when it was written, recorded with the block: a provenance note
        // without a date answers "who" but not "when this was still current"
        date: new Date().toISOString().slice(0, 10),
      }),
    });
    reached = true;
    if (!res.ok) {
      let msg = `bridge error ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* non-JSON error body */
      }
      // 501 = the seam is not configured (no ANTHROPIC_API_KEY, or a build
      // without the LLM adapter). Different problem from a model that failed,
      // and the user can only fix the first one — so say which it is.
      toast(res.status === 501
        ? `Generazione non configurata: ${msg}`
        : `Generazione fallita: ${msg}`);
      return;
    }
    const result = (await res.json()) as DraftResult;
    nauth.applyGeneratedDraft(store, result, activityId);
    toast(`Bozza di ${result.model || result.provider} inserita — ` +
          `non avallata (${result.pending_validation} in attesa)`);
  } catch (e) {
    // A fetch that never reached the bridge says "Failed to fetch", which tells
    // the user nothing they can act on. The actionable fact is that the bridge
    // is not running — so say that, and keep the real message for failures that
    // happened AFTER we had an answer.
    toast(!reached
      ? "em-bridge non raggiungibile: la generazione passa da lì (è anche " +
        "dove sta la key, mai nel frontend). Avvialo con ./dev.sh, oppure " +
        "punta EM_TRANSFORMER_URL a un server."
      : `Generazione fallita: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    generating.delete(chapterIndex);
    refreshNarrativeView();
    refreshAiKeyStateIfOpen();
  }
}

/** The authoring hooks (N3). Every one of them funnels through
 *  `DocumentStore.updateNode`, so a narrative edit is undoable, marks the
 *  document dirty, reaches a synced peer and is written by the ordinary save —
 *  exactly like editing any other node. */
function narrativeEditor(narrativeId: string): NarrativeEditor {
  const s = store!;
  return {
    narrativeId,
    addChapter: () => nedit.addChapter(s, narrativeId),
    // NARR1 · reintroduce-epoch affordance + the bridge regenerate seam.
    undescribedEpochs: () => undescribedEpochs(s, narrativeId),
    addEpochChapter: (epochId) => addEpochChapter(s, narrativeId, epochId),
    // Seam only: the rich s3Dgraphy site_story regeneration needs a bridge
    // endpoint (build_narrative) that is not exposed yet — declared as a
    // follow-up, button stays disabled until it exists.
    canRegenerate: () => false,
    regenerateViaBridge: () =>
      toast("Rigenera bozza completa: endpoint bridge site_story non ancora disponibile (follow-up)"),
    renameChapter: (i, t) => nedit.renameChapter(s, narrativeId, i, t),
    moveChapter: (i, d) => nedit.moveChapter(s, narrativeId, i, d),
    deleteChapter: (i) => nedit.deleteChapter(s, narrativeId, i),
    toggleCanonical: (i) => nedit.toggleCanonical(s, narrativeId, i),
    setAnchor: (i, a) => nedit.setChapterAnchor(s, narrativeId, i, a),
    addProse: (c) => nedit.addProse(s, narrativeId, c),
    setProse: (c, b, t) => nedit.setProse(s, narrativeId, c, b, t),
    addEmbed: (c, ref, at) =>
      nedit.addEmbed(s, narrativeId, c, ref,
                     nedit.defaultViewType(s.node(ref)), at),
    setViewType: (c, b, vt) => nedit.setEmbedViewType(s, narrativeId, c, b, vt),
    moveBlock: (c, b, d) => nedit.moveBlock(s, narrativeId, c, b, d),
    deleteBlock: (c, b) => nedit.deleteBlock(s, narrativeId, c, b),
    // A chapter is anchored to a LANE: an epoch or an activity. Offering every
    // node would make the control useless — most of them are not lanes.
    lanes: () =>
      (s.doc.graph.nodes ?? [])
        .filter((n) => n.node_type === "EpochNode"
                    || n.node_type === "ActivityNodeGroup")
        .map((n) => ({ id: n.id, label: String(n.name || n.id) })),

    // — N6 —
    authors: () => nauth.authorsIn(s.doc),
    humanAuthors: () => nauth.humanAuthorsIn(s.doc),
    addAuthor: (id) => nauth.addNarrativeAuthor(s, narrativeId, id),
    removeAuthor: (id) => nauth.removeNarrativeAuthor(s, narrativeId, id),
    setChapterAuthor: (i, id) =>
      nauth.setChapterAuthor(s, narrativeId, i, id),
    signer: (): AuthorRef | null =>
      nauth.humanAuthorsIn(s.doc).find((a) => a.id === currentSigner()) ?? null,
    setSigner: (id) => {
      signingAs = id;
      refreshNarrativeView();
    },
    endorse: (c, b) => {
      const who = currentSigner();
      if (!who) {
        revealSignerPicker();
        return;
      }
      try {
        nauth.endorseBlock(s, narrativeId, c, b, who);
      } catch (e) {
        // Every refusal here is something the user has to understand — an
        // unknown author, or a model asked to vouch for a model.
        toast(e instanceof Error ? e.message : String(e));
      }
    },
    endorseChapter: (c) => {
      const who = currentSigner();
      if (!who) {
        revealSignerPicker();
        return;
      }
      try {
        const n = nauth.endorseChapter(s, narrativeId, c, who);
        toast(`${n} paragraf${n === 1 ? "o avallato" : "i avallati"}`);
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e));
      }
    },
    pendingIn: (c) => nauth.pendingInChapter(
      (((s.node(narrativeId)?.data ?? {}) as Record<string, unknown>)
        .chapters as nedit.EditableChapter[] | undefined)?.[c]).length,
    retract: (c, b) => nauth.retractEndorsement(s, narrativeId, c, b),
    canGenerate: (i) => {
      const anchor = narrativesIn(s.doc)
        .find((n) => n.id === narrativeId)?.chapters[i]?.anchor;
      return !!anchor
        && s.node(anchor)?.node_type === "ActivityNodeGroup";
    },
    generate: (i) => void generateChapterDraft(narrativeId, i),
    generating: (i) => generating.has(i),
  };
}

function refreshNarrativeView(): void {
  if (centralMode !== "narrative") return;
  const narratives = narrativesIn(store?.doc ?? null);
  const current = narratives.find((n) => n.id === selectedNarrativeId)
    ?? narratives[0];
  renderNarrativeView(
    narrativeViewEl,
    store?.doc ?? null,
    selectedNarrativeId,
    (id) => {
      selectedNarrativeId = id;
      refreshNarrativeView();
    },
    // an embed that resolves is a way into the graph: same gesture as the Log
    // tab, so "go and look at it" means one thing everywhere in the app
    revealFromNarrative,
    narrativeEditing && current && store
      ? narrativeEditor(current.id)
      : undefined,
    // CURRENT-ELEMENT · the window owns which chapter is being worked on; the
    // view marks it and reports the click. Passed ALWAYS (not only in edit
    // mode): picking the chapter you are reading is navigation.
    {
      index: () => currentChapterIndex(),
      set: (i) => setCurrentChapterIndex(i),
    },
  );
  renderResourcePanels(); // the story changed: its blocks panel repaints
}

/**
 * NARRWS1 · the narrative mode's OWN resources panel — narrative building blocks,
 * NOT the graph node-types (which are useless while reading/writing a story).
 * Per-mode, coherent with MODE1/DP-82. "＋ Capitolo" and "🗺 Mappa del sito" are
 * direct, unambiguous actions (reuse the narrative-edit mutators); the embed
 * view-types are listed from the datamodel (`narrativeViewTypes`) as a guide —
 * inserting one with a specific node reference is done from the chapter's own +
 * button, which knows the target chapter and ref. Site map ties to GEO1: the
 * embed points at the graph-self node, whose map reads the site position.
 */
function renderNarrativePalette(host: HTMLElement): void {
  host.textContent = "";
  // STEP A · NO `centralMode` guard. This panel belongs to a NARRATIVE WINDOW,
  // and `centralMode` describes whichever window has the focus — so the guard
  // emptied the panel the moment the pointer moved to another area, which is
  // the anchoring bug wearing a different hat. The window's type is the only
  // condition that matters, and the provider registry has already checked it.
  const narr =
    narrativesIn(store?.doc ?? null).find((n) => n.id === selectedNarrativeId) ??
    narrativesIn(store?.doc ?? null)[0];

  const section = (title: string): HTMLElement => {
    const h = document.createElement("div");
    h.className = "np-sect";
    h.textContent = title;
    host.appendChild(h);
    return h;
  };
  const item = (
    label: string,
    hint: string,
    onClick: (() => void) | null,
  ): void => {
    const b = document.createElement("button");
    b.className = "np-item" + (onClick ? "" : " np-item-static");
    b.title = hint;
    b.innerHTML = `<span class="np-label">${label}</span><span class="np-hint">${hint}</span>`;
    if (onClick) b.addEventListener("click", onClick);
    else b.disabled = true;
    host.appendChild(b);
  };

  section("Narrativa");
  if (!narr || !store) {
    item("Nessuna narrativa", "Entra in modo narrativa su un grafo per iniziare", null);
    return;
  }
  const nid = narr.id;
  // structure
  item("＋ Capitolo", "Aggiungi un capitolo alla narrativa", () => {
    nedit.addChapter(store!, nid);
    refreshNarrativeView();
  });
  // MENU-AUDIT · "🗺 Mappa del sito" was here too, and it inserted into the LAST
  // chapter while the header's Inserisci ▸ Mappa del sito inserts into the
  // CURRENT one. Not two ways to the same place: the same action with two
  // different targets, which is worse than a duplicate. The header item stays
  // (it acts on the current element, like everything else in that menu, and says
  // so when there isn't one).

  // embeds — the datamodel's narrative view-types, as a guide (insert with a
  // reference from the chapter's + button, which knows chapter and node).
  // D1-full (P5) · the view types were listed as a GUIDE and were dead buttons.
  // Now they are draggable: drop one on an embed and that embed changes how it
  // is shown. They still cannot be clicked to insert, and that is deliberate —
  // an embed without a reference points at nothing, so a view type alone is not
  // a block anybody wants. Inserting WITH a reference is the other gesture:
  // drag a node from the node list onto a chapter (D2).
  section("Viste (trascina su un embed)");
  for (const vt of narrativeViewTypes()) {
    const hint = narrativeViewTypeDescription(vt) || vt;
    const b = document.createElement("button");
    b.className = "np-item np-item-drag";
    b.title = `${hint}\n\nTrascina questa vista su un embed per cambiarne la resa.`;
    b.draggable = true;
    b.innerHTML = `<span class="np-label">${vt}</span><span class="np-hint">${hint}</span>`;
    b.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData(VIEW_TYPE_MIME, vt);
      e.dataTransfer?.setData("text/plain", vt);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
    });
    host.appendChild(b);
  }
  const guide = document.createElement("div");
  guide.className = "np-sect np-sect-note";
  guide.textContent =
    "Trascina un nodo dall'elenco su un capitolo per citarlo.";
  host.appendChild(guide);
}

// NARR-BUTTONS · `setNarrativeOpen()` is GONE. It was the WIN1 back-compat
// wrapper around the old central-mode flag, and its last caller was the reveal
// below — the one place where flipping a global instead of telling the window
// produced a window that lied about its own type. Entering and leaving the
// narrative is now what it says it is: the window's type (`transformWindow`) or
// the workspace chip.

/**
 * NARR-BUTTONS · "go and look at it", from inside a story.
 *
 * Every reveal in the narrative — an embed that resolves, "vai al nodo ↗", the
 * `prompt` behind a generated paragraph — promises the same thing: leave the
 * prose, show me that node on the canvas. It used to do it with
 * `setNarrativeOpen(false)`, which flips the OLD central-mode flag and says
 * nothing to the window. The result was a window whose type still read
 * **Narrativa** while its surface was a canvas, with the Mode selector hidden
 * (windows of type narrative have none) — so the projection could not be
 * changed and there was no way back except the leader chip. That is the shape
 * of the "i pulsanti non funzionano" bug: the button worked, and left the shell
 * describing something it was not.
 *
 * Now it goes through the WINDOW, which is where "what am I showing" has lived
 * since WIN2. If the workspace already has a graph window, the node is revealed
 * THERE and the story stays open — which is the arrangement you would have
 * built for exactly this. Otherwise this window becomes a Graph window: the
 * same transform the Doc window's "Mostra sul canvas" performs, so leaving an
 * editor for the canvas means one thing everywhere.
 */
function revealFromNarrative(nodeId: string): void {
  const graphWin = windowsOf().find((w) => w.type === "graph");
  if (graphWin) {
    if (activeWin().id !== graphWin.id) selectWindow(graphWin.id);
  } else {
    const win = activeWin();
    setWinType(win, "graph");
    mountWindow(win);
    renderTiles();
    updateWindowHeader();
  }
  revealFromWarning(nodeId);
}

btnNarrative.addEventListener("click", () =>
  setMode(centralMode === "narrative" ? view : "narrative"),
);
// HDR1 · the writing toggle. Invoked by the ✎ action of a narrative window's
// header, never by a visible master-header button — so it no longer dresses
// itself (no active class, no Done/Edit label): the STATE is what it owns, and
// the window header renders that state (`win-act-on`).
btnNarrativeEdit.addEventListener("click", () => {
  narrativeEditing = !narrativeEditing;
  refreshNarrativeView();
});

btnUndo.addEventListener("click", () => store?.undo());
btnRedo.addEventListener("click", () => store?.redo());
btnMatrix.addEventListener("click", () => setView("matrix"));
btnGraph.addEventListener("click", () => setView("graph"));

// ---------- WIN1 · workspace leader (Canvas / Narrative / Tabular) ----------
// The higher-level switcher that ABSORBS MODE1: each preset mounts an existing
// editor — Canvas/Narrative through setMode, Tabular through the table surface
// of the window (WIN6-RESIDUAL: there is no dock behind it any more). Windows
// carry their own state, so a preset only seeds the first one.
const workspaceBar = document.getElementById("workspace-bar")!;

/** Light the leader's active chip; keep workspace.ts's persisted id in step.
 *  Pure reflection — never triggers a workspace apply (no re-entrancy). */
function reflectWorkspaceInBar(id: WorkspaceId): void {
  syncActiveWorkspace(id);
  workspaceBar
    .querySelectorAll<HTMLButtonElement>("button[data-ws]")
    .forEach((b) => b.classList.toggle("active", b.dataset.ws === id));
  updateWindowHeader();
}

// ── WIN5 · the tiled shell ──────────────────────────────────────────────────
//
// The split tree (workspace.ts) is rendered as nested flex boxes into
// `#tile-root`. The ACTIVE window's area is the real `#canvas-wrap` — the
// canvas, its docked bar and every overlay stay exactly where they were, so all
// of the editing machinery is untouched. Every OTHER area is a light secondary
// area: its own docked bar plus a canvas that draws that window's projection
// with that window's camera, read-only. Clicking a secondary area makes it
// active, which moves `#canvas-wrap` into it — so the editable window is
// wherever you last clicked, and there is still exactly one editor.
//
// Declared limit: secondary areas are a live VIEW, not a second editor (no
// selection, no drag). Promoting one is a click.

const tileRoot = document.getElementById("tile-root")!;
// The live area, captured ONCE: `renderTiles` detaches it before rebuilding the
// tree, and a detached element is no longer findable by id — looking it up
// afterwards returned null and left the app with no canvas at all.
const canvasWrapEl = document.getElementById("canvas-wrap")!;
/** canvases of the secondary areas, by window id — redrawn with the main draw */
const tileCanvases = new Map<string, HTMLCanvasElement>();

/** The node the pointer is over in a SECONDARY area, per area. Hovering has to
 *  work before an area is promoted — otherwise "is that the node I want?" can
 *  only be answered by clicking, which is the thing you were trying to decide. */
const tileHover = new Map<string, string | null>();

/** Draw one secondary area: same renderer, that window's scene and camera. */
function drawTile(winId: string, mode: ViewKind, cv: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 1;
  const h = cv.clientHeight || 1;
  cv.width = Math.max(1, Math.round(w * dpr));
  cv.height = Math.max(1, Math.round(h * dpr));
  const c = cv.getContext("2d");
  if (!c) return;
  const s = scenes[mode] ?? null;
  const vp = viewportFor(winId, mode);
  if (!s) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    return;
  }
  // Frame it the first time this area shows this document (same rule as the
  // main canvas, so a new area never opens on a blank patch of coordinates) —
  // and RE-frame it when the area changes size under a camera the user never
  // touched. A camera aimed at a full-width window and then squeezed into a
  // quarter of it leaves the graph as a speck in the corner: technically live,
  // in practice an empty area, which is the thing WIN7 exists to end.
  const key = viewportKey(winId, mode);
  const size = `${Math.round(w)}x${Math.round(h)}`;
  if (!framedViews.has(key)) {
    framedViews.add(key);
    vp.fit(sceneBounds(s), w, h);
    framedSizes.set(key, size);
  } else if (framedSizes.get(key) !== size && !touchedViews.has(key)) {
    vp.fit(sceneBounds(s), w, h);
    framedSizes.set(key, size);
  }
  render(
    c,
    s,
    vp,
    {
      // a secondary area shows the SAME selection as the document (selection is
      // a fact about the graph, not about a window) and its own hover
      hoverId: tileHover.get(winId) ?? null,
      selectedId,
      selectedIds,
      edgeVisible,
      hoverEdgeIdx: null,
      selectedEdgeIdx: -1,
      filterKey: "all",
      connect: null,
      editable: false,
      insertBoundary: null,
      monochrome,
      nameStatus,
    },
    w,
    h,
  );
}

/** Redraw every secondary area (the active one is drawn by `draw`). */
function drawTiles(): void {
  for (const [winId, cv] of tileCanvases) {
    const win = windowsOf().find((x) => x.id === winId);
    if (!win) continue;
    drawTile(winId, win.type === "graph" ? winMode(win) : "matrix", cv);
  }
}

// ── WIN5 · the corner gesture (Blender) ─────────────────────────────────────
//
// Every area carries two corner grips. Drag one and where you RELEASE says what
// you meant:
//
//   · released INSIDE the same area  → SPLIT it. The dominant axis of the drag
//     picks the direction: dragging sideways cuts a new area beside this one,
//     dragging up/down cuts one above/below.
//   · released ON A NEIGHBOURING AREA → JOIN: this area absorbs that one and
//     the divider between them goes away.
//
// The same two verbs as the ⇥ / ⇤ / ⊟ buttons — the buttons stay, because a
// gesture nobody discovers is not a feature. This is the direct-manipulation
// way in, and it reads the geometry off the DOM: no second model of where the
// areas are.

/** The area element under a point, and the window it holds. */
function areaAt(x: number, y: number): { el: HTMLElement; winId: string } | null {
  const areas: { el: HTMLElement; winId: string }[] = [
    { el: canvasWrapEl, winId: activeWin().id },
    ...[...document.querySelectorAll<HTMLElement>(".tile-area")].map((el) => ({
      el,
      winId: el.dataset.win ?? "",
    })),
  ];
  for (const a of areas) {
    const r = a.el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return a;
  }
  return null;
}

/**
 * Attach the two corner grips to an area.
 *
 * `barOffset` pushes the TOP-LEFT grip below that area's docked bar: the two
 * would otherwise overlap by a few pixels and the grip would occasionally eat a
 * click meant for the window-type dropdown — a gesture stealing a menu is worse
 * than a gesture nobody finds.
 */
function addCornerGrips(area: HTMLElement, winId: string, barOffset: string): void {
  for (const corner of ["tl", "br"] as const) {
    const grip = document.createElement("div");
    grip.className = `tile-corner tile-corner-${corner}`;
    if (corner === "tl") grip.style.top = barOffset;
    grip.title = t("tile.corner");
    grip.addEventListener("pointerdown", (e) => e.stopPropagation());
    grip.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const x0 = e.clientX;
      const y0 = e.clientY;
      let target: HTMLElement | null = null;
      const clearTarget = (): void => {
        document
          .querySelectorAll(".tile-join-target")
          .forEach((el) => el.classList.remove("tile-join-target"));
      };
      const move = (ev: MouseEvent): void => {
        clearTarget();
        const over = areaAt(ev.clientX, ev.clientY);
        // highlight only a neighbour we could actually absorb
        const siblings = siblingIdsOf(winId);
        if (over && over.winId !== winId && siblings.includes(over.winId)) {
          over.el.classList.add("tile-join-target");
          target = over.el;
        } else {
          target = null;
        }
      };
      const up = (ev: MouseEvent): void => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        clearTarget();
        const dx = ev.clientX - x0;
        const dy = ev.clientY - y0;
        if (Math.abs(dx) + Math.abs(dy) < 8) return; // a click, not a drag
        const over = areaAt(ev.clientX, ev.clientY);
        if (target && over && over.winId !== winId) {
          // JOIN · the dragged area absorbs the one released on
          setActiveWin(winId);
          joinWindow(winId);
        } else if (over && over.winId === winId) {
          // SPLIT · the dominant axis decides the cut
          splitWindow(winId, Math.abs(dx) >= Math.abs(dy) ? "row" : "col");
        } else {
          return; // released on nothing meaningful: do nothing, quietly
        }
        renderTiles();
        const win = activeWin();
        if (win.type === "graph") setMode(winMode(win));
        else mountWindow(win);
        updateWindowHeader();
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });
    area.appendChild(grip);
  }
}

/** Build the DOM of one pane of the tree. */
function buildPane(pane: Pane, activeId: string): HTMLElement {
  if (pane.kind === "leaf") {
    if (pane.winId === activeId) {
      // the live area IS the existing canvas wrapper, moved into place
      canvasWrapEl.classList.add("tile-active");
      canvasWrapEl.style.flex = "1 1 0";
      canvasWrapEl
        .querySelectorAll(".tile-corner, .win-resources, .win-res-chevron")
        .forEach((g) => g.remove()); // rebuilt below, so they never pile up
      const activeWinObj = windowsOf().find((w) => w.id === pane.winId);
      if (activeWinObj) buildResourcePanel(canvasWrapEl, activeWinObj);
      addCornerGrips(canvasWrapEl, pane.winId, "var(--winbar-h, 0px)");
      return canvasWrapEl;
    }
    const win = windowsOf().find((x) => x.id === pane.winId);
    const area = document.createElement("div");
    area.className = "tile-area";
    area.style.flex = "1 1 0";
    area.dataset.win = pane.winId;
    const bar = document.createElement("div");
    // WIN-FIX1 · this area's own HEADER. Left empty here and filled by
    // `renderAreaHeaders` with the SAME bar the focused window gets — every area
    // is a window, so every area says what it is and offers its own verbs. It
    // used to be a thin label strip ("Grafo · Matrix — clicca per lavorare qui"),
    // which is what made three quarters of an arrangement read as panes rather
    // than windows.
    bar.className = "tile-bar win-header";
    area.appendChild(bar);
    if (win && win.type === "graph") {
      // FOCUS-NOJITTER / STEP A · the width the panel takes is published on the
      // AREA (`--palette-w`, set by `buildResourcePanel`) and the canvas reads
      // it in CSS — in this area and in the focused one alike. So a window with
      // its panel open is the same size whether or not it has the focus, and
      // the drawing never re-frames when the pointer crosses a divider.
      const cv = document.createElement("canvas");
      area.appendChild(cv);
      tileCanvases.set(pane.winId, cv);
    } else if (win) {
      // WIN7 · a secondary area is a LIVE view of the document, whatever its
      // type. It used to be a note ("click to work here"), which meant three
      // quarters of an IDE arrangement showed nothing at all until you clicked
      // in it — the arrangement was a promise rather than a workspace.
      buildSecondarySurface(area, win);
    }
    // STEP A · this window's resources panel, if it has one open. Built here,
    // in ITS area, which is what makes it stay put when the focus moves away.
    if (win) buildResourcePanel(area, win);
    // ── a secondary area is a WORKING area, not a picture ──────────────────
    //
    // Its camera is its own, so pan and zoom happen HERE without stealing the
    // focus (you look around a reference view without losing the one you were
    // editing). Anything that touches the DOCUMENT promotes the area first and
    // then continues in the same gesture: the pointerdown is replayed on the
    // real canvas, which by then occupies exactly this rectangle. So the first
    // click selects, drags, or starts a connector — it is not spent on
    // "activating a window", which is the way this normally goes wrong.
    const winIdOf = pane.winId;
    const modeOf = (): ViewKind =>
      win && win.type === "graph" ? winMode(win) : "matrix";
    const worldAt = (e: { clientX: number; clientY: number }) => {
      const cv = tileCanvases.get(winIdOf);
      const vp = viewportFor(winIdOf, modeOf());
      if (!cv) return null;
      const r = cv.getBoundingClientRect();
      return vp.toWorld(e.clientX - r.left, e.clientY - r.top);
    };
    area.addEventListener(
      "wheel",
      (e) => {
        const cv = tileCanvases.get(winIdOf);
        if (!cv) return;
        e.preventDefault();
        const r = cv.getBoundingClientRect();
        markCameraTouched(winIdOf, modeOf()); // aimed by hand: never re-frame it
        viewportFor(winIdOf, modeOf()).zoomAt(
          e.clientX - r.left,
          e.clientY - r.top,
          Math.exp(-e.deltaY * 0.0016),
        );
        drawTiles();
      },
      { passive: false },
    );
    area.addEventListener("pointermove", (e) => {
      const w = worldAt(e);
      const sc = scenes[modeOf()] ?? null;
      const hit = w && sc ? hitTest(sc, w.x, w.y) : null;
      const now = hit?.id ?? null;
      if (tileHover.get(winIdOf) === now) return;
      tileHover.set(winIdOf, now);
      area.style.cursor = now ? "pointer" : "default";
      drawTiles();
    });
    area.addEventListener("pointerleave", () => {
      if (tileHover.get(winIdOf) == null) return;
      tileHover.set(winIdOf, null);
      drawTiles();
    });
    // ── FOCUS FOLLOWS MOUSE (Blender) ─────────────────────────────────────
    //
    // The editor moves to the area the pointer is IN, before any button is
    // pressed. So by the time you press, the real canvas — the whole
    // interaction machine, not a copy of it — is already under the cursor:
    // click, drag, rubber-band and connector all work here exactly as they do
    // anywhere else, from the FIRST gesture. No promoting click, no replay.
    //
    // Why this and not two interaction machines running side by side: there is
    // one pointer. Two machines would differ only in holding two half-finished
    // gestures at once (a marquee in one area while a connector hangs in the
    // other), which no hand can produce. What was actually missing was that the
    // machine be where the hand is — this is that, and it is what Blender does.
    //
    // Guarded: never mid-drag (moving the mouse across a divider while dragging
    // a node must not hand the node to another window), and never while placing
    // a node from the palette.
    area.addEventListener("pointerenter", () => {
      if (dragMode !== "none" || connect || placingType) return;
      if (activeWin().id === winIdOf) return;
      selectWindow(winIdOf);
    });
    // ── the palette drop lands on THIS window ──────────────────────────────
    //
    // A drag from the palette is an HTML5 drag: pointer events do not fire, so
    // focus-follows-mouse cannot hand the editor over mid-drag and the drop
    // would be delivered to whichever canvas happened to be the editor —
    // creating the node in the wrong window. So a secondary area accepts the
    // drop itself: it takes the focus and places the node at the point of the
    // GRAPH that was pointed at, in this area's own camera.
    //
    // W1 · the SAME reasoning covers a resource dragged out of a Storage
    // window. The Viewer's own surface is a singleton inside the focused area,
    // so a drop meant for a Viewer that does NOT have the focus would land
    // nowhere at all — which is exactly the bug this per-area handler was
    // written for, arriving a second time with a different payload.
    area.addEventListener("dragover", (e) => {
      if (storageDragPayload(e) &&
          ["viewer", "shelf"].includes(
            windowsOf().find((w) => w.id === winIdOf)?.type ?? "")) {
        e.preventDefault();
        area.classList.add("drop-target");
        return;
      }
      if (!paletteDragPayload(e)) return;
      e.preventDefault();
      area.classList.add("drop-target");
    });
    area.addEventListener("dragleave", () => area.classList.remove("drop-target"));
    area.addEventListener("drop", (e) => {
      area.classList.remove("drop-target");
      const resource = storageDragPayload(e);
      const target = windowsOf().find((w) => w.id === winIdOf);
      if (resource && target?.type === "viewer") {
        e.preventDefault();
        selectWindow(winIdOf); // the window you dropped on is the one you meant
        pinViewerCollection(target, resource);
        return;
      }
      // SHELF1 · the same gesture, the other meaning: dropping a file on the
      // shelf is "keep this", and it is where the digest is taken.
      if (resource && target?.type === "shelf") {
        e.preventDefault();
        selectWindow(winIdOf);
        if (resource.type === "dir") toast(t("shelf.folderIsASource"));
        else void addFileToShelf(resource);
        return;
      }
      const p = paletteDragPayload(e);
      if (!p) return;
      e.preventDefault();
      if (!store) {
        toast("Open a document first");
        return;
      }
      const wpt = worldAt(e);
      selectWindow(winIdOf);
      placingType = p.nodeType;
      placingKind = p.kind ?? null;
      placingIsResource = !!p.isResource;
      if (wpt) placeNode(wpt.x, wpt.y);
      else cancelPlacing();
    });
    area.addEventListener("pointerdown", (e) => {
      // PAN, same gesture as the canvas (middle button or Space held): this
      // moves a CAMERA, not the document, so it must NOT steal the focus — the
      // whole point of a reference area is looking around it while you keep
      // working in the other one.
      if (e.button === 1 || spaceHeld) {
        e.preventDefault();
        markCameraTouched(winIdOf, modeOf());
        const vp = viewportFor(winIdOf, modeOf());
        let lx = e.clientX;
        let ly = e.clientY;
        const move = (ev: PointerEvent): void => {
          vp.x += ev.clientX - lx;
          vp.y += ev.clientY - ly;
          lx = ev.clientX;
          ly = ev.clientY;
          drawTiles();
        };
        const up = (): void => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        return;
      }
      // A press that reaches HERE means the pointer entered without the focus
      // following (mid-drag, or placing a node): take the focus now and resolve
      // the click in this area's own camera, so nothing is lost.
      const wpt = worldAt(e);
      const sc = scenes[modeOf()] ?? null;
      const hit = wpt && sc ? hitTest(sc, wpt.x, wpt.y) : null;
      selectWindow(winIdOf);
      select(hit ? hit.id : null);
    });
    // the secondary bar is laid out already; measure it after the append below
    addCornerGrips(area, pane.winId, `${bar.offsetHeight || 29}px`);
    return area;
  }
  const split = document.createElement("div");
  split.className = "tile-split" + (pane.dir === "col" ? " tile-col" : "");
  const a = buildPane(pane.a, activeId);
  a.style.flex = `${pane.ratio} 1 0`;
  const div = document.createElement("div");
  div.className = "tile-div" + (pane.dir === "col" ? " tile-div-col" : "");
  const b = buildPane(pane.b, activeId);
  b.style.flex = `${1 - pane.ratio} 1 0`;
  // dragging the divider re-proportions THIS split only
  div.addEventListener("mousedown", (e) => {
    e.preventDefault();
    div.classList.add("dragging");
    const rect = split.getBoundingClientRect();
    const firstId = paneIds(pane.a)[0];
    const move = (ev: MouseEvent): void => {
      const r =
        pane.dir === "col"
          ? (ev.clientY - rect.top) / Math.max(1, rect.height)
          : (ev.clientX - rect.left) / Math.max(1, rect.width);
      setSplitRatio(firstId, r);
      renderTiles();
    };
    const up = (): void => {
      div.classList.remove("dragging");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  });
  split.appendChild(a);
  split.appendChild(div);
  split.appendChild(b);
  return split;
}

/** Lay the workspace's tree out. Cheap and idempotent: called on any change to
 *  the arrangement (split, close, activate, ratio) and after a workspace switch. */
function renderTiles(): void {
  // Any menu open right now belongs to a bar that is about to move — leaving it
  // up would float it over the new arrangement, detached from anything.
  closeAllDropdowns();
  closeAllSubmenus();
  tileCanvases.clear();
  tileSurfaces.length = 0;
  paletteUis.length = 0;
  // the areas that owned these are about to be discarded whole
  for (const h of tileEmDataHosts.splice(0)) removeEmDataHost(h);
  // WIN7 · a panel living in a secondary area would be DESTROYED by the reset
  // below (with every handler wired to it at boot) — send it home first. The
  // same reason `#canvas-wrap` is detached rather than left to be cleared.
  releaseTilePanels();
  // detach the live area before rebuilding, so it survives the innerHTML reset
  canvasWrapEl.remove();
  tileRoot.innerHTML = "";
  tileRoot.appendChild(buildPane(layoutOf(), activeWin().id));
  renderAreaHeaders(); // WIN-FIX1 · every area gets its bar, this pass
  syncSecondaryPanels();
  // The table hosts registered while their areas were still detached, so the
  // render that `addEmDataHost` fires found them disabled (`isConnected` false).
  // Now the tree is attached: paint them.
  renderEmData();
  refreshTileSurfaces();
  resizeCanvas(); // the live area changed size
  drawTiles();
}

// ── CURRENT-ELEMENT · the element the ACTIVE window is working on ───────────
// The chapter of a Narrative window, the row of a Table window. Stored on the
// window (workspace.ts) so two windows of the same type can sit on different
// elements; read here by the menus, which then act through the EXISTING
// mutators. A menu item with no current element stays disabled WITH ITS REASON
// rather than guessing which chapter the user meant.

function currentChapterIndex(): number | null {
  const v = winCurrent(activeWin(), "chapter");
  return typeof v === "number" ? v : null;
}
function setCurrentChapterIndex(i: number | null): void {
  setWinCurrent(activeWin(), "chapter", i);
  refreshNarrativeView();
  updateWindowHeader(); // the menus enable/disable with it
}
function currentRowId(): string | null {
  const v = winCurrent(activeWin(), "row");
  return typeof v === "string" ? v : null;
}
function setCurrentRowId(id: string | null): void {
  setWinCurrent(activeWin(), "row", id);
}

/**
 * ROWSELECT · a row was picked in a Tabular window: select that node, and show
 * it in a Graph window if one is open.
 *
 * Deliberately NOT the same gesture as `revealFromNarrative`. Leaving a story to
 * look at a node means leaving the story — the narrative window transforms if it
 * has to. A table is different: you pick rows to walk a list, and turning the
 * table into a canvas under you would take away the thing you were reading. So
 * this reveals in a graph window that ALREADY exists, and does nothing to the
 * arrangement when there is none.
 *
 * A row whose node is not in the graph (or not in the current scene — folded,
 * filtered out) is a no-op with a word about it, never an error: the table can
 * legitimately show rows the canvas does not draw.
 */
function revealFromTable(nodeId: string): void {
  if (!store || !store.node(nodeId)) return;   // a row without a node: nothing to show
  select(nodeId);                              // selection is a fact about the document
  const graphWin = windowsOf().find((w) => w.type === "graph");
  if (!graphWin) return;                       // no canvas open: the selection is enough
  const previous = activeWin().id;
  setActiveWin(graphWin.id);
  if (scene()?.byId.has(nodeId)) centerOn(nodeId);
  else toast("selezionato — non visibile in questa proiezione (ripiegato o filtrato)");
  // the focus goes back to the table: you were reading a list, and the pick was
  // a question about one row, not a decision to leave
  setActiveWin(previous);
  draw();
  drawTiles();
}

/** The narrative this window is showing (the selected one, else the first). */
function activeNarrative(): { id: string; chapters: unknown[] } | null {
  if (!store) return null;
  const list = narrativesIn(store.doc);
  const n = list.find((x) => x.id === selectedNarrativeId) ?? list[0];
  return n ? { id: n.id, chapters: n.chapters } : null;
}

/** The current chapter, validated against the narrative that is actually open —
 *  a persisted index must never outlive the chapter it pointed at. */
function validCurrentChapter(): number | null {
  const narr = activeNarrative();
  const i = currentChapterIndex();
  if (!narr || i == null) return null;
  return i >= 0 && i < narr.chapters.length ? i : null;
}

// WIN2b · the window header's transform dropdown. It changes the ACTIVE WINDOW's
// type IN PLACE — same slot, same workspace, a different editor. (WIN1 shipped a
// placeholder that jumped to the type's canonical workspace; with real window
// instances that indirection is gone, and a Canvas workspace showing a table is
// now a legitimate arrangement.) DTC is a graph MODE, not a transform target;
// Doc has no editor yet. Elements are looked up at call time (not module-load
// consts) so the early updateWindowHeader path never hits a TDZ.
const TRANSFORM_TYPES: WindowType[] = [
  "graph",
  "narrative",
  "table",
  "emtree",
  "inspector",
  "doc",
  "viewer",
  "storage",
  "annotator",
  "shelf",
];

/**
 * WIN5 · which SURFACE of the window area is showing. The area has four: the
 * canvas, the narrative overlay, the table and the documents. Exactly one is
 * visible, and this is the only place that decides — a window type maps to a
 * surface, and nothing else touches their visibility.
 */
function applyWindowSurface(type: WindowType): void {
  const show = (id: string, on: boolean): void => {
    document.getElementById(id)?.classList.toggle("hidden", !on);
  };
  show("table-view", type === "table");
  show("doc-view", type === "doc");
  show("viewer-view", type === "viewer");
  if (type === "viewer") renderViewer();
  show("storage-view", type === "storage");
  if (type === "storage") renderStorage();
  show("annotator-view", type === "annotator");
  if (type === "annotator") renderAnnotator();
  show("shelf-view", type === "shelf");
  if (type === "shelf") renderShelf();
  const hosted = type === "emtree" || type === "inspector";
  show("panel-view", hosted);
  if (hosted) renderPanelWindow(type);
  else {
    releasePanels();
    syncSecondaryPanels(); // the panels it gave back may be wanted by an area
  }
  // The overview map answers "where am I on the canvas", and the funnel filters
  // NODES AND CONNECTORS — both are questions only a canvas window has. On a
  // table or a document they would act on something that is not on screen.
  const isCanvasWindow = type === "graph";
  show("overview", isCanvasWindow);
  if (!isCanvasWindow && filterPanelOpen()) closeFilterPanel();
  refreshFunnel();
  if (type === "table") renderEmData();
  if (type === "doc") renderDocView();
}

// ── WIN5 · the Doc window ───────────────────────────────────────────────────
//
// "Doc" in an EM graph means the SOURCES: the DocumentNodes the paradata chain
// hangs from (D.1 Rilievo Maiuri 1931, D.2 Fotografia storica…). This window is
// their reading and editing surface — the list on the left, the current one on
// the right, its fields writing through `store.updateNode` like every other
// editor. Deliberately NOT a rich text editor: EMStudio has no document body to
// edit, and inventing one would be a second model of what a source is.

function currentDocId(): string | null {
  const v = winCurrent(activeWin(), "doc");
  return typeof v === "string" ? v : null;
}

function documentsInGraph(): EmNode[] {
  return (store?.doc.graph.nodes ?? []).filter((n) => n.node_type === "document");
}

/** The focused Doc window's surface. WIN7 split the rendering out (below) so a
 *  SECONDARY Doc area can paint the same thing into its own two boxes. */
function renderDocView(): void {
  const surface = document.getElementById("doc-view");
  const list = document.getElementById("doc-view-list");
  const detail = document.getElementById("doc-view-detail");
  if (!surface || !list || !detail) return;
  reflectDocWidth(surface);
  renderDocViewInto(activeWin(), list, detail);
}

/** A Doc surface wide enough for the list and the detail side by side gets the
 *  row layout; a narrow one stacks them. Measured from the SURFACE, so the two
 *  renderings answer it the same way and the focus never enters into it. */
function reflectDocWidth(surface: HTMLElement): void {
  surface.classList.toggle("doc-wide", surface.clientWidth >= 520);
}

/** Draw the sources of the graph for ONE window into ONE pair of boxes. The
 *  window is a parameter because "which document is current" lives on it: two
 *  Doc areas can sit on different sources. */
function renderDocViewInto(
  win: Win,
  list: HTMLElement,
  detail: HTMLElement,
): void {
  list.innerHTML = "";
  detail.innerHTML = "";
  const docs = documentsInGraph();
  if (!docs.length) {
    detail.innerHTML =
      `<div class="doc-empty">${t("doc.empty")}</div>`;
    return;
  }
  const currentId = winCurrent(win, "doc");
  const current = docs.find((d) => d.id === currentId) ?? docs[0];
  const repaint = (): void => renderDocViewInto(win, list, detail);
  for (const d of docs) {
    const b = document.createElement("button");
    b.className = "doc-item" + (d.id === current.id ? " current" : "");
    const data = (d.data ?? {}) as Record<string, unknown>;
    const sub = String(data.title ?? data.filename ?? d.description ?? "");
    b.innerHTML =
      `${escapeHtml(d.name || d.id)}` +
      (sub ? `<span class="doc-sub">${escapeHtml(sub)}</span>` : "");
    b.addEventListener("click", () => {
      setWinCurrent(win, "doc", d.id);
      repaint();
    });
    list.appendChild(b);
  }
  // the current document's fields, straight onto the node
  const data = (current.data ?? {}) as Record<string, unknown>;
  const field = (
    label: string,
    value: string,
    commit: (v: string) => void,
  ): void => {
    const l = document.createElement("label");
    l.className = "doc-field";
    l.textContent = label;
    const inp = document.createElement("input");
    inp.className = "doc-input";
    inp.value = value;
    inp.addEventListener("change", () => commit(inp.value));
    detail.appendChild(l);
    detail.appendChild(inp);
  };
  const setData = (key: string, v: string): void => {
    if (!store) return;
    store.updateNode(current.id, {
      data: { ...(current.data ?? {}), [key]: v },
    } as Partial<EmNode>);
    repaint();
  };
  field(t("doc.name"), current.name ?? "", (v) =>
    store?.updateNode(current.id, { name: v }),
  );
  field(t("doc.title"), String(data.title ?? ""), (v) => setData("title", v));
  field(t("doc.filename"), String(data.filename ?? ""), (v) =>
    setData("filename", v),
  );
  field(t("doc.year"), String(data.year ?? ""), (v) => setData("year", v));
  field(t("doc.description"), current.description ?? "", (v) =>
    store?.updateNode(current.id, { description: v }),
  );

  // what hangs off this document — the reason a source is in the graph at all
  const extractors = (store?.doc.graph.edges ?? []).filter(
    (e) => e.edge_type === "extracted_from" && e.target === current.id,
  );
  const links = document.createElement("div");
  links.className = "doc-links";
  links.textContent = t("doc.extractors", { n: String(extractors.length) });
  detail.appendChild(links);
  const jump = document.createElement("button");
  jump.className = "insp-btn";
  jump.textContent = t("doc.reveal");
  jump.addEventListener("click", () => {
    // "show it on the canvas" turns THIS window into a graph — including when the
    // click came from a secondary area, which the focus has just moved to anyway.
    setActiveWin(win.id);
    setWinType(win, "graph");
    mountWindow(win);
    updateWindowHeader();
    renderTiles();
    select(current.id);
    centerOn(current.id);
  });
  detail.appendChild(jump);
}


// ── SHELF1 · THE WIDE LIST ──────────────────────────────────────────────────
//
// The file browser shows every file on the disk, including everything that must
// never enter the documentation. The shelf holds what you CHOSE — with a digest,
// the fence it comes from, and where its bytes live. That difference is the
// whole reason the two are different windows.
//
// It is a ShelfGraph, so it saves and reopens like any other graph. The orphan
// scan of a folder is not a rival shelf: it is an ENTRANCE to this one.

function renderShelf(): void {
  const body = document.getElementById("shelf-body");
  const count = document.getElementById("shelf-count");
  const nameInput = document.getElementById("shelf-name") as HTMLInputElement | null;
  if (!body || !count || !nameInput) return;
  // Ask the SURFACE, not who has the focus. The bar's buttons live in the DOM
  // whether or not this area is the focused one, so a click on "+ URI" from a
  // neighbouring window used to add the entry and then skip the redraw — the
  // list said two while the shelf held three. Same rule the EM-Data hosts use
  // (`body.isConnected`): a renderer should ask the screen whether it is on it.
  if (document.getElementById("shelf-view")?.classList.contains("hidden")) return;

  const entries = shelfEntries();
  count.textContent = t("shelf.count", { n: String(entries.length) });
  if (document.activeElement !== nameInput) nameInput.value = shelfMeta().name;

  body.textContent = "";
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "viewer-empty";
    const p = document.createElement("p");
    p.textContent = t("shelf.empty");
    empty.appendChild(p);
    body.appendChild(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "shelf-list";
  for (const entry of entries) list.appendChild(shelfRow(entry));
  body.appendChild(list);
}

function shelfRow(entry: ShelfEntry): HTMLElement {
  const row = document.createElement("div");
  row.className = "shelf-row";
  row.dataset.entry = entry.id;

  // IIIF · a shelf that shows what it holds. The entry already carries the
  // checksum (SHELF1), and the checksum IS the image's identifier, so a
  // thumbnail is one URL and no download of the original. Everything else keeps
  // the glyph it had: no service, no checksum, not an image → unchanged.
  const icon = document.createElement("span");
  icon.className = "shelf-icon";
  const thumb = entry.kind === "image"
    ? iiifThumbnailUrl({ id: entry.id, node_type: "resource", name: entry.name,
                         data: { checksum: entry.checksum,
                                 media_type: "image/jpeg" } } as EmNode,
                       iiifBase(), 96)
    : null;
  if (thumb) {
    const img = new Image();
    img.className = "shelf-thumb";
    img.src = thumb;
    img.alt = "";
    img.loading = "lazy";
    // a service that is configured but cannot answer must not leave a broken
    // frame in the list: fall back to the glyph, silently
    img.addEventListener("error", () => {
      img.remove();
      icon.textContent = "🖼";
    });
    icon.appendChild(img);
  } else {
    icon.textContent = entry.kind === "image" ? "🖼"
      : entry.kind === "document" ? "📄"
      : entry.kind === "web_page" ? "🔗" : "•";
  }

  const main = document.createElement("div");
  main.className = "shelf-main";
  const name = document.createElement("div");
  name.className = "shelf-name";
  name.textContent = entry.name;
  const locator = document.createElement("code");
  locator.className = "shelf-locator";
  locator.textContent = entry.locator;
  main.append(name, locator);

  // The two axes, SHOWN — the three-fence model has to be visible or it is not
  // a model, it is a field in a file. A badge that was never recorded is marked
  // as inferred (the dotted one), so "curated" and "assumed" stay tellable
  // apart at a glance.
  const badges = document.createElement("div");
  badges.className = "shelf-badges";
  const scope = effectiveScope(entry);
  const residency = effectiveResidency(entry);
  const scopeBadge = document.createElement("span");
  scopeBadge.className = `shelf-badge scope-${scope}` + (entry.scope ? "" : " inferred");
  scopeBadge.textContent = t(`shelf.scope.${scope}`);
  scopeBadge.title = entry.scope ? t("shelf.recorded") : t("shelf.inferred");
  const resBadge = document.createElement("span");
  resBadge.className = "shelf-badge" + (entry.residency ? "" : " inferred");
  resBadge.textContent = t(`shelf.residency.${residency}`);
  resBadge.title = entry.residency ? t("shelf.recorded") : t("shelf.inferred");
  badges.append(scopeBadge, resBadge);
  if (entry.checksum) {
    const sum = document.createElement("span");
    sum.className = "shelf-badge checksum";
    sum.textContent = "⌗ " + entry.checksum.slice(7, 15);
    sum.title = entry.checksum;
    badges.appendChild(sum);
  }

  const actions = document.createElement("div");
  actions.className = "shelf-actions";
  if (isAnnotatable(entry)) {
    const annotate = document.createElement("button");
    annotate.textContent = t("shelf.annotate");
    annotate.title = t("shelf.annotateTitle");
    annotate.addEventListener("click", () => annotateShelfEntry(entry));
    actions.appendChild(annotate);
  }
  const drop = document.createElement("button");
  drop.textContent = "✕";
  drop.title = t("shelf.remove");
  drop.addEventListener("click", () => {
    removeFromShelf(entry.id);
    renderShelf();
  });
  actions.appendChild(drop);

  row.append(icon, main, badges, actions);
  return row;
}

/**
 * A file dragged from the Storage window lands here — with its DIGEST.
 *
 * The checksum is what makes this a curated list rather than a pile: the same
 * photograph dragged twice from two folders is one resource, and only the
 * content can say so. The browser cannot compute it (it is not allowed to read
 * the file), so the bridge does — one call, and the entry is deduplicated on the
 * way in.
 */
async function addFileToShelf(payload: StorageDragPayload): Promise<void> {
  let checksum: string | undefined;
  try {
    const res = await fetch(
      `${await bridgeUrl()}/fs/checksum?path=${encodeURIComponent(payload.path)}`,
    );
    if (res.ok) {
      const data = (await res.json()) as { checksum?: string };
      checksum = data.checksum;
    }
  } catch {
    /* no bridge: the resource still goes on the shelf, just without a digest —
       losing the drop because the hash failed would be the wrong trade */
  }
  const entry = addToShelf({
    locator: payload.path,
    name: payload.name,
    checksum,
    scope: "own-study",
    residency: "resident",
  });
  renderShelf();
  toast(checksum
    ? t("shelf.added", { name: entry.name })
    : t("shelf.addedNoChecksum", { name: entry.name }));
}

function addUrlToShelf(): void {
  const input = document.getElementById("shelf-url") as HTMLInputElement;
  const uri = input.value.trim();
  if (!uri) return;
  if (!/^(https?:|s3:)/i.test(uri)) {
    toast(t("shelf.notAUri"));
    return;
  }
  const entry = addToShelf({
    locator: uri,
    name: uri.split("/").filter(Boolean).pop() || uri,
    scope: shelfUrlScope,
    // a published URI is somebody else's: it stays at home until asked otherwise
    residency: "reference",
  });
  input.value = "";
  renderShelf();
  toast(t("shelf.added", { name: entry.name }));
}

function saveShelf(): void {
  const doc = shelfToDocument();
  const blob = new Blob([JSON.stringify(doc, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${shelfMeta().name.replace(/\s+/g, "_") || "shelf"}.shelf.em.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(t("shelf.saved"));
}

function openShelfFile(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,.em.json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    let doc: unknown;
    try {
      doc = JSON.parse(await file.text());
    } catch {
      toast(t("shelf.unreadable"));
      return;
    }
    const res = loadShelfDocument(doc);
    if (!res.ok) {
      // A study graph is refused rather than read for whatever resources it
      // happens to hold: opening one "as a shelf" would silently turn its
      // documents into shelf entries, and nobody could tell what they held.
      toast(t("shelf.notAShelf"));
      return;
    }
    renderShelf();
    toast(t("shelf.opened", { n: String(res.count) }));
  });
  input.click();
}

/** Send a shelf resource to the Annotator — the gesture that makes the
 *  annotator usable: "select a resource" now has somewhere to select FROM. */
function annotateShelfEntry(entry: ShelfEntry): void {
  const win = windowsOf().find((w) => w.type === "annotator");
  if (!win) {
    toast(t("shelf.noAnnotator"));
    return;
  }
  setAnnotatorShelfSource(entry);
  selectWindow(win.id);
  toast(t("shelf.sentToAnnotator", { name: entry.name }));
}

// ── A2 · THE ANNOTATOR · an image, and the claims traced on it ──────────────
//
// The gesture is small and the meaning is not: tracing "this and not that" on a
// photograph is already an interpretation, so an annotation is never a coloured
// box — it is a CLAIM, and the claim needs the chain that makes it readable by
// somebody else (extractor → property → unit, plus the region as its evidence).
//
// None of that semantics lives here. s3Dgraphy builds the chain, the bridge
// carries the call, and this window does the two things a canvas is for: show
// the picture, and take the gesture. What it must get right is the COORDINATES —
// normalised [0,1], the same numbers the datamodel stores — so nothing on this
// side ever writes down a pixel size that a re-export would invalidate.

/**
 * SHELF1/W1 · load a bridge-served file through CORS, as a `blob:` URL.
 *
 * The security fix has a consequence, and it is not a small one: `<img src>` and
 * `<object data>` are **no-cors** requests — they carry NO `Origin` — and the
 * bridge is on another port, so the browser calls them `cross-site`. Which is
 * exactly the shape the new `/fs` gate refuses… including when the request comes
 * from EMStudio itself. Measured: 403 for the `<img>`, 200 for a `fetch`.
 *
 * So the bytes are fetched with `fetch` (which DOES send Origin, and gets the
 * reflected CORS header back) and handed to the element as a `blob:` URL. One
 * path for images and PDFs alike, and no exception carved into the gate — the
 * alternative was allowing `Sec-Fetch-Site: cross-site` again, which is the hole
 * itself.
 *
 * Cost, declared: the file passes through memory. Fine for a preview, wrong for
 * a 200 MB orthophoto — the day that matters, this is where a range-request or a
 * server-side thumbnail goes.
 */
const bridgeBlobCache = new Map<string, string>();

async function bridgeBlobUrl(url: string): Promise<string> {
  if (!url.includes("/fs/file?path=")) return url;   // not ours: leave it alone
  const cached = bridgeBlobCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const objectUrl = URL.createObjectURL(await res.blob());
  bridgeBlobCache.set(url, objectUrl);
  return objectUrl;
}

/** The tools the annotator offers. `lasso`/`mask` are declared and disabled:
 *  phase 2, and a tool that is coming is better announced than discovered. */
const ANNOTATOR_TOOLS = [
  { id: "rect", glyph: "▭", labelKey: "tool.rect" },
  { id: "polygon", glyph: "⬟", labelKey: "tool.polygon" },
  { id: "lasso", glyph: "✎", labelKey: "tool.lasso", disabled: "tool.phase2" },
] as const;

type AnnotatorTool = (typeof ANNOTATOR_TOOLS)[number]["id"];

/** The region being traced, before it is committed. Normalised, always. */
interface AnnotatorDraft {
  shape_kind: "rect" | "polygon";
  rect?: [number, number, number, number];
  points?: Array<[number, number]>;
}

let annotatorTool: AnnotatorTool = "rect";
let annotatorDraft: AnnotatorDraft | null = null;
/** The image the window is on: resolved once per source, like the viewer's. */
let annotatorImage: { key: string; nodeId: string; title: string; url: string;
                      path?: string; page: number; iiif?: boolean } | null = null;
let annotatorLoading: string | null = null;

/** SHELF1 · a resource PICKED FROM THE SHELF, when there is one.
 *
 * Before this the annotator followed the selection and nothing else, so
 * "select a document or a resource with an image" had nowhere to select FROM —
 * the empty state was a dead end. The shelf is that somewhere. An explicit pick
 * wins over the selection until it is cleared: you chose this picture, and a
 * click on the canvas should not take it away from under you.
 */
let annotatorShelfSource: ShelfEntry | null = null;

function setAnnotatorShelfSource(entry: ShelfEntry | null): void {
  annotatorShelfSource = entry;
  annotatorImage = null;        // force the picture to be resolved again
  annotatorDraft = null;
  renderAnnotator();
}

/** How wide the annotator's picture is on screen, in CSS pixels. What the Image
 *  API is asked for — not the file's own size, which is the point. */
function srcWidthForAnnotator(): number {
  const host = document.getElementById("annotator-view");
  const width = host?.clientWidth ?? 0;
  return width > 64 ? width : 1024;
}

/** What `info.json` said about the picture on screen, once it has answered.
 *  Filled asynchronously; until then the annotator asks for `max`, which always
 *  works. */
let annotatorInfo: { key: string; info: ImageInfo | null } | null = null;

/** The Image API URL for the picture on screen, or null when there is no image
 *  service, no checksum, or the resource is not an image — in which case the
 *  annotator does exactly what it did before. */
function iiifImageUrlFor(node: EmNode | null, cssWidth: number): string | null {
  if (!node || !isImageResource(node)) return null;
  const base = iiifBase();
  const key = `${base}|${node.id}`;
  if (annotatorInfo?.key !== key) {
    // ask once, then redraw: the size of the source decides how much of it is
    // worth fetching, and it is the image server that knows
    void fetchImageInfo(node, base).then((info) => {
      annotatorInfo = { key, info };
      if (info) renderAnnotator();
    });
  }
  return fittedUrl(node, base, cssWidth,
                   annotatorInfo?.key === key ? annotatorInfo.info : null);
}

/** The node the annotator is showing — the current element, as everywhere else. */
function annotatorNodeId(): string | null {
  return selectedId ?? null;
}

function annotatorMode(): string {
  return winModeOf(activeWin());
}

/**
 * Resolve the picture, then draw. The image is fetched THROUGH THE BRIDGE for a
 * disk path (W1: a page served over http cannot read one — measured), and
 * straight from the URL when the node already carries one.
 */
function renderAnnotator(): void {
  const win = activeWin();
  if (win.type !== "annotator") return;
  const img = document.getElementById("annotator-image") as HTMLImageElement | null;
  const title = document.getElementById("annotator-title");
  const hint = document.getElementById("annotator-hint");
  if (!img || !title || !hint) return;

  // The Mode reaches the CSS as an attribute, so the difference between looking
  // and tracing is `pointer-events` and nothing else: the overlay keeps exactly
  // the same geometry in every mode, which is the SHELL-FIX rule (a surface that
  // changes size when you change mode makes a mode switch a layout change).
  document.getElementById("annotator-view")?.setAttribute("data-mode", annotatorMode());

  // SHELF1 · the shelf pick wins over the selection. The annotator used to have
  // only the selection, so its empty state was a dead end ("select a resource"
  // — from where?). Now the shelf is the wide list you pick from, and the pick
  // stays put until it is cleared.
  const picked = annotatorShelfSource;
  const nodeId = picked ? null : annotatorNodeId();
  const node = nodeId ? (store?.node(nodeId) ?? null) : null;
  const src = picked ? picked.locator : viewerSourceOf(node);
  hint.textContent = "";

  if (!src) {
    annotatorImage = null;
    img.removeAttribute("src");
    img.classList.add("hidden");
    title.textContent = shelfEntries().length
      ? t("annotator.pickFromShelf")
      : t("annotator.noImage");
    drawAnnotatorOverlay();
    renderAnnotatorPanel();
    return;
  }

  // A2/IIIF · when the picture is a published image and this deployment has an
  // Image API, the annotator asks THE IMAGE SERVER for it, at the size of its
  // own viewport, instead of pulling the original through a blob. A 200-megapixel
  // scan then costs what fits on screen — which is the difference between an
  // annotator that opens and one that hangs.
  //
  // The geometry is untouched by this: regions are normalised [0,1], so which
  // rendition is on screen changes nothing about what is recorded.
  const service = iiifBase() ? iiifImageUrlFor(node, srcWidthForAnnotator()) : null;
  const key = `${picked ? picked.id : nodeId}|${service ?? src}`;
  if (annotatorImage?.key === key) {
    drawAnnotatorOverlay();
    renderAnnotatorPanel();
    return;
  }
  if (service) {
    annotatorImage = {
      key, nodeId: picked ? picked.id : nodeId!,
      title: picked ? picked.name : String(node?.name || nodeId),
      url: service, page: 0, iiif: true,
    };
    img.classList.remove("hidden");
    img.src = service;              // public by design: an Image API needs no token
    title.textContent = annotatorImage.title;
    hint.textContent = annotatorMode() === "annotate"
      ? t("annotator.hintDraw") : t("annotator.hintView");
    refreshAnnotatorIiif();
    drawAnnotatorOverlay();
    renderAnnotatorPanel();
    return;
  }

  const show = (rawUrl: string, path?: string): void => {
    annotatorImage = {
      key,
      // A shelf pick has no node in the graph yet — the region will be attached
      // to the resource by id when it is committed (the bridge promotes it to a
      // Document, W1/A2). Using the shelf entry's id keeps that one identity.
      nodeId: picked ? picked.id : nodeId!,
      title: picked ? picked.name : String(node?.name || nodeId),
      url: rawUrl, path, page: 0,
    };
    img.classList.remove("hidden");
    // through CORS (see `bridgeBlobUrl`): a bare <img src> to the bridge is a
    // no-cors cross-site request and the /fs gate refuses it — rightly.
    void bridgeBlobUrl(rawUrl)
      .then((src) => { img.src = src; })
      .catch(() => { img.removeAttribute("src"); title.textContent = t("viewer.unreachable"); });
    title.textContent = annotatorImage.title;
    hint.textContent = annotatorMode() === "annotate"
      ? t("annotator.hintDraw") : t("annotator.hintView");
    drawAnnotatorOverlay();
    renderAnnotatorPanel();
  };

  if (viewerIsFetchable(src)) {
    show(src);
    return;
  }
  // a disk path: the bridge is the only thing that can read it
  if (annotatorLoading === key) return;
  annotatorLoading = key;
  title.textContent = t("storage.loading");
  void (async () => {
    try {
      const collection = await collectionFromFile(src);
      annotatorLoading = null;
      if (activeWin().id !== win.id || annotatorNodeId() !== nodeId) return;
      const item = collection.items[0];
      if (item) show(item.url, item.path);
    } catch (err) {
      annotatorLoading = null;
      if (activeWin().id !== win.id) return;
      annotatorImage = null;
      img.classList.add("hidden");
      title.textContent = err instanceof BridgeDownError
        ? t("storage.bridgeDown")
        : t("viewer.outsideRoots");
      drawAnnotatorOverlay();
    }
  })();
}

/** Every region already in the graph for the image on screen. Read from the
 *  DOCUMENT, not from a list this window keeps: after a commit the region is a
 *  node like any other, and drawing it from the graph is what makes "the
 *  annotation is in the graph" visible instead of merely asserted. */
function annotatorRegions(): EmNode[] {
  const image = annotatorImage;
  if (!image || !store) return [];
  return store.doc.graph.nodes.filter((n) => {
    if (n.node_type !== "annotation_region") return false;
    const data = (n.data ?? {}) as Record<string, unknown>;
    const page = Number(data.page ?? 0);
    return data.resource_id === image.nodeId && page === image.page;
  });
}

// ── A2/IIIF · the interoperability corner ────────────────────────────────────
//
// Three gestures, and all three are the SAME claim seen from different sides:
// the regions of this image are nodes in the em.json, and W3C Web Annotation /
// IIIF are how they travel. Nothing here writes a second copy of anything.

/** Show the corner only when the picture really is served by an Image API. */
function refreshAnnotatorIiif(): void {
  const corner = document.getElementById("annotator-iiif");
  if (!corner) return;
  corner.classList.toggle("hidden", !annotatorImage?.iiif);
}

/** The node the annotator is showing, when it is a graph resource. */
function annotatorResourceNode(): EmNode | null {
  const id = annotatorImage?.nodeId;
  return id ? (store?.node(id) ?? null) : null;
}

/** The image's pixel size, as the <img> reports it once loaded. Used to project
 *  a region into PIXEL selectors, which is what viewers implement; without it
 *  the projection falls back to percentages, which are exact anyway. */
function annotatorPixelSize(): { width: number; height: number } | null {
  // info.json first: the <img> holds whatever RENDITION was requested, and a
  // selector in the pixels of a downscaled copy would put the region in the
  // wrong place for everybody else.
  if (annotatorInfo?.info) return annotatorInfo.info;
  const img = document.getElementById("annotator-image") as HTMLImageElement | null;
  if (!img?.naturalWidth || !img.naturalHeight) return null;
  return { width: img.naturalWidth, height: img.naturalHeight };
}

/** EMIT · this image's regions as W3C Web Annotations, on the clipboard.
 *
 *  An AnnotationPage rather than a bare list: it is what a viewer expects to be
 *  handed, and it is what Mirador reads. The target is the image's own IIIF
 *  service id, so the annotations mean something away from this app. */
function copyWebAnnotations(): void {
  const resource = annotatorResourceNode();
  const service = iiifImageService(resource, iiifBase());
  const regions = annotatorRegions();
  if (!service || !regions.length) {
    toast(t("annotator.iiifNothing"));
    return;
  }
  const size = annotatorPixelSize();
  const page = {
    "@context": "http://iiif.io/api/presentation/3/context.json",
    id: `${service.id}/annotations`,
    type: "AnnotationPage",
    items: regions.map((r) => regionToWebAnnotation(r, service.id, size)),
  };
  const text = JSON.stringify(page, null, 2);
  void navigator.clipboard?.writeText(text).catch(() => { /* no clipboard: below */ });
  logInfo(text);
  toast(t("annotator.iiifCopied", { n: String(regions.length) }));
}

/** CONSUME · a Web Annotation somebody else made becomes a region of the graph.
 *
 *  Written through the store's ordinary stamped path, so an annotation that
 *  arrives from Mirador is indistinguishable — in provenance terms — from one
 *  traced here: it has an author, a time, and a place in the CRDT. That is the
 *  half of "round-trippable" that matters, and the half most tools skip. */
function pasteWebAnnotation(): void {
  const image = annotatorImage;
  if (!image || !store) return;
  const raw = window.prompt(t("annotator.iiifPastePrompt"));
  if (!raw) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    toast(t("annotator.iiifBadJson"));
    return;
  }
  const items = Array.isArray((parsed as { items?: unknown[] })?.items)
    ? ((parsed as { items: unknown[] }).items)
    : [parsed];
  const size = annotatorPixelSize();
  let made = 0;
  for (const item of items) {
    try {
      const region = webAnnotationToRegion(item as never, size);
      const id = region.id || store.newId();
      if (store.node(id)) continue;              // already here: not news
      store.addNode({
        id, node_type: "annotation_region",
        name: region.name || t("annotator.importedRegion"),
        data: {
          shape_kind: region.shape_kind,
          ...(region.rect ? { rect: region.rect } : {}),
          ...(region.points ? { points: region.points } : {}),
          page: region.page ?? 0,
          resource_id: image.nodeId,
        },
      } as EmNode);
      store.addEdge(id, image.nodeId, "is_on_resource");
      made += 1;
    } catch (err) {
      logInfo(String(err));
    }
  }
  toast(made ? t("annotator.iiifPasted", { n: String(made) })
             : t("annotator.iiifNoRegion"));
  renderAnnotator();
}

/** The manifest of this image, as a URL a viewer can be pointed at.
 *
 *  Built by em-server from the ROOM's graph (`/v1/rooms/…/iiif/…/manifest`),
 *  because a manifest must be fetchable by the viewer — a document this page
 *  holds in memory is not something Mirador can open. Without a room there is
 *  no such URL, and the button says so instead of opening an empty viewer. */
function manifestUrlForAnnotator(): string | null {
  const image = annotatorImage;
  const settings = getSettings();
  if (!image || !sync.room || !settings.sync.hubUrl) return null;
  const base = settings.sync.hubUrl.replace(/\/+$/, "");
  return `${base}/v1/rooms/${encodeURIComponent(sync.room)}/iiif/`
    + `${encodeURIComponent(image.nodeId)}/manifest`;
}

/** Open this image, with its regions, in Mirador. */
function openInMirador(): void {
  const manifest = manifestUrlForAnnotator();
  if (!manifest) {
    toast(t("annotator.miradorNeedsRoom"));
    return;
  }
  const viewer = miradorBase();
  const url = `${viewer}${viewer.includes("?") ? "&" : "?"}`
    + `iiif-content=${encodeURIComponent(manifest)}`;
  window.open(url, "_blank", "noopener");
}

/** Geometry of a region node, in normalised coordinates. */
function regionGeometry(node: EmNode): AnnotatorDraft | null {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const kind = data.shape_kind;
  if (kind === "rect" && Array.isArray(data.rect) && data.rect.length === 4) {
    return { shape_kind: "rect", rect: (data.rect as number[]).slice(0, 4) as
             [number, number, number, number] };
  }
  if (kind === "polygon" && Array.isArray(data.points)) {
    return { shape_kind: "polygon",
             points: (data.points as number[][]).map((p) => [p[0], p[1]] as [number, number]) };
  }
  return null;
}

/**
 * Draw the overlay in NORMALISED coordinates.
 *
 * The SVG has `viewBox="0 0 1 1"` and stretches over the picture, so a region is
 * written with the same numbers the datamodel stores — no conversion, and
 * nothing to get wrong when the image is displayed at another size. The cost is
 * that strokes stretch with it, which is why the shapes carry
 * `vector-effect: non-scaling-stroke`.
 */
function drawAnnotatorOverlay(): void {
  const svg = document.getElementById("annotator-overlay");
  if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const NS = "http://www.w3.org/2000/svg";

  const shape = (geom: AnnotatorDraft, className: string): SVGElement | null => {
    if (geom.shape_kind === "rect" && geom.rect) {
      const [x, y, w, h] = geom.rect;
      const el = document.createElementNS(NS, "rect");
      el.setAttribute("x", String(x));
      el.setAttribute("y", String(y));
      el.setAttribute("width", String(Math.max(w, 0)));
      el.setAttribute("height", String(Math.max(h, 0)));
      el.setAttribute("class", className);
      return el;
    }
    if (geom.shape_kind === "polygon" && geom.points?.length) {
      const el = document.createElementNS(NS, "polygon");
      el.setAttribute("points", geom.points.map(([x, y]) => `${x},${y}`).join(" "));
      el.setAttribute("class", className);
      return el;
    }
    return null;
  };

  for (const region of annotatorRegions()) {
    const geom = regionGeometry(region);
    if (!geom) continue;
    const el = shape(geom, "annot-region");
    if (el) {
      el.setAttribute("data-region", region.id);
      svg.appendChild(el);
    }
  }
  if (annotatorDraft) {
    const el = shape(annotatorDraft, "annot-draft");
    if (el) svg.appendChild(el);
    // a polygon in progress shows its vertices, or you cannot tell where the
    // next click will attach
    if (annotatorDraft.shape_kind === "polygon") {
      for (const [x, y] of annotatorDraft.points ?? []) {
        const dot = document.createElementNS(NS, "circle");
        dot.setAttribute("cx", String(x));
        dot.setAttribute("cy", String(y));
        dot.setAttribute("r", "0.006");
        dot.setAttribute("class", "annot-vertex");
        svg.appendChild(dot);
      }
    }
  }
}

/** Pointer position → normalised coordinates of the IMAGE, clamped to it. */
function annotatorPoint(e: PointerEvent | MouseEvent): [number, number] | null {
  const svg = document.getElementById("annotator-overlay");
  if (!svg) return null;
  const box = svg.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  const clamp = (v: number): number => Math.min(1, Math.max(0, v));
  return [clamp((e.clientX - box.left) / box.width),
          clamp((e.clientY - box.top) / box.height)];
}

/**
 * The tracing gestures, wired ONCE on the overlay (it is a singleton in the
 * area, like every other surface). Only Mode `annotate` draws: in `view` the
 * same picture is there to be looked at, and a window that drew whenever you
 * dragged would make looking dangerous.
 */
function initAnnotatorGestures(): void {
  const svg = document.getElementById("annotator-overlay");
  if (!svg) return;
  let dragging = false;
  let origin: [number, number] | null = null;

  svg.addEventListener("pointerdown", (e) => {
    if (annotatorMode() !== "annotate" || !annotatorImage) return;
    const p = annotatorPoint(e as PointerEvent);
    if (!p) return;
    e.preventDefault();
    if (annotatorTool === "rect") {
      dragging = true;
      origin = p;
      annotatorDraft = { shape_kind: "rect", rect: [p[0], p[1], 0, 0] };
      (svg as unknown as Element).setPointerCapture?.((e as PointerEvent).pointerId);
    } else if (annotatorTool === "polygon") {
      // click to add a vertex; the polygon closes from the panel or with Enter,
      // because "double-click to close" and "click to add" fight each other on
      // the last vertex.
      const points = annotatorDraft?.points ?? [];
      annotatorDraft = { shape_kind: "polygon", points: [...points, p] };
    }
    drawAnnotatorOverlay();
    // The panel is NOT opened here. It used to be, and the bug was instructive:
    // it opened on pointerDOWN, took its space, and the picture shrank UNDER THE
    // POINTER — so the rest of the drag was measured against a box that had
    // changed size, and a 35%-tall gesture recorded as 70%. A surface must not
    // resize while a gesture is being measured against it. (It is also an
    // overlay now, so even opening it late moves nothing.)
    if (annotatorTool === "polygon") renderAnnotatorPanel();
  });

  svg.addEventListener("pointermove", (e) => {
    if (!dragging || !origin) return;
    const p = annotatorPoint(e as PointerEvent);
    if (!p) return;
    // dragged in any direction: the rect is normalised so w/h stay positive,
    // which the datamodel requires and a drag up-left would otherwise break
    annotatorDraft = {
      shape_kind: "rect",
      rect: [Math.min(origin[0], p[0]), Math.min(origin[1], p[1]),
             Math.abs(p[0] - origin[0]), Math.abs(p[1] - origin[1])],
    };
    drawAnnotatorOverlay();
  });

  const endDrag = (): void => {
    if (!dragging) return;
    dragging = false;
    origin = null;
    const rect = annotatorDraft?.rect;
    // a click, not a drag: no region. Without this every stray click on the
    // picture would open the panel for a zero-sized region.
    if (rect && (rect[2] < 0.005 || rect[3] < 0.005)) annotatorDraft = null;
    drawAnnotatorOverlay();
    renderAnnotatorPanel();
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  window.addEventListener("keydown", (e) => {
    if (activeWin().type !== "annotator") return;
    if (e.key === "Escape" && annotatorDraft) {
      annotatorDraft = null;
      drawAnnotatorOverlay();
      renderAnnotatorPanel();
    }
  });
}

/** The left panel of an Annotator window: its TOOLS.
 *
 * U2 · this is the generalisation of `RESOURCE_PROVIDERS`. The registry never
 * said "the node types" — it says "what this window OFFERS", which for a Graph
 * is the palette, for a Narrative the story blocks, and here the ways of
 * tracing. Nothing about the panel had to change to hold a different offer.
 */
function renderAnnotatorTools(host: HTMLElement): void {
  const box = document.createElement("div");
  box.className = "annot-tools";
  const heading = document.createElement("div");
  heading.className = "palette-heading";
  heading.textContent = t("annotator.tools");
  box.appendChild(heading);
  for (const tool of ANNOTATOR_TOOLS) {
    const btn = document.createElement("button");
    btn.className = "annot-tool" + (annotatorTool === tool.id ? " current" : "");
    btn.dataset.tool = tool.id;
    btn.innerHTML = `<span class="annot-tool-glyph">${tool.glyph}</span>` +
                    `<span class="annot-tool-label">${escapeHtml(t(tool.labelKey))}</span>`;
    if ("disabled" in tool && tool.disabled) {
      btn.disabled = true;
      btn.title = t(tool.disabled);
    } else {
      btn.addEventListener("click", () => {
        annotatorTool = tool.id as AnnotatorTool;
        annotatorDraft = null;
        drawAnnotatorOverlay();
        renderTiles();          // the panel redraws with the new current tool
        renderAnnotatorPanel();
      });
    }
    box.appendChild(btn);
  }
  const note = document.createElement("p");
  note.className = "annot-tools-note";
  note.textContent = t("annotator.toolsNote");
  box.appendChild(note);
  host.appendChild(box);
}

// ── A2 · "what am I extracting?" — the panel that turns a shape into a claim ──
//
// The question is not decoration: the same traced rectangle means a different
// thing depending on what is being read out of it (the extent of a unit, a
// measurement, a state of conservation). So the property TYPE is asked for
// every time and never defaulted — the bridge refuses a call without one.

function renderAnnotatorPanel(): void {
  const panel = document.getElementById("annotator-panel");
  if (!panel) return;
  const win = activeWin();
  if (win.type !== "annotator" || !annotatorDraft || !annotatorImage) {
    panel.classList.add("hidden");
    panel.textContent = "";
    return;
  }
  if (panel.dataset.open === "1") {
    // Built already — keep whatever was typed, but the GEOMETRY is not typed: it
    // is the gesture, and it must read as the gesture actually is.
    const line = panel.querySelector(".annot-geometry");
    if (line) line.textContent = describeDraft(annotatorDraft);
    return;
  }
  panel.dataset.open = "1";
  panel.classList.remove("hidden");
  panel.textContent = "";

  const title = document.createElement("div");
  title.className = "annot-panel-title";
  title.textContent = t("annotator.whatAreYouExtracting");
  panel.appendChild(title);

  const field = (labelKey: string, control: HTMLElement): void => {
    const wrap = document.createElement("label");
    wrap.className = "annot-field";
    const span = document.createElement("span");
    span.textContent = t(labelKey);
    wrap.append(span, control);
    panel.appendChild(wrap);
  };

  // TARGET — the stratigraphic nodes of this graph, from the graph itself
  const target = document.createElement("select");
  target.className = "annot-input";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = t("annotator.noTarget");
  target.appendChild(none);
  const units = (store?.doc.graph.nodes ?? [])
    .filter((n) => isStratigraphicType(n.node_type))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  for (const unit of units) {
    const option = document.createElement("option");
    option.value = unit.id;
    option.textContent = `${unit.name} · ${unit.node_type}`;
    target.appendChild(option);
  }
  if (selectedIds.size === 1) {
    const only = [...selectedIds][0];
    if (units.some((u) => u.id === only)) target.value = only;
  }
  field("annotator.target", target);

  // PROPERTY TYPE — the qualia vocabulary, never a hand-written list.
  //
  // NO DEFAULT, on purpose, and the first version taught me why twice over: it
  // pre-selected `"material"`, which is not a term in the vocabulary at all (the
  // id is `material_type`), so the select silently held "" and the commit was
  // refused by the bridge. Hardcoding an EM term is what ADR-001 forbids — and
  // even a VALID default would be wrong here, because "what am I extracting" is
  // the question this panel exists to ask. Answering it on the reader's behalf
  // would put a word in their mouth that travels into the graph as a claim.
  const ptype = document.createElement("select");
  ptype.className = "annot-input";
  const choose = document.createElement("option");
  choose.value = "";
  choose.textContent = t("annotator.choosePropertyType");
  ptype.appendChild(choose);
  for (const q of qualiaList()) {
    const option = document.createElement("option");
    option.value = q.id;
    option.textContent = `${q.name} · ${q.categoryLabel}`;
    option.title = q.description ?? q.rationale ?? "";
    ptype.appendChild(option);
  }
  field("annotator.propertyType", ptype);

  // VALUE — the reading itself
  const value = document.createElement("input");
  value.type = "text";
  value.className = "annot-input";
  value.placeholder = t("annotator.valuePlaceholder");
  field("annotator.value", value);

  // AUTHOR — defaults to the graph's own author, which is nearly always right
  const author = document.createElement("input");
  author.type = "text";
  author.className = "annot-input";
  author.value = defaultAnnotationAuthor();
  field("annotator.author", author);

  const geometry = document.createElement("p");
  geometry.className = "annot-geometry";
  geometry.textContent = describeDraft(annotatorDraft);
  panel.appendChild(geometry);

  const actions = document.createElement("div");
  actions.className = "annot-actions";
  const commit = document.createElement("button");
  commit.className = "annot-commit";
  commit.textContent = t("annotator.commit");
  commit.addEventListener("click", () => {
    void commitAnnotation({
      targetUnitId: target.value || null,
      propertyType: ptype.value,
      value: value.value.trim(),
      author: author.value.trim() || null,
      button: commit,
    });
  });
  const cancel = document.createElement("button");
  cancel.className = "annot-cancel";
  cancel.textContent = t("annotator.cancel");
  cancel.addEventListener("click", () => {
    annotatorDraft = null;
    panel.dataset.open = "";
    drawAnnotatorOverlay();
    renderAnnotatorPanel();
  });
  actions.append(commit, cancel);
  panel.appendChild(actions);
}

/** The graph's own author, when it has one — the annotation is nearly always by
 *  whoever is holding the document. */
function defaultAnnotationAuthor(): string {
  try {
    const scope = store?.readGraphScope?.();
    return String((scope as { author?: string } | undefined)?.author ?? "");
  } catch {
    return "";
  }
}

function describeDraft(draft: AnnotatorDraft): string {
  if (draft.shape_kind === "rect" && draft.rect) {
    const [x, y, w, h] = draft.rect.map((v) => Math.round(v * 1000) / 10);
    return `rect ${x}% ${y}% · ${w}×${h}%`;
  }
  return `polygon · ${draft.points?.length ?? 0} ${t("annotator.points")}`;
}

/**
 * Commit: the bridge builds the chain, and the graph receives it.
 *
 * The response is a DELTA, so it lands through `store.addSubgraph` as ONE undo
 * step and the layout survives — the alternative (replacing the document with
 * the returned graph) would throw away the arrangement for a gesture that added
 * four nodes.
 */
async function commitAnnotation(input: {
  targetUnitId: string | null;
  propertyType: string;
  value: string;
  author: string | null;
  button: HTMLButtonElement;
}): Promise<void> {
  if (!store || !annotatorDraft || !annotatorImage) return;
  if (annotatorDraft.shape_kind === "polygon" &&
      (annotatorDraft.points?.length ?? 0) < 3) {
    toast(t("annotator.polygonNeedsThree"));
    return;
  }
  if (!input.propertyType) {
    toast(t("annotator.propertyTypeRequired"));
    return;
  }
  if (!input.value) {
    toast(t("annotator.valueRequired"));
    return;
  }
  const region: Record<string, unknown> = {
    shape_kind: annotatorDraft.shape_kind,
    page: annotatorImage.page,
  };
  if (annotatorDraft.rect) region.rect = annotatorDraft.rect;
  if (annotatorDraft.points) region.points = annotatorDraft.points;

  input.button.disabled = true;
  try {
    const res = await fetch(`${await bridgeUrl()}/annotate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doc: store.doc,
        image_id: annotatorImage.nodeId,
        region,
        interpretation: input.value,
        property_type: input.propertyType,
        target_unit_id: input.targetUnitId,
        author: input.author,
      }),
    });
    const payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; nodes?: EmNode[]; edges?: EmEdge[];
          warnings?: string[]; region_id?: string; created?: boolean }
      | null;
    if (!res.ok || !payload?.ok) {
      // the bridge's own words: it knows WHY better than a generic failure does
      toast(payload?.error ?? `bridge ${res.status}`);
      return;
    }
    const added = store.addSubgraph(payload.nodes ?? [], payload.edges ?? []);
    annotatorDraft = null;
    const panel = document.getElementById("annotator-panel");
    if (panel) panel.dataset.open = "";
    drawAnnotatorOverlay();
    renderAnnotatorPanel();
    draw();
    drawTiles();
    renderEmData();
    refreshInspector();
    for (const w of payload.warnings ?? []) toast(w);
    toast(added.nodes || added.edges
      ? t("annotator.committed", { n: String(added.nodes), e: String(added.edges) })
      : t("annotator.alreadyThere"));
  } catch (err) {
    toast(`${t("storage.bridgeDown")} (${err instanceof Error ? err.message : err})`);
  } finally {
    input.button.disabled = false;
  }
}

// ── W1 · STORAGE · the window onto where the bytes live ─────────────────────
//
// Its MODES are the backends — Filesystem now, MinIO in phase 2 — because "one
// window, several ways of looking" is the shape the Graph window already has.
// Adding Samba or WebDAV later is an entry in `WINDOW_MODES` plus a branch in
// `renderStorage`, not a new window type.
//
// Everything it shows comes from the bridge. That is not an implementation
// detail to hide: a page served over http CANNOT read a disk path, so the
// alternative to the bridge is not "a simpler way", it is nothing at all.

/** The drag payload a Storage entry puts on the wire. Deliberately NOT
 *  `PALETTE_MIME`: dropping a FOLDER on a window means "show me this", while
 *  dropping a node type means "create one of these". Two intentions, two mime
 *  types — a single one would make a Graph window try to place a directory. */
const STORAGE_MIME = "application/x-em-storage-entry";

interface StorageDragPayload {
  path: string;
  type: "dir" | "file";
  name: string;
  ext: string;
}

/** The folder a Storage window is showing (per instance — two Storage windows
 *  browse independently). `null` = the roots. */
function storagePath(win: Win): string | null {
  const v = winCurrent(win, "fsPath");
  return typeof v === "string" ? v : null;
}

function setStoragePath(win: Win, path: string | null): void {
  setWinCurrent(win, "fsPath", path);
  renderStorage();
}

function renderStorage(): void {
  const body = document.getElementById("storage-body");
  const crumb = document.getElementById("storage-crumb");
  const up = document.getElementById("storage-up") as HTMLButtonElement | null;
  if (!body || !crumb || !up) return;
  const win = activeWin();
  if (win.type !== "storage") return;

  if (winModeOf(win) === "minio") {
    // THE OBJECT STORE, for real now. A file goes to the room's store, comes
    // back as its own sha256, becomes a ResourceNode that POINTS at those bytes
    // — never carries them — and the upload is also the moment the rights are
    // declared, because that is when the asset first exists as a thing anybody
    // can point at (`s3Dgraphy/docs/asset-dtc-protocol.md`).
    crumb.textContent = sync.room ? `${t("storage.minio")} · ${sync.room}` : "";
    up.classList.add("hidden");
    body.textContent = "";
    body.appendChild(minioPanel());
    return;
  }

  up.classList.remove("hidden");
  const path = storagePath(win);
  body.textContent = "";
  body.appendChild(storageEmpty(t("storage.loading")));

  void (async () => {
    let listing: FsListing;
    try {
      listing = await fsList(path ?? undefined);
    } catch (err) {
      body.textContent = "";
      const down = err instanceof BridgeDownError;
      const box = storageEmpty(
        down ? t("storage.bridgeDown") : t("storage.refused"),
      );
      if (!down) {
        const why = document.createElement("code");
        why.className = "viewer-path";
        why.textContent = String((err as Error).message);
        box.appendChild(why);
      }
      body.appendChild(box);
      crumb.textContent = down ? "" : (path ?? "");
      return;
    }
    // The window may have moved on (another folder clicked, another type
    // mounted) while the request was in flight — an answer to a question
    // nobody is asking any more must not overwrite the current screen.
    if (activeWin().id !== win.id || storagePath(win) !== path) return;

    crumb.textContent = listing.roots ? t("storage.roots") : listing.path;
    // Up from a ROOT is the list of roots — not "nothing". The bridge says
    // `parent: null` there because there is no parent INSIDE the fence, and
    // reading that as "the button is dead" is what stranded the first version:
    // enter a root and the other roots became unreachable.
    up.disabled = listing.roots;
    up.title = listing.parent ? t("storage.up") : t("storage.upToRoots");
    up.onclick = () => {
      if (listing.roots) return;
      setStoragePath(win, listing.parent); // null at a root → the roots list
    };

    body.textContent = "";
    if (!listing.entries.length) {
      body.appendChild(storageEmpty(t("storage.emptyFolder")));
      return;
    }
    const list = document.createElement("div");
    list.className = "storage-list";
    for (const entry of listing.entries) {
      list.appendChild(storageRow(win, entry));
    }
    body.appendChild(list);
  })();
}

/**
 * ASSETS · the ingestion panel — the object-store mode of a Storage window.
 *
 * Where a batch of files becomes a study's material: bytes into the room's
 * store, one `ResourceNode` each pointing at them, ONE acquisition grouping the
 * lot, and the licence said once for all of it. The Assets workspace puts this
 * between the disk (a Storage window in `filesystem` mode) and the
 * Inspector/Log column, which is the order the act actually happens in.
 *
 * Four things it refuses to do silently, each because the alternative is a lie
 * somebody discovers months later:
 *
 *  · **replace an asset** — same name, different bytes: it says so, and counts
 *    the citations at stake, because a superseded file may no longer be what a
 *    published text cites;
 *  · **hide where the gate is** — `reference` residency keeps the bytes outside
 *    em-server, so no embargo can be applied to them. Offered, with the note,
 *    and never for something embargoed;
 *  · **guess a derivation** — output ← input is DECLARED here, by hand, with the
 *    tool named;
 *  · **attribute without an identity** — no ORCID, no ingestion: the whole point
 *    of the act is that somebody signs it. The tab says so instead of publishing
 *    files nobody stands behind.
 */

/** The panel's little DOM helper — the same three arguments `inspector.ts`
 *  uses, kept local because main.ts has no such helper of its own. */
function ing(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** One file on its way in. The status is the whole story of the row. */
interface IngestItem {
  name: string;
  size: number;
  mediaType: string;
  kind: ResourceKind;
  /** deduced from the kind, and overridable — that is the point of showing it */
  use: ResourceUse;
  /** an OS drop/pick carries the bytes; a drag from the disk pane carries a path */
  file?: File;
  path?: string;
  status: "pending" | "working" | "done" | "same" | "failed" | "referenced";
  digest?: string;
  nodeId?: string;
  note?: string;
}

/** What the batch says about itself, before any of it is published. Kept across
 *  renders (a form that forgot the lot name on every drop would be unusable). */
interface IngestDraft {
  lot: string;
  license: string;
  authorName: string;
  authorOrcid: string;
  residency: Residency;
  scope: Scope;
  items: IngestItem[];
  lastAcquisition: string | null;
  /** the panel's own trail; the Log window keeps the durable one */
  log: string[];
}

const ingestDraft: IngestDraft = {
  lot: "",
  license: DEFAULT_ASSET_LICENSE,
  authorName: "",
  authorOrcid: "",
  residency: "resident",
  scope: "own-study",
  items: [],
  lastAcquisition: null,
  log: [],
};

/** The derivation form's own state — an output, its inputs, and the tool. */
const derivationDraft = { output: "", inputs: [] as string[], tool: "" };

function ingestLog(message: string, level: "info" | "warn" = "info"): void {
  ingestDraft.log.unshift(message);
  if (ingestDraft.log.length > 40) ingestDraft.log.length = 40;
  if (level === "warn") logWarn(`assets: ${message}`);
  else logInfo(`assets: ${message}`);
}

function storageText(message: string): HTMLElement {
  const p = document.createElement("p");
  p.textContent = message;
  return p;
}

/** A labelled control, the shape the rest of the panel is built from. */
function ingestField(
  parent: HTMLElement, label: string, control: HTMLElement, hint?: string,
): void {
  const wrap = document.createElement("label");
  wrap.className = "ing-field";
  const span = document.createElement("span");
  span.className = "ing-label";
  span.textContent = label;
  wrap.append(span, control);
  parent.appendChild(wrap);
  if (hint) {
    const h = document.createElement("div");
    h.className = "insp-hint";
    h.textContent = hint;
    parent.appendChild(h);
  }
}

/**
 * The panel. Rebuilt on every render (it is small and the state lives in
 * `ingestDraft`), and gated in two ways that are NOT the same refusal:
 *
 *  · no room → there is nowhere for the bytes to go;
 *  · no ORCID → there is nobody to sign what is said about them.
 *
 * Saying which one is missing is the difference between a disabled tab and an
 * instruction.
 */
function minioPanel(): HTMLElement {
  const box = document.createElement("div");
  box.className = "ing-panel";

  if (!sync.room || !getSettings().sync.hubUrl) {
    box.classList.add("storage-empty");
    box.appendChild(storageText(t("storage.minioNeedsRoom")));
    return box;
  }
  const me = currentIdentity();
  if (!me) {
    box.classList.add("storage-empty");
    box.appendChild(storageText(t("assets.needsIdentity")));
    return box;
  }
  if (!store) {
    box.classList.add("storage-empty");
    box.appendChild(storageText(t("assets.needsDocument")));
    return box;
  }
  if (!ingestDraft.authorOrcid) {
    ingestDraft.authorOrcid = me.orcid;
    ingestDraft.authorName =
      [me.name, me.surname].filter(Boolean).join(" ") || me.orcid;
  }

  box.appendChild(ingestDropZone());
  box.appendChild(ingestDefaults());
  box.appendChild(ingestQueue());
  box.appendChild(ingestPublishBar());
  box.appendChild(ingestLots());
  box.appendChild(ingestDerivation());
  box.appendChild(ingestTrail());
  return box;
}

/** Where files land: an OS drop, a pick, or a drag out of the disk pane. */
function ingestDropZone(): HTMLElement {
  const zone = document.createElement("div");
  zone.className = "ing-drop";
  zone.appendChild(storageText(t("assets.drop", { room: sync.room ?? "" })));

  const picker = document.createElement("input");
  picker.type = "file";
  picker.multiple = true;                       // a batch, not a file
  picker.className = "storage-file";
  picker.addEventListener("change", () => {
    queueFiles(Array.from(picker.files ?? []));
    picker.value = "";
  });
  zone.appendChild(picker);

  // …and FROM THE SHELF, which is the honest answer to "how does a file on my
  // disk get in here?" in a tiled workspace. Only one Storage surface is mounted
  // at a time (the app's singleton-surface rule, WIN7), so a drag from the disk
  // pane into this one is not a gesture that exists yet — while the shelf is a
  // curated list that already carries the path AND the digest the bridge
  // computed. Reusing it beats building a second file browser here.
  const fromShelf = shelfEntries().filter(
    (entry) => !/^(https?|s3):/i.test(entry.locator));
  if (fromShelf.length) {
    const bar = ing("div", "insp-actions");
    const add = ing("button", "insp-btn",
      t("assets.fromShelf", { n: String(fromShelf.length) })) as HTMLButtonElement;
    add.title = t("assets.fromShelfHint");
    add.addEventListener("click", () => {
      for (const entry of fromShelf) queuePath(entry.locator, entry.name);
    });
    bar.appendChild(add);
    zone.appendChild(bar);
  }

  const stop = (e: DragEvent): void => { e.preventDefault(); e.stopPropagation(); };
  zone.addEventListener("dragover", (e) => {
    stop(e);
    zone.classList.add("ing-drop-over");
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("ing-drop-over"));
  zone.addEventListener("drop", (e) => {
    stop(e);
    zone.classList.remove("ing-drop-over");
    const fromDisk = storageDragPayload(e);
    if (fromDisk) {
      if (fromDisk.type === "dir") {
        toast(t("assets.folderNotYet"));
        return;
      }
      queuePath(fromDisk.path, fromDisk.name);
      return;
    }
    queueFiles(Array.from(e.dataTransfer?.files ?? []));
  });
  return zone;
}

/** OS files (drop or picker) join the queue with their kind deduced. */
function queueFiles(files: File[]): void {
  for (const file of files) {
    const kind = kindOf(file.name, file.type);
    ingestDraft.items.push({
      name: file.name,
      size: file.size,
      mediaType: file.type || "application/octet-stream",
      kind,
      use: defaultUse(kind),
      file,
      status: "pending",
    });
  }
  if (files.length) ingestLog(t("assets.queued", { n: String(files.length) }));
  renderStorage();
}

/** A file dragged out of the disk pane: the bridge holds the bytes, and the
 *  panel fetches them at publish time (the browser may not read the path). */
function queuePath(path: string, name: string): void {
  const kind = kindOf(name);
  ingestDraft.items.push({
    name,
    size: 0,
    mediaType: "application/octet-stream",
    kind,
    use: defaultUse(kind),
    path,
    status: "pending",
  });
  ingestLog(t("assets.queued", { n: "1" }));
  renderStorage();
}

/** The defaults of the LOT: one licence, one author, one name, one fence. */
function ingestDefaults(): HTMLElement {
  const box = document.createElement("div");
  box.className = "ing-defaults";
  box.appendChild(ing("h3", "insp-sect", t("assets.batchDefaults")));

  const lot = document.createElement("input");
  lot.className = "insp-name-input";
  lot.value = ingestDraft.lot;
  lot.placeholder = t("assets.lotPlaceholder");
  lot.addEventListener("change", () => { ingestDraft.lot = lot.value.trim(); });
  ingestField(box, t("assets.lot"), lot, t("assets.lotHint"));

  const lic = document.createElement("input");
  lic.className = "insp-name-input";
  lic.value = ingestDraft.license;
  lic.placeholder = DEFAULT_ASSET_LICENSE;
  lic.addEventListener("change", () => { ingestDraft.license = lic.value.trim(); });
  ingestField(box, t("assets.license"), lic, t("assets.licenseHint"));

  const author = document.createElement("input");
  author.className = "insp-name-input";
  author.value = ingestDraft.authorName;
  author.placeholder = t("assets.authorPlaceholder");
  author.addEventListener("change", () => {
    ingestDraft.authorName = author.value.trim();
  });
  const orcid = document.createElement("input");
  orcid.className = "insp-name-input";
  orcid.value = ingestDraft.authorOrcid;
  orcid.placeholder = "0000-0000-0000-0000";
  orcid.addEventListener("change", () => {
    const iD = orcid.value.trim();
    const problem = iD ? orcidProblem(iD) : null;
    if (problem) {
      orcid.classList.add("insp-input-bad");
      orcid.title = t("assets.orcidBad", { problem });
      return;
    }
    orcid.classList.remove("insp-input-bad");
    ingestDraft.authorOrcid = iD;
  });
  ingestField(box, t("assets.author"), author);
  ingestField(box, "ORCID", orcid, t("assets.authorHint"));

  const residency = document.createElement("select");
  residency.className = "ing-select";
  for (const r of RESIDENCIES) {
    const o = document.createElement("option");
    o.value = r;
    o.textContent = t(`assets.residency.${r}`);
    if (r === ingestDraft.residency) o.selected = true;
    residency.appendChild(o);
  }
  residency.addEventListener("change", () => {
    ingestDraft.residency = residency.value as Residency;
    renderStorage();      // the note appears/disappears with the choice
  });
  ingestField(box, t("assets.residencyLabel"), residency,
              ingestDraft.residency === "reference"
                ? t("assets.referenceNote")
                : t("assets.residentNote"));

  const scope = document.createElement("select");
  scope.className = "ing-select";
  for (const s of SCOPES) {
    const o = document.createElement("option");
    o.value = s;
    o.textContent = s;
    if (s === ingestDraft.scope) o.selected = true;
    scope.appendChild(o);
  }
  scope.addEventListener("change", () => {
    ingestDraft.scope = scope.value as Scope;
  });
  ingestField(box, t("assets.scope"), scope, t("assets.scopeHint"));
  return box;
}

/** The queue: one row per file, with the deduced use as a correctable select. */
function ingestQueue(): HTMLElement {
  const box = document.createElement("div");
  box.className = "ing-queue";
  if (!ingestDraft.items.length) {
    box.appendChild(ing("div", "insp-hint", t("assets.queueEmpty")));
    return box;
  }
  box.appendChild(ing("h3", "insp-sect",
    t("assets.queue", { n: String(ingestDraft.items.length) })));

  for (const [i, item] of ingestDraft.items.entries()) {
    const row = document.createElement("div");
    row.className = `ing-row ing-${item.status}`;

    const name = document.createElement("span");
    name.className = "storage-name";
    name.textContent = item.name;
    name.title = item.path ?? item.name;

    const kind = document.createElement("span");
    kind.className = "ing-kind";
    kind.textContent = item.kind;

    const use = document.createElement("select");
    use.className = "ing-select ing-use";
    for (const u of ["iiif", "proxy", "document", "evidence", "raw"] as ResourceUse[]) {
      const o = document.createElement("option");
      o.value = u;
      o.textContent = t(`assets.use.${u}`);
      if (u === item.use) o.selected = true;
      use.appendChild(o);
    }
    use.title = t("assets.useHint");
    use.addEventListener("change", () => { item.use = use.value as ResourceUse; });
    use.disabled = item.status === "done" || item.status === "working";

    const state = document.createElement("span");
    state.className = "ing-state";
    state.textContent = item.note
      ?? (item.digest ? item.digest.slice(0, 19) + "…" : t(`assets.status.${item.status}`));

    const drop = document.createElement("button");
    drop.className = "insp-btn";
    drop.textContent = "✕";
    drop.title = t("assets.remove");
    drop.addEventListener("click", () => {
      ingestDraft.items.splice(i, 1);
      renderStorage();
    });

    row.append(name, kind, use, state, drop);
    if (item.nodeId) {
      row.addEventListener("dblclick", () => select(item.nodeId!));
      row.title = t("assets.openInspector");
    }
    box.appendChild(row);
  }
  return box;
}

/** Publish, and clear what has been published. */
function ingestPublishBar(): HTMLElement {
  const bar = ing("div", "insp-actions");
  const pending = ingestDraft.items.filter((i) => i.status === "pending").length;

  const publish = ing("button", "insp-btn",
    t("assets.publish", { n: String(pending) })) as HTMLButtonElement;
  publish.disabled = !pending;
  publish.title = t("assets.publishHint");
  publish.addEventListener("click", () => { void publishQueue(); });
  bar.appendChild(publish);

  if (ingestDraft.items.some((i) => i.status !== "pending")) {
    const clear = ing("button", "insp-btn", t("assets.clearDone")) as HTMLButtonElement;
    clear.addEventListener("click", () => {
      ingestDraft.items = ingestDraft.items.filter((i) => i.status === "pending");
      renderStorage();
    });
    bar.appendChild(clear);
  }
  return bar;
}

/**
 * Publish the queue: bytes first, then the graph.
 *
 * The order is the point and it has not changed since the single-file version —
 * a crash leaves an orphan object in the store rather than a graph pointing at
 * nothing. What is new is the PLURAL: the digests come back one by one, the
 * resources are created as they land, and only at the end are they bucketed
 * into one acquisition and the lot's rights declared. Ordering it the other way
 * (a bucket first, filled as it goes) would leave an acquisition claiming
 * members that never arrived.
 */
async function publishQueue(): Promise<void> {
  const doc = store;
  const room = sync.room;
  if (!doc || !room) return;
  const base = getSettings().sync.hubUrl.replace(/\/+$/, "");
  const pending = ingestDraft.items.filter((i) => i.status === "pending");
  if (!pending.length) return;

  const published: string[] = [];
  for (const item of pending) {
    item.status = "working";
    item.note = undefined;
    renderStorage();
    try {
      // ── reference: the bytes stay where they are ────────────────────────
      //
      // Nothing is uploaded, so nothing passes the gate — which is exactly what
      // the note above the toggle says. It needs a PATH: a file dropped from the
      // desktop has no location the graph could point at, and recording its name
      // would be a reference to nowhere.
      if (ingestDraft.residency === "reference") {
        if (!item.path) {
          item.status = "failed";
          item.note = t("assets.referenceNeedsPath");
          ingestLog(t("assets.referenceNeedsPath"), "warn");
          continue;
        }
        const digest = await bridgeChecksum(item.path);
        const nodeId = writeResourceNode(doc, item, digest, item.path);
        item.nodeId = nodeId;
        item.digest = digest ?? undefined;
        item.status = "referenced";
        item.note = t("assets.status.referenced");
        published.push(nodeId);
        continue;
      }

      const bytes = item.file
        ? await item.file.arrayBuffer()
        : await bridgeBytes(item.path!);
      const url = `${base}/v1/rooms/${encodeURIComponent(room)}/asset`
        + `?media_type=${encodeURIComponent(item.mediaType)}`;
      const answer = await fetch(url, {
        method: "PUT",
        headers: hubToken ? { Authorization: `Bearer ${hubToken}` } : {},
        body: bytes,
      });
      if (!answer.ok) {
        item.status = "failed";
        item.note = `${answer.status} ${await answer.text()}`.slice(0, 120);
        ingestLog(t("storage.uploadFailed", { detail: item.note }), "warn");
        continue;
      }
      const info = await answer.json() as {
        ref: string; size?: number; created?: boolean;
      };

      // SUPERSESSION · same name, other bytes. Said BEFORE the node is written,
      // with the citations at stake, because after the fact it is archaeology.
      const superseded = supersessionOf(doc, item.name, info.ref);
      if (superseded) {
        const message = t("assets.superseded", {
          name: superseded.previousName,
          n: String(superseded.usages.length),
        });
        toast(message);
        ingestLog(message, "warn");
        item.note = t("assets.supersedes", { n: String(superseded.usages.length) });
      }

      item.digest = info.ref;
      item.nodeId = writeResourceNode(doc, item, info.ref,
                                      `${base}/v1/rooms/${encodeURIComponent(room)}`
                                      + `/asset/${encodeURIComponent(info.ref)}`);
      item.status = info.created === false ? "same" : "done";
      published.push(item.nodeId);
      ingestLog(info.created === false
        ? t("storage.uploadSame", { sha: info.ref.slice(0, 19) })
        : t("storage.uploaded", { sha: info.ref.slice(0, 19) }));
    } catch (err) {
      item.status = "failed";
      item.note = String(err instanceof Error ? err.message : err).slice(0, 120);
      ingestLog(t("storage.uploadFailed", { detail: item.note }), "warn");
    }
    renderStorage();
  }

  if (published.length) {
    const lot = bucketAcquisition(doc, {
      resources: published,
      name: ingestDraft.lot || undefined,
      metadata: {
        ingested_at: new Date().toISOString(),
        source: ingestDraft.items.some((i) => i.path) ? "filesystem" : "drop",
      },
    });
    ingestDraft.lastAcquisition = lot.acquisitionId;
    for (const w of lot.warnings) ingestLog(w, "warn");

    // …and the LOT is attributed, once. `setNodeRights` signs it with the
    // session's ORCID (the attributor), which is a different person from the
    // author whenever somebody catalogues what a colleague made.
    doc.setNodeRights(lot.acquisitionId, {
      license: ingestDraft.license,
      ...(ingestDraft.authorOrcid || ingestDraft.authorName
        ? { author: ingestDraft.authorName || ingestDraft.authorOrcid,
            orcid: ingestDraft.authorOrcid }
        : {}),
    });
    ingestLog(t("assets.bucketed", {
      n: String(lot.count),
      lot: doc.node(lot.acquisitionId)?.name ?? lot.acquisitionId,
    }));
    select(lot.acquisitionId);
    draw();
    renderEmData();
    refreshInspector();
  }
  renderStorage();
}

/** The resource node for one published item — created, or found by digest and
 *  updated. The node POINTS at the bytes; it never carries them. */
function writeResourceNode(
  doc: DocumentStore, item: IngestItem, digest: string | null, url: string,
): string {
  const existing = digest ? findResource(doc, digest) : null;
  const data: Record<string, unknown> = {
    ...(digest ? { checksum: digest } : {}),
    media_type: item.mediaType,
    residency: ingestDraft.residency,
    scope: ingestDraft.scope,
    // the DEDUCED kind and the (correctable) use, kept apart: one is a fact
    // about the bytes, the other a decision about them
    url_type: item.kind,
    resource_use: item.use,
    ...(item.size ? { size: item.size } : {}),
    url,
  };
  if (existing) {
    doc.updateNode(existing.id, {
      data: { ...(existing.data as Record<string, unknown> | undefined), ...data },
    } as Partial<EmNode>);
    return existing.id;
  }
  const node = doc.addNode({
    id: doc.newId(),
    name: item.name,
    node_type: "resource",
    description: "",
    data,
  } as unknown as EmNode);
  return node.id;
}

/** The bridge holds the bytes of a file on disk — the page may not read it. */
async function bridgeBytes(path: string): Promise<ArrayBuffer> {
  const res = await fetch(await fsFileUrl(path));
  if (!res.ok) throw new Error(`bridge ${res.status}`);
  return await res.arrayBuffer();
}

/** …and it is also the only side that can hash it. Null when it cannot: a
 *  reference without a digest is weaker, and saying so beats inventing one. */
async function bridgeChecksum(path: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${await bridgeUrl()}/fs/checksum?path=${encodeURIComponent(path)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { checksum?: string };
    return data.checksum ?? null;
  } catch {
    return null;
  }
}

/** The lots already in this graph — the object store as the STUDY sees it. */
function ingestLots(): HTMLElement {
  const box = document.createElement("div");
  box.className = "ing-lots";
  const lots = store ? acquisitions(store) : [];
  if (!lots.length) return box;
  box.appendChild(ing("h3", "insp-sect", t("assets.lots")));
  for (const lot of lots) {
    const row = document.createElement("div");
    row.className = "ing-row";
    const name = document.createElement("span");
    name.className = "storage-name";
    name.textContent = lot.name;
    const meta = document.createElement("span");
    meta.className = "storage-meta";
    meta.textContent = t("assets.lotMembers", { n: String(lot.count) });
    row.append(name, meta);
    row.addEventListener("click", () => { select(lot.id); refreshInspector(); });
    box.appendChild(row);
  }
  return box;
}

/**
 * DECLARE a derivation: this output came out of those inputs, with this tool.
 *
 * Two selects and a text field, and no cleverness whatsoever — the whole design
 * decision is that nothing here is inferred. The input list offers the lots
 * first (a campaign is one input) and then the resources.
 */
function ingestDerivation(): HTMLElement {
  const box = document.createElement("div");
  box.className = "ing-derivation";
  const doc = store;
  if (!doc) return box;
  const resources = doc.liveNodes().filter((n) => n.node_type === "resource");
  if (!resources.length) return box;

  box.appendChild(ing("h3", "insp-sect", t("assets.derivation")));
  box.appendChild(ing("div", "insp-hint", t("assets.derivationHint")));

  const output = document.createElement("select");
  output.className = "ing-select";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = t("assets.pickOutput");
  output.appendChild(blank);
  for (const r of resources) {
    const o = document.createElement("option");
    o.value = r.id;
    o.textContent = r.name || r.id;
    if (r.id === derivationDraft.output) o.selected = true;
    output.appendChild(o);
  }
  output.addEventListener("change", () => {
    derivationDraft.output = output.value;
    refreshDeclare();
  });
  ingestField(box, t("assets.output"), output);

  const inputs = document.createElement("select");
  inputs.className = "ing-select";
  inputs.multiple = true;
  inputs.size = 4;
  for (const lot of acquisitions(doc)) {
    const o = document.createElement("option");
    o.value = lot.id;
    o.textContent = `▣ ${lot.name} (${lot.count})`;
    if (derivationDraft.inputs.includes(lot.id)) o.selected = true;
    inputs.appendChild(o);
  }
  for (const r of resources) {
    const o = document.createElement("option");
    o.value = r.id;
    o.textContent = r.name || r.id;
    if (derivationDraft.inputs.includes(r.id)) o.selected = true;
    inputs.appendChild(o);
  }
  inputs.addEventListener("change", () => {
    derivationDraft.inputs = Array.from(inputs.selectedOptions).map((o) => o.value);
    refreshDeclare();
  });
  ingestField(box, t("assets.inputs"), inputs, t("assets.inputsHint"));

  const tool = document.createElement("input");
  tool.className = "insp-name-input";
  tool.value = derivationDraft.tool;
  tool.placeholder = t("assets.toolPlaceholder");
  tool.addEventListener("change", () => { derivationDraft.tool = tool.value.trim(); });
  ingestField(box, t("assets.tool"), tool, t("assets.toolHint"));

  const bar = ing("div", "insp-actions");
  const declare = ing("button", "insp-btn", t("assets.declare")) as HTMLButtonElement;
  // The form does NOT re-render on every choice (that would take the focus out
  // of the list you are picking from), so the button's own state is refreshed
  // by hand. Measured live: without this it stayed disabled after a perfectly
  // valid output + input had been chosen, which reads as "this does not work".
  const refreshDeclare = (): void => {
    declare.disabled = !derivationDraft.output || !derivationDraft.inputs.length;
  };
  refreshDeclare();
  declare.addEventListener("click", () => {
    if (!store) return;
    try {
      const res = declareDerivation(store, {
        output: derivationDraft.output,
        inputs: derivationDraft.inputs,
        tool: derivationDraft.tool || undefined,
      });
      for (const w of res.warnings) ingestLog(w, "warn");
      ingestLog(t("assets.declared", {
        out: store.node(res.output)?.name ?? res.output,
        n: String(res.inputs.length),
      }));
      select(res.processId);
      draw();
      renderEmData();
      refreshInspector();
      renderStorage();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      toast(detail);
      ingestLog(detail, "warn");
    }
  });
  bar.appendChild(declare);
  box.appendChild(bar);
  return box;
}

/** The panel's own trail. The Log window keeps the durable one — this is the
 *  three lines somebody needs without looking away from the form. */
function ingestTrail(): HTMLElement {
  const box = document.createElement("div");
  box.className = "ing-trail";
  if (!ingestDraft.log.length) return box;
  box.appendChild(ing("h3", "insp-sect", t("assets.trail")));
  for (const line of ingestDraft.log.slice(0, 8)) {
    box.appendChild(ing("div", "insp-hint", line));
  }
  return box;
}

function storageRow(win: Win, entry: FsEntry): HTMLElement {
  const row = document.createElement("div");
  row.className = "storage-row" + (entry.outside ? " storage-outside" : "");
  row.dataset.path = entry.path;

  const icon = document.createElement("span");
  icon.className = "storage-icon";
  icon.textContent =
    entry.type === "dir" ? "📁" : kindOfExt(entry.ext) === "pdf" ? "📄" : kindOfExt(entry.ext) === "image" ? "🖼" : "•";
  const name = document.createElement("span");
  name.className = "storage-name";
  name.textContent = entry.name;
  const meta = document.createElement("span");
  meta.className = "storage-meta";
  meta.textContent = entry.type === "dir"
    ? ""
    : `${formatBytes(entry.size)} · ${new Date(entry.mtime * 1000).toLocaleDateString()}`;
  row.append(icon, name, meta);

  if (entry.outside) {
    // The bridge already told us this one will be refused (a symlink out of the
    // roots). Saying so here beats letting the user find out by clicking.
    row.title = t("storage.outside");
    return row;
  }

  row.addEventListener("dblclick", () => {
    if (entry.type === "dir") setStoragePath(win, entry.path);
  });
  row.draggable = true;
  row.addEventListener("dragstart", (e) => {
    const payload: StorageDragPayload = {
      path: entry.path,
      type: entry.type,
      name: entry.name,
      ext: entry.ext,
    };
    e.dataTransfer?.setData(STORAGE_MIME, JSON.stringify(payload));
    // A plain-text flavour too, so dropping on anything else at least yields
    // the path rather than nothing.
    e.dataTransfer?.setData("text/plain", entry.path);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
  });
  return row;
}

/** The dropped Storage entry, or null when this drag is not one of ours. */
function storageDragPayload(e: DragEvent): StorageDragPayload | null {
  const raw = e.dataTransfer?.getData(STORAGE_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StorageDragPayload;
  } catch {
    return null; // a foreign drag claiming our mime is not worth a crash
  }
}

/**
 * PIN a Viewer window to a dropped folder or file.
 *
 * "Pinned" is the honest word: from here the window shows what you dropped and
 * stops following the selection, until `Collezione ▸ Segui la selezione` in its
 * own menu. A window that silently went back to the selection on the next click
 * would lose the folder you just went and found.
 */
function pinViewerCollection(win: Win, payload: StorageDragPayload): void {
  setWinCurrent(win, "collection", {
    kind: payload.type === "dir" ? "folder" : "file",
    ref: payload.path,
  });
  setWinCurrent(win, "item", null);
  viewerCollection = null;
  // A folder IS a collection, and Gallery is the reading that shows it as one.
  // A single file stays in Single: there is nothing to lay out.
  setWinModeOf(win, payload.type === "dir" ? "gallery" : "single");
  renderViewer();
  renderAreaHeaders();
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * DS4 · add a folder the bridge will serve.
 *
 * Granting access to a folder is a decision, so it is explicit, narrow and
 * remembered: one folder, named by the person, saved by the bridge. There is no
 * "serve the whole disk" here and there will not be — the sandbox exists so the
 * browser can see a library or a DOSCO folder and nothing else.
 */
async function addStorageRoot(): Promise<void> {
  // `prompt` because a folder PICKER in the browser cannot hand back a path (it
  // gives file handles, not locations) — the honest options are typing the path
  // or the desktop dialog, and the desktop dialog belongs to the Tauri shell.
  const path = window.prompt(t("storage.rootPrompt"), "");
  if (!path?.trim()) return;
  try {
    const res = await fetch(`${await bridgeUrl()}/fs/roots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", path: path.trim() }),
    });
    const payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; roots?: string[] } | null;
    if (!res.ok || !payload?.ok) {
      toast(t("storage.rootFailed", { detail: payload?.error ?? `HTTP ${res.status}` }));
      return;
    }
    toast(t("storage.rootAdded", { name: path.trim().split("/").filter(Boolean).pop() ?? path }));
    setStoragePath(activeWin(), null);   // back to the roots, where it now shows
  } catch (err) {
    toast(t("storage.rootFailed", { detail: err instanceof Error ? err.message : String(err) }));
  }
}

function storageEmpty(message: string): HTMLElement {
  const box = document.createElement("div");
  box.className = "viewer-empty";
  const p = document.createElement("p");
  p.textContent = message;
  box.appendChild(p);
  return box;
}

// ── VIEWER · the preview window ─────────────────────────────────────────────
//
// One resource at a time, shown as itself. It follows the SELECTION the way the
// Inspector does — you look at a node, and if that node points at something
// showable, here it is.
//
// Images and PDFs get the same treatment on purpose. Both are "the source,
// rendered"; splitting them into a picture viewer and a document viewer would be
// two surfaces for one question ("what does D.1 actually look like?"). The
// difference is one element, and nothing else about the window changes.

// What kind a file is (image / PDF / other) is `kindOfExt` in `storage.ts` now —
// the same answer a Storage listing, a collection and this window all need, and
// it was two regexes here before there was anywhere better to keep it.

/** The resource a node points at, if any: a ResourceNode's url, a Document's
 *  filename. Returns the raw string — deciding whether it is loadable is the
 *  caller's job, and it is a different question. */
function viewerSourceOf(node: EmNode | null): string | null {
  if (!node) return null;
  const data = (node.data ?? {}) as Record<string, unknown>;
  for (const key of ["url", "filename", "path"] as const) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** True when this string is something the browser can actually fetch. */
function viewerIsFetchable(src: string): boolean {
  return /^(https?:|data:|blob:)/i.test(src);
}

/**
 * W1 · What a Viewer window is showing, as a KEY.
 *
 * Two sources, and the more explicit one wins: a folder or file DROPPED from a
 * Storage window (the user pointed at it, that is as deliberate as it gets), or
 * failing that the current selection, which is how the window behaved before and
 * still does when nothing was dropped. Dropping is per instance, so one Viewer
 * can stay pinned to a folder while another follows the selection.
 */
function viewerKeyOf(win: Win): { kind: "folder" | "file" | "node"; ref: string } | null {
  const dropped = winCurrent(win, "collection");
  if (dropped && typeof dropped === "object") {
    const d = dropped as { kind?: string; ref?: string };
    if ((d.kind === "folder" || d.kind === "file") && d.ref) {
      return { kind: d.kind, ref: d.ref };
    }
  }
  return selectedId ? { kind: "node", ref: selectedId } : null;
}

/** The built collection for the window on screen, keyed so a stale async build
 *  cannot overwrite a newer one. */
let viewerCollection: { key: string; winId: string; value: Collection } | null = null;
let viewerBuilding: string | null = null;

function viewerIndex(win: Win): number {
  const v = winCurrent(win, "item");
  return typeof v === "number" ? v : 0;
}

function setViewerIndex(win: Win, index: number): void {
  setWinCurrent(win, "item", index <= 0 ? null : index);
  renderViewer();
}

/**
 * Draw the Viewer: the current item of its collection (Single), or all of them
 * (Gallery).
 *
 * The honest part is still the empty state, but the limit MOVED. A page cannot
 * read `/Users/…/D1.tif` — measured: the dev server answers 200 text/html — so
 * before W1 that was the end of the story. Now there is a bridge that can read
 * the disk, and a local path is previewable *if it is inside the roots the
 * bridge was started with*. Outside them it is still refused, and the window
 * says which fence it hit rather than showing a broken image.
 */
function renderViewer(): void {
  const stage = document.getElementById("viewer-stage");
  const caption = document.getElementById("viewer-caption");
  const bar = document.getElementById("viewer-bar");
  if (!stage || !caption || !bar) return;
  const win = activeWin();
  if (win.type !== "viewer") return;
  stage.textContent = "";
  caption.textContent = "";
  bar.classList.add("hidden");

  const key = viewerKeyOf(win);
  if (!key) {
    stage.appendChild(viewerEmpty(t("viewer.noSelection")));
    return;
  }
  const keyStr = `${key.kind}:${key.ref}`;

  // A collection from disk takes a round trip to build; one already built for
  // this exact source is drawn straight away, which is what makes prev/next and
  // the Mode switch instant rather than a re-fetch each time.
  if (viewerCollection?.key === keyStr && viewerCollection.winId === win.id) {
    drawViewerCollection(win, viewerCollection.value, stage, caption, bar);
    return;
  }

  if (key.kind === "node") {
    const node = store?.node(key.ref) ?? null;
    const label = String(node?.name || key.ref);
    const src = viewerSourceOf(node);
    if (!src) {
      stage.appendChild(viewerEmpty(t("viewer.notPreviewable", { name: label })));
      return;
    }
    if (viewerIsFetchable(src)) {
      const built = collectionFromUrl(key.ref, label, src);
      viewerCollection = { key: keyStr, winId: win.id, value: built };
      drawViewerCollection(win, built, stage, caption, bar);
      return;
    }
    // A path on disk — the case the bridge now answers. Ask it.
    buildViewerCollection(win, keyStr, stage, caption, bar, () =>
      collectionFromFile(src),
    );
    return;
  }

  buildViewerCollection(win, keyStr, stage, caption, bar, () =>
    key.kind === "folder"
      ? collectionFromFolder(key.ref)
      : collectionFromFile(key.ref),
  );
}

function buildViewerCollection(
  win: Win,
  keyStr: string,
  stage: HTMLElement,
  caption: HTMLElement,
  bar: HTMLElement,
  build: () => Promise<Collection>,
): void {
  stage.appendChild(viewerEmpty(t("storage.loading")));
  if (viewerBuilding === keyStr) return; // one build per source, not one per redraw
  viewerBuilding = keyStr;
  void (async () => {
    let built: Collection;
    try {
      built = await build();
    } catch (err) {
      viewerBuilding = null;
      if (activeWin().id !== win.id) return;
      stage.textContent = "";
      // Three different facts, three different sentences. Flattening them into
      // "could not load" would tell the reader nothing they can act on: start
      // the bridge, name another root, or find the file that moved.
      const box = viewerEmpty(
        err instanceof BridgeDownError
          ? t("storage.bridgeDown")
          : err instanceof FileRefusedError && err.status === 403
            ? t("viewer.outsideRoots")
            : err instanceof FileRefusedError
              ? t("viewer.missingFile")
              : t("viewer.unreachable"),
      );
      const ref = viewerKeyOf(win);
      const source = ref?.kind === "node" ? viewerSourceOf(store?.node(ref.ref) ?? null) : ref?.ref;
      if (source) {
        const path = document.createElement("code");
        path.className = "viewer-path";
        path.textContent = source;
        box.appendChild(path);
      }
      stage.appendChild(box);
      return;
    }
    viewerBuilding = null;
    if (activeWin().id !== win.id) return;
    viewerCollection = { key: keyStr, winId: win.id, value: built };
    stage.textContent = "";
    drawViewerCollection(win, built, stage, caption, bar);
  })();
}

function drawViewerCollection(
  win: Win,
  collection: Collection,
  stage: HTMLElement,
  caption: HTMLElement,
  bar: HTMLElement,
): void {
  stage.textContent = "";
  if (!collection.items.length) {
    const box = viewerEmpty(t("viewer.emptyCollection", { name: collection.title }));
    if (collection.note) {
      const note = document.createElement("code");
      note.className = "viewer-path";
      note.textContent = collection.note;
      box.appendChild(note);
    }
    stage.appendChild(box);
    return;
  }

  if (winModeOf(win) === "gallery") {
    stage.appendChild(viewerGallery(win, collection));
    caption.textContent = collection.note
      ? `${collection.title} — ${collection.items.length} · ${collection.note}`
      : `${collection.title} — ${collection.items.length}`;
    return;
  }

  const index = Math.min(viewerIndex(win), collection.items.length - 1);
  const item = collection.items[index];
  stage.appendChild(viewerItemElement(item, stage));
  const label = (): string =>
    item.pages
      ? `${item.title} — ${t("viewer.pages", { n: String(item.pages) })}`
      : item.title;
  caption.textContent = label();
  // The page count costs a fetch, so it is read for the PDF you are LOOKING at,
  // not for every PDF in the folder: a collection is built from a listing, and a
  // listing does not open files. Cached on the item, so paging back is free.
  if (item.kind === "pdf" && item.pages === undefined) {
    item.pages = null as unknown as undefined; // asked once, even if it answers null
    void pdfPageCount(item.url).then((n) => {
      if (n == null) return;
      item.pages = n;
      // only if that item is still the one on screen
      if (viewerCollection?.value === collection && collection.items[
        Math.min(viewerIndex(win), collection.items.length - 1)
      ] === item) {
        caption.textContent = label();
      }
    });
  }

  // The strip earns its space only when there is more than one item to move
  // between; on a collection of one it would be two dead arrows and "1 / 1".
  if (collection.items.length > 1) {
    bar.classList.remove("hidden");
    const pos = document.getElementById("viewer-pos");
    const title = document.getElementById("viewer-title");
    const prev = document.getElementById("viewer-prev") as HTMLButtonElement;
    const next = document.getElementById("viewer-next") as HTMLButtonElement;
    if (pos) pos.textContent = `${index + 1} / ${collection.items.length}`;
    if (title) title.textContent = collection.title;
    prev.disabled = index === 0;
    next.disabled = index === collection.items.length - 1;
    prev.onclick = () => setViewerIndex(win, index - 1);
    next.onclick = () => setViewerIndex(win, index + 1);
  }
}

/** One item, drawn as itself. The image/PDF split is one element and nothing
 *  else, which is the whole point of treating them the same. */
function viewerItemElement(item: CollectionItem, stage: HTMLElement): HTMLElement {
  if (!isDecodable(item)) {
    // A .tif IS an image and belongs in the collection; no browser draws one.
    // Saying that, with the way out, beats a broken-image icon that reads as
    // "the file is missing" when the file is perfectly fine.
    const box = viewerEmpty(t("viewer.notDecodable", { name: item.title }));
    box.appendChild(viewerOpenLink(item.url));
    return box;
  }
  if (item.kind === "pdf") {
    // <object> and not <iframe>: it degrades to its own children when the
    // browser has no PDF plugin, which is where the fallback link goes.
    const obj = document.createElement("object");
    obj.className = "viewer-media";
    obj.type = "application/pdf";
    // Same reason as the images: `<object data>` is a no-cors request and the
    // /fs gate refuses it. The blob keeps the PDF viewer working without
    // reopening the hole.
    void bridgeBlobUrl(item.url).then((src) => { obj.data = src; }).catch(() => {
      obj.appendChild(document.createTextNode(t("viewer.unreachable")));
    });
    obj.appendChild(viewerOpenLink(item.url));
    return obj;
  }
  if (item.kind === "image") {
    const img = document.createElement("img");
    img.className = "viewer-media";
    // via CORS when it comes from the bridge (see `bridgeBlobUrl`)
    void bridgeBlobUrl(item.url).then((src) => { img.src = src; }).catch(() => {
      img.dispatchEvent(new Event("error"));
    });
    img.alt = item.title;
    img.addEventListener("error", () => {
      stage.textContent = "";
      const box = viewerEmpty(t("viewer.unreachable"));
      const path = document.createElement("code");
      path.className = "viewer-path";
      path.textContent = item.path ?? item.url;
      box.appendChild(path);
      stage.appendChild(box);
    });
    return img;
  }
  const box = viewerEmpty(t("viewer.notPreviewable", { name: item.title }));
  box.appendChild(viewerOpenLink(item.url));
  return box;
}

function viewerOpenLink(url: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "viewer-link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = t("viewer.openExternally");
  return link;
}

/** Gallery Mode: the whole collection at once. Clicking a thumbnail is not a
 *  second way of viewing — it takes you to Single ON that item, so the two
 *  modes stay two readings of one collection rather than two viewers. */
function viewerGallery(win: Win, collection: Collection): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "viewer-gallery";
  collection.items.forEach((item, i) => {
    const cell = document.createElement("button");
    cell.className = "viewer-thumb";
    cell.title = item.title;
    if (item.kind === "image" && isDecodable(item)) {
      const img = document.createElement("img");
      img.alt = item.title;
      img.loading = "lazy"; // a folder of 300 photographs must not fetch 300 at once
      void bridgeBlobUrl(item.url).then((src) => { img.src = src; }).catch(() => {
        img.replaceWith(Object.assign(document.createElement("span"), {
          className: "viewer-thumb-glyph", textContent: "⚠",
        }));
      });
      cell.appendChild(img);
    } else {
      const glyph = document.createElement("span");
      glyph.className = "viewer-thumb-glyph";
      glyph.textContent = item.kind === "pdf" ? "📄" : "🖼";
      cell.appendChild(glyph);
    }
    const label = document.createElement("span");
    label.className = "viewer-thumb-label";
    label.textContent = item.title;
    cell.appendChild(label);
    cell.addEventListener("click", () => {
      setWinCurrent(win, "item", i === 0 ? null : i);
      setWinModeOf(win, "single");
      renderViewer();
      renderAreaHeaders();
    });
    grid.appendChild(cell);
  });
  return grid;
}

function viewerEmpty(message: string): HTMLElement {
  const box = document.createElement("div");
  box.className = "viewer-empty";
  const p = document.createElement("p");
  p.textContent = message;
  box.appendChild(p);
  return box;
}

// ── WIN6 · side panels as WINDOWS ───────────────────────────────────────────
//
// The Inspector, the EMTree, the outliner, the log and StratiMiner were
// singletons in the right-hand aside, outside the window system: they could not
// be tiled, resized or focused like everything else. They are now WINDOW TYPES.
//
// The panels themselves are not rebuilt: the existing elements are MOVED into
// the window's surface and moved back to `#side` when the window stops showing
// them. They keep their identity, their handlers and their state — only their
// address changes. That is what makes this a re-parenting rather than a second
// implementation of five panels.

/** Which panels a window type shows, in tab order. */
const PANEL_TABS: Partial<Record<WindowType, { id: string; labelKey: string }[]>> = {
  emtree: [
    { id: "emtree", labelKey: "panel.multigraph" },
    { id: "nodelist", labelKey: "panel.outliner" },
  ],
  // WIN7 · StratiMiner is NOT here any more: it is a Tools ▸ instrument that
  // floats, does its job and closes. The Log stays — a running record of what
  // the document and the session have been doing is a view, not a tool.
  inspector: [
    { id: "inspector", labelKey: "panel.inspector" },
    { id: "logpanel", labelKey: "panel.log" },
  ],
};

/** Every panel element a WINDOW can hold. Named once: the release pass and the
 *  "is this thing mounted anywhere?" guards both read it. StratiMiner is not
 *  here — it is a floating tool (WIN7), never an area's content. */
const PANEL_ELEMENT_IDS = ["emtree", "nodelist", "inspector", "logpanel"];

/** The panel a hosted window is currently showing. Per WINDOW (not per type):
 *  two Inspector windows can sit on different tabs, and that is what makes the
 *  second one a live view of its own rather than a duplicate of the first. */
function panelIdOf(win: Win): string {
  const tabs = PANEL_TABS[win.type] ?? [];
  const v = winCurrent(win, "panel");
  return typeof v === "string" && tabs.some((t) => t.id === v) ? v : (tabs[0]?.id ?? "");
}

/** The panel each hosted window is currently showing (per window). */
function currentPanelId(type: WindowType): string {
  const win = activeWin();
  return win.type === type ? panelIdOf(win) : (PANEL_TABS[type]?.[0]?.id ?? "");
}

/**
 * True when a panel element is mounted somewhere the user can SEE it: the
 * focused window's surface, a secondary area, or the floating tool.
 *
 * WIN6 broadened an "is the aside tab active?" guard once, WIN7 again, and
 * WIN-FIX1 retired the aside altogether — so the question finally has one
 * answer, in one place: is this thing on screen? Anything parked in `#side` is
 * not, by construction.
 */
function panelIsMounted(el: HTMLElement): boolean {
  const parent = el.parentElement;
  return (
    parent?.id === "panel-view-body" ||
    parent?.id === "tool-float-body" ||
    !!parent?.classList.contains("tile-panel-body")
  );
}

/** Ask a panel to redraw itself, whichever window it is living in. */
function refreshPanelById(id: string): void {
  if (id === "emtree") refreshEMTree();
  else if (id === "nodelist") nodeList.refresh();
  else if (id === "inspector") refreshInspector();
  else if (id === "logpanel") refreshLogPanel();
  else if (id === "stratiminer") refreshStratiMiner();
}

/** Send every panel currently living in a TILED area back to the aside.
 *
 *  Called before the tree is torn down: `renderTiles` resets `#tile-root`'s
 *  innerHTML, which would DESTROY a panel that had been moved into a secondary
 *  area — and with it every handler wired to it at boot. */
function releaseTilePanels(): void {
  const side = document.getElementById("side");
  if (!side) return;
  for (const id of PANEL_ELEMENT_IDS) {
    const el = document.getElementById(id);
    if (!el?.parentElement?.classList.contains("tile-panel-body")) continue;
    el.classList.add("hidden"); // the aside shows one at a time, via its tabs
    side.appendChild(el);
  }
}

/** Send every hosted panel back to the aside it came from. */
function releasePanels(): void {
  const side = document.getElementById("side");
  const body = document.getElementById("panel-view-body");
  if (!side || !body) return;
  while (body.firstChild) {
    const el = body.firstChild as HTMLElement;
    el.classList.add("hidden"); // the aside shows one at a time, via its tabs
    side.appendChild(el);
  }
}

// ── WIN7 · the secondary areas are LIVE VIEWS ───────────────────────────────
//
// Every area of the arrangement shows the document, and shows it NOW: edit a
// node in the graph and the outliner beside it, the table below it and the
// inspector in the corner all move. Before this only graph areas drew anything;
// the rest carried a note saying "click to work here", so an IDE arrangement was
// four areas of which three were empty until visited.
//
// Two different mechanisms, because the surfaces are two different kinds of
// thing, and pretending otherwise is what would have made this a rewrite:
//
//  · the TABLE renders through a host registry (WIN5): one renderer, as many
//    mounts as there are areas. A secondary Tabular area registers a host and is
//    live for free — `renderEmData` already runs on every store change.
//  · the PANELS (outliner, multigraph, inspector, log) are SINGLETON elements
//    with their handlers wired at boot. They are re-homed, not copied: an area
//    that wants one takes it, and the panel's own refresh function — which also
//    already runs on every store change — then paints it where it now lives.
//
// The declared consequence of re-homing: two areas asking for the SAME panel is
// one area too many. The first claimant gets it (the focused window first, then
// tree order) and the second says so. Two Inspector windows on DIFFERENT tabs
// are both live, which is the case that actually comes up.
//
// A secondary surface is a view and not a second editor: the moment the pointer
// enters the area it becomes the focused one (focus-follows-mouse, WIN5) and the
// real surface mounts there. So nothing in here needs to be interactive — its
// tabs are labels, and it is never the thing being clicked.

/** What each live secondary surface must do when the document changes. Rebuilt
 *  with the tree; a surface whose area is gone is simply not in the list. */
const tileSurfaces: Array<() => void> = [];

/** The EM-Data hosts THIS module created for secondary areas. Owned explicitly
 *  (WIN-FIX1) so they are unregistered when their area goes, and so nothing has
 *  to guess from the DOM which mounts are still alive. */
const tileEmDataHosts: EmDataHost[] = [];

function refreshTileSurfaces(): void {
  for (const fn of tileSurfaces) fn();
}

/** A secondary area that cannot show its content, saying which and why. */
function tileNote(area: HTMLElement, text: string): void {
  const note = document.createElement("div");
  note.className = "tile-note";
  note.textContent = text;
  area.appendChild(note);
}

/** Build the live surface of one secondary area. */
function buildSecondarySurface(area: HTMLElement, win: Win): void {
  if (win.type === "table") {
    // the same renderer as the focused Tabular window, one more mount
    // FOCUS-NOJITTER · the head holds exactly what the FOCUSED window's head
    // holds — the row count, nothing else. It used to carry the sheet name too,
    // which (a) is the window's MODE now, stated in its header two centimetres
    // above, and (b) existed only here, so entering the window made it vanish
    // and the rows move.
    const head = document.createElement("div");
    head.className = "tile-tablehead";
    const count = document.createElement("span");
    count.className = "emdata-count";
    head.appendChild(count);
    const body = document.createElement("div");
    body.className = "tile-tablebody";
    area.appendChild(head);
    area.appendChild(body);
    // This host lives exactly as long as its area does; `renderTiles` drops it
    // (tileEmDataHosts) when the tree is rebuilt.
    const host: EmDataHost = { body, count, enabled: () => body.isConnected };
    tileEmDataHosts.push(host);
    addEmDataHost(host);
    return;
  }
  if (PANEL_TABS[win.type]) {
    const host = document.createElement("div");
    host.className = "tile-panel";
    host.dataset.win = win.id;
    const tabs = document.createElement("div");
    tabs.className = "tile-panel-tabs panel-tabs panel-tabs-passive";
    const body = document.createElement("div");
    body.className = "tile-panel-body panel-body";
    host.appendChild(tabs);
    host.appendChild(body);
    area.appendChild(host);
    // which panel actually lands here is decided in one pass over every area
    // (`syncSecondaryPanels`), because it depends on what the others took
    return;
  }
  if (win.type === "doc") {
    // SURFACE-AUDIT · the same two boxes and the same classes the focused Doc
    // window uses. The only thing that differs is the direction, and it is keyed
    // to the AREA'S WIDTH (`doc-wide`), not to who has the focus — so entering
    // this window reflows nothing.
    const surface = document.createElement("div");
    surface.className = "doc-surface";
    const list = document.createElement("div");
    list.className = "doc-list";
    const detail = document.createElement("div");
    detail.className = "doc-detail";
    surface.append(list, detail);
    area.appendChild(surface);
    const paint = (): void => {
      if (!list.isConnected) return;
      reflectDocWidth(surface);
      renderDocViewInto(win, list, detail);
    };
    tileSurfaces.push(paint);
    paint();
    return;
  }
  if (win.type === "narrative") {
    // NARRATIVE stays a note on purpose. The story is an OVERLAY over the canvas
    // (`#narrative-view`): one element with the authoring editors bound to it.
    // Re-homing that would move the EDITOR, not a view of it — so this area says
    // what it holds, and a step into it brings the real thing. (A read-only
    // rendering of the prose beside the editor is a second renderer for the same
    // document, which is the thing WIN5-7 have been avoiding throughout.)
    tileNote(area, t("tile.narrativeNote"));
    return;
  }
  // W1 · every OTHER type without a secondary surface says its own name. This
  // fall-through used to be narrative-only, so `storage` and `viewer` landed on
  // it and a file browser announced itself as "Narrative — step in to read and
  // write here". A note that names the wrong window is worse than no note: the
  // limit (this area is not live yet) is honest, the label was not.
  tileNote(area, t("tile.enterNote", { name: t(WINDOW_TYPE_META[win.type].labelKey) }));
}

/**
 * Decide which area holds each singleton panel, and mount it there.
 *
 * Runs after the tree is built AND after the focused window changes its panel,
 * because the answer depends on both. The DOM is the register of who holds what
 * — reading it back rather than keeping a second map means a claim can never
 * survive the element having been moved somewhere else.
 */
function syncSecondaryPanels(): void {
  const hosts = [...document.querySelectorAll<HTMLElement>(".tile-panel")];
  if (!hosts.length) return;
  releaseTilePanels(); // start from a clean board: the focused window keeps its own
  const claimed = new Set<string>();
  const panelView = document.getElementById("panel-view");
  const panelBody = document.getElementById("panel-view-body");
  if (panelBody && !panelView?.classList.contains("hidden"))
    for (const child of panelBody.children) claimed.add(child.id);
  for (const host of hosts) {
    const win = windowsOf().find((w) => w.id === host.dataset.win);
    const tabs = host.querySelector<HTMLElement>(".tile-panel-tabs");
    const body = host.querySelector<HTMLElement>(".tile-panel-body");
    if (!win || !tabs || !body) continue;
    const showing = panelIdOf(win);
    const taken = claimed.has(showing);
    tabs.innerHTML = "";
    for (const tab of PANEL_TABS[win.type] ?? []) {
      // FOCUS-NOJITTER · a BUTTON with the same class as the focused strip's, so
      // the two strips measure identically and taking the focus moves nothing.
      // Inert (the strip carries `panel-tabs-passive`): a secondary area is a
      // view, and the pointer entering it promotes the area anyway.
      const chip = document.createElement("button");
      chip.className = "panel-tab" + (tab.id === showing ? " active" : "");
      chip.tabIndex = -1;
      chip.textContent = t(tab.labelKey);
      tabs.appendChild(chip);
    }
    body.innerHTML = "";
    if (taken) {
      // honest rather than blank: the panel is a single element and another area
      // has it. Say where to look instead of showing an empty box.
      const note = document.createElement("div");
      note.className = "tile-note";
      note.textContent = t("tile.panelTaken");
      body.appendChild(note);
      continue;
    }
    claimed.add(showing);
    const el = document.getElementById(showing);
    if (!el) continue;
    el.classList.remove("hidden");
    body.appendChild(el);
    refreshPanelById(showing);
  }
  reflectEmptyAside();
}

/**
 * The aside is only worth its width while it still holds something.
 *
 * With the panels living in windows, an arrangement like the IDE preset takes
 * ALL of them — and the aside was left as a strip of tabs over an empty box,
 * the exact shape of a broken panel. It steps aside when it has nothing (its
 * collapse handle with it) and comes back the moment a panel does.
 */
function reflectEmptyAside(): void {
  // WIN-FIX1 · nothing left to reflect: `#side` is a parking place, never shown.
  // Kept as a named no-op call site so the panel-mounting passes still read as
  // "and then tell the aside", which is where the next thing about it would go.
}

/** Mount the panels of a hosted window type into the window's surface. */
function renderPanelWindow(type: WindowType): void {
  const tabsHost = document.getElementById("panel-view-tabs");
  const body = document.getElementById("panel-view-body");
  const tabs = PANEL_TABS[type];
  if (!tabsHost || !body || !tabs) return;
  releasePanels();
  const showing = currentPanelId(type);
  tabsHost.innerHTML = "";
  for (const tab of tabs) {
    // FOCUS-NOJITTER · the SAME element and the same class a secondary area
    // builds (`syncSecondaryPanels`). It used to be a bare <button> here and a
    // <span> there, at two font sizes — so taking the focus grew the strip by
    // 7px and pushed the panel down. One implementation, one measurement.
    const b = document.createElement("button");
    b.className = "panel-tab" + (tab.id === showing ? " active" : "");
    b.textContent = t(tab.labelKey);
    b.addEventListener("click", () => {
      setWinCurrent(activeWin(), "panel", tab.id);
      renderPanelWindow(type);
    });
    tabsHost.appendChild(b);
  }
  const el = document.getElementById(showing);
  if (el) {
    el.classList.remove("hidden");
    body.appendChild(el);
  }
  // the panels are built on demand by their own renderers
  refreshPanelById(showing);
  // the focused window just took a panel (or gave one back): the secondary areas
  // have to re-resolve their claims, or one of them would be left holding a body
  // whose element has moved.
  syncSecondaryPanels();
}

/** Mount a window's editor in the central area. The ONE place that knows how a
 *  window type becomes something on screen — `applyWorkspace` and the transform
 *  both go through it, so they can never drift apart. */
function mountWindow(win: Win): void {
  if (win.type === "narrative") {
    setMode("narrative"); // the narrative overlay owns the area
    applyWindowSurface("narrative");
    return;
  }
  // Every type whose window IS a surface rather than the canvas. `viewer` joined
  // them: without it the fall-through below mounted the canvas and hid the
  // preview, which looked like "the viewer shows nothing".
  if (
    win.type === "table" ||
    win.type === "doc" ||
    win.type === "emtree" ||
    win.type === "inspector" ||
    win.type === "viewer" ||
    win.type === "storage" ||
    win.type === "annotator" ||
    win.type === "shelf"
  ) {
    // WIN5 · a real window, not the dock: the surface fills the area. Leave the
    // canvas mode alone underneath (never the narrative overlay) so switching
    // back finds the projection you left.
    if (centralMode === "narrative") setMode(view);
    applyWindowSurface(win.type);
    return;
  }
  applyWindowSurface("graph");
  setMode(winMode(win));
}

/** Change the mode of the ACTIVE window (per-instance): record it on the window,
 *  then mount that projection. Another graph window keeps its own mode. */
function setWindowMode(mode: ViewKind): void {
  setWinMode(activeWin(), mode);
  setMode(mode); // → reflect + updateWindowHeader
}

/** Show another window of the current workspace, restoring ITS mode. */
function selectWindow(winId: string): void {
  const win = setActiveWin(winId);
  renderTiles(); // the live (editable) area moves to the window just picked
  if (win.type === "graph") setMode(winMode(win));
  else mountWindow(win);
  updateWindowHeader();
}

/**
 * WIN7 · magnify an area to fill the workspace, or come back from it.
 *
 * The one gesture that is worth a keyboard shortcut of its own: an arrangement
 * built to keep four things in view is rarely the one you want while working on
 * one of them, and the way out of that in every tiling editor is to take the
 * whole screen for a moment and give it back. Reversible by construction — the
 * tree is kept whole in `workspace.ts` and restored untouched (ratios, nesting
 * and all), so this is never something to undo by hand afterwards.
 */
function magnifyWindow(winId: string): void {
  toggleMaximize(winId);
  renderTiles();
  const win = activeWin();
  if (win.type === "graph") setMode(winMode(win));
  else mountWindow(win);
  updateWindowHeader();
}

function closeActiveWindow(): void {
  if (!closeWindow(activeWin().id)) return; // never the last one
  const win = activeWin();
  renderTiles(); // the split JOINS: the sibling takes the space back
  if (win.type === "graph") setMode(winMode(win));
  updateWindowHeader();
}

/**
 * HDR1 / WIN-FIX1 · **the window header, built for ONE window.**
 *
 * It used to be a singleton block of markup inside `#canvas-wrap`, which meant
 * exactly one area could have a header — the focused one. Every other area got a
 * thin label strip, so a four-area arrangement had one window that looked like a
 * window and three that looked like panes. Now this function builds the bar, and
 * every area calls it: the focused one fills `#window-header` (still inside
 * `#canvas-wrap`, so the docked-bar height that shortens the canvas is measured
 * from the same element as before), the others fill their own.
 *
 * The handlers close over `win`, never over `activeWin()`, because a bar can
 * belong to a window that is not the focused one.
 *
 * HDR1 changes to what the bar shows:
 *  · the TYPE is an icon alone — the name is in the dropdown, where you are
 *    choosing, and a word repeated in every bar is a word you stop reading;
 *  · the MODE reads "Matrix Mode", "Units mode" — a mode named as a mode;
 *  · the Tabular SHEET became that window's mode, because that is what it is:
 *    which projection of the document this window shows;
 *  · the instance chips (1 2 3 4) and the ⇥ ⇤ pair are GONE. They switched
 *    between windows, which is what clicking on a window already does now that
 *    the windows are side by side. The SPLIT verbs stayed, with glyphs that say
 *    what they do: → a new area beside, ↓ a new area below.
 */
function buildAreaHeader(win: Win, active: boolean): DocumentFragment {
  const frag = document.createDocumentFragment();
  const type = win.type;

  // ── the window TYPE: icon only, name in the dropdown ──────────────────────
  const typeDd = document.createElement("div");
  typeDd.className = "dropdown win-type";
  const typeTog = document.createElement("button");
  typeTog.className = "dd-toggle win-type-toggle";
  typeTog.title = t("win.typeTitle");
  typeTog.innerHTML =
    `<span class="win-type-icon">${WINDOW_TYPE_META[type].icon}</span>` +
    `<span class="win-type-caret">▾</span>`;
  const typeMenu = document.createElement("div");
  typeMenu.className = "dd-menu hidden";
  for (const tt of TRANSFORM_TYPES) {
    const meta = WINDOW_TYPE_META[tt];
    const b = document.createElement("button");
    b.dataset.wt = tt;
    b.classList.toggle("active", tt === type);
    b.innerHTML = `<span class="wt-ic">${meta.icon}</span> ${t(meta.labelKey)}`;
    b.addEventListener("click", () => transformWindowOf(win, tt));
    typeMenu.appendChild(b);
  }
  wireBarDropdown(typeTog, typeMenu);
  typeDd.append(typeTog, typeMenu);
  frag.appendChild(typeDd);

  // ── the MODE: which projection of the document THIS window shows ──────────
  const modes = headerModesOf(win);
  if (modes) {
    const modeDd = document.createElement("div");
    modeDd.className = "dropdown win-mode";
    const modeTog = document.createElement("button");
    modeTog.className = "dd-toggle win-mode-toggle";
    modeTog.title = t("win.modeTitle");
    modeTog.innerHTML =
      `<span class="win-mode-label">${escapeHtml(modes.currentLabel)}</span>` +
      `<span class="win-type-caret">▾</span>`;
    const modeMenu = document.createElement("div");
    modeMenu.className = "dd-menu hidden";
    for (const m of modes.items) {
      const b = document.createElement("button");
      b.textContent = m.label;
      b.classList.toggle("active", m.current);
      if (m.disabled) {
        b.disabled = true;
        b.title = m.disabled;   // the REASON, where the pointer already is
      } else {
        b.addEventListener("click", m.run);
      }
      modeMenu.appendChild(b);
    }
    wireBarDropdown(modeTog, modeMenu);
    modeDd.append(modeTog, modeMenu);
    frag.appendChild(modeDd);
  }

  // ── the per-type MENUS (WINDOW_MENUS) ─────────────────────────────────────
  for (const menu of WINDOW_MENUS[type]) {
    const dd = document.createElement("div");
    dd.className = "dropdown win-menu";
    const toggle = document.createElement("button");
    toggle.className = "dd-toggle win-menu-toggle";
    toggle.innerHTML = `${menu.label} <span class="win-type-caret">▾</span>`;
    const list = document.createElement("div");
    list.className = "dd-menu hidden";
    // built on OPEN, so ✓ and disabled reasons are current every time
    wireBarDropdown(toggle, list, () => {
      list.innerHTML = "";
      for (const item of menu.items()) {
        const b = document.createElement("button");
        const reason = item.disabledReason?.() ?? null;
        b.textContent = (item.checked?.() ? "✓ " : "") + item.label;
        if (reason) {
          b.disabled = true;
          b.title = reason;
        } else {
          b.addEventListener("click", item.run);
        }
        list.appendChild(b);
      }
    });
    list.addEventListener("click", () => list.classList.add("hidden"));
    dd.append(toggle, list);
    frag.appendChild(dd);
  }

  // ── the window ACTIONS: one-click verbs on THIS window ────────────────────
  const act = (glyph: string, title: string, on: boolean, run: () => void): void => {
    const b = document.createElement("button");
    b.className = "win-act" + (on ? " win-act-on" : "");
    b.textContent = glyph;
    b.title = title;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      run();
    });
    frag.appendChild(b);
  };
  if (type === "graph") {
    act("⤢", t("win.fitTitle"), false, () => {
      focusThen(win, () => fit());
    });
    act("1:1", t("win.zoom1Title"), false, () => {
      focusThen(win, () => {
        const vp = viewport();
        const { w, h } = viewSize();
        if (vp.scale > 0) vp.zoomAt(w / 2, h / 2, 1 / vp.scale);
        draw();
      });
    });
  }
  if (type === "narrative") {
    // ✎ · writing IS a mode of a narrative window, so it is a toggle you can see
    // the state of, not an item buried in a menu
    act("✎", t("win.editTitle"), narrativeEditing, () =>
      focusThen(win, () => {
        click("btn-narrative-edit");
        renderAreaHeaders();
      }),
    );
    // WIN7 · the two data panels a narrative window sends you to
    act("⌁", t("win.aiTitle"), false, () => openSettings("settings-sect-ai"));
    act("⌖", t("win.geoTitle"), false, () => focusThen(win, revealSitePosition));
  }

  const spacer = document.createElement("span");
  spacer.className = "win-sep";
  frag.appendChild(spacer);

  // ── that window's own SEARCH (HDR1) ───────────────────────────────────────
  const search = buildWindowSearch(win);
  if (search) frag.appendChild(search);

  // ── the arrangement verbs: split, magnify, join, close ────────────────────
  const arr = document.createElement("span");
  arr.className = "win-arrange";
  const chip = (glyph: string, title: string, on: boolean, run: () => void): void => {
    const b = document.createElement("button");
    b.className = "wi-chip wi-add" + (on ? " wi-on" : "");
    b.textContent = glyph;
    b.title = title;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      run();
    });
    arr.appendChild(b);
  };
  chip("→", t("win.splitRight"), false, () => splitAreaOf(win, "row"));
  chip("↓", t("win.splitDown"), false, () => splitAreaOf(win, "col"));
  const magnified = maximizedWin() === win.id;
  chip("⛶", t(magnified ? "win.unmaximize" : "win.maximize"), magnified, () =>
    magnifyWindow(win.id),
  );
  if (canJoin(win.id))
    chip("⊟", t("win.join"), false, () => {
      joinWindow(win.id);
      renderTiles();
      const w = activeWin();
      if (w.type === "graph") setMode(winMode(w));
      else mountWindow(w);
      renderAreaHeaders();
    });
  if (windowsOf().length > 1) {
    const close = document.createElement("button");
    close.className = "wi-chip wi-close";
    close.textContent = "×";
    close.title = t("win.close");
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      setActiveWin(win.id);
      closeActiveWindow();
    });
    arr.appendChild(close);
  }
  frag.appendChild(arr);
  if (!active) frag.querySelectorAll("*").forEach((el) => el.classList.add("hdr-passive"));
  return frag;
}

/**
 * Run something that acts on the FOCUSED window, from a bar that may belong to
 * another one. Focusing first is not a formality: `fit()` and the rest read
 * `activeWin()` for the camera, and silently fitting the wrong window is the
 * kind of bug that looks like the button doing nothing.
 */
function focusThen(win: Win, run: () => void): void {
  if (activeWin().id !== win.id) selectWindow(win.id);
  run();
}

/** Split the area of a SPECIFIC window (its own bar's verb). */
function splitAreaOf(win: Win, dir: "row" | "col"): void {
  setActiveWin(win.id);
  splitWindow(win.id, dir);
  renderTiles();
  const w = activeWin();
  if (w.type === "graph") setMode(winMode(w));
  else mountWindow(w);
  renderAreaHeaders();
}

/** Transform a SPECIFIC window in place (its own bar's type dropdown). */
function transformWindowOf(win: Win, type: WindowType): void {
  if (win.type === type) return;
  setActiveWin(win.id);
  setWinType(win, type);
  renderTiles();
  mountWindow(win);
  renderAreaHeaders();
}

/**
 * The MODES a window offers in its header, or null when it has none.
 *
 * HDR1 folded the Tabular sheet selector in here. It had been a `<select>` in the
 * table's own head plus (until MENU-AUDIT) a menu listing the same sheets — but
 * "which sheet" is the same kind of fact as "which projection": it is what this
 * window is showing, per instance, which is the definition of a mode. One
 * concept, one control, in the place every window keeps it.
 */
function headerModesOf(win: Win): {
  currentLabel: string;
  items: { label: string; current: boolean; run: () => void;
           disabled?: string }[];
} | null {
  if (win.type === "graph") {
    const cur = winMode(win);
    return {
      currentLabel: t("mode.label", { mode: t(`mode.${cur}`) }),
      items: GRAPH_MODES.map((m) => ({
        label: t("mode.label", { mode: t(`mode.${m}`) }),
        current: m === cur,
        run: () => focusThen(win, () => setWindowMode(m)),
      })),
    };
  }
  // U1 · every other type with modes reads them from THE registry, so a new mode
  // is one entry in `WINDOW_MODES` and appears here without a branch of its own.
  // (Graph keeps its own arm above because changing its mode also re-mounts a
  // canvas projection; Tabular's "mode" is a sheet, which is not window state.)
  if (winModes(win.type).length) {
    const cur = winModeOf(win);
    return {
      currentLabel: t("mode.label", { mode: t(`mode.${cur}`) }),
      items: winModes(win.type).map((m) => ({
        label: t("mode.label", { mode: t(`mode.${m}`) }),
        current: m === cur,
        // A mode that is planned but not built is LISTED and disabled, with the
        // reason — the same treatment the menus give an action that cannot run.
        // Hiding it would make the plan invisible; letting it through would put
        // the window in a mode that draws nothing.
        disabled: DISABLED_MODES[m] ? t(DISABLED_MODES[m]) : undefined,
        run: () =>
          focusThen(win, () => {
            setWinModeOf(win, m);
            mountWindow(win);
            renderAreaHeaders();
          }),
      })),
    };
  }
  if (win.type === "table") {
    const cur = currentSheetKey();
    // "US view" was a sheet NAME in a selector; as a mode it reads "US view
    // Mode", which says the same word twice. The sheet keys are the names.
    const label = (k: string): string =>
      t("mode.label", {
        mode: (EM_DATA_SHEETS.find((s) => s.key === k)?.label ?? k).replace(
          / view$/,
          "",
        ),
      });
    return {
      currentLabel: label(cur),
      items: EM_DATA_SHEETS.map((sheet) => ({
        label: label(sheet.key),
        current: sheet.key === cur,
        run: () =>
          focusThen(win, () => {
            setSheet(sheet.key);
            renderAreaHeaders();
          }),
      })),
    };
  }
  return null;
}

/**
 * A bar dropdown. The generic `.dropdown` wiring in the toolbar runs ONCE at
 * module load over the markup that existed then, so generated bars wire their
 * own — and place their menus by hand, because a bar that scrolls would clip a
 * menu laid out inside it.
 */
function wireBarDropdown(
  toggle: HTMLElement,
  menu: HTMLElement,
  build?: () => void,
): void {
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = menu.classList.contains("hidden");
    closeAllDropdowns();
    closeAllSubmenus();
    if (!willOpen) return;
    build?.();
    menu.classList.remove("hidden");
    placeBarMenu(toggle, menu);
  });
}

/**
 * HDR1 · the window's OWN search box — full search, over what THIS window holds.
 *
 * The master header had one box that searched "the document". In a tiled shell
 * that is a search with no scope: which of the four things on screen was it
 * supposed to take you to? So each window carries its own, and it searches what
 * that window is actually showing — nodes in a graph, rows in a table, the prose
 * and titles of a narrative. (The Outliner already had one, at the top of its
 * list, and it stays where it is.)
 */
function buildWindowSearch(win: Win): HTMLElement | null {
  if (win.type !== "graph" && win.type !== "table" && win.type !== "narrative")
    return null;
  const wrap = document.createElement("div");
  wrap.className = "win-search";
  const input = document.createElement("input");
  input.type = "search";
  input.autocomplete = "off";
  input.className = "win-search-input";
  input.placeholder = t(
    win.type === "graph"
      ? "win.searchGraph"
      : win.type === "table"
        ? "win.searchTable"
        : "win.searchNarrative",
  );
  wrap.appendChild(input);
  // a click in the box must not be read as a gesture on the window underneath
  input.addEventListener("pointerdown", (e) => e.stopPropagation());

  if (win.type === "graph") {
    const results = document.createElement("div");
    results.className = "win-search-results hidden";
    wrap.appendChild(results);
    // the SAME implementation the master box used — one search, many mounts
    setupSearch(
      input,
      results,
      () => store?.doc ?? null,
      (id) => {
        focusThen(win, () => {
          if (inContext()) {
            contextStack = [];
            rebuildContext();
          }
          select(id);
          centerOn(id);
        });
      },
    );
    return wrap;
  }
  if (win.type === "table") {
    input.value = emDataFilter();
    input.addEventListener("input", () => {
      setEmDataFilter(input.value);
    });
    return wrap;
  }
  // narrative: find in the prose, and take you to it
  input.addEventListener("input", () => {
    highlightNarrative(input.value);
  });
  return wrap;
}

/**
 * Rebuild the header of EVERY area (WIN-FIX1 §1).
 *
 * The focused area's bar is `#window-header` — the element `windowBarHeight()`
 * measures and `--winbar-h` is published from, so the canvas keeps being exactly
 * as much shorter as the bar is tall. The others are the `.tile-bar` of their
 * area. Same builder, same contents, one dimmed.
 */
function renderAreaHeaders(): void {
  const active = activeWin();
  const head = document.getElementById("window-header");
  if (head) {
    head.innerHTML = "";
    head.appendChild(buildAreaHeader(active, true));
  }
  for (const bar of document.querySelectorAll<HTMLElement>(".tile-area > .tile-bar")) {
    const win = windowsOf().find((w) => w.id === bar.parentElement?.dataset.win);
    if (!win) continue;
    bar.innerHTML = "";
    bar.appendChild(buildAreaHeader(win, false));
  }
  // STEP A · every area publishes the height ITS bar takes, the way the focused
  // one always has (`--winbar-h`): the resources panel and its chevron sit below
  // the bar in any area, and they read that one measurement rather than each
  // guessing from a constant that would drift.
  for (const area of document.querySelectorAll<HTMLElement>(".tile-area")) {
    const bar = area.querySelector<HTMLElement>(":scope > .tile-bar");
    area.style.setProperty("--winbar-h", `${bar?.offsetHeight ?? 0}px`);
  }
  resizeCanvas();
}

/** Kept as the name every caller already uses. The header IS rebuilt now rather
 *  than mutated in place — there is no longer a fixed set of ids to poke. */
function updateWindowHeader(): void {
  renderAreaHeaders();
}

// ── WIN3 · the per-type menu registry ────────────────────────────────────────
// The window header is a BAR: type · mode · the menus of that window type. The
// menus are DATA — `WINDOW_MENUS[type]` — so adding one is an entry here, not a
// rewrite of the header. Every item runs an EXISTING command (often by driving
// the control that already owns it), so there is one implementation of fit,
// layout, add-chapter, add-row, export… and the menu is only a way in.
interface WinMenuItem {
  label: string;
  run: () => void;
  /** a ✓ in the menu — for the items that pick a state, not an action */
  checked?: () => boolean;
  /** greyed out with the reason in the tooltip, rather than silently missing */
  disabledReason?: () => string | null;
}
interface WinMenu {
  label: string;
  items: () => WinMenuItem[];
}

const click = (id: string): void => document.getElementById(id)?.click();

// WIN4 · AUDIT against the master header (the app toolbar) and against the
// bar's own controls — every duplicate removed, with its reason:
//  · "Vista" DISSOLVED. Its three jobs already had a home: the modes are the
//    Mode selector two centimetres to the left (a state offered twice reads as
//    two different states), "Adatta" is now an icon button, and the filters are
//    the funnel at the top-right of the canvas, which was there all along.
//  · Table ▸ "Esporta" REMOVED: it was File ▸ Esporta verbatim (same three
//    handlers), and exporting is a document command, not a table command.
//  · The window TYPE dropdown stays even though the leader also switches
//    workspaces: they are different scopes (leader = which arrangement, header =
//    what THIS window shows) and the tiling of WIN5 is where that pair finally
//    reads as one thing. Deliberately left alone.
const WINDOW_MENUS: Record<WindowType, WinMenu[]> = {
  graph: [
    {
      label: "Layout",
      items: () => {
        const mode = winMode(activeWin());
        const algoItems = (["layered", "radial", "force"] as GraphAlgorithm[]).map(
          (a) => ({
            label: a[0].toUpperCase() + a.slice(1),
            run: () => {
              const sel = document.getElementById("graph-layout") as HTMLSelectElement;
              sel.value = a;
              sel.dispatchEvent(new Event("change"));
            },
            checked: () => graphAlgorithm === a,
            disabledReason: () =>
              mode === "matrix"
                ? "L'algoritmo vale per le proiezioni a grafo; Matrix usa le corsie di em-core."
                : null,
          }),
        );
        return [
          {
            label: "Ricalcola layout",
            run: () => click("btn-layout"),
            disabledReason: () =>
              mode === "matrix"
                ? null
                : "In questa proiezione il layout si rigenera cambiando algoritmo.",
          },
          ...algoItems,
        ];
      },
    },
  ],
  narrative: [
    {
      // MENU-AUDIT · "Aggiungi capitolo" left this menu, and the menu is better
      // for it: every item here now acts on the CURRENT chapter, which is what
      // "Capitolo" means. Adding one is not an operation on the current chapter,
      // and it has two homes that suit it — the narrative palette (always) and
      // the "+ capitolo" at the end of the story (while writing).
      label: "Capitolo",
      items: () => {
        const narr = activeNarrative();
        const ci = validCurrentChapter();
        const noChapter = (): string | null =>
          !narr
            ? "Nessuna narrativa in questo grafo."
            : ci == null
              ? "Clicca un capitolo per renderlo corrente."
              : null;
        return [
          {
            label: "Elimina capitolo corrente",
            run: () => {
              if (!store || !narr || ci == null) return;
              nedit.deleteChapter(store, narr.id, ci);
              setCurrentChapterIndex(null);
              refreshNarrativeView();
            },
            disabledReason: noChapter,
          },
          {
            label: "Sposta su",
            run: () => {
              if (!store || !narr || ci == null) return;
              nedit.moveChapter(store, narr.id, ci, -1);
              setCurrentChapterIndex(Math.max(0, ci - 1));
            },
            disabledReason: () => noChapter() ?? (ci === 0 ? "È già il primo." : null),
          },
          {
            label: "Sposta giù",
            run: () => {
              if (!store || !narr || ci == null) return;
              nedit.moveChapter(store, narr.id, ci, 1);
              setCurrentChapterIndex(Math.min(narr.chapters.length - 1, ci + 1));
            },
            disabledReason: () =>
              noChapter() ??
              (narr && ci === narr.chapters.length - 1 ? "È già l'ultimo." : null),
          },
        ];
      },
    },
    {
      label: "Inserisci",
      items: () => {
        const narr = activeNarrative();
        const ci = validCurrentChapter();
        // The embed needs a chapter AND a node to point at. The MAP points at
        // the graph itself (that is what a site map is), so it needs no
        // selection — which is the case E.D. hit: a map in the introduction.
        // Every other view type embeds A NODE, so it uses the canvas selection;
        // with nothing selected the item says so instead of guessing.
        const insert = (viewType: string, ref: string): void => {
          if (!store || !narr || ci == null) return;
          nedit.addEmbed(store, narr.id, ci, ref, viewType);
          refreshNarrativeView();
        };
        const needChapter = (): string | null =>
          !narr
            ? "Nessuna narrativa in questo grafo."
            : ci == null
              ? "Clicca un capitolo per renderlo corrente."
              : null;
        return [
          {
            label: "Mappa del sito",
            run: () => store && insert("map", store.ensureGraphRootId()),
            disabledReason: needChapter,
          },
          ...narrativeViewTypes()
            .filter((vt) => vt !== "map")
            .map((vt) => ({
              label: vt,
              run: () => selectedId && insert(vt, selectedId),
              disabledReason: () =>
                needChapter() ??
                (selectedId
                  ? null
                  : "Seleziona sul canvas il nodo da incorporare."),
            })),
        ];
      },
    },
    {
      label: "IA",
      items: () => {
        const narr = activeNarrative();
        const ci = validCurrentChapter();
        return [
          {
            label: "Rigenera bozza del capitolo corrente",
            run: () => {
              if (!narr || ci == null) return;
              void generateChapterDraft(narr.id, ci);
            },
            disabledReason: () =>
              !narr
                ? "Nessuna narrativa in questo grafo."
                : ci == null
                  ? "Clicca un capitolo per renderlo corrente."
                  : null,
          },
        ];
      },
    },
  ],
  // MENU-AUDIT · the "Tabella" menu (one item per sheet, with a ✓) is GONE. The
  // sheet selector sits in the window's own head, two centimetres away, showing
  // which sheet is open — and a state offered twice reads as two states. Exactly
  // the reason WIN4 dissolved the "Vista" menu next to the Mode selector.
  table: [
    {
      label: "Righe",
      items: () => [
        {
          // FOCUS-NOJITTER · calls the mutator directly. It used to click a
          // `+ row` button in the table's head — a button that only existed in
          // the FOCUSED window's head, which is what made the head change size
          // on every focus change. The head has no buttons now; this menu is
          // where a command on this window lives.
          label: "Aggiungi riga",
          run: () => {
            if (!store) return;
            if (!addEmDataRow(store))
              toast("Questo foglio non accetta righe nuove.");
          },
          disabledReason: () => (store ? null : "Nessun grafo aperto."),
        },
        {
          label: "Aggiungi claim",
          run: () => {
            if (store) toggleEmDataClaimForm(store);
          },
          disabledReason: () =>
            currentSheetKey() === "Claims"
              ? null
              : "I claim si aggiungono dal foglio Claims.",
        },
        {
          label: "Elimina riga corrente",
          run: () => {
            const id = currentRowId();
            if (!store || !id) return;
            deleteRow(store, id);
            setCurrentRowId(null);
            renderEmData();
          },
          disabledReason: () =>
            currentRowId() ? null : "Clicca una riga per renderla corrente.",
        },
      ],
    },
  ],
  // WIN5 · the Doc window is real, so it has commands: the sources of the graph
  // are created and removed through the SAME EM-Data mutators the Documents
  // sheet uses (one way to make a document, whichever window you are in).
  emtree: [],
  inspector: [],
  // VIEWER · nothing to command: it follows the selection and shows what is
  // there. A menu offering "open" or "zoom" would be a viewer pretending to be
  // an editor. Its ONE state — pinned to a dropped folder, or following the
  // selection again — is here because there is no other way back.
  viewer: [
    {
      label: "Collezione",
      items: () => {
        const win = activeWin();
        const pinned = !!winCurrent(win, "collection");
        return [
          {
            label: "Segui la selezione",
            disabled: pinned ? undefined : "questa finestra segue già la selezione",
            run: () => {
              setWinCurrent(win, "collection", null);
              setWinCurrent(win, "item", null);
              viewerCollection = null;
              renderViewer();
            },
          },
        ];
      },
    },
  ],
  // STORAGE · navigation is the double-click and the ↑; a menu repeating them
  // would be a second way to do the one thing the surface already does.
  storage: [],
  // SHELF · save/open are in the bar, where a list's own verbs belong; the menu
  // holds the one thing that is not a verb of this window — emptying it.
  shelf: [
    {
      label: "Shelf",
      items: () => [
        {
          label: "Svuota lo shelf",
          disabled: shelfEntries().length ? undefined : "lo shelf è già vuoto",
          run: () => {
            clearShelf();
            renderShelf();
          },
        },
      ],
    },
  ],
  // ANNOTATOR · the tools are in the panel and the Mode is in the header; the
  // only thing left to command is the region being traced.
  annotator: [
    {
      label: "Regione",
      items: () => [
        {
          label: "Annulla la regione",
          disabled: annotatorDraft ? undefined : "nessuna regione in corso",
          run: () => {
            annotatorDraft = null;
            const panel = document.getElementById("annotator-panel");
            if (panel) panel.dataset.open = "";
            drawAnnotatorOverlay();
            renderAnnotatorPanel();
          },
        },
        {
          label: "Chiudi il poligono",
          disabled:
            annotatorDraft?.shape_kind === "polygon" &&
            (annotatorDraft.points?.length ?? 0) >= 3
              ? undefined
              : "serve un poligono con almeno 3 punti",
          run: () => renderAnnotatorPanel(),
        },
      ],
    },
  ],
  doc: [
    {
      label: "Documento",
      items: () => [
        {
          label: "Nuovo documento",
          run: () => {
            if (!store) return;
            const id = addRow(store, "Documents");
            if (id) setWinCurrent(activeWin(), "doc", id);
            renderDocView();
          },
          disabledReason: () => (store ? null : "Nessun grafo aperto."),
        },
        {
          label: "Elimina documento corrente",
          run: () => {
            const id = currentDocId();
            if (!store || !id) return;
            deleteRow(store, id);
            setWinCurrent(activeWin(), "doc", null);
            renderDocView();
          },
          disabledReason: () =>
            currentDocId() ? null : "Seleziona un documento nell'elenco.",
        },
      ],
    },
  ],
};

/** Build the header's menus for the ACTIVE window's type. */
/**
 * Put a window-bar menu where its toggle is, in SCREEN coordinates.
 *
 * The bar scrolls horizontally when its controls do not fit, and a menu laid out
 * inside a scroller is clipped by it — the menu became a second scrollbar inside
 * the bar instead of opening over the canvas. The menus are therefore `fixed`
 * and placed here, and kept inside the viewport so the last item is always
 * reachable.
 */
function placeBarMenu(toggle: HTMLElement, menu: HTMLElement): void {
  const r = toggle.getBoundingClientRect();
  // hang it off the BAR, not off the toggle: the toggle is shorter than the bar,
  // and anchoring to it drew the menu over the bar's own bottom edge.
  const barBottom =
    toggle.closest("#window-header")?.getBoundingClientRect().bottom ?? r.bottom;
  menu.style.left = "0px";
  menu.style.top = "0px";
  const m = menu.getBoundingClientRect();
  const left = Math.max(4, Math.min(r.left, window.innerWidth - m.width - 4));
  // below the bar, unless there is no room down there
  const below = barBottom + 2;
  const top =
    below + m.height <= window.innerHeight - 4
      ? below
      : Math.max(4, r.top - m.height - 4);
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

/**
 * WIN7 · bring the Inspector's graph card up with the SITE POSITION in view.
 *
 * The site position is a graph-scope fact (GEO1), so the panel that holds it is
 * the Inspector's no-selection state — which means clearing the selection first.
 * Where the Inspector *is* depends on the arrangement: an area of its own if the
 * workspace has one, the aside otherwise. Both are handled, because "open the
 * panel" has to mean the same thing in either.
 */
function revealSitePosition(): void {
  if (!store) {
    toast("Apri prima un grafo: la posizione è un dato del grafo.");
    return;
  }
  select(null); // the graph card is the Inspector's no-selection state
  const insp = document.getElementById("inspector");
  const inWindow = windowsOf().find(
    (w) => PANEL_TABS[w.type] && panelIdOf(w) === "inspector",
  );
  if (inWindow && insp?.parentElement?.id !== "panel-view-body") {
    // an Inspector area already holds it (or is about to): work there
    if (activeWin().id !== inWindow.id) selectWindow(inWindow.id);
  }
  refreshInspector();
  const anchor = document.getElementById("insp-site-position");
  if (!anchor) {
    toast("Pannello posizione non disponibile: apri una finestra Ispettore su questo grafo.");
    return;
  }
  revealBlock(anchor);
}

/**
 * HDR1 · find in the narrative — highlight every match in the prose and titles
 * of the story this window is showing, and take you to the first.
 *
 * A find over rendered text rather than a re-render with a filter: a story read
 * with its non-matching paragraphs removed is not the story, and the question a
 * search answers here ("where did I write about the threshold?") wants the
 * passage in its place.
 */
function highlightNarrative(query: string): void {
  const host = narrativeViewEl;
  host.querySelectorAll(".nv-hit").forEach((el) => el.classList.remove("nv-hit"));
  const q = query.trim().toLowerCase();
  if (!q) return;
  let first: HTMLElement | null = null;
  for (const el of host.querySelectorAll<HTMLElement>(
    ".nv-chapter-title, .nv-prose, .nv-block-row, .nv-lede",
  )) {
    if (!el.textContent?.toLowerCase().includes(q)) continue;
    el.classList.add("nv-hit");
    first ??= el;
  }
  first?.scrollIntoView({ block: "center", behavior: "auto" });
}

/** Apply a workspace: mount the editor of its ACTIVE window via the existing
 *  shell. WIN2 · the window decides, not the preset — the preset only seeded the
 *  first window, so a Canvas workspace left in DTC mode reopens in DTC, and one
 *  whose window was transformed into a table reopens as a table. */
function applyWorkspace(id: WorkspaceId): void {
  mountWindow(activeWin(id));
}

function setWorkspace(id: WorkspaceId): void {
  setActiveWorkspace(id);
  // HDR1 · a workspace can DECLARE an arrangement (the IDE one does). It is
  // applied the first time you open it and never again: after that the
  // arrangement is yours, and a preset that re-asserted itself on every visit
  // would throw away the split you made the last time you were there.
  const preset = workspacePreset(id);
  if (preset.arrangement === "ide" && !isTiled(id)) applyDefaultLayout(id);
  if (preset.arrangement === "assets" && !isTiled(id)) applyAssetsLayout(id);
  renderTiles(); // WIN5 · each workspace has its own arrangement
  // the tab follows the WORKSPACE and nothing else — mounting an editor never
  // moves it (that is what made a transformed window possible).
  reflectWorkspaceInBar(id);
  applyWorkspace(id);
}

/**
 * HDR1 · the workspace TABS — the master header's only switcher.
 *
 * What used to be here (three chips, plus a search box, plus a `⌗` button hidden
 * down in the window bar) was three levels of "where am I" spread across two
 * bars. Now the master header answers one question — **which workspace** — and
 * the tabs are the answer, the IDE arrangement among them. A `+` makes a new one
 * from whatever you are looking at; the ones you made can be renamed
 * (double-click) and closed (middle-click or the ×), the built-ins cannot.
 */
function renderWorkspaceBar(): void {
  workspaceBar.innerHTML = "";
  for (const w of WORKSPACES) {
    const b = document.createElement("button");
    b.dataset.ws = w.id;
    const isActive = w.id === activeWorkspace();
    b.className = "ws-tab" + (isActive ? " active" : "");
    const label = workspaceLabel(w, t);
    b.title = label;
    b.innerHTML =
      `<span class="ws-ic">${w.icon}</span><span class="ws-lb">${escapeHtml(label)}</span>`;
    b.addEventListener("click", () => setWorkspace(w.id));
    if (!w.builtin) {
      // rename in place: a workspace you made is named after what you use it for,
      // and that changes
      b.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const next = prompt(t("ws.renamePrompt"), label);
        if (next == null || !renameWorkspace(w.id, next)) return;
        renderWorkspaceBar();
      });
      const x = document.createElement("span");
      x.className = "ws-x";
      x.textContent = "×";
      x.title = t("ws.close");
      x.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!removeWorkspace(w.id)) return;
        renderWorkspaceBar();
        setWorkspace(activeWorkspace());
      });
      b.appendChild(x);
    }
    workspaceBar.appendChild(b);
  }
  const add = document.createElement("button");
  add.className = "ws-tab ws-add";
  add.textContent = "+";
  add.title = t("ws.addTitle");
  add.addEventListener("click", () => {
    const name = prompt(t("ws.addPrompt"), t("ws.addDefault"));
    if (name == null) return;
    const ws = addWorkspace(name);
    renderWorkspaceBar();
    setWorkspace(ws.id);
  });
  workspaceBar.appendChild(add);
}
renderWorkspaceBar();
onLocaleChange(renderWorkspaceBar);
// HDR1 · the bars are BUILT from the dictionary, so a language change rebuilds
// them; there is no fixed markup left to re-label in place.
onLocaleChange(renderAreaHeaders);

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
// FILE import, window-wide: dropping an em.json/GraphML anywhere in the app
// loads it. Restricted to drags that actually carry FILES (DND1) — before, the
// dragover accepted everything unconditionally, so the whole window declared
// itself a valid drop target for any drag, and an internal palette drag never
// reached the canvas: window's `drop` ran, found no file, and swallowed the
// gesture. "Files" is the only thing readable during dragover (the payload is
// not), which is why the test is on `types` and not on `files.length`.
const carriesFiles = (e: DragEvent): boolean =>
  !!e.dataTransfer?.types?.includes("Files");
window.addEventListener("dragover", (e) => {
  if (!carriesFiles(e)) return; // internal drag → leave it to the canvas
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
});
window.addEventListener("drop", (e) => {
  if (!carriesFiles(e)) return;
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
});

// PALETTE drag → instantiate at the cursor. Sibling of the click-to-arm gesture,
// not a replacement: it reuses `placeNode`, so lane/epoch assignment, group
// membership when inside a hypergraph, the DTC kind stamp and the qualia picker
// all behave identically. Setting the placing* trio is how a drop "arms" the
// same code path for one shot; placeNode's cancelPlacing clears it.
const paletteDragPayload = (e: DragEvent): PaletteDragPayload | null => {
  const raw = e.dataTransfer?.getData(PALETTE_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PaletteDragPayload;
  } catch {
    return null; // a foreign drag claiming our MIME is not worth a crash
  }
};
canvas.addEventListener("dragover", (e) => {
  if (!e.dataTransfer?.types?.includes(PALETTE_MIME)) return;
  e.preventDefault(); // without this the drop event never fires
  e.dataTransfer.dropEffect = "copy";
  canvas.classList.add("drop-target");
});
canvas.addEventListener("dragleave", () => canvas.classList.remove("drop-target"));
canvas.addEventListener("drop", (e) => {
  canvas.classList.remove("drop-target");
  const p = paletteDragPayload(e);
  if (!p) return; // not ours (a file drop bubbles on to the window handler)
  e.preventDefault();
  if (!store) {
    toast("Open a document first");
    return;
  }
  placingType = p.nodeType;
  placingKind = p.kind ?? null;
  placingIsResource = !!p.isResource;
  const w = worldPos(e);
  placeNode(w.x, w.y);
});

// W1 · STORAGE → VIEWER. A resource drop, NOT a node-type drop: the Viewer is
// still absent from `RESOURCE_PROVIDERS` (it places nothing, so no palette and
// no chevron) and it still refuses `PALETTE_MIME`. What it accepts is a folder
// or a file dragged out of a Storage window — "show me this" — which is a
// different sentence from "create one of these", carried on a different mime so
// the two can never be confused for one another.
{
  const viewerView = document.getElementById("viewer-view");
  const carriesStorage = (e: DragEvent): boolean =>
    !!e.dataTransfer?.types?.includes(STORAGE_MIME);
  viewerView?.addEventListener("dragover", (e) => {
    if (!carriesStorage(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = "copy";
    viewerView.classList.add("drop-target");
  });
  viewerView?.addEventListener("dragleave", () =>
    viewerView.classList.remove("drop-target"),
  );
  viewerView?.addEventListener("drop", (e) => {
    viewerView.classList.remove("drop-target");
    const payload = storageDragPayload(e);
    if (!payload) return;
    e.preventDefault();
    const win = activeWin();
    if (win.type !== "viewer") return;
    pinViewerCollection(win, payload);
  });
}

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
let adornmentPending: string | null = null; // ornament badge pressed → select real node
let pdDecoratorPending: string | null = null; // PD tablet pressed → select group on click
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
    markCameraTouched(activeWin().id, view);
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
    // BADGE1/DEC1 · ornament badge (author/license/embargo) — SCREEN-space hit,
    // like the PD tag. A click selects the REAL ornament node (a "+N" overflow
    // chip carries the referent). Checked before the node hit-test: the badge
    // sits on the referent's corner and a click there means "edit the ornament".
    const ab = hitAdornmentBadge(lx, ly);
    if (ab) {
      adornmentPending = ab;
      dragMode = "none";
      return;
    }
    // PD1 · collapsed-PDG tablet (bottom-left) → single click selects the group;
    // the double click that enters the hypergraph is handled in `dblclick`.
    const pdd = hitPdDecorator(lx, ly);
    if (pdd) {
      pdDecoratorPending = pdd;
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
    fn && !fn.collapsed && hitHandle(fn, w.x, w.y, viewport().scale) ? fn : null;
  if (!handleNode && viewport().scale > 0.5) {
    for (const n of s.nodes) {
      if (!n.collapsed && hitHandle(n, w.x, w.y, viewport().scale)) {
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
  } else if (hit && canvasOverrides() && !inContext()) {
    // Graph / DTC view: drag a node to place it (persisted as an override in
    // THIS projection's map, see canvasOverrides).
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
    // CROSS-AREA CONNECTOR · a connector may end on a node that is not in this
    // area at all — two units in the same graph rarely fit one framing. The
    // pointer capture keeps sending these moves HERE even when the cursor has
    // left this rectangle, so this is the one place that can notice, hand the
    // editor over to the area under the cursor, and carry the connector across.
    //
    // `connect` itself is untouched by the hand-over: `fromId` is a node of the
    // DOCUMENT, not of a window, so the connector stays the same connector. What
    // changes is which camera and which scene resolve the target — which is
    // exactly what has to change when the cursor is somewhere else.
    const over =
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
        ? areaAt(e.clientX, e.clientY)
        : null;
    if (over && over.winId !== activeWin().id) {
      selectWindow(over.winId);
      // resolve the pointer in the NEW area's camera before asking what is under it
      const r2 = canvas.getBoundingClientRect();
      const w2 = viewport().toWorld(e.clientX - r2.left, e.clientY - r2.top);
      // Where the connector CAME IN: the pointer clamped to this area's frame.
      // The source node may be nowhere near this view — the band then starts at
      // that edge point instead of vanishing (renderer: `connect.fromAnchor`).
      if (connect) {
        const edge = viewport().toWorld(
          Math.min(Math.max(e.clientX - r2.left, 0), r2.width),
          Math.min(Math.max(e.clientY - r2.top, 0), r2.height),
        );
        connect.fromAnchor = { x: edge.x, y: edge.y };
      }
      updateConnect(w2.x, w2.y);
      return;
    }
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
      const overrides = canvasOverrides() ?? graphOverrides;
      for (const id of targets) {
        const sn = s?.byId.get(id);
        const base = overrides.get(id) ?? (sn ? { x: sn.x, y: sn.y } : null);
        if (base) overrides.set(id, { x: base.x + ddx, y: base.y + ddy });
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
  // ornament badge click → select the real author/license/embargo node so the
  // Inspector edits it (the badge is only its view representation)
  if (adornmentPending) {
    const id = adornmentPending;
    adornmentPending = null;
    if (!moved) select(id);
    return;
  }
  // PD tablet single click → select the collapsed group (Inspector); the double
  // click is a separate handler that enters the hypergraph.
  if (pdDecoratorPending) {
    const id = pdDecoratorPending;
    pdDecoratorPending = null;
    if (!moved) select(id);
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
            // BUGFIX-PDG · a collapsed-to-tablet PDG is not on the canvas: the
            // marquee must not sweep it up (it would select a phantom box in the
            // empty space where the PDG's layout rect sits).
            !n.collapsed &&
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
      requestFold(toggle.id);
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
  // PD1 · double-clicking the collapsed-PDG tablet enters the hypergraph
  const rect = canvas.getBoundingClientRect();
  const pdd = hitPdDecorator(e.clientX - rect.left, e.clientY - rect.top);
  if (pdd) {
    e.preventDefault();
    enterGroup(pdd);
    return;
  }
  const w = worldPos(e);
  const hit = hitTest(s, w.x, w.y);
  if (!hit) return;
  if (isGroupType(hit.node.node_type)) {
    e.preventDefault();
    enterGroup(hit.id);
    return;
  }
  // DTC seam: double-clicking a RepresentationModel / Document / the Resource
  // itself that resolves to a DTC-output Resource folds into its upstream DTC
  // genesis (process → input resources), reusing the hypergraph context.
  const res = resolveDtcResource(hit.id);
  if (res) {
    e.preventDefault();
    enterGroup(res);
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
    markCameraTouched(activeWin().id, view);
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
  // NAME1 · a name that breaks the convention gets a one-click fix, and the
  // suggestion is the same one the orange/red label is complaining about (both
  // read `nameStatus`). Only for a single selection: renaming several nodes to
  // "the next free name" in one gesture would need an order nobody chose.
  if (ids.length === 1) {
    const check = nameStatus.get(ids[0]);
    if (check?.suggestion) {
      const b = document.createElement("button");
      b.textContent = `Rinomina a "${check.suggestion}"`;
      if (check.reason) b.title = check.reason;
      b.onclick = () => {
        const from = store!.node(ids[0])?.name ?? "";
        // the display NAME changes; the id stays the UUID it always was
        store!.updateNode(ids[0], { name: check.suggestion! });
        hideContextMenu();
        toast(`${from || ids[0]} → ${check.suggestion}`);
      };
      menu.appendChild(b);
    }
  }
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
  // WIN7 · Ctrl+Space magnifies the focused area and brings it back — Blender's
  // shortcut, and it must be read BEFORE the plain-Space pan below, which would
  // otherwise swallow it and leave the canvas in a grab it never got out of.
  if (e.code === "Space" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    magnifyWindow(activeWin().id);
    return;
  }
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

// K1 — the desktop shell warns when the bridge on :8765 is somebody else's, so
// the keychain key cannot reach it. Surfaced as a toast AND a log line: the toast
// is what the user sees now, the log is what they find when generation later says
// "no API key".
void onForeignBridge((message) => {
  logWarn(message);
  toast(message);
});

// ---------- boot ----------
// Language FIRST: `initI18n` sets `dir`/`lang` on <html> and translates the
// static chrome before anything is rendered. Doing it after the first render
// would show a frame of English (or an LTR frame in Hebrew) and then flip.
initI18n();
populateLanguageSelect();
// Evaluate the empty state ONCE at boot. Without this, the canvas overlays kept
// whatever the markup said until the first document arrived — so the filter
// button sat there, enabled, filtering nothing (POL1 point 8 was only half true:
// the rule was right, it just never ran before the first load).
updateToolbar();
// WIN2 · reopen the arrangement the session was left in: the persisted workspace
// and ITS active window's mode. Before this the leader chip showed the saved
// workspace while the canvas silently sat in Matrix — the saved state was a
// label, not a state. Safe on an empty canvas (fit/buildScenes are no-ops
// without a store).
renderTiles(); // WIN5 · lay out the arrangement this session was left in
applyWorkspace(activeWorkspace());

// A2/IIIF · the interoperability corner of the annotator. Bound once, here,
// like every other piece of static chrome: the buttons exist in the markup and
// are hidden until the picture on screen actually has an Image API service.
document.getElementById("annotator-copy-anno")
  ?.addEventListener("click", () => copyWebAnnotations());
document.getElementById("annotator-paste-anno")
  ?.addEventListener("click", () => pasteWebAnnotation());
document.getElementById("annotator-mirador")
  ?.addEventListener("click", () => openInMirador());

// EM-Data (DP-81): a live tabular view on the active store. Reads `store`
// through a getter so it always sees the current slot; re-renders from the
// store's onChange (wired in wireStore).
// WIN6-RESIDUAL · the Tabular WINDOW is the table's only home (the dock is
// retired). HDR1 · and the sheet is that window's MODE, chosen in its header —
// the `<select>` that used to sit in this head is gone with it.
{
  const body = document.getElementById("table-view-body");
  if (body)
    addEmDataHost({
      body,
      count: document.getElementById("table-view-count"),
      actions: document.getElementById("table-view-actions"),
      enabled: () =>
        !document.getElementById("table-view")?.classList.contains("hidden"),
    });
}

initAnnotatorGestures();   // A2 · the overlay is a singleton: wire it once
refreshIdentityChip();     // IDENTITY · who is authoring, from the first frame
initEmData({
  getStore: () => store,
  // CURRENT-ELEMENT · the row lives on the window, not in the table module
  currentRow: () => currentRowId(),
  // ROWSELECT · picking a row selects its NODE, and shows it if a graph window
  // is open on the same document. A row id IS a node id in EM, which is what
  // makes this a two-line hook rather than a lookup table.
  onRowPicked: (id) => revealFromTable(id),
  setCurrentRow: (id) => setCurrentRowId(id),
});
// AUX2: the EM-Data table paints a row blue iff its node is volatile — the SAME
// marker the canvas overlay reads, so table and graph never disagree.
setVolatileProvider((id) => isVolatile(store?.node(id)));

// Start from an EMPTY canvas (more natural than auto-loading a sample): use
// New, Open…, drop a file, or Sync. __EM_TEST_DATA__ still injects a fixture
// for automated tests.
if (window.__EM_TEST_DATA__) {
  loadDocument(window.__EM_TEST_DATA__, "embedded test data");
}
