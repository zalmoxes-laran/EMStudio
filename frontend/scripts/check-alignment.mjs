// C1 · executable check of src/alignment.ts — WHICH DOCUMENT each end has open.
//
//   node scripts/check-alignment.mjs
//
// The defect this module exists for is not a bug in a message handler: EMStudio
// → Blender selection was measured working. It is that two ends looking at
// different documents produce exactly the same silence as a closed channel or a
// graph that is not in memory — three causes, one symptom.
//
// The twin lives in `EM-blender-tools/sync_manager/alignment.py` and
// `tests/test_alignment.py` asserts the same table there. Two languages, one
// rule; if they ever disagree, the disagreement is in these two files.
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
const A = await load("alignment.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

// ── 1 · the keys are the contract, and they are spelled once ────────────────
eq([A.GRAPH_ID_KEY, A.GRAPH_NAME_KEY, A.GRAPH_IDS_KEY],
   ["graph_id", "graph_name", "graph_ids"],
   "the three wire keys, spelled the way alignment.py spells them");

// ── 2 · same id → aligned, and nothing is said ──────────────────────────────
{
  const r = A.compare({ graph_id: "g-1", graph_name: "Aiano" },
                      { graph_id: "g-1", graph_name: "Aiano" });
  ok(r.aligned, "the same id is the same document");
  ok(r.known, "both declared: the answer means something");
  eq(r.sentence, "", "nothing to say when the two agree");
}

// ── 3 · different ids → the sentence the prompt asks for ────────────────────
{
  const r = A.compare({ graph_id: "g-1", graph_name: "TempluMare" },
                      { graph_id: "g-2", graph_name: "Aiano" });
  ok(!r.aligned, "different ids are different documents");
  eq(r.sentence, "you have Aiano (g-2) open, I have TempluMare (g-1)",
     "«tu hai aperto X, io Y», and `you` is always the other end");
  // The id rides along with the name ON PURPOSE: the failure this module is
  // built to catch is two documents that LOOK alike, so a sentence naming only
  // the names would be unreadable in exactly the case that matters.
  ok(!r.alsoOpen, "their document is not among mine");
}

// ── 4 · NOT KNOWING IS NOT AN ALARM — the rule this module is built around ──
//
// An end that declares nothing (an older build, a Blender with no graph loaded)
// is SILENT, not misaligned. Saying otherwise invents a fact, and a warning
// that fires on no evidence is a warning people learn to ignore.
{
  const mute = A.compare({ graph_id: "g-1" }, {});
  ok(mute.aligned, "a silent peer is not a misaligned peer");
  ok(!mute.known, "…but `known` says we concluded nothing");
  eq(mute.sentence, "", "and nothing is said");

  const neither = A.compare({}, {});
  ok(neither.aligned && !neither.known, "two silent ends conclude nothing");

  const mineMissing = A.compare({}, { graph_id: "g-2" });
  ok(mineMissing.aligned && !mineMissing.known,
     "no graph loaded HERE is also not a misalignment");
}

// ── 5 · «it is in my other tab» is a different situation ────────────────────
{
  const r = A.compare({ graph_id: "g-1", graph_name: "TempluMare",
                        graph_ids: ["g-1", "g-2"] },
                      { graph_id: "g-2", graph_name: "Aiano" });
  ok(!r.aligned, "still not the same document");
  ok(r.alsoOpen, "…but I have theirs loaded");
  ok(r.sentence.endsWith("switch to it"),
     "and the cure named is the one that works");
}

// ── 6 · the NAME is a label, never the comparison ───────────────────────────
//
// Two people can each hold their own `TempluMare.em.json`. Comparing names
// would call those the same document, which is the failure this module is
// supposed to catch rather than cause.
{
  const r = A.compare({ graph_id: "g-1", graph_name: "TempluMare" },
                      { graph_id: "g-9", graph_name: "TempluMare" });
  ok(!r.aligned, "the same NAME on two different ids is not the same document");
}
{
  const r = A.compare({ graph_id: "g-1" }, { graph_id: "g-1", graph_name: "X" });
  ok(r.aligned, "…and a different name on the same id IS the same document");
}

// ── 7 · the label a human reads ─────────────────────────────────────────────
eq(A.label("0123456789abcdef", "Aiano"), "Aiano (01234567)",
   "name first, a short id in brackets");
eq(A.label("0123456789abcdef", ""), "0123456789abcdef",
   "no name: the id itself, uncut — it is all the reader has");
eq(A.label("g-1", "g-1"), "g-1", "a name equal to the id is not repeated");
eq(A.label("", ""), "", "nothing known, nothing invented");

// ── 8 · it never throws, whatever it is handed ──────────────────────────────
for (const junk of [null, undefined, {}, { graph_id: null },
                    { graph_id: "g", graph_ids: "not-a-list" }]) {
  const r = A.compare(junk, junk);
  ok(typeof r.aligned === "boolean", `compare survives ${JSON.stringify(junk)}`);
}

// ── 9 · C2 · the gate is on the way IN, and nowhere on the way out ─────────
//
// A source check, because the thing to hold is an ABSENCE and absences have no
// runtime. What C2 moved is the whole point: a gate on the way out is invisible
// to the other end — «has not sent» and «got lost» look the same — so no send
// path may consult a preference ever again.
//
// The third outbound point is the one that made this worth asserting: a room's
// operations never went through `sendOp` at all (`hubSendLocal` → `sendCommand`),
// which is why P5's read-only was enforced nowhere and a viewer's edits were
// leaving this client to be refused one at a time by the server.
{
  const sync = readFileSync(new URL("../src/sync.ts", import.meta.url).pathname,
                            "utf8");
  const body = (name) => {
    const i = sync.indexOf(`  ${name}(`);
    return i < 0 ? "" : sync.slice(i, sync.indexOf("\n  }", i));
  };
  for (const name of ["sendSelect", "sendOp", "sendCommand", "announceSelf"]) {
    const src = body(name);
    ok(src.length > 0, `sync.ts still has ${name}`);
    ok(!/this\.accept/.test(src),
       `${name} consults no preference: the gate is on the way IN`);
  }
  // …and the ROOM's refusal, which is a different kind of fact, does stop an op
  ok(/this\.writable/.test(body("sendOp")),
     "sendOp still obeys what the room said this client may do");
  ok(!/this\.writable/.test(body("sendSelect")),
     "…and a viewer's awareness is still welcome in a room");
  const main = readFileSync(new URL("../src/main.ts", import.meta.url).pathname,
                            "utf8");
  const hub = main.slice(main.indexOf("function hubSendLocal"),
                         main.indexOf("function hubWriteFieldLocally"));
  ok(/sync\.canWrite/.test(hub),
     "the room's own send path obeys it too — the third outbound point");
  // the ingress gate exists, and separates the two kinds of arrival
  ok(/acceptsSelection/.test(sync) && /acceptsOps/.test(sync),
     "the ingress gate tells a selection from a graph edit");
}

console.log(`alignment: ${checks} checks passed`);
