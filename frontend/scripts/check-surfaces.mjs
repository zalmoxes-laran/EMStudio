// SURFACE-AUDIT · executable check of the shell: `src/shell/layout.ts` (the
// arrangement as arithmetic) and `src/surface-scroll.ts` (the discipline that
// keeps a window's CONTENT and its PLACE).
//
//   node scripts/check-surfaces.mjs
//
// WHAT CHANGED (12 set 2026), because half of this file existed for a reason
// that is gone.
//
// It used to open by saying: «the DOM here is a small stand-in with real numbers
// (linkedom has no layout, so `scrollTop` would always be 0 and nothing could be
// measured)». That is still true of scrolling — a headless DOM has no layout —
// but it was ALSO true of the arrangement, and the arrangement was modelled by
// hand here because the geometry lived inside nested flex boxes that only a
// browser could resolve.
//
// It does not any more. `shell/layout.ts` computes every area's rectangle from
// the split tree with plain arithmetic, so §0 below runs the REAL function on
// REAL trees and checks real numbers — no model, no simulation.
//
// And the two mechanisms this file used to reproduce are one:
//
//   · GONE · `renderTiles` DETACHED `#canvas-wrap` and re-attached it, zeroing
//     every `scrollTop` inside (measured in a browser: 900 → 0). Nothing is
//     detached now, so `rememberScrollsIn`/`restoreScrollsIn` are deleted and
//     the cases that exercised them with them.
//   · LEFT · a surface MIGRATES: the same window's content is a singleton
//     element while it has the focus and a box built into an area when it does
//     not. Two types still do this — the narrative and the annotator — and for
//     them the machine below is still what carries the reader across.
//
// Frames are modelled, because the clamp is the whole reason the module writes
// twice: `requestAnimationFrame` here collects callbacks, and `frame()` settles
// the heights (what a browser's layout pass does) and then runs them.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}surface-scroll.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const S = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
/** …and the arrangement, which is now pure arithmetic and therefore RUNNABLE. */
const load = async (entry) => {
  const built = await esbuild.build({
    entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false,
  });
  return import("data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64"));
};
const L = await load("shell/layout.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

// ── a box that behaves like a scroller ──────────────────────────────────────
//
// `scrollTop` clamps to `scrollHeight - clientHeight`, which is the whole reason
// the module writes twice. `content` stands in for what a rebuild throws away.
const frameQueue = [];
globalThis.requestAnimationFrame = (fn) => { frameQueue.push(fn); return frameQueue.length; };
/** a layout pass: the boxes reach their real height, THEN the callbacks run */
function frame() {
  for (const box of settling.splice(0)) box.settle();
  for (const fn of frameQueue.splice(0)) fn();
}
const settling = [];

function makeBox(id, { clientHeight = 100, scrollHeight = 1000 } = {}) {
  let top = 0;
  const box = {
    id,
    content: "",
    clientHeight,
    scrollHeight,
    isConnected: true,
    children: [],
    get scrollTop() { return top; },
    set scrollTop(v) {
      top = Math.max(0, Math.min(Number(v) || 0, this.scrollHeight - this.clientHeight));
    },
    // what `rememberScrollsIn` walks
    querySelectorAll: () => box.children,
    /** a rebuild: the content goes, and until the next layout pass the box is
     *  SHORT — so a `scrollTop` written now clamps, exactly as it does in a
     *  browser. `frame()` is what makes it tall again. */
    rebuild(newContent, heightWhileBuilding = 0) {
      const full = box.scrollHeight;
      box.scrollHeight = box.clientHeight + heightWhileBuilding;
      top = Math.min(top, Math.max(0, box.scrollHeight - box.clientHeight));
      box.content = newContent;
      box.settle = () => { box.scrollHeight = full; };
      settling.push(box);
    },
    settle() {},
    /** a re-parenting (or a detach): every browser resets the position */
    reparent() { top = 0; },
  };
  return box;
}

const win = (id, type) => ({ id, type });

ok(typeof globalThis.requestAnimationFrame === "function",
   "frames · a layout pass is modelled, so the second write can be measured");

// ── 0 · THE ARRANGEMENT, with real numbers and no model ────────────────────
//
// This is the part that used to be impossible here. `layoutRects` is the very
// function the app runs, given the very trees `workspace.ts` builds, and the
// rectangles are checked as numbers.
{
  const leaf = (winId) => ({ kind: "leaf", winId });
  const row = (a, b, ratio = 0.5) => ({ kind: "split", dir: "row", ratio, a, b });
  const col = (a, b, ratio = 0.5) => ({ kind: "split", dir: "col", ratio, a, b });
  const ROOT = { x: 0, y: 0, w: 1000, h: 600 };
  const D = L.DIVIDER;

  // one window: the whole box, and no divider to grab
  {
    const { areas, dividers } = L.layoutRects(leaf("a"), ROOT);
    eq([...areas.keys()], ["a"], "layout · one window is placed once");
    eq(areas.get("a"), ROOT, "layout · …and it takes the whole shell");
    eq(dividers.length, 0, "layout · with nothing to divide there is no handle");
  }

  // two side by side: the handle takes its width OUT of the content, so the two
  // areas plus the divider are exactly the box — no overlap, no gap
  {
    const { areas, dividers } = L.layoutRects(row(leaf("a"), leaf("b")), ROOT);
    const a = areas.get("a"), b = areas.get("b");
    eq(a.w + D + b.w, ROOT.w, "layout · the two areas and the handle tile the box");
    eq(a.x, 0, "layout · the first starts at the edge");
    eq(b.x, a.w + D, "layout · …and the second after the handle");
    eq([a.h, b.h], [ROOT.h, ROOT.h], "layout · a row split leaves the height alone");
    eq(dividers[0].rect, { x: a.w, y: 0, w: D, h: ROOT.h },
       "layout · the handle is exactly the gap it reserved");
    eq(dividers[0].firstId, "a",
       "layout · …and the ratio is filed under the first leaf of the a side, " +
       "which is the name `setSplitRatio` has always used");
  }

  // a ratio is honoured, and the two sides still tile exactly
  {
    const { areas } = L.layoutRects(row(leaf("a"), leaf("b"), 0.3), ROOT);
    eq(areas.get("a").w, Math.round((ROOT.w - D) * 0.3),
       "layout · the ratio decides the first side");
    eq(areas.get("a").w + D + areas.get("b").w, ROOT.w,
       "layout · …and the rounding is absorbed by the second, never lost");
  }

  // a column split, and a nested tree: every leaf placed exactly once, every
  // rectangle inside the box, and no two of them overlapping
  {
    const tree = col(row(leaf("a"), leaf("b")), row(leaf("c"), col(leaf("d"), leaf("e"))));
    const { areas, dividers } = L.layoutRects(tree, ROOT);
    eq([...areas.keys()].sort(), ["a", "b", "c", "d", "e"],
       "layout · every leaf of a nested tree is placed, once");
    eq(dividers.length, 4, "layout · one handle per split");
    for (const [id, r] of areas) {
      ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= ROOT.w && r.y + r.h <= ROOT.h,
         `layout · ${id} is inside the shell`);
      ok(r.w >= 0 && r.h >= 0, `layout · ${id} has no negative extent`);
    }
    const list = [...areas.entries()];
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const [ia, ra] = list[i], [ib, rb] = list[j];
        const over = ra.x < rb.x + rb.w && rb.x < ra.x + ra.w &&
                     ra.y < rb.y + rb.h && rb.y < ra.y + ra.h;
        ok(!over, `layout · ${ia} and ${ib} do not overlap`);
      }
  }

  // a shell narrower than its own handle: the clamp, so no caller has to defend
  {
    const { areas } = L.layoutRects(row(leaf("a"), leaf("b")),
                                    { x: 0, y: 0, w: 4, h: 10 });
    ok(areas.get("a").w >= 0 && areas.get("b").w >= 0,
       "layout · a box too small for its handle still yields real rectangles");
  }

  // DETERMINISM · the same tree gives the same numbers, which is what lets
  // `positionAreas` write nothing when nothing moved
  {
    const tree = col(leaf("a"), row(leaf("b"), leaf("c"), 0.42));
    const one = L.layoutRects(tree, ROOT);
    const two = L.layoutRects(tree, ROOT);
    for (const id of one.areas.keys())
      ok(L.sameRect(one.areas.get(id), two.areas.get(id)),
         `layout · ${id} lands in the same place twice`);
    // …and a shell one pixel narrower really does move something. `c` and not
    // `b`: at this ratio `b` rounds to the same 417 either way — measured, and
    // worth keeping as the reminder that "nothing moved" is a claim about a
    // particular rectangle, not about the tree.
    ok(!L.sameRect(one.areas.get("c"),
                   L.layoutRects(tree, { ...ROOT, w: 999 }).areas.get("c")),
       "layout · …and a shell one pixel narrower moves an area, or `sameRect` " +
       "would be answering yes to everything");
  }
}

// ── 1 · a rebuilt surface keeps its place ───────────────────────────────────
{
  const w = win("canvas:1", "narrative");
  const box = makeBox("narrative-view", { clientHeight: 600, scrollHeight: 2500 });
  box.scrollTop = 900;
  S.paintSurface(w, box, () => box.rebuild("the story, again", 4000));
  eq(box.scrollTop, 900, "surface · a rebuild keeps the reader's place");
  eq(box.content, "the story, again", "surface · …and the content is the new one");
}

// ── 2 · …even when the rebuilt box is momentarily SHORTER ───────────────────
{
  const w = win("canvas:1", "narrative");
  const box = makeBox("narrative-view", { clientHeight: 600, scrollHeight: 2500 });
  box.scrollTop = 900;
  // the box is no taller than its viewport while the new tree is going in: a
  // write against that clamps to 0, which is the bug the second write answers
  S.paintSurface(w, box, () => box.rebuild("short then long", 0));
  eq(box.scrollTop, 0,
     "surface · …a write against a box that is still short lands at 0");
  frame();                                    // the layout settles, and then
  eq(box.scrollTop, 900,
     "surface · the second write is what puts a short-rebuilt box back");
}

// ── 3 · THE MIGRATION · focused element → secondary box ────────────────────
{
  const w = win("canvas:2", "narrative");
  const focused = makeBox("narrative-view", { clientHeight: 600, scrollHeight: 2500 });
  focused.scrollTop = 951;
  // the teardown reads the focused surface…
  S.surfaceScroll.set(S.surfaceKey(w, ""), focused.scrollTop);
  focused.reparent();                                  // the detach zeroes it
  eq(focused.scrollTop, 0, "surface · a detach really does reset the position");
  // …and the area's box, a DIFFERENT element, opens where the reader was
  const secondary = makeBox("tile-narrative", { clientHeight: 400, scrollHeight: 2500 });
  const at = S.rememberSurfaceScroll(w, secondary);
  secondary.scrollTop = 0;
  S.restoreSurfaceScroll(w, secondary, at);
  eq(secondary.scrollTop, 951,
     "surface · the place travels from the focused surface to the area's box");
}

// ── 4 · …and back again ────────────────────────────────────────────────────
{
  const w = win("canvas:2", "narrative");
  const secondary = makeBox("tile-narrative", { clientHeight: 400, scrollHeight: 2500 });
  secondary.scrollTop = 1200;                          // scrolled while unfocused
  S.rememberSurfaceScroll(w, secondary);               // read at the teardown
  const focused = makeBox("narrative-view", { clientHeight: 600, scrollHeight: 2500 });
  S.restoreSurfaceScroll(w, focused,
                         S.surfaceScroll.get(S.surfaceKey(w, "")) ?? 0);
  eq(focused.scrollTop, 1200,
     "surface · …and back into the focused surface when the window is entered");
}

// ── 5 · two windows of the SAME type do not share a place ──────────────────
{
  const a = win("canvas:3", "table");
  const b = win("canvas:4", "table");
  const boxA = makeBox("a", { clientHeight: 300, scrollHeight: 3000 });
  const boxB = makeBox("b", { clientHeight: 300, scrollHeight: 3000 });
  boxA.scrollTop = 700;
  boxB.scrollTop = 100;
  S.rememberSurfaceScroll(a, boxA);
  S.rememberSurfaceScroll(b, boxB);
  const freshA = makeBox("a2", { clientHeight: 300, scrollHeight: 3000 });
  const freshB = makeBox("b2", { clientHeight: 300, scrollHeight: 3000 });
  S.restoreSurfaceScroll(a, freshA, S.surfaceScroll.get(S.surfaceKey(a, "")));
  S.restoreSurfaceScroll(b, freshB, S.surfaceScroll.get(S.surfaceKey(b, "")));
  eq([freshA.scrollTop, freshB.scrollTop], [700, 100],
     "surface · each window keeps its own place (two tables, two rows)");
}

// ── 6 · a window whose surface is TWO boxes keeps both ─────────────────────
{
  const w = win("canvas:5", "doc");
  const list = makeBox("doc-view-list", { clientHeight: 300, scrollHeight: 2000 });
  const detail = makeBox("doc-view-detail", { clientHeight: 300, scrollHeight: 4000 });
  list.scrollTop = 500;
  detail.scrollTop = 1700;
  const atList = S.rememberSurfaceScroll(w, list, "doc-list");
  const atDetail = S.rememberSurfaceScroll(w, detail, "doc-detail");
  const list2 = makeBox("doc-list", { clientHeight: 300, scrollHeight: 2000 });
  const detail2 = makeBox("doc-detail", { clientHeight: 300, scrollHeight: 4000 });
  S.restoreSurfaceScroll(w, list2, atList, "doc-list");
  S.restoreSurfaceScroll(w, detail2, atDetail, "doc-detail");
  eq([list2.scrollTop, detail2.scrollTop], [500, 1700],
     "surface · the list you scrolled and the source you were reading, both");
  ok(S.surfaceKey(w, "doc-list") !== S.surfaceKey(w, "doc-detail"),
     "surface · …because a slot makes them two places, not one");
}

// ── 7 · GONE · the WRAP detach ─────────────────────────────────────────────
//
// This case remembered every scrolled box inside `#canvas-wrap` by element id,
// detached them all, and checked they came back — because `renderTiles` really
// did detach the wrap on every focus change and a detach zeroes `scrollTop` in
// every browser.
//
// `#canvas-wrap` is an AREA now: it is positioned by coordinates
// (`shell/layout.ts`) and never leaves the document, so there is nothing to
// remember and nothing to put back. The case is deleted with the functions it
// exercised rather than left passing on a stub, which would say the machine is
// still there.
//
// What replaced it as a fact anybody can check: `check-focus-parity.mjs` asserts
// that `selectWindow()` does not call `renderTiles()`, and the browser pass on
// 12 September measured a focus change at 0 nodes added and 0 removed (against
// 124–128 added and 63–66 removed before).

// ── 8 · the table's `place`: a foreign module can hold the same key ────────
{
  const w = win("canvas:6", "table");
  const place = S.surfacePlace(w);
  place.remember(1016);
  eq(place.recall(), 1016, "place · emdata.ts can keep a row without knowing windows");
  eq(S.surfaceScroll.get(S.surfaceKey(w, "")), 1016,
     "place · …in the very same register the window's own surface reads");
}

// ── 9 · the table of migrating surfaces is down to the two that still do ──
{
  // Not a list to keep in step by hand: the point is that the types whose
  // surface exists in TWO mounts are all declared, because one that is missing
  // is a window that loses its place and says nothing about it.
  //
  // ONE SURFACE · five rows left this table on 12 September — `table`,
  // `storage`, `shelf`, `viewer`, `doc` — and not because anybody decided to
  // stop carrying their place. They have ONE mount now, in the window's own
  // area, which is never detached: their position is simply where it was. A row
  // here for one of them would be describing a crossing that cannot happen.
  const declared = Object.keys(S.FOCUSED_SURFACE_BOXES).sort();
  eq(declared, ["annotator", "narrative"],
     "types · exactly the two types whose surface is still a singleton in the " +
     "wrap are declared");
  ok(!declared.includes("graph"),
     "types · not the canvas: its place is pan/zoom, kept per window in the " +
     "viewport register (measured in the browser, not here)");
  ok(!declared.includes("emtree") && !declared.includes("inspector"),
     "types · nor the panels: their element MOVES, so it is filed by id");
  for (const [type, boxes] of Object.entries(S.FOCUSED_SURFACE_BOXES)) {
    ok(boxes.length >= 1 && boxes.every((b) => b.id && typeof b.slot === "string"),
       `types · ${type} names the box that scrolls`);
    ok(new Set(boxes.map((b) => b.slot)).size === boxes.length,
       `types · ${type}'s boxes are in distinct slots`);
  }
  ok(S.MIGRATING_SURFACE_IDS === undefined,
     "types · and the exemption set is gone with the element-keyed register it " +
     "existed to carve a hole in");
}

// ── 10 · a place that was never set restores nothing (and breaks nothing) ──
{
  const w = win("canvas:7", "shelf");
  const box = makeBox("shelf-body", { clientHeight: 300, scrollHeight: 900 });
  S.paintSurface(w, box, () => box.rebuild("an empty shelf"));
  eq(box.scrollTop, 0, "surface · a surface nobody scrolled opens at the top");
  eq(box.content, "an empty shelf", "surface · …and still gets its content");
}

// ── 11 · THE FULL CYCLE, for the two types that still MIGRATE ──────────────
//
// This used to run six types through a whole `renderTiles` cycle: remember the
// focused boxes, detach the wrap (zeroing everything inside), build the area's
// boxes, paint, and back again. Four of those six no longer migrate, so their
// cases were not made to pass — they were made meaningless, and are gone.
//
// What is left is the cycle that still happens: `#canvas-wrap` changes OWNER
// when the focus moves between two of the types still bound to its singletons,
// and the narrative's content really does travel between `#narrative-view` and
// a `.tile-narrative` box. `setWrapOwner` in `main.ts` is the one place that
// does it, and these two halves are what it calls.
//
// What this can and cannot prove, stated rather than blurred: a headless DOM has
// no layout, so there are no real pixels here (that is why frames are modelled).
// What it proves is that the preservation machine is WIRED for these types and
// that a non-zero position survives a whole hand-over in both directions — and
// that it stops surviving the moment any one of the pieces is removed.
const CYCLE_TYPES = [
  { type: "narrative", boxes: [["narrative-view", ""]], at: 951,
    painted: "the story, all of it" },
  { type: "annotator", boxes: [["annotator-stage", ""]], at: 1100,
    painted: "photo:US-101.jpg · 7 regions traced" },
];

/** The singleton surface of a window, as tall as it needs to be to overflow. */
function focusedBoxesFor(spec) {
  return new Map(spec.boxes.map(([id, slot], i) => [id, {
    slot,
    box: makeBox(id, { clientHeight: 300, scrollHeight: 4000 + i * 500 }),
  }]));
}

/**
 * The wrap changes owner AWAY from this window: its singleton is remembered by
 * WINDOW, and the area that now has to draw it builds its own box and paints.
 *
 * The secondary box is rebuilt SHORT (`0`), which is the real case: a body that
 * has just been filled is momentarily no taller than its viewport, so the first
 * write clamps and only the second one lands. That is what makes this cycle bite
 * when the `requestAnimationFrame` write is removed.
 */
function cycleAway(w, focused, spec) {
  S.rememberFocusedBoxes(w, (id) => focused.get(id)?.box ?? null);
  for (const f of focused.values()) f.box.reparent();   // the singleton moves on
  const secondary = new Map(spec.boxes.map(([id, slot]) => [slot, makeBox(
    `tile-${id}`, { clientHeight: 260, scrollHeight: 4000 })]));
  for (const [slot, box] of secondary) {
    const at = S.rememberSurfaceScroll(w, box, slot);
    box.rebuild(spec.painted, 0);          // filled, and still short
    S.restoreSurfaceScroll(w, box, at, slot);
  }
  frame();
  return { secondary };
}

/** …and back: the wrap comes to this window again. */
function cycleBack(w, secondary, focused) {
  for (const [slot, box] of secondary) S.rememberSurfaceScroll(w, box, slot);
  for (const f of focused.values()) f.box.reparent();   // re-homed: zeroed
  S.restoreFocusedBoxes(w, (id) => focused.get(id)?.box ?? null);
  frame();
}

for (const spec of CYCLE_TYPES) {
  const w = win(`cycle:${spec.type}`, spec.type);
  const focused = focusedBoxesFor(spec);
  let i = 0;
  for (const f of focused.values()) {
    f.box.content = spec.painted;
    f.box.scrollTop = spec.at + i++ * 100;
  }
  const wanted = [...focused.values()].map((f) => f.box.scrollTop);
  ok(wanted.every((v) => v > 0),
     `${spec.type} · a surface long enough for a position to exist (${wanted})`);

  const { secondary } = cycleAway(w, focused, spec);

  // (a) the content is there — the window does not go blank while the wrap is
  //     somewhere else
  eq([...secondary.values()].map((b) => b.content),
     spec.boxes.map(() => spec.painted),
     `${spec.type} · the area's mount carries the content, not a placeholder`);
  // (b) …and it opens where the reader was
  eq([...secondary.values()].map((b) => b.scrollTop), wanted,
     `${spec.type} · …at the position the singleton had`);

  // …and the way back, after being scrolled while the wrap was away
  const moved = [...secondary.values()].map((b, k) => {
    b.scrollTop = 250 + k * 90;
    return b.scrollTop;
  });
  cycleBack(w, secondary, focused);
  eq([...focused.values()].map((f) => f.box.scrollTop), moved,
     `${spec.type} · and back into the singleton where it was left`);
}

// ── 12 · the ANNOTATOR's declared limit, stated rather than hidden ─────────
//
// The annotator's area gets the PICTURE and only the picture: one
// `#annotator-image`, one overlay canvas and one in-progress gesture, so a
// second live annotator would be a second annotator rather than a second view of
// one. That is a capability of the type, not a branch — `ANNOTATOR_CAPABILITIES`
// in `shell/types.ts` is how it reads once the type crosses over — and this
// asserts the declaration exists so the reason survives the conversion.
{
  const M = await load("shell/types.ts");
  eq(M.ANNOTATOR_CAPABILITIES, { multiInstance: false },
     "annotator · single-instance is DECLARED, with a reason, rather than " +
     "deduced from an `if` in the middle of main.ts");
  ok(S.FOCUSED_SURFACE_BOXES.annotator?.[0]?.id === "annotator-stage",
     "annotator · and the type is wired: its stage is the declared box");
}

// ── 13 · …and every surface really DRAWS, rather than announcing itself ────
//
// Cases 11 and 12 exercise the machine. This one asserts the surfaces exist and
// paint, because a type can be perfectly wired and still show a placeholder —
// which is exactly what four of them did before the August audit (`tileNote`:
// "step in to read and write here" instead of the story), and what the STUDY
// window still did yesterday.
//
// The six converted types are asked of the REGISTRY, not of a source read as
// text: each one is created, mounted into a stand-in element, and its renderer
// has to have been called. A type that is registered but paints nothing fails
// here rather than in a trench.
{
  const M = await load("shell/types.ts");
  const called = new Set();
  const deps = new Proxy({}, {
    get: (_, name) => (...args) => {
      called.add(name);
      // the table and the storage register a HOST and are painted through it
      if (name === "addEmDataHost" || name === "addStorageHost")
        called.add(`${name}:${args[0] && typeof args[0] === "object"}`);
      return undefined;
    },
  });
  M.registerBuiltinSurfaces(deps);
  /** the least DOM a surface needs to be mounted into */
  const makeEl = () => {
    const el = {
      className: "", dataset: {}, isConnected: true, children: [],
      scrollTop: 0, scrollHeight: 0, clientHeight: 0,
      classList: { toggle() {}, add() {}, contains: () => false },
      parentElement: null,
      appendChild(c) { el.children.push(c); c.parentElement = el; return c; },
      append(...cs) { cs.forEach((c) => el.appendChild(c)); },
      remove() {},
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    return el;
  };
  globalThis.document = { createElement: makeEl };
  const PAINTS = {
    table:   "addEmDataHost",
    storage: "addStorageHost",
    shelf:   "renderShelfInto",
    viewer:  "renderViewerInto",
    doc:     "renderDocViewInto",
    study:   "renderStudyInto",
  };
  for (const [type, renderer] of Object.entries(PAINTS)) {
    called.clear();
    const st = M.surfaceTypeOf(type);
    ok(st, `callers · "${type}" is a registered surface type`);
    const area = makeEl();
    const surface = st.create({ id: `w:${type}`, type, state: {} });
    surface.mount(area, { id: `w:${type}`, type, state: {} });
    ok(area.children.length > 0,
       `callers · mounting a ${type} surface puts a box into its area`);
    surface.refresh();
    ok(called.has(renderer),
       `callers · …and a ${type} surface PAINTS through \`${renderer}\`, rather ` +
         "than announcing its own name and waiting to be visited");
    // and the law: focusing it must not repaint or rebuild anything
    called.clear();
    const before = area.children.length;
    surface.setFocused(true);
    surface.setFocused(false);
    eq([...called], [],
       `callers · ${type}: setFocused calls no renderer — the focus decides ` +
       "where the events go, never what is drawn");
    eq(area.children.length, before,
       `callers · ${type}: …and adds or removes no child`);
    surface.destroy();
  }
  delete globalThis.document;
}

// ── 14 · what is LEFT of the old second path, and what it may still name ──
//
// `buildSecondarySurface` still exists, for the types that were not converted.
// It must name them and nothing else — a branch for a converted type would be
// the twin coming back under another name.
{
  const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  const Sorg = await import("./sorgenti.mjs");
  const body = Sorg.dentro(main, "buildSecondarySurface");
  ok(body.length > 0, "callers · buildSecondarySurface was found, by its AST");
  const literals = Sorg.stringheLetterali(body);
  for (const type of ["table", "storage", "shelf", "viewer", "doc", "study"])
    ok(!literals.includes(type),
       `callers · it must not name "${type}" — that type has ONE constructor now`);
  // …and the ones it does keep still build something live, each named with the
  // renderer that proves it
  for (const [type, marker] of [["narrative", "renderNarrativeView"],
                                ["annotator", "renderAnnotatorPictureInto"]]) {
    ok(literals.includes(type), `callers · a ${type} area is recognised by its type`);
    ok(Sorg.chiama(body, marker),
       `callers · …and builds a LIVE surface (${marker}), not a placeholder`);
  }
  // the note stays for a type that genuinely has neither — and it must be the
  // LAST thing, i.e. what nothing else claimed
  const note = body.indexOf('t("tile.enterNote"');
  ok(note > 0, "callers · the fall-through placeholder is still there");
  for (const marker of ["renderNarrativeView", "renderAnnotatorPictureInto"])
    ok(body.indexOf(marker) < note,
       `callers · ${marker} is reached BEFORE the placeholder`);
}

console.log(`surfaces: ${checks} checks passed`);
