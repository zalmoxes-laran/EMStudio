// MULTIGRAPH · executable check of src/container.ts — a project is one file.
//
//   node scripts/check-container.mjs
//
// Same harness as the other checks: bundled with the project's own esbuild and
// exercised in node. Pure mapping + merge logic, so all of it is checkable here.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}container.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const C = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const legacyDoc = (id = "studio_a", unit = "US101") => ({
  header: { format: "em.json", version: "1.0" },
  graph: { graph_id: id, name: id, nodes: [{ id: unit, node_type: "US", name: unit }], edges: [] },
  layout: { positions: { [unit]: { x: 0, y: 0, w: 10, h: 10 } } },
});

const shelfSection = (resourceId = "res0") => ({
  graph_id: "shelf",
  name: "Shelf di progetto",
  data: { em_collection: "ShelfGraph" },
  nodes: [{ id: resourceId, node_type: "resource", name: "foto", data: { url: "/a/foto.jpg" } }],
  edges: [],
});

// ── reading both shapes ─────────────────────────────────────────────────────
{
  const legacy = legacyDoc();
  ok(!C.isContainer(legacy), "a legacy document is not a container");
  const parsed = C.parseContainer(legacy);
  eq(parsed.members.map((m) => m.id), ["studio_a"], "…and opens as a container-of-one");
  eq(parsed.wasLegacy, true, "…flagged as legacy, so a caller can say so");
  eq(parsed.shelf, null, "no shelf in an old file");
  eq(parsed.activeGraphId, "studio_a", "its only graph is the active one");
  eq(parsed.warnings, [], "and nothing to warn about");

  const notADoc = C.parseContainer({ header: {} });
  eq(notADoc.members, [], "something that is not a document yields no members");
  ok(notADoc.warnings.length === 1, "…and says why");
}

// ── writing the container ───────────────────────────────────────────────────
{
  const built = C.buildContainer({
    graphs: [{ id: "studio_a", doc: legacyDoc("studio_a", "US101") },
             { id: "studio_b", doc: legacyDoc("studio_b", "US201") }],
    shelf: shelfSection(),
    activeGraphId: "studio_b",
  });
  ok(C.isContainer(built), "what we write IS a container");
  eq(Object.keys(built.graphs).sort(), ["shelf", "studio_a", "studio_b"],
     "every slot plus the shelf — Save no longer writes one graph out of three");
  eq(built.active_graph_id, "studio_b", "the graph in front is recorded");
  eq(built.graphs.shelf.data.em_collection, "ShelfGraph",
     "the shelf keeps its marker, which is how it is recognised on reopen");
  ok(Array.isArray(built.graphs.studio_a.nodes), "nodes live in the member");

  // and it round-trips
  const reread = C.parseContainer(built);
  eq(reread.members.map((m) => m.id), ["studio_a", "studio_b"], "both graphs come back");
  ok(reread.shelf !== null, "the shelf comes back as the shelf");
  eq(reread.activeGraphId, "studio_b", "…and so does the active id");
  const again = C.buildContainer({
    graphs: reread.members.map((m) => ({ id: m.id, doc: m.doc })),
    shelf: reread.shelf,
    activeGraphId: reread.activeGraphId,
  });
  eq(JSON.stringify(again.graphs), JSON.stringify(built.graphs),
     "write → read → write lands on the same members");
}

// ── one graph is a container-of-one ─────────────────────────────────────────
{
  const built = C.buildContainer({ graphs: [{ id: "solo", doc: legacyDoc("solo") }] });
  eq(Object.keys(built.graphs), ["solo"], "one member");
  ok(C.isContainer(built), "…still a container");
  eq(C.parseContainer(built).members.length, 1, "and it reopens as one slot");
}

// ── a broken member does not lose the project ───────────────────────────────
{
  const built = C.buildContainer({ graphs: [{ id: "buono", doc: legacyDoc("buono") }] });
  built.graphs.rotto = "questo non è un grafo";
  const parsed = C.parseContainer(built);
  eq(parsed.members.map((m) => m.id), ["buono"], "the good member survives");
  ok(parsed.warnings.some((w) => w.includes("rotto")), "…and the broken one is reported");
}

// ── an active id that is not there falls back, and says so ──────────────────
{
  const built = C.buildContainer({ graphs: [{ id: "a", doc: legacyDoc("a") }] });
  built.active_graph_id = "non_esiste";
  const parsed = C.parseContainer(built);
  eq(parsed.activeGraphId, "a", "falls back to the first graph");
  ok(parsed.warnings.some((w) => w.includes("active_graph_id")), "…out loud");
}

// ── the shelf is recognised by its MARKER, not by its id ────────────────────
{
  const odd = shelfSection();
  odd.graph_id = "la_mia_libreria";           // any id
  const built = C.buildContainer({ graphs: [{ id: "a", doc: legacyDoc("a") }], shelf: odd });
  eq(Object.keys(built.graphs).sort(), ["a", "la_mia_libreria"], "written under its own id");
  const parsed = C.parseContainer(built);
  eq(parsed.members.map((m) => m.id), ["a"],
     "…and read back as the SHELF, not as a second study graph");
  ok(parsed.shelf !== null, "the shelf is where it belongs");
}

// ── integrating later: add + merge by UUID ──────────────────────────────────
{
  // mine: Porta Marina with a shared unit and one of my own
  const mine = C.parseContainer(C.buildContainer({
    graphs: [{ id: "porta_marina", doc: legacyDoc("porta_marina", "shared-uuid") }],
    shelf: shelfSection("res-condivisa"),
  }));
  mine.members[0].doc.graph.nodes.push({ id: "mine-only", node_type: "US", name: "US102" });

  // theirs: the same graph (with their own unit) plus a sector of their own
  const theirsPm = legacyDoc("porta_marina", "shared-uuid");
  theirsPm.graph.nodes.push({ id: "theirs-only", node_type: "US", name: "US103" });
  theirsPm.graph.nodes[0].description = "descrizione del collega";
  const theirs = C.parseContainer(C.buildContainer({
    graphs: [{ id: "porta_marina", doc: theirsPm },
             { id: "settore_nord", doc: legacyDoc("settore_nord", "US301") }],
    shelf: shelfSection("res-condivisa"),   // the same photograph
  }));

  const report = C.mergeContainers(mine, theirs);

  eq(mine.members.map((m) => m.id).sort(), ["porta_marina", "settore_nord"],
     "their sector arrived whole");
  eq(report.addedGraphs, ["settore_nord"], "…reported as added");
  eq(report.mergedGraphs, ["porta_marina"], "…and the shared graph as merged");
  const ids = mine.members.find((m) => m.id === "porta_marina").doc.graph.nodes.map((n) => n.id);
  eq(ids.filter((i) => i === "shared-uuid").length, 1,
     "the shared unit is ONE node — this is what the UUID ids were for");
  ok(ids.includes("mine-only") && ids.includes("theirs-only"), "both authors' work is there");
  ok(report.mergedNodes >= 1,
     "mergedNodes is reported: exactly where a divergent edit could have been overwritten");

  const shelfIds = mine.shelf.nodes.map((n) => n.id);
  eq(shelfIds.filter((i) => i === "res-condivisa").length, 1,
     "two people who collected the same photograph have ONE shelf entry");
}

// ── merging does not duplicate a relation ───────────────────────────────────
{
  const a = { nodes: [{ id: "U1" }, { id: "U2" }],
              edges: [{ id: "mio", source: "U1", target: "U2", edge_type: "is_before" }] };
  const b = { nodes: [{ id: "U1" }, { id: "U2" }],
              edges: [{ id: "loro", source: "U1", target: "U2", edge_type: "is_before" }] };
  const report = { addedGraphs: [], mergedGraphs: [], mergedNodes: 0, addedNodes: 0,
                   addedEdges: 0, warnings: [] };
  C.mergeGraphSections(a, b, report);
  eq(a.edges.length, 1, "the same relation authored twice is one relation");
  eq(report.addedEdges, 0, "…and nothing was added");

  // a DIFFERENT relation between the same nodes IS added, with a free id
  const c = { nodes: [], edges: [{ id: "mio", source: "U1", target: "U2", edge_type: "cuts" }] };
  C.mergeGraphSections(a, c, report);
  eq(a.edges.length, 2, "a different edge type is a different relation");
  eq(new Set(a.edges.map((e) => e.id)).size, 2, "…and the id collision was resolved");
}

console.log(`container: ${checks} checks passed`);
