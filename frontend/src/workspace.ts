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

/** The fixed workspace presets in the leader bar. */
export type WorkspaceId = "canvas" | "narrative" | "table" | "dtc";

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

export const WORKSPACES: WorkspacePreset[] = [
  { id: "canvas", labelKey: "ws.canvas", icon: "▦", windowType: "graph", graphMode: "matrix" },
  { id: "narrative", labelKey: "ws.narrative", icon: "❧", windowType: "narrative" },
  { id: "table", labelKey: "ws.table", icon: "▤", windowType: "table" },
  { id: "dtc", labelKey: "ws.dtc", icon: "◈", windowType: "graph", graphMode: "dtc" },
];

/** Per-window-TYPE display metadata for the window header + transform dropdown
 *  (WIN1 checkpoint 2). DTC is a mode of the graph window, so it is not a
 *  transform target here — it is reached via the DTC workspace preset. */
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

interface WorkspaceWindows {
  wins: Win[];
  activeId: string;
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
  return { wins: [win], activeId: win.id };
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
      seeded[preset.id] = {
        wins: wins.map((w) => ({ ...w, state: w.state ?? {} })),
        activeId: wins.some((w) => w.id === entry.activeId)
          ? entry.activeId
          : wins[0].id,
      };
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

/** The mode of a graph window (its canvas projection). */
export function winMode(win: Win): GraphMode {
  const m = win.state["mode"];
  return m === "graph" || m === "dtc" || m === "matrix" ? m : "matrix";
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
