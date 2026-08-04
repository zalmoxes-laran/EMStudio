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
 * TODO(ET2): the mapping (xlsx / pyArchInit / XML → nodes) and the bake step.
 * TODO(ET3): the non-local sources + "promote to MinIO".
 */
export interface AuxiliaryFile {
  id: string;
  name: string;
  /** Where it lives. `local` is the only one P0 would accept. */
  kind: "local" | "catalog" | "hdt" | "minio";
  locator: string;
  /**
   * False until a bake has written its content into the graph. Kept on the slot,
   * never in the document, precisely so that an un-baked aux cannot travel.
   */
  baked: boolean;
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
  /** Shown in the tree. Derived from the document, or the file name. */
  name: string;
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
      name: this.uniqueName(name || "untitled"),
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
   * Disambiguate a name against the slots already open.
   *
   * Two "New graph" in a row produced two rows reading `untitled graph`, with no
   * way to tell which one the canvas was showing — the list stops being a list.
   * Done here rather than at the call site because every caller can collide:
   * two files of the same name from different folders do too.
   */
  private uniqueName(name: string): string {
    if (!this.slots.some((s) => s.name === name)) return name;
    for (let n = 2; ; n += 1) {
      const candidate = `${name} ${n}`;
      if (!this.slots.some((s) => s.name === candidate)) return candidate;
    }
  }

  rename(id: string, name: string): void {
    const slot = this.get(id);
    if (slot) slot.name = name.trim() || slot.name;
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
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const rows = tree.slots.map((slot) => {
    const isActive = slot.id === tree.activeId;
    const nodes = slot.store.doc.graph?.nodes?.length ?? 0;
    const edges = slot.store.doc.graph?.edges?.length ?? 0;
    const aux = slot.auxiliaryFiles.length;
    return `
      <li class="et-slot${isActive ? " active" : ""}" data-id="${esc(slot.id)}">
        <button class="et-pick" data-id="${esc(slot.id)}"
                title="${esc(slot.path ?? labels("emtree.noFile"))}">
          <span class="et-name">${esc(slot.name)}${slot.store.dirty ? " •" : ""}</span>
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
      input.value = slot.name;
      label.replaceWith(input);
      input.focus();
      input.select();

      let done = false;
      const commit = (keep: boolean): void => {
        if (done) return; // blur fires after Enter too
        done = true;
        if (keep) handlers.onRename(slotId, input.value);
        else handlers.onRename(slotId, slot.name); // re-render, unchanged
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
