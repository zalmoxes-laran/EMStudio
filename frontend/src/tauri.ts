// Native desktop file I/O, active only inside the Tauri shell
// (apps/desktop). In a plain browser `isTauri()` is false and every helper
// is a no-op / returns null, so main.ts falls back to the browser
// download + <input type=file> paths. Keeps all Tauri specifics in one
// place; nothing here executes at import time, so bundling into the
// browser single-file build is harmless.
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";

const EM_FILTERS = [
  { name: "Extended Matrix", extensions: ["em.json", "json"] },
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

/** Set the OS window title (dirty-state indicator lives here on desktop). */
export async function setWindowTitle(title: string): Promise<void> {
  try {
    await getCurrentWindow().setTitle(title);
  } catch {
    /* not in Tauri, or title API unavailable — ignore */
  }
}

/** Basename of an absolute path, for the window title / info bar. */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
