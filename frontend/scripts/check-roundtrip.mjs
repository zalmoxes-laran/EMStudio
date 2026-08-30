// ROUND-TRIP · "open this room in the other editor", measured.
//
// The claim being tested is not "we can build a URL" — it is that we DO NOT.
// The link comes from the server's handoff contract, asked for the room this
// session is already in, and this client only picks which door of it to use.
// A fifth implementation of the grammar would be the failure; these checks are
// what stop one appearing.
//
// Two properties matter and both are here: the room is the SAME one, and the
// link carries NO credential.

import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const built = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true,
                                      format: "esm", write: false });
  return import("data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64"));
};

const R = await load("roundtrip.ts");
let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks += 1; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks += 1;
};

// The answer a real server gives (`GET /v1/rooms/{id}/open`), shape verified
// against `stratigraph-server/tests/test_handoff.py`.
const ROOM = "scavo-cs03";
const SERVER = "https://em.localhost:8443/em";
const HANDOFF = {
  room: ROOM, server: SERVER, carries_token: false,
  scheme: `stratigraph://open?server=${encodeURIComponent(SERVER)}&room=${ROOM}`,
  web: `${SERVER}/open?server=${encodeURIComponent(SERVER)}&room=${ROOM}`,
  tools: {
    emstudio: { label: "EMStudio",
      scheme: `stratigraph://open?server=${encodeURIComponent(SERVER)}&room=${ROOM}`,
      web: `${SERVER}/open?server=${encodeURIComponent(SERVER)}&room=${ROOM}`,
      browser: `http://localhost:5177/?server=${encodeURIComponent(SERVER)}&room=${ROOM}` },
    blender: { label: "EMtools (Blender)", scheme: `stratigraph://open?room=${ROOM}` },
    chatbot: { label: "Field assistant", scheme: `stratigraph://open?room=${ROOM}` },
  },
};

console.log("\n1 · the other surface is the one this build is not");
eq(R.otherSurface("web"), "desktop", "from the web, the other editor is the desktop");
eq(R.otherSurface("desktop"), "web", "…and from the desktop, the web");

console.log("\n2 · each direction picks the door that can actually work");
{
  const toDesktop = R.doorTo(HANDOFF, "desktop");
  eq(toDesktop.kind, "scheme", "web → desktop is the registered scheme");
  ok(toDesktop.url.startsWith("stratigraph://open?"), "…and it is the ecosystem's scheme");
  ok(toDesktop.mayNotOpen === true,
     "…flagged, because nothing can tell in advance whether this machine answers it");

  const toWeb = R.doorTo(HANDOFF, "web");
  eq(toWeb.kind, "browser", "desktop → web is the tool's OWN web build");
  ok(toWeb.url.startsWith("http://localhost:5177/?"), "…at the address the node named");
  ok(toWeb.mayNotOpen === false, "…and a tab always opens");
}

console.log("\n3 · the SAME room, both ways — that is the whole point");
for (const surface of ["desktop", "web"]) {
  const door = R.doorTo(HANDOFF, surface);
  const query = new URLSearchParams(door.url.slice(door.url.indexOf("?") + 1));
  eq(query.get("room"), ROOM, `${surface}: the room travels unchanged`);
  eq(query.get("server"), SERVER, `${surface}: and so does the server`);
}

console.log("\n4 · no credential, in any door");
for (const [name, door] of [["desktop", R.doorTo(HANDOFF, "desktop")],
                            ["web", R.doorTo(HANDOFF, "web")],
                            ["fallback page", R.fallbackPage(HANDOFF)]]) {
  const query = door.url.slice(door.url.indexOf("?") + 1).toLowerCase();
  for (const key of ["token", "access_token", "id_token", "password", "secret",
                     "code", "authorization", "bearer", "api_key"]) {
    ok(!new RegExp(`(^|&)${key}=`).test(query), `${name}: carries no \`${key}\``);
  }
}

console.log("\n5 · a server that ever offered one is REFUSED, not forwarded");
{
  const poisoned = JSON.parse(JSON.stringify(HANDOFF));
  poisoned.tools.emstudio.browser += "&token=abc";
  let refused = "";
  try { R.assertNoCredential(poisoned); } catch (e) { refused = String(e.message); }
  ok(refused.includes("token") && refused.includes("never a permission"),
     "a credential in the answer stops this client cold");
}

console.log("\n6 · a deployment with no web build offers no door, rather than a dead one");
{
  const noWeb = JSON.parse(JSON.stringify(HANDOFF));
  delete noWeb.tools.emstudio.browser;
  eq(R.doorTo(noWeb, "web"), null, "desktop → web is absent, not broken");
  ok(R.doorTo(noWeb, "desktop") !== null, "…and the other direction still works");
}

console.log("\n7 · the fallback is the server's own page, not a second invention");
{
  const page = R.fallbackPage(HANDOFF);
  eq(page.kind, "page", "the fallback is the /open page");
  ok(page.url.includes("/open?"), "…the one that already says what to install");
}

console.log("\n8 · the link is ASKED FOR, never assembled here");
{
  const source = readFileSync(`${SRC}roundtrip.ts`, "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
  ok(!code.includes("stratigraph://"),
     "roundtrip.ts never writes the scheme: it reads it out of the answer");
  ok(!/\?server=/.test(code), "…nor assembles the query");
  const main = readFileSync(`${SRC}main.ts`, "utf8");
  ok(/roomHandoff\(base, room, hubToken\)/.test(main),
     "main asks the server for the CURRENT room's handoff");
  ok(/const room = sync\.room \|\| settings\.sync\.hubRoom/.test(main),
     "…and the room is the session's, not something typed");
}

console.log("\n9 · the request carries the session token; the ANSWER must not");
{
  let seen = null;
  const fakeFetch = async (url, opts) => {
    seen = { url, auth: opts.headers.Authorization };
    return new Response(JSON.stringify(HANDOFF), { status: 200 });
  };
  const got = await R.roomHandoff(SERVER, ROOM, "tok-123", fakeFetch);
  eq(seen.url, `${SERVER}/v1/rooms/${ROOM}/open`, "it asks the handoff endpoint");
  eq(seen.auth, "Bearer tok-123",
     "with the session's token: a handoff for a room you may not enter is refused");
  eq(got.carries_token, false, "…and the answer says it carries none");
}

console.log("\n10 · without a room there is nothing to open");
{
  let said = "";
  try { await R.roomHandoff(SERVER, "", null); } catch (e) { said = e.message; }
  ok(said.includes("not in a room"), "said, rather than a request to nowhere");
}

console.log(`\nroundtrip: ${checks} checks passed`);
