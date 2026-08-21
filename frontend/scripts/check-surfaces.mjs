// SURFACE-AUDIT · executable check of src/surface-scroll.ts — the discipline that
// keeps a window's CONTENT and its PLACE when the window loses the focus.
//
//   node scripts/check-surfaces.mjs
//
// What E.D. reported: "when a window loses the focus it empties and resets, and
// only fills again when it comes back". Two distinct mechanisms in `main.ts`
// produce that, and both are simulated here rather than described:
//
//   1. `renderTiles` DETACHES `#canvas-wrap` (so the `innerHTML` reset does not
//      destroy it) and re-attaches it. Detaching zeroes the `scrollTop` of
//      everything inside — measured in a browser: 900 → 0.
//   2. a surface MIGRATES: the same window's content is a singleton element
//      while it has the focus and a box built into an area when it does not.
//      Two different elements, so only the WINDOW is a stable name for the place.
//
// The DOM here is a small stand-in with real numbers (linkedom has no layout, so
// `scrollTop` would always be 0 and nothing could be measured). Each box knows
// its own height and clamps like a browser does — including the clamp that made
// the second write necessary: a box rebuilt shorter than it was cannot hold a
// large `scrollTop`, so a single write silently lands at 0.
//
// Frames are modelled too, because that clamp is the whole reason the module
// writes twice: `requestAnimationFrame` here collects callbacks, and `frame()`
// settles the heights (what a browser's layout pass does) and then runs them.
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

// ── 7 · the WRAP detach: everything scrolled inside it, by id ──────────────
{
  const inner = [
    makeBox("table-view-body", { clientHeight: 300, scrollHeight: 3000 }),
    makeBox("logpanel", { clientHeight: 200, scrollHeight: 1400 }),
    makeBox("emtree", { clientHeight: 200, scrollHeight: 900 }),
  ];
  inner[1].scrollTop = 640;
  inner[2].scrollTop = 300;
  inner[0].scrollTop = 1500;
  const wrap = makeBox("canvas-wrap", { clientHeight: 600, scrollHeight: 600 });
  wrap.children = inner;
  const kept = S.rememberScrollsIn(wrap);
  ok(!kept.includes("table-view-body"),
     "wrap · a MIGRATING surface is left to its window, not filed by element");
  eq(kept.sort(), ["emtree", "logpanel"],
     "wrap · everything else scrolled inside is remembered by id");
  for (const box of inner) box.reparent();            // the detach
  // the re-attach: `restoreScrollsIn` looks the elements up by id
  const byId = new Map(inner.map((b) => [b.id, b]));
  globalThis.document = { getElementById: (id) => byId.get(id) ?? null };
  S.restoreScrollsIn(kept);
  frame();                    // …including its second write, which looks ids up
  eq([byId.get("logpanel").scrollTop, byId.get("emtree").scrollTop], [640, 300],
     "wrap · …and put back after the re-attach");
  eq(byId.get("table-view-body").scrollTop, 0,
     "wrap · the migrating one is restored by its WINDOW instead (case 3)");
  delete globalThis.document;
}

// ── 8 · the table's `place`: a foreign module can hold the same key ────────
{
  const w = win("canvas:6", "table");
  const place = S.surfacePlace(w);
  place.remember(1016);
  eq(place.recall(), 1016, "place · emdata.ts can keep a row without knowing windows");
  eq(S.surfaceScroll.get(S.surfaceKey(w, "")), 1016,
     "place · …in the very same register the window's own surface reads");
}

// ── 9 · the table of migrating surfaces covers every type that has one ────
{
  // Not a list to keep in step by hand: the point is that the types whose
  // surface exists in TWO mounts are all declared, because one that is missing
  // is a window that loses its place and says nothing about it.
  const declared = Object.keys(S.FOCUSED_SURFACE_BOXES).sort();
  eq(declared,
     ["annotator", "doc", "narrative", "shelf", "storage", "table", "viewer"],
     "types · every window type with a migrating surface is declared");
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
  for (const boxes of Object.values(S.FOCUSED_SURFACE_BOXES))
    for (const b of boxes)
      ok(S.MIGRATING_SURFACE_IDS.has(b.id),
         `types · ${b.id} is exempt from the element-keyed register`);
}

// ── 10 · a place that was never set restores nothing (and breaks nothing) ──
{
  const w = win("canvas:7", "shelf");
  const box = makeBox("shelf-body", { clientHeight: 300, scrollHeight: 900 });
  S.paintSurface(w, box, () => box.rebuild("an empty shelf"));
  eq(box.scrollTop, 0, "surface · a surface nobody scrolled opens at the top");
  eq(box.content, "an empty shelf", "surface · …and still gets its content");
}

// ── 11 · THE FULL CYCLE, on a surface that OVERFLOWS · one case per type ────
//
// The two doubts left open by the end-of report, closed here. In the browser
// pass, shelf/viewer/doc/storage had no content taller than their box in either
// fixture, so only CONTENT PARITY was measured for them — the original bug (a
// long surface losing its place) stayed uncovered for exactly the four types that
// could not be made long enough on the day.
//
// What this can and cannot prove, stated rather than blurred: a headless DOM has
// no layout, so there are no real pixels to measure here (that is why this file
// models frames instead). What it proves is that the preservation machine is
// WIRED for these types and that a non-zero position survives a whole
// `renderTiles` cycle in both directions — and that it stops surviving the moment
// any one of the three pieces is removed. A real overflowing list, and a real
// picture in the annotator, remain a manual look / a future e2e.
const CYCLE_TYPES = [
  { type: "storage", boxes: [["storage-body", ""]], at: 1500,
    painted: "42 files, page 2" },
  { type: "shelf", boxes: [["shelf-body", ""]], at: 820,
    painted: "a long shelf: 60 entries" },
  { type: "viewer", boxes: [["viewer-stage", ""]], at: 640,
    painted: "a tall scan" },
  // the one with two scrollers: the list you walked and the source you were
  // reading are two places, and both have to come back
  { type: "doc", boxes: [["doc-view-list", "doc-list"],
                         ["doc-view-detail", "doc-detail"]],
    at: 700, painted: "the sources, and the one open" },
];

/** The focused surface of a window, as tall as it needs to be to overflow. */
function focusedBoxesFor(spec) {
  return new Map(spec.boxes.map(([id, slot], i) => [id, {
    slot,
    box: makeBox(id, { clientHeight: 300, scrollHeight: 4000 + i * 500 }),
  }]));
}

/**
 * One `renderTiles` cycle, in the order `main.ts` runs it.
 *
 * away: remember the focused boxes → the wrap is detached (every `scrollTop`
 * inside goes to 0, and the element-keyed register takes what is NOT migrating)
 * → the area's boxes are built and painted. back: remember the secondary boxes →
 * the focused ones are re-attached (zeroed again) → restore from the window.
 *
 * The secondary boxes are rebuilt SHORT (`0`), which is the real case: a body
 * that has just been filled is momentarily no taller than its viewport, so the
 * first write clamps and only the second one lands. That is what makes this
 * cycle bite when the `requestAnimationFrame` write is removed.
 */
function cycleAway(w, focused, spec, alsoInWrap = []) {
  S.rememberFocusedBoxes(w, (id) => focused.get(id)?.box ?? null);
  // the wrap detach, with the focused surfaces inside it: this is where the
  // element-keyed register would grab a migrating surface if it were not exempt
  const wrap = makeBox("canvas-wrap", { clientHeight: 600, scrollHeight: 600 });
  wrap.children = [...[...focused.values()].map((f) => f.box), ...alsoInWrap];
  const kept = S.rememberScrollsIn(wrap);
  for (const f of focused.values()) f.box.reparent();
  for (const b of alsoInWrap) b.reparent();
  // …and the secondary mount, built fresh into the area
  const secondary = new Map(spec.boxes.map(([id, slot]) => [slot, makeBox(
    `tile-${id}`, { clientHeight: 260, scrollHeight: 4000 })]));
  for (const [slot, box] of secondary) {
    const at = S.rememberSurfaceScroll(w, box, slot);
    box.rebuild(spec.painted, 0);          // filled, and still short
    S.restoreSurfaceScroll(w, box, at, slot);
  }
  frame();
  return { secondary, kept, wrap };
}

function cycleBack(w, secondary, focused, kept) {
  for (const [slot, box] of secondary) S.rememberSurfaceScroll(w, box, slot);
  for (const f of focused.values()) f.box.reparent();     // re-attached: zeroed
  S.restoreFocusedBoxes(w, (id) => focused.get(id)?.box ?? null);
  // whatever the element-keyed register kept is put back in the same pass, and
  // AFTER this one: if a migrating id were in there, it would win with a stale
  // number (measured in the browser before the exemption existed)
  globalThis.document = {
    getElementById: (id) => focused.get(id)?.box ?? null,
  };
  S.restoreScrollsIn(kept);
  frame();                    // the second writes run while the lookup exists
  delete globalThis.document;
}

for (const spec of CYCLE_TYPES) {
  const w = win(`cycle:${spec.type}`, spec.type);
  const focused = focusedBoxesFor(spec);
  // the reader is somewhere in the middle of a long surface
  let i = 0;
  for (const f of focused.values()) f.box.scrollTop = spec.at + i++ * 100;
  const wanted = [...focused.values()].map((f) => f.box.scrollTop);
  ok(wanted.every((v) => v > 0),
     `${spec.type} · a surface long enough for a position to exist (${wanted})`);

  const { secondary, kept } = cycleAway(w, focused, spec);

  // (a) the content is there — the window does not go blank while unfocused
  eq([...secondary.values()].map((b) => b.content),
     spec.boxes.map(() => spec.painted),
     `${spec.type} · the secondary mount carries the content, not a placeholder`);
  // (b) …and it opens where the reader was
  eq([...secondary.values()].map((b) => b.scrollTop), wanted,
     `${spec.type} · …at the position the focused surface had`);
  ok(!kept.some((id) => focused.has(id)),
     `${spec.type} · its box is left to its window, not filed by element`);

  // …and the way back, after being scrolled while unfocused
  const moved = [...secondary.values()].map((b, k) => {
    b.scrollTop = 250 + k * 90;
    return b.scrollTop;
  });
  cycleBack(w, secondary, focused, kept);
  eq([...focused.values()].map((f) => f.box.scrollTop), moved,
     `${spec.type} · and back into the focused surface where it was left`);
}

// ── 12 · the ANNOTATOR, with a picture in it ───────────────────────────────
//
// The other open doubt: the annotator's secondary surface was measured only in
// its EMPTY state, because neither fixture had an image the session could reach.
// Here it has one — the surface carries the photo and the region count — and the
// cycle has to leave both in place.
//
// What is deliberately NOT here is the tracing overlay: one `#annotator-image`,
// one overlay canvas and one in-progress gesture, so a second live annotator
// would be a second annotator rather than a second view of one. That is a
// declared limit, and the check states it instead of hiding it.
{
  const w = win("cycle:annotator", "annotator");
  const spec = { type: "annotator", boxes: [["annotator-stage", ""]],
                 painted: "photo:US-101.jpg · 7 regions traced" };
  const focused = focusedBoxesFor(spec);
  const stage = focused.get("annotator-stage").box;
  stage.content = "photo:US-101.jpg · 7 regions traced";
  stage.scrollTop = 1100;                      // a scan taller than the box

  const { secondary } = cycleAway(w, focused, spec);
  const box = secondary.get("");
  ok(/^photo:/.test(box.content),
     "annotator · the picture is in the secondary mount (not the empty state)");
  ok(/\d+ regions traced/.test(box.content),
     "annotator · …and so is what has been traced on it");
  eq(box.scrollTop, 1100,
     "annotator · at the same place in the scan the tracer had it");
  ok(!/overlay|canvas|draft/.test(box.content),
     "annotator · the tracing overlay is NOT here, by construction: one image " +
     "element, one overlay canvas, one gesture — the caption says where to trace");
  ok(S.FOCUSED_SURFACE_BOXES.annotator?.[0]?.id === "annotator-stage",
     "annotator · and the type is wired: its stage is the declared box");
}

// ── 13 · …and the second mount really exists in main.ts ────────────────────
//
// Cases 11 and 12 exercise the machine. This one asserts the CALLERS are there,
// because a type can be perfectly wired in this module and still show a
// placeholder — which is exactly what four of them did before the audit
// (`tileNote`: "step in to read and write here" instead of the story).
{
  const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  const secondary = main.slice(main.indexOf("function buildSecondarySurface"),
                              main.indexOf("function syncSecondaryPanels"));
  ok(secondary.length > 1000, "callers · buildSecondarySurface was found");
  // A marker's PRESENCE is not enough — measured while writing this: dropping
  // `|| win.type === "annotator"` from the branch condition sends an annotator
  // area back to the placeholder while `renderAnnotatorPictureInto(` is still
  // written a few lines below, inside a branch the type no longer reaches. So
  // each type must be NAMED, and its renderer must come after that name.
  const LIVE = [
    ["narrative", "renderNarrativeView("],
    ["shelf", "renderShelfInto("],
    ["viewer", "renderViewerInto("],
    ["annotator", "renderAnnotatorPictureInto("],
    ["doc", "renderDocViewInto("],
    ["table", "addEmDataHost("],
    ["storage", "tileStorageHosts.push("],
  ];
  const article = (w) => (/^[aeiou]/.test(w) ? "an" : "a");
  for (const [type, marker] of LIVE) {
    const named = secondary.indexOf(`win.type === "${type}"`);
    ok(named > 0, `callers · ${article(type)} ${type} area is recognised by its type`);
    const built = secondary.indexOf(marker);
    ok(built > named,
       `callers · …and builds a LIVE surface (${marker}), not a placeholder`);
  }
  // the note is still there for a type that genuinely has no second mount — and
  // it must be the LAST thing in the function, i.e. what nothing else claimed.
  // (Before the audit it caught four types that did have something to show.)
  const note = secondary.indexOf("tileNote(area, t(\"tile.enterNote\"");
  ok(note > 0, "callers · the fall-through placeholder is still there");
  for (const [type, marker] of LIVE) {
    ok(secondary.indexOf(marker) < note,
       `callers · ${marker} is reached BEFORE the placeholder`);
    ok(secondary.indexOf(`win.type === "${type}"`) < note,
       `callers · …and so is the test for ${article(type)} ${type} window`);
  }
}

console.log(`surfaces: ${checks} checks passed`);
