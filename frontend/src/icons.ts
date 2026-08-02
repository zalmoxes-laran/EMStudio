// Official s3Dgraphy 2D icons (JSON_config/src/2D), shared by the palette
// and the canvas renderer. Inlined as data URLs at build time.
import rules from "./assets/em_visual_rules.json";

const ICON_FILES = import.meta.glob("./assets/icons2d/*.{png,svg}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

// DTC profile glyphs (2017 DTC SVG set); resolved data-driven by basename from
// dtc_kinds[*][kind].glyph (see rules.dtcGlyphName). Adding a kind = a new SVG
// here + a dtc_kinds entry, no code change.
const GLYPH_FILES = import.meta.glob("./assets/dtc-glyphs/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** node_type → the key it has in `em_visual_rules.node_styles`. Mirrors the
 *  alias table in palette.ts: the two files answer different questions about
 *  the same mapping, and both need it. */
const STYLE_KEY: Record<string, string> = {
  property: "PROP",
  combiner: "COMB",
  extractor: "EXT",
  document: "DOC",
  EpochNode: "EP",
  epoch: "EP",
  author: "AUTH",
  author_ai: "AUTH_AI",
  link: "LINK",
  geo_position: "GEO",
  semantic_shape: "SS",
  representation_model: "RM",
  representation_model_doc: "RMDoc",
  representation_model_sf: "RMSF",
  license: "LIC",
  embargo: "EMB",
  graph: "GRAPH",
};

/** Icon files that several node types legitimately share. `BR` is drawn with
 *  the continuity glyph; the two series-of-virtual types share one drawing. */
const FILE_ALIAS: Record<string, string> = {
  BR: "continuity",
  serUSVn: "serUSV",
  serUSVs: "serUSV",
};

function asset(basename: string): string | null {
  return (
    ICON_FILES[`./assets/icons2d/${basename}.svg`] ??
    ICON_FILES[`./assets/icons2d/${basename}.png`] ??
    null
  );
}

const styleEntries = (rules as unknown as {
  node_styles?: Record<string, Record<string, unknown>>;
}).node_styles ?? {};

/** Every basename that is some node type's OWN name. A declaration pointing at
 *  one of these, for a DIFFERENT type, is a mistake in the datamodel rather
 *  than deliberate sharing — deliberate sharing is spelled out in FILE_ALIAS. */
const OWN_NAMES = new Set(Object.keys(styleEntries));

function declaredBasenames(nodeType: string): string[] {
  const entry = styleEntries[STYLE_KEY[nodeType] ?? nodeType];
  if (!entry) return [];
  const out: string[] = [];
  // vector first: it is what the datamodel declares as the preferred form
  for (const key of ["2d_file_vect", "2d_file_rast", "file_2d"]) {
    const path = entry[key];
    if (typeof path !== "string") continue;
    const base = path.split("/").pop()?.replace(/\.(svg|png)$/i, "");
    if (!base || out.includes(base)) continue;
    // Refuse a declaration that names ANOTHER type's own file. `USVn` and `USN`
    // both declare `src/2D/US.png`, and honouring that would hand them the
    // positive-US icon — a wrong drawing, arrived at by trusting a wrong field.
    // Sharing that IS intended lives in FILE_ALIAS, spelled out.
    if (base !== nodeType && base !== FILE_ALIAS[nodeType]
        && OWN_NAMES.has(base)) continue;
    out.push(base);
  }
  return out;
}

const urlCache = new Map<string, string | null>();

/**
 * The icon file for a node type, or null when there is none.
 *
 * Resolution order, and the reason it is this one:
 *
 *   1. an SVG or PNG named after the node type itself — the convention the
 *      shipped files actually follow, and the most specific answer;
 *   2. the same for a known shared file (`BR` → continuity, serUSVn/s → serUSV);
 *   3. whatever `em_visual_rules.json` declares, vector before raster.
 *
 * The declared paths come LAST on purpose, even though the datamodel is the
 * source of truth elsewhere. Two of them are wrong today: `USVn` and `USN` both
 * declare `src/2D/US.png`, so trusting the declaration first would hand USVn the
 * US icon — a regression caused by believing a field that is mistaken. Naming
 * beats declaration only where the declaration contradicts the file that is
 * plainly meant for this type; everywhere else the two agree and the order
 * makes no difference. The mismatch is reported in
 * `.claude/wip/icone-davvero-scoperte.md` for the datamodel to fix.
 *
 * Everything resolves to a bundled asset: the build inlines these as data URLs,
 * so there is no runtime fetch and no dependency on the file layout at runtime.
 */
export function iconUrlFor(nodeType: string): string | null {
  const cached = urlCache.get(nodeType);
  if (cached !== undefined) return cached;
  const candidates = [
    nodeType,
    FILE_ALIAS[nodeType],
    ...declaredBasenames(nodeType),
  ].filter(Boolean) as string[];
  let url: string | null = null;
  for (const base of candidates) {
    url = asset(base);
    if (url) break;
  }
  urlCache.set(nodeType, url);
  return url;
}

/** URL of a DTC glyph SVG by basename (e.g. "03_mesh"), or null if absent. */
export function dtcGlyphUrl(basename: string | null): string | null {
  if (!basename) return null;
  return GLYPH_FILES[`./assets/dtc-glyphs/${basename}.svg`] ?? null;
}

/** node types drawn ON CANVAS as their official icon (yEd parity).
 *
 * This is NOT "every type that has a file". A US is a rectangle in yEd, a USVs a
 * parallelogram: their shape IS the language, and their border colour carries
 * the certainty. Replacing the drawn shape with a bitmap of a shape would lose
 * both. Only the types that are genuinely ICONS in the palette belong here.
 *
 * The rights nodes join extractor/combiner because that is what they are in the
 * GraphML: `y:ImageNode`s carrying the palette bitmap (a person, a robot, the
 * licence mark, a no-entry sign), identified by their `A.` / `AI.` / `LI.` /
 * `EB.` label prefix. Drawing them from `style.shape` instead produced a star, a
 * star, a rounded rectangle and an octagon — four shapes with no relation to
 * what the author sees in yEd.
 *
 * property and document are NOT here: property's PNG embeds the word
 * "property", and the document sheet must carry ITS OWN border (thick =
 * canonical, coloured by geometry variant) — both are drawn vectorially.
 *
 * `narrative` joins them for the same reason as the rights nodes: it is an
 * icon, not a shape. It had no visual rule at all until N7 and fell through to
 * `unknown` — a red dotted question mark on every canvas holding a story. */
export const ICON_NODE_TYPES = new Set([
  "extractor",
  "combiner",
  "author",
  "author_ai",
  "license",
  "embargo",
  "narrative",
]);

const imageCache = new Map<string, HTMLImageElement>();
let redraw: (() => void) | null = null;

/** the renderer asks for a repaint when an icon finishes decoding */
export function setIconRedraw(fn: () => void): void {
  redraw = fn;
}

/** Decode-and-cache an image by URL; triggers a repaint on load. */
export function imageForUrl(url: string | null): HTMLImageElement | null {
  if (!url) return null;
  let img = imageCache.get(url);
  if (!img) {
    img = new Image();
    img.onload = () => redraw?.();
    img.src = url;
    imageCache.set(url, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export function imageFor(nodeType: string): HTMLImageElement | null {
  return imageForUrl(iconUrlFor(nodeType));
}
