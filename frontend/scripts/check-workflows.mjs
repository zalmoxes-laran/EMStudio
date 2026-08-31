// WF-REF · executable check of `.github/workflows/` — the rule that a reusable
// workflow must name the ref it checks out.
//
//   node scripts/check-workflows.mjs
//
// THE RULE, and it is not a style preference:
//
//   in every workflow that declares `workflow_call`, every checkout OF THIS
//   REPOSITORY must carry an explicit `ref:`.
//
// A workflow reached by `workflow_call` inherits the CALLING run's context. The
// nightly runs on the default branch and then calls `release.yml` for a tag that
// the nightly itself has just pushed — so a bare `actions/checkout` in the
// reusable workflow checks out the branch, not the tag, and builds something
// that is NOT what the tag says. That failure was diagnosed on 2026-08-30, and
// it does not announce itself: the build succeeds, with the wrong tree.
//
// The rule was found by hand that night, run once by hand, and never written
// down. It is the class of mistake that comes back the moment somebody adds a
// job to a reusable workflow — which is six months from now, when nobody
// remembers that night.
//
// TWO THINGS IT MUST NOT FLAG, and both exist in the repo today:
//
//   · the CALLING workflow (`nightly.yml`). It does not declare
//     `workflow_call`, it runs on the default branch on purpose, and its bare
//     checkout is correct. Flagging it would teach people to ignore this check;
//   · a checkout of ANOTHER repository (`EMStudio-doc`, which carries its own
//     `ref`). The rule is about our own tree.
//
// No YAML dependency, on purpose: the frontend has no test runner (see
// check-shape-geom.mjs) and this is not the place to grow a parser. Workflow
// files are indentation-regular; what is read here is exactly the four things
// the rule needs — the `on:` keys, the job names, `uses: actions/checkout`, and
// the `with:` block under it.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const DIR = new URL("../../.github/workflows/", import.meta.url).pathname;
//: this repository, in the `owner/name` form a `repository:` key uses
const SELF = "zalmoxes-laran/EMStudio";

let checks = 0;
const ok = (cond, what) => {
  assert.ok(cond, what);
  checks++;
};

const indentOf = (line) => line.length - line.trimStart().length;

/** Does this workflow declare `workflow_call` among its triggers?
 *
 *  Read from the `on:` BLOCK and not from the file, because `workflow_call` is
 *  named in a comment in `nightly.yml` — which calls the reusable workflow and
 *  must not be mistaken for one. */
function isReusable(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^on:\s*$/.test(l));
  if (start < 0) return /^on:.*workflow_call/.test(text);
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (indentOf(line) === 0) break;                 // out of the `on:` block
    if (indentOf(line) === 2 && /^workflow_call:/.test(line.trim())) return true;
  }
  return false;
}

/** Every `actions/checkout` step, with the job it is in and the `with:` keys it
 *  carries. A step's `with:` is the block indented deeper than the `- uses:`
 *  line, and it ends at the next line that is not. */
function checkouts(text) {
  const lines = text.split("\n");
  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  const found = [];
  let job = "(before jobs:)";
  for (let i = jobsAt + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (indentOf(line) === 2 && /^[A-Za-z0-9_-]+:\s*$/.test(line.trim())) {
      job = line.trim().replace(/:$/, "");
      continue;
    }
    const step = line.match(/^(\s*)-\s*(?:name:.*|uses:\s*(\S+))/);
    if (!step) continue;
    // a step may name itself first and `uses:` on a later line
    let uses = step[2] || "";
    const base = indentOf(line);
    if (!uses) {
      for (let j = i + 1; j < lines.length; j++) {
        if (indentOf(lines[j]) <= base || /^\s*-\s/.test(lines[j])) break;
        const m = lines[j].match(/^\s*uses:\s*(\S+)/);
        if (m) { uses = m[1]; break; }
      }
    }
    if (!/^actions\/checkout/.test(uses)) continue;
    const withKeys = {};
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (!next.trim() || next.trimStart().startsWith("#")) continue;
      if (indentOf(next) <= base) break;             // out of this step
      const kv = next.match(/^\s*([A-Za-z0-9_-]+):\s*(.*)$/);
      if (kv) withKeys[kv[1]] = kv[2].trim();
    }
    found.push({ job, line: i + 1, with: withKeys });
  }
  return found;
}

/** Is this checkout OUR tree? A `repository:` naming somebody else is exempt —
 *  the rule speaks about our own. */
const isOurs = (step) => {
  const repo = (step.with.repository || "").replace(/^["']|["']$/g, "");
  return !repo || repo === SELF;
};

// ── the rule, over every reusable workflow in the repo ───────────────────────
const files = (await readdir(DIR)).filter((f) => /\.ya?ml$/.test(f)).sort();
ok(files.length > 0, "there are workflows to check");

let reusable = 0;
let subject = 0;
for (const file of files) {
  const text = await readFile(DIR + file, "utf8");
  if (!isReusable(text)) continue;
  reusable++;
  for (const step of checkouts(text)) {
    if (!isOurs(step)) {
      // still counted as a check: the exemption is part of the rule, and a day
      // when it stops being true is a day this should notice.
      ok(Boolean(step.with.ref),
        `${file}:${step.line} job \`${step.job}\` checks out ` +
          `${step.with.repository} — another repo, and it names its own ref`);
      continue;
    }
    subject++;
    ok(Boolean(step.with.ref),
      `${file}:${step.line} job \`${step.job}\`: a reusable workflow checks out ` +
        `THIS repo with no \`ref:\`. It inherits the CALLING run's context, so ` +
        `this builds the caller's branch and not the tag — add ` +
        `\`ref: \${{ env.EM_TAG }}\` (see the other jobs in this file).`);
  }
}

// ── and the rule has something to bite on ───────────────────────────────────
// A check that passes because it found nothing is a check that will pass for
// ever, including the day the thing it guards disappears.
ok(reusable > 0, "at least one workflow declares `workflow_call`");
ok(subject > 0, "…and at least one of its checkouts is of this repository");

// ── the calling workflow is NOT subject, and that is deliberate ──────────────
{
  const nightly = await readFile(DIR + "nightly.yml", "utf8").catch(() => "");
  if (nightly) {
    ok(!isReusable(nightly),
      "nightly.yml CALLS the reusable workflow and is not one: its bare " +
        "checkout of the default branch is correct, and flagging it would " +
        "teach people to ignore this check");
  }
}

console.log(`workflows: ${checks} checks passed ` +
            `(${reusable} reusable workflow(s), ${subject} checkout(s) of this repo)`);
