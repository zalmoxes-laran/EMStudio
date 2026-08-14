// IIIF · executable check of src/iiif.ts — the image layer as a PROJECTION.
//
//   node scripts/check-iiif.mjs
//
// Two things are being defended here, and they are the reason the module exists
// rather than a handful of template strings scattered through the UI.
//
// **It must agree with the Python.** `s3dgraphy/iiif.py` computes the same URLs
// for the same resources; a thumbnail that differs by a character is a cache
// miss at best and a 404 at worst. The URLs asserted below are the same strings
// asserted in `tests/test_iiif.py`.
//
// **The projection must come home.** A region drawn here, exported as a W3C Web
// Annotation, opened in somebody's viewer and sent back must be the same region.
// That is what makes IIIF an interoperability layer and not an export format.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true,
                                  format: "esm", write: false });
  return import("data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const I = await load("iiif.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const BASE = "https://em.example.org/iiif/3";
const DIGEST = "a".repeat(64);

const image = (extra = {}) => ({
  id: "img-1", node_type: "resource", name: "Foto del muro",
  data: { checksum: `sha256:${DIGEST}`, media_type: "image/jpeg", ...extra },
});

// ── 1 · the identifier is the asset's own digest ────────────────────────────
{
  eq(I.imageIdentifier(image()), DIGEST,
     "the IIIF identifier is the checksum: the store is content-addressed");
  eq(I.imageIdentifier({ id: "x", data: {} }), null,
     "an image nobody hashed has no identifier…");
  eq(I.imageUrl({ id: "x", data: {} }, BASE), null,
     "…and therefore no URL, rather than one that 404s");
  eq(I.imageIdentifier({ id: "x", data: { checksum: DIGEST } }), DIGEST,
     "a bare hex is still read (legacy), and lower-cased");
}

// ── 2 · what is an image, and what is not ───────────────────────────────────
{
  ok(I.isImageResource(image()), "a jpeg is an image");
  ok(!I.isImageResource(image({ media_type: "model/gltf-binary" })),
     "a glTF is not: offering it an Image API service would produce a 404");
  ok(I.isImageResource({ id: "x", data: { url: "photos/muro.TIF" } }),
     "…and without a media type the extension still answers");
  eq(I.thumbnailUrl(image({ media_type: "model/gltf-binary" }), BASE), null,
     "so a model has no thumbnail URL at all");
}

// ── 3 · the URLs, character for character (the Python asserts the same) ─────
{
  eq(I.thumbnailUrl(image(), BASE, 200),
     `${BASE}/${DIGEST}/full/!200,200/0/default.jpg`,
     "a thumbnail is a SIZE REQUEST, and a CONFINING one: `!w,h` means 'at most " +
     "this big', so a source smaller than the box is served instead of refused " +
     "— Cantaloupe answers 400 to any size above full (measured)");
  eq(I.imageUrl(image(), BASE), `${BASE}/${DIGEST}/full/max/0/default.jpg`,
     "the size is `max`: `full` is deprecated in Image API 3 and Cantaloupe " +
     "answers 400 to it — measured against a real server");
  eq(I.regionUrl(image(), BASE, [0.25, 0.25, 0.5, 0.5]),
     `${BASE}/${DIGEST}/pct:25.000000,25.000000,50.000000,50.000000/max/0/default.jpg`,
     "a region crop is a PERCENTAGE region: normalised coordinates need no pixels");
  eq(I.imageService(image(), BASE),
     { id: `${BASE}/${DIGEST}`, type: "ImageService3", profile: "level2" },
     "the service block is what a manifest carries");
  eq(I.imageService(image(), ""), null,
     "no configured service → nothing, and every caller degrades quietly");
}

// ── 4 · the annotator asks for what it can show, and never for more ─────────
{
  const big = { width: 12000, height: 9000 };     // as info.json would report
  const url = I.fittedUrl(image(), BASE, 900, big);
  const asked = Number(/\/full\/(\d+),/.exec(url)[1]);
  ok(asked >= 900 && asked % 256 === 0,
     "on a huge scan the annotator asks for a WIDTH, rounded to a step — so a " +
     "resize does not mint a new URL per frame and the cache is hit, not thrashed");

  eq(I.fittedUrl(image(), BASE, 900, { width: 800, height: 600 }),
     `${BASE}/${DIGEST}/full/max/0/default.jpg`,
     "on a SMALL source it asks for `max`: an upscale request is a 400 from the " +
     "image server, i.e. no picture at all (measured against Cantaloupe)");

  eq(I.fittedUrl(image(), BASE, 900, null),
     `${BASE}/${DIGEST}/full/max/0/default.jpg`,
     "and before info.json has answered, `max` is the request that cannot fail");
}

// ── 5 · the round trip, which is the whole claim ────────────────────────────
{
  const region = {
    id: "reg-1", node_type: "annotation_region", name: "muro in opus",
    data: { shape_kind: "rect", rect: [0.25, 0.25, 0.5, 0.5], page: 0 },
  };
  const size = { width: 800, height: 600 };

  const anno = I.regionToWebAnnotation(region, "canvas/1", size);
  eq(anno.target.selector.value, "xywh=200,150,400,300",
     "with a known size the selector is in PIXELS: what viewers implement");
  eq(anno.id, "reg-1",
     "the annotation's id is the region's node id — that is what lets somebody " +
     "else's tool refer to our annotation and us recognise it coming back");
  eq(anno.body.value, "muro in opus",
     "the label travels as the body; the CLAIM stays in the graph's paradata");

  const back = I.webAnnotationToRegion(anno, size);
  eq(back.rect, [0.25, 0.25, 0.5, 0.5], "…and it comes home normalised");
  eq(back.id, "reg-1", "…with its identity");

  const percent = I.regionToWebAnnotation(region, "canvas/1", null);
  ok(percent.target.selector.value.startsWith("xywh=percent:"),
     "without a size the selector is a PERCENTAGE — still standard, still exact");
  eq(I.webAnnotationToRegion(percent).rect, [0.25, 0.25, 0.5, 0.5],
     "…and needs no size to come home either");
}

// ── 6 · polygons, and what is refused rather than guessed ───────────────────
{
  const poly = {
    id: "reg-p", node_type: "annotation_region", name: "poligono",
    data: { shape_kind: "polygon", points: [[0.1, 0.1], [0.5, 0.2], [0.3, 0.6]] },
  };
  const size = { width: 800, height: 600 };
  const anno = I.regionToWebAnnotation(poly, "canvas/1", size);
  eq(anno.target.selector.type, "SvgSelector",
     "a non-rectangle has one standard expression, and it is SVG");
  const back = I.webAnnotationToRegion(anno, size);
  eq(back.shape_kind, "polygon", "…and it comes home a polygon");
  ok(back.points.every((p, i) =>
       Math.abs(p[0] - poly.data.points[i][0]) < 1e-3 &&
       Math.abs(p[1] - poly.data.points[i][1]) < 1e-3),
     "…with its points, to the pixel");

  assert.throws(() => I.regionToWebAnnotation(poly, "canvas/1", null),
                /pixel size/);
  checks++;                       // an SvgSelector has no percentage form
  assert.throws(() => I.webAnnotationToRegion({
    id: "x", type: "Annotation",
    target: { type: "SpecificResource", source: "c",
              selector: { type: "SvgSelector", value: "<svg><circle r='5'/></svg>" } },
  }, size), /polygon/);
  checks++;                       // a foreign shape is refused, not approximated
  assert.throws(() => I.webAnnotationToRegion({ id: "x", type: "Annotation" }),
                /selector/);
  checks++;                       // an annotation without a selector has no region
}

console.log(`iiif: ${checks} checks passed`);
