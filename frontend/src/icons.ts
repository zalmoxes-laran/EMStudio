// Official s3Dgraphy 2D icons (JSON_config/src/2D), shared by the palette
// and the canvas renderer. Inlined as data URLs at build time.
const ICON_FILES = import.meta.glob("./assets/icons2d/*.png", {
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

const ALIAS: Record<string, string> = {
  BR: "continuity",
  serUSVn: "serUSV",
  serUSVs: "serUSV",
};

export function iconUrlFor(nodeType: string): string | null {
  const base = ALIAS[nodeType] ?? nodeType;
  return ICON_FILES[`./assets/icons2d/${base}.png`] ?? null;
}

/** URL of a DTC glyph SVG by basename (e.g. "03_mesh"), or null if absent. */
export function dtcGlyphUrl(basename: string | null): string | null {
  if (!basename) return null;
  return GLYPH_FILES[`./assets/dtc-glyphs/${basename}.svg`] ?? null;
}

/** node types drawn ON CANVAS as their official icon (yEd parity).
 *
 * The rights nodes join extractor/combiner here because that is what they are
 * in the GraphML: `y:ImageNode`s carrying the palette bitmap (a person, a
 * robot, the licence mark, a no-entry sign), identified by their `A.` / `AI.` /
 * `LI.` / `EB.` label prefix. Drawing them from `style.shape` instead produced
 * a star, a star, a rounded rectangle and an octagon — four shapes with no
 * relation to what the author sees in yEd.
 *
 * property and document are NOT here: property's PNG embeds the word
 * "property", and the document sheet must carry ITS OWN border (thick =
 * canonical, coloured by geometry variant) — both are drawn vectorially. */
export const ICON_NODE_TYPES = new Set([
  "extractor",
  "combiner",
  "author",
  "author_ai",
  "license",
  "embargo",
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
