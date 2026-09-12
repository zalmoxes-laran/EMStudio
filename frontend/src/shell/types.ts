/**
 * THE SIX, CONVERTED · one constructor per window type, focused or not.
 *
 * Each of these was two pieces of code an hour ago: a singleton inside
 * `#canvas-wrap` that only the focused window could use, and a branch of
 * `buildSecondarySurface()` for every other area. Here there is one, and the
 * window that has the focus gets exactly the same object as the window that does
 * not.
 *
 * WHAT `setFocused` DOES HERE, and it is a finding rather than a shortcut: for
 * these six types it sets a hook class and nothing else — because the
 * interactive chrome had ALREADY been moved into the window header on 9 August
 * (HDR2), and the header is built by one builder that every area calls. So by
 * the time the two paths were merged there was nothing left that only the
 * focused mount could do. The class carries no box metric, and
 * `check-surfaces.mjs` asserts that by walking this file's AST.
 *
 * The renderers are NOT here. They live in `main.ts` next to the state they
 * read, and arrive through `SurfaceDeps` — so this file can be parsed, and its
 * `setFocused` bodies read, without dragging 18.000 lines behind them.
 */
import type { Win } from "../workspace";
import type { Surface, SurfaceType } from "./surface";
import { registerSurfaceType } from "./surface";
// …and re-exported here, so a checker that bundles THIS file can ask the
// registry what is in it without a second entry point.
export { convertedTypes, surfaceTypeOf } from "./surface";
import { paintSurface, surfacePlace } from "../surface-scroll";

/** Just what this module needs of an EM-Data mount (`emdata.ts` owns the type). */
export interface TableMount {
  body: HTMLElement;
  readonly count: HTMLElement | null;
  enabled: () => boolean;
  place?: { recall: () => number; remember: (at: number) => void };
}

/** …and of a Storage mount. `main.ts` holds the listing; this holds the boxes. */
export interface StorageMount {
  win: Win;
  body: HTMLElement;
  crumb: HTMLElement | null;
  up: HTMLButtonElement | null;
  enabled: () => boolean;
}

export interface SurfaceDeps {
  addEmDataHost(host: TableMount): void;
  removeEmDataHost(host: TableMount): void;
  renderEmData(): void;
  addStorageHost(host: StorageMount): void;
  removeStorageHost(host: StorageMount): void;
  renderStorage(): void;
  renderShelfInto(win: Win, body: HTMLElement, count: HTMLElement | null): void;
  renderViewerInto(win: Win, stage: HTMLElement, caption: HTMLElement,
                   bar: HTMLElement): void;
  renderDocViewInto(win: Win, list: HTMLElement, detail: HTMLElement): void;
  reflectDocWidth(surface: HTMLElement): void;
  renderStudyInto(body: HTMLElement): void;
}

/** An element of this area's own header strip — the row count, the crumb, the
 *  up button. Looked up at USE time, because the header is rebuilt whenever the
 *  arrangement changes and a held reference would go stale. */
function strip<T extends HTMLElement>(area: HTMLElement | null,
                                      cls: string): T | null {
  return area?.querySelector<T>(`:scope > .tile-bar .${cls}`) ?? null;
}

/** The one thing every converted surface does on a focus change: mark itself.
 *  No geometry, no repaint, no child added or removed — the law of the shell,
 *  and the reason these six can never drift apart again. */
function markFocus(root: HTMLElement | null, on: boolean): void {
  root?.classList.toggle("surf-focus", on);
}

export function registerBuiltinSurfaces(deps: SurfaceDeps): void {
  // ── TABLE ────────────────────────────────────────────────────────────────
  registerSurfaceType({
    id: "table",
    create(): Surface {
      let body: HTMLElement | null = null;
      let host: TableMount | null = null;
      return {
        mount(area, win) {
          body = document.createElement("div");
          body.className = "tile-tablebody";
          area.appendChild(body);
          const el = body;
          host = {
            body: el,
            get count() { return strip(el.parentElement, "win-strip-count"); },
            enabled: () => el.isConnected,
            place: surfacePlace(win),
          };
          deps.addEmDataHost(host);
        },
        // the host registry paints every mount from the one renderer
        refresh() { deps.renderEmData(); },
        setFocused(on) { markFocus(body, on); },
        destroy() {
          if (host) deps.removeEmDataHost(host);
          body?.remove();
          body = null;
          host = null;
        },
      };
    },
  });

  // ── STORAGE ──────────────────────────────────────────────────────────────
  registerSurfaceType({
    id: "storage",
    create(): Surface {
      let body: HTMLElement | null = null;
      let host: StorageMount | null = null;
      return {
        mount(area, win) {
          body = document.createElement("div");
          body.className = "tile-storagebody";
          area.appendChild(body);
          const el = body;
          host = {
            win, body: el,
            get crumb() { return strip(el.parentElement, "win-strip-crumb"); },
            get up() {
              return strip<HTMLButtonElement>(el.parentElement, "win-strip-up");
            },
            enabled: () => el.isConnected,
          };
          deps.addStorageHost(host);
        },
        refresh() { deps.renderStorage(); },
        setFocused(on) { markFocus(body, on); },
        destroy() {
          if (host) deps.removeStorageHost(host);
          body?.remove();
          body = null;
          host = null;
        },
      };
    },
  });

  // ── SHELF ────────────────────────────────────────────────────────────────
  registerSurfaceType({
    id: "shelf",
    create(): Surface {
      let body: HTMLElement | null = null;
      let win: Win | null = null;
      return {
        mount(area, w) {
          win = w;
          body = document.createElement("div");
          body.className = "tile-shelfbody shelf-body";
          area.appendChild(body);
          this.refresh();
        },
        refresh() {
          if (!body || !win || !body.isConnected) return;
          const el = body;
          const w = win;
          paintSurface(w, el, () =>
            deps.renderShelfInto(w, el, strip(el.parentElement, "win-strip-count")));
        },
        setFocused(on) { markFocus(body, on); },
        destroy() { body?.remove(); body = null; win = null; },
      };
    },
  });

  // ── VIEWER ───────────────────────────────────────────────────────────────
  registerSurfaceType({
    id: "viewer",
    create(): Surface {
      let root: HTMLElement | null = null;
      let stage: HTMLElement | null = null;
      let caption: HTMLElement | null = null;
      let bar: HTMLElement | null = null;
      let win: Win | null = null;
      return {
        mount(area, w) {
          win = w;
          root = document.createElement("div");
          root.className = "tile-viewer viewer-view";
          stage = document.createElement("div");
          stage.className = "viewer-stage";
          caption = document.createElement("div");
          caption.className = "viewer-caption";
          bar = document.createElement("div");
          bar.className = "viewer-bar hidden";
          root.append(bar, stage, caption);
          area.appendChild(root);
          this.refresh();
        },
        refresh() {
          if (!win || !stage || !caption || !bar || !stage.isConnected) return;
          const w = win, s = stage, c = caption, b = bar;
          paintSurface(w, s, () => deps.renderViewerInto(w, s, c, b));
        },
        setFocused(on) { markFocus(root, on); },
        destroy() {
          root?.remove();
          root = stage = caption = bar = null;
          win = null;
        },
      };
    },
  });

  // ── DOC ──────────────────────────────────────────────────────────────────
  registerSurfaceType({
    id: "doc",
    create(): Surface {
      let root: HTMLElement | null = null;
      let list: HTMLElement | null = null;
      let detail: HTMLElement | null = null;
      let win: Win | null = null;
      return {
        mount(area, w) {
          win = w;
          root = document.createElement("div");
          root.className = "doc-surface";
          list = document.createElement("div");
          list.className = "doc-list";
          detail = document.createElement("div");
          detail.className = "doc-detail";
          root.append(list, detail);
          area.appendChild(root);
          this.refresh();
        },
        refresh() {
          if (!win || !root || !list || !detail || !root.isConnected) return;
          const w = win, r = root, l = list, d = detail;
          // the direction is keyed to the SURFACE's width, never to who has the
          // focus — so entering this window reflows nothing (FOCUS-PARITY)
          deps.reflectDocWidth(r);
          // two scrollers, two slots: the list you had scrolled and the source
          // you were reading are both positions worth keeping
          paintSurface(w, l, () =>
            paintSurface(w, d, () => deps.renderDocViewInto(w, l, d), "doc-detail"),
            "doc-list");
        },
        setFocused(on) { markFocus(root, on); },
        destroy() {
          root?.remove();
          root = list = detail = null;
          win = null;
        },
      };
    },
  });

  // ── STUDY ────────────────────────────────────────────────────────────────
  //
  // The case that says whether the night worked. Until tonight a Study window
  // without the focus fell through to `tileNote` and its area showed a sentence
  // instead of the study — there was no "secondary Study surface" because
  // nobody had written one. There still is not: there is a Study surface, and it
  // is the only one, so the question of what an unfocused Study shows does not
  // arise. Not a second renderer: `renderStudyPanel` was already a function of
  // (root, store) and never knew about focus in the first place.
  registerSurfaceType({
    id: "study",
    create(): Surface {
      let body: HTMLElement | null = null;
      let win: Win | null = null;
      return {
        mount(area, w) {
          win = w;
          body = document.createElement("div");
          body.className = "tile-studybody study-body";
          area.appendChild(body);
          this.refresh();
        },
        refresh() {
          if (!body || !win || !body.isConnected) return;
          const el = body;
          paintSurface(win, el, () => deps.renderStudyInto(el));
        },
        setFocused(on) { markFocus(body, on); },
        destroy() { body?.remove(); body = null; win = null; },
      };
    },
  });
}

/** Declared, not deduced from an `if`: the annotator is single-instance because
 *  tracing needs `#annotator-image`, its overlay canvas and the module's draft
 *  state — one picture being traced, one draft. It is NOT converted tonight; this
 *  is how the limit would be stated when it is. */
export const ANNOTATOR_CAPABILITIES: SurfaceType["capabilities"] = {
  multiInstance: false,
};
