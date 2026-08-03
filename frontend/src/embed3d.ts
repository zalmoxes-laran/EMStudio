/**
 * N9 — the 3D, in line with the story, without EMStudio becoming a 3D app.
 *
 * The choice, and why. ATON already exists, Heriverse already reads this exact
 * graph in 3D, and both are web apps: the cheapest correct way to show a scene
 * inside a chapter is an `<iframe>` at its URL. The alternative — pulling
 * ATON/THREE into this bundle and driving it ourselves — would add megabytes to
 * a single-file build, couple EMStudio to an ATON version, and duplicate a
 * viewer whose whole job is to be the viewer. So: an iframe, and the reference
 * travels as an ID or a URL, never as a copy of the geometry.
 *
 * Two shapes of reference, because ATON offers two front doors:
 *   · a Heriverse SCENE — `<aton>/a/heriverse/?scene=<sid>`: the epoch/graph in
 *     its published scene, with Heriverse's own temporal UI;
 *   · a single MODEL — `<aton>/preview/?i=<url>`: ATON's built-in preview app,
 *     which loads one glTF/glb and nothing else. This is the one N10 reuses for
 *     a Shelf asset, where there is no scene, only a file.
 *
 * Nothing here loads until the reader is looking at it (`lazy.ts`), and once it
 * has loaded it stays loaded for the session even across the narrative view's
 * rebuilds — otherwise editing a paragraph would reload every scene on screen.
 */

import { onFirstVisible } from "./lazy";
import { is3dResourceType, resourceTypeOfLocator } from "./rules";
import { atonBase, atonPreviewUrl, heriverseSceneUrl } from "./settings";
import type { EmDocument, EmNode } from "./types";

/** A 3D reference, resolved to something an iframe can actually show. */
export interface Ref3D {
  url: string;
  /** How we got there — shown to the reader, so the embed is not magic. */
  via: "heriverse-scene" | "aton-preview" | "viewer-page";
  /** The thing being shown (a scene id, a file name, a host). */
  label: string;
}

/** Why a reference could not be shown. `hint` is addressed to the user. */
export interface Missing3D {
  reason: "no-reference" | "unconfigured" | "not-addressable";
  hint: string;
}

export type Resolved3D = Ref3D | Missing3D;

export function isRef3D(r: Resolved3D): r is Ref3D {
  return (r as Ref3D).url !== undefined;
}

const SCENE_KEYS = ["heriverse_scene", "scene_id", "scene", "sid"];
const URL_KEYS = ["scene_url", "viewer_url", "url", "locator"];

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isHttp(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

/** A path ATON can resolve inside its own collection (`PATH_COLLECTION + p`):
 *  relative, not a local absolute path, not a Windows drive. */
function isCollectionPath(s: string): boolean {
  return !!s && !/^([a-z]+:)?\//i.test(s) && !/^[a-z]:\\/i.test(s);
}

function fileLabel(url: string): string {
  const clean = url.split(/[?#]/)[0];
  return clean.split(/[\\/]/).filter(Boolean).pop() || url;
}

/** Turn one locator into a viewable URL, or say why not. */
function fromLocator(locator: string): Resolved3D {
  const kind = resourceTypeOfLocator(locator);
  const is3d = is3dResourceType(kind);
  if (isHttp(locator) && !is3d) {
    // Already a page: a published Heriverse/ATON scene, a viewer of any kind.
    // Show it as it is — no server of ours needs to be configured for that.
    return { url: locator, via: "viewer-page", label: new URL(locator).host };
  }
  if (is3d && (isHttp(locator) || isCollectionPath(locator))) {
    const url = atonPreviewUrl(locator);
    if (!url)
      return {
        reason: "unconfigured",
        hint:
          "la risorsa 3D c'è, ma manca il server ATON: impostalo in " +
          "Impostazioni → Visualizzatore 3D.",
      };
    return { url, via: "aton-preview", label: fileLabel(locator) };
  }
  if (is3d)
    return {
      reason: "not-addressable",
      hint:
        `«${fileLabel(locator)}» è un file locale: un visualizzatore web non ` +
        "può leggerlo dal disco. Portalo nello store condiviso (Risorse → " +
        "Promote to MinIO) o pubblicalo nella collection ATON.",
    };
  if (locator.startsWith("s3://"))
    return {
      reason: "not-addressable",
      hint:
        "la risorsa vive in MinIO: serve un URL firmato per mostrarla in un " +
        "visualizzatore (Risorse → anteprima).",
    };
  return {
    reason: "no-reference",
    hint: "questo nodo non porta né una scena né una risorsa 3D.",
  };
}

/**
 * Find the 3D behind a node.
 *
 * The node itself may carry the reference (an epoch with a published scene id, a
 * Resource with a glb locator). If it does not, we follow its outgoing edges one
 * step: an epoch, an RM or a US that points at a Resource is the normal EM shape
 * — the geometry is a LinkNode, and everything else references it. One step only,
 * and the first hit wins: a chapter is not the place for a search.
 */
export function resolve3d(node: EmNode, doc: EmDocument | null): Resolved3D {
  const direct = fromNode(node);
  if (isRef3D(direct)) return direct;

  const nodes = new Map((doc?.graph?.nodes ?? []).map((n) => [n.id, n]));
  // has_linked_resource first (the datamodel's own "this is my file" edge), then
  // any other outgoing edge — an unusual graph still gets its scene shown.
  const edges = (doc?.graph?.edges ?? []).filter((e) => e.source === node.id);
  edges.sort((a, b) =>
    Number(b.edge_type === "has_linked_resource") -
    Number(a.edge_type === "has_linked_resource"));
  let best: Missing3D = direct;
  for (const e of edges) {
    const target = nodes.get(e.target);
    if (!target) continue;
    const hit = fromNode(target);
    if (isRef3D(hit)) return hit;
    // Keep the most informative failure: "promote this file" beats "nothing here".
    if (best.reason === "no-reference" && hit.reason !== "no-reference") best = hit;
  }
  return best;
}

function fromNode(node: EmNode): Resolved3D {
  const data = (node.data ?? {}) as Record<string, unknown>;
  for (const key of SCENE_KEYS) {
    const sid = str(data[key]);
    if (!sid) continue;
    const url = heriverseSceneUrl(sid);
    if (!url)
      return {
        reason: "unconfigured",
        hint:
          `la scena «${sid}» è dichiarata nel grafo, ma manca il server ATON: ` +
          "impostalo in Impostazioni → Visualizzatore 3D.",
      };
    return { url, via: "heriverse-scene", label: sid };
  }
  for (const key of URL_KEYS) {
    const locator = str(data[key]);
    if (!locator) continue;
    const hit = fromLocator(locator);
    if (isRef3D(hit) || hit.reason !== "no-reference") return hit;
  }
  return {
    reason: "no-reference",
    hint: "questo nodo non porta né una scena né una risorsa 3D.",
  };
}

// ── the embed ────────────────────────────────────────────────────────────────

/** Which embeds have been loaded this session, by caller-supplied key. The
 *  narrative view rebuilds its DOM on every change; without this, saving a
 *  paragraph would restart every scene on the page. */
const loadedKeys = new Set<string>();

const VIA_LABEL: Record<Ref3D["via"], string> = {
  "heriverse-scene": "scena Heriverse",
  "aton-preview": "ATON · anteprima",
  "viewer-page": "visualizzatore esterno",
};

export interface Embed3DOptions {
  /** Stable identity for the block/row, so "already loaded" survives a rebuild. */
  key: string;
  /** Height of the frame in px (a Shelf card wants less than a chapter). */
  height?: number;
  /** Load as soon as it is on screen (a narrative block) rather than on click
   *  (a list of a hundred Shelf rows). */
  auto?: boolean;
  /** Load NOW — the user has just asked for this one explicitly. */
  immediate?: boolean;
  /** Extra caption under the frame. */
  note?: string;
}

/**
 * The frame, with its poster and its controls.
 *
 * Before it loads there is a poster stating what will be shown and from where —
 * an honest "not loaded yet" rather than a spinner over nothing. `auto` mounts
 * it as soon as it scrolls into view; otherwise the reader presses play, which
 * is what a long list wants.
 */
export function create3dEmbed(ref: Ref3D, opts: Embed3DOptions): HTMLElement {
  const box = document.createElement("div");
  box.className = "em3d";
  if (opts.height) box.style.setProperty("--em3d-h", `${opts.height}px`);

  const stage = document.createElement("div");
  stage.className = "em3d-stage";
  box.appendChild(stage);

  const bar = document.createElement("div");
  bar.className = "em3d-bar";
  const via = document.createElement("span");
  via.className = "em3d-via";
  via.textContent = `${VIA_LABEL[ref.via]} · ${ref.label}`;
  via.title = ref.url;
  bar.appendChild(via);
  const open = document.createElement("a");
  open.className = "em3d-open";
  open.href = ref.url;
  open.target = "_blank";
  open.rel = "noreferrer noopener";
  open.textContent = "apri a schermo intero ↗";
  bar.appendChild(open);
  const unload = document.createElement("button");
  unload.type = "button";
  unload.className = "em3d-unload hidden";
  unload.textContent = "scarica";
  unload.title = "Libera la memoria del 3D; ricarica quando serve.";
  bar.appendChild(unload);
  box.appendChild(bar);
  if (opts.note) {
    const note = document.createElement("div");
    note.className = "em3d-note";
    note.textContent = opts.note;
    box.appendChild(note);
  }

  function poster(): void {
    stage.textContent = "";
    const p = document.createElement("button");
    p.type = "button";
    p.className = "em3d-poster";
    const play = document.createElement("span");
    play.className = "em3d-play";
    play.textContent = "▶";
    p.appendChild(play);
    const label = document.createElement("span");
    label.className = "em3d-poster-label";
    label.textContent = `Carica il 3D — ${VIA_LABEL[ref.via]}`;
    p.appendChild(label);
    p.title =
      "Il 3D non è ancora caricato: si scarica solo quando serve, per non " +
      "aprire un visualizzatore intero per ogni riferimento.";
    p.addEventListener("click", (e) => {
      e.stopPropagation();
      mount();
    });
    stage.appendChild(p);
    unload.classList.add("hidden");
  }

  function mount(): void {
    loadedKeys.add(opts.key);
    stage.textContent = "";
    const frame = document.createElement("iframe");
    frame.className = "em3d-frame";
    frame.src = ref.url;
    frame.title = `3D — ${ref.label}`;
    // No loading="lazy" here either: this iframe is created *because* the block
    // is visible, and the browser's own lazy heuristic needs a painted viewport —
    // in a background tab it would simply never load.
    frame.referrerPolicy = "no-referrer-when-downgrade";
    // The framed app is somebody else's: it gets scripts and its own origin (it
    // needs both to run WebGL and reach its own services) and nothing that would
    // let it act on this document — no top-level navigation, no downloads.
    frame.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-pointer-lock " +
        "allow-popups allow-popups-to-escape-sandbox",
    );
    frame.setAttribute("allow", "xr-spatial-tracking; fullscreen; gyroscope; accelerometer");
    frame.setAttribute("allowfullscreen", "true");
    stage.appendChild(frame);
    unload.classList.remove("hidden");
    // A cross-origin frame never tells us whether it rendered, so the escape
    // hatch is always present rather than conditional on an error we cannot see:
    // "apri a schermo intero" works even when the frame stays black.
  }

  unload.addEventListener("click", (e) => {
    e.stopPropagation();
    loadedKeys.delete(opts.key);
    poster();
  });

  if (loadedKeys.has(opts.key) || opts.immediate) {
    mount();
  } else {
    poster();
    if (opts.auto) onFirstVisible(box, () => mount());
  }
  return box;
}

/** True when a 3D viewer address is configured at all — lets a caller explain
 *  the ONE setting that is missing instead of failing per row. */
export function has3dViewer(): boolean {
  return !!atonBase();
}
