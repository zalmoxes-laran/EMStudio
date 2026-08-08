// WIN5 · executable check of the tiling model in src/workspace.ts.
//
//   node scripts/check-tiling.mjs
//
// The frontend has no test runner (see check-naming.mjs), so the module is
// bundled with the project's own esbuild and exercised in node. `workspace.ts`
// touches localStorage, which node 22+ provides only with a flag — so the check
// stubs it before importing. Everything else is pure state.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

// a localStorage that exists and forgets nothing, so persistence is exercised
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}workspace.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const W = await import(
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

// ── a fresh workspace is a single leaf ──────────────────────────────────────
{
  const layout = W.layoutOf("canvas");
  eq(layout.kind, "leaf", "a workspace starts as one area");
  eq(W.paneIds(layout).length, 1, "holding exactly one window");
  ok(!W.isTiled("canvas"), "and is not tiled");
}

// ── split makes two areas, and the new one is active ────────────────────────
{
  const first = W.activeWin("canvas");
  const made = W.splitWindow(first.id, "row", "canvas");
  ok(made, "splitting an existing area yields a window");
  ok(W.isTiled("canvas"), "the workspace is now tiled");
  const ids = W.paneIds(W.layoutOf("canvas"));
  eq(ids.length, 2, "two areas");
  ok(ids.includes(first.id) && ids.includes(made.id), "both windows are placed");
  eq(W.activeWin("canvas").id, made.id, "the new area takes focus");
  eq(made.type, first.type, "a split inherits the type it was split from");
  eq(
    W.winMode(made),
    W.winMode(first),
    "and its mode — you split to compare what you were looking at",
  );
}

// ── every window the workspace has is placed exactly once ───────────────────
{
  const wins = W.windowsOf("canvas").map((w) => w.id).sort();
  const placed = [...W.paneIds(W.layoutOf("canvas"))].sort();
  eq(placed, wins, "the tree places every window, once");
  const seen = new Set(placed);
  eq(seen.size, placed.length, "no window is placed twice");
}

// ── addWindow (no split) still lands somewhere ──────────────────────────────
{
  const extra = W.addWindow("graph", { mode: "dtc" }, "canvas");
  ok(
    W.paneIds(W.layoutOf("canvas")).includes(extra.id),
    "a window added without an explicit split is still given an area",
  );
}

// ── the divider clamps: an area can never be collapsed to nothing ───────────
{
  const [firstId] = W.paneIds(W.layoutOf("canvas"));
  W.setSplitRatio(firstId, 0.99, "canvas");
  const findRatio = (p) =>
    p.kind === "leaf"
      ? null
      : W.paneIds(p.a).length === 1 && W.paneIds(p.a)[0] === firstId
        ? p.ratio
        : (findRatio(p.a) ?? findRatio(p.b));
  ok(findRatio(W.layoutOf("canvas")) <= 0.85, "a divider cannot swallow its sibling");
  W.setSplitRatio(firstId, -1, "canvas");
  ok(findRatio(W.layoutOf("canvas")) >= 0.15, "nor collapse its own area");
}

// ── closing an area JOINS the split ─────────────────────────────────────────
{
  const before = W.paneIds(W.layoutOf("canvas")).length;
  const victim = W.activeWin("canvas").id;
  ok(W.closeWindow(victim, "canvas"), "an area of a tiled workspace can close");
  const after = W.paneIds(W.layoutOf("canvas"));
  eq(after.length, before - 1, "the tree loses exactly that area");
  ok(!after.includes(victim), "and never mentions it again");
  eq(
    after.sort(),
    W.windowsOf("canvas").map((w) => w.id).sort(),
    "tree and window list stay in agreement",
  );
}

// ── the last area never closes: a workspace with nothing to show is a bug ───
{
  while (W.windowsOf("canvas").length > 1)
    W.closeWindow(W.activeWin("canvas").id, "canvas");
  ok(
    !W.closeWindow(W.activeWin("canvas").id, "canvas"),
    "the last area refuses to close",
  );
  eq(W.layoutOf("canvas").kind, "leaf", "and the workspace is a single leaf again");
}

// ── the arrangement is persisted ────────────────────────────────────────────
{
  const raw = mem.get("emstudio.windows");
  ok(raw, "the arrangement is written to storage");
  const parsed = JSON.parse(raw);
  ok(parsed.canvas?.layout, "including the layout tree, not just the window list");
}

console.log(`tiling: ${checks} checks passed`);
