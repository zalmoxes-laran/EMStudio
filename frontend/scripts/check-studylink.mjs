// STUDY LINK · what «open this study in EMStudio» resolves to, and the two
// silences that made a failure look like a success.
//
//   node scripts/check-studylink.mjs
//
// Two bugs are pinned here, one of each kind, and both were found by measuring
// rather than by reading:
//
//  1. **AMBIGUITY WAS PREFERRED, NOT REFUSED** (5 September 2026). `?emjson=`
//     won over `?study=` in silence, so a link whose two halves named different
//     studies loaded one of them and labelled it with the other — the status bar
//     said «Villa di Aiano» over a page opened as Porta Marina, the address bar
//     was cleaned because the success branch had run, and there was no toast and
//     no log line. The URL that produces it is the ordinary one: you edit
//     `study=` and leave `emjson=` where it was.
//
//     `handoff.ts` had the right rule three hours earlier in the same tree — a
//     link naming both a room and a study is refused — and it was not carried
//     across. So this file measures BOTH readers against the same principle.
//
//  2. **THE ORDER WAS A COINCIDENCE.** The study link won over the restored
//     workspace only because its `fetch` happened to resolve after
//     `applyWorkspace`. A link is an explicit request and a restore is a habit,
//     so the link must win — and that has to be written down, which is what the
//     boot assertions at the end are about.
import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");

let checks = 0;
const failures = [];
const ok = (condition, what, detail = "") => {
  checks += 1;
  if (condition) return true;
  failures.push(what + (detail ? ` — ${detail}` : ""));
  return false;
};

const load = async (entry) => {
  const built = await esbuild.build({ entryPoints: [join(SRC, entry)],
                                      bundle: true, format: "esm", write: false });
  return import("data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64"));
};

const S = await load("studylink.ts");
const A = "study%3A275dc72c-3c30-4ffe-92b3-401c23c6d949";   // Villa di Aiano
const B = "study%3A44c0be86-ab93-476c-a227-7a04a5bce017";   // Porta Marina
const urlOf = (id) => `/catalog/study/${id}/emjson`;

console.log("\n1 · the two forms the Catalog documents");
ok(S.readStudyLink(`?emjson=${encodeURIComponent(urlOf(A))}`)?.url === urlOf(A),
   "`?emjson=` is the container, taken as given");
{
  // the id is percent-encoded into the path — `study:abc` → `study%3Aabc`. Legal
  // either way and the Catalog decodes it (measured: `/em/read/?study=…` opens
  // through this very branch), and encoding is what keeps an id containing a
  // slash from inventing a path segment.
  const link = S.readStudyLink(`?study=${A}&catalog=https%3A%2F%2Fem.example.org`);
  ok(link?.url === `https://em.example.org/catalog/study/${A}/emjson`,
     "`?study=&catalog=` resolves against the catalogue", link?.url);
  ok(link?.study === decodeURIComponent(A), "…and the id travels for the title");
}
ok(S.readStudyLink(`?study=${A}`)?.url === `/catalog/study/${A}/emjson`,
   "…with no catalogue named, against THIS origin — which is the arrangement "
   + "`/em/studio/` exists to create");
ok(S.readStudyLink("?nothing=here") === null,
   "a URL that names no study is not a study link");

console.log("\n2 · a RELATIVE emjson is the good case, not a bug to fix");
ok(S.readStudyLink(`?emjson=${encodeURIComponent(urlOf(A))}`)?.url.startsWith("/"),
   "a root-relative container URL is passed through untouched: the fetch "
   + "resolves it against `location`, and turning it absolute is exactly the "
   + "mixed-content bug the Catalog already measured in Chrome");

console.log("\n3 · A LINK NAMING TWO STUDIES IS REFUSED — the 5 September bug");
{
  // study says B, emjson points at A: the URL you get by editing only `study=`
  let said = "";
  try {
    S.readStudyLink(`?study=${B}&emjson=${encodeURIComponent(urlOf(A))}`);
  } catch (error) { said = String(error.message); }
  ok(said.includes("two different studies"),
     "the refusal happens at all — it used to load A under B's name", said);
  ok(said.includes(decodeURIComponent(A)) && said.includes(decodeURIComponent(B)),
     "…and the sentence names BOTH, because the reader cannot tell which half "
     + "is the mistake", said);
  ok(/drop the .?emjson|drop `emjson/i.test(said),
     "…and says what to do about it", said);
}
{
  // the halves AGREEING is the normal case and must still work
  const link = S.readStudyLink(
    `?study=${A}&emjson=${encodeURIComponent(urlOf(A))}`);
  ok(link?.url === urlOf(A),
     "…while a link whose halves agree is opened, not interrogated");
}
{
  // an `?emjson=` that is not a catalogue URL cannot be compared, and must NOT
  // be refused: an object-store link, a presigned URL and a file on a share are
  // all legitimate and none of them mentions a study id
  const link = S.readStudyLink(
    `?study=${A}&emjson=${encodeURIComponent("https://store.example.org/x.json?sig=abc")}`);
  ok(link?.url === "https://store.example.org/x.json?sig=abc",
     "…and an emjson that names no study is taken as given: the check reports a "
     + "disagreement it can SEE, never one it has guessed");
}
ok(S.studyIdInContainerUrl(urlOf(A)) === decodeURIComponent(A),
   "the id is read out of the Catalog's own shape");
ok(S.studyIdInContainerUrl("https://store.example.org/x.json") === null,
   "…and out of nothing else");

console.log("\n4 · a token is USED and never kept");
{
  const link = S.readStudyLink(`?study=${A}&token=abc`);
  ok(link?.token === "abc", "the token is read for the fetch");
  ok(S.clearStudyLinkFromLocation.toString().includes("token"),
     "…and the cleaner takes it off the address bar: a credential in a URL "
     + "outlives the tab it was useful in");
  for (const key of ["emjson", "study", "catalog", "narrative"]) {
    ok(S.clearStudyLinkFromLocation.toString().includes(key),
       `…along with \`${key}\`, so a reload does not re-open over the work since`);
  }
}

console.log("\n5 · THE ORDER IS DECLARED, not won by a race");
{
  const main = readFileSync(join(SRC, "main.ts"), "utf8");
  // the ordered sequence lives in ONE function, because each step can rewrite
  // the address bar that the next one reads
  const at = main.indexOf("async function bootSession()");
  ok(at > 0, "`bootSession` is where the order is written down");
  const body = main.slice(at, main.indexOf("\n}", at));
  const land = body.indexOf("await followHandoff()");
  const read = body.indexOf("readStudyLinkOrSay()");
  const open = body.indexOf("await openStudyFromLink(pendingStudy)");
  ok(land >= 0 && read > 0 && open > 0,
     "the three steps are all in it", `${land} ${read} ${open}`);
  ok(land < read,
     "the sign-in is AWAITED FIRST: the realm's return replaces the query "
     + "string, so at that moment the URL says `code` and not `?study=`. "
     + "Reading the link before the address has been restored is how the study "
     + "was lost after signing in — measured in Chrome on 5 September.");
  ok(read < open,
     "…then READ, then OPEN — over the arrangement the synchronous boot has "
     + "already restored. A link is an explicit request and a restore is a "
     + "habit, so the link wins by being last.");
  const bootAt = main.indexOf("void bootSession()");
  const restore = main.indexOf("applyWorkspace(activeWorkspace())");
  ok(restore > 0 && bootAt > restore,
     "…and the whole sequence is started AFTER the workspace is put back");
  ok(/function readStudyLinkOrSay/.test(main),
     "a refused link is caught where there is a canvas to say it on");
  ok(/studyFailed\(t\("study\.ambiguous"\)/.test(main),
     "…and it IS said, through the same three-sentence path as any other failure");
  // and the failure reaches the canvas, not only the status bar
  ok(/drop-hint/.test(main.slice(main.indexOf("function studyFailed"),
                                 main.indexOf("function studyFailed") + 1400)),
     "`studyFailed` writes into the empty canvas too: the status bar is a line "
     + "at the bottom right and a toast is gone in four seconds");
  ok(/emtree\.slots\.length/.test(main.slice(main.indexOf("function studyFailed"),
                                            main.indexOf("function studyFailed") + 1400)),
     "…but only when the canvas is EMPTY — painting a failure across a graph "
     + "somebody is working on is the wrong kind of loud");
}

console.log("\n6 · THE RING IS BROKEN — the link survives the login");
{
  const main = readFileSync(join(SRC, "main.ts"), "utf8");
  const oidc = readFileSync(join(SRC, "oidc.ts"), "utf8");
  // the round trip carries the address it started from
  ok(/returnTo: window\.location\.href/.test(main),
     "the sign-in remembers the page it was started from, with whatever was on "
     + "its address — the realm's return replaces the query, so this is the only "
     + "thing that can bring `?study=` back");
  ok(/returnTo\?: string/.test(oidc) && /interface PendingSignIn/.test(oidc),
     "…kept beside the PKCE verifier, one entry and one lifetime");
  ok(!/searchParams\.set\("state", .*returnTo/.test(oidc),
     "…and NOT inside the `state` parameter: that travels through the IdP and "
     + "into its logs, and the address may legitimately carry `?token=`");
  ok(/restoreAfterSignIn\(result\.returnTo\)/.test(main),
     "the address is put back BEFORE anything reads the link");
  // …on every exit, success or not
  ok(/const where = \{ returnTo: saved\?\.returnTo/.test(oidc),
     "…on every exit of `completeSignIn`: a failure that also loses the page is "
     + "two failures");

  // ONE silent attempt, and the marker survives the redirect it guards
  ok(/silentSignInTried\(link\.url\)/.test(main)
     && /await trySilentSignIn\(link\.url\)/.test(main),
     "a 401 tries the node's session ONCE before asking");
  ok(/searchParams\.set\("prompt", "none"\)/.test(oidc),
     "…with `prompt=none`, which shows nothing when there is a session");
  ok(/sessionStorage\.setItem\(`emstudio\.silenttry:/.test(main),
     "…and the marker is in sessionStorage, because it has to survive the very "
     + "redirect it guards against — a flag in memory would loop for ever");
  // …and the sign-in has to CHANGE something, or it was a sign-in for nothing
  ok(/const bearer = link\.token \|\| hubToken/.test(main),
     "the study fetch sends the SESSION's token when the link carries none. "
     + "Without it the silent attempt worked, the chip firmed up to «confirmed» "
     + "and the study still said «is not published» — measured, and it made "
     + "everything else look broken");
  ok(/if \(result\.silent\)/.test(main),
     "a silent attempt that finds no session is NOT reported as a failure: "
     + "`login_required` is the expected answer, and shouting about it would be "
     + "an error message for something that went exactly as designed");
  ok(/return true;\s*\/\/ no session/.test(main)
     || /logInfo\(`identity: no session on this node yet/.test(main),
     "…it is logged, not toasted");
}

console.log("\n7 · the bar keeps NOTHING from the round trip");
{
  const main = readFileSync(join(SRC, "main.ts"), "utf8");
  const at = main.indexOf("function restoreAfterSignIn");
  ok(at > 0, "`restoreAfterSignIn` exists");
  const body = main.slice(at, main.indexOf("\n}\n", at));
  for (const key of ["code", "state", "session_state", "iss"]) {
    ok(body.includes(`"${key}"`),
       `\`${key}\` is taken off the address bar — it was left there while `
       + "`?study=` was removed, which is the same rule applied to half the "
       + "problem: a spent code written in a bar gets copied into chats");
  }
  ok(/replaceState/.test(body), "…without adding a history entry");
}

console.log("\n8 · the study is instrumented, so a lost one leaves a trail");
{
  const main = readFileSync(join(SRC, "main.ts"), "utf8");
  ok(/logInfo\(`study: opening /.test(main), "entering `openStudyFromLink`");
  ok(/logInfo\(`study: loaded /.test(main), "…and leaving it, with the slot count");
  ok(/logInfo\(`container: /.test(main),
     "…and `loadContainerDocument` says how many members it took");
}

console.log(`\nstudylink: ${checks} checks passed`);
if (failures.length) {
  console.error(`\nstudylink: ${failures.length} FAILED`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
