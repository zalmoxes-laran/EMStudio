// User preferences, persisted in localStorage. Kept small and
// forward-compatible — today it holds the live-sync target (ADR-002); more
// sections (appearance, layout defaults…) can slot in later.

import type { SyncDirection } from "./sync";

export interface SyncSettings {
  /** ws (local/plain) or wss (TLS). A browser can only be a WS *client*. */
  protocol: "ws" | "wss";
  host: string;
  port: number;
  /** which tool hosts the session; only "blender" (EMtools) is wired today */
  tool: string;
  /**
   * MODES1 · what this client does on the live channel: `off` | `send` |
   * `receive` | `both`. Persisted per user/browser, because it is a working
   * arrangement ("today I am alone on two screens", "today somebody else is in
   * Blender") and re-choosing it at every reload would make it a nuisance
   * instead of a control.
   *
   * `both` is the default because it IS the behaviour that existed before this
   * control did: nothing changes for anyone until they choose.
   */
  direction: SyncDirection;
  /** P4.3 · the em-server whose rooms this client can join. Configuration, not
   *  a secret: the URL and the room name are what you would write on a
   *  whiteboard. The TOKEN is not here on purpose — it lives in memory for the
   *  session, because a token on disk outlives the reason it was issued. */
  hubUrl: string;
  hubRoom: string;
}

export interface DeveloperSettings {
  /** show node UUIDs (inspector, …) — noise for most users, off by default */
  showNodeIds: boolean;
}

export interface InteractionSettings {
  /** show a tooltip when hovering a connector (edge); on by default */
  edgeTooltips: boolean;
  /**
   * Documents must be named `D.<n>` (NAME1). ON by default, and relaxing it is
   * discouraged rather than forbidden.
   *
   * The reason it is a setting at all: an extractor's name derives from its
   * document's (`D.10` → `D.10.1`), so a free-form document name still works —
   * it just stops being readable as a reference. Off, a document is only
   * required to be unique and non-empty; duplicates and empties stay errors
   * either way.
   */
  strictDocumentNames: boolean;
}

/**
 * Which model writes an AI draft (N8).
 *
 * Note what is NOT here: the API key. Everything in this interface is persisted
 * to localStorage, and a credential in localStorage is a credential in every
 * script that runs on the page. The key lives in the OS keychain and is reached
 * through the desktop shell (`tauri.ts`), never through Settings.
 */
export interface AiSettings {
  /** provider id understood by em-bridge's registry (`claude`, `echo`, …) */
  provider: string;
  /** optional model override; empty = the provider's own default */
  model: string;
}

/**
 * Where the 3D lives (N9/N10).
 *
 * EMStudio does not embed a 3D engine and is not going to: the scenes are
 * ATON's, and Heriverse is the ATON web-app that reads this very graph. So the
 * only thing we need to know is the address of the server, and the reference —
 * a scene id, or a resource — comes from the graph. Empty `atonBase` means "not
 * configured", and an epoch3d embed then says so instead of failing silently.
 */
export interface ViewerSettings {
  /** ATON server root, e.g. `https://localhost:8083`. Empty = unconfigured. */
  atonBase: string;
  /** Where the Heriverse wapp is mounted under it (ATON wapps live at /a/…). */
  heriverseApp: string;
}

export interface Settings {
  sync: SyncSettings;
  developer: DeveloperSettings;
  interaction: InteractionSettings;
  ai: AiSettings;
  viewer: ViewerSettings;
}

const KEY = "emstudio.settings";

const DEFAULTS: Settings = {
  sync: { protocol: "ws", host: "localhost", port: 8788, tool: "blender",
          direction: "both", hubUrl: "", hubRoom: "" },
  developer: { showNodeIds: false },
  interaction: { edgeTooltips: true, strictDocumentNames: true },
  ai: { provider: "claude", model: "" },
  // No default host on purpose: a wrong one would look like a broken viewer.
  // The Heriverse deployment guide mounts the wapp at /a/heriverse.
  viewer: { atonBase: "", heriverseApp: "a/heriverse" },
};

/** Providers em-bridge registers (`tools/llm_provider.py`). `echo` is a real
 *  provider, not a mock: deterministic, keyless, and enough to exercise the
 *  whole generate → attribute → validate path without a network call. */
export const AI_PROVIDERS: { value: string; label: string }[] = [
  { value: "claude", label: "Claude (Anthropic)" },
  { value: "echo", label: "Echo — prova locale, senza key" },
];

/** Sync targets. `enabled:false` entries render disabled — the host role is a
 *  role (ADR-002 §1); more hosts (EMStudio-desktop, StratiGraph Service) land
 *  later without a protocol change. */
export const SYNC_TOOLS: { value: string; label: string; enabled: boolean }[] =
  [
    { value: "blender", label: "Blender · EMtools", enabled: true },
    { value: "desktop", label: "EMStudio Desktop (soon)", enabled: false },
    { value: "server", label: "StratiGraph Service (soon)", enabled: false },
  ];

function clone(s: Settings): Settings {
  return {
    sync: { ...s.sync },
    developer: { ...s.developer },
    interaction: { ...s.interaction },
    ai: { ...s.ai },
    viewer: { ...s.viewer },
  };
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULTS);
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // merge onto defaults so a missing/renamed field never breaks startup
    return {
      sync: { ...DEFAULTS.sync, ...(parsed.sync ?? {}) },
      developer: { ...DEFAULTS.developer, ...(parsed.developer ?? {}) },
      interaction: { ...DEFAULTS.interaction, ...(parsed.interaction ?? {}) },
      ai: { ...DEFAULTS.ai, ...(parsed.ai ?? {}) },
      viewer: { ...DEFAULTS.viewer, ...(parsed.viewer ?? {}) },
    };
  } catch {
    return clone(DEFAULTS);
  }
}

let current: Settings = load();

export function getSettings(): Settings {
  return clone(current);
}

export function saveSettings(next: Settings): void {
  current = clone(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore quota / private-mode security errors */
  }
}

/** The live-sync endpoint from the current settings, e.g. ws://localhost:8788 */
export function getSyncUrl(): string {
  const s = current.sync;
  return `${s.protocol}://${s.host}:${s.port}`;
}

/** ATON root with no trailing slash, or "" when unconfigured. */
export function atonBase(): string {
  return current.viewer.atonBase.trim().replace(/\/+$/, "");
}

/** URL of a Heriverse SCENE — the app that reads an EM graph in 3D. */
export function heriverseSceneUrl(sceneId: string): string | null {
  const root = atonBase();
  if (!root || !sceneId) return null;
  const app = current.viewer.heriverseApp.trim().replace(/^\/+|\/+$/g, "");
  return `${root}/${app || "a/heriverse"}/?scene=${encodeURIComponent(sceneId)}`;
}

/** URL of ATON's single-item preview app for one 3D model (`?i=`). Accepts an
 *  absolute URL or a path relative to the ATON collection — ATON's own
 *  `resolveCollectionURL` handles both. */
export function atonPreviewUrl(item: string): string | null {
  const root = atonBase();
  if (!root || !item) return null;
  return `${root}/preview/?i=${encodeURIComponent(item)}`;
}
