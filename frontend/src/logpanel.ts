/**
 * S6 — the Log / Warnings tab.
 *
 * Two things live here, because the author needs them in the same place:
 *
 *  1. **What is wrong with the document.** The connection-resolution arc made
 *     these signals meaningful — a node whose type nothing recognises, a group
 *     with no EM role, an edge that had to degrade to `generic_connection`.
 *     They are the working list an author corrects the graph from.
 *  2. **What the app has been doing.** A verbose trail of loads, layouts,
 *     exports and sync events, so an unexpected state has a history behind it
 *     instead of being a mystery.
 *
 * A note on where the diagnostics come from. In EMTools the warnings are
 * produced by the s3Dgraphy importer and read off `graph.warnings`. EMStudio
 * parses the em.json itself — there is no Python importer in the browser — and
 * the em.json format does not carry a warnings section. So the same families
 * are DERIVED here from the document. They are computed from the same facts
 * the importer looks at, and grouped the same way, so the two tools tell the
 * author the same story.
 */

import { GENERIC_EDGE, classOf } from "./rules";
import type { EmDocument } from "./types";

// ── activity log ──────────────────────────────────────────────────────────────

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  /** ms since the page loaded — a wall clock would be noise here. */
  at: number;
}

/** Ring buffer. A session can emit a lot of sync traffic; keeping the last few
 *  hundred entries is what a log is for, holding all of them is a leak. */
const MAX_ENTRIES = 500;
const entries: LogEntry[] = [];
let listener: (() => void) | null = null;

function push(level: LogLevel, message: string): void {
  entries.push({ level, message, at: Math.round(performance.now()) });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  listener?.();
}

export const logInfo = (m: string): void => push("info", m);
export const logWarn = (m: string): void => push("warn", m);
export const logError = (m: string): void => push("error", m);

export function logEntries(): readonly LogEntry[] {
  return entries;
}

export function clearLog(): void {
  entries.length = 0;
  listener?.();
}

/** Called whenever the log changes, so the panel can redraw if it is visible. */
export function onLogChange(fn: () => void): void {
  listener = fn;
}

// ── document diagnostics ──────────────────────────────────────────────────────

export interface DiagnosticGroup {
  key: string;
  label: string;
  messages: string[];
}

/** Node types that mean "this box carries no EM meaning". `Node` is the bare
 *  node the GraphML importer produces when a yEd shape matches nothing;
 *  `Group` is a box with no palette colour, hence no role. */
const UNTYPED_NODE_TYPE = "Node";
const ROLELESS_GROUP_TYPE = "Group";

function nameOf(id: string, name?: string): string {
  return name && name.trim() ? name.trim() : id;
}

/**
 * Derive the warning families from a loaded document.
 *
 * Nothing is guessed and nothing is corrected: this only reports what the
 * document itself says. Fixing it is the author's job, in the source graph.
 */
export function documentDiagnostics(doc: EmDocument | null): DiagnosticGroup[] {
  if (!doc?.graph) return [];
  const untyped: string[] = [];
  const unknown: string[] = [];
  const roleless: string[] = [];

  for (const n of doc.graph.nodes ?? []) {
    const t = n.node_type;
    if (!t || t === UNTYPED_NODE_TYPE) {
      untyped.push(
        `${nameOf(n.id, n.name)} — no recognised EM type; it and its ` +
          `connections stay untyped`,
      );
    } else if (t === ROLELESS_GROUP_TYPE) {
      roleless.push(
        `${nameOf(n.id, n.name)} — group with no EM role (no palette ` +
          `colour): kept as an organisational box`,
      );
    } else if (classOf(t) === UNTYPED_NODE_TYPE) {
      // The document declares a type this build's datamodel has never heard
      // of. That is a version gap, not an authoring mistake — say so.
      unknown.push(
        `${nameOf(n.id, n.name)} — node_type "${t}" is not in this build's ` +
          `datamodel; it renders untyped`,
      );
    }
  }

  const degraded: string[] = [];
  const byId = new Map((doc.graph.nodes ?? []).map((n) => [n.id, n]));
  for (const e of doc.graph.edges ?? []) {
    if (e.edge_type !== GENERIC_EDGE) continue;
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    degraded.push(
      `${nameOf(e.source, s?.name)} → ${nameOf(e.target, t?.name)} — ` +
        `degraded to ${GENERIC_EDGE}`,
    );
  }

  const groups: DiagnosticGroup[] = [
    { key: "untyped_node", label: "Nodes with no recognised EM type", messages: untyped },
    { key: "unclassified_group", label: "Groups with no EM role", messages: roleless },
    { key: "degraded_edge", label: "Connections degraded to generic_connection", messages: degraded },
    { key: "unknown_node_type", label: "Node types this build does not know", messages: unknown },
  ].filter((g) => g.messages.length > 0);

  // Biggest problem first; ties keep declaration order so the panel does not
  // reshuffle between two loads of the same document.
  groups.sort((a, b) => b.messages.length - a.messages.length);
  return groups;
}

// ── version banner ────────────────────────────────────────────────────────────

/**
 * Which language version am I working with? Two versions are always in play:
 * the one the DOCUMENT declares, and the one this build READS with. Fields the
 * document does not declare are left out rather than shown empty — an absence
 * is information (a legacy file), not a blank to fill.
 */
export function versionBanner(doc: EmDocument | null): string {
  const parts: string[] = [];
  const header = (doc?.header ?? {}) as Record<string, unknown>;
  const schema = header["schema_version"];
  if (schema !== undefined && schema !== null && schema !== "")
    parts.push(`em.json schema ${String(schema)}`);
  const fmt = header["version"];
  if (fmt) parts.push(`format ${String(fmt)}`);
  const dm = header["datamodel_versions"] as Record<string, unknown> | undefined;
  if (dm?.["nodes"]) parts.push(`EM ${String(dm["nodes"])} (file)`);
  const sg = header["stratigraph_version"];
  if (sg) parts.push(`StratiGraph ${String(sg)}`);
  return parts.join(" · ");
}

// ── rendering ─────────────────────────────────────────────────────────────────

/** How many lines a family shows before collapsing. The point is that the
 *  author recognises the PROBLEM; the exhaustive list is one click away. */
const MAX_PER_GROUP = 10;

const LEVEL_MARK: Record<LogLevel, string> = {
  info: "·",
  warn: "!",
  error: "×",
};

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Groups the panel currently has expanded, kept across redraws so a redraw
 *  (a sync event, a new log line) does not collapse what the author opened. */
const expanded = new Set<string>();

export function renderLogPanel(
  container: HTMLElement,
  doc: EmDocument | null,
  readWithVersion: string,
): void {
  container.textContent = "";

  // — version banner —
  const banner = el("div", "log-banner");
  const declared = versionBanner(doc);
  banner.textContent = declared
    ? `${declared} — read with EM ${readWithVersion}`
    : `no version declared — read with EM ${readWithVersion}`;
  container.appendChild(banner);

  // — diagnostics —
  const groups = documentDiagnostics(doc);
  const diagHead = el("div", "log-section", groups.length
    ? `Document warnings (${groups.reduce((n, g) => n + g.messages.length, 0)})`
    : "Document warnings (0)");
  container.appendChild(diagHead);

  if (!groups.length) {
    container.appendChild(
      el("div", "log-empty", doc ? "Nothing left unresolved." : "No document loaded."),
    );
  }

  for (const g of groups) {
    const box = el("div", "log-group");
    const head = el("button", "log-group-head");
    const open = expanded.has(g.key);
    head.textContent = `${open ? "▾" : "▸"} ${g.label} (${g.messages.length})`;
    head.addEventListener("click", () => {
      if (expanded.has(g.key)) expanded.delete(g.key);
      else expanded.add(g.key);
      renderLogPanel(container, doc, readWithVersion);
    });
    box.appendChild(head);
    if (open) {
      const list = el("ul", "log-list");
      for (const m of g.messages.slice(0, MAX_PER_GROUP)) {
        list.appendChild(el("li", undefined, m));
      }
      const hidden = g.messages.length - MAX_PER_GROUP;
      if (hidden > 0) {
        // Never let a cap read as "that was all of them".
        list.appendChild(
          el("li", "log-more", `… and ${hidden} more of the same`),
        );
      }
      box.appendChild(list);
    }
    container.appendChild(box);
  }

  // — activity —
  const actHead = el("div", "log-section", `Activity (${entries.length})`);
  const clear = el("button", "log-clear", "clear");
  clear.addEventListener("click", () => clearLog());
  actHead.appendChild(clear);
  container.appendChild(actHead);

  const log = el("ul", "log-list log-activity");
  // Newest first: the thing that just happened is the thing being looked for.
  for (const e of [...entries].reverse()) {
    const li = el("li", `log-${e.level}`);
    li.textContent = `${LEVEL_MARK[e.level]} ${e.message}`;
    log.appendChild(li);
  }
  container.appendChild(log);
}
