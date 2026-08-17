// ASSETS · executable check of src/ingest.ts — bulk ingestion, on the graph.
//
//   node scripts/check-ingest.mjs
//
// Same harness as check-shelf/check-tiling: bundled with the project's own
// esbuild and exercised in node against a MINIATURE store — the same surface
// `DocumentStore` exposes (liveNodes/liveEdges/addNode/addEdge/updateNode/
// hasEdge/node), tombstones included, so what is checked here is what the app
// does and not a simplified twin of it.
//
// The Python side (s3Dgraphy tests/test_dtc_ingest.py) defends the same four
// acts against the library. The two must agree: one bucket for a batch, a
// declared chain, rights on the LOT, and usages that tell a citation from a
// licence.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}ingest.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const I = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};
const throws = (fn, what) => { assert.throws(fn, undefined, what); checks++; };

const digest = (n) => "sha256:" + String(n).padStart(2, "0").repeat(32);

/** The miniature store. `removed` marks a tombstone the way crdt.ts does. */
function makeStore(nodes = [], edges = []) {
  const doc = { nodes: [...nodes], edges: [...edges] };
  const alive = (x) => !(x.data && x.data.removed);
  return {
    doc,
    liveNodes: () => doc.nodes.filter(alive),
    liveEdges: () => {
      const live = new Set(doc.nodes.filter(alive).map((n) => n.id));
      return doc.edges.filter((e) => alive(e) && live.has(e.source) && live.has(e.target));
    },
    node: (id) => doc.nodes.find((n) => n.id === id) ?? null,
    addNode: (n) => { doc.nodes.push(n); return n; },
    addEdge: (source, target, edge_type) => {
      const e = { id: `${source}__${edge_type}__${target}`, source, target, edge_type };
      doc.edges.push(e);
      return e;
    },
    updateNode: (id, patch) => {
      const n = doc.nodes.find((x) => x.id === id);
      if (n) Object.assign(n, patch);
    },
    hasEdge: (source, target, edge_type) =>
      doc.edges.some((e) => e.source === source && e.target === target
        && e.edge_type === edge_type),
  };
}

function withFiles(count) {
  const nodes = [];
  for (let i = 0; i < count; i++) {
    nodes.push({ id: `img${i}`, name: `IMG_000${i}.jpg`, node_type: "resource",
                 description: "", data: { checksum: digest(i), residency: "resident" } });
  }
  return makeStore(nodes);
}

// ── what a file IS, and what it is FOR ──────────────────────────────────────
{
  eq(I.kindOf("DSC_0001.JPG"), "image", "an extension is a statement somebody made");
  eq(I.kindOf("mesh.glb"), "3d_model", "a glb is a model");
  eq(I.kindOf("nuvola.e57"), "point_cloud", "an e57 is a point cloud");
  eq(I.kindOf("relazione.pdf"), "document", "a pdf is a document");
  eq(I.kindOf("dati.zip"), "unknown", "and an archive is nothing in particular");
  // the browser's octet-stream must not overrule an extension
  eq(I.kindOf("foto.tif", "application/octet-stream"), "image",
     "the name wins over a media type that says nothing");
  eq(I.kindOf("senza-estensione", "image/png"), "image",
     "…and the media type answers when the name cannot");
  eq(I.defaultUse("image"), "iiif", "an image is deduced as a IIIF source");
  eq(I.defaultUse("3d_model"), "proxy", "a model as a proxy");
  eq(I.defaultUse("unknown"), "raw", "and what nobody recognises stays raw");
}

// ── 1 · three files, ONE acquisition ────────────────────────────────────────
{
  const store = withFiles(3);
  const res = I.bucketAcquisition(store, {
    resources: ["img0", "img1", "img2"],
    name: "Volo 2026-03",
    metadata: { camera: "DJI P4", date: "2026-03-11" },
  });
  eq(res.count, 3, "three members");
  eq(res.created, true, "the lot was made");
  eq(store.liveNodes().filter((n) => n.node_type === "dtc_acquisition").length, 1,
     "ONE acquisition, not three");
  eq(store.liveNodes().filter((n) => n.node_type === "resource").length, 3,
     "the files are still files — the bucket groups them, it does not absorb them");
  eq(store.liveEdges().filter((e) => e.edge_type === "dtc_had_output").length, 3,
     "membership IS the edges");
  const acq = store.node(res.acquisitionId);
  eq(acq.data.camera, "DJI P4", "the representative facts live on the event");
  eq(acq.data.member_count, 3, "…with the cached count beside them");
  eq(I.acquisitionMembers(store, res.acquisitionId), ["img0", "img1", "img2"],
     "and the edges answer the membership");
}

// the uploader holds DIGESTS, not ids
{
  const store = withFiles(2);
  const res = I.bucketAcquisition(store, {
    resources: [digest(0), digest(1).slice("sha256:".length)], name: "lot",
  });
  eq(res.members.sort(), ["img0", "img1"], "a digest names a resource, prefixed or bare");
}

// a NAMED lot is the same lot the second time, and grows
{
  const store = withFiles(3);
  const a = I.bucketAcquisition(store, { resources: ["img0"], name: "Volo 2026-03" });
  const b = I.bucketAcquisition(store, { resources: ["img1", "img2"], name: "Volo 2026-03" });
  eq(b.acquisitionId, a.acquisitionId, "the same name is the same event");
  eq(b.count, 3, "…and the second drop added to it");
  eq(store.liveNodes().filter((n) => n.node_type === "dtc_acquisition").length, 1,
     "still one bucket");
}

// idempotence
{
  const store = withFiles(3);
  I.bucketAcquisition(store, { resources: ["img0", "img1", "img2"], name: "lot" });
  const edges = store.liveEdges().length;
  const again = I.bucketAcquisition(store, { resources: ["img0", "img1", "img2"], name: "lot" });
  eq(again.added, [], "nothing new to add");
  eq(store.liveEdges().length, edges, "and no duplicate edge");
}

// a member the graph does not have is REPORTED, never invented
{
  const store = withFiles(1);
  const res = I.bucketAcquisition(store, { resources: ["img0", "img404"], name: "lot" });
  eq(res.missing, ["img404"], "the missing one is named");
  eq(res.count, 1, "…and not counted");
  eq(store.liveNodes().filter((n) => n.node_type === "resource").length, 1,
     "no node was conjured to hold it");
}

// a tombstoned member is not a member
{
  const store = withFiles(3);
  const res = I.bucketAcquisition(store, { resources: ["img0", "img1", "img2"], name: "lot" });
  store.node("img1").data.removed = { ts: "2026-08-17T10:00:00Z", by: "0000" };
  eq(I.acquisitionMembers(store, res.acquisitionId), ["img0", "img2"],
     "the dead one drops out of the membership");
  const again = I.bucketAcquisition(store, { resources: [], acquisitionId: res.acquisitionId });
  eq(store.node(res.acquisitionId).data.member_count, 2,
     "…and the cached count catches up on the next write");
  eq(again.count, 2, "as does the report");
}

// a bucket groups FILES
{
  const store = withFiles(1);
  store.addNode({ id: "US1", name: "US1", node_type: "US", description: "", data: {} });
  const res = I.bucketAcquisition(store, { resources: ["img0", "US1"], name: "lot" });
  eq(res.missing, ["US1"], "a unit is not a file");
}

// ── 2 · the DECLARED chain ──────────────────────────────────────────────────
{
  const store = withFiles(3);
  const lot = I.bucketAcquisition(store, { resources: ["img0", "img1", "img2"], name: "Volo" });
  store.addNode({ id: "ortho", name: "ortho.tif", node_type: "resource",
                  description: "", data: { checksum: digest(9) } });

  const res = I.declareDerivation(store, {
    output: "ortho", inputs: [lot.acquisitionId], tool: "Metashape",
  });
  eq(res.inputs, [lot.acquisitionId], "the whole campaign is ONE input");
  eq(store.liveEdges().filter((e) => e.edge_type === "dtc_had_input").length, 1,
     "one input edge, not one per photograph");
  const proc = store.node(res.processId);
  eq(proc.node_type, "dtc_process", "the event is a DTC process");
  eq(proc.data.tool, { name: "Metashape" }, "the tool, at the minimum: its name");
  ok(store.hasEdge(res.processId, "ortho", "dtc_had_output"), "…and it produced the output");
  eq(res.warnings, [], "nothing to report");
  // an ACQUISITION input gets no resource-to-resource shortcut: none exists
  eq(store.liveEdges().filter((e) => e.edge_type === "dtc_derived_from").length, 0,
     "dtc_derived_from runs between files, and a batch is an event");
}

{
  const store = withFiles(1);
  store.addNode({ id: "mesh", name: "mesh.glb", node_type: "resource",
                  description: "", data: { checksum: digest(9) } });
  I.declareDerivation(store, { output: "mesh", inputs: ["img0"], tool: "Blender" });
  ok(store.hasEdge("mesh", "img0", "dtc_derived_from"),
     "a RESOURCE input also gets the direct shortcut");

  const before = store.liveEdges().length;
  const again = I.declareDerivation(store, { output: "mesh", inputs: ["img0"], tool: "Blender" });
  eq(again.created, false, "the same declaration converges");
  eq(store.liveEdges().length, before, "…and adds no edge");
  eq(store.liveNodes().filter((n) => n.node_type === "dtc_process").length, 1, "one event");
}

{
  const store = withFiles(1);
  throws(() => I.declareDerivation(store, { output: "nowhere", inputs: ["img0"] }),
         "an output that is not there is refused, not created");
  const res = I.declareDerivation(store, { output: "img0", inputs: ["img0"], tool: "cp" });
  eq(res.inputs, [], "a file is not derived from itself");
  ok(res.warnings.length === 1, "…and it is said");
}

{
  const store = withFiles(1);
  store.addNode({ id: "mesh", name: "mesh.glb", node_type: "resource", description: "", data: {} });
  store.addNode({ id: "proxy", name: "proxy.glb", node_type: "resource", description: "", data: {} });
  I.declareDerivation(store, { output: "mesh", inputs: ["img0"], tool: "Blender" });
  I.declareDerivation(store, { output: "proxy", inputs: ["mesh"], tool: "gltfpack" });
  const chain = I.derivationChain(store, "mesh");
  eq(chain.madeBy.map((c) => c.tool), ["Blender"], "what made it");
  eq(chain.usedBy.map((c) => c.tool), ["gltfpack"], "and what it went on to make");
}

// ── 3 · who uses this asset ─────────────────────────────────────────────────
{
  const store = withFiles(1);
  store.addNode({ id: "US1", name: "US1", node_type: "US", description: "", data: {} });
  store.addEdge("US1", "img0", "has_linked_resource");
  store.addNode({ id: "lic", name: "CC-BY-4.0", node_type: "license", description: "",
                  data: { license_type: "CC-BY-4.0" } });
  store.addEdge("img0", "lic", "has_license");

  const usages = I.resourceUsages(store, digest(0));
  eq(usages.length, 2, "two edges touch this file");
  const byRole = Object.fromEntries(usages.map((u) => [u.role, u.id]));
  eq(byRole.reference, "US1", "a unit CITES it");
  eq(byRole.rights, "lic", "…and a licence is attached to it, which is not a use");

  // a deleted user is not a user
  store.node("US1").data.removed = { ts: "2026-08-17T10:00:00Z", by: "0000" };
  eq(I.resourceUsages(store, "img0").map((u) => u.id), ["lic"],
     "the tombstoned citation is gone");
}

// ── 4 · supersession is never silent ────────────────────────────────────────
{
  const store = withFiles(1);
  store.addNode({ id: "US1", name: "US1", node_type: "US", description: "", data: {} });
  store.addEdge("US1", "img0", "has_linked_resource");

  eq(I.supersessionOf(store, "IMG_0000.jpg", digest(0)), null,
     "the same bytes under the same name are the same object, not a replacement");
  const sup = I.supersessionOf(store, "IMG_0000.jpg", digest(7));
  ok(sup, "the same name with different bytes IS a replacement");
  eq(sup.previous, "img0", "…of this resource");
  eq(sup.usages.map((u) => u.id), ["US1"],
     "and the citations at stake are counted, which is why it is a warning");
  eq(I.supersessionOf(store, "altro.jpg", digest(7)), null, "another name is another file");
}

// ── the note nobody may skip: reference bytes are outside the gate ──────────
{
  ok(I.referenceIsUnsafe("reference", true),
     "an embargoed file by reference is the combination that must never be offered");
  ok(!I.referenceIsUnsafe("resident", true), "resident bytes pass through the gate");
  ok(!I.referenceIsUnsafe("reference", false), "and an open file by reference is a choice");
}

console.log(`ingest: ${checks} checks passed`);
