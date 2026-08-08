// EM-Data dock renderer (DP-81). Draws the tabular VIEW built by em-data.ts and
// wires cell edits back through the DocumentStore (same mutation path as the
// Inspector). The dock is full-width below the side wings, resizable and
// collapsible. It owns NO data — every render rebuilds from the store, so it
// stays in sync with the canvas both ways.

import type { DocumentStore } from "./model";
import {
  addQualiaClaim,
  addRow,
  applyEdit,
  buildTable,
  deleteRow,
  EM_DATA_SHEETS,
  type Column,
  type SheetKey,
  type VolatileProvider,
} from "./em-data";

let getStore: () => DocumentStore | null = () => null;
let currentSheet: SheetKey = "US";
let volatileProvider: VolatileProvider = () => false;

const LS_COLLAPSED = "emdata.collapsed";
const LS_HEIGHT = "emdata.height";
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

export function initEmData(opts: {
  getStore: () => DocumentStore | null;
  currentRow?: () => string | null;
  setCurrentRow?: (id: string | null) => void;
}): void {
  getStore = opts.getStore;
  if (opts.currentRow) currentRowOf = opts.currentRow;
  if (opts.setCurrentRow) setCurrentRow = opts.setCurrentRow;
  const dock = $("emdata-dock");
  const toggle = $<HTMLButtonElement>("emdata-toggle");
  const resizer = $("emdata-resizer");
  const sheetSel = $<HTMLSelectElement>("emdata-sheet");
  if (!dock || !toggle || !resizer || !sheetSel) return;

  // sheet selector
  sheetSel.innerHTML = EM_DATA_SHEETS.map(
    (s) => `<option value="${s.key}">${s.label}</option>`,
  ).join("");
  currentSheet = (localStorage.getItem(LS_SHEET) as SheetKey) || "US";
  sheetSel.value = currentSheet;
  sheetSel.onchange = () => {
    currentSheet = sheetSel.value as SheetKey;
    localStorage.setItem(LS_SHEET, currentSheet);
    renderEmData();
  };

  // collapsed state (default collapsed so it never hides the canvas unasked)
  const startCollapsed = localStorage.getItem(LS_COLLAPSED) !== "false";
  setCollapsed(startCollapsed);
  toggle.onclick = () => setCollapsed(!dock.classList.contains("collapsed"));

  // restore height
  const savedH = Number(localStorage.getItem(LS_HEIGHT));
  if (savedH >= 120) dock.style.height = `${savedH}px`;

  // resize from the top edge
  resizer.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    const startY = ev.clientY;
    const startH = dock.getBoundingClientRect().height;
    const onMove = (e: PointerEvent) => {
      const h = Math.max(
        120,
        Math.min(window.innerHeight - 160, startH + (startY - e.clientY)),
      );
      dock.style.height = `${h}px`;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      localStorage.setItem(
        LS_HEIGHT,
        String(Math.round(dock.getBoundingClientRect().height)),
      );
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  renderEmData();
}

function setCollapsed(collapsed: boolean): void {
  const dock = $("emdata-dock");
  const toggle = $<HTMLButtonElement>("emdata-toggle");
  if (!dock || !toggle) return;
  dock.classList.toggle("collapsed", collapsed);
  toggle.setAttribute("aria-expanded", String(!collapsed));
  const caret = toggle.querySelector(".emdata-caret");
  if (caret) caret.textContent = collapsed ? "▴" : "▾";
  localStorage.setItem(LS_COLLAPSED, String(collapsed));
  if (!collapsed) renderEmData();
}

/** Rebuild the visible table from the store. Called on every store change and
 *  on sheet switch. Cheap: a few hundred rows of plain DOM. */
export function renderEmData(): void {
  const dock = $("emdata-dock");
  const body = $("emdata-body");
  const countEl = $("emdata-count");
  const actions = $("emdata-actions");
  if (!dock || !body || dock.classList.contains("collapsed")) return;

  const store = getStore();
  if (!store) {
    body.innerHTML = `<div class="emdata-empty">Open or create an .em.json to see its tables.</div>`;
    if (countEl) countEl.textContent = "";
    if (actions) actions.innerHTML = "";
    return;
  }

  const table = buildTable(store, currentSheet, volatileProvider);
  if (countEl) countEl.textContent = `${table.rows.length} rows`;

  // per-sheet actions (add row / add claim)
  if (actions) {
    actions.innerHTML = "";
    if (table.canAdd) {
      const btn = document.createElement("button");
      btn.textContent = "+ row";
      btn.onclick = () => {
        const id = addRow(store, currentSheet);
        if (id) renderEmData();
      };
      actions.appendChild(btn);
    }
    if (currentSheet === "Claims") {
      const btn = document.createElement("button");
      btn.textContent = "+ claim";
      btn.onclick = () => toggleClaimForm(store);
      actions.appendChild(btn);
    }
  }

  const claimForm =
    currentSheet === "Claims" ? '<div id="emdata-claimform-slot"></div>' : "";

  const head = `<tr>${table.columns
    .map((c) => `<th>${c.label}</th>`)
    .join("")}<th></th></tr>`;

  const rowsHtml = table.rows
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
