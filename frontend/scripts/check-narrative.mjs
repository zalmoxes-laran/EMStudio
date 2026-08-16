// NARRATIVE · executable check of the embeds — the test P1 declared it did not have.
//
//   node scripts/check-narrative.mjs
//
// P1 made five placeholder view types real and proved them in a browser. A
// browser proof is worth having and cannot be run in CI, so this is the same
// proof, headless: it renders every embed against the P1 fixture and asserts
// that what comes out is **content**, not a polite "not rendered yet".
//
// Three things are defended here, and they are the three that would rot first:
//
// **The embeds resolve.** A matrix with lanes and chips, an evidence chain with
// its four links, a timeline with bars, a table with rows, a certainty ladder
// with the right rung lit. Not "it did not throw" — the actual strings.
//
// **An embed is a REFERENCE.** Rename a unit in the DOCUMENT, leave the
// narrative untouched, render again: the chip, the table row and the chain link
// must all say the new name. This is the invariant the whole viewer exists for,
// and it is one careless `.slice()` away from becoming false.
//
// **There is one palette.** Every colour an embed paints comes from `nodeStyle`
// — including the TEXT colour, which is computed from the fill's luminance. A
// literal in the module would be a second palette in miniature, and the first
// time it happened it made the USV chip black on black.
//
// The DOM is linkedom: enough of one to build elements and read them back, and
// small enough that a check script does not need a browser.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";
import { parseHTML } from "linkedom";

// A DOM before the module loads: `narrative-embeds.ts` calls
// `document.createElement` at render time, so the global has to be there.
const { window, document } = parseHTML("<html><body></body></html>");
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true,
                                  format: "esm", write: false });
  return import("data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const E = await load("narrative-embeds.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};
const has = (el, needle, what) => {
  const text = el.textContent ?? "";
  assert.ok(text.includes(needle),
    `${what} — «${needle}» not in: ${text.slice(0, 200)}`);
  checks++;
};

// The P1 fixture, unmodified: the check and the browser proof must be looking at
// the same graph, or one of them is testing something nobody ships.
const FIXTURE = new URL("../testdata/dp79-embeds.em.json", import.meta.url);
const raw = JSON.parse(readFileSync(FIXTURE, "utf8"));
const doc = { header: raw.header, graph: raw.graphs.portico };
const byId = (id) => doc.graph.nodes.find((n) => n.id === id);
const text = (el) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
const all = (el, sel) => [...el.querySelectorAll(sel)].map(text);

// ── the fixture is what we think it is ──────────────────────────────────────
// The counts are asserted so a fixture edited for one test cannot silently
// change what another one measures. P5 added an image and two annotated
// regions (the IIIF embed needs something to be live ABOUT).
eq(doc.graph.nodes.length, 17, "fixture · nodes");
eq(doc.graph.edges.length, 14, "fixture · edges");
// P4 corrected the fixture to the datamodel's real class names (`EpochNode`,
// `ActivityNodeGroup`): the lowercase spellings are what a hand-written em.json
// carries, and the Python side loaded them as generic nodes. Both are read by
// the code; the fixture now uses the ones a real study has.
eq(doc.graph.nodes.filter(
     (n) => n.node_type === "EpochNode" || n.node_type === "epoch").length, 3,
   "fixture · epochs");

// ── matrix ──────────────────────────────────────────────────────────────────
{
  const box = E.matrixEmbed(byId("act-1"), doc);
  const chips = all(box, ".nv-chip");
  eq(chips.length, 3, "matrix · one chip per unit in scope");
  ok(chips.includes("US 1 · muro"), "matrix · the unit is named");
  eq(all(box, ".nv-matrix-lane-label").length, 2,
     "matrix · one lane per epoch touched");
  // invariant 4: newest lane on top. Asserted on the ORDER of the two labels,
  // not on one of them — an assertion that compares a value with itself passes
  // whatever the code does, which is worse than no assertion at all.
  eq(all(box, ".nv-matrix-lane-label").map((l) => l.split(" ·")[0]),
     ["Fase 2", "Fase 1"],
     "matrix · NEWEST epoch first (invariant 4)");
  has(box, "1 rapporto stratigrafico", "matrix · singular is singular");
  ok(!text(box).includes("1 rapporti"), "matrix · no '1 rapporti'");
  ok(!text(box).includes("not rendered yet"), "matrix · not a placeholder");

  // an empty scope is an honest placeholder, not an error
  const empty = E.matrixEmbed(byId("ep-0"), doc);
  ok(empty.querySelector(".nv-empty"), "matrix · empty scope says so");
  has(empty, "il riferimento è valido", "matrix · and says the ref is fine");
}

// ── timeline ────────────────────────────────────────────────────────────────
{
  const box = E.timelineEmbed(byId("act-1"), doc);
  const bars = all(box, ".nv-timeline-bar");
  eq(bars.length, 2, "timeline · one bar per dated epoch");
  ok(bars.some((b) => b.includes("1200 → 1450")), "timeline · dates are shown");
  // proportion, not decoration: the 250-year epoch is wider than the 70-year one
  const widths = [...box.querySelectorAll(".nv-timeline-bar")]
    .map((b) => parseFloat(b.style.width));
  ok(widths[0] > widths[1],
     `timeline · a longer epoch is drawn longer (${widths})`);

  // an epoch with no dates is kept and marked — dropping it would be a lie by
  // omission, and a study in progress has plenty of them
  const whole = E.timelineEmbed(byId("us1"), doc);
  ok(text(whole).length > 0, "timeline · a unit scope still renders");
}

// ── table ───────────────────────────────────────────────────────────────────
{
  const box = E.tableEmbed(byId("act-1"), doc, {});
  const rows = [...box.querySelectorAll("tr")];
  eq(rows.length, 4, "table · header + one row per unit");
  eq(all(rows[0], "th"), ["unità", "tipo", "epoca", "datazione", "certezza"],
     "table · the columns of the design's example query");
  const first = all(rows[1], "td");
  ok(first.includes("US"), "table · the type is read from the node");
  ok(first.some((c) => c.includes("1200") || c.includes("→")),
     `table · the dating comes from the epoch (${first})`);
  has(box, "calcolate adesso", "table · says it is computed now");

  // the author can narrow the columns
  const narrow = E.tableEmbed(byId("act-1"), doc, { columns: ["name"] });
  eq(all([...narrow.querySelectorAll("tr")][0], "th"), ["unità"],
     "table · options.columns narrows it");
}

// ── paradata — the chain, and the break ─────────────────────────────────────
{
  const box = E.paradataEmbed(byId("us1"), doc);
  const roles = all(box, ".nv-chain-role");
  const names = all(box, ".nv-chain-name");
  eq(roles, ["fonte", "extractor", "proprietà", "unità"],
     "paradata · source → extractor → property → unit, in that order");
  eq(names[0], "Rossi 1987, tav. XII", "paradata · the source is named");
  eq(names[3], "US 1 · muro", "paradata · the chain lands on the unit");
  ok(!box.querySelector(".nv-chain-broken"),
     "paradata · a complete chain reports no break");

  // …and a chain that does not resolve SAYS SO, at the point it breaks. This is
  // the one failure this embed cannot afford: a reader would take an incomplete
  // chain for a complete one.
  const retracted = structuredClone(doc);
  retracted.graph.edges = retracted.graph.edges.filter(
    (e) => e.edge_type !== "extracted_from");
  const broken = E.paradataEmbed(byId("us1"), retracted);
  ok(broken.querySelector(".nv-chain-broken"),
     "paradata · a retracted source breaks the chain visibly");
  has(broken, "non cita nessuna fonte", "paradata · and says why, in words");

  // a property with no extraction at all
  const orphan = structuredClone(doc);
  orphan.graph.edges = orphan.graph.edges.filter(
    (e) => e.edge_type !== "has_data_provenance");
  has(E.paradataEmbed(byId("us1"), orphan), "nessuna estrazione",
      "paradata · a value with no provenance says so");

  // a unit that carries no properties at all: honest, not empty
  has(E.paradataEmbed(byId("us2"), doc), "non porta proprietà documentate",
      "paradata · nothing to show is said, not shown blank");
}

// ── us · the existence-certainty ladder ─────────────────────────────────────
{
  const declared = E.existenceCertainty(byId("usv1"), doc);
  eq(declared.rung, "observable", "certainty · read from the qualia claim");
  eq(declared.source, "qualia", "certainty · and says where it came from");
  const ladder = E.certaintyLadder(declared);
  eq(all(ladder, ".nv-rung").length, 4, "certainty · the whole ladder is drawn");
  eq(all(ladder, ".nv-rung-on"), ["observable"],
     "certainty · exactly one rung is lit");
  has(ladder, "certainty_level: probable", "certainty · the claim is quoted");

  // no claim anywhere: implied from the family, and MARKED as implied — a
  // default presented as a statement is how a guess becomes a citation
  const implied = E.existenceCertainty(byId("us2"), doc);
  eq(implied.source, "implied", "certainty · falls back to the family");
  eq(implied.rung, "observable", "certainty · a real unit reads as observable");
  ok(E.certaintyLadder(implied).querySelector(".nv-implied"),
     "certainty · an implied rung is marked implied");
  // a virtual unit implies a weaker rung than a real one
  const virtual = E.existenceCertainty(
    { id: "x", node_type: "USVn", data: {} }, doc);
  eq(virtual.rung, "asserted", "certainty · a virtual unit is asserted");
}

// ── un_scene — a declared skip, not a fake ──────────────────────────────────
{
  const box = E.unSceneEmbed(byId("scene1"), doc);
  has(box, "DP-29", "un_scene · names the design project it waits for");
  has(box, "non porta ancora", "un_scene · declares the gap");
  ok(!text(box).includes("not rendered yet"), "un_scene · not a placeholder");
}

// ── the invariant: an embed is a REFERENCE ──────────────────────────────────
{
  const renamed = structuredClone(doc);
  renamed.graph.nodes.find((n) => n.id === "us1").name = "US 1 · RINOMINATA";
  // the narrative node is NOT touched — that is the whole point
  const narrative = JSON.stringify(
    renamed.graph.nodes.find((n) => n.node_type === "narrative"));
  ok(!narrative.includes("RINOMINATA"),
     "reference · the narrative itself carries no copy of the name");

  has(E.matrixEmbed(byId("act-1"), renamed), "US 1 · RINOMINATA",
      "reference · the matrix chip says the new name");
  has(E.tableEmbed(byId("act-1"), renamed, {}), "US 1 · RINOMINATA",
      "reference · the table row says the new name");
  has(E.paradataEmbed(renamed.graph.nodes.find((n) => n.id === "us1"), renamed),
      "US 1 · RINOMINATA",
      "reference · the evidence chain says the new name");
}

// ── one palette: no colour is written by hand ───────────────────────────────
{
  // Every painted element must carry an INLINE colour — which can only have come
  // from `nodeStyle`, because the module has no literals — and the text colour
  // must be set too, or a dark family renders unreadable (measured in P1).
  const box = E.matrixEmbed(byId("act-1"), doc);
  const chips = [...box.querySelectorAll(".nv-chip")];
  for (const chip of chips) {
    ok(chip.style.backgroundColor || chip.style.background,
       "palette · a chip is filled from the palette");
    ok(chip.style.color, "palette · …and its TEXT colour comes from there too");
  }
  const chain = E.paradataEmbed(byId("us1"), doc);
  for (const link of chain.querySelectorAll(".nv-chain-link")) {
    ok(link.style.color, "palette · a chain link takes its text colour too");
  }

  // and the source of truth for that: the module must not contain a colour
  // literal. One palette, and this is the tripwire that keeps it one.
  const src = readFileSync(new URL("../src/narrative-embeds.ts",
                                   import.meta.url), "utf8");
  const literals = src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  eq(literals, [], "palette · no colour literal in narrative-embeds.ts");
}

// ── the view types the datamodel declares are all handled ───────────────────
{
  // The vocabulary is the datamodel's (invariant 1). This asserts the dispatcher
  // in narrative.ts has a branch for every term — a new view type must arrive
  // WITH its renderer, not as a silent placeholder.
  const dm = JSON.parse(readFileSync(
    new URL("../src/assets/s3Dgraphy_node_datamodel.json", import.meta.url),
    "utf8"));
  const declared = Object.keys(
    dm.narrative_nodes.NarrativeNode.valid_view_types);
  eq(declared.length, 11, "view types · the datamodel declares eleven");
  const dispatcher = readFileSync(
    new URL("../src/narrative.ts", import.meta.url), "utf8");
  const unhandled = declared.filter((v) => !dispatcher.includes(`"${v}"`));
  eq(unhandled, [], "view types · every declared type has a branch");
}


// ── RMDoc — the domain correction (DP-79 P3) ────────────────────────────────
//
// RM and RMSF are 3D; an RMDoc is a 2D document that had to be PLACED. Two
// families, two embeds — and what is graded is different in each, which is the
// whole reason they cannot share a card.
{
  const N = await load("narrative-embeds.ts");
  const rm = { id: "rm-1", node_type: "representation_model", name: "Modello" };
  const rmsf = { id: "rm-2", node_type: "representation_model_sf", name: "RMSF" };
  const rmdoc = {
    id: "rmdoc-1", node_type: "representation_model_doc",
    name: "Prospetto nord, collocato",
    data: { geometry: "observable" },
  };
  ok(N.isRm3D(rm) && N.isRm3D(rmsf), "rm · RM and RMSF are the 3D family");
  ok(!N.isRm3D(rmdoc), "rm · an RMDoc is not");
  ok(N.isRmDoc(rmdoc) && !N.isRmDoc(rm), "rm · and is recognised as its own case");

  const card = N.rmDocEmbed(rmdoc, doc, "");
  has(card, "documento spazializzato", "rmdoc · says what it is");
  has(card, "autorità della collocazione", "rmdoc · grades the PLACEMENT");
  has(card, "non l'esistenza", "rmdoc · …and says it is not the existence");
  eq(all(card, ".nv-rung-on"), ["observable"], "rmdoc · the declared rung is lit");
  // the ladder comes from the visual rules, not from a list in the module
  eq(N.spatialisationRungs(),
     ["reality_based", "observable", "asserted", "symbolic"],
     "rmdoc · the axis is read from em_visual_rules");

  // an RMDoc nobody placed: said, not guessed
  const unplaced = N.rmDocEmbed({ ...rmdoc, data: {} }, doc, "");
  eq(all(unplaced, ".nv-rung-on"), [], "rmdoc · no rung lit when none declared");
  has(unplaced, "nessuno ha ancora dichiarato",
      "rmdoc · and it says nobody declared it");

  // the dispatcher routes an RMDoc away from the 3D stage
  const dispatcher = readFileSync(
    new URL("../src/narrative.ts", import.meta.url), "utf8");
  ok(/viewType === "rm" && isRmDoc\(node\)/.test(dispatcher),
     "rm · the dispatcher checks RMDoc BEFORE the 3D branch");

  // IIIF stays on the 2D side: a 3D asset must not be asked for a thumbnail
  ok(N.documentEmbed(rm, "https://example.org/iiif/3") === null,
     "iiif · a 3D representation model gets no image thumbnail");
}


// ── P5 · the image embed, live ──────────────────────────────────────────────
//
// IIIF is on the 2D DOCUMENT and nowhere else (the P3 correction). What is
// asserted here is that the thumbnail is a size request on the service, that
// the annotated regions are found however the graph records them, and that a
// study with no IIIF service degrades rather than showing a broken frame.
{
  const N = await load("narrative-embeds.ts");
  const BASE = "https://em.example.org/iiif/3";
  const image = byId("img-1");

  const fig = N.documentEmbed(image, BASE, doc);
  ok(fig, "iiif · an image resource gets a figure");
  const img = fig.querySelector("img");
  ok(img.getAttribute("src").startsWith(BASE), "iiif · served by the service");
  ok(/!240,240|240,/.test(img.getAttribute("src")),
     `iiif · the thumbnail is a SIZE REQUEST, not a second copy (${img.getAttribute("src")})`);
  has(fig, "2 regioni annotate", "iiif · the annotated regions are named");

  // found by edge AND by the resource_id a region carries: the annotator writes
  // one, older graphs carry the other, and a reader should not have to know
  const regions = N.annotationsOn(image, doc);
  eq(regions.map((r) => r.name), ["muro", "soglia"], "iiif · both regions found");

  // no service configured → no figure at all, and the card degrades to what it
  // was. A broken frame in a story is worse than no picture.
  eq(N.documentEmbed(image, "", doc), null, "iiif · no service, no frame");
  // …and a node that is not an image never asks for one
  eq(N.documentEmbed(byId("us1"), BASE, doc), null,
     "iiif · a stratigraphic unit is not an image");
}


// ── P5 · the workspace gestures NARRWS1 left open ───────────────────────────
//
// Two drops, and they are different acts: a NODE on a chapter becomes a
// citation (D2); a VIEW TYPE on an embed changes how that embed is shown
// (D1-full). Both go through the `NarrativeEditor` — the same mutators every
// button uses — so there is no second write path and undo keeps working.
{
  const V = await load("narrative.ts");
  const calls = [];
  const editor = {
    narrativeId: "narr-1",
    addChapter() {}, renameChapter() {}, moveChapter() {}, deleteChapter() {},
    toggleCanonical() {}, setAnchor() {}, addProse() {}, setProse() {},
    addEmbed: (chapter, ref, at) => calls.push(["addEmbed", chapter, ref, at]),
    setViewType: (c, b, vt) => calls.push(["setViewType", c, b, vt]),
    moveBlock() {}, deleteBlock() {}, lanes: () => [],
    authors: () => [], humanAuthors: () => [], addAuthor() {}, removeAuthor() {},
    setChapterAuthor() {}, signer: () => null, setSigner() {}, endorse() {},
    endorseChapter() {}, pendingIn: () => 0,
    // the optional half of the interface: a stub answers "no" to everything it
    // is asked, which is what an editor without a bridge says anyway
    canGenerate: () => false, canRegenerate: () => false,
    undescribedEpochs: () => [], generateDraft() {}, promptOf: () => null,
  };

  const host = document.createElement("div");
  V.renderNarrativeView(host, doc, "narr-1", () => {}, undefined, editor,
                        { index: () => 0, set: () => {} });

  const chapter = host.querySelector(".nv-chapter");
  ok(chapter, "workspace · the chapter renders in editing mode");

  const drag = (target, type, value, kind) => {
    const data = new Map([[type, value]]);
    const event = new host.ownerDocument.defaultView.Event(kind,
      { bubbles: true, cancelable: true });
    event.dataTransfer = {
      types: [type],
      getData: (t) => data.get(t) ?? "",
      setData: (t, v) => data.set(t, v),
      dropEffect: "", effectAllowed: "",
    };
    target.dispatchEvent(event);
    return event;
  };

  // D2 · a node dropped on a chapter becomes a citation. This gesture already
  // existed; the check is here so it stays true — and because adding a SECOND
  // handler for it (which P5 briefly did) inserted the citation twice, which
  // this assertion is what caught.
  drag(chapter, V.NODE_MIME, "us2", "dragover");
  ok(chapter.classList.contains("nv-drop-over"),
     "workspace · a chapter that will take the node says so");
  drag(chapter, V.NODE_MIME, "us2", "drop");
  eq(calls.filter((c) => c[0] === "addEmbed").map((c) => [c[1], c[2]]),
     [[0, "us2"]],
     "workspace · dropping a node cites it ONCE, through the editor's mutator");

  // D1-full · a view type dropped on an EMBED changes it
  const embed = host.querySelector(".nv-embed");
  ok(embed, "workspace · there is an embed to drop on");
  drag(embed, V.VIEW_TYPE_MIME, "table", "dragover");
  ok(embed.classList.contains("nv-drop-target"),
     "workspace · an embed that will take the view type says so");
  drag(embed, V.VIEW_TYPE_MIME, "table", "drop");
  eq(calls.filter((c) => c[0] === "setViewType").map((c) => c[3]), ["table"],
     "workspace · dropping a view type re-renders that embed, via setViewType");

  // …and a view type may NOT create a block: an embed with no reference points
  // at nothing, and a story does not need a way to write an empty citation.
  const countBefore = calls.filter((c) => c[0] === "addEmbed").length;
  drag(chapter, V.VIEW_TYPE_MIME, "matrix", "drop");
  eq(calls.filter((c) => c[0] === "addEmbed").length, countBefore,
     "workspace · a view type on a chapter creates nothing");

  // read-only stays read-only: no editor, no drop targets
  const readOnly = document.createElement("div");
  V.renderNarrativeView(readOnly, doc, "narr-1", () => {});
  const ch = readOnly.querySelector(".nv-chapter");
  drag(ch, V.NODE_MIME, "us2", "dragover");
  ok(!ch.classList.contains("nv-drop-over"),
     "workspace · the dissemination viewer accepts no drops");
}



// ── P5b/A · the 3D embed, as a CONTRACT — in BOTH modes ─────────────────────
//
// The engine moved out of this module (arc A): a model is shown by a factory
// the CALLER injects — nothing in the editor, three in the reader. So the
// contract is asserted twice against one card: with a factory (a viewer, aimed
// at the right asset) and without one (the ATON path, never a broken box).
// A fake factory is enough, because what is under test is the seam.
{
  const rm = byId("rm-1");
  ok(rm, "3d · the fixture carries a representation model");
  eq(rm.data.residency, "reference",
     "3d · it is a REFERENCE (DP-76), never a copy of the geometry");
  ok(String(rm.data.checksum).startsWith("sha256:"),
     "3d · …with the digest that makes it verifiable");

  const V = await load("narrative.ts");

  // READER mode: a factory is injected, and it is handed the locator the graph
  // names — resolved now, not a copy stored in the story.
  const asked = [];
  const host = document.createElement("div");
  V.renderNarrativeView(host, doc, "narr-1", () => {}, undefined, undefined,
                        undefined,
                        (stage, spec) => {
                          asked.push(spec);
                          stage.appendChild(document.createElement("canvas"));
                        });
  const card = [...host.querySelectorAll(".nv-embed.nv-3d")]
    .find((e) => e.textContent.includes("Colonnato · modello"));
  ok(card, "3d · the rm embed renders");
  ok(!card.className.includes("nv-pending"),
     "3d · …as a viewer, not as a placeholder");
  ok(card.querySelector(".nv-3d-stage"), "3d · …with a stage for the model");
  eq(asked.map((s) => s.url), ["/testdata/colonnato.gltf"],
     "3d · the factory is aimed at the asset the graph names");
  eq(asked[0].label, "Colonnato · modello", "3d · …and told what it is");
  ok(!card.querySelector("iframe"),
     "3d · a MODEL is not handed to an ATON iframe when a viewer exists");

  // EDITOR mode: no factory. The card must still render something honest —
  // never a stage with nothing in it, which would read as a broken viewer.
  const plain = document.createElement("div");
  V.renderNarrativeView(plain, doc, "narr-1", () => {});
  const editorCard = [...plain.querySelectorAll(".nv-embed.nv-3d")]
    .find((e) => e.textContent.includes("Colonnato · modello"));
  ok(editorCard, "3d · the editor renders the embed too");
  ok(!editorCard.querySelector(".nv-3d-stage"),
     "3d · …with no empty stage: without an engine there is nothing to stage");
}

// ── the SERVED reader: shell and assets, and the promise between them ────────
//
// The reader is no longer one self-contained file — arc A took `viteSingleFile`
// off it so the 3D engine could be a chunk fetched on demand instead of 800 kB
// of base64 in the HTML. What that bought has a price, and this is it: the page
// now depends on WHERE it is served from, because it asks for its assets
// relatively.
//
// em-catalog holds up its end by serving the whole `dist/` as a directory with
// the shell at its root (`READER_MOUNT`). This asserts the other end: that the
// shell asks relatively and that what it asks for is actually in the dist. A
// build that started emitting absolute `/assets/…` would 404 every asset behind
// any prefix, and the symptom would be a blank page that reads like an empty
// study — the exact failure the 501 exists to avoid.
{
  const dist = new URL("../dist/", import.meta.url);
  let shell = null;
  try {
    shell = readFileSync(new URL("reader.html", dist), "utf-8");
  } catch {
    // Not built here. Said out loud rather than passed silently: a check that
    // reports success for work it did not do is worse than no check.
    console.log("reader: dist/reader.html absent — served-reader checks SKIPPED "
                + "(npm run build:reader)");
  }
  if (shell) {
    const refs = [...shell.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    const assets = refs.filter((r) => !r.startsWith("data:"));
    ok(assets.length > 0, "reader · the shell references its bundle");
    for (const ref of assets) {
      ok(ref.startsWith("./"),
         `reader · «${ref}» must be RELATIVE: an absolute path nails the reader `
         + "to one deployment's prefix");
      ok(readFileSync(new URL(ref.replace(/^\.\//, ""), dist)).length > 0,
         `reader · «${ref}» exists in the dist that will be served`);
    }
    // …and the shell is a SHELL: if it ever grows back to a megabyte, the
    // single-file plugin has crept back onto the reader entry and the 3D chunk
    // is inlined again.
    ok(shell.length < 100_000,
       `reader · the shell stays a shell (${shell.length} bytes)`);
  }
}

console.log(`narrative: ${checks} checks passed`);
