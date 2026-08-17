// DAG · executable check of src/views/dtc.ts — the DTC corpus, drawn.
//
//   node scripts/check-dtc.mjs
//
// Same harness as check-ingest/check-shelf: the real module, bundled with the
// project's own esbuild and exercised in node against a MINIATURE corpus — the
// shape the Documentation tab actually feeds it (`container.corpus`: two
// acquisitions, their files, three transformations, one file consumed twice).
//
// What is defended here is what makes the picture readable rather than merely
// correct:
//   * the FLOW runs one way — an acquisition is above the files it produced,
//     a process above what it produced and below what it consumed (invariant 3);
//   * a SHARED LEAF keeps both of its consumers (the thing a stratigraphic
//     matrix could not draw, and the reason this projection exists);
//   * a rank that holds two kinds SAYS SO — a lane of four images and one
//     process must not be labelled "products · 5";
//   * a corpus is a corpus even when nothing is wired yet (a just-created
//     acquisition is on the canvas, not waiting for its first edge).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}views/dtc.ts`],
  bundle: true,
  format: "esm",
  write: false,
  loader: { ".json": "json" },
});
const V = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const digest = (n) => "sha256:" + String(n).padStart(2, "0").repeat(32);

// ── the miniature corpus ───────────────────────────────────────────────────
// two flights, four photographs, an ortho from BOTH flights, and img2 consumed
// by two further chains (a rectification and a mesh) — the shared leaf.
const acq = (id, name) => ({
  id, name, node_type: "dtc_acquisition", description: "",
  data: { dtc_kind: "local_import" },
});
const proc = (id, name) => ({
  id, name, node_type: "dtc_process", description: "",
  data: { dtc_kind: "transformation" },
});
const res = (id, name, n) => ({
  id, name, node_type: "resource", description: "",
  data: { checksum: digest(n), residency: "resident" },
});

const nodes = [
  acq("acq_a", "Volo marzo"), acq("acq_b", "Volo giugno"),
  res("img1", "IMG_1.jpg", 1), res("img2", "IMG_2.jpg", 2),
  res("img3", "IMG_3.jpg", 3), res("img4", "IMG_4.jpg", 4),
  proc("p_ortho", "Metashape"), res("ortho", "ortofoto.tif", 5),
  proc("p_rect", "raddrizzamento"), res("front", "prospetto.tif", 6),
  proc("p_mesh", "mesh da foto"), res("mesh", "mesh.glb", 7),
];
const e = (id, source, target, edge_type) => ({ id, source, target, edge_type });
const edges = [
  e("o1", "acq_a", "img1", "dtc_had_output"),
  e("o2", "acq_a", "img2", "dtc_had_output"),
  e("o3", "acq_b", "img3", "dtc_had_output"),
  e("o4", "acq_b", "img4", "dtc_had_output"),
  e("i1", "p_ortho", "acq_a", "dtc_had_input"),
  e("i2", "p_ortho", "acq_b", "dtc_had_input"),
  e("o5", "p_ortho", "ortho", "dtc_had_output"),
  e("i3", "p_rect", "img2", "dtc_had_input"),
  e("o6", "p_rect", "front", "dtc_had_output"),
  e("i4", "p_mesh", "img2", "dtc_had_input"),
  e("o7", "p_mesh", "mesh", "dtc_had_output"),
];

const scene = V.buildDtcScene(nodes, edges);
const at = (id) => scene.byId.get(id);
const laneOf = (id) => {
  const n = at(id);
  return scene.lanes.findIndex((l) => n.y >= l.y && n.y < l.y + l.height);
};

// ── 1 · everything the corpus holds is ON the canvas ───────────────────────
eq(scene.nodes.length, 12, "every corpus node is drawn");
eq(scene.edges.length, 11, "every chain edge is drawn");
ok(scene.lanes.length >= 4, "the chain gets a lane per rank, not four fixed bands");

// ── 2 · the flow runs ONE WAY (invariant 3: arrows point down) ─────────────
// The stored direction is not the flow: `dtc_had_input` points from the process
// to what it CONSUMED, so the consumed thing must sit ABOVE the process.
for (const ed of edges) {
  const a = at(ed.source), b = at(ed.target);
  const [above, below] =
    ed.edge_type === "dtc_had_input" ? [b, a] : [a, b];
  ok(above.y < below.y, `${ed.id}: ${above.node.name} is above ${below.node.name}`);
}
ok(laneOf("acq_a") === 0 && laneOf("acq_b") === 0, "acquisitions are the roots");

// ── 3 · the SHARED LEAF keeps both consumers ───────────────────────────────
const consumersOf = (id) =>
  scene.edges
    .filter((s) => s.edge.edge_type === "dtc_had_input" && s.target === id)
    .map((s) => s.source)
    .sort();
eq(consumersOf("img2"), ["p_mesh", "p_rect"], "img2 shows BOTH its consumers");
eq(consumersOf("img1"), [], "a file nothing consumed shows no consumer");
// and the ortho keeps both flights as inputs — one output, two roots
eq(
  scene.edges
    .filter((s) => s.edge.edge_type === "dtc_had_input" && s.source === "p_ortho")
    .map((s) => s.target)
    .sort(),
  ["acq_a", "acq_b"],
  "the ortho was made from BOTH flights",
);

// ── 4 · a mixed rank says what it holds ────────────────────────────────────
// p_ortho consumed a whole acquisition, so it ranks with the files that
// acquisition produced. The lane label must not pretend they are all files.
const lane1 = scene.lanes[1].label;
ok(/\+/.test(lane1), `a mixed lane names both kinds — "${lane1}"`);
ok(/4/.test(lane1) && /1/.test(lane1), `…with their counts — "${lane1}"`);
const lane0 = scene.lanes[0].label;
ok(!/\+/.test(lane0), `a single-kind lane stays simple — "${lane0}"`);
ok(/2/.test(lane0), `…and counts its members — "${lane0}"`);
ok(
  new Set(scene.lanes.map((l) => l.label)).size === scene.lanes.length,
  "two lanes never carry the same label (repeats are numbered)",
);

// ── 5 · a corpus with nothing wired yet is still a corpus ─────────────────
const fresh = V.buildDtcScene([acq("acq_new", "Volo di ieri")], []);
eq(fresh.nodes.length, 1, "a just-created acquisition is on the canvas");
eq(V.buildDtcScene([], []).nodes.length, 0, "an empty corpus draws nothing");
// a study graph with no DTC at all: the projection is empty, which is what the
// Documentation tab turns into its honest empty state
const study = V.buildDtcScene(
  [{ id: "US1", name: "US1", node_type: "US", description: "", data: {} }],
  [],
);
eq(study.nodes.length, 0, "a stratigraphic graph has no DTC substrate to draw");

// ── 6 · determinism (invariant 7 in spirit) ───────────────────────────────
const again = V.buildDtcScene(nodes, edges);
eq(
  again.nodes.map((n) => [n.id, n.x, n.y]),
  scene.nodes.map((n) => [n.id, n.x, n.y]),
  "same corpus → same picture",
);
const shuffled = V.buildDtcScene([...nodes].reverse(), [...edges].reverse());
eq(
  shuffled.nodes.map((n) => [n.id, n.x, n.y]).sort(),
  scene.nodes.map((n) => [n.id, n.x, n.y]).sort(),
  "…whatever order the corpus arrives in",
);

// ── 7 · manual arrangement wins ───────────────────────────────────────────
const dragged = V.buildDtcScene(nodes, edges, new Map([["img2", { x: 999, y: 42 }]]));
eq([dragged.byId.get("img2").x, dragged.byId.get("img2").y], [999, 42],
   "a dragged node keeps where it was put");

// ── 8 · what counts as a chain edge ───────────────────────────────────────
ok(V.isDtcEdge("dtc_had_input") && V.isDtcEdge("dtc_derived_from"),
   "dtc_* relations are chain edges");
ok(!V.isDtcEdge("is_before") && !V.isDtcEdge(undefined),
   "a stratigraphic relation is not");

console.log(`dtc: ${checks} checks passed`);
