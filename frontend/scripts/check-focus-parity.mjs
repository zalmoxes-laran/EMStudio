// FOCUS-PARITY · executable check of the two drawing paths — a MEASURE, before
// any repair.
//
//   node scripts/check-focus-parity.mjs
//
// E.D. noticed that some windows change layout depending on whether they have
// the focus. It is not strange: it is structural. EMStudio draws a window two
// ways — the focused window's surface, and `buildSecondarySurface()` for every
// other — and parity between the two paths is an invariant kept BY HAND, type by
// type. The code carries the history: `--palette-w` published on the AREA
// (FOCUS-NOJITTER / STEP A) for the graph, the table's head emptied into the
// window header (HDR2), the narrative's page moved from `#narrative-view` onto
// `.nv-view` because «the same story started 28 px higher there (measured: the
// first chapter at y 123 against y 151)».
//
// The windows that still move are the types nobody has levelled yet. Repairing
// one by hand leaves the others out, and the next type is born broken. So this
// asks the question of EVERY type at once.
//
// PARITY IS NOT AN IDENTICAL DOM. A secondary surface is legitimately a VIEW: it
// may lack the interactive tools, and that is fine. What has to coincide is the
// GEOMETRY and the INFORMATION:
//
//   · the head — one builder, and whatever it declares (counts, name, mode) must
//     be the same, because it is the text whose appearing and vanishing makes
//     «the rows move»;
//   · the box — the padding, the border and the direction of the surface, which
//     is where the content's origin comes from;
//   · what the head PROMISES must exist: a secondary surface that writes into an
//     element of the strip needs that element to be built for its type.
//
// A difference that is DELIBERATE is declared below, with the reason. Not
// tolerated in silence.
//
// WHAT THIS CANNOT MEASURE, said plainly: pixels. There is no layout in node
// (`check-surfaces.mjs` makes the same point and models numbers by hand). So what
// is measured here is the CAUSE of the pixel difference — a declaration that
// reaches one mount and not the other, a chrome row that exists in one state, an
// element the head promises and never builds. Every difference this found tonight
// was of exactly that kind.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const SRC = new URL("../src/", import.meta.url).pathname;
// …with its comments removed BEFORE anything is parsed. A comment INSIDE a
// block carries colons and would be read as a declaration — which it was, and
// this check reported a repair it had itself just verified as missing. Found by
// running it, which is the only way that kind of thing is ever found.
const CSS = (await readFile(`${SRC}style.css`, "utf8"))
  .replace(/\/\*[\s\S]*?\*\//g, "");
const TS = await readFile(`${SRC}main.ts`, "utf8");
const HTML = await readFile(new URL("../index.html", import.meta.url).pathname,
                            "utf8");

let checks = 0;
const ok = (cond, what) => {
  assert.ok(cond, what);
  checks++;
};
const rows = [];

// ── the two mounts of each type ──────────────────────────────────────────────
//
// This mapping is knowledge the check has to hold: the two paths ARE two pieces
// of code, and nothing in the source states the pairing. It is data, so adding a
// type is a line here — and a type missing from it is caught below.
const MOUNTS = {
  graph:     { focused: ["#canvas-wrap"], secondary: ["#canvas-wrap"] },
  narrative: { focused: ["#narrative-view", ".nv-view"],
               secondary: [".tile-narrative", ".nv-view"] },
  table:     { focused: ["#table-view-body"], secondary: [".tile-tablebody"] },
  doc:       { focused: ["#doc-view"], secondary: [".doc-surface"] },
  storage:   { focused: ["#storage-body"], secondary: [".tile-storagebody"] },
  shelf:     { focused: ["#shelf-body", ".shelf-body"],
               secondary: [".tile-shelfbody", ".shelf-body"] },
  viewer:    { focused: ["#viewer-view", ".viewer-view"],
               secondary: [".tile-viewer", ".viewer-view"] },
  inspector: { focused: ["#panel-view"], secondary: [".tile-panel"] },
  emtree:    { focused: ["#panel-view"], secondary: [".tile-panel"] },
  annotator: { focused: ["#annotator-view"], secondary: [".tile-viewer"] },
};

// ── differences that are DELIBERATE, each with its reason ────────────────────
//
// A declaration listed here may differ between the mounts. Everything else may
// not. The reason is the point: a tolerated difference with no reason beside it
// becomes, in six months, a difference nobody dares touch.
const ALLOWED = {
  // The focused mount is an OVERLAY over the canvas; a secondary mount is a
  // flex child of its area. Neither belongs to the other, and neither decides
  // where the content starts inside the box.
  position: "the focused mount is an overlay, the secondary a child of its area",
  inset: "same",
  "z-index": "same",
  flex: "the area's plumbing: a secondary surface fills its tile",
  "min-height": "same — `0`, so a flex child may shrink",
  // The focused mount clips (it is an overlay of fixed extent); an area
  // SCROLLS. That is the area's job, not a difference in the surface.
  overflow: "the focused mount clips, an area scrolls",
  "overflow-y": "same",
};

//: the declarations that DECIDE where content starts, and how it is laid out.
//: These are the ones parity is about.
const BOX = ["padding", "padding-top", "padding-bottom", "padding-left",
             "padding-right", "border", "border-top", "border-bottom",
             "border-width", "margin", "margin-top", "margin-bottom", "gap",
             "display", "flex-direction", "align-items", "height"];

//: PAINT, reported and NOT failed. A different ground is worth seeing and is not
//: a reason to fail: it moves nothing. It is also the one property whose
//: comparison is unfair here, because the two mounts sit at different depths —
//: the focused table's ground is on its WRAPPER (`#table-view`) and the
//: secondary's on the box itself, and both are right.
const PAINT = ["background"];

/** The box declarations that reach an element carrying `selectors`.
 *
 *  Cascade order, no specificity arithmetic: the blocks in this stylesheet are
 *  one selector list each, so «the last block that names me wins» is what the
 *  browser does here too. A `.hidden` variant is skipped — it is a state, not
 *  the resting box. */
function boxOf(selectors) {
  const found = {};
  for (const match of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const list = match[1].split(",").map((s) => s.trim());
    if (!list.some((s) => selectors.includes(s))) continue;
    for (const declaration of match[2].split(";")) {
      const at = declaration.indexOf(":");
      if (at < 0) continue;
      const key = declaration.slice(0, at).trim();
      const value = declaration.slice(at + 1).trim();
      if (BOX.includes(key) || PAINT.includes(key) || ALLOWED[key]) {
        found[key] = value;
      }
    }
  }
  return found;
}

// ── 1 · the head is ONE builder, and the flag decides only a style ───────────
{
  const start = TS.indexOf("function buildAreaHeader(");
  ok(start > 0, "buildAreaHeader is where the head is built");
  const body = TS.slice(start, TS.indexOf("\n}", start));
  // `active` used as a VALUE: not part of another word (`activeWin`), and not
  // inside a string — `classList.toggle("active", …)` names a CSS class twice in
  // here and has nothing to do with the focus. Counting those was this check's
  // own first bug, found by running it.
  const code = body.replace(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g, '""');
  const uses = [...code.matchAll(/(?<![A-Za-z])active(?![A-Za-z])/g)];
  ok(uses.length === 2,
    "the focus flag is read ONCE in the head builder (plus its parameter) — " +
      `found ${uses.length}. A second branch means the two heads can differ, ` +
      "which is the whole defect: it is the text that appears and vanishes " +
      "that makes the rows move.");
  ok(/if \(!active\) frag\.querySelectorAll\("\*"\)/.test(body),
    "…and what it decides is a CLASS, not a structure");
  ok(!/\.hdr-passive\s*\{[^}]*(padding|margin|font-size|display|height)/.test(CSS),
    "`.hdr-passive` must not change a box metric: it is the hook that makes an " +
      "unfocused head quieter, and a quieter head that is also SHORTER moves " +
      "everything below it");
}

// ── 2 · what the head promises, the head builds ──────────────────────────────
{
  const strip = TS.slice(TS.indexOf("function buildHeaderStrip("));
  const stripBody = strip.slice(0, strip.indexOf("\n}\n"));
  // every type whose secondary surface writes into an element of the strip
  const wanted = [...TS.matchAll(
    /win\.type === "(\w+)"[\s\S]{0,600}?\.tile-bar \.win-strip-(\w+)/g)];
  // …and the ones the secondary surfaces look up, by class
  const looked = [...TS.matchAll(/\.tile-bar \.win-strip-(\w+)/g)]
    .map((m) => m[1]);
  ok(looked.length > 0, "some secondary surface writes into the strip");
  for (const name of new Set(looked)) {
    ok(stripBody.includes(`win-strip-${name}`),
      `a secondary surface looks up \`.win-strip-${name}\` in the strip, so ` +
        "`buildHeaderStrip` must build it — otherwise the lookup returns null " +
        "and that information silently disappears away from the focus");
  }
  void wanted;
  // the shelf is the type this caught: it asked for a count the strip never
  // made. It now builds its WHOLE row of chrome here — see §5 — which is what
  // finally levelled it.
  ok(/win\.type === "shelf"/.test(stripBody),
    "the shelf's own chrome is built in the STRIP, by the one builder both " +
      "mounts call. While it lived in `#shelf-bar` — inside `#shelf-view`, the " +
      "focused mount — no amount of levelling the box could help: the two " +
      "mounts did not carry the same amount of furniture.");
}

// ── 3 · the box of each type, both mounts ────────────────────────────────────
{
  const types = [...TS.matchAll(/^\s{2}(\w+): \{ icon:/gm)].map((m) => m[1]);
  void types;
  for (const [type, mounts] of Object.entries(MOUNTS)) {
    const a = boxOf(mounts.focused);
    const b = boxOf(mounts.secondary);
    const differ = [];
    const painted = [];
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (ALLOWED[key] || a[key] === b[key]) continue;
      const said = `${key} ${a[key] ?? "—"} vs ${b[key] ?? "—"}`;
      (PAINT.includes(key) ? painted : differ).push(said);
    }
    rows.push([type, differ.length ? differ.join(" · ")
                   : painted.length ? `ok · paint: ${painted.join(" · ")}`
                   : "ok"]);
    ok(differ.length === 0,
      `${type}: the two mounts disagree on ${differ.join(" · ")}. The box goes ` +
        "on the CLASS both mounts carry; only position and stacking go on the " +
        "id — the rule `.nv-view` states, with the 28px it was measured by.");
  }
}

// ── 4 · the reserved width is published on the AREA, in both states ──────────
{
  ok(/area\.style\.setProperty\("--palette-w"/.test(TS)
     || /setProperty\("--palette-w"/.test(TS),
    "`--palette-w` is published on the element that reserves the width");
  const panel = TS.slice(TS.indexOf("function buildResourcePanel("));
  ok(/setProperty\("--palette-w"/.test(panel.slice(0, 2000)),
    "…by `buildResourcePanel`, which BOTH paths call — the focused area and " +
      "every other (FOCUS-NOJITTER / STEP A)");
  const pane = TS.slice(TS.indexOf("function buildPane("));
  const paneBody = pane.slice(0, pane.indexOf("\n}\n"));
  ok((paneBody.match(/buildResourcePanel\(/g) ?? []).length >= 2,
    "…called for the focused area AND for a secondary one, or a window with " +
      "its panel open would be a different size in the two states");
}

// ── the nine of `#shelf-bar`, and where each of them went ───────────────────
//
// THE TRAP, closed by naming it: the fastest way to turn `shelf ⚠` green is to
// DELETE the bar and the nine controls with it. So the inventory is data here,
// each entry asserted at its new address and printed at the end. A function that
// quietly disappeared fails this check, rather than being discovered in six
// months in a trench.
const NINE = [
  ["the list's NAME",   /win-strip-shelfname/, "header strip"],
  ["its entry COUNT",   /win-strip-count/,     "header strip"],
  ["⟳ refresh",         /win-strip-refresh/,   "header strip · Table mode only"],
  ["the URI field",     /shelf-uri-input/,     "+ URI form"],
  ["the FENCE select",  /shelf-uri-scope/,     "+ URI form"],
  ["the ACCESS select", /shelf-uri-access/,    "+ URI form"],
  ["the ADD verb",      /shelf-uri-go/,        "+ URI form"],
  ["OPEN…",             /"menu\.shelfOpen"/,   "Shelf menu"],
  ["SAVE",              /"menu\.shelfSave"/,   "Shelf menu"],
];

// ── 5 · a chrome row that exists in ONE state only ───────────────────────────
//
// The repair pattern is HDR2's: what a per-type bar DECLARES moves into the
// window header, and the bar is hidden — in both states, so neither mount pays
// for a row the other does not have. The bars already treated that way are
// asserted here; a new one must join them or be declared.
{
  const hidden = /#storage-bar,\s*#table-view-head \{ display: none; \}/.test(CSS);
  ok(hidden, "`#storage-bar` and `#table-view-head` are neutralised in BOTH " +
             "states (HDR2), so neither mount carries a second row");
  // `#shelf-bar` WAS the one declared structural difference: nine controls in a
  // row that existed in the focused mount only. It is gone, and so is the
  // declaration — an exception left standing after its cause has been removed is
  // worse than the exception, because it teaches people not to trust this table.
  ok(!/id="shelf-bar"/.test(HTML),
    "`#shelf-bar` is gone from the markup (HDR2): the shelf's chrome is in the " +
      "window header, which both mounts build");
  ok(!/#shelf-bar/.test(CSS),
    "…and so are its rules — a row that no longer exists must not keep a box");
  // THE TRAP, closed by naming it: the fastest way to make the check above pass
  // is to DELETE the bar and its nine controls. So each of the nine is asserted
  // at its new address. A function that quietly disappeared would fail here, not
  // in six months in a trench.
  for (const [what, pattern, where] of NINE) {
    ok(pattern.test(TS),
      `${what} must still be reachable — it lives in ${where} now. Nothing of ` +
        "the nine was allowed to go missing on the way out of `#shelf-bar`.");
  }
  // …and the form is a FORM, not four more boxes in the row: one chip opens it
  ok(/function openShelfUriForm\(/.test(TS),
    "the four controls that make one gesture (address · fence · access · add) " +
      "are a popover behind one chip. The invariant is a single row of CHROME, " +
      "not a single row that contains everything: two inputs and two selects " +
      "in one row is a row nobody reads.");
}

// ── the table, which is the point of the exercise ────────────────────────────
console.log("\n  type × parity");
for (const [type, verdict] of rows) {
  console.log(`    ${type.padEnd(12)} ${verdict}`);
}

// …and the nine, one per line, because "nothing was lost" is a claim that has to
// be readable rather than trusted.
console.log("\n  the nine of #shelf-bar × where they went");
for (const [what, , where] of NINE) {
  console.log(`    ${what.padEnd(18)} ${where}`);
}
console.log(`\nfocus-parity: ${checks} checks passed`);
