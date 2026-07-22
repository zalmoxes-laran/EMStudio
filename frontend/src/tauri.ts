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

/** Basename of an absolute path, for the window title / info bar. */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
