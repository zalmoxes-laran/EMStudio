/**
 * IIIF, on the client side — the same projection `s3dgraphy/iiif.py` computes.
 *
 * The two-tier rule, again and for the last time: an annotation is a NODE in the
 * em.json (the truth: attributable, stamped, versioned by the CRDT). IIIF and
 * W3C Web Annotation are how that truth is SHOWN and SHARED — a projection, and
 * a round-trippable one.
 *
 * What adopting the Image API buys this app, and none of it is code here:
 *
 * * a **thumbnail** is a size request, so a shelf of three hundred photographs
 *   does not download three hundred photographs;
 * * the **annotator** can ask for the image at the size of its own viewport
 *   instead of pulling forty megabytes of TIFF through a blob;
 * * the **crop of a region** is a URL, so anybody can quote what you annotated.
 *
 * The URLs are DERIVED from the asset's checksum — the object store is
 * content-addressed, so the digest already identifies exactly those pixels.
 * Nothing is written into the document: a service hostname stored in a study is
 * a dead address after the first migration.
 *
 * Mirrors `s3dgraphy/iiif.py` on purpose. The two must agree about what a
 * thumbnail URL looks like, and the cheapest way to keep two languages agreeing
 * is to keep the rule small enough to state twice.
 */

import type { EmNode } from "./types";

/** `{region}/{size}/{rotation}/{quality}.{format}` — the order that gets
 *  written wrong by hand, in one place. */
export interface ImageRequest {
  region?: string;
  size?: string;
  rotation?: string;
  quality?: string;
  format?: string;
}

const IMAGE_MEDIA = new Set([
  "image/jpeg", "image/png", "image/tiff", "image/jp2", "image/gif",
  "image/webp", "image/tif",
]);

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "tif", "tiff", "jp2"]);

function dataOf(node: EmNode | null | undefined): Record<string, unknown> {
  const data = (node?.data ?? {}) as Record<string, unknown>;
  return data;
}

/** Does this resource have pixels an Image API could serve? A glTF does not,
 *  and offering it a service would produce a URL that 404s. */
export function isImageResource(node: EmNode | null | undefined): boolean {
  if (!node) return false;
  const data = dataOf(node);
  const media = String(data.media_type ?? "").toLowerCase();
  if (media) return IMAGE_MEDIA.has(media);
  const urlType = String(data.url_type ?? "");
  if (urlType === "image" || urlType === "Image") return true;
  const url = String(data.url ?? "").toLowerCase();
  const ext = url.includes(".") ? url.split(".").pop() ?? "" : "";
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * The IIIF identifier of a resource: its digest, bare hex — or null.
 *
 * Null is a real answer with a real meaning: an image nobody hashed cannot be
 * addressed by content, so there is no image service for it and the UI falls
 * back to whatever it did before. That is why every function here returns null
 * rather than a URL that would 404.
 */
export function imageIdentifier(node: EmNode | null | undefined): string | null {
  const raw = String(dataOf(node).checksum ?? "").trim();
  if (!raw) return null;
  const [algorithm, digest] = raw.includes(":")
    ? [raw.slice(0, raw.indexOf(":")), raw.slice(raw.indexOf(":") + 1)]
    : ["sha256", raw];
  if (algorithm.toLowerCase() !== "sha256" || digest.length !== 64) return null;
  return digest.toLowerCase();
}

/** Any Image API request, spelled correctly.
 *
 *  `max` and not `full` as the default SIZE: `full` is deprecated in Image API 3
 *  and Cantaloupe answers 400 to it — measured against a real server. */
export function imageUrl(node: EmNode | null | undefined, base: string,
                         req: ImageRequest = {}): string | null {
  const identifier = imageIdentifier(node);
  if (!identifier || !base) return null;
  const { region = "full", size = "max", rotation = "0",
          quality = "default", format = "jpg" } = req;
  return `${base.replace(/\/+$/, "")}/${identifier}/${region}/${size}/`
    + `${rotation}/${quality}.${format}`;
}

/** A thumbnail is a SIZE REQUEST. There is no thumbnail pipeline in this
 *  project and there should never be one.
 *
 *  `!w,h` (fit inside the box) rather than `w,`: a thumbnail means "at most this
 *  big", and asking a 96-pixel-wide source for 240 would be an upscale, which
 *  the image server refuses with a 400. Confining is what a thumbnail actually
 *  wants and it cannot fail on a small image. */
export function thumbnailUrl(node: EmNode | null | undefined, base: string,
                             width = 400): string | null {
  if (!isImageResource(node)) return null;
  const box = Math.round(width);
  return imageUrl(node, base, { size: `!${box},${box}` });
}

/** What `info.json` said about an image, once. */
export interface ImageInfo { width: number; height: number; }

//: One `info.json` per image, ever. It is the first thing a IIIF client does and
//: the answer never changes — the identifier is a digest, so a different image is
//: a different identifier.
const INFO_CACHE = new Map<string, ImageInfo | null>();

/**
 * Ask the image server how big the image really is.
 *
 * Needed for two things, and the second one is not optional: choosing a size to
 * request (see `fittedUrl`), and projecting a region into PIXEL selectors that
 * other viewers understand.
 *
 * Never throws: a service that is down, or an image it does not have, is `null`
 * and every caller has a path for that.
 */
export async function fetchImageInfo(node: EmNode | null | undefined,
                                     base: string): Promise<ImageInfo | null> {
  const identifier = imageIdentifier(node);
  if (!identifier || !base || !isImageResource(node)) return null;
  const key = `${base}|${identifier}`;
  if (INFO_CACHE.has(key)) return INFO_CACHE.get(key) ?? null;
  try {
    const answer = await fetch(`${base.replace(/\/+$/, "")}/${identifier}/info.json`);
    if (!answer.ok) throw new Error(String(answer.status));
    const info = await answer.json() as { width?: number; height?: number };
    const value = info.width && info.height
      ? { width: Number(info.width), height: Number(info.height) } : null;
    INFO_CACHE.set(key, value);
    return value;
  } catch {
    INFO_CACHE.set(key, null);
    return null;
  }
}

/**
 * The image at the size a viewport actually needs.
 *
 * The point of asking: an annotator that pulls a full-resolution scan to show it
 * in an 800-pixel box waits for forty megabytes to display two. The width is
 * rounded up to a step so a resize does not mint a new URL per frame, and the
 * image server's cache is hit rather than thrashed.
 *
 * **Never larger than the source.** Measured, not assumed: Cantaloupe answers
 * **400** to any size above full — including the `!w,h` "confine" form and the
 * `^` upscale form — so a client that asks for 2048 from an 800-pixel scan gets
 * no picture at all. With `info` in hand the request is capped; without it the
 * honest request is `max`, which always works and costs whatever the image
 * costs.
 */
export function fittedUrl(node: EmNode | null | undefined, base: string,
                          cssWidth: number, info?: ImageInfo | null,
                          zoom = 1): string | null {
  const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
  const wanted = Math.max(256, Math.ceil(cssWidth * dpr * Math.max(1, zoom)));
  const stepped = Math.min(8192, Math.ceil(wanted / 256) * 256);
  if (!info) return imageUrl(node, base, { size: "max" });
  if (stepped >= info.width) return imageUrl(node, base, { size: "max" });
  return imageUrl(node, base, { size: `${stepped},` });
}

/** The crop of a region — normalised [0,1] straight onto IIIF's percentage
 *  region, so it needs no pixel dimensions at all. */
export function regionUrl(node: EmNode | null | undefined, base: string,
                          rect: [number, number, number, number],
                          size = "max"): string | null {
  const [x, y, w, h] = rect;
  const pct = [x, y, w, h].map((v) => (v * 100).toFixed(6)).join(",");
  return imageUrl(node, base, { region: `pct:${pct}`, size });
}

/** The Image API service block, as a manifest would carry it. */
export function imageService(node: EmNode | null | undefined, base: string):
    { id: string; type: string; profile: string } | null {
  const identifier = imageIdentifier(node);
  if (!identifier || !isImageResource(node) || !base) return null;
  return { id: `${base.replace(/\/+$/, "")}/${identifier}`,
           type: "ImageService3", profile: "level2" };
}

// ── W3C Web Annotation ───────────────────────────────────────────────────────
//
// The same projection as the Python side, and the same reason for it: what the
// annotator emits must be readable by somebody else's viewer, and what somebody
// else's viewer sends back must come home as the same region.

export interface WebAnnotation {
  "@context": string;
  id: string;
  type: "Annotation";
  motivation: string;
  body?: { type: string; value: string; format?: string };
  target: { type: "SpecificResource"; source: string;
            selector: { type: string; conformsTo?: string; value: string } };
  "em:page"?: number;
}

export const WEB_ANNOTATION_CONTEXT = "http://www.w3.org/ns/anno.jsonld";

/** A region node → a Web Annotation.
 *
 *  With a pixel size when it is known (what every viewer implements), in
 *  percentages when it is not — still standard, still exact, and it stays
 *  correct whatever the real size turns out to be. */
export function regionToWebAnnotation(
  region: EmNode, target: string,
  size?: { width: number; height: number } | null,
): WebAnnotation {
  const data = dataOf(region);
  const rect = (data.rect as number[] | undefined) ?? [];
  const points = (data.points as number[][] | undefined) ?? [];
  let selector: WebAnnotation["target"]["selector"];

  if (String(data.shape_kind ?? "rect") === "polygon" && points.length) {
    if (!size) {
      throw new Error("a polygon has no percentage selector: it needs the "
        + "image's pixel size, and inventing one would move the annotation");
    }
    const coords = points
      .map(([x, y]) => `${Math.round(x * size.width)},${Math.round(y * size.height)}`)
      .join(" ");
    selector = { type: "SvgSelector",
                 value: `<svg xmlns="http://www.w3.org/2000/svg">`
                      + `<polygon points="${coords}"/></svg>` };
  } else {
    const [x, y, w, h] = rect as [number, number, number, number];
    const value = size
      ? `xywh=${Math.round(x * size.width)},${Math.round(y * size.height)},`
        + `${Math.round(w * size.width)},${Math.round(h * size.height)}`
      : `xywh=percent:${[x, y, w, h].map((v) => (v * 100).toFixed(6)).join(",")}`;
    selector = { type: "FragmentSelector",
                 conformsTo: "http://www.w3.org/TR/media-frags/", value };
  }

  const annotation: WebAnnotation = {
    "@context": WEB_ANNOTATION_CONTEXT,
    id: region.id,
    type: "Annotation",
    motivation: "identifying",
    target: { type: "SpecificResource", source: target, selector },
  };
  if (region.name) {
    annotation.body = { type: "TextualBody", value: String(region.name),
                        format: "text/plain" };
  }
  const page = Number(data.page ?? 0);
  if (page > 0) annotation["em:page"] = page;
  return annotation;
}

/** …and back. What comes home is the normalised geometry the graph stores —
 *  never pixels, which are a fact about one rendering of the file. */
export function webAnnotationToRegion(
  annotation: WebAnnotation | Record<string, unknown>,
  size?: { width: number; height: number } | null,
): { shape_kind: "rect" | "polygon"; rect?: number[]; points?: number[][];
     name: string; page: number; id: string } {
  const anno = annotation as WebAnnotation;
  const selector = anno.target?.selector;
  if (!selector) throw new Error("this annotation carries no selector");
  const name = anno.body?.value ? String(anno.body.value) : "";
  const page = Number((anno as unknown as Record<string, unknown>)["em:page"] ?? 0);
  const id = String(anno.id ?? "");

  if (selector.type === "FragmentSelector") {
    const value = String(selector.value ?? "");
    let numbers: number[];
    if (value.startsWith("xywh=percent:")) {
      numbers = value.slice("xywh=percent:".length).split(",").map((v) => Number(v) / 100);
    } else if (value.startsWith("xywh=")) {
      if (!size) throw new Error("a pixel selector needs the image's size");
      const raw = value.slice("xywh=".length).split(",").map(Number);
      numbers = [raw[0] / size.width, raw[1] / size.height,
                 raw[2] / size.width, raw[3] / size.height];
    } else {
      throw new Error(`unsupported fragment ${value}`);
    }
    return { shape_kind: "rect", rect: numbers, name, page, id };
  }

  if (selector.type === "SvgSelector") {
    if (!size) throw new Error("an SvgSelector is in pixels and needs the size");
    const match = /points="([^"]*)"/.exec(String(selector.value ?? ""));
    if (!match) {
      throw new Error("only a <polygon points=…> SvgSelector is understood: a "
        + "foreign SVG shape would have to be guessed at");
    }
    const points = match[1].trim().split(/\s+/).map((pair) => {
      const [px, py] = pair.split(",").map(Number);
      return [px / size.width, py / size.height];
    });
    return { shape_kind: "polygon", points, name, page, id };
  }

  throw new Error(`unsupported selector type ${selector.type}`);
}
