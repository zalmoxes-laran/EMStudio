// EM-Data table renderer (DP-81). Draws the tabular VIEW built by em-data.ts and
// wires cell edits back through the DocumentStore (same mutation path as the
// Inspector). It owns NO data — every render rebuilds from the store, so it
// stays in sync with the canvas both ways.
//
// WIN6-RESIDUAL · the DOCK IS GONE. This started life as a full-width strip
// below the side wings, collapsible and resizable; WIN5 gave the same renderer a
// host registry so the Tabular WINDOW could show it too, and from that moment
// there were two homes for one table — two places to look, two states to keep in
// step, and a strip eating the bottom of a canvas that the tiling can already
// divide however you like. The window is the home now: `Tabular` in the leader,
// or transform any area into one. What the dock owned and the module kept is the
// SHEET CHOICE (persisted), which was never the dock's to begin with.

import type { DocumentStore } from "./model";
import {
  addQualiaClaim,
  addRow,
  applyEdit,
  buildTable,
  deleteRow,
  type Column,
  type SheetKey,
  type VolatileProvider,
} from "./em-data";

let getStore: () => DocumentStore | null = () => null;
let currentSheet: SheetKey = "US";
let volatileProvider: VolatileProvider = () => false;

const LS_SHEET = "emdata.sheet";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

/** AUX2 sets the single source of truth for "is this node volatile?"; the same
 *  predicate the canvas renderer uses, so table and graph never disagree. */
export function setVolatileProvider(fn: VolatileProvider): void {
  volatileProvider = fn;
}

// CURRENT-ELEMENT · the row this window is working on. The table VIEW does not
// own it — the window does (workspace.ts) — so the dock asks for it and reports
// clicks, exactly like the narrative does for its chapter.
let currentRowOf: () => string | null = () => null;
let setCurrentRow: (id: string | null) => void = () => {};

/**
 * WIN5 · where a table is drawn. EM-Data used to be one dock with hardcoded
 * ids; a Table WINDOW needs the same table in its own area, so the renderer
 * takes a HOST and every host registers itself. One renderer, many mounts — the
 * dock and the window can never drift into two different tables.
 */
export interface EmDataHost {
  body: HTMLElement;
  count?: HTMLElement | null;
  actions?: HTMLElement | null;
  /** false while the host is hidden (a collapsed dock, a window not shown) */
  enabled: () => boolean;
}

const hosts: EmDataHost[] = [];

export function addEmDataHost(host: EmDataHost): void {
  hosts.push(host);
  renderEmData();
}

/**
 * Unregister a host. Callers that create hosts for a transient area (the tiled
 * secondary areas) must call this when the area goes, or the registry grows by
 * one on every split.
 *
 * WIN-FIX1 · this used to be an implicit sweep inside `addEmDataHost`, dropping
 * every host whose body was not `isConnected`. That reasoning had a hole big
 * enough to lose the table through: `renderTiles` DETACHES the live area before
 * rebuilding the tree, so a secondary host registering during that rebuild found
 * the FOCUSED window's body disconnected and pruned it — permanently. The
 * symptom was the one E.D. reported: move the mouse into the Tabular window and
 * its contents vanish, because the window it had just become the focused one of
 * no longer had a mount. Ownership is explicit now; nothing is inferred from a
 * DOM state that is legitimately temporary.
 */
export function removeEmDataHost(host: EmDataHost): void {
  const i = hosts.indexOf(host);
  if (i >= 0) hosts.splice(i, 1);
}

/**
 * HDR1 · the Tabular window's own full search — a plain substring over every
 * cell of the current sheet, applied at render.
 *
 * Filtering the ROWS rather than highlighting them, because a table read with
 * its non-matching rows still in place answers no question: you search a table
 * to get the handful that match. One filter for the whole app, like the sheet —
 * the Tabular windows are views of the same table, not different tables.
 */
let rowFilter = "";

export function emDataFilter(): string {
  return rowFilter;
}

/** Add a row to the sheet on screen — the `Righe ▸` menu's own path, now that
 *  the head has no buttons. Returns the new node id, or null. */
export function addEmDataRow(store: DocumentStore): string | null {
  const id = addRow(store, currentSheet);
  if (id) renderEmData();
  return id;
}

/** Open/close the claim form of the Claims sheet (the sheet's one special
 *  gesture: a claim is not a row you fill in cell by cell). */
export function toggleEmDataClaimForm(store: DocumentStore): boolean {
  if (currentSheet !== "Claims") return false;
  toggleClaimForm(store);
  return true;
}

export function setEmDataFilter(q: string): void {
  if (q === rowFilter) return;
  rowFilter = q;
  renderEmData();
}

/** The sheet every host shows. One choice for the whole app: the dock and the
 *  Table window are two views of the same table, not two tables. */
export function currentSheetKey(): SheetKey {
  return currentSheet;
}

export function setSheet(key: SheetKey): void {
  currentSheet = key;
  localStorage.setItem(LS_SHEET, key);
  renderEmData();
}

export function initEmData(opts: {
  getStore: () => DocumentStore | null;
  currentRow?: () => string | null;
  setCurrentRow?: (id: string | null) => void;
}): void {
  getStore = opts.getStore;
  if (opts.currentRow) currentRowOf = opts.currentRow;
  if (opts.setCurrentRow) setCurrentRow = opts.setCurrentRow;
  // The sheet the session was left on. The only piece of the retired dock's
  // state that was ever about the TABLE rather than about the strip.
  currentSheet = (localStorage.getItem(LS_SHEET) as SheetKey) || "US";
  renderEmData();
}

/** Rebuild the visible table from the store. Called on every store change and
 *  on sheet switch. Cheap: a few hundred rows of plain DOM. */
export function renderEmData(): void {
  for (const h of hosts) if (h.enabled()) renderEmDataInto(h);
}

/** Draw the current sheet into one host. */
function renderEmDataInto(host: EmDataHost): void {
  const body = host.body;
  const countEl = host.count;
  const actions = host.actions;

  const store = getStore();
  if (!store) {
    body.innerHTML = `<div class="emdata-empty">Open or create an .em.json to see its tables.</div>`;
    if (countEl) countEl.textContent = "";
    if (actions) actions.innerHTML = "";
    return;
  }

  const table = buildTable(store, currentSheet, volatileProvider);
  // HDR1 · the window's search, applied here so every mount agrees on what is
  // showing. Matched against the row's OWN id plus every cell, because the id is
  // what you usually have in hand ("US.101") and it is not always a column.
  const q = rowFilter.trim().toLowerCase();
  const all = table.rows;
  const rows = q
    ? all.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          Object.values(r.cells).some((v) => String(v ?? "").toLowerCase().includes(q)),
      )
    : all;
  if (countEl)
    countEl.textContent = q
      ? `${rows.length} / ${all.length} rows`
      : `${all.length} rows`;

  // FOCUS-NOJITTER · NO buttons in the head any more. `+ row` and `+ claim` were
  // rendered only into the FOCUSED window's head, so entering and leaving a
  // Tabular window made a button appear and disappear and stepped the rows —
  // and both duplicated the header's own `Righe ▸` menu, which is where a
  // command on this window belongs (MENU-AUDIT). The head now holds one thing,
  // the row count, and it is the same thing whether the window has the focus.
  if (actions) actions.innerHTML = "";

  const claimForm =
    currentSheet === "Claims" ? '<div id="emdata-claimform-slot"></div>' : "";

  const head = `<tr>${table.columns
    .map((c) => `<th>${c.label}</th>`)
    .join("")}<th></th></tr>`;

  const rowsHtml = rows
    .map((row) => {
      const cells = table.columns
        .map((col) => renderCell(col, row.id, row.cells[col.key] ?? ""))
        .join("");
      const del = `<td class="emdata-rowop"><button data-del="${escapeAttr(
        row.id,
      )}" title="Delete this node">✕</button></td>`;
      const cur = row.id === currentRowOf() ? " emdata-current" : "";
      return `<tr class="${row.volatile ? "emdata-vol" : ""}${cur}" data-row="${escapeAttr(
        row.id,
      )}">${cells}${del}</tr>`;
    })
    .join("");

  body.innerHTML =
    claimForm +
    `<table class="emdata-table"><thead>${head}</thead><tbody>${rowsHtml}</tbody></table>`;

  // wire cell editors
  body.querySelectorAll<HTMLElement>("[data-edit]").forEach((el) => {
    const rowId = el.getAttribute("data-row")!;
    const colKey = el.getAttribute("data-col")!;
    const commit = () => {
      const value = (el as HTMLInputElement | HTMLSelectElement).value;
      applyEdit(store, currentSheet, rowId, colKey, value);
      // store.emit re-renders via main's onChange; select edits benefit from an
      // immediate refresh so dependent columns update.
    };
    if (el.tagName === "SELECT") el.addEventListener("change", commit);
    else {
      el.addEventListener("change", commit);
      el.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Enter")
          (el as HTMLInputElement).blur();
      });
    }
  });

  // wire delete buttons
  // clicking a row makes it current (the ✕ and the cell editors stop the event
  // themselves, so editing a cell does not fight with selecting the row)
  body.querySelectorAll<HTMLTableRowElement>("tr[data-row]").forEach((tr) => {
    tr.addEventListener("mousedown", () => {
      setCurrentRow(tr.getAttribute("data-row"));
      body.querySelectorAll("tr.emdata-current").forEach((r) =>
        r.classList.remove("emdata-current"),
      );
      tr.classList.add("emdata-current");
    });
  });
  body.querySelectorAll<HTMLButtonElement>("[data-del]").forEach((btn) => {
    btn.onclick = () => {
      deleteRow(store, btn.getAttribute("data-del")!);
    };
  });
}

function renderCell(col: Column, rowId: string, value: string): string {
  const e = col.editor;
  const common = `data-edit data-row="${escapeAttr(rowId)}" data-col="${escapeAttr(
    col.key,
  )}"`;
  if (e.kind === "readonly")
    return `<td class="emdata-ro">${escapeHtml(value)}</td>`;
  if (e.kind === "select") {
    const opts = e.options
      .map(
        (o) =>
          `<option value="${escapeAttr(o.value)}"${
            o.value === value ? " selected" : ""
          }>${escapeHtml(o.label)}</option>`,
      )
      .join("");
    return `<td><select ${common}>${opts}</select></td>`;
  }
  const type = e.kind === "number" ? "number" : e.kind === "color" ? "text" : "text";
  return `<td><input ${common} type="${type}" value="${escapeAttr(value)}" /></td>`;
}

// ── add-claim affordance (Claims sheet) ─────────────────────────────────────
function toggleClaimForm(store: DocumentStore): void {
  const slot = $("emdata-claimform-slot");
  if (!slot) return;
  if (slot.firstChild) {
    slot.innerHTML = "";
    return;
  }
  const units = store.doc.graph.nodes.filter(
    (n) =>
      n.node_type &&
      (n.node_type === "EpochNode" ||
        n.node_type === "epoch" ||
        /^(US|USV|USD|USN|SF|SE|VSF|RSF|UL|BR|ser)/.test(n.node_type)),
  );
  const opts = units
    .map(
      (u) =>
        `<option value="${escapeAttr(u.id)}">${escapeHtml(
          String(u.name ?? u.id),
        )}</option>`,
    )
    .join("");
  slot.innerHTML = `<div class="emdata-claimform">
    <label>Target <select id="cf-target">${opts}</select></label>
    <label>Property <input id="cf-prop" placeholder="e.g. height" /></label>
    <label>Value <input id="cf-value" placeholder="e.g. 3.2" /></label>
    <button id="cf-add">Add claim</button>
  </div>`;
  ($("cf-add") as HTMLButtonElement).onclick = () => {
    const target = ($("cf-target") as HTMLSelectElement)?.value;
    const prop = ($("cf-prop") as HTMLInputElement)?.value.trim();
    const value = ($("cf-value") as HTMLInputElement)?.value.trim();
    if (!target || !prop) return;
    addQualiaClaim(store, target, prop, value);
    slot.innerHTML = "";
  };
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
