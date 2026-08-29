// HANDOFF · the deep-link, read the way EMStudio reads it.
//
// The link is the ecosystem's contract (`stratigraph-server/app/handoff.py`) and
// its ONE security property is that it carries a place and never a permission.
// So the check is not only "do we parse it" but "would we ACCEPT a token in
// one" — a reader that tolerates a credential is a reader whose next caller
// sends one.
//
// The grammar is implemented twice on purpose (Python on the server, TypeScript
// here): a client that had to reach a server to find out WHICH server to reach
// could not start. Two implementations of one grammar drift unless something
// measures them against the same strings — this file holds those strings, and
// `stratigraph-server/tests/test_handoff.py` holds the same ones.

import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");

let checks = 0;
const failures = [];
function ok(condition, what, detail = "") {
  checks += 1;
  if (condition) return true;
  failures.push(what + (detail ? ` — ${detail}` : ""));
  return false;
}

// esbuild, like the wire check next door: the module is real TypeScript and a
// hand-rolled type-stripper is a second parser to get wrong.
const load = async (entry) => {
  const built = await esbuild.build({ entryPoints: [join(SRC, entry)],
                                      bundle: true, format: "esm", write: false });
  return import("data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64"));
};

const H = await load("handoff.ts");

console.log("\n1 · the scheme is the ecosystem's");
ok(H.SCHEME === "stratigraph", "the scheme is `stratigraph`", H.SCHEME);
ok(H.ACTION === "open", "the action is `open`", H.ACTION);

console.log("\n2 · both forms read back to the same place");
const scheme = "stratigraph://open?server=https%3A%2F%2Fem.example.org&room=saggio-b";
const web = "https://em.example.org/open?server=https%3A%2F%2Fem.example.org&room=saggio-b";
for (const [name, link] of [["scheme", scheme], ["web", web]]) {
  const got = H.parseHandoff(link);
  ok(got.server === "https://em.example.org" && got.room === "saggio-b",
     `${name} form → {server, room}`, JSON.stringify(got));
}
ok(H.parseHandoff("https://em.example.org/open?room=r").server
   === "https://em.example.org",
   "the web form may leave the server implicit: the page is ON it");

console.log("\n3 · a link that carries a credential is REFUSED");
for (const key of ["token", "access_token", "id_token", "password", "secret",
                   "code", "authorization", "bearer", "api_key"]) {
  let refused = false;
  try {
    H.parseHandoff(`stratigraph://open?server=https%3A%2F%2Fx&room=r&${key}=v`);
  } catch (error) {
    refused = String(error.message).includes(key);
  }
  ok(refused, `a link carrying \`${key}\` is refused by name`);
}

console.log("\n4 · what is not a handoff is said");
for (const [bad, fragment] of [
  ["", "empty"],
  ["stratigraph://join?room=r", "unknown action"],
  ["mailto:someone@example.org", "not a handoff link"],
  ["https://em.example.org/rooms?room=r", "not a handoff link"],
  ["stratigraph://open?server=https%3A%2F%2Fx", "names no room"],
]) {
  let said = "";
  try { H.parseHandoff(bad); } catch (error) { said = String(error.message); }
  ok(said.includes(fragment), `"${bad || "(empty)"}" → “${fragment}”`, said);
}

console.log("\n5 · round trip");
const built = H.buildHandoff({ server: "https://em.example.org/", room: "a b/c" });
ok(built.startsWith("stratigraph://open?"), "built link uses the scheme", built);
const back = H.parseHandoff(built);
ok(back.server === "https://em.example.org" && back.room === "a b/c",
   "a built link reads back identically", JSON.stringify(back));
ok(!/token|secret|password/i.test(built), "nothing we build carries a credential");

console.log("\n6 · the URL form, and the one it must NOT be mistaken for");
ok(H.handoffFromLocation("?server=https%3A%2F%2Fx&room=r")?.room === "r",
   "handoff parameters on the page's own URL are read");
ok(H.handoffFromLocation("?join=abc&room=r") === null,
   "an INVITE link (`?join=`) is not a handoff: it carries a role, and joining "
   + "it is a different act");
ok(H.handoffFromLocation("?room=r") === null,
   "a room with no server is not a handoff");

console.log("\n7 · the app signs in ITSELF — the link cannot");
const main = readFileSync(join(SRC, "main.ts"), "utf8");
ok(/function\s+joinFromHandoff/.test(main),
   "the join path exists and is fed by the link");
ok(/connectToHub\(handoff\.server, handoff\.room, token\)/.test(main),
   "HubOptions are filled from the LINK (server, room) plus the app's own token");
ok(/authorizeUrl\(handoffAuth\)/.test(main),
   "…and the token comes from an OIDC round trip, not from the link");
const oidc = readFileSync(join(SRC, "oidc.ts"), "utf8");
ok(/code_challenge_method"?,\s*"S256"/.test(oidc),
   "PKCE S256 — `plain` would make the interception it prevents possible again");
ok(!/client_secret/.test(oidc.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")),
   "no client secret: a public client that sent one would be publishing it");
for (const sink of ["localStorage", "document.cookie", "indexedDB"]) {
  ok(!new RegExp(`${sink}\\.setItem|${sink}\\s*=`).test(oidc),
     `the token never reaches ${sink}`);
}

console.log(`\nhandoff: ${checks} checks passed`);
if (failures.length) {
  console.error(`\nhandoff: ${failures.length} FAILED`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
