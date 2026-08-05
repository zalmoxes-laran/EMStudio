/**
 * EMTree — the workspace: several graphs open at once, one of them active.
 *
 * EMStudio held exactly one document. This turns that one into **the active
 * slot** of a collection, and the change is deliberately shaped so nothing else
 * had to be rewritten: `main.ts` keeps its single module-level `store`, and this
 * module owns *which* store that is. Every consumer — canvas, Inspector, the
 * narrative view, export, Shelf — still reads "the graph" and gets the active one.
 *
 * **Why not a per-consumer graph parameter.** Threading a graph id through 232
 * call sites would have been a rewrite with 232 chances to leave one reading a
 * stale document. Keeping a single "active" pointer means there is exactly one
 * place where the answer to "which graph?" can be wrong, and it is here.
 *
 * **Modelled on EMtools' EM Tree**, so the two tools port mentally without a
 * translation table:
 *
 * | EMtools (`scene.em_tools`) | here |
 * |---|---|
 * | `graphml_files` (collection of file slots) | `slots` |
 * | `active_file_index` | `activeIndex` (and `activeId`, which is what the code uses) |
 * | `auxiliary_files` (per graph) | `GraphSlot.auxiliaryFiles` — **stub**, see below |
 *
 * ``activeId`` rather than an index is what the rest of the code uses: an index
 * silently points at a different graph after a remove, and that is the kind of
 * bug that shows up as "the wrong document saved over the right one".
 */

import type { DocumentStore } from "./model";
import type { ViewKind } from "./types";

/**
 * A per-graph auxiliary file — **the place, not the feature** (ET1 P0).
 *
 * In EMtools an auxiliary file is a source hanging off a graph: an xlsx, a
 * pyArchInit database, an XML export. Two properties decide how they must be
 * treated here, and both are why this is a stub rather than an implementation:
 *
 * 1. **Aux content is VOLATILE.** It is mapped on the fly and must NOT end up in
 *    em.json unless the user explicitly **bakes** it — the temporary→persistent
 *    pattern the resource layer already has. An aux file that quietly persisted
 *    would put a copy of somebody's database inside a document they then share.
 * 2. **The sources are plural**: local files now; the StratiGraph Catalog, the
 *    HDT Catalog (ECCCH) and MinIO later. Each brings its own resolution and its
 *    own auth, so the shape here is deliberately minimal: what it is and where it
 *    came from, nothing about how to read it.
 *
 * AUX1 (2026-08-05) built the SECTION: the per-slot list, the five types, add /
 * remove / expand, and the volatile-vs-baked state. What is still missing is the
 * part that needs an importer:
 *
 * TODO(ET2): the MAPPING and the bake — turning an xlsx row or a pyArchInit
 *   record into nodes, and merging them into the active graph. No importer is
 *   wired: `s3dgraphy` has `mapped_xlsx_importer`, `pyarchinit_importer` and
 *   `unified_xlsx_importer`, and the bridge exposes `/import-em-data`, but that
 *   one BUILDS a document rather than merging into one — a bake is a merge, and
 *   inventing it here would be inventing the semantics of the merge too.
 * TODO(ET3): the non-local sources (StratiGraph Catalog, HDT Catalog, MinIO) +
 *   "promote to MinIO". `kind` is already the field that will say which.
 */
/**
 * What KIND of source an auxiliary file is — the five EMtools types
 * (`em_setup/properties.py::AuxiliaryFileProperties.file_type`), same tokens so
 * the two tools name the same thing the same way and a future exchange needs no
 * translation table.
 */
export type AuxFileType =
  | "emdb_xlsx"
  | "pyarchinit"
  | "dosco"
  | "source_list"
  | "resource_collection";

/** The five types with their labels and what they are for (shown in the UI). */
export const AUX_FILE_TYPES: {
  value: AuxFileType;
  label: string;
  hint: string;
  /** a folder rather than a file — the picker and the detail panel differ */
  folder?: boolean;
}[] = [
  {
    value: "emdb_xlsx",
    label: "EMdb Excel",
    hint: "Excel workbook in an EMdb format — units, epochs, claims.",
  },
  {
    value: "pyarchinit",
    label: "pyArchInit",
    hint: "pyArchInit database (SQLite/PostGIS): the excavation's own records.",
  },
  {
    value: "dosco",
    label: "DosCo",
    hint: "Documentation folder harvested for document files.",
    folder: true,
  },
  {
    value: "source_list",
    label: "Source list",
    hint: "Excel list of sources for document / extractor / combiner nodes.",
  },
  {
    value: "resource_collection",
    label: "Resource collection",
    hint: "Folder of multimodal resources (images, documents) linked to nodes.",
    folder: true,
  },
];

export interface AuxiliaryFile {
  id: string;
  name: string;
  /** Where it lives. `local` is the only one P0 would accept. */
  kind: "local" | "catalog" | "hdt" | "minio";
  locator: string;
  /** Which of the five source kinds this is (AUX1). */
  fileType: AuxFileType;
  /**
   * False until a bake has written its content into the graph. Kept on the slot,
   * never in the document, precisely so that an un-baked aux cannot travel.
   */
  baked: boolean;
  /**
   * Per-type options — a mapping name, a table choice, a resource folder.
   *
   * A free object and not a class per type on purpose: EMtools needs one Blender
   * property per option because its UI is declarative, while here the detail
   * panel is drawn from `AUX_FILE_TYPES` and the options a type actually uses are
   * whatever ET2's mapping ends up needing. Typing them now would be inventing
   * the mapping's shape before the mapping exists.
   */
  options?: Record<string, unknown>;
  /** open in the detail panel (view state, per session) */
  expanded?: boolean;
}

/**
 * View state that belongs to a graph rather than to the app.
 *
 * Carried per slot because otherwise switching tabs would silently throw away
 * work: `graphOverrides` holds the user's manual drags in Graph view, and losing
 * those on every switch is the first thing anyone would notice. Kept OUT of the
 * document — none of it is archival, and writing it to em.json would make a
 * camera position part of the language.
 */
export interface SlotViewState {
  view: ViewKind;
  /** Manual node drags in Graph view (id → position). */
  graphOverrides: Map<string, { x: number; y: number }>;
  /** Top-level epochs the user collapsed back into a single lane. */
  phasesCollapsed: Set<string>;
  /**
   * Where the camera was, per view — three numbers each.
   *
   * Carried per slot because the viewports are shared by view KIND, not by
   * document: a 215-node matrix and a 17-node one need very different pan and
   * zoom, so without this a switch leaves the incoming graph microscopic or off
   * screen entirely. `null` means "never shown yet" → fit it on arrival, which is
   * also what makes the first activation behave like an open.
   */
  camera: Partial<Record<ViewKind, { x: number; y: number; scale: number }>>;
}

export function emptyViewState(view: ViewKind = "matrix"): SlotViewState {
  return {
    view,
    graphOverrides: new Map(),
    phasesCollapsed: new Set(),
    camera: {},
  };
}

/** One open graph. */
export interface GraphSlot {
  id: string;
  /**
   * FALLBACK label, used only while the document declares no `graph.name`
   * (POL3). The name shown in the tree is `slotLabel(slot)` — read from the
   * document — because the graph's name has exactly one home.
   *
   * Before, the slot carried its own `name` and renaming a row edited only that:
   * the Inspector's "Graph · dataset info" kept showing the old name, and the two
   * drifted apart with nothing to reconcile them. The earlier reasoning (a tab
   * label is not the document's name, so two copies of one graph can be told
   * apart) lost to the thing users actually do: they rename the graph, in
   * whichever of the two places they happen to be looking at.
   */
  fallbackName: string;
  /** Absolute path on desktop; null for a browser drop or a new graph. */
  path: string | null;
  /**
   * The slot's own store — **with its own undo stack**. This is what makes the
   * workspace more than "reopen the file": edits and history survive a switch.
   */
  store: DocumentStore;
  auxiliaryFiles: AuxiliaryFile[];
  viewState: SlotViewState;
}

/**
 * The name of the graph in a slot — **the document is the single source** (POL3).
 *
 * A function and not a stored field on purpose: a stored copy is a thing that can
 * be stale, and this one was. Everything that shows a graph's name (the tree, the
 * unsaved-changes prompt, the window title) goes through here, so there is no
 * second place to forget to update.
 */
export function slotLabel(slot: GraphSlot): string {
  const declared = String(
    (slot.store.doc.graph as Record<string, unknown>)["name"] ?? "",
  ).trim();
  return declared || slot.fallbackName;
}

/** The workspace. Pure state + queries; it renders nothing and touches no DOM. */
export class EMTree {
  slots: GraphSlot[] = [];
  private _activeId: string | null = null;

  get activeId(): string | null {
    return this._activeId;
  }

  /** EMtools' `active_file_index`, for the mental port. −1 when nothing is open. */
  get activeIndex(): number {
    return this.slots.findIndex((s) => s.id === this._activeId);
  }

  active(): GraphSlot | null {
    return this.slots.find((s) => s.id === this._activeId) ?? null;
  }

  get(id: string): GraphSlot | null {
    return this.slots.find((s) => s.id === id) ?? null;
  }

  /**
   * Register a graph and make it active. Returns the new slot.
   *
   * Adding always activates, because every caller — Open, New, a drop,
   * StratiMiner — is a user asking to look at this graph now. A silent
   * background add would be a second way to be surprised by which document is on
   * screen.
   */
  add(store: DocumentStore, name: string, path: string | null = null): GraphSlot {
    const slot: GraphSlot = {
      id: crypto.randomUUID(),
      fallbackName: name || "untitled",
      path,
      store,
      auxiliaryFiles: [],
      viewState: emptyViewState(),
    };
    this.slots.push(slot);
    this._activeId = slot.id;
    return slot;
  }

  /**
   * Drop a slot. Returns the id that is active afterwards (or null).
   *
   * Closing the active slot activates its NEIGHBOUR rather than clearing the
   * canvas: the user closed one graph, not the workspace.
   */
  remove(id: string): string | null {
    const index = this.slots.findIndex((s) => s.id === id);
    if (index === -1) return this._activeId;
    const wasActive = this._activeId === id;
    this.slots.splice(index, 1);
    if (wasActive) {
      const next = this.slots[index] ?? this.slots[index - 1] ?? null;
      this._activeId = next ? next.id : null;
    }
    return this._activeId;
  }

  /** Returns true when the active slot actually changed. */
  setActive(id: string): boolean {
    if (!this.slots.some((s) => s.id === id)) return false;
    if (this._activeId === id) return false;
    this._activeId = id;
    return true;
  }

  /**
   * Rename the graph in a slot. Writes the DOCUMENT, which is the only place the
   * name lives (POL3) — so the Inspector's Name field shows it immediately, and
   * so a rename is a document edit that has to be saved, like any other.
   *
   * Empty input keeps the current name; an unchanged name is a **no-op**, not a
   * rewrite: `updateGraphMeta` checkpoints and marks the document dirty, and
   * pressing Escape out of the inline editor must not do either of those.
   */
  rename(id: string, name: string): void {
    const slot = this.get(id);
    if (!slot) return;
    const next = name.trim();
    if (!next || next === slotLabel(slot)) return;
    slot.fallbackName = next; // stays in step for a doc that declares no name
    slot.store.updateGraphMeta({ name: next });
  }

  /** Any slot with unsaved changes? Used before a destructive action. */
  anyDirty(): boolean {
    return this.slots.some((s) => s.store.dirty);
  }
}

// ── the panel ─────────────────────────────────────────────────────────────────

export interface EMTreeHandlers {
  onActivate(id: string): void;
  onRemove(id: string): void;
  /** Add = the same Open… the toolbar uses; the tree does not duplicate it. */
  onOpen(): void;
  onNew(): void;
  /** Inline rename from the tree (POL1): double-click the name. */
  onRename(id: string, name: string): void;
  /** AUX1 — auxiliary files of the ACTIVE slot. The tree renders, main.ts acts. */
  onAuxAdd?(): void;
  onAuxRemove?(auxId: string): void;
  onAuxToggle?(auxId: string): void;
  onAuxTypeChange?(auxId: string, fileType: AuxFileType): void;
  onAuxBake?(auxId: string): void;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The AUXILIARY FILES section of the ACTIVE slot — the EMtools section, reproposed.
 *
 * EMtools draws this as a `template_list` per graph with an active index, add /
 * remove buttons and a per-file detail panel when `expanded`
 * (`em_setup/ui.py`, ~line 950). Here the same thing without the Blender idiom:
 * a list of rows, each its own expander, so several can be open at once and the
 * panel needs no "active index" to be kept in step with the selection.
 *
 * For the ACTIVE slot only, and that is the point of the whole feature: an aux
 * file belongs to a graph, and the tree is where "which graph" is decided.
 *
 * Every row states whether it is **volatile** or **baked**, because that is the
 * invariant a user has to be able to see: nothing here is in the document until a
 * bake puts it there, so sharing an em.json does not share somebody's database.
 */
function auxSection(tree: EMTree, labels: (key: string) => string): string {
  const slot = tree.active();
  if (!slot) return "";
  const rows = slot.auxiliaryFiles.map((f) => {
    const type = AUX_FILE_TYPES.find((t) => t.value === f.fileType);
    const state = f.baked ? "baked" : "volatile";
    return `
      <li class="aux-row${f.expanded ? " open" : ""}" data-aux="${esc(f.id)}">
        <button class="aux-head" data-aux-toggle="${esc(f.id)}"
                title="${esc(type?.hint ?? "")}">
          <span class="aux-caret">${f.expanded ? "▾" : "▸"}</span>
          <span class="aux-name">${esc(f.name)}</span>
          <span class="aux-type">${esc(type?.label ?? f.fileType)}</span>
          <span class="aux-badge aux-${state}">${state}</span>
        </button>
        <button class="aux-del" data-aux-remove="${esc(f.id)}"
                title="Remove this auxiliary file (the document is untouched)">×</button>
        ${f.expanded ? auxDetail(f) : ""}
      </li>`;
  }).join("");
  return `
    <div class="aux-sect">
      <div class="aux-sect-head">
        <span>Auxiliary files</span>
        <button id="aux-add" title="Attach a local file or folder to this graph">+ add</button>
      </div>
      ${slot.auxiliaryFiles.length
        ? `<ul class="aux-list">${rows}</ul>`
        : `<p class="aux-empty">${esc(labels("emtree.noAux"))} — sources attached
             to this graph, mapped on the fly. Nothing is written into the
             em.json until you bake it.</p>`}
    </div>`;
}

/** The per-file detail panel: type, locator, options, bake. */
function auxDetail(f: AuxiliaryFile): string {
  const type = AUX_FILE_TYPES.find((t) => t.value === f.fileType);
  const options = Object.entries(f.options ?? {});
  return `
    <div class="aux-detail">
      <label class="aux-field">
        <span>Type</span>
        <select data-aux-type="${esc(f.id)}">
          ${AUX_FILE_TYPES.map((t) =>
            `<option value="${t.value}"${t.value === f.fileType ? " selected" : ""}
             >${esc(t.label)}</option>`).join("")}
        </select>
      </label>
      <p class="aux-hint">${esc(type?.hint ?? "")}</p>
      <label class="aux-field">
        <span>${type?.folder ? "Folder" : "Path"}</span>
        <input type="text" value="${esc(f.locator)}" readonly
               title="${esc(f.locator)}" />
      </label>
      <p class="aux-hint">
        Source: <b>${esc(f.kind)}</b>${f.kind === "local"
          ? " — the StratiGraph Catalog, the HDT Catalog and MinIO are ET3."
          : ""}
      </p>
      ${options.length
        ? `<p class="aux-hint">Options: ${esc(
            options.map(([k, v]) => `${k}=${String(v)}`).join(" · "),
          )}</p>`
        : ""}
      <div class="aux-actions">
        <button data-aux-bake="${esc(f.id)}" disabled
                title="TODO(ET2): mapping/import. ${esc(bakeBlocker(f.fileType))}"
          >Bake into the graph</button>
        <span class="aux-hint">${f.baked
          ? "baked — its content is in the document"
          : "volatile — not in the document"}</span>
      </div>
    </div>`;
}

/**
 * Why a bake is not available for this type — the specific reason, not a generic
 * TODO, so nobody re-investigates from scratch.
 *
 * No importer is wired anywhere: what exists is listed here per type, and in every
 * case the missing piece is the same one — a MERGE into an existing graph. The
 * bridge's `/import-em-data` builds a document from an xlsx; `/scan-resources`
 * lists a folder's resources. Neither adds nodes to the graph you are looking at,
 * and deciding what "adding" means (match by name? by id? overwrite?) is the ET2
 * decision, not an implementation detail to guess.
 */
function bakeBlocker(fileType: AuxFileType): string {
  switch (fileType) {
    case "emdb_xlsx":
      return "s3dgraphy has mapped_xlsx_importer and the bridge has /import-em-data, but that BUILDS a document — merging into this graph is ET2.";
    case "pyarchinit":
      return "s3dgraphy has pyarchinit_importer, but the bridge does not expose it yet.";
    case "source_list":
      return "s3dgraphy has source_text/unified_xlsx_importer; the mapping to document/extractor/combiner nodes is ET2.";
    case "dosco":
      return "harvesting a documentation folder into document nodes is ET2.";
    case "resource_collection":
      return "the bridge's /scan-resources lists a folder (see the Resources panel); attaching them as a baked aux is ET2.";
  }
}

/**
 * Render the tree into `host`.
 *
 * Rebuilt wholesale on each change, like the inspector: a handful of rows, and a
 * diffing scheme would be more code than the thing it saves.
 */
export function renderEMTree(host: HTMLElement, tree: EMTree,
                             handlers: EMTreeHandlers,
                             labels: (key: string) => string): void {
  // Two graphs can legitimately carry the same name (two copies of one dataset,
  // or two "untitled graph" from two News). The list still has to be a list, so
  // the ambiguity is resolved HERE, at draw time, and never stored: a suffix
  // computed from the current slots cannot go stale, whereas the old
  // "untitled graph 2" written into the slot survived every later rename.
  const rawLabels = tree.slots.map(slotLabel);
  const seen = new Map<string, number>();
  const displayNames = rawLabels.map((label) => {
    const total = rawLabels.filter((l) => l === label).length;
    if (total === 1) return label;
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    return `${label} (${n})`;
  });

  const rows = tree.slots.map((slot, i) => {
    const isActive = slot.id === tree.activeId;
    const nodes = slot.store.doc.graph?.nodes?.length ?? 0;
    const edges = slot.store.doc.graph?.edges?.length ?? 0;
    const aux = slot.auxiliaryFiles.length;
    return `
      <li class="et-slot${isActive ? " active" : ""}" data-id="${esc(slot.id)}">
        <button class="et-pick" data-id="${esc(slot.id)}"
                title="${esc(slot.path ?? labels("emtree.noFile"))}">
          <span class="et-name">${esc(displayNames[i])}${slot.store.dirty ? " •" : ""}</span>
          <span class="et-meta">${nodes} ${labels("emtree.nodes")} · ${edges} ${labels("emtree.edges")}</span>
        </button>
        <button class="et-close" data-close="${esc(slot.id)}"
                title="${esc(labels("emtree.close"))}">×</button>
        <!-- Aux files: the STUB. Shown as a count so the place is visible in the
             UI and nobody wonders where they would go; the list, the mapping and
             the bake are ET2. -->
        <div class="et-aux">${aux === 0
          ? labels("emtree.noAux")
          : `${aux} ${labels("emtree.auxFiles")}`}</div>
      </li>`;
  }).join("");

  host.innerHTML = `
    <div class="et-panel">
      <p class="et-intro">${esc(labels("emtree.intro"))}</p>
      <div class="et-actions">
        <button id="et-new">${esc(labels("emtree.new"))}</button>
        <button id="et-open">${esc(labels("emtree.open"))}</button>
      </div>
      ${tree.slots.length
        ? `<ul class="et-slots">${rows}</ul>`
        : `<p class="et-empty">${esc(labels("emtree.empty"))}</p>`}
      ${auxSection(tree, labels)}
      <p class="et-todo">${esc(labels("emtree.auxNote"))}</p>
    </div>`;

  host.querySelectorAll<HTMLButtonElement>(".et-pick").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      if (id) handlers.onActivate(id);
    });
  });

  // Inline rename (POL1): double-click the name. Useful the moment you create a
  // graph, when "untitled graph 2" is the only thing telling it apart from
  // "untitled graph 3".
  //
  // On the NAME rather than a pencil button: the row is already a button (it
  // activates), and hanging a second control off it would crowd a list whose job
  // is to be scannable. Double-click is the outliner convention this tree is
  // modelled on.
  host.querySelectorAll<HTMLElement>(".et-name").forEach((label) => {
    label.addEventListener("dblclick", (event) => {
      event.stopPropagation(); // do not also activate the row
      const slotId = label.closest<HTMLElement>(".et-slot")?.dataset.id;
      if (!slotId) return;
      const slot = tree.get(slotId);
      if (!slot) return;

      const input = document.createElement("input");
      input.type = "text";
      input.className = "et-rename";
      // the GRAPH's name, not the disambiguated display name: editing a field
      // pre-filled with "untitled graph (2)" would write that suffix into the
      // document, and the suffix is a fact about the list, not about the graph
      input.value = slotLabel(slot);
      label.replaceWith(input);
      input.focus();
      input.select();

      let done = false;
      const commit = (keep: boolean): void => {
        if (done) return; // blur fires after Enter too
        done = true;
        // Escape passes the CURRENT name back: `rename` no-ops on an unchanged
        // name, so the round trip only re-renders the row (restoring the label
        // element) without checkpointing or dirtying the document.
        handlers.onRename(slotId, keep ? input.value : slotLabel(slot));
      };
      input.addEventListener("keydown", (keyEvent) => {
        if (keyEvent.key === "Enter") commit(true);
        else if (keyEvent.key === "Escape") commit(false);
        // Stop here: the app binds single letters as canvas shortcuts, and typing
        // a name should not also trigger them.
        keyEvent.stopPropagation();
      });
      input.addEventListener("blur", () => commit(true));
    });
  });
  // AUX1 · the auxiliary-files section of the active slot. `main.ts` owns the
  // actions (it has the file picker and the store); the tree only reports them.
  host.querySelector<HTMLButtonElement>("#aux-add")
    ?.addEventListener("click", () => handlers.onAuxAdd?.());
  host.querySelectorAll<HTMLElement>("[data-aux-toggle]").forEach((el) => {
    el.addEventListener("click", () =>
      handlers.onAuxToggle?.(el.dataset.auxToggle!));
  });
  host.querySelectorAll<HTMLElement>("[data-aux-remove]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.stopPropagation(); // the row header is a button too
      handlers.onAuxRemove?.(el.dataset.auxRemove!);
    });
  });
  host.querySelectorAll<HTMLSelectElement>("[data-aux-type]").forEach((el) => {
    el.addEventListener("change", () =>
      handlers.onAuxTypeChange?.(el.dataset.auxType!, el.value as AuxFileType));
  });
  host.querySelectorAll<HTMLButtonElement>("[data-aux-bake]").forEach((el) => {
    el.addEventListener("click", () => handlers.onAuxBake?.(el.dataset.auxBake!));
  });

  host.querySelectorAll<HTMLButtonElement>(".et-close").forEach((button) => {
    button.addEventListener("click", (event) => {
      // The row is a button too; without this the close also re-activates.
      event.stopPropagation();
      const id = button.dataset.close;
      if (id) handlers.onRemove(id);
    });
  });
  host.querySelector<HTMLButtonElement>("#et-open")
    ?.addEventListener("click", () => handlers.onOpen());
  host.querySelector<HTMLButtonElement>("#et-new")
    ?.addEventListener("click", () => handlers.onNew());
}
