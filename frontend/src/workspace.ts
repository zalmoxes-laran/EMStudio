/**
 * WIN1 · the windowing model — workspaces + windows (Blender-like), the shell's
 * new switching layer that ABSORBS MODE1 (the old central-mode enum).
 *
 * A **window** is an area of a given `WindowType` with its own per-instance
 * state (so two Graph windows can hold different modes). A **workspace** is a
 * preset arrangement of windows, selected from the fixed leader bar. No free
 * tiling yet (DP-82 D4): presets + per-window transform only.
 *
 * This module is PURE UI STATE (never em.json): the session's arrangement, not
 * part of any document. `main.ts` reads it and mounts the existing editors
 * (canvas matrix/graph, narrative view, EM-Data table) — the windows reuse the
 * editors, they don't reimplement them.
 *
 * Checkpoint scope: the model + the active-workspace state + the preset list.
 * Each preset currently centres on ONE window (its `windowType`); the `Win`
 * shape is already per-instance so multi-window arrangements and the per-window
 * transform (WIN2) drop in without a model change.
 */

import type { ViewKind } from "./types";

/** The kinds of editor a window can host. DTC is a MODE of the graph window
 *  (WIN2), not a type of its own. */
export type WindowType = "graph" | "narrative" | "table" | "doc";

/** A single window instance — its own id + type + type-specific state. */
export interface Win {
  id: string;
  type: WindowType;
  /** per-instance state (e.g. a graph window's matrix|graph|dtc mode). */
  state: Record<string, unknown>;
}

/** The mode of a graph window — WIN2's per-instance state. It IS a `ViewKind`:
 *  the window chooses which canvas projection it shows. */
export type GraphMode = ViewKind;

/** The modes a graph window offers, in header order. THE list: `main.ts` builds
 *  the menu from it and `winMode` validates against it, so a new projection is
 *  one entry here rather than two lists that can disagree (which is exactly how
 *  `multigraph` first shipped invisible to `winMode`). */
export const GRAPH_MODES: GraphMode[] = ["matrix", "graph", "dtc", "multigraph"];

/** The fixed workspace presets in the leader bar. */
export type WorkspaceId = "canvas" | "narrative" | "table";

export interface WorkspacePreset {
  id: WorkspaceId;
  /** i18n key for the leader label. */
  labelKey: string;
  /** a compact glyph for the leader chip. */
  icon: string;
  /** the window type this preset centres on. */
  windowType: WindowType;
  /** for a graph preset, the mode its FIRST window opens in. */
  graphMode?: GraphMode;
}

/**
 * WIN3 · leader = WORKSPACE (which set of windows), header = THIS WINDOW (its
 * type and its menus). The DTC preset used to sit here too, and that was the one
 * real duplicate: DTC is a MODE of a graph window, offered in the header's Mode
 * dropdown and in its Vista menu, so a chip that also switched to it made the
 * same choice reachable at two levels with different meanings. It is gone from
 * the leader; nothing is lost (the mode is one click away, per window, which is
 * where a per-window state belongs).
 */
export const WORKSPACES: WorkspacePreset[] = [
  { id: "canvas", labelKey: "ws.canvas", icon: "▦", windowType: "graph", graphMode: "matrix" },
  { id: "narrative", labelKey: "ws.narrative", icon: "❧", windowType: "narrative" },
  { id: "table", labelKey: "ws.table", icon: "▤", windowType: "table" },
];

/** Per-window-TYPE display metadata for the window header + transform dropdown
 *  (WIN1 checkpoint 2). DTC is a MODE of the graph window, so it is not a
 *  transform target here — it is reached from the header's Mode dropdown. */
export const WINDOW_TYPE_META: Record<WindowType, { icon: string; labelKey: string }> = {
  graph: { icon: "▦", labelKey: "win.graph" },
  narrative: { icon: "❧", labelKey: "win.narrative" },
  table: { icon: "▤", labelKey: "win.table" },
  doc: { icon: "▧", labelKey: "win.doc" },
};

/** The window type the active workspace currently shows — the ACTIVE window's
 *  own type (see the registry below), not the preset's, so a transformed or
 *  added window reports itself. */
export function activeWindowType(): WindowType {
  return activeWindowTypeOf();
}

const STORAGE_KEY = "emstudio.workspace";

function initial(): WorkspaceId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && WORKSPACES.some((w) => w.id === saved)) return saved as WorkspaceId;
  } catch {
    /* storage disabled */
  }
  return "canvas";
}

let active: WorkspaceId = initial();
const listeners: Array<(id: WorkspaceId) => void> = [];

export function activeWorkspace(): WorkspaceId {
  return active;
}

export function workspacePreset(id: WorkspaceId = active): WorkspacePreset {
  return WORKSPACES.find((w) => w.id === id) ?? WORKSPACES[0];
}

/** Set the active workspace (persisted) and notify. Idempotent. */
export function setActiveWorkspace(id: WorkspaceId): void {
  if (id === active || !WORKSPACES.some((w) => w.id === id)) return;
  active = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage disabled */
  }
  for (const fn of listeners) fn(id);
}

/** Reflect the active workspace WITHOUT notifying — used when the underlying
 *  mode changed by another route (e.g. the Narrative toolbar button) and the
 *  leader bar just needs to catch up. */
export function syncActiveWorkspace(id: WorkspaceId): void {
  if (id === active) return;
  active = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage disabled */
  }
}

export function onWorkspaceChange(fn: (id: WorkspaceId) => void): void {
  listeners.push(fn);
}

// ─────────────────────────── WIN2 · the window registry ──────────────────────
// Each workspace holds a LIST of window instances (one by default) and knows
// which is active. This is what makes the mode per-instance: two graph windows
// in the SAME workspace can sit in different projections, and switching between
// them restores each one's own mode. Still no free tiling (DP-82 D4) — one
// window is shown at a time and the header switches between them.

const WINDOWS_KEY = "emstudio.windows";

/**
 * WIN5 · the spatial arrangement of a workspace: a binary split TREE, the same
 * shape Blender (and every tiling editor) uses.
 *
 *   leaf  → one window fills the area
 *   split → two areas side by side (`row`) or stacked (`col`), `ratio` being the
 *           fraction the FIRST child takes
 *
 * A tree rather than a list of rectangles because splitting and joining are then
 * local edits — split a leaf into a split, join a split back into one of its
 * children — with no coordinate arithmetic to keep consistent, and the geometry
 * falls out of nested flex boxes at render time.
 */
export type Pane =
  | { kind: "leaf"; winId: string }
  | { kind: "split"; dir: "row" | "col"; ratio: number; a: Pane; b: Pane };

interface WorkspaceWindows {
  wins: Win[];
  activeId: string;
  /** the arrangement; absent in layouts saved before WIN5 → rebuilt as a leaf */
  layout?: Pane;
}

function seedWindows(preset: WorkspacePreset): WorkspaceWindows {
  const win: Win = {
    id: `${preset.id}:1`,
    type: preset.windowType,
    state:
      preset.windowType === "graph"
        ? { mode: preset.graphMode ?? "matrix" }
        : {},
  };
  return { wins: [win], activeId: win.id, layout: { kind: "leaf", winId: win.id } };
}

function seedRegistry(): Record<WorkspaceId, WorkspaceWindows> {
  const out = {} as Record<WorkspaceId, WorkspaceWindows>;
  for (const preset of WORKSPACES) out[preset.id] = seedWindows(preset);
  return out;
}

/** Restore the registry, falling back to the seed for anything malformed — a
 *  corrupted arrangement must never keep the app from opening. */
function loadRegistry(): Record<WorkspaceId, WorkspaceWindows> {
  const seeded = seedRegistry();
  try {
    const raw = localStorage.getItem(WINDOWS_KEY);
    if (!raw) return seeded;
    const parsed = JSON.parse(raw) as Partial<
      Record<WorkspaceId, WorkspaceWindows>
    >;
    for (const preset of WORKSPACES) {
      const entry = parsed[preset.id];
      if (!entry || !Array.isArray(entry.wins) || entry.wins.length === 0)
        continue;
      const wins = entry.wins.filter(
        (w) => w && typeof w.id === "string" && typeof w.type === "string",
      );
      if (!wins.length) continue;
      const restored: WorkspaceWindows = {
        wins: wins.map((w) => ({ ...w, state: w.state ?? {} })),
        activeId: wins.some((w) => w.id === entry.activeId)
          ? entry.activeId
          : wins[0].id,
      };
      // The tree is the authority on WHERE, the window list on WHAT: a restored
      // tree is pruned of ids that no longer exist and completed with windows it
      // never mentioned, so the two can never disagree after a bad save.
      restored.layout = repairLayout(entry.layout, restored.wins);
      seeded[preset.id] = restored;
    }
  } catch {
    /* storage disabled or corrupted → seeded arrangement */
  }
  return seeded;
}

const registry = loadRegistry();

function persistWindows(): void {
  try {
    localStorage.setItem(WINDOWS_KEY, JSON.stringify(registry));
  } catch {
    /* storage disabled */
  }
}

// ── WIN5 · tree helpers (pure: they answer questions / return new trees) ─────

/** Every window id the tree places, in left-to-right / top-to-bottom order. */
export function paneIds(p: Pane | undefined): string[] {
  if (!p) return [];
  return p.kind === "leaf" ? [p.winId] : [...paneIds(p.a), ...paneIds(p.b)];
}

/**
 * Make a tree that is guaranteed to place EXACTLY the given windows once each.
 *
 * Called on restore and after any window is added or closed. Windows the tree
 * forgot are appended as a split of the last leaf; ids it mentions that no
 * longer exist are pruned (a split with one dead child collapses into the
 * other). A corrupted arrangement therefore degrades to a usable one instead of
 * a blank screen.
 */
function repairLayout(p: Pane | undefined, wins: Win[]): Pane {
  const live = new Set(wins.map((w) => w.id));
  const prune = (n: Pane | undefined): Pane | null => {
    if (!n) return null;
    if (n.kind === "leaf") return live.has(n.winId) ? n : null;
    const a = prune(n.a);
    const b = prune(n.b);
    if (a && b) return { ...n, a, b };
    return a ?? b;
  };
  let tree = prune(p);
  const placed = new Set(paneIds(tree ?? undefined));
  for (const w of wins) {
    if (placed.has(w.id)) continue;
    const leaf: Pane = { kind: "leaf", winId: w.id };
    tree = tree ? { kind: "split", dir: "row", ratio: 0.5, a: tree, b: leaf } : leaf;
    placed.add(w.id);
  }
  return tree ?? { kind: "leaf", winId: wins[0].id };
}

/** Replace the leaf holding `winId` with `make(leaf)`. Returns a NEW tree. */
function mapLeaf(p: Pane, winId: string, make: (leaf: Pane) => Pane): Pane {
  if (p.kind === "leaf") return p.winId === winId ? make(p) : p;
  return { ...p, a: mapLeaf(p.a, winId, make), b: mapLeaf(p.b, winId, make) };
}

/** The arrangement of a workspace. */
export function layoutOf(ws: WorkspaceId = active): Pane {
  const entry = registry[ws];
  if (!entry.layout) entry.layout = repairLayout(undefined, entry.wins);
  return entry.layout;
}

/** True when the workspace shows more than one area. */
export function isTiled(ws: WorkspaceId = active): boolean {
  return layoutOf(ws).kind === "split";
}

/**
 * Split the area holding `winId` in two, putting a NEW window beside it, and
 * make the new one active. `dir: "row"` puts it to the right, `"col"` below.
 * The new window copies the type/state of the one it was split from — splitting
 * a DTC view to compare it with the matrix starts from what you were looking at.
 */
export function splitWindow(
  winId: string,
  dir: "row" | "col",
  ws: WorkspaceId = active,
): Win | null {
  const entry = registry[ws];
  const src = entry.wins.find((w) => w.id === winId);
  if (!src) return null;
  const clone = addWindow(src.type, { ...src.state }, ws); // appends + activates
  // `addWindow` gave the clone a home of its own (any window must have one);
  // here we want it in a SPECIFIC place, so prune that provisional leaf first —
  // otherwise the clone would be placed twice and the tree would out-count the
  // window list.
  const base = repairLayout(
    entry.layout,
    entry.wins.filter((w) => w.id !== clone.id),
  );
  entry.layout = mapLeaf(base, winId, (leaf) => ({
    kind: "split",
    dir,
    ratio: 0.5,
    a: leaf,
    b: { kind: "leaf", winId: clone.id },
  }));
  persistWindows();
  return clone;
}

/** True when this area sits inside a split — i.e. there is something to join. */
export function canJoin(winId: string, ws: WorkspaceId = active): boolean {
  const find = (p: Pane): boolean => {
    if (p.kind === "leaf") return false;
    if (paneIds(p.a).includes(winId) || paneIds(p.b).includes(winId)) {
      // only the split that DIRECTLY holds it as one of its two sides counts
      const direct =
        (p.a.kind === "leaf" && p.a.winId === winId) ||
        (p.b.kind === "leaf" && p.b.winId === winId);
      return direct || find(p.a) || find(p.b);
    }
    return false;
  };
  return find(layoutOf(ws));
}

/**
 * JOIN · this area absorbs its sibling — the split collapses and the space comes
 * back, the way dragging an area over its neighbour does in Blender.
 *
 * The sibling may be a whole sub-tree (an area that was itself split): every
 * window in it is closed, because after the join there is nowhere for them to
 * be. The area doing the joining always survives, so a workspace can never end
 * up with no window.
 */
export function joinWindow(winId: string, ws: WorkspaceId = active): boolean {
  const entry = registry[ws];
  if (!canJoin(winId, ws)) return false;
  let absorbed: string[] = [];
  const walk = (p: Pane): Pane => {
    if (p.kind === "leaf") return p;
    if (p.a.kind === "leaf" && p.a.winId === winId) {
      absorbed = paneIds(p.b);
      return p.a;
    }
    if (p.b.kind === "leaf" && p.b.winId === winId) {
      absorbed = paneIds(p.a);
      return p.b;
    }
    return { ...p, a: walk(p.a), b: walk(p.b) };
  };
  entry.layout = walk(layoutOf(ws));
  if (absorbed.length) {
    const gone = new Set(absorbed);
    entry.wins = entry.wins.filter((w) => !gone.has(w.id));
  }
  entry.activeId = winId; // you are working in the area that stayed
  entry.layout = repairLayout(entry.layout, entry.wins);
  persistWindows();
  return true;
}

/**
 * The windows on the OTHER side of the split that directly holds `winId` — the
 * ones a join would absorb. Empty when the area is not inside a split.
 *
 * Used by the corner gesture: dragging an area's corner onto a neighbour joins
 * them, and "is that neighbour actually my sibling?" is the question that
 * decides whether the gesture means anything.
 */
export function siblingIdsOf(winId: string, ws: WorkspaceId = active): string[] {
  const walk = (p: Pane): string[] | null => {
    if (p.kind === "leaf") return null;
    if (p.a.kind === "leaf" && p.a.winId === winId) return paneIds(p.b);
    if (p.b.kind === "leaf" && p.b.winId === winId) return paneIds(p.a);
    return walk(p.a) ?? walk(p.b);
  };
  return walk(layoutOf(ws)) ?? [];
}

/** Move the divider of the split that contains `winId` as its FIRST child. */
export function setSplitRatio(
  winId: string,
  ratio: number,
  ws: WorkspaceId = active,
): void {
  const clamp = Math.min(0.85, Math.max(0.15, ratio)); // never collapse an area
  const walk = (p: Pane): Pane => {
    if (p.kind === "leaf") return p;
    const firstIds = paneIds(p.a);
    if (firstIds.includes(winId) && paneIds(p.b).length >= 1 && firstIds.length === 1)
      return { ...p, ratio: clamp };
    return { ...p, a: walk(p.a), b: walk(p.b) };
  };
  registry[ws].layout = walk(layoutOf(ws));
  persistWindows();
}

/** Every window of a workspace, in creation order. */
export function windowsOf(ws: WorkspaceId = active): Win[] {
  return registry[ws].wins;
}

/** The window the workspace is currently showing. */
export function activeWin(ws: WorkspaceId = active): Win {
  const entry = registry[ws];
  return entry.wins.find((w) => w.id === entry.activeId) ?? entry.wins[0];
}

/** Show another window of the workspace. Returns it (unchanged if unknown). */
export function setActiveWin(winId: string, ws: WorkspaceId = active): Win {
  const entry = registry[ws];
  if (entry.wins.some((w) => w.id === winId)) {
    entry.activeId = winId;
    persistWindows();
  }
  return activeWin(ws);
}

/** Add a window to a workspace and make it active. Its id is stable across
 *  sessions (the workspace + a running number), so the persisted arrangement
 *  survives a reload. */
export function addWindow(
  type: WindowType,
  state: Record<string, unknown> = {},
  ws: WorkspaceId = active,
): Win {
  const entry = registry[ws];
  let n = entry.wins.length + 1;
  while (entry.wins.some((w) => w.id === `${ws}:${n}`)) n++;
  const win: Win = { id: `${ws}:${n}`, type, state };
  entry.wins.push(win);
  entry.activeId = win.id;
  // WIN5 · a window that exists must have somewhere to be: repair places it.
  entry.layout = repairLayout(entry.layout, entry.wins);
  persistWindows();
  return win;
}

/** Close a window. The last one of a workspace is never closed — a workspace
 *  with no window would have nothing to show and no way back. */
export function closeWindow(winId: string, ws: WorkspaceId = active): boolean {
  const entry = registry[ws];
  if (entry.wins.length < 2) return false;
  const i = entry.wins.findIndex((w) => w.id === winId);
  if (i < 0) return false;
  entry.wins.splice(i, 1);
  if (entry.activeId === winId)
    entry.activeId = entry.wins[Math.min(i, entry.wins.length - 1)].id;
  // WIN5 · closing an area JOINS its split: the sibling takes the space back.
  entry.layout = repairLayout(entry.layout, entry.wins);
  persistWindows();
  return true;
}

/** Transform a window IN PLACE: the same slot of the same workspace, a different
 *  editor. The workspace does NOT change — a Canvas workspace whose window was
 *  turned into a table is a legitimate arrangement, and jumping to another
 *  workspace instead would be a different gesture (that is the leader bar's). */
export function setWinType(win: Win, type: WindowType): void {
  if (win.type === type) return;
  win.type = type;
  // a graph window must always have a mode for the header to show
  if (type === "graph" && !win.state["mode"]) win.state["mode"] = "matrix";
  persistWindows();
}

/**
 * CURRENT-ELEMENT · the element a window is currently working ON — the chapter
 * in a Narrative window, the row in a Table window. (A Graph window already has
 * one: the canvas selection.)
 *
 * It lives on the WINDOW, next to the mode, because it is the same kind of fact:
 * two Narrative windows can sit on different chapters, and a menu item that acts
 * on "the current chapter" must mean the one in the window it was opened from.
 * UI state only — never em.json.
 */
export function winCurrent(win: Win, key: string): unknown {
  return win.state[`current.${key}`] ?? null;
}

export function setWinCurrent(win: Win, key: string, value: unknown): void {
  if (value == null) delete win.state[`current.${key}`];
  else win.state[`current.${key}`] = value;
  persistWindows();
}

/** The mode of a graph window (its canvas projection). */
export function winMode(win: Win): GraphMode {
  const m = win.state["mode"];
  return GRAPH_MODES.includes(m as GraphMode) ? (m as GraphMode) : "matrix";
}

/** Record a graph window's mode. Pure state — `main.ts` owns the mounting. */
export function setWinMode(win: Win, mode: GraphMode): void {
  if (win.type !== "graph" || winMode(win) === mode) return;
  win.state["mode"] = mode;
  persistWindows();
}

/** The window type the active workspace centres on — now the ACTIVE window's
 *  type, so a transformed window reports itself and not its preset. */
export function activeWindowTypeOf(ws: WorkspaceId = active): WindowType {
  return activeWin(ws).type;
}
