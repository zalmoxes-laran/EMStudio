/**
 * QOL1 · recent files — the last em.json / .emj documents opened.
 *
 * Persisted in localStorage (browser) so the list survives a reload; on the
 * Tauri desktop the same store works and a path lets a click reopen the file.
 * A browser drop has no path (the sandbox forbids reopening a file by path), so
 * such entries are listed for memory but cannot be reopened — the caller says
 * so honestly rather than silently failing.
 *
 * Dedup by path (or name when there is no path), newest first, capped.
 */
export interface RecentFile {
  /** Absolute path (desktop) or null (browser drop — not reopenable). */
  path: string | null;
  /** Display name (file basename). */
  name: string;
  /** Epoch ms of the last open. */
  ts: number;
}

const KEY = "em.recentFiles";
const CAP = 10;

function read(): RecentFile[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (r): r is RecentFile =>
        !!r && typeof (r as RecentFile).name === "string",
    );
  } catch {
    return [];
  }
}

function write(list: RecentFile[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, CAP)));
  } catch {
    /* storage disabled / full — recents are a convenience, never fatal */
  }
}

/** The recent files, newest first. */
export function getRecents(): RecentFile[] {
  return read().sort((a, b) => b.ts - a.ts);
}

/** Record an open. Dedups by path (or name when path-less), keeps newest, caps.
 *  `ts` is passed in so the module stays free of ambient Date for tests. */
export function addRecent(
  entry: { path: string | null; name: string },
  ts: number,
): void {
  const key = (r: { path: string | null; name: string }): string =>
    r.path ? `p:${r.path}` : `n:${r.name}`;
  const k = key(entry);
  const rest = read().filter((r) => key(r) !== k);
  write([{ path: entry.path, name: entry.name, ts }, ...rest]);
}

/** Drop an entry (e.g. a desktop path that no longer exists). */
export function removeRecent(pathOrName: string): void {
  write(read().filter((r) => (r.path ?? r.name) !== pathOrName));
}

/** Clear the whole list. */
export function clearRecents(): void {
  write([]);
}
