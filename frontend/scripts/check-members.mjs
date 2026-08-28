// MEMBERS · executable check of src/members.ts — the owner's face on StratiGraph Server's
// user management.
//
//   node scripts/check-members.mjs
//
// The policy is StratiGraph Server's (`app/access.py`: four ordered roles, the owner
// untouchable by an admin) and the node's tests hold it. What is checked HERE is
// what a client can get wrong on its own, and each case is a way the panel could
// lie to somebody:
//
//   * a VIEWER shown controls it does not have would send an action the server
//     refuses — so a viewer sees the roster and nothing to click, and the refusal
//     the server gives for the roster itself is SHOWN rather than swallowed;
//   * an OWNER with a role dropdown on their own row invites a demotion the
//     server will refuse: the row says "transfer only" instead;
//   * an invite token rendered twice is a token somebody thinks they can come
//     back for — the server keeps a digest, so it is shown once, with a link;
//   * and every action is one call to the room's OWN endpoint, with the verb the
//     server declares (a role is a PUT, a revocation a DELETE): a panel that
//     invented a verb would fail at the first click.
//
// `fetch` is stubbed, so this runs with no node and no network: what is measured
// is the panel's behaviour, not StratiGraph Server's — the server has its own suite and
// four live smokes.
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { parseHTML } from "linkedom";

const SRC = new URL("../src/", import.meta.url).pathname;

// The DOM first: `members.ts` builds elements at import-independent call time,
// but `inviteUrl` reads `window.location`, so both have to exist before the
// module is evaluated.
const { window, document } = parseHTML(
  "<html><body><div id='panel'></div></body></html>");
globalThis.window = window;
globalThis.document = document;
// `navigator` is a getter on modern Node's globalThis: defining it is the only
// way in, and the panel only ever touches `navigator.clipboard?.writeText`.
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { clipboard: { writeText() {} } },
});
setLocation("https://emstudio.example/app/?x=1");

/** The panel reads `window.location` for the invite URL, so the test drives it
 *  the way a browser would — by navigating, not by patching a string. */
function setLocation(href) {
  window.location = new URL(href);
  Object.defineProperty(globalThis, "location", {
    configurable: true, value: window.location,
  });
}

// ── the stub: every call recorded, every answer scripted ────────────────────
const calls = [];
let script = {};
globalThis.fetch = async (url, options = {}) => {
  const method = options.method || "GET";
  const path = String(url).replace(/^https?:\/\/[^/]+/, "");
  calls.push({ method, path, body: options.body ? JSON.parse(options.body) : null,
               auth: (options.headers || {}).Authorization });
  const key = `${method} ${path}`;
  const answer = script[key] ?? script[`${method} *`];
  if (!answer) return reply(404, { detail: `no stub for ${key}` });
  return typeof answer === "function" ? answer() : answer;
};

function reply(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(payload); },
  };
}

const bundle = await esbuild.build({
  entryPoints: [`${SRC}members.ts`], bundle: true, format: "esm", write: false,
  // `i18n.ts` reads a stored locale through `localStorage`; the DOM linkedom
  // builds has none, so the shim is the smallest thing that lets the real module
  // load rather than a mock of it.
  external: [],
});
globalThis.localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {},
};
const M = await import("data:text/javascript;base64,"
  + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const ACCESS = { base: "https://node.example/em", room: "cantiere", token: "T" };
const ANNA = "0000-0002-1825-0097";
const BRUNO = "0000-0001-5109-3700";

const roster = (yourRole, members = [{ orcid: BRUNO, role: "editor" }]) => ({
  room: "cantiere", owner: ANNA, members, your_role: yourRole,
});

function panel() {
  const root = document.getElementById("panel");
  root.innerHTML = "";
  return root;
}

const notes = [];
const hooks = (role) => ({
  access: ACCESS, role,
  note: (message, kind) => notes.push({ message, kind }),
});

/** The panel renders asynchronously (it fetches first); wait for the DOM to
 *  settle rather than guessing a timeout. */
async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

// ── 1 · the API surface is the server's, verb for verb ──────────────────────
{
  calls.length = 0;
  script = {
    "GET /em/v1/rooms/cantiere/members": reply(200, roster("owner")),
    "PUT /em/v1/rooms/cantiere/members/0000-0001-5109-3700":
      reply(200, roster("owner")),
    "DELETE /em/v1/rooms/cantiere/members/0000-0001-5109-3700":
      reply(200, roster("owner", [])),
    "GET /em/v1/rooms/cantiere/invites": reply(200, []),
    "POST /em/v1/rooms/cantiere/invites":
      reply(201, { token_id: "abc", role: "editor", state: "live", uses: 0,
                   max_uses: null, accepted_by: [], expires_at: null,
                   token: "abc.secret" }),
    "DELETE /em/v1/rooms/cantiere/invites/abc":
      reply(200, { token_id: "abc", role: "editor", state: "revoked", uses: 0,
                   max_uses: null, accepted_by: [], expires_at: null }),
  };

  await M.fetchRoster(ACCESS);
  eq(calls.at(-1), { method: "GET", path: "/em/v1/rooms/cantiere/members",
                     body: null, auth: "Bearer T" },
     "api · the roster is a GET on the room's own endpoint, with the token");

  await M.setRole(ACCESS, BRUNO, "viewer");
  eq(calls.at(-1).method, "PUT", "api · a role is a PUT (state it, idempotently)");
  eq(calls.at(-1).body, { role: "viewer" }, "api · …with the role in the body");

  await M.revokeMember(ACCESS, BRUNO);
  eq(calls.at(-1).method, "DELETE", "api · a revocation is a DELETE");

  const minted = await M.mintInvite(ACCESS, "editor");
  eq(calls.at(-1).method, "POST", "api · minting a link is a POST");
  eq(minted.token, "abc.secret", "api · …and the token comes back once");

  await M.revokeInvite(ACCESS, "abc");
  eq(calls.at(-1).path, "/em/v1/rooms/cantiere/invites/abc",
     "api · revoking a link names the token id, never the secret");
}

// ── 2 · the refusal is the server's sentence ───────────────────────────────
{
  script = { "GET /em/v1/rooms/cantiere/members":
    reply(403, { detail: "reading the member list needs admin or owner" }) };
  let message = "";
  try {
    await M.fetchRoster(ACCESS);
  } catch (error) {
    message = error.message;
  }
  eq(message, "reading the member list needs admin or owner",
     "refusal · the server's words, not a status code");

  const root = panel();
  M.renderMembersPanel(root, hooks("viewer"));
  await settle();
  ok(root.textContent.includes("needs admin or owner"),
     "refusal · …and the panel SHOWS them instead of an empty box");
  eq(root.querySelectorAll("select").length, 0,
     "refusal · nothing to click when there is nothing to act on");
}

// ── 3 · a viewer sees the roster and no controls ───────────────────────────
{
  script = {
    "GET /em/v1/rooms/cantiere/members": reply(200, roster("viewer")),
    "GET /em/v1/rooms/cantiere/invites": reply(200, []),
  };
  const root = panel();
  M.renderMembersPanel(root, hooks("viewer"));
  await settle();
  ok(root.textContent.includes(BRUNO), "viewer · the roster is visible");
  eq(root.querySelectorAll("select").length, 0,
     "viewer · no role dropdown anywhere");
  eq(root.querySelectorAll("button").length, 0,
     "viewer · and no buttons: not even a revoke it could not do");
  ok(/admin or owner/.test(root.textContent),
     "viewer · …and it SAYS why, rather than looking broken");
  eq(M.canManage("viewer"), false, "viewer · canManage says so too");
  eq(M.canManage("editor"), false, "editor · an editor is not a manager either");
}

// ── 4 · an admin acts, and the owner's row is not a dropdown ───────────────
{
  script = {
    "GET /em/v1/rooms/cantiere/members": reply(200, roster("admin")),
    "GET /em/v1/rooms/cantiere/invites": reply(200, []),
    "PUT /em/v1/rooms/cantiere/members/0000-0001-5109-3700":
      reply(200, roster("admin", [{ orcid: BRUNO, role: "viewer" }])),
  };
  const root = panel();
  M.renderMembersPanel(root, hooks("admin"));
  await settle();
  const rows = [...root.querySelectorAll("tr")];
  const ownerRow = rows.find((r) => r.textContent.includes(ANNA));
  const otherRow = rows.find((r) => r.textContent.includes(BRUNO));
  ok(ownerRow && otherRow, "admin · both rows are drawn");
  eq(ownerRow.querySelectorAll("select").length, 0,
     "admin · the OWNER's row has no role dropdown (a transfer is not a list "
     + "action, and the server would refuse it)");
  ok(/transfer only/i.test(ownerRow.textContent),
     "admin · …and it says what the owner's row is instead");
  eq(otherRow.querySelectorAll("select").length, 1,
     "admin · the other row does have one");
  ok([...otherRow.querySelectorAll("option")].map((o) => o.value)
     .every((v) => v !== "owner"),
     "admin · and `owner` is not among the choices");

  calls.length = 0;
  const select = otherRow.querySelector("select");
  // linkedom's <select> has a getter-only `value`; a browser sets it by marking
  // the option selected, which is what the panel's `select.value` then reads.
  for (const option of select.querySelectorAll("option")) {
    if (option.value === "viewer") option.setAttribute("selected", "");
    else option.removeAttribute("selected");
  }
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
  await settle();
  const put = calls.find((c) => c.method === "PUT");
  ok(put && put.body.role === "viewer",
     "admin · changing the dropdown sends exactly one PUT with the new role");
}

// ── 5 · the invite link: once, and as a URL somebody can follow ────────────
{
  script = {
    "GET /em/v1/rooms/cantiere/members": reply(200, roster("owner")),
    "GET /em/v1/rooms/cantiere/invites": reply(200, []),
    "POST /em/v1/rooms/cantiere/invites":
      reply(201, { token_id: "abc", role: "editor", state: "live", uses: 0,
                   max_uses: null, accepted_by: [], expires_at: null,
                   token: "abc.secret" }),
  };
  notes.length = 0;
  const root = panel();
  M.renderMembersPanel(root, hooks("owner"));
  await settle();
  const mint = [...root.querySelectorAll("button")]
    .find((b) => /new link|nuovo link/i.test(b.textContent));
  ok(mint, "invite · the owner has a way to mint one");
  mint.dispatchEvent(new window.Event("click", { bubbles: true }));
  await settle();
  const shown = root.querySelector(".mem-token code")?.textContent ?? "";
  ok(shown.includes("join=abc.secret"),
     `invite · what is shown is a LINK carrying the token (${shown.slice(0, 60)})`);
  ok(shown.startsWith("https://emstudio.example/app/"),
     "invite · …pointing at this build of EMStudio, so following it lands in the app");
  // The CLAIM, not a word I hoped was in it: the sentence has to tell somebody
  // that this is their only chance to copy it. (First run matched on "once",
  // which is in the code and not in the string — the check was testing my
  // memory of the message.)
  ok(notes.some((n) => /shown again|digest|rimostrarlo|impronta/i.test(n.message)),
     `invite · and the panel says it cannot be shown again `
     + `(${notes.map((n) => n.message).join(" | ").slice(0, 90)})`);

  // the URL helper, and its inverse
  const url = M.inviteUrl("tok.secret", "cantiere");
  ok(url.includes("join=tok.secret") && url.includes("room=cantiere"),
     "invite · the link carries the token and the room in the QUERY (a fragment "
     + "would not survive an identity provider's redirect)");
  setLocation(url);
  eq(M.pendingJoin(), { token: "tok.secret", room: "cantiere" },
     "invite · …and the app reads them back when the link opens it");
  setLocation("https://emstudio.example/app/");
  eq(M.pendingJoin(), null, "invite · no token in the URL: nothing pending");
}

// ── 6 · joining is a POST /v1/join, and needs the identity ─────────────────
{
  calls.length = 0;
  script = { "POST /em/v1/join": reply(200, { room_id: "cantiere",
                                              title: "Cantiere", role: "editor",
                                              already_had: false }) };
  const joined = await M.acceptInvite("https://node.example/em", "tok.secret", "T");
  eq(calls.at(-1).path, "/em/v1/join", "join · one call, to the node's join");
  eq(calls.at(-1).auth, "Bearer T",
     "join · with the identity attached — the link is not a credential");
  eq(joined.role, "editor", "join · and the role comes back from the server");

  script = { "POST /em/v1/join":
    reply(401, { detail: "an invitation opens the door; you still have to say "
                         + "who you are" }) };
  let refusal = "";
  try {
    await M.acceptInvite("https://node.example/em", "tok.secret", null);
  } catch (error) {
    refusal = error.message;
  }
  ok(/who you are/.test(refusal),
     "join · without an identity the server's 401 sentence is what surfaces");
}

console.log(`members: ${checks} checks passed`);
