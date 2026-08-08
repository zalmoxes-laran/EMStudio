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
  /** for a graph preset, the graph sub-mode it opens in (WIN2 owns the rest). */
  graphMode?: "matrix" | "graph" | "dtc";
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

/** The window type the active workspace centres on. */
export function activeWindowType(): WindowType {
  return workspacePreset().windowType;
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
