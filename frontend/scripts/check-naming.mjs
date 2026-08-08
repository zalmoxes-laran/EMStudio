// NAME1 · executable check of src/naming.ts — the paradata naming convention.
//
//   node scripts/check-naming.mjs
//
// The frontend has no test runner (see check-shape-geom.mjs), so the module is
// bundled with the project's own esbuild and exercised in node. `naming.ts` is
// pure by design — no DOM, no store, the strict-naming flag passed in — which is
// exactly what makes this possible.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}naming.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const N = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

let checks = 0;
const ok = (cond, what) => {
  assert.ok(cond, what);
  checks++;
};
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

// A tiny document builder: nodes as `[id, type, name]`, edges as `[type, s, t]`.
const doc = (nodes, edges = []) => ({
  graph: {
    nodes: nodes.map(([id, node_type, name]) => ({ id, node_type, name })),
    edges: edges.map(([edge_type, source, target]) => ({ edge_type, source, target })),
  },
});
const STRICT = { strictDocumentNames: true };
const LOOSE = { strictDocumentNames: false };

// ── the ordinal fills holes ──────────────────────────────────────────────────
{
  const d = doc(
    [["d1", "document", "D.10"], ["e1", "extractor", "D.10.1"], ["e3", "extractor", "D.10.3"]],
    [["extracted_from", "e1", "d1"], ["extracted_from", "e3", "d1"]],
  );
  eq(N.nextExtractorOrdinal(d, "D.10"), 2,
    "D.10.1 and D.10.3 exist → the next ordinal is the HOLE, 2");
  eq(N.nextExtractorOrdinal(d, "D.11"), 1, "a document with no extractors starts at 1");
  // ordinals are per DOCUMENT, not global
  const d2 = doc(
    [["d1", "document", "D.1"], ["d2", "document", "D.2"], ["e1", "extractor", "D.1.1"]],
    [["extracted_from", "e1", "d1"]],
  );
  eq(N.nextExtractorOrdinal(d2, "D.2"), 1, "D.2's first extractor is D.2.1, not D.2.2");
}

// ── derive: attached, unattached, already-correct ────────────────────────────
{
  const d = doc(
    [["d1", "document", "D.10"], ["e1", "extractor", "Temp1"]],
    [["extracted_from", "e1", "d1"]],
  );
  eq(N.deriveExtractorName(d, "e1"), "D.10.1", "an attached Temp gets the document's number");
  const un = doc([["e1", "extractor", "Temp1"]]);
  eq(N.deriveExtractorName(un, "e1"), null, "unattached → nothing to derive");
  // `initialName` names a node that is not in the graph YET (that is when it is
  // called), so the free name is computed against what IS there: in an empty
  // document Temp1, and beside an existing Temp1, Temp2.
  eq(N.initialName(doc([]), "extractor"), "Temp1",
    "the first extractor of an empty document is Temp1");
  eq(N.initialName(un, "extractor"), "Temp2",
    "…and Temp2 when Temp1 is already taken");
  const already = doc(
    [["d1", "document", "D.4"], ["e1", "extractor", "D.4.7"]],
    [["extracted_from", "e1", "d1"]],
  );
  eq(N.deriveExtractorName(already, "e1"), "D.4.7",
    "a valid ordinal is KEPT — checking a graph must not renumber it");
}

// ── the edge type is the one the datamodel declares ──────────────────────────
{
  eq(N.EXTRACTED_FROM, "extracted_from", "extractor → document is `extracted_from`");
  eq(N.COMBINES, "combines", "combiner → extractor is `combines`");
  // a VISUAL REFERENCE to a document must not name the extractor
  const d = doc(
    [["d1", "document", "D.9"], ["e1", "extractor", "Temp1"]],
    [["has_visual_reference", "e1", "d1"]],
  );
  eq(N.deriveExtractorName(d, "e1"), null,
    "has_visual_reference is an illustration, not a provenance: no rename");
  eq(N.computeNameStatus(d, "e1", STRICT).status, "warn",
    "…so the extractor is still an unresolved Temp");
}

// ── temp / combiner / document sequences ────────────────────────────────────
{
  const d = doc([["a", "extractor", "Temp1"], ["b", "extractor", "Temp3"]]);
  eq(N.nextTempName(d), "Temp2", "Temp fills holes too");
  const c = doc([["a", "combiner", "C.1"], ["b", "combiner", "C.2"]]);
  eq(N.deriveCombinerName(c), "C.3", "combiners are progressive");
  eq(N.nextDocumentName(doc([["a", "document", "D.1"], ["b", "document", "D.3"]])), "D.2",
    "the next free document number");
  eq(N.initialName(doc([]), "combiner"), "C.1", "a first combiner is C.1");
  eq(N.initialName(doc([]), "document"), "D.1", "a first document is D.1");
  eq(N.initialName(doc([]), "US"), null, "other types are none of this module's business");
}

// ── status: ok / warn / dup ──────────────────────────────────────────────────
{
  const good = doc(
    [["d1", "document", "D.10"], ["e1", "extractor", "D.10.1"], ["c1", "combiner", "C.1"]],
    [["extracted_from", "e1", "d1"]],
  );
  for (const id of ["d1", "e1", "c1"]) {
    eq(N.computeNameStatus(good, id, STRICT).status, "ok", `${id} is well named`);
  }
  eq(N.nameStatusMap(good, STRICT).size, 0, "a clean document reports nothing");

  // DUPLICATE wins over every other complaint
  const dup = doc(
    [["d1", "document", "D.10"], ["e1", "extractor", "D.10.1"], ["e2", "extractor", "D.10.1"]],
    [["extracted_from", "e1", "d1"], ["extracted_from", "e2", "d1"]],
  );
  const dupCheck = N.computeNameStatus(dup, "e2", STRICT);
  eq(dupCheck.status, "dup", "two nodes with one name → dup");
  eq(dupCheck.suggestion, "D.10.2", "and the suggestion is the next free ordinal");

  // an extractor whose name claims the wrong document
  const wrong = doc(
    [["d1", "document", "D.10"], ["e1", "extractor", "D.7.1"]],
    [["extracted_from", "e1", "d1"]],
  );
  const w = N.computeNameStatus(wrong, "e1", STRICT);
  eq(w.status, "warn", "a name that names another document is a warning");
  eq(w.suggestion, "D.10.1", "with the right name as the suggestion");
  ok(/D\.10/.test(w.reason), "and a reason that says which document it extracts from");

  // an unattached extractor NOT called Temp: it claims a provenance it lacks
  const claims = doc([["e1", "extractor", "D.3.1"]]);
  const cw = N.computeNameStatus(claims, "e1", STRICT);
  eq(cw.status, "warn", "an unattached extractor with a document-shaped name warns");
  eq(cw.suggestion, "Temp1", "and is offered a temporary name");

  // empty names
  eq(N.computeNameStatus(doc([["d1", "document", ""]]), "d1", STRICT).status, "warn",
    "an empty document name is a problem");
  eq(N.computeNameStatus(doc([["d1", "document", "   "]]), "d1", LOOSE).status, "warn",
    "…even with strict naming OFF, and even if it is only spaces");
}

// ── the strict-document flag ────────────────────────────────────────────────
{
  const free = doc([["d1", "document", "Rilievo Porta Marina"]]);
  eq(N.computeNameStatus(free, "d1", STRICT).status, "warn",
    "strict ON: a free-form document name warns");
  eq(N.computeNameStatus(free, "d1", STRICT).suggestion, "D.1",
    "…and suggests the next D.<n>");
  eq(N.computeNameStatus(free, "d1", LOOSE).status, "ok",
    "strict OFF: a free-form name is allowed");
  // the extractor rule derives from the document's name WHATEVER it is
  const d = doc(
    [["d1", "document", "Rilievo 2019"], ["e1", "extractor", "Temp1"]],
    [["extracted_from", "e1", "d1"]],
  );
  eq(N.deriveExtractorName(d, "e1"), "Rilievo 2019.1",
    "with a free-form document the extractor still derives from it");
  eq(N.computeNameStatus(d, "e1", LOOSE).suggestion, "Rilievo 2019.1",
    "…and that is what the extractor is offered");
}

// ── renaming a document makes its extractors inconsistent ───────────────────
{
  const before = doc(
    [["d1", "document", "D.10"], ["e1", "extractor", "D.10.1"], ["e2", "extractor", "D.10.2"]],
    [["extracted_from", "e1", "d1"], ["extracted_from", "e2", "d1"]],
  );
  eq(N.nameStatusMap(before, STRICT).size, 0, "consistent before the rename");
  // D.10 → D.11 (the id is untouched — renaming is a display-name change)
  const after = JSON.parse(JSON.stringify(before));
  after.graph.nodes.find((n) => n.id === "d1").name = "D.11";
  const map = N.nameStatusMap(after, STRICT);
  eq(map.size, 2, "renaming the document leaves BOTH extractors inconsistent");
  eq(map.get("e1").suggestion, "D.11.1", "e1 is offered D.11.1");
  eq(map.get("e2").suggestion, "D.11.1",
    "e2 is offered D.11.1 too — the suggestions are computed one at a time, " +
      "so accepting e1's first then re-checking gives e2 D.11.2");
  // prove that: accept e1's suggestion, then ask again
  after.graph.nodes.find((n) => n.id === "e1").name = "D.11.1";
  eq(N.computeNameStatus(after, "e2", STRICT).suggestion, "D.11.2",
    "after e1 takes D.11.1, e2 is offered D.11.2");
}

// ── attach is the trigger ───────────────────────────────────────────────────
{
  const d = doc([["d1", "document", "D.5"], ["e1", "extractor", "Temp1"]]);
  eq(N.renameOnAttach(d, "e1"), null, "no edge yet → nothing to rename");
  d.graph.edges.push({ edge_type: "extracted_from", source: "e1", target: "d1" });
  eq(N.renameOnAttach(d, "e1"), "D.5.1", "the edge is what names it");
  d.graph.nodes.find((n) => n.id === "e1").name = "D.5.1";
  eq(N.renameOnAttach(d, "e1"), null, "and re-attaching an already-correct name is a no-op");
  eq(N.renameOnAttach(d, "d1"), null, "a document is never renamed by this path");
}

// ── several documents on one extractor: deterministic, not arbitrary ────────
{
  const d = doc(
    [["d1", "document", "D.1"], ["d2", "document", "D.2"], ["e1", "extractor", "Temp1"]],
    [["extracted_from", "e1", "d2"], ["extracted_from", "e1", "d1"]],
  );
  eq(N.documentOfExtractor(d, "e1").name, "D.2",
    "the FIRST extracted_from edge wins, in document order — same answer every time");
}

// ── BUGS-UI · paradata group naming: PD_<referent> ──────────────────────────
{
  eq(N.paradataGroupName("US_100"), "PD_US_100", "a group is named after its referent");
  eq(N.paradataGroupName("  US_100  "), "PD_US_100", "surrounding space never reaches the label");
  eq(N.paradataGroupName(undefined), "PD", "no referent name → the bare prefix, never 'PD_undefined'");
  eq(N.paradataGroupName(""), "PD", "an empty name is not a name");

  const d = doc([["u1", "US", "US_100"], ["g1", "ParadataNodeGroup", "ParadataNodeGroup 1"]]);
  eq(N.paradataGroupRenameOnAttach(d, "g1"), null, "unattached → nothing to derive it from");
  d.graph.edges.push({
    edge_type: N.HAS_PARADATA_NODEGROUP, source: "u1", target: "g1",
  });
  eq(N.paradataGroupRenameOnAttach(d, "g1"), "PD_US_100", "the edge is what names it");
  d.graph.nodes.find((n) => n.id === "g1").name = "PD_US_100";
  eq(N.paradataGroupRenameOnAttach(d, "g1"), null, "already correct → a no-op, no toast churn");
  eq(N.paradataGroupRenameOnAttach(d, "u1"), null, "the referent itself is never renamed by this path");
}

console.log(`naming: ${checks} checks passed`);
