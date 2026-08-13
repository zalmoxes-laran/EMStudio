// P4.1 · executable check of src/crdt.ts — the algebra, and its PARITY with Python.
//
//   node scripts/check-crdt.mjs
//
// Two implementations that never meet must be comparable on something. That
// something is `testdata/crdt-parity.json` — the SAME file as
// `s3Dgraphy/tests/fixtures/crdt-parity.json` — and the canonical digest it
// carries. If either side changes its mind about a tie-break, a fallback or a
// field clock, the digests part company and this fails instead of two projects
// quietly diverging on somebody's disk.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true,
                                  format: "esm", write: false });
  return import("data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const C = await load("crdt.ts");
const K = await load("container.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const ANNA = "0000-0002-1825-0097";
const BRUNO = "0000-0001-5109-3700";
const T1 = "2026-08-13T10:00:00Z";
const T2 = "2026-08-13T11:00:00Z";
const T3 = "2026-08-13T12:00:00Z";

const node = (id = "US1", data) => ({ id, node_type: "US", name: id,
                                      ...(data ? { data } : {}) });
const section = (...nodes) => ({ graph_id: "scavo", name: "Scavo",
                                 nodes: nodes.map((n) => structuredClone(n)), edges: [] });
const digest = (s) => K.contentDigest({ graphs: { [s.graph_id]: s },
                                        active_graph_id: s.graph_id });

// ── 1 · commutatività ───────────────────────────────────────────────────────
{
  const base = node("US1", { created_at: T1, created_by: ANNA });
  const l1 = [
    { op: "update_field", node_id: "US1", field: "description", value: "muro in opus",
      ts: T2, author: ANNA },
    { op: "update_field", node_id: "US1", field: "data.value", value: "1.20",
      ts: T2, author: ANNA },
  ];
  const l2 = [
    { op: "update_field", node_id: "US1", field: "description",
      value: "muro di fondazione", ts: T3, author: BRUNO },
    { op: "add_node", node: node("US2"), ts: T2, author: BRUNO },
  ];
  const a = section(base); C.applyOps(a, [...l1, ...l2]);
  const b = section(base); C.applyOps(b, [...l2, ...l1]);
  eq(digest(a), digest(b), "L1∘L2 and L2∘L1 converge");
  const us1 = a.nodes.find((n) => n.id === "US1");
  eq(us1.description, "muro di fondazione", "…on the more recent value");
  eq(us1.data.value, "1.20", "…keeping the field nobody contested");
}

// ── 2 · idempotenza ─────────────────────────────────────────────────────────
{
  const s = section(node("US1", { created_at: T1, created_by: ANNA }));
  const op = { op: "update_field", node_id: "US1", field: "description",
               value: "muro", ts: T2, author: ANNA };
  const first = C.applyOp(s, op);
  const after = digest(s);
  const second = C.applyOp(s, op);
  ok(first.applied && !second.applied, "the second application does nothing");
  eq(second.reason, "idempotent", "…and says why");
  eq(digest(s), after, "…the state is byte-identical");

  const late = C.applyOp(s, { op: "update_field", node_id: "US1",
                              field: "description", value: "vecchio",
                              ts: T1, author: BRUNO });
  eq(late.reason, "stale", "a late op is refused as stale, not applied");
  eq(s.nodes[0].description, "muro", "…and the newer value stands");
}

// ── 3 · delete vs edit ──────────────────────────────────────────────────────
{
  const s = section(node("US1", { created_at: T1, created_by: ANNA }));
  C.applyOp(s, { op: "update_field", node_id: "US1", field: "description",
                 value: "edit", ts: T1, author: ANNA });
  C.applyOp(s, { op: "remove_node", id: "US1", ts: T2, author: BRUNO });
  ok(C.isRemoved(s.nodes[0]), "a deletion later than the edit wins");
  eq(s.nodes.length, 1, "…the node stays in the RECORD (it is a tombstone)");
  eq(C.liveNodes(s).length, 0, "…and the VIEW hides it");

  C.applyOp(s, { op: "update_field", node_id: "US1", field: "description",
                 value: "ci ripenso", ts: T3, author: ANNA });
  ok(!C.isRemoved(s.nodes[0]), "an edit later than the deletion resurrects it");
  eq(C.liveNodes(s).length, 1, "…deliberately, and visibly");
}

// ── 4 · field-level ─────────────────────────────────────────────────────────
{
  const mine = node("US1", { created_at: T1, created_by: ANNA, modified_at: T2,
                             modified_by: ANNA,
                             field_clocks: { description: { ts: T2, by: ANNA } } });
  mine.description = "muro in opus";
  const theirs = node("US1", { created_at: T1, created_by: ANNA, modified_at: T3,
                               modified_by: BRUNO, dating: "II sec. d.C.",
                               field_clocks: { "data.dating": { ts: T3, by: BRUNO } } });
  theirs.description = "base";
  const out = C.mergePayloads(mine, theirs);
  eq(out.payload.description, "muro in opus", "the field A stamped is kept");
  eq(out.payload.data.dating, "II sec. d.C.", "…and the field B stamped too");
  eq(out.fields.length, 0, "nothing was lost, so nothing is reported");
}

// ── 5 · stesso campo, concorrenti ───────────────────────────────────────────
{
  const s = section(node("US1", { created_at: T1 }));
  C.applyOp(s, { op: "update_field", node_id: "US1", field: "description",
                 value: "di Anna", ts: T2, author: ANNA });
  C.applyOp(s, { op: "update_field", node_id: "US1", field: "description",
                 value: "di Bruno", ts: T2, author: BRUNO });
  eq(s.nodes[0].description, "di Bruno",
     "same instant → the smaller iD decides, stably and declared");
  eq(s.nodes[0].data.field_clocks.description.by, BRUNO, "…and the clock records it");

  const a = node("US1", { created_at: T1, modified_at: T2, modified_by: ANNA });
  a.description = "di Anna";
  const b = node("US1", { created_at: T1, modified_at: T3, modified_by: BRUNO });
  b.description = "di Bruno";
  eq(C.canonicalValue(C.mergePayloads(a, b).payload),
     C.canonicalValue(C.mergePayloads(b, a).payload),
     "merging is symmetric: A∪B and B∪A are the same payload");
  const lost = C.mergePayloads(a, b).fields[0];
  eq(lost.field, "description", "the contested field is named");
  eq(lost.loserValue, "di Anna", "…and the value that lost travels with it");
  eq(lost.winner.by, BRUNO, "…with who won");
}

// ── 6 · PARITÀ con Python ───────────────────────────────────────────────────
{
  const fixture = JSON.parse(
    readFileSync(new URL("../testdata/crdt-parity.json", import.meta.url), "utf8"));
  const s = structuredClone(fixture.section);
  C.applyOps(s, fixture.ops);
  eq(digest(s), fixture.expected_digest,
     "the TS algebra lands on the digest s3Dgraphy computes for the same op-log");
  const reversed = structuredClone(fixture.section);
  C.applyOps(reversed, [...fixture.ops].reverse());
  eq(digest(reversed), fixture.expected_digest,
     "…and so does the reverse order (convergence, measured across languages)");
}

console.log(`crdt: ${checks} checks passed`);
