// IDENTITY · executable check of src/identity.ts.
//
//   node scripts/check-identity.mjs
//
// Same harness as check-tiling.mjs: the frontend has no test runner, so the
// module is bundled with the project's own esbuild and exercised in node, with
// a stub localStorage. Everything here is pure state and arithmetic — the
// network lives behind IdentityProvider, which is exactly why the FLOW can be
// checked with no infrastructure at all.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}identity.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const I = await import(
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
const reset = () => mem.clear();

// ── the iD: shape AND checksum ──────────────────────────────────────────────
//
// The checksum is what catches the mistake that actually happens: two digits
// transposed. That passes every shape test and points at a REAL OTHER PERSON.
{
  // real, published iDs (their check digits are the point of the exercise)
  for (const id of [
    "0000-0002-1825-0097",   // ORCID's own example
    "0000-0001-5109-3700",
    "0000-0002-1694-233X",   // check digit X
  ]) {
    ok(I.isValidOrcid(id), `${id} is a valid iD`);
  }

  // a transposition of a valid iD: right shape, wrong checksum
  ok(!I.isValidOrcid("0000-0002-1825-0079"), "a transposed pair is refused");
  ok(!I.isValidOrcid("0000-0002-1825-0098"), "one wrong digit is refused");
  ok(!I.isValidOrcid("0000-0002-1825-009"), "fifteen characters are refused");
  ok(!I.isValidOrcid("abcd-efgh-ijkl-mnop"), "letters are refused");
  ok(!I.isValidOrcid(""), "empty is refused");

  eq(I.orcidProblem(""), "empty", "empty reports as empty");
  eq(I.orcidProblem("0000-0002"), "shape", "a short iD reports as shape");
  eq(I.orcidProblem("0000-0002-1825-0079"), "checksum", "a bad check digit reports as checksum");
  eq(I.orcidProblem("0000-0002-1825-0097"), null, "a good iD has no problem");

  // what a human actually pastes
  eq(I.normalizeOrcid("https://orcid.org/0000-0002-1825-0097"), "0000-0002-1825-0097", "a pasted URL normalises");
  eq(I.normalizeOrcid("0000 0002 1825 0097"), "0000-0002-1825-0097", "spaces normalise");
  eq(I.normalizeOrcid("0000-0002-1694-233x"), "0000-0002-1694-233X", "a lower-case x normalises");
  ok(I.isValidOrcid("https://orcid.org/0000-0002-1825-0097"), "…and the pasted URL validates");
}

// ── declaring, offline ──────────────────────────────────────────────────────
{
  reset();
  eq(I.currentIdentity(), null, "no identity to begin with");

  const bad = I.declareIdentity("0000-0002-1825-0079");
  eq(bad, { ok: false, problem: "checksum" }, "a bad checksum never becomes an identity");
  eq(I.currentIdentity(), null, "…and nothing was stored");

  const res = I.declareIdentity("0000-0002-1825-0097", { name: "Josiah", surname: "Carberry" });
  ok(res.ok, "a valid iD is accepted");
  eq(res.identity.verified, false, "a declared identity is NOT verified");
  eq(I.currentIdentity().orcid, "0000-0002-1825-0097", "and becomes the current author");
  eq(I.currentIdentity().name, "Josiah", "the optional name is kept");
}

// ── the shared field laptop: adding someone must not erase anyone ───────────
{
  reset();
  I.declareIdentity("0000-0002-1825-0097", { name: "Josiah" });
  I.declareIdentity("0000-0001-5109-3700", { name: "Second" });

  eq(I.currentIdentity().orcid, "0000-0001-5109-3700", "the newcomer is now the author");
  eq(I.knownIdentities().length, 2, "…and the first person is still known");

  I.useIdentity("0000-0002-1825-0097");
  eq(I.currentIdentity().name, "Josiah", "switching back finds the first identity intact");

  eq(I.useIdentity("0000-0002-1694-233X"), null, "switching to an unknown iD does nothing");
  eq(I.currentIdentity().orcid, "0000-0002-1825-0097", "…and leaves the current one alone");

  I.forgetIdentity("0000-0002-1825-0097");
  eq(I.knownIdentities().length, 1, "forgetting removes one");
  eq(I.currentIdentity().orcid, "0000-0001-5109-3700", "and the pointer moves to who is left");
}

// ── the gate: data prep is free, publishing is not ──────────────────────────
{
  reset();
  eq(I.publishGate(), { allowed: false, reason: "no-identity" }, "nobody declared → cannot publish");

  I.declareIdentity("0000-0002-1825-0097");
  eq(I.publishGate(), { allowed: false, reason: "not-verified", orcid: "0000-0002-1825-0097" },
     "declared but unverified → cannot publish, and the message can name the iD");

  // storage tampering must not open the gate
  const raw = JSON.parse(mem.get("emstudio.identities"));
  raw.known[0].verified = "true";                       // a string, not a boolean
  mem.set("emstudio.identities", JSON.stringify(raw));
  eq(I.publishGate().allowed, false, 'a "true" STRING in storage does not verify an identity');
  eq(I.currentIdentity().verified, false, "…and it reads back as the boolean false");
}

// ── verification through the seam ───────────────────────────────────────────
{
  reset();
  I.declareIdentity("0000-0002-1825-0097");

  // the iD matches → verified, and publishing unlocks
  const good = await I.verifyCurrentIdentity(
    new I.MockIdentityProvider({ orcid: "0000-0002-1825-0097", name: "Josiah Carberry" }));
  eq(good.status, "verified", "a matching iD verifies");
  eq(I.currentIdentity().verified, true, "the stored identity is now verified");
  ok(typeof I.currentIdentity().verifiedAt === "string", "…and remembers when");
  eq(I.publishGate(), { allowed: true }, "publishing is unlocked");

  // a DIFFERENT iD → never promoted silently
  reset();
  I.declareIdentity("0000-0002-1825-0097");
  const other = await I.verifyCurrentIdentity(
    new I.MockIdentityProvider({ orcid: "0000-0001-5109-3700" }));
  eq(other.status, "mismatch", "a different iD reports a mismatch");
  eq(other.declared, "0000-0002-1825-0097", "…naming what was declared");
  eq(other.verified, "0000-0001-5109-3700", "…and what was verified");
  eq(I.currentIdentity().verified, false, "the declared identity is NOT promoted");
  eq(I.publishGate().allowed, false, "and publishing stays closed until a human chooses");

  // choosing, explicitly
  I.adoptVerifiedIdentity("0000-0001-5109-3700", "Second");
  eq(I.currentIdentity().orcid, "0000-0001-5109-3700", "adopting switches the identity");
  eq(I.currentIdentity().verified, true, "…verified");
  eq(I.knownIdentities().length, 2, "…and the old declaration is still on this machine");

  // the provider failing is not a verification
  reset();
  I.declareIdentity("0000-0002-1825-0097");
  const failed = await I.verifyCurrentIdentity(
    new I.MockIdentityProvider(new Error("no network")));
  eq(failed.status, "failed", "a provider error reports as failed");
  eq(I.currentIdentity().verified, false, "…and verifies nothing");

  // no identity at all
  reset();
  const none = await I.verifyCurrentIdentity(
    new I.MockIdentityProvider({ orcid: "0000-0002-1825-0097" }));
  eq(none.status, "no-identity", "verifying with nobody declared reports it");
}

// ── the seam hands back no token, by construction ───────────────────────────
{
  const result = await new I.MockIdentityProvider({ orcid: "0000-0002-1825-0097" }).verify();
  eq(Object.keys(result).sort(), ["orcid"], "a verification result carries the CLAIM, never a token");
}

console.log(`identity: ${checks} checks passed`);
