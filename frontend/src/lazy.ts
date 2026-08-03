/**
 * "Do it when the reader gets there" — one shared visibility gate.
 *
 * Three places in the app want the same thing: a narrative block whose map
 * should only start pulling tiles once it scrolls into view (N9), a 3D scene
 * that must not load a whole ATON app for a chapter nobody reached (N9), and a
 * Shelf list that would otherwise fetch a hundred thumbnails at once (N10).
 * They all want an IntersectionObserver, and none of them want to own one.
 *
 * Why there is a geometric check as well as the observer. A page whose
 * `visibilityState` is `hidden` — a background tab, an offscreen render, the
 * headless browser a screenshot test drives — never gets intersection callbacks
 * at all: Chromium does not compute intersections for a page it is not painting.
 * Relying on the observer alone would leave those contexts with a permanently
 * empty map, and "the content only appears if a human is watching" is a bad
 * contract for a tool that also has to print and screenshot. So the observer is
 * the efficient path, and a rect test against the viewport is the honest one;
 * whichever fires first wins, and everything is torn down afterwards.
 *
 * The implicit root (the viewport) is right even though the narrative scrolls
 * inside `#narrative-view` and the Shelf inside a modal: an element clipped away
 * by a scrolling ancestor reports ratio 0, so "visible" means visible to the
 * reader, not merely inside some box.
 */

/** How far outside the viewport still counts as "about to be read". */
const MARGIN = 120;

function inViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  // A detached or display:none element has an all-zero rect — not visible, and
  // notably not "visible because 0 ≤ 0".
  if (r.width === 0 && r.height === 0) return false;
  const h = window.innerHeight || 0;
  const w = window.innerWidth || 0;
  return r.bottom > -MARGIN && r.top < h + MARGIN &&
    r.right > -MARGIN && r.left < w + MARGIN;
}

/**
 * Call `fn` once, the first time `el` is (about to be) visible.
 *
 * Returns a disposer. Callers that rebuild their DOM — the narrative view
 * rebuilds on every change — can drop the element without leaking: the gate
 * unhooks itself as soon as it fires, and an observer on a detached element
 * never fires again.
 */
export function onFirstVisible(el: Element, fn: () => void): () => void {
  let done = false;
  let obs: IntersectionObserver | null = null;

  const dispose = (): void => {
    done = true;
    obs?.disconnect();
    obs = null;
    window.removeEventListener("scroll", check, true);
    window.removeEventListener("resize", check);
    document.removeEventListener("visibilitychange", check);
  };

  function fire(): void {
    if (done) return;
    dispose();
    fn();
  }

  function check(): void {
    if (done) return;
    if (inViewport(el)) fire();
  }

  if (typeof IntersectionObserver !== "undefined") {
    obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) fire();
    }, { rootMargin: `${MARGIN}px` });
    obs.observe(el);
  }
  // Capture-phase scroll on window sees scrolls inside any inner scroller
  // (scroll does not bubble, but it is dispatched through the capture path).
  window.addEventListener("scroll", check, true);
  window.addEventListener("resize", check);
  document.addEventListener("visibilitychange", check);
  // One deferred check, because callers wire this up before appending: by the
  // next task the element is in the tree and its rect means something.
  window.setTimeout(check, 0);

  return dispose;
}
