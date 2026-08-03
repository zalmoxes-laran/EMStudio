// Native desktop file I/O, active only inside the Tauri shell
// (apps/desktop). In a plain browser `isTauri()` is false and every helper
// is a no-op / returns null, so main.ts falls back to the browser
// download + <input type=file> paths. Keeps all Tauri specifics in one
// place; nothing here executes at import time, so bundling into the
// browser single-file build is harmless.
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

const EM_FILTERS = [
  { name: "Extended Matrix", extensions: ["em.json", "json"] },
];

const GRAPHML_FILTERS = [
  { name: "yEd GraphML", extensions: ["graphml", "xml"] },
];

const TTL_FILTERS = [
  { name: "RDF Turtle", extensions: ["ttl"] },
];

/** True when running inside the Tauri webview (desktop app). */
export function isTauri(): boolean {
  return typeof (window as unknown as Record<string, unknown>)
    .__TAURI_INTERNALS__ !== "undefined";
}

/** Native "Open…" dialog → the picked file's absolute path + contents. */
export async function openEmJson(): Promise<
  { path: string; text: string } | null
> {
  const picked = await open({ multiple: false, filters: EM_FILTERS });
  const path = Array.isArray(picked) ? picked[0] : picked;
  if (!path || typeof path !== "string") return null;
  const text = await readTextFile(path);
  return { path, text };
}

/** Overwrite an already-known file in place. */
export async function writeEmJson(path: string, text: string): Promise<void> {
  await writeTextFile(path, text);
}

/** Native "Save As…" dialog → the chosen path (already written), or null. */
export async function saveAsEmJson(
  text: string,
  defaultName: string,
): Promise<string | null> {
  const path = await save({ defaultPath: defaultName, filters: EM_FILTERS });
  if (!path) return null;
  await writeTextFile(path, text);
  return path;
}

/** Native "Open…" dialog for a .graphml file → picked path + contents. */
export async function openGraphml(): Promise<
  { path: string; text: string } | null
> {
  const picked = await open({ multiple: false, filters: GRAPHML_FILTERS });
  const path = Array.isArray(picked) ? picked[0] : picked;
  if (!path || typeof path !== "string") return null;
  const text = await readTextFile(path);
  return { path, text };
}

/** Native "Save As…" dialog for GraphML → the chosen path (already written),
 *  or null if cancelled. */
export async function saveGraphml(
  text: string,
  defaultName: string,
): Promise<string | null> {
  const path = await save({ defaultPath: defaultName, filters: GRAPHML_FILTERS });
  if (!path) return null;
  await writeTextFile(path, text);
  return path;
}

/** Native "Save As…" dialog for a .ttl file → the chosen path (already
 *  written), or null if cancelled. */
export async function saveTtl(
  text: string,
  defaultName: string,
): Promise<string | null> {
  const path = await save({ defaultPath: defaultName, filters: TTL_FILTERS });
  if (!path) return null;
  await writeTextFile(path, text);
  return path;
}

/** Set the OS window title (dirty-state indicator lives here on desktop). */
export async function setWindowTitle(title: string): Promise<void> {
  try {
    await getCurrentWindow().setTitle(title);
  } catch {
    /* not in Tauri, or title API unavailable — ignore */
  }
}

/**
 * Base URL of the GraphML transformer service (s3Dgraphy) the desktop app
 * should use. The Rust shell resolves it: a remote StratiGraph server if
 * `EM_TRANSFORMER_URL` is set, else the locally-spawned `em-bridge` sidecar.
 * Returns null in a plain browser (main.ts falls back to its own default).
 */
export async function transformerUrl(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string>("transformer_url");
  } catch {
    return null;
  }
}

// ── the LLM API key (N8) ─────────────────────────────────────────────────────
//
// Three calls, and note what is missing: there is no `getLlmKey`. The webview
// can set the key, clear it, and ask whether one exists — it can never read it
// back. That asymmetry is the whole design: the key lives in the OS keychain,
// the Rust shell injects it into em-bridge's environment, and nothing that runs
// in a browser context ever holds it. Which also means it cannot leak into
// em.json, localStorage, or a console log, because it is never there to leak.

/** What the UI may know about the key: never the key itself. */
export interface KeyStatus {
  /** a credential store answered */
  available: boolean;
  /** …and it holds a non-empty key */
  set: boolean;
  /** why not, when `available` is false — shown verbatim */
  detail: string;
}

/**
 * Is an API key stored in the OS keychain?
 *
 * Two flags, not one, because the failures are different. On Linux the Secret
 * Service is a running daemon, not a guarantee — a headless box or a locked
 * keyring means "no store here". Reporting that as `set: false` would tell the
 * user they have no key saved when this machine simply cannot save one, and
 * they would paste it again, and again.
 */
export async function llmKeyStatus(): Promise<KeyStatus> {
  if (!isTauri())
    return { available: false, set: false, detail: "browser" };
  try {
    return await invoke<KeyStatus>("llm_key_status");
  } catch (e) {
    return {
      available: false,
      set: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Store the key in the OS keychain and restart the bridge so it takes effect.
 *  Returns an error message, or null on success. */
export async function setLlmKey(key: string): Promise<string | null> {
  if (!isTauri()) return "no secure storage outside the desktop app";
  try {
    await invoke<boolean>("set_llm_key", { key });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export async function clearLlmKey(): Promise<string | null> {
  if (!isTauri()) return "no secure storage outside the desktop app";
  try {
    await invoke<boolean>("clear_llm_key");
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Subscribe to the shell's "the bridge on :8765 is not mine" warning (K1).
 *
 * The desktop shell spawns the sidecar with the keychain key in its environment.
 * When the port is ALREADY taken — almost always a `./dev.sh` bridge left running —
 * the app cannot inject anything into that process, so GraphML keeps working while
 * generation answers "no API key". That combination is impossible to diagnose from
 * the UI, so the shell says it out loud and this hands it to the user.
 *
 * A no-op in the browser: there is no shell to hear it from.
 */
export async function onForeignBridge(
  handler: (message: string) => void,
): Promise<void> {
  if (!isTauri()) return;
  try {
    const { listen } = await import("@tauri-apps/api/event");
    await listen<string>("bridge-foreign", (event) => handler(String(event.payload)));
  } catch {
    // The event API is unavailable (an old shell): the shell's stderr line stays
    // the record. Not worth failing the app's boot over.
  }
}

/** Basename of an absolute path, for the window title / info bar. */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
