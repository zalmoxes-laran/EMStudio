// P4.3 · executable check of src/hub.ts — what the client DECIDES in a room.
//
//   node scripts/check-hub.mjs
//
// No socket and no browser: the decisions a room client makes are pure
// functions of the messages it receives, and that is why they live in `hub.ts`
// rather than inside the WebSocket handler. What is exercised here is exactly
// what would otherwise only be provable by two people typing at once.
//
// The one worth reading is the REBASE (claim 3): a client that comes back with
// history older than the hub's compaction point must NOT replay it — replaying
// would re-assert things the room has already settled and forgotten.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true,
                                  format: "esm", write: false });
  return import("data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const H = await load("hub.ts");
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

// ── 0 · the address ─────────────────────────────────────────────────────────
{
  eq(H.roomUrl("https://em.example.org", "scavo 2026"),
     "wss://em.example.org/v1/rooms/scavo%202026/ws",
     "https becomes wss, and the room name is escaped");
  eq(H.roomUrl("http://localhost:8000/", "scavo", { token: "abc", since: T2 }),
     `ws://localhost:8000/v1/rooms/scavo/ws?token=abc&since=${encodeURIComponent(T2)}`,
     "the token rides in the query — a browser cannot set a WS header");
}

// ── 1 · join → live ─────────────────────────────────────────────────────────
//
// A fake room: the frames a relay sends, applied with the same CRDT the app
// runs. If this converges, the client's half of the live path is real.
{
  const section = { graph_id: "scavo", nodes: [
    { id: "US1", node_type: "US", name: "US1",
      data: { created_at: T1, created_by: ANNA } }], edges: [] };
  // the snapshot arrives…
  const doc = { header: {}, graphs: { scavo: section }, active_graph_id: "scavo" };
  // …then an operation from somebody else
  const incoming = { op: "update_field", node_id: "US1", field: "description",
                     value: "muro in opus", ts: T2, author: BRUNO };
  const res = C.applyOp(doc.graphs.scavo, incoming);
  ok(res.applied, "an incoming operation lands on the joined document");
  eq(doc.graphs.scavo.nodes[0].description, "muro in opus", "…and changes it");
  eq(doc.graphs.scavo.nodes[0].data.field_clocks.description.by, BRUNO,
     "…carrying the hand that made it, not this session's");
}

// ── 2 · live convergence is the offline answer ──────────────────────────────
{
  const base = () => ({ header: {}, active_graph_id: "scavo", graphs: { scavo: {
    graph_id: "scavo",
    nodes: [{ id: "US1", node_type: "US", name: "US1",
              data: { created_at: T1, created_by: ANNA } }],
    edges: [] } } });
  const mine = { op: "update_field", node_id: "US1", field: "description",
                 value: "muro in opus", ts: T2, author: ANNA };
  const theirs = { op: "update_field", node_id: "US1", field: "data.dating",
                   value: "II sec. d.C.", ts: T3, author: BRUNO };

  const live = base();          // my client: my op first, then the relay's echo
  C.applyOp(live.graphs.scavo, mine);
  C.applyOp(live.graphs.scavo, theirs);
  const peer = base();          // their client: the other order
  C.applyOp(peer.graphs.scavo, theirs);
  C.applyOp(peer.graphs.scavo, mine);

  eq(K.contentDigest(live), K.contentDigest(peer),
     "two clients that saw the same operations in different orders agree");
  eq(live.graphs.scavo.nodes[0].description, "muro in opus",
     "…keeping the field each of them wrote (field-level, live)");
  eq(live.graphs.scavo.nodes[0].data.dating, "II sec. d.C.", "…both of them");
}

// ── 3 · the rebase ──────────────────────────────────────────────────────────
{
  eq(H.planRejoin(null, T2).kind, "resume",
     "a first join has nothing to be older than");
  eq(H.planRejoin(T3, null).kind, "resume",
     "a hub that never compacted cannot make my history stale");
  eq(H.planRejoin(T3, T2), { kind: "resume", since: T3 },
     "a base newer than the watermark resumes, and says from where");

  const stale = H.planRejoin(T1, T2);
  eq(stale.kind, "resync", "a base OLDER than the compaction point must re-sync");
  eq(stale.replay, false, "…and its local history is NOT replayed");
  ok(stale.reason.includes("resurrect"),
     "…with the reason said in the terms that matter: it could resurrect");
}

// ── 4 · a local change becomes the operations the relay understands ─────────
{
  const local = {
    op: "update_node", node_id: "US1",
    patch: {},
    fields: [
      { field: "description", value: "muro", ts: T2, by: ANNA },
      { field: "data.nota", value: null, ts: T2, by: ANNA, removed: true },
    ],
  };
  const ops = H.opsForLocalChange(local);
  eq(ops.length, 2, "one operation per field that actually changed");
  eq(ops[0], { op: "update_field", node_id: "US1", field: "description",
               ts: T2, value: "muro" }, "…a value carries its value");
  eq(ops[1], { op: "update_field", node_id: "US1", field: "data.nota",
               ts: T2, remove: true },
     "…and an emptied field travels as a REMOVAL, not as an absence");

  eq(H.opsForLocalChange({ op: "update_node", node_id: "US1", patch: {} }), [],
     "an update that changed no field sends nothing");
  eq(H.opsForLocalChange({ op: "delete_node", node_id: "US1" }),
     [{ op: "remove_node", id: "US1" }], "a deletion is a remove_node");
}

// ── 5 · presence, and why it can never be a lock ────────────────────────────
{
  let state = H.emptyPresence();
  state = H.reducePresence(state, { type: "host_info", connection_id: "me1" });
  eq(state.me, "me1", "the client learns which member is itself");

  state = H.reducePresence(state, { type: "presence", members: [
    { id: "me1", author: ANNA, display: "Anna", selection: [] },
    { id: "you", author: BRUNO, display: "Bruno", selection: ["US1"] }] });
  eq(state.members.length, 2, "the roster is what the room says it is");
  eq([...H.peerSelections(state).keys()], ["US1"],
     "awareness shows what SOMEBODY ELSE is looking at");
  eq(H.peerSelections(state).get("US1"), ["Bruno"], "…and who");

  state = H.reducePresence(state, { type: "select", connection_id: "you",
                                    node_ids: ["US2"] });
  eq([...H.peerSelections(state).keys()], ["US2"], "a selection frame moves the halo");

  // my own selection is never awareness: a halo around what I clicked would
  // tell me I am not alone when I am
  state = H.reducePresence(state, { type: "select", connection_id: "me1",
                                    node_ids: ["US9"] });
  ok(!H.peerSelections(state).has("US9"), "my own selection is not a peer halo");

  // and the shape itself: there is no way to ask "is this locked"
  ok(typeof H.peerSelections === "function" && !("isLocked" in H),
     "nothing here can answer 'may I edit this?' — awareness, by construction");

  state = H.reducePresence(state, { type: "presence", members: [
    { id: "me1", author: ANNA, display: "Anna", selection: [] }] });
  eq(H.peerSelections(state).size, 0, "when the others leave, the halos go with them");
}

// ── 6 · a refused operation is awareness, not an error ──────────────────────
{
  const note = H.noteForStale({ op: "update_field", node_id: "US1",
                                field: "description", ts: T1 }, "US1");
  eq(note.kind, "stale", "a stale answer is a note…");
  ok(note.text.includes("newer"), "…that says the room already has something newer");
  ok(!note.text.toLowerCase().includes("error"), "…and never calls it an error");

  const remote = H.noteForRemoteOp({ op: "update_field", node_id: "US1",
                                     field: "dating", ts: T2 }, "Bruno", "US1");
  eq(remote.kind, "remote-edit", "somebody else's edit is a note too");
  ok(remote.text.includes("Bruno") && remote.text.includes("dating"),
     "…naming who and what");
  const emptied = H.noteForRemoteOp({ op: "update_field", node_id: "US1",
                                      field: "dating", remove: true, ts: T2 },
                                    "Bruno", "US1");
  ok(emptied.text.includes("emptied"), "…and telling an emptying from a change");
}

// ── 7 · STEP 4 · a re-sync must not resurrect what was emptied ──────────────
//
// The hole this closes: after a re-sync the client re-sends the work the room
// never acknowledged. If that re-send carried only the VALUES, a field the
// person emptied while offline would come back full — the room's older document
// would win against an intention that never travelled.
//
// The scenario is played with the same CRDT the app runs: the room's document
// still has the value; the client's pending list has the EMPTYING.
{
  const now = "2026-08-13T13:00:00Z";
  const pending = [
    { op: "update_field", node_id: "US1", field: "description",
      value: "muro in opus", ts: T1 },
    { op: "update_field", node_id: "US1", field: "data.dating", remove: true,
      ts: T1 },
  ];
  const resend = H.stampForResend(pending, now);
  eq(resend.length, 2, "everything unconfirmed comes back…");
  eq(resend[1].remove, true, "…INCLUDING the emptying, not only the values");
  eq(resend[0].ts, now, "…re-stamped now, or the room's settled state would win");
  ok(!("value" in resend[1]),
     "an emptying carries no value — it is an act, not a blank");

  // the room's document, as it was BEFORE this client's pending work
  const roomNode = { id: "US1", node_type: "US", name: "US1",
                     description: "muro",
                     data: { dating: "II sec.", created_at: T1, created_by: BRUNO } };
  // …and the client re-applies its pending operations on top of it, exactly as
  // `hubWriteFieldLocally` does: a removal goes through clearField
  for (const op of resend) {
    if (op.remove === true) C.clearField(roomNode, op.field, { ts: op.ts, by: ANNA });
    else C.writeField(roomNode, op.field, op.value, { ts: op.ts, by: ANNA });
  }
  eq(roomNode.description, "muro in opus", "the unconfirmed value is back");
  eq(C.getField(roomNode, "data.dating"), undefined,
     "and the emptied field is STILL empty — no resurrection");
  const tomb = C.fieldTombstone(roomNode, "data.dating");
  ok(tomb !== null,
     "…because what was written is a TOMBSTONE, not a missing key");
  eq(tomb.ts, now,
     "…dated now, so the room's older value cannot out-date it");
  ok(C.knownFields(roomNode).includes("data.dating"),
     "…and the merge still SEES the field, which is what stops it coming back");
}

console.log(`hub: ${checks} checks passed`);
