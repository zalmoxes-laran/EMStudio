// ONE SURFACE · the fence that used to MEASURE the distance between two drawing
// paths, now asserting that the second one does not exist.
//
//   node scripts/check-focus-parity.mjs
//
// WHAT THIS FILE USED TO BE, and why it changed trade (12 set 2026).
//
// EMStudio drew a window two ways: the singleton surfaces inside `#canvas-wrap`
// for the window that had the focus, and `buildSecondarySurface()` for every
// other one. Parity between the two was an invariant kept BY HAND, type by
// type — and this check measured it: the head, the box, what the head promised.
// It was honest work and it found real things (the shelf's nine controls, the
// narrative's 28 px, the table's re-measured head).
//
// But a check that measures the distance between two paths accepts that there
// are two. Six types have one now, and for those the question "do the two mounts
// agree?" has no referent. So for them this asserts something stronger and much
// cheaper to keep true: THERE IS NO SECOND PATH. No singleton in the markup, no
// branch in `applyWindowSurface`, no row in `FOCUSED_SURFACE_BOXES`, no mention
// in `buildSecondarySurface` — and `selectWindow()` does not rebuild the tree.
//
// The types that were NOT converted keep the old clauses, and they are named
// here in clear: a fence that protects half a repo without saying which half is
// worse than two fences.
//
// And the rule of the house (5 ottobre): a guard that searches for a word inside
// a source read as text measures the FILE, not the PROGRAM. Everything below
// goes through `sorgenti.mjs` — the TypeScript compiler for the code, `linkedom`
// for the markup, the parsed rule for the stylesheet — or through the module
// itself, imported and run.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as esbuild from "esbuild";
import ts from "typescript";
import * as Sorg from "./sorgenti.mjs";

const SRC = new URL("../src/", import.meta.url).pathname;
const CSS = (await readFile(`${SRC}style.css`, "utf8"))
  .replace(/\/\*[\s\S]*?\*\//g, "");
const TS = await readFile(`${SRC}main.ts`, "utf8");
const SHELL = await readFile(`${SRC}shell/types.ts`, "utf8");
const HTML = await readFile(new URL("../index.html", import.meta.url).pathname,
                            "utf8");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };

/**
 * Does this piece of code name a WINDOW TYPE?
 *
 * A string literal, and only a string literal — never an identifier. The house
 * rule of 5 ottobre arriving in a new disguise: `Sorg.nomina` also answers YES
 * for an identifier, and the first run of this fence failed on
 * `buildSecondarySurface` "naming doc" because the narrative branch reads
 * `store?.doc`. The document of the app and the Doc window type are two things
 * that happen to be spelled the same, and a window type is only ever written as
 * `win.type === "doc"` — a whole literal. Constructed by running it.
 */
const nominaTipo = (source, type) =>
  Sorg.stringheLetterali(source).includes(type);

// ── the two halves of the repo, named ───────────────────────────────────────
//
// CONVERTED: one constructor, in `shell/types.ts`, for every area of that type.
// The second column is the singleton that USED to be its focused mount, kept
// here so its absence can be asserted by name rather than by hoping.
const CONVERTED = {
  table:   ["table-view", "table-view-head", "table-view-body", "table-view-actions"],
  storage: ["storage-view", "storage-bar", "storage-body"],
  shelf:   ["shelf-view", "shelf-body"],
  viewer:  ["viewer-view", "viewer-stage", "viewer-caption", "viewer-bar"],
  doc:     ["doc-view", "doc-view-list", "doc-view-detail"],
  study:   ["study-view", "study-body"],
};
// NOT converted, and each with the singleton that is the reason why. These keep
// the old parity clauses, below.
const UNCONVERTED = {
  graph:     "#canvas — the interaction machine is bound to it",
  narrative: "#narrative-view — the writing editors are bound to it",
  emtree:    "#panel-view — the panels are singletons re-homed into it",
  inspector: "#panel-view — same",
  annotator: "#annotator-image + the module's draft state (one tracing at a time)",
};

// ════════════════════════════════════════════════════════════════════════════
// A · for the SIX: the second path does not exist
// ════════════════════════════════════════════════════════════════════════════

// ── A1 · no singleton in the markup, and no rules left behind ───────────────
{
  for (const [type, ids] of Object.entries(CONVERTED)) {
    for (const id of ids) {
      ok(Sorg.elementi(HTML, `#${id}`).length === 0,
        `${type}: \`#${id}\` must not be in index.html. It was the FOCUSED mount ` +
          "of this type, and a singleton in the markup IS the second path — the " +
          "one the window that happens to have the focus uses and no other area " +
          "can.");
      ok(!Sorg.miraA(CSS, `#${id}`),
        `${type}: …and no rule may still aim at \`#${id}\`. A box that survives ` +
          "its element teaches the next person that the element is coming back.");
    }
  }
}

// ── A2 · no branch in `applyWindowSurface` ─────────────────────────────────
{
  const body = Sorg.dentro(TS, "applyWindowSurface");
  ok(body.length > 0, "applyWindowSurface was found (by its AST, not its name)");
  for (const type of Object.keys(CONVERTED)) {
    ok(!nominaTipo(body, type),
      `applyWindowSurface must not name "${type}": that function decides which ` +
        "SINGLETON is showing, and a converted type has none — its surface is " +
        "its window's own area, focused or not.");
  }
  // …and it still knows the ones that DO live inside the wrap, or it would be
  // passing this by having been emptied
  ok(nominaTipo(body, "annotator") && nominaTipo(body, "emtree"),
    "…and it still names the types whose surface IS a singleton in the wrap — " +
      "otherwise this clause would pass on an empty function");
}

// ── A3 · no row in `FOCUSED_SURFACE_BOXES` (the module, imported and run) ───
{
  const bundle = await esbuild.build({
    entryPoints: [`${SRC}surface-scroll.ts`],
    bundle: true, format: "esm", write: false,
  });
  const S = await import("data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64"));
  const declared = Object.keys(S.FOCUSED_SURFACE_BOXES).sort();
  for (const type of Object.keys(CONVERTED)) {
    ok(!declared.includes(type),
      `FOCUSED_SURFACE_BOXES must not declare "${type}": that table names the ` +
        "surfaces that MIGRATE between a singleton and an area's box. A " +
        "converted type has one mount, which is never detached, so it has no " +
        "crossing to be carried across.");
  }
  assert.deepEqual(declared, ["annotator", "narrative"],
    "…and what is left is exactly the two that still migrate");
  checks++;
}

// ── A4 · `buildSecondarySurface` does not know these types ─────────────────
{
  const body = Sorg.dentro(TS, "buildSecondarySurface");
  ok(body.length > 0, "buildSecondarySurface was found");
  for (const type of Object.keys(CONVERTED)) {
    ok(!nominaTipo(body, type),
      `buildSecondarySurface must not name "${type}". It IS the second path — ` +
        "keeping a branch for a converted type is keeping the twin under " +
        "another name, which is the exact thing tonight was for.");
  }
  for (const type of ["narrative", "annotator"]) {
    ok(nominaTipo(body, type),
      `…and it still names "${type}", which is NOT converted (${UNCONVERTED[type]})`);
  }
}

// ── A5 · the SIX are registered, and it is the registry that says so ───────
//
// Executed, not read: `shell/types.ts` is bundled and its registration function
// called with stub renderers, and the REGISTRY is asked which types exist. A
// type written into a comment, or into a branch that is never reached, does not
// appear here.
{
  const bundle = await esbuild.build({
    entryPoints: [`${SRC}shell/types.ts`],
    bundle: true, format: "esm", write: false,
  });
  const M = await import("data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64"));
  const nothing = new Proxy({}, { get: () => () => {} });
  M.registerBuiltinSurfaces(nothing);
  const registered = M.convertedTypes().sort();
  assert.deepEqual(registered, Object.keys(CONVERTED).sort(),
    `the registry holds exactly the converted types — got ${registered.join(", ")}`);
  checks++;
  for (const type of registered) {
    const s = M.surfaceTypeOf(type).create({ id: "w", type, state: {} });
    for (const verb of ["mount", "refresh", "setFocused", "destroy"])
      ok(typeof s[verb] === "function",
        `${type}: the contract is honoured — \`${verb}\` exists on the surface`);
  }
}

// ── A6 · `selectWindow()` does not rebuild the tree ────────────────────────
//
// THE criterion of the night, in one clause.
{
  const body = Sorg.dentro(TS, "selectWindow");
  ok(body.length > 0, "selectWindow was found");
  ok(!Sorg.chiama(body, "renderTiles"),
    "selectWindow() must not call renderTiles(). The focus follows the mouse, " +
      "so that call made a movement of the pointer destroy and rebuild every " +
      "area — which is what `surface-scroll`, `wrapWin` and `releaseTilePanels` " +
      "existed to compensate for. The focus decides where the events go, never " +
      "what is drawn.");
  ok(Sorg.chiama(body, "setAreaFocused"),
    "…and what it does instead is turn the focus off on one area and on in " +
      "another — or this clause would pass on a function that does nothing");
}

// ── A7 · no `setFocused` touches the layout ────────────────────────────────
//
// The AST of `shell/types.ts`, walked: inside any method called `setFocused`,
// a write to `style`, a call to a `render*`, or a child added or removed is the
// law of §1 being broken, and it is the only place the law can be wrong.
{
  const sf = ts.createSourceFile("types.ts", SHELL, ts.ScriptTarget.Latest, true);
  const found = [];
  let bodies = 0;
  // `refresh` is in the list because it was NOT, and the proving run caught it:
  // `setFocused(on) { markFocus(root, on); this.refresh(); }` passed the fence
  // while repainting the whole surface on every crossing of a divider. A verb
  // that repaints is a verb that changes what is drawn, whoever owns it.
  const FORBIDDEN_CALLS =
    /^(render|refresh|repaint|draw|append|prepend|insert|remove|replace|build|mount|paint|layout)/i;
  const walkFocus = (node, sins) => {
    if (ts.isPropertyAccessExpression(node) &&
        (node.name.text === "style" || node.name.text === "innerHTML" ||
         node.name.text === "textContent"))
      sins.push(`writes \`${node.name.text}\``);
    if (ts.isCallExpression(node)) {
      let e = node.expression;
      const name = ts.isPropertyAccessExpression(e) ? e.name.text
                 : ts.isIdentifier(e) ? e.text : "";
      if (FORBIDDEN_CALLS.test(name)) sins.push(`calls \`${name}()\``);
    }
    node.forEachChild((c) => walkFocus(c, sins));
  };
  const walk = (node) => {
    const isFocus =
      (ts.isMethodDeclaration(node) || ts.isPropertyAssignment(node)) &&
      node.name?.getText(sf) === "setFocused";
    if (isFocus) {
      bodies++;
      const sins = [];
      walkFocus(node, sins);
      if (sins.length) found.push(`${node.name.getText(sf)} ${sins.join(", ")}`);
    }
    node.forEachChild(walk);
  };
  walk(sf);
  ok(bodies >= Object.keys(CONVERTED).length,
    `every converted type implements setFocused — found ${bodies} bodies`);
  ok(found.length === 0,
    "a setFocused implementation touches the LAYOUT: " + found.join(" · ") +
      ". `setFocused` may turn input handling on and off and draw the focus " +
      "ring. It may not change what is visible or how it is arranged — that is " +
      "the whole law, and this is the only place it can be broken quietly.");
}

// ════════════════════════════════════════════════════════════════════════════
// B · for the FIVE that are NOT converted: the old clauses, kept
// ════════════════════════════════════════════════════════════════════════════

// The two mounts of each unconverted type. The pairing is knowledge this check
// has to hold — the two paths ARE two pieces of code and nothing in the source
// states it — and a type missing from it is caught below.
const MOUNTS = {
  graph:     { focused: ["#canvas-wrap"], secondary: ["#canvas-wrap"] },
  narrative: { focused: ["#narrative-view", ".nv-view"],
               secondary: [".tile-narrative", ".nv-view"] },
  inspector: { focused: ["#panel-view"], secondary: [".tile-panel"] },
  emtree:    { focused: ["#panel-view"], secondary: [".tile-panel"] },
  annotator: { focused: ["#annotator-view"], secondary: [".tile-viewer"] },
};

const ALLOWED = {
  position: "the focused mount is an overlay, the secondary a child of its area",
  inset: "same",
  "z-index": "same",
  flex: "the area's plumbing: a secondary surface fills its tile",
  "min-height": "same — `0`, so a flex child may shrink",
  overflow: "the focused mount clips, an area scrolls",
  "overflow-y": "same",
};
const BOX = ["padding", "padding-top", "padding-bottom", "padding-left",
             "padding-right", "border", "border-top", "border-bottom",
             "border-width", "margin", "margin-top", "margin-bottom", "gap",
             "display", "flex-direction", "align-items", "height"];
const PAINT = ["background"];

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
      if (BOX.includes(key) || PAINT.includes(key) || ALLOWED[key]) found[key] = value;
    }
  }
  return found;
}

const rows = [];
{
  assert.deepEqual(Object.keys(MOUNTS).sort(), Object.keys(UNCONVERTED).sort(),
    "every unconverted type is still measured the old way, and named");
  checks++;
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
                   : painted.length ? `ok · paint: ${painted.join(" · ")}` : "ok"]);
    ok(differ.length === 0,
      `${type}: the two mounts disagree on ${differ.join(" · ")}. The box goes ` +
        "on the CLASS both mounts carry; only position and stacking go on the id.");
  }
}

// ── B2 · the head is ONE builder, and it does not know about the focus ─────
//
// Stronger than the clause it replaces. The builder used to take an `active`
// flag and stamp `.hdr-passive` on every descendant of an unfocused bar — 92 to
// 106 class writes on every crossing of a divider, measured, for a class with no
// rules. What says which window takes the edits is `.tile-active` on the AREA,
// so the head is literally the same DOM in both states.
{
  const body = Sorg.dentro(TS, "buildAreaHeader");
  ok(body.length > 0, "buildAreaHeader is where the head is built");
  // ITS SIGNATURE, from the AST. Asked this way and not by looking for the word
  // "active", which was this clause's own first bug — twice, once in each
  // version of this fence. `classList.toggle("active", tt === type)` marks the
  // CURRENT item of the type menu and the CURRENT mode, and has nothing to do
  // with the focus; the old check worked around it by counting occurrences and
  // requiring exactly two. The parameter list does not need a workaround: a
  // builder that takes only the window cannot be told who has the focus.
  const sf = ts.createSourceFile("main.ts", TS, ts.ScriptTarget.Latest, true);
  let params = null;
  const findFn = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.getText(sf) === "buildAreaHeader")
      params = n.parameters.map((p) => p.name.getText(sf));
    n.forEachChild(findFn);
  };
  findFn(sf);
  assert.deepEqual(params, ["win"],
    `buildAreaHeader takes the WINDOW and nothing else — got ${
      params ? params.join(", ") : "no such function"}. A second parameter is ` +
      "how the two heads used to be allowed to differ, and the text that " +
      "appears and vanishes is what makes the rows move.");
  checks++;
  for (const word of ["hdr-passive", "tile-active"]) {
    ok(!Sorg.nomina(body, word),
      `…and it must not name "${word}": the focus ring is drawn on the AREA by ` +
        "`setAreaFocused`, so the head is literally the same DOM in both states");
  }
  // …and it must not ask for the active window WHILE BUILDING. The walk stops at
  // every nested function, and that distinction is not pedantry: the `⊟` join
  // chip's CLICK handler legitimately reads `activeWin()` — after a join the
  // active window has changed and has to be mounted. A blunt "does this function
  // mention activeWin" said yes to that and would have been answered by moving
  // the call somewhere worse. What must not happen is the bar being BUILT
  // differently depending on who has the focus.
  {
    let buildingReadsFocus = false;
    const isNestedFn = (n) =>
      ts.isArrowFunction(n) || ts.isFunctionExpression(n) ||
      ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n);
    const scan = (n) => {
      if (ts.isCallExpression(n) && n.expression.getText(sf) === "activeWin")
        buildingReadsFocus = true;
      n.forEachChild((c) => { if (!isNestedFn(c)) scan(c); });
    };
    const enter = (n) => {
      if (ts.isFunctionDeclaration(n) && n.name?.getText(sf) === "buildAreaHeader"
          && n.body) n.body.forEachChild((c) => { if (!isNestedFn(c)) scan(c); });
      n.forEachChild(enter);
    };
    enter(sf);
    ok(!buildingReadsFocus,
      "the head is BUILT without reading who has the focus. Its handlers close " +
        "over the window they belong to, because a bar can belong to a window " +
        "that is not the focused one.");
  }
}

// ── B3 · what the head PROMISES, the head builds ──────────────────────────
{
  const strip = Sorg.dentro(TS, "buildHeaderStrip");
  ok(strip.length > 0, "buildHeaderStrip was found");
  const built = new Set(Sorg.stringheLetterali(strip)
    .flatMap((s) => [...s.matchAll(/win-strip-(\w+)/g)].map((m) => m[1])));
  // Asked of the LITERALS of both files, not of a regexp over one of them: the
  // lookups moved into `shell/types.ts` when the six were converted, so a fence
  // that only read `main.ts` reported "nobody writes into the strip" — which was
  // true of the file and false of the program. Found by running it.
  const consumers = [
    ["main.ts", Sorg.stringheLetterali(TS.replace(Sorg.corpoDi(TS, "buildHeaderStrip"), ""))],
    ["shell/types.ts", Sorg.stringheLetterali(SHELL)],
  ];
  const looked = new Set();
  for (const [, literals] of consumers)
    for (const lit of literals)
      for (const m of lit.matchAll(/win-strip-(\w+)/g)) looked.add(m[1]);
  ok(looked.size > 0,
    "some surface writes into its area's header strip — if nothing does, either " +
      "the strip has stopped carrying the counts and crumbs, or this clause is " +
      "reading the wrong files");
  for (const name of looked) {
    ok(built.has(name),
      `a surface looks up \`.win-strip-${name}\` in its area's strip, so ` +
        "`buildHeaderStrip` must build it — otherwise the lookup returns null " +
        "and that information silently disappears");
  }
  ok(nominaTipo(strip, "shelf"),
    "the shelf's own chrome is built in the STRIP, by the one builder every " +
      "area calls. While it lived in `#shelf-bar` no amount of levelling the " +
      "box could help: the two mounts did not carry the same furniture.");
}

// ── B4 · the reserved width is published on the AREA, in every state ──────
{
  const panel = Sorg.dentro(TS, "buildResourcePanel");
  ok(Sorg.chiama(panel, "area.style.setProperty"),
    "`--palette-w` is published on the element that reserves the width, by " +
      "`buildResourcePanel` — which every area goes through");
  const tiles = Sorg.dentro(TS, "renderTiles");
  ok((tiles.match(/buildResourcePanel\(/g) ?? []).length >= 2,
    "…called for every area AND for the wrap, or a window with its panel open " +
      "would be a different size depending on which one holds the wrap");
}

// ── B5 · the nine of `#shelf-bar`, and where each of them went ────────────
//
// THE TRAP, closed by naming it: the fastest way to make a clause about a
// vanished element pass is to DELETE the element and whatever it contained. So
// the inventory is data here, each entry asserted at its new address. A function
// that quietly disappeared fails this check, rather than being discovered in six
// months in a trench.
const NINE = [
  ["the list's NAME",   "win-strip-shelfname", "header strip"],
  ["its entry COUNT",   "win-strip-count",     "header strip"],
  ["⟳ refresh",         "win-strip-refresh",   "header strip · Table mode only"],
  ["the URI field",     "shelf-uri-input",     "+ URI form"],
  ["the FENCE select",  "shelf-uri-scope",     "+ URI form"],
  ["the ACCESS select", "shelf-uri-access",    "+ URI form"],
  ["the ADD verb",      "shelf-uri-go",        "+ URI form"],
  ["OPEN…",             "menu.shelfOpen",      "Shelf menu"],
  ["SAVE",              "menu.shelfSave",      "Shelf menu"],
];
{
  const literals = Sorg.stringheLetterali(TS);
  for (const [what, token, where] of NINE) {
    ok(literals.some((s) => s.includes(token)),
      `${what} must still be reachable — it lives in ${where} now. Nothing of ` +
        "the nine was allowed to go missing on the way out of `#shelf-bar`.");
  }
  ok(Sorg.corpoDi(TS, "openShelfUriForm").length > 0,
    "the four controls that make one gesture (address · fence · access · add) " +
      "are a popover behind one chip");
}

// ── B6 · and the two strips HDR2 hid are gone for good ────────────────────
{
  for (const id of ["shelf-bar", "storage-bar", "table-view-head"]) {
    ok(Sorg.elementi(HTML, `#${id}`).length === 0,
      `\`#${id}\` is gone from the markup: the chrome it held is in the window ` +
        "header, which every area builds");
    ok(!Sorg.miraA(CSS, `#${id}`),
      `…and so are its rules — a row that no longer exists must not keep a box`);
  }
}

// ── the tables, because "it is fine" has to be readable ───────────────────
console.log("\n  CONVERTED · one surface, and no second path");
for (const [type, ids] of Object.entries(CONVERTED)) {
  console.log(`    ${type.padEnd(10)} ok · ${ids.length} singleton${
    ids.length > 1 ? "s" : ""} retired: ${ids.join(", ")}`);
}
console.log("\n  NOT CONVERTED · measured the old way, and why");
for (const [type, verdict] of rows) {
  console.log(`    ${type.padEnd(10)} ${verdict.padEnd(6)} · ${UNCONVERTED[type]}`);
}
console.log("\n  the nine of #shelf-bar × where they went");
for (const [what, , where] of NINE) {
  console.log(`    ${what.padEnd(18)} ${where}`);
}
console.log(`\nfocus-parity: ${checks} checks passed`);
