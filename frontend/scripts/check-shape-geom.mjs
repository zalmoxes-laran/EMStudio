// EM1 · executable check of src/shape-geom.ts — the node silhouette geometry.
//
//   node scripts/check-shape-geom.mjs
//
// Run it after touching shape-geom.ts, em_visual_rules' shape fields, or
// em-core's geometry.rs.
//
// The frontend has no test runner, and the geometry is the one thing in this step
// that must be RIGHT rather than plausible: it decides what a click selects. So
// the module is bundled with the project's own esbuild and exercised in node.
//
// `./icons` is stubbed because it uses `import.meta.glob` (Vite-only). The only
// thing shape-geom takes from it is the ICON_NODE_TYPES set, so the stub is the
// same set with one member — enough to prove the glyph branch is taken.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;

const bundle = await esbuild.build({
  entryPoints: [`${SRC}shape-geom.ts`],
  bundle: true,
  format: "esm",
  write: false,
  plugins: [
    {
      name: "stub-icons",
      setup(build) {
        build.onResolve({ filter: /\.\/icons$/ }, () => ({
          path: "icons-stub",
          namespace: "stub",
        }));
        build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          contents: `export const ICON_NODE_TYPES = new Set(["extractor"]);`,
          loader: "ts",
        }));
      },
    },
  ],
});

const mod = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const { drawBoxOf, drawsAsGlyph, pointInShape, polygonOf } = mod;

const node = { x: 0, y: 0, w: 90, h: 32 };
let checks = 0;
const ok = (cond, what) => {
  assert.ok(cond, what);
  checks++;
};

// ── the drawing box ──────────────────────────────────────────────────────────
const brStyle = { shapeScale: 0.7, shapeBox: "square", shape: "diamond" };
const br = drawBoxOf(brStyle, node);
ok(br.w === 22.4 && br.h === 22.4, "BR draws in a 22.4 square");
ok(
  Math.abs(br.x - (90 - 22.4) / 2) < 1e-9 && Math.abs(br.y - (32 - 22.4) / 2) < 1e-9,
  "the shrunken box is CENTRED in the node box",
);
// IDEMPOTENT: a box that em-core already squared must not shrink again
const already = drawBoxOf(brStyle, { x: 10, y: 10, w: 22.4, h: 22.4 });
ok(
  already.w === 22.4 && already.h === 22.4 && already.x === 10,
  "applying the type box to an already-squared box is the identity",
);
ok(
  drawBoxOf(brStyle, already).w === 22.4,
  "…and stays the identity however many times it is applied",
);
const plain = drawBoxOf({ shapeScale: 1, shape: "rectangle" }, node);
ok(plain.w === 90 && plain.h === 32 && plain.x === 0, "an ordinary type is unchanged");

// ── BR: the click follows the rhombus, not the box ───────────────────────────
const cx = br.x + br.w / 2;
const cy = br.y + br.h / 2;
ok(pointInShape("diamond", br, cx, cy), "the centre of the rhombus selects");
ok(
  !pointInShape("diamond", br, br.x + 1, br.y + 1),
  "the CORNER of the rhombus' own box does NOT select",
);
ok(
  !pointInShape("diamond", br, 60, 16),
  "a point 30px right of the marker — inside the old 90x32 box — does NOT select",
);
// the four vertices are on the boundary; just inside each must select
ok(pointInShape("diamond", br, cx, br.y + 0.6), "just below the top vertex selects");
ok(pointInShape("diamond", br, br.x + 0.6, cy), "just right of the left vertex selects");

// ── SE: triangle, apex up ───────────────────────────────────────────────────
const tri = { x: 0, y: 0, w: 90, h: 32 };
ok(pointInShape("triangle", tri, 45, 30), "inside the base of the triangle selects");
ok(!pointInShape("triangle", tri, 3, 3), "the top-left corner of its box does NOT");
ok(!pointInShape("triangle", tri, 87, 3), "the top-right corner does NOT either");
ok(pointInShape("triangle", tri, 45, 2), "under the apex selects");

// ── shapes that keep their box, on purpose ──────────────────────────────────
ok(pointInShape("corner_brackets", tri, 2, 2), "USN answers for its extent");
ok(pointInShape("corner_brackets", tri, 45, 16), "…including the middle");
ok(drawsAsGlyph("extractor"), "an icon type is a glyph");
ok(drawsAsGlyph("document") && drawsAsGlyph("property"), "so are the two specials");
ok(!drawsAsGlyph("US") && !drawsAsGlyph("BR"), "a shape type is not");

// ── rounded rectangle: the corner radius is respected ───────────────────────
ok(!pointInShape("rounded_rectangle", tri, 0.2, 0.2), "outside the corner radius");
ok(pointInShape("rounded_rectangle", tri, 6, 6), "inside it");
ok(pointInShape("rectangle", tri, 0.2, 0.2), "a plain rectangle keeps its corner");

// ── ellipse (the series types) ──────────────────────────────────────────────
ok(pointInShape("ellipse", tri, 45, 16), "the centre of an ellipse selects");
ok(!pointInShape("ellipse", tri, 1, 1), "its box corner does not");

// ── one geometry: the polygon a shape is drawn from is the one tested ───────
for (const s of ["diamond", "triangle", "hexagon", "octagon", "parallelogram", "pentagon", "star", "rectangle"]) {
  const poly = polygonOf(s, tri);
  ok(Array.isArray(poly) && poly.length >= 3, `${s} has vertices`);
  // every vertex is on the boundary → a point nudged to the centroid is inside
  const c = poly.reduce((a, [x, y]) => [a[0] + x / poly.length, a[1] + y / poly.length], [0, 0]);
  ok(pointInShape(s, tri, c[0], c[1]), `${s}: its centroid is inside itself`);
}
for (const s of ["ellipse", "circle", "corner_brackets", "rounded_rectangle"]) {
  ok(polygonOf(s, tri) === null, `${s} is not a polygon and says so`);
}

console.log(`shape-geom: ${checks} checks passed`);
