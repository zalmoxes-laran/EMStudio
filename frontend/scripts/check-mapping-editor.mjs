// MAPPING EDITOR · executable check of src/mapping-editor.ts.
//
//   node scripts/check-mapping-editor.mjs
//
// Two things are under test, and the second is the one that matters most:
//
//  1. `buildMapping` — the serialiser. It is the artefact this whole tool exists
//     to produce, so the shape it writes is checked field by field against the
//     schema the importers read;
//  2. **that this module knows nothing about the EM language.** Not a node type,
//     not an edge type, not a CIDOC class may appear in it: they all arrive from
//     `api.mapping_*` over the bridge. A picker with its own list would be a
//     second datamodel, and the one thing a mapping must do is agree with the
//     first.
//
// Same harness as check-shelf: bundled with the project's own esbuild, run in
// node.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}mapping-editor.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const M = await import(
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

// The state an author would have after reading the WP3 XML and making choices.
// The catalog is what the LIBRARY sent (measured shape: cidoc → em_type).
const CATALOG = [
  { cidoc: "A2 Stratigraphic Volume Unit", em_type: "US", em_candidates: ["US"],
    label: "US (or SU)", extension: "CRMarchaeo", cidoc_direct: false },
  { cidoc: "E31 Document", em_type: "DocumentNode",
    em_candidates: ["DocumentNode"], label: "Document",
    extension: "CIDOC-CRM", cidoc_direct: false },
  { cidoc: "E999 Nobody Built This", em_type: null, em_candidates: [],
    label: "E999", extension: "CIDOC-CRM", cidoc_direct: true },
];

function xmlState(overrides = {}) {
  return {
    ...M.EMPTY_STATE,
    path: "/dati/site.xml",
    format: "xml",
    recordPath: "/site/us",
    propertyType: "PropertyNode",
    catalog: CATALOG,
    name: "wp3-xml",
    fields: [
      { name: "@id", source_path: "@id", samples: ["1", "2"], filled: 2, seen: 2 },
      { name: "descrizione", source_path: "descrizione",
        samples: ["Strato di crollo"], filled: 1, seen: 2 },
      { name: "interpretazione", source_path: "interpretazione",
        samples: ["Crollo del tetto"], filled: 2, seen: 2 },
      { name: "rapporti/copre", source_path: "rapporti/copre",
        samples: ["2"], filled: 1, seen: 2 },
      { name: "@period", source_path: "@period", samples: ["II sec."],
        filled: 2, seen: 2 },
    ],
    choices: {
      "@id": { role: "id", cidoc: "A2 Stratigraphic Volume Unit" },
      descrizione: { role: "description" },
      interpretazione: { role: "property", property_name: "Interpretation" },
      "rapporti/copre": { role: "relation",
                          cidoc: "A2 Stratigraphic Volume Unit" },
      // @period deliberately left unmapped
    },
    relations: [{ source_column: "@id", target_column: "rapporti/copre",
                  edge_type: "is_after" }],
    ...overrides,
  };
}

// ── the serialiser writes the schema the importers read ─────────────────────
{
  const mapping = M.buildMapping(xmlState());
  eq(mapping.name, "wp3-xml", "the mapping carries its name");
  eq(mapping.source_settings,
     { format_type: "xml", record_path: "/site/us" },
     "an XML source declares its record path, not a table");
  const columns = mapping.column_mappings;
  eq(Object.keys(columns).sort(),
     ["@id", "descrizione", "interpretazione", "rapporti/copre"],
     "an UNMAPPED field is not in the file at all");
  eq(columns["@id"], { source_path: "@id",
                       cidoc: "A2 Stratigraphic Volume Unit", is_id: true },
     "the id column: its path, its CIDOC class, its role");
  eq(columns.descrizione,
     { source_path: "descrizione", is_description: true,
       target_id_column: "@id" },
     "a description points at the id column — resolved from the choices");
  eq(columns.interpretazione,
     { source_path: "interpretazione", property_name: "Interpretation" },
     "a property carries its NAME and no node type: which type a property is, " +
     "is the datamodel's answer (mapping_normalize fills it)");
  eq(columns["rapporti/copre"],
     { source_path: "rapporti/copre", cidoc: "A2 Stratigraphic Volume Unit",
       is_relation: true },
     "a relation column is edge-only: is_relation stops it doubling as a property");
  eq(mapping.relations,
     [{ source_column: "@id", target_column: "rapporti/copre",
        edge_type: "is_after" }],
     "the relations as declared");
}

// ── the CIDOC class is carried, never resolved on this side ─────────────────
{
  const mapping = M.buildMapping(xmlState());
  const json = JSON.stringify(mapping);
  ok(json.includes("A2 Stratigraphic Volume Unit"),
     "the author's CIDOC choice is what gets written");
  ok(!json.includes('"node_type"'),
     "…and no node_type is invented here: the library resolves it");
}

// ── a table source says table/sheet, not record_path ───────────────────────
{
  const sqlite = M.buildMapping({
    ...xmlState(), format: "sqlite", table: "us_table", recordPath: undefined,
    fields: [{ name: "us", samples: ["1"], filled: 1, seen: 1 }],
    choices: { us: { role: "id", cidoc: "A2 Stratigraphic Volume Unit" } },
    relations: [],
  });
  eq(sqlite.source_settings, { format_type: "sqlite", table_name: "us_table" },
     "sqlite names its TABLE");
  eq(sqlite.column_mappings.us,
     { cidoc: "A2 Stratigraphic Volume Unit", is_id: true },
     "…and a table column has no source_path (it is not a tree)");
  const xlsx = M.buildMapping({
    ...xmlState(), format: "xlsx", table: "Sheet1", recordPath: undefined,
    fields: [{ name: "us", samples: ["1"], filled: 1, seen: 1 }],
    choices: { us: { role: "id" } }, relations: [],
  });
  eq(xlsx.source_settings, { format_type: "xlsx", sheet_name: "Sheet1" },
     "xlsx names its SHEET — the importers read different keys");
}

// ── an XML field always carries its path, even the simple one ──────────────
{
  const mapping = M.buildMapping({
    ...xmlState(),
    fields: [{ name: "descrizione", source_path: "descrizione",
               samples: ["x"], filled: 1, seen: 1 }],
    choices: { descrizione: { role: "id" } },
    relations: [],
  });
  eq(mapping.column_mappings.descrizione.source_path, "descrizione",
     "a mapping that relied on a fallback would depend on the fallback");
}

// ── an empty mapping is still a valid FILE (work in progress) ──────────────
{
  const mapping = M.buildMapping({ ...M.EMPTY_STATE, format: "xml" });
  eq(mapping.column_mappings, {}, "no choices, no columns");
  ok(!("relations" in mapping), "…and no empty relations key");
  eq(mapping.name, "untitled-mapping", "an unnamed mapping still has a name");
}

// ── incomplete relations are dropped, not written half-formed ──────────────
{
  const mapping = M.buildMapping(xmlState({
    relations: [
      { source_column: "@id", target_column: "", edge_type: "" },
      { source_column: "@id", target_column: "rapporti/copre",
        edge_type: "is_after" },
    ],
  }));
  eq(mapping.relations.length, 1, "a relation with no end is not a relation");
}

// ── the helpers the panel and the caller share ─────────────────────────────
{
  const state = xmlState();
  eq(M.mappedCount(state), 4, "four of five fields mapped");
  eq(M.relatableFields(state),
     ["@id", "descrizione", "interpretazione", "rapporti/copre"],
     "only mapped fields can be an edge's end");
  eq(M.typeOfField(state, "@id"), "US",
     "the EM type comes from the CATALOG the library sent");
  eq(M.typeOfField(state, "interpretazione"), "PropertyNode",
     "…and a property's type is the one the library named (propertyType)");
  eq(M.typeOfField(state, "@period"), null, "an unmapped field has no type");
  eq(M.typeOfField({ ...state, propertyType: undefined }, "interpretazione"),
     null, "…and with no answer from the library, no guess");
  eq(M.edgeKey("US", "PropertyNode"), "US→PropertyNode", "the cache key");
}

// ── a CIDOC class nothing implements is carried and marked ─────────────────
{
  const mapping = M.buildMapping(xmlState({
    choices: { "@id": { role: "id", cidoc: "E999 Nobody Built This" } },
    relations: [],
  }));
  eq(mapping.column_mappings["@id"].cidoc, "E999 Nobody Built This",
     "a CIDOC-direct choice is written as the author made it");
  eq(M.typeOfField(xmlState({
    choices: { "@id": { role: "id", cidoc: "E999 Nobody Built This" } },
  }), "@id"), null, "…and it resolves to no EM type, which is the point");
}

// ── THE CONSTRAINT: this module knows nothing about the EM language ────────
{
  const source = await readFile(`${SRC}mapping-editor.ts`, "utf8");
  // comments explain the design and MAY name things; the code may not
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*\*.*$/gm, "");
  for (const name of ["StratigraphicUnit", "EpochNode", "DocumentNode",
                      "PropertyNode", "has_property", "is_after",
                      "extracted_from", "US", "USVs"]) {
    // word-boundary match so `USE` or a property called `us` does not trip it
    const hit = new RegExp(`\\b${name}\\b`).test(code);
    ok(!hit, `the code never names ${name}: the datamodel is the library's`);
  }
  for (const cidoc of ["A8", "E31 Document", "P120_occurs_before", "E19"]) {
    ok(!code.includes(cidoc),
       `the code never names the CIDOC class ${cidoc}`);
  }
  // …and the schema's own vocabulary IS here, because this module is its writer
  for (const key of ["is_id", "is_description", "property_name", "is_relation",
                     "source_path", "column_mappings", "source_settings",
                     "relations"]) {
    ok(code.includes(key), `the schema key ${key} is written by this module`);
  }
  // no fetch either: the caller does the round trips
  ok(!/\bfetch\s*\(/.test(code), "a pure module makes no requests");
}

console.log(`mapping-editor: ${checks} checks passed`);
