// Official s3Dgraphy 2D icons (JSON_config/src/2D), shared by the palette
// and the canvas renderer. Inlined as data URLs at build time.
const ICON_FILES = import.meta.glob("./assets/icons2d/*.png", {
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

/** node types drawn ON CANVAS as their official icon (yEd parity) */
export const ICON_NODE_TYPES = new Set(["extractor", "combiner", "document"]);

const imageCache = new Map<string, HTMLImageElement>();
let redraw: (() => void) | null = null;

/** the renderer asks for a repaint when an icon finishes decoding */
export function setIconRedraw(fn: () => void): void {
  redraw = fn;
}

export function imageFor(nodeType: string): HTMLImageElement | null {
  const url = iconUrlFor(nodeType);
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
