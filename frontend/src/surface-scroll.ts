/**
 * WHERE THE READER WAS — one home for keeping content and place across a
 * re-render, a re-parenting, or a change of focus.
 *
 * SURFACE-AUDIT (2026-08-20) · this discipline was invented three times in
 * `main.ts` — once for the panels (HDR2), once for the storage listing, once for
 * the EM-Data tables — and was therefore missing everywhere else. E.D. reported
 * it as "a window empties and resets when it loses the focus". Gathering it here
 * is what let the audit be a pass over EVERY window type rather than a fourth
 * copy: a new surface needs a call, not a mechanism.
 *
 * Two registers, because there are two ways a surface loses its place:
 *
 * * `panelScroll`, by ELEMENT ID — for the singletons that are MOVED: the four
 *   panels travel between the aside and whichever area claims them;
 * * `surfaceScroll`, by WINDOW (plus a slot, for the types whose surface is two
 *   boxes) — for the surfaces that are REBUILT, and for the two that still
 *   MIGRATE between the singleton inside `#canvas-wrap` and an area's own box.
 *   Those are different elements holding the same window's content, so only the
 *   window is a stable name for the place.
 *
 * ONE SURFACE (12 set 2026) · the third register is GONE, and with it the reason
 * most of this file existed. `#canvas-wrap` used to be DETACHED and re-attached
 * on every focus change, which zeroes every `scrollTop` inside it; it is placed
 * by coordinates now and never leaves the document. See the note where
 * `rememberScrollsIn` used to be.
 *
 * Nothing here reaches for the app's state: the caller says which window and
 * which box. That is what makes it checkable outside a browser
 * (`scripts/check-surfaces.mjs`).
 */
import type { WindowType } from "./workspace";

/** Just what this module needs of a window: WIN's own `Win` satisfies it. */
export interface SurfaceWin {
  id: string;
  type: WindowType;
}

/**
 * HDR2 · keep the SCROLL across a rebuild (or a re-parenting).
 *
 * The symptom: scroll a long panel down, move the focus to another window, and
 * the one you left jumps back to the top. Two causes, both real — the panel's
 * body is rebuilt (`innerHTML = ""` and a fresh tree) and the singleton element
 * is MOVED into another area's box, which resets `scrollTop` in every browser.
 *
 * So the position is saved and put back around whatever does that. And it is put
 * back TWICE when it has to be: right after the rebuild the new content can be
 * momentarily shorter than the old, and a `scrollTop` written against a short
 * body clamps to 0 — the frame after, when the layout has settled, it takes.
 * (Measured: without the second write the inspector landed a few hundred pixels
 * above where it had been.)
 */
/**
 * …and across the WHOLE release→re-home cycle, which is what a focus change is.
 *
 * Measured, and the reason the first fix was not enough: moving the focus runs
 * `renderTiles`, which sends every hosted panel back to `#side` (a move: scroll
 * 0) and then re-homes it into the new tree. By the time the re-home could
 * restore anything the position was already gone — so it is remembered HERE, at
 * the release, and put back when the panel lands. Keyed by panel id, because the
 * element is the same singleton wherever it goes.
 */
export const panelScroll = new Map<string, number>();

/** …and the same for the surfaces that are REBUILT rather than moved (a storage
 *  listing, a narrative, a shelf): after a tree rebuild the body is a different
 *  element, so the position belongs to the WINDOW — plus a slot, for the types
 *  whose surface is two boxes (a Doc window's list and detail). */
export const surfaceScroll = new Map<string, number>();

/** `requestAnimationFrame` where there is one; otherwise the second write is
 *  simply not attempted — the first one is what matters, and a checker has no
 *  frames to wait for. */
function nextFrame(fn: () => void): void {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(fn);
}

export function surfaceKey(win: SurfaceWin, slot: string): string {
  return slot ? `${win.id}:${slot}` : win.id;
}

/**
 * Where a rebuilt surface WAS — its own `scrollTop` when it still has one, else
 * what the last render remembered for this window. Called before the rebuild.
 *
 * SURFACE-SCROLL · these three exist once, and everything that rebuilds a
 * surface goes through them: the storage listing had this logic inline three
 * times, and every other type had it nowhere, which is exactly the shape of "it
 * was fixed for some windows".
 */
export function rememberSurfaceScroll(win: SurfaceWin, box: HTMLElement, slot = ""): number {
  const key = surfaceKey(win, slot);
  if (box.scrollTop) surfaceScroll.set(key, box.scrollTop);
  return box.scrollTop || surfaceScroll.get(key) || 0;
}

/** …and put it back, twice when it has to be: a body that has just been rebuilt
 *  can be momentarily shorter than the old one, and a `scrollTop` written
 *  against a short box clamps to 0 (measured on the storage listing). */
export function restoreSurfaceScroll(win: SurfaceWin, box: HTMLElement, at: number,
                              slot = ""): void {
  if (!at) return;
  box.scrollTop = at;
  if (box.scrollTop !== at)
    nextFrame(() => { box.scrollTop = at; });
  surfaceScroll.set(surfaceKey(win, slot), at);
}

/** …as a pair a foreign module can hold (`EmDataHost.place`): the table is
 *  rendered by `emdata.ts`, which knows nothing about windows. */
export function surfacePlace(win: SurfaceWin, slot = ""):
    { recall: () => number; remember: (at: number) => void } {
  return {
    recall: () => surfaceScroll.get(surfaceKey(win, slot)) ?? 0,
    remember: (at: number) => surfaceScroll.set(surfaceKey(win, slot), at),
  };
}

/** The two of them around a paint that rebuilds the box in place. */
export function paintSurface(win: SurfaceWin, box: HTMLElement, paint: () => void,
                      slot = ""): void {
  const at = rememberSurfaceScroll(win, box, slot);
  paint();
  restoreSurfaceScroll(win, box, at, slot);
}

/*
 * GONE (14 set 2026) · `FOCUSED_SURFACE_BOXES`, and the two loops over it.
 *
 * The table named the surfaces that MIGRATED — the same window's content living
 * in a singleton inside `#canvas-wrap` while it had the focus and in an area's
 * own box when it did not, so that only the WINDOW was a stable name for the
 * reader's place. It had seven rows on 12 September, five on the 12th at
 * midnight, two on the 13th, and none tonight: every type builds its surface in
 * its own area, and no area is ever detached.
 *
 * `rememberFocusedBoxes` / `restoreFocusedBoxes` are deleted with it rather than
 * left empty. What remains in this module is the discipline that is still true —
 * a surface REBUILT in place loses its scroll, and `paintSurface` is what puts
 * it back.
 */

/** How a caller finds its boxes. `main.ts` passes the document; a checker passes
 *  its own map — which is what lets the two loops below be exercised outside a
 *  browser instead of re-implemented there. */
export type BoxLookup = (id: string) => HTMLElement | null;

/*
 * GONE (12 set 2026) · `rememberScrollsIn` / `restoreScrollsIn`.
 *
 * They existed for one reason, written in their own doc-comment: «`renderTiles`
 * DETACHES that wrap (so the `innerHTML` reset below does not destroy it) and
 * re-attaches it into the new tree — and detaching an element resets the
 * `scrollTop` of everything inside it, in every browser. So the position of the
 * surface you were reading was lost on every focus change, whatever type of
 * window it was. Measured: 900 → 0.»
 *
 * There is no `innerHTML` reset and no detach now. `#canvas-wrap` is placed by
 * coordinates like every other area (`shell/layout.ts`) and never leaves the
 * document, so nothing inside it is ever zeroed and there is nothing to put
 * back. They are deleted rather than left unused, because a helper that repairs
 * a destruction that no longer happens is an invitation to bring the destruction
 * back.
 *
 * `MIGRATING_SURFACE_IDS` went with them: it existed only so that loop would
 * SKIP the ids `FOCUSED_SURFACE_BOXES` owns.
 */

export function rememberPanelScroll(el: HTMLElement | null): void {
  if (!el?.id) return;
  const scroller = scrollerOf(el);
  const at = scroller?.scrollTop ?? 0;
  if (at) panelScroll.set(el.id, at);
}

export function restorePanelScroll(el: HTMLElement | null): void {
  if (!el?.id) return;
  const at = panelScroll.get(el.id);
  if (!at) return;
  const scroller = scrollerOf(el);
  if (!scroller) return;
  scroller.scrollTop = at;
  if (scroller.scrollTop !== at) {
    nextFrame(() => { scroller.scrollTop = at; });
  }
}

export function preservingScroll<T>(el: HTMLElement | null | undefined, fn: () => T): T {
  if (!el) return fn();
  const top = el.scrollTop;
  const left = el.scrollLeft;
  const out = fn();
  if (!top && !left) return out;
  el.scrollTop = top;
  el.scrollLeft = left;
  if (el.scrollTop !== top) {
    nextFrame(() => {
      el.scrollTop = top;
      el.scrollLeft = left;
    });
  }
  return out;
}

/** The element that actually SCROLLS inside a panel — the panel box itself when
 *  it is the scroller, otherwise its `.panel-body`-ish child. Read from the DOM
 *  rather than assumed, because the four panels are built by four modules. */
export function scrollerOf(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  if (el.scrollHeight > el.clientHeight + 1) return el;
  const inner = Array.from(el.querySelectorAll<HTMLElement>("*")).find(
    (c) => c.scrollHeight > c.clientHeight + 1
      && getComputedStyle(c).overflowY !== "visible");
  return inner ?? el;
}
