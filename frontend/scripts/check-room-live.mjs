// ROOM · EMStudio as a real client of a real em-server room, headless.
//
//   node scripts/check-room-live.mjs
//
// Walkthrough Tappa 4 is a manual test: two EMStudios, two Macs, one room. This
// is the part of it a machine can hold — and it holds the part that actually
// breaks. Two clients join, one edits, the other must see it; the roster must
// say two. Everything else in Tappa 4 (does the matrix redraw, does the other
// Mac reach this one over Bonjour) is a human's job.
//
// **It drives the REAL client.** Not a hand-written WebSocket that speaks what
// the protocol is supposed to be: `SyncClient` from `src/sync.ts`, which is what
// the application constructs, over `roomUrl` from `src/hub.ts` and the envelope
// from `src/wire.ts`. A proof written against a reimplementation would keep
// passing after the client stopped agreeing with it — which is the one failure a
// protocol test exists to catch.
//
// What it needs, and refuses to invent:
//
// * a stack that is up, with the room seeded — `dev-stack/seed_rooms.py`;
// * a token — `EM_TOKEN`, or `dev-stack/token.sh` beside this checkout;
// * the internal CA, when the base is the https one: Node reads
//   `NODE_EXTRA_CA_CERTS` at startup, so this re-execs itself once with it set
//   rather than telling you to remember an environment variable.
//
// Not a smoke: nothing is left behind but one renamed unit in a demo room, and
// the rename is the proof.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import * as esbuild from "esbuild";

const BASE = process.env.EM_HUB_BASE ?? "https://em.localhost:8443/em";
const ROOM = process.env.EM_ROOM ?? "basilica-demo";
const CA = process.env.EM_CA ?? `${homedir()}/caddy-em-root.crt`;
const HERE = new URL(".", import.meta.url).pathname;
const SRC = new URL("../src/", import.meta.url).pathname;

// ── the internal CA, once ────────────────────────────────────────────────────
// Node builds its TLS trust store at startup, so setting this from inside the
// process is too late — hence the re-exec. Only for an https base: the direct
// port needs nothing, and a missing CA there is not a reason to refuse.
if (BASE.startsWith("https://") && !process.env.NODE_EXTRA_CA_CERTS) {
  if (!existsSync(CA)) {
    console.log(`room: no CA at ${CA} — the https base cannot be verified.`);
    console.log("      Take one with `docker cp em-dev-caddy:"
                + "/data/caddy/pki/authorities/local/root.crt ~/caddy-em-root.crt`,");
    console.log("      or run against the direct port:");
    console.log("      EM_HUB_BASE=http://localhost:8000 node "
                + "scripts/check-room-live.mjs");
    process.exit(0);
  }
  const { spawnSync } = await import("node:child_process");
  // Its OWN path, not `argv[1]`: re-running the invocation verbatim re-resolves
  // a relative path against the cwd, and the second process then looks for this
  // file somewhere else entirely.
  const self = new URL(import.meta.url).pathname;
  const again = spawnSync(process.execPath, [self], {
    stdio: "inherit",
    env: { ...process.env, NODE_EXTRA_CA_CERTS: CA },
  });
  process.exit(again.status ?? 1);
}

// ── the token ────────────────────────────────────────────────────────────────
function token() {
  if (process.env.EM_TOKEN) return process.env.EM_TOKEN;
  const helper = `${HERE}../../../em-server/dev-stack/token.sh`;
  if (!existsSync(helper)) return null;
  try {
    return execFileSync(helper, { encoding: "utf-8" }).trim() || null;
  } catch {
    return null;
  }
}

const TOKEN = token();
if (!TOKEN) {
  console.log("room: no token (EM_TOKEN unset and dev-stack/token.sh did not "
              + "answer) — is the stack up? checks SKIPPED");
  process.exit(0);
}

// ── the real client, loaded the way check-narrative loads modules ────────────
globalThis.window = globalThis;   // sync.ts schedules its reconnect on `window`
const bundle = await esbuild.build({
  entryPoints: [`${SRC}sync.ts`], bundle: true, format: "esm", write: false,
});
const S = await import("data:text/javascript;base64,"
  + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const H = await import("data:text/javascript;base64," + Buffer.from(
  (await esbuild.build({ entryPoints: [`${SRC}hub.ts`], bundle: true,
                         format: "esm", write: false })).outputFiles[0].text,
).toString("base64"));

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

/** Wait for something to become true, or say what never happened. */
async function until(what, predicate, ms = 8000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** One joined client, with everything it heard. */
function join(label) {
  const heard = { snapshot: null, presence: [], ops: [], results: [],
                  status: [], mismatch: [] };
  const client = new S.SyncClient();
  client.connectHub({ url: BASE, room: ROOM, token: TOKEN }, {
    onSelect: () => {},
    onOp: (op) => heard.ops.push(op),
    onSnapshot: (doc) => { heard.snapshot = doc; },
    // main.ts folds the FRAME, not the payload (`reducePresence` switches on
    // `type`): the same adaptation here, so what is measured is what the app does
    onPresence: (message) => heard.presence.push({ type: "presence", ...message }),
    onOpResult: (r) => heard.results.push(r),
    onWireMismatch: (why) => heard.mismatch.push(why),
    onStatus: (state) => heard.status.push(state),
  });
  return { label, client, heard };
}

// ── the URL the client builds, before anything is opened ─────────────────────
const url = H.roomUrl(BASE, ROOM, { token: "T0KEN" });
ok(url.startsWith(BASE.startsWith("https") ? "wss://" : "ws://"),
   `room · the base becomes a WebSocket scheme (${url.split("/")[0]}//)`);
ok(url.includes(`/v1/rooms/${ROOM}/ws`), "room · …with the room's own endpoint");
ok(url.includes("token=T0KEN"),
   "room · …and the token in the QUERY, where a browser can put it");

console.log(`room  : ${ROOM}\nbase  : ${BASE}\n`);

const A = join("A");
const B = join("B");

try {
  // ── the join: three frames, and the seeded graph ───────────────────────────
  await until("A's snapshot", () => A.heard.snapshot);
  await until("B's snapshot", () => B.heard.snapshot);
  eq(A.heard.mismatch, [], "room · A read every frame (no wire mismatch)");

  const section = A.heard.snapshot.graphs?.[ROOM]
    ?? Object.values(A.heard.snapshot.graphs ?? {})[0];
  ok(section, "room · the snapshot is a CONTAINER, and the room is a section of it");
  const units = (section.nodes ?? []).filter((n) => n.node_type === "US");
  ok(units.length >= 2,
     `room · the seeded stratigraphy arrived (${units.length} units)`);

  // ── presence: two, and each knows which one is itself ──────────────────────
  const roster = await until("a roster of two", () => {
    const folded = A.heard.presence.reduce(
      (state, frame) => H.reducePresence(state, frame), H.emptyPresence());
    return folded.members.length === 2 ? folded : null;
  });
  eq(roster.members.length, 2, "room · presence says TWO people are here");
  ok(roster.members.every((m) => m.author),
     "room · …and each of them is somebody: the author is the token's");

  // ── the edit: A renames a unit, B must see it ─────────────────────────────
  const target = units[0].id;
  // Named so that somebody who opens the room later can tell what did it: the
  // rename is left behind (it is the proof the room KEPT it), so it should read
  // as a measurement rather than as somebody's abandoned edit.
  // Built from the node's ID and not from its CURRENT name: appending to what
  // is already there compounds on every run, and the room ends up holding a
  // sentence made of three of these. Measured, on the second run.
  const name = `${target} · rinominata dal check ${new Date().toISOString()}`;
  const [op] = H.opsForLocalChange({
    op: "update_node", node_id: target,
    fields: [{ field: "name", value: name, ts: new Date().toISOString() }],
  });
  ok(op?.op === "update_field",
     "room · the app's own translation makes an update_field op");
  A.client.sendOp(op);

  const arrived = await until("B to see A's edit",
                              () => B.heard.ops.find((o) => o.node_id === target));
  eq(arrived.op, "update_field", "room · B received the operation A sent");
  eq(arrived.field, "name", "room · …the field A actually changed");
  eq(arrived.value, name, "room · …carrying the value, not a notification");
  ok(arrived.author,
     `room · …stamped with the sender's identity by the relay (${arrived.author})`);
  ok(arrived.ts, "room · …and dated, which is what the merge decides on");

  const applied = await until("A's own op_result",
                              () => A.heard.results.find((r) => r.applied));
  ok(applied.applied === true, "room · the hub told A it was applied");
  eq(B.heard.results, [], "room · …and told B nothing: an op_result is the "
     + "answer to YOUR op, not a broadcast");

  // ── and it is the ROOM's now, not one client's ─────────────────────────────
  // A third join sees the edit without anybody replaying it: the proof that the
  // room holds state rather than relaying keystrokes.
  const C = join("C");
  await until("C's snapshot", () => C.heard.snapshot);
  const seenByC = Object.values(C.heard.snapshot.graphs ?? {})[0]
    ?.nodes?.find((n) => n.id === target);
  eq(seenByC?.name, name,
     "room · a client that joins AFTERWARDS gets the edit in its snapshot");
  C.client.disconnect();
} finally {
  A.client.disconnect();
  B.client.disconnect();
}

console.log(`room: ${checks} checks passed`);
process.exit(0);
