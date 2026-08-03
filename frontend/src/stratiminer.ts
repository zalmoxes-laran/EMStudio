/**
 * StratiMiner — assisted graph creation from a folder of unstructured sources.
 *
 * The panel makes a two-step pipeline visible instead of hiding it behind one
 * button:
 *
 *     a folder of sources  --(AI)-->  em_data.xlsx  --(deterministic)-->  em.json
 *
 * Both halves are here, and the seam between them is a FILE the archaeologist
 * can open. That is the whole design: the model canonises source material into a
 * typed table, the table is reviewed, and only then does a plain importer turn
 * it into a graph. **The AI never writes the graph.** A model asked for em.json
 * directly would put an unreviewed guess straight into the language's own
 * format, where a wrong node type reads exactly like a right one.
 *
 * Two paths reach the table, and neither is a fallback for the other:
 *
 *  * **Path A (API)** — the bridge calls a model itself and materialises the
 *    workbook. Fast, but it only sees what the bridge can decode as text: PDFs
 *    need an extractor this build does not bundle, and the panel says so per
 *    run rather than letting a table built from filenames look complete.
 *  * **Path B (Cowork)** — copy the prompt, run it in a session that has the
 *    filesystem, get the workbook back. Slower, and the only honest answer today
 *    for a folder of PDFs.
 *
 * Both end at the same field: a path to em_data.xlsx, and one button that
 * converts it.
 *
 * Why this is a panel and not a modal: the source folder and the table are
 * things you come back to across a working session — a modal would make the
 * pipeline feel like a one-shot import, which is exactly the reading the
 * intermediate table exists to prevent.
 */

import type { EmDocument } from "./types";

/** `POST /stratiminer-prompt` — Path B. */
export interface PromptResult {
  ok: boolean;
  prompt: string;
  chars: number;
  folder: string;
}

/** `POST /stratiminer-extract` — Path A. */
export interface ExtractResult {
  ok: boolean;
  provider: string;
  model: string;
  xlsx_path: string;
  rows: Record<string, number>;
  /** Columns the writer refused because no sheet declares them. */
  warnings: string[];
  /**
   * Files whose text never reached the model, each with the REASON. A name alone
   * would not tell the user whether to install an extra, re-scan a document with
   * OCR, or accept the gap.
   */
  unread_files: { name: string; why: string }[];
  /** False when this build has no PDF text extractor at all. */
  pdf_text: boolean;
  /** The extractor and its version, or null. */
  extractor: string | null;
  sent: Record<string, unknown>;
}

/** `POST /import-em-data` — the deterministic half. */
export interface ImportResult {
  ok: boolean;
  stats: Record<string, number>;
  warnings: string[];
  doc: EmDocument;
}

/** What the panel remembers between renders. Deliberately not persisted: a
 *  source folder is per-investigation, and silently reopening last week's path
 *  would be a worse default than an empty field. */
export interface StratiMinerState {
  folder: string;
  xlsxPath: string;
  language: string;
  busy: "" | "extract" | "prompt" | "import";
  /** Last outcome, shown inline. Cleared when a new run starts. */
  report: string;
  warnings: string[];
  /**
   * The prompt text, held ONLY when the clipboard write failed.
   *
   * Path B's whole output is this string, so a denied clipboard — routine in a
   * browser without a permission grant, or over plain http — would otherwise
   * turn the path into a dead end with an apology. Showing it in a selectable
   * field costs nothing and keeps the path usable by hand.
   */
  promptFallback: string;
}

export function initialState(): StratiMinerState {
  return { folder: "", xlsxPath: "", language: "", busy: "", report: "",
           warnings: [], promptFallback: "" };
}

export interface StratiMinerHandlers {
  onFolderChange(value: string): void;
  onXlsxChange(value: string): void;
  onLanguageChange(value: string): void;
  /** Path A: ask the bridge to call a model and write the table. */
  onExtract(): void;
  /** Path B: put the prompt on the clipboard. */
  onCopyPrompt(): void;
  /** The deterministic half: table → graph, loaded into the editor. */
  onTransform(): void;
  /** Native folder/file pickers, when running in Tauri. */
  onPickFolder?(): void;
  onPickXlsx?(): void;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render the panel into `host` and wire the controls.
 *
 * Rebuilt wholesale on each state change, like the inspector: the panel is a
 * handful of fields, and a diffing scheme here would be more code than the
 * thing it optimises.
 *
 * **EMTree seam.** EMStudio is mono-graph today, so the produced document is
 * loaded the way Open… loads one — it replaces the current document. When the
 * EMTree workspace arrives (a multi-graph tab modelled on EMtools'
 * `em_tools.graphml_files` slots plus per-graph `auxiliary_files`), the produced
 * em.json should instead register as a NEW slot, carrying the source folder and
 * the em_data.xlsx as its two auxiliary files: they are what the graph was made
 * from, which is exactly what an aux file records. That is not built here on
 * purpose — inventing a second multi-graph model now, to be replaced when the
 * real one lands, is worse than one seam marked in the place that will need it.
 * The `sm-todo` line below says the same thing to the user, so the current
 * behaviour is not a surprise.
 */
export function renderStratiMiner(host: HTMLElement, state: StratiMinerState,
                                  handlers: StratiMinerHandlers,
                                  opts: { native: boolean }): void {
  const busy = state.busy !== "";
  const canExtract = state.folder.trim() !== "" && !busy;
  const canPrompt = state.folder.trim() !== "" && !busy;
  const canTransform = state.xlsxPath.trim() !== "" && !busy;

  host.innerHTML = `
    <div class="sm-panel">
      <p class="sm-intro">
        Build a graph from unstructured sources. The AI writes only the
        <b>table</b> — <code>em_data.xlsx</code> — which you can open and check;
        turning the table into a graph is a separate, deterministic step.
      </p>

      <h4>1 · Source folder</h4>
      <div class="sm-row">
        <input id="sm-folder" type="text" spellcheck="false"
               placeholder="/path/to/documents"
               value="${esc(state.folder)}" />
        ${opts.native ? '<button id="sm-pick-folder" title="Choose a folder">…</button>' : ""}
      </div>
      <label class="sm-lang">
        Output language
        <input id="sm-language" type="text" spellcheck="false"
               placeholder="(each document's own)"
               value="${esc(state.language)}" />
      </label>

      <h4>2 · Produce the table</h4>
      <div class="sm-paths">
        <div class="sm-path">
          <button id="sm-extract" ${canExtract ? "" : "disabled"}>
            ${state.busy === "extract" ? "Extracting…" : "Generate em_data.xlsx (AI)"}
          </button>
          <span class="sm-hint">
            The bridge calls a frontier model and writes the workbook. Reads
            text files; names PDFs it cannot decode.
          </span>
        </div>
        <div class="sm-path">
          <button id="sm-prompt" ${canPrompt ? "" : "disabled"}>
            ${state.busy === "prompt" ? "Copying…" : "Copy prompt for Cowork"}
          </button>
          <span class="sm-hint">
            Run it in a session that can read the folder, then set the path
            below. The only path that reads PDFs today.
          </span>
        </div>
      </div>

      <h4>3 · Table → graph</h4>
      <div class="sm-row">
        <input id="sm-xlsx" type="text" spellcheck="false"
               placeholder="/path/to/em_data.xlsx"
               value="${esc(state.xlsxPath)}" />
        ${opts.native ? '<button id="sm-pick-xlsx" title="Choose the xlsx">…</button>' : ""}
      </div>
      <button id="sm-transform" class="sm-primary"
              ${canTransform ? "" : "disabled"}>
        ${state.busy === "import" ? "Converting…" : "Transform into em.json"}
      </button>
      <span class="sm-hint">
        Deterministic: the same table always yields the same document.
      </span>

      ${state.report ? `<div class="sm-report">${esc(state.report)}</div>` : ""}
      ${state.promptFallback
      ? `<label class="sm-fallback">
           Select all and copy manually:
           <textarea id="sm-prompt-text" readonly rows="6"
             >${esc(state.promptFallback)}</textarea>
         </label>`
      : ""}
      ${state.warnings.length
      ? `<ul class="sm-warnings">${state.warnings
        .map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
      : ""}

      <p class="sm-todo">
        The produced graph replaces the current document. Registering it as an
        EMTree slot — with the folder and the table as auxiliary files — waits
        for the EMTree workspace.
      </p>
    </div>`;

  const on = <T extends HTMLElement>(id: string, ev: string,
                                     fn: (el: T) => void): void => {
    const el = host.querySelector<T>(`#${id}`);
    if (el) el.addEventListener(ev, () => fn(el));
  };

  on<HTMLInputElement>("sm-folder", "change",
    (el) => handlers.onFolderChange(el.value));
  on<HTMLInputElement>("sm-xlsx", "change",
    (el) => handlers.onXlsxChange(el.value));
  on<HTMLInputElement>("sm-language", "change",
    (el) => handlers.onLanguageChange(el.value));
  on("sm-extract", "click", () => handlers.onExtract());
  on("sm-prompt", "click", () => handlers.onCopyPrompt());
  on("sm-transform", "click", () => handlers.onTransform());
  // Pre-select the fallback text: the user is here because copying failed, so
  // the next thing they need is a selection they did not have to make.
  const fallback = host.querySelector<HTMLTextAreaElement>("#sm-prompt-text");
  if (fallback) fallback.addEventListener("focus", () => fallback.select());
  if (handlers.onPickFolder) {
    on("sm-pick-folder", "click", () => handlers.onPickFolder?.());
  }
  if (handlers.onPickXlsx) {
    on("sm-pick-xlsx", "click", () => handlers.onPickXlsx?.());
  }
}

/**
 * A one-line account of an extraction, for the panel.
 *
 * Reports the unread files as prominently as the rows written. A run over a
 * folder of PDFs legitimately produces a nearly-empty table, and without this
 * line that reads as "the sources held little" instead of "nothing read them".
 */
export function describeExtraction(r: ExtractResult): string {
  const rows = Object.entries(r.rows)
    .filter(([, n]) => n > 0)
    .map(([sheet, n]) => `${sheet} ${n}`)
    .join(" · ");
  const parts = [`${r.model || r.provider} wrote ${rows || "no rows"}`];
  if (r.unread_files.length) {
    parts.push(
      `${r.unread_files.length} file(s) not read — their contents did NOT ` +
      `reach the model`);
  }
  if (r.pdf_text === false) {
    // The actionable one: this is a missing optional dependency, not a bad
    // folder, and the fix is one install away.
    parts.push(
      "this build has no PDF text extractor, so PDFs were listed by name " +
      "only — install the [pdf] extra, or use the Cowork path");
  }
  return parts.join(". ") + ".";
}

/**
 * The per-file reasons, for the warnings list.
 *
 * Kept apart from the one-line report because they are a *checklist*: each line
 * is a file somebody may want to do something about (install an extra, OCR a
 * scan, ignore a spreadsheet). Folded into a sentence they would read as noise.
 */
export function unreadWarnings(r: ExtractResult): string[] {
  return r.unread_files.map((f) => `${f.name}: ${f.why}`);
}

/** Same, for the deterministic half. */
export function describeImport(r: ImportResult): string {
  const s = r.stats;
  return `Read ${s.rows_units ?? 0} units · ${s.rows_epochs ?? 0} epochs · ` +
    `${s.rows_claims ?? 0} claims → ${s.nodes_total ?? 0} nodes, ` +
    `${s.edges_total ?? 0} edges.`;
}
