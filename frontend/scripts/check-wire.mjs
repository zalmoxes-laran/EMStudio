// WIRE 2 · executable check of src/wire.ts — the envelope, and the collision
// it makes impossible.
//
//   node scripts/check-wire.mjs
//
// The bug this exists for: the envelope's `source` ("who sent this") and an
// edge's `source` ("where it starts") were the same key in a flat message. The
// relay stripped one and took the other with it, and the only trace was a load
// warning about an edge whose ends do not exist.
//
// What is asserted here is the CONTRACT the three speakers share — this client,
// `em-server/app/wire.py` and `EM-blender-tools/sync_bridge/wire.py`. Three
// languages, one rule; if they ever disagree, the disagreement is here.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true,
                                  format: "esm", write: false });
  return import("data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const W = await load("wire.ts");
const C = await load("commands.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

// ── 1 · the envelope owns only the wire's words ─────────────────────────────
{
  const message = W.envelope("op", { op: "add_edge", source: "reg-1", target: "US1" });
  eq(Object.keys(message).sort(), ["payload", "source", "type", "v"],
     "the envelope is exactly {v, type, source, payload}");
  eq(message.v, 2, "WIRE 2");
  eq(message.source, "emstudio", "the ENVELOPE's source: who sent this");
  eq(message.payload.source, "reg-1",
     "the PAYLOAD's source: where the edge starts. Two words, two namespaces, " +
     "and no relay can confuse them any more");
  ok(message.payload !== undefined && typeof message.payload === "object",
     "the body always travels nested, even when it is small");
}

// ── 2 · routing stays outside the body ──────────────────────────────────────
{
  const message = W.envelope("op", { op: "add_node" }, { graph_id: "scavo" });
  eq(message.graph_id, "scavo", "`graph_id` is READ by the relay: a wire word");
  ok(!("graph_id" in message.payload), "…so it is not in the body");
  const bare = W.envelope("op", { op: "add_node" }, { graph_id: undefined });
  ok(!("graph_id" in bare), "an absent routing key is absent, not null");
}

// ── 3 · reading, and refusing ───────────────────────────────────────────────
{
  const good = W.read({ v: 2, type: "op", source: "em-server",
                        payload: { op: "add_node" } });
  ok(good.ok, "a v2 message reads");
  eq(good.message.type, "op", "…with its type");
  eq(good.message.payload.op, "add_node", "…and its body");

  const old = W.read({ v: 1, type: "op", op: "add_edge", source: "reg-1" });
  ok(!old.ok, "a v1 message is REFUSED, not half-read");
  ok(old.error.includes("v2") && old.error.includes("payload"),
     "…and the refusal says what changed, so the fix is obvious");

  ok(!W.read("not an object").ok, "a string is not a message");
  ok(!W.read({ v: 2, source: "x", payload: {} }).ok, "a message must say its type");
  ok(W.read({ v: 2, type: "request_snapshot", source: "x" }).ok,
     "a message with no body reads as an empty one — asking for `payload: {}` " +
     "on a request that has no body would be ceremony");
  eq(W.read({ v: 2, type: "request_snapshot", source: "x" }).message.payload, {},
     "…as an empty object, so every reader has one shape to handle");
}

// ── 4 · the command channel travels the same way ────────────────────────────
{
  const command = C.buildCommand("create_proxy_for_unit", "US101", { size: 2 });
  eq(command.v, 2, "a command is a wire message like any other");
  eq(command.type, "command", "…and says so in the envelope");
  eq(command.payload.verb, "create_proxy_for_unit", "…with its verb inside");
  eq(command.payload.target, "US101",
     "`target` is the COMMAND's word now, where it cannot collide with routing");
  ok(typeof command.payload.cmd_id === "string" && command.payload.cmd_id.length === 36,
     "the deterministic id rides in the body with the rest of the command");
  eq(command.payload.cmd_id,
     C.commandId("create_proxy_for_unit", "US101", { size: 2 }),
     "…and is still the uuid5 both ends compute independently");
}

// ── 5 · the op matrix, from this side ───────────────────────────────────────
//
// The mirror of `em-server/tests/test_wire.py::test_2_every_verb…`: there, every
// verb goes through two real sockets; here, every verb this client can BUILD
// survives the envelope untouched. The one that matters is `add_edge`, whose
// `source`/`target` are endpoints and used to be eaten by the wire's own
// `source`.
{
  const H = await load("hub.ts");
  const cases = [
    { local: { op: "add_node", node: { id: "US9", node_type: "US", name: "US9",
                                       data: { created_at: "2026-08-14T11:00:00Z" } } },
      fields: ["op", "node", "id"] },
    { local: { op: "update_node", node_id: "US1",
               fields: [{ field: "description", value: "muro", ts: "2026-08-14T11:00:00Z" }] },
      fields: ["op", "node_id", "field", "value", "ts"] },
    { local: { op: "delete_node", node_id: "US2" }, fields: ["op", "id"] },
    { local: { op: "add_edge",
               edge: { id: "e-1", source: "US1", target: "US2", edge_type: "is_before" } },
      fields: ["op", "id", "source", "target", "edge_type"] },
    { local: { op: "delete_edge",
               edge: { id: "e-1", source: "US1", target: "US2", edge_type: "is_before" } },
      fields: ["op", "id", "source", "target", "edge_type"] },
  ];
  for (const { local, fields } of cases) {
    const ops = H.opsForLocalChange(local);
    ok(ops.length >= 1, `${local.op}: produces at least one wire operation`);
    for (const body of ops) {
      const answer = W.read(JSON.parse(JSON.stringify(W.envelope("op", body))));
      ok(answer.ok, `${local.op}: its message reads back`);
      for (const field of fields) {
        if (body[field] === undefined) continue;
        eq(answer.message.payload[field], body[field],
           `${local.op}: \`${field}\` survives the envelope`);
      }
    }
  }
  // …and the collision itself, spelled out
  const [edgeOp] = H.opsForLocalChange({
    op: "add_edge",
    edge: { id: "e-9", source: "US1", target: "US2", edge_type: "is_before" } });
  const message = W.envelope("op", edgeOp);
  eq(message.source, "emstudio", "the envelope still says who sent it…");
  eq(message.payload.source, "US1", "…and the edge still starts where it starts");
}

// ── 6 · P4.5 · a remote op of ANY verb lands in the document, live ──────────
//
// What was missing until now: only `update_field` was applied in real time, so
// a node or an edge somebody else made appeared at the next re-sync. The CRDT
// could always do all five; this asserts the SEMANTICS the client now relies on
// — in particular that a removal is a TOMBSTONE, which is what lets a view hide
// it while the merge still knows the difference between "deleted" and "never
// seen".
{
  const M = await load("crdt.ts");
  const section = { graph_id: "scavo", nodes: [], edges: [] };
  const at = (n) => `2026-08-14T12:0${n}:00Z`;

  const added = M.applyOp(section, { op: "add_node", ts: at(0), author: "anna",
    node: { id: "US1", node_type: "US", name: "US1" } });
  ok(added.applied, "a remote add_node lands");
  M.applyOp(section, { op: "add_node", ts: at(1), author: "anna",
    node: { id: "US2", node_type: "US", name: "US2" } });
  const edged = M.applyOp(section, { op: "add_edge", ts: at(2), author: "anna",
    id: "e-1", source: "US1", target: "US2", edge_type: "is_before" });
  ok(edged.applied, "…and so does a remote add_edge");
  eq(M.liveEdges(section)[0].source, "US1",
     "…with its endpoints, which is the WIRE 2 regression restated");

  eq(M.liveNodes(section).length, 2, "two nodes are visible");
  const removed = M.applyOp(section, { op: "remove_node", ts: at(3),
                                       author: "bruno", id: "US2" });
  ok(removed.applied, "a remote remove_node lands");
  eq(M.liveNodes(section).length, 1, "…and the node leaves the VIEW");
  eq(section.nodes.length, 2,
     "…while staying in the document: a tombstone, not a missing key — the " +
     "merge has to keep telling 'deleted' from 'never seen'");
  ok(M.isRemoved(section.nodes.find((n) => n.id === "US2")),
     "…and it is marked as removed, with the remote clock");

  const unedged = M.applyOp(section, { op: "remove_edge", ts: at(4),
    author: "bruno", id: "e-1", source: "US1", target: "US2",
    edge_type: "is_before" });
  ok(unedged.applied, "a remote remove_edge lands");
  eq(M.liveEdges(section).length, 0, "…and the connector leaves the view");
  eq(section.edges.length, 1, "…while its tombstone stays in the document");

  const stale = M.applyOp(section, { op: "remove_node", ts: at(1),
                                     author: "bruno", id: "US2" });
  ok(!stale.applied, "an OLDER removal of the same node is not news");
}

console.log(`wire: ${checks} checks passed`);
