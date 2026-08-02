// User preferences, persisted in localStorage. Kept small and
// forward-compatible — today it holds the live-sync target (ADR-002); more
// sections (appearance, layout defaults…) can slot in later.

export interface SyncSettings {
  /** ws (local/plain) or wss (TLS). A browser can only be a WS *client*. */
  protocol: "ws" | "wss";
  host: string;
  port: number;
  /** which tool hosts the session; only "blender" (EMtools) is wired today */
  tool: string;
}

export interface DeveloperSettings {
  /** show node UUIDs (inspector, …) — noise for most users, off by default */
  showNodeIds: boolean;
}

export interface InteractionSettings {
  /** show a tooltip when hovering a connector (edge); on by default */
  edgeTooltips: boolean;
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

export interface Settings {
  sync: SyncSettings;
  developer: DeveloperSettings;
  interaction: InteractionSettings;
  ai: AiSettings;
}

const KEY = "emstudio.settings";

const DEFAULTS: Settings = {
  sync: { protocol: "ws", host: "localhost", port: 8788, tool: "blender" },
  developer: { showNodeIds: false },
  interaction: { edgeTooltips: true },
  ai: { provider: "claude", model: "" },
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
