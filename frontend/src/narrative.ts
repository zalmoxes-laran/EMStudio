/**
 * N2 — the narrative view: the graph read as a story.
 *
 * A NarrativeNode carries chapters; each chapter carries prose the author wrote
 * and embeds pointing at resources the graph already holds. This module renders
 * that, read-only (authoring is N3).
 *
 * The one rule that shapes everything here: **an embed is a reference**. Every
 * `ref` is resolved against the CURRENT node index at render time — nothing is
 * cached, nothing is copied. Rename a US and the story says the new name; remove
 * a source and the story says, in as many words, that the reference no longer
 * resolves. A viewer that quietly rendered stale text would undo the reason for
 * authoring on a graph in the first place.
 *
 * Colours and labels come from the vendored datamodel (`nodeStyle`,
 * `typeDescription`) — the same functions the canvas renderer uses. There is one
 * palette in this app and this is not a second one.
 */

import { create3dEmbed, isRef3D, resolve3d } from "./embed3d";
import { geoOf, georeferenceScene, reprojectPoint } from "./geo";
import type { GeoRef } from "./geo";
import { onFirstVisible } from "./lazy";
import { blockStatus, bylineOf, narrativeAuthors } from "./narrative-authorship";
import type { AuthorRef, BlockStatus } from "./narrative-authorship";
import { canonicalViewType, VIEW_TYPES } from "./narrative-edit";
import {
  certaintyLadder, documentEmbed, existenceCertainty, isRmDoc, matrixEmbed,
  paradataEmbed, rmDocEmbed, tableEmbed, timelineEmbed, unSceneEmbed,
} from "./narrative-embeds";
import { iiifBase } from "./settings";
import { createOsmMap } from "./osm-map";
import type { OsmView } from "./osm-map";
import { nodeStyle } from "./palette";
import { narrativeViewTypeDescription, typeDescription } from "./rules";
import type { EmDocument, EmNode } from "./types";

/** A block as it is serialised by s3Dgraphy (`narrative_node.Block`). */
interface NarrativeBlock {
  block_type: "prose" | "embed";
  text?: string;
  ref?: string;
  view_type?: string;
  options?: Record<string, unknown>;
  // N4/N6 — who wrote it, what they were asked, who vouches for it.
  authored_by?: string;
  prompt_ref?: string;
  validated_by?: string;
  ai_generated?: boolean;
}

interface NarrativeChapter {
  title: string;
  anchor?: string;
  canonical?: boolean;
  blocks?: NarrativeBlock[];
  authored_by?: string;
}

export interface Narrative {
  id: string;
  name: string;
  description?: string;
  lang?: string;
  templateId?: string;
  chapters: NarrativeChapter[];
}

/** The view types this build actually draws.
 *
 *  DP-79 P1 closed the gap: all ELEVEN declared types now have a branch in
 *  `renderEmbed`, so this set and `narrativeViewTypes()` finally agree. It stays
 *  as a separate list on purpose — `check-narrative.mjs` compares the two, so a
 *  view type added to the datamodel without a renderer fails a check instead of
 *  silently becoming a placeholder in somebody's story. */
const RENDERED_VIEW_TYPES = new Set([
  "source", "document", "us", "map", "scene3d", "rm",
  "matrix", "timeline", "table", "paradata", "un_scene",
]);

export function narrativesIn(doc: EmDocument | null): Narrative[] {
  if (!doc?.graph?.nodes) return [];
  return doc.graph.nodes
    .filter((n) => n.node_type === "narrative")
    .map((n) => {
      const data = (n.data ?? {}) as Record<string, unknown>;
      return {
        id: n.id,
        name: String(n.name || n.id),
        description: n.description,
        lang: typeof data.lang === "string" ? data.lang : undefined,
        templateId:
          typeof data.template_id === "string" ? data.template_id : undefined,
        chapters: (data.chapters as NarrativeChapter[]) ?? [],
      };
    });
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Minimal markdown: paragraphs, **bold**, *italic*, `code`. Enough for prose
 *  written in a text box, and small enough not to need a dependency or a
 *  sanitiser — the input is escaped first, so no markup can come through. */
function renderProse(text: string): HTMLElement {
  const wrap = el("div", "nv-prose");
  for (const para of text.split(/\n{2,}/)) {
    if (!para.trim()) continue;
    const p = el("p");
    const escaped = para
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    p.innerHTML = escaped
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");
    // Placeholder prose from the scaffolder reads as unwritten, and should
    // look it: the author needs to see at a glance what is still to do.
    if (/^\s*\[da scrivere:/.test(para)) p.classList.add("nv-todo");
    wrap.appendChild(p);
  }
  return wrap;
}

function unresolved(ref: string): HTMLElement {
  const box = el("div", "nv-embed nv-unresolved");
  box.appendChild(el("div", "nv-embed-kind", "reference"));
  box.appendChild(
    el("div", "nv-embed-title", `unresolved reference: ${ref}`),
  );
  box.appendChild(
    el(
      "div",
      "nv-embed-note",
      "the graph has no node with this id — it may have been removed, or the " +
        "narrative may come from another graph",
    ),
  );
  return box;
}

function sourceCard(node: EmNode, kind: string,
                    doc?: EmDocument | null): HTMLElement {
  const box = el("div", "nv-embed nv-source");
  box.appendChild(el("div", "nv-embed-kind", kind));
  box.appendChild(el("div", "nv-embed-title", String(node.name || node.id)));
  if (node.description)
    box.appendChild(el("div", "nv-embed-note", node.description));
  // DP-79 P1 · the picture, when there is one and a IIIF service to serve it.
  // A size request on the image that is already in the store — no second copy.
  const figure = documentEmbed(node, iiifBase());
  if (figure) box.appendChild(figure);
  void doc;
  const data = (node.data ?? {}) as Record<string, unknown>;
  const url = typeof data.url === "string" ? data.url : undefined;
  if (url) {
    const a = document.createElement("a");
    a.className = "nv-embed-link";
    a.href = url;
    a.target = "_blank";
    a.rel = "noreferrer noopener";
    a.textContent = url;
    box.appendChild(a);
  }
  return box;
}

function usCard(node: EmNode, doc?: EmDocument | null): HTMLElement {
  // Colour and label from the datamodel, via the same helpers the canvas uses.
  const style = nodeStyle(node.node_type);
  const box = el("div", "nv-embed nv-us");
  box.style.borderLeftColor = style.border;
  const head = el("div", "nv-embed-kind");
  const swatch = el("span", "nv-swatch");
  swatch.style.background = style.fill;
  swatch.style.borderColor = style.border;
  head.appendChild(swatch);
  head.appendChild(document.createTextNode(node.node_type));
  box.appendChild(head);
  box.appendChild(el("div", "nv-embed-title", String(node.name || node.id)));
  if (node.description)
    box.appendChild(el("div", "nv-embed-note", node.description));
  // DP-79 P1 · the qualia the design asks for: how sure we are it EXISTED.
  // Drawn as the whole ladder with one rung lit, because "asserted" alone does
  // not tell a reader it is the third of four.
  const certainty = existenceCertainty(node, doc ?? null);
  if (certainty) box.appendChild(certaintyLadder(certainty));
  const description = typeDescription(node.node_type);
  if (description) box.title = description;
  return box;
}

// Where each map embed's camera was left. The narrative view rebuilds its whole
// DOM on every change (that is how N3 gets undo for free), so without this a
// keystroke in the paragraph above would snap the reader's map back to its
// starting frame. Keyed per block, module-level, never persisted: it is where
// you were looking, not part of the document.
const mapViews = new Map<string, OsmView>();

/**
 * The `map` view type: a real OSM map with the position on it.
 *
 * Tiles are only fetched once the block is on screen — a story with ten
 * positions must not open ten map sessions the moment it is opened — and the
 * card underneath keeps stating the numbers, because the exact coordinate and
 * its frame are the data; the map is the reading of it.
 */
function mapCard(node: EmNode, options: Record<string, unknown>,
                 key: string, doc: EmDocument | null): HTMLElement {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const box = el("div", "nv-embed nv-map");
  box.appendChild(el("div", "nv-embed-kind", "map"));

  // NARRWS1 / GEO1 · a map embed pointing at the GRAPH-SELF node shows the SITE
  // POSITION (symbolic lon/lat, graph-scope) — distinct from the shift. This is
  // the site mini-map; if the graph is not positioned yet, say so and point to
  // the picker (Canvas inspector) instead of drawing an empty/0,0 map.
  if (node.node_type === "graph") {
    const sp = (data.site_position ?? null) as
      | { lon?: unknown; lat?: unknown; crs?: unknown }
      | null;
    const lon = sp ? Number(sp.lon) : NaN;
    const lat = sp ? Number(sp.lat) : NaN;
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      drawMap(box, node, options, key,
        { ok: true, lat, lon, epsg: 4326, rotation: 0 }, doc);
    } else {
      box.appendChild(el("div", "nv-embed-title", "sito non posizionato"));
      box.appendChild(el("div", "nv-embed-note",
        "posiziona il sito col picker nel pannello Canvas (Ispettore) — la " +
        "mini-mappa lo mostrerà qui (posizione simbolica, non lo shift 3D)."));
    }
    return box;
  }

  const geo = geoOf(data);

  if (!geo.ok) {
    if (geo.reason === "needs-reprojection") {
      // A projected frame — a UTM zone, a national grid: the normal case on an
      // excavation. PROJ is on the Python side, so the bridge is asked (G1), and
      // only once the block is on screen: a story with ten positions should not
      // fire ten requests on open.
      const { anchor } = geo;
      const pending = el("div", "nv-embed-note",
        `EPSG:${anchor.epsg} — riproiezione in corso…`);
      box.appendChild(
        el("div", "nv-embed-title",
          `${anchor.x.toFixed(3)}, ${anchor.y.toFixed(3)} (EPSG:${anchor.epsg})`),
      );
      box.appendChild(pending);
      onFirstVisible(box, () => {
        void (async () => {
          const out = await reprojectPoint(anchor.x, anchor.y, anchor.epsg);
          if ("error" in out) {
            // Never a guess. The numbers and the frame stay on screen, and the
            // note says exactly what is missing.
            pending.textContent =
              `Le coordinate sono in EPSG:${anchor.epsg} e la riproiezione non ` +
              `è disponibile (${out.error}). La posizione qui sopra resta ` +
              `esatta: il bridge la porta sulla mappa quando c'è pyproj ` +
              `(extra [geo]).`;
            pending.classList.add("nv-geo-unavailable");
            return;
          }
          // Same widget, same caption, same memory — only the coordinates came
          // from somewhere else.
          box.textContent = "";
          box.appendChild(el("div", "nv-embed-kind", "map"));
          drawMap(box, node, options, key, {
            ok: true, lat: out.lat, lon: out.lon, epsg: anchor.epsg,
            rotation: anchor.rotation,
            note: `riproiettato da EPSG:${anchor.epsg} (pyproj)`,
          }, doc);
        })();
      });
      return box;
    }
    box.appendChild(
      el("div", "nv-embed-title", "il nodo di posizione non porta coordinate"),
    );
    box.appendChild(
      el("div", "nv-embed-note",
        "un GeoPositionNode con shift_x / shift_y (o lat / lon) mostra qui la " +
        "mappa e il punto."),
    );
    return box;
  }

  drawMap(box, node, options, key, geo, doc);
  return box;
}

/** The map widget plus its caption, for a reference that is already in degrees.
 *  Split out of `mapCard` because a reprojected reference arrives later and must
 *  land in exactly the same UI — one place that draws a map, not two. */
function drawMap(box: HTMLElement, node: EmNode,
                 options: Record<string, unknown>, key: string,
                 geo: Extract<GeoRef, { ok: true }>,
                 doc: EmDocument | null): void {
  const remembered = mapViews.get(key);
  const zoom = remembered?.zoom ?? Number(options.zoom ?? 16);
  const map = createOsmMap({
    lat: geo.lat,
    lon: geo.lon,
    zoom,
    // The pan is restored too, not just the zoom: re-centring on the marker
    // after every keystroke would undo the reader's look around.
    center: remembered ? { lat: remembered.lat, lon: remembered.lon } : undefined,
    markerLabel: String(node.name || node.id),
    onViewChange: (v) => mapViews.set(key, v),
  });
  box.appendChild(map.el);
  const caption = el("div", "nv-map-caption");
  onFirstVisible(map.el, () => {
    map.activate();
    // G3 — pose the SCENE, not just the point: the graph's own spatial proxies
    // give a local extent, the anchor gives the azimuth and the origin, and the
    // bridge returns the footprint already in degrees. Asked for only once the
    // map is on screen, and silent when the graph has no geometry: most graphs
    // do not, and a footprint invented for them would be a fabrication drawn at
    // metre precision.
    void (async () => {
      if (!doc) return;
      const placed = await georeferenceScene(doc);
      // `null` = the graph has no geometry to place, which is the common case and
      // says nothing worth saying. An ERROR is different: the graph HAS geometry
      // and something about the anchor prevents placing it — most often an anchor
      // in degrees, which cannot carry a metric footprint. That, the reader
      // should see, because it is fixable.
      if (!placed) return;
      if ("error" in placed) {
        const why = el("span", "nv-embed-note nv-geo-unavailable",
          `impronta non disponibile: ${placed.error}`);
        caption.appendChild(why);
        return;
      }
      map.setFootprint(placed.corners);
      // The marker moves onto the CENTROID: the shift is the anchor, and it may
      // legitimately sit hundreds of metres from the monument.
      map.setMarker(placed.centroid[1], placed.centroid[0]);
      const size = el("span", "nv-embed-note",
        `impronta ${placed.width.toFixed(1)} × ${placed.height.toFixed(1)} m` +
        (placed.rotation ? `, azimut ${placed.rotation}°` : ", nord in alto"));
      size.title =
        "Impronta della scena sulla mappa: il rettangolo dell'estensione locale " +
        "(dai proxy spaziali del grafo) ruotato per l'azimut, spostato " +
        "sull'origine e riproiettato. Il puntino è sul centroide, non sullo " +
        "shift — che è l'ancora, e può stare lontano dal monumento.";
      caption.appendChild(size);
    })();
  });

  caption.appendChild(
    el("span", "nv-map-coords",
      `${geo.lat.toFixed(6)}, ${geo.lon.toFixed(6)}`),
  );
  caption.appendChild(
    el("span", "nv-embed-note", geo.note ?? `EPSG:${geo.epsg}`),
  );
  const a = document.createElement("a");
  a.className = "nv-embed-link";
  a.href =
    `https://www.openstreetmap.org/?mlat=${geo.lat}&mlon=${geo.lon}` +
    `#map=${Math.round(zoom)}/${geo.lat}/${geo.lon}`;
  a.target = "_blank";
  a.rel = "noreferrer noopener";
  a.textContent = "apri in OpenStreetMap ↗";
  a.addEventListener("click", (e) => e.stopPropagation());
  caption.appendChild(a);
  // The azimuth is part of the anchor: a scene rotated 27° from north is a
  // different statement about the ground than one that is not, and the reader of
  // a georeferenced narrative should be able to see which they are looking at.
  if (geo.rotation)
    caption.appendChild(
      el("span", "nv-embed-note", `azimut ${geo.rotation}°`));
  box.appendChild(caption);
}

/**
 * The `scene3d` and `rm` view types: the 3D, in the chapter.
 *
 * One card for both, because the difference is what the embed POINTS AT, not how
 * it is shown: a scene is the graph's published scene (or an RM standing for an
 * epoch), an `rm` is one representation model. `resolve3d` walks from either to
 * the Resource that holds the geometry, and the frame is ATON's — Heriverse for a
 * published scene, ATON's preview app for a single model.
 *
 * When there is nothing to show, the card says which of the gaps it is: no
 * reference in the graph, no server configured, or a file no web viewer can read.
 */
function scene3dCard(node: EmNode, doc: EmDocument | null,
                     key: string, kind = "scene3d"): HTMLElement {
  const ref = resolve3d(node, doc);
  const box = el("div", "nv-embed nv-3d");
  box.appendChild(el("div", "nv-embed-kind", kind));
  box.appendChild(el("div", "nv-embed-title", String(node.name || node.id)));
  const what = narrativeViewTypeDescription(kind);
  if (what) box.title = what;
  if (!isRef3D(ref)) {
    box.classList.add("nv-pending");
    box.appendChild(el("div", "nv-embed-note", ref.hint));
    return box;
  }
  // An RM in a list of chapters is a smaller thing than the site's scene, and a
  // reader scrolling past six of them should not meet six full-height stages.
  box.appendChild(create3dEmbed(ref, {
    key, auto: true, height: kind === "rm" ? 300 : 380,
  }));
  return box;
}

function notYetRendered(viewType: string, node: EmNode | null,
                        ref: string): HTMLElement {
  const box = el("div", "nv-embed nv-pending");
  box.appendChild(el("div", "nv-embed-kind", viewType));
  box.appendChild(
    el("div", "nv-embed-title", node ? String(node.name || node.id) : ref),
  );
  box.appendChild(
    el("div", "nv-embed-note",
      `the “${viewType}” view is not rendered yet — the reference is valid and ` +
      `will show as soon as it is`),
  );
  return box;
}

function renderEmbed(
  block: NarrativeBlock,
  index: Map<string, EmNode>,
  doc: EmDocument | null,
  /** Stable identity of this block — `narrative:chapter:block:ref`. Lets an
   *  embed with live state (a map's camera, a loaded 3D frame) survive the
   *  view's rebuild without being written into the document. */
  key: string,
  onReveal?: (nodeId: string) => void,
): HTMLElement {
  const ref = block.ref ?? "";
  const node = index.get(ref) ?? null;
  // Read-tolerant (G1): a narrative saved with `epoch3d` renders as `scene3d`.
  // Applied here rather than at load so nothing rewrites the document behind the
  // author's back — the file is upgraded when they next save it, not on opening.
  const viewType = canonicalViewType(block.view_type);
  let box: HTMLElement;
  if (!node) {
    box = unresolved(ref);
  } else if (viewType === "source" || viewType === "document") {
    box = sourceCard(node, viewType, doc);
  } else if (viewType === "us") {
    box = usCard(node, doc);
  } else if (viewType === "matrix") {
    box = matrixEmbed(node, doc);
  } else if (viewType === "timeline") {
    box = timelineEmbed(node, doc);
  } else if (viewType === "table") {
    box = tableEmbed(node, doc, block.options ?? {});
  } else if (viewType === "paradata") {
    box = paradataEmbed(node, doc);
  } else if (viewType === "un_scene") {
    box = unSceneEmbed(node, doc);
  } else if (viewType === "map") {
    box = mapCard(node, block.options ?? {}, key, doc);
  } else if (viewType === "rm" && isRmDoc(node)) {
    // DP-79 P3 · the domain correction. RM and RMSF are 3D — one way this app
    // shows 3D, and it is the stage below. An **RMDoc** is the other family: a
    // 2D document that had to be PLACED, so its embed is the document (with its
    // IIIF picture) plus what the placement is worth. Routing both through the
    // 3D stage showed an empty viewer for a photograph, which is the wrong
    // answer twice: nothing to see, and a claim that there was.
    box = rmDocEmbed(node, doc, iiifBase());
  } else if (viewType === "scene3d" || viewType === "rm") {
    // `rm` renders through the same ATON embed (G2): a representation model IS a
    // 3D asset, and there is one way this app shows 3D.
    box = scene3dCard(node, doc, key, viewType);
  } else {
    box = notYetRendered(viewType || "embed", node, ref);
  }
  if (node && onReveal) {
    const reveal = () => onReveal(node.id);
    // An embed you can DO something in cannot also be one big button: dragging
    // a map or orbiting a scene would jump to the canvas and close the story.
    // Those get an explicit way in instead — same gesture, stated.
    if (viewType === "map" || viewType === "scene3d"
        || viewType === "rm") {
      const go = el("button", "nv-goto", "vai al nodo ↗") as HTMLButtonElement;
      go.title =
        `Seleziona «${String(node.name || node.id)}» sul canvas e chiudi la ` +
        "narrativa.";
      go.addEventListener("click", (e) => {
        e.stopPropagation();
        reveal();
      });
      box.appendChild(go);
    } else {
      box.classList.add("nv-clickable");
      box.tabIndex = 0;
      box.setAttribute("role", "button");
      box.addEventListener("click", reveal);
      box.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          reveal();
        }
      });
    }
  }
  return box;
}

// ── provenance of a paragraph (N6) ─────────────────────────────────
//
// The badge is not decoration. A reader of an archaeological narrative has to
// be able to tell, without asking, whether the sentence in front of them was
// written by a person, produced by a model and left unchecked, or produced by a
// model and signed off by somebody who can be asked about it.
//
// Colours come from the vendored visual rules — the AI badge takes the AUTH_AI
// node style, the endorsement badge takes AUTH — so the story and the canvas
// say "author" in the same colour. Nothing here is a second palette.

const STATUS_LABEL: Record<BlockStatus, string> = {
  human: "",                     // a person wrote it; nothing to announce
  ai_draft: "bozza AI",
  ai_endorsed: "avallata",
};

/**
 * The strip under a generated paragraph: what wrote it, what it was asked, who
 * (if anyone) has vouched for it, and the gesture to vouch.
 *
 * `onReveal` makes the prompt reachable in ONE click, exactly like any other
 * source embed — "how do I know this" has to hold for "how did the machine come
 * to write it" too, or the transparency is decorative.
 */
function provenanceStrip(
  block: NarrativeBlock,
  index: Map<string, EmNode>,
  onReveal?: (nodeId: string) => void,
  endorse?: () => void,
  retract?: () => void,
  signer?: AuthorRef | null,
): HTMLElement | null {
  const status = blockStatus(block);
  if (status === "human") return null;
  const ai = nodeStyle("author_ai");
  const human = nodeStyle("author");
  const strip = el("div", "nv-prov");

  const badge = el("span", "nv-prov-badge", STATUS_LABEL[status]);
  const style = status === "ai_endorsed" ? human : ai;
  badge.style.background = style.fill;
  badge.style.borderColor = style.border;
  badge.style.color = style.textColor;
  strip.appendChild(badge);

  const model = index.get(block.authored_by ?? "");
  if (block.authored_by) {
    const who = el("span", "nv-prov-who",
      model ? String(model.name || model.id) : block.authored_by);
    who.title = "Il modello che ha scritto questo paragrafo";
    strip.appendChild(who);
  }
  const opts = block.options ?? {};
  for (const key of ["model_version", "generated_at"]) {
    const v = opts[key];
    if (typeof v === "string" && v) {
      const chip = el("span", "nv-prov-dim", v);
      chip.title = key === "generated_at"
        ? "Quando è stata generata"
        : "Versione del modello";
      strip.appendChild(chip);
    }
  }

  if (block.prompt_ref) {
    const prompt = index.get(block.prompt_ref);
    const link = el("button", "nv-prov-link", "prompt") as HTMLButtonElement;
    link.title = prompt?.description
      ? `Cosa è stato chiesto:\n\n${prompt.description}`
      : `La fonte-prompt «${block.prompt_ref}» non è in questo grafo`;
    if (!prompt) link.classList.add("nv-prov-missing");
    link.addEventListener("click", (e) => {
      e.stopPropagation();
      if (prompt && onReveal) onReveal(prompt.id);
    });
    link.disabled = !prompt || !onReveal;
    strip.appendChild(link);
  } else {
    const none = el("span", "nv-prov-dim nv-prov-missing", "nessun prompt");
    none.title =
      "Questa bozza non registra cosa è stato chiesto al modello: il «come lo " +
      "so» resta incompleto.";
    strip.appendChild(none);
  }

  if (status === "ai_endorsed") {
    const by = index.get(block.validated_by ?? "");
    const sig = el("span", "nv-prov-signed",
      `✓ ${by ? String(by.name || by.id) : block.validated_by}`);
    sig.title = "Chi ha messo il proprio nome su questo testo";
    strip.appendChild(sig);
    if (retract) {
      const b = el("button", "nv-mini", "ritira") as HTMLButtonElement;
      b.title = "Ritira l'avallo: il paragrafo torna a leggersi come bozza.";
      b.addEventListener("click", (e) => { e.stopPropagation(); retract(); });
      strip.appendChild(b);
    }
  } else if (endorse) {
    // Never disabled for lack of a signer. A disabled button with an
    // explanation of where the missing control lives makes the user hunt; this
    // one always acts — it signs, or it brings the picker to them.
    const b = el("button", "nv-endorse", "Valida") as HTMLButtonElement;
    b.title = signer
      ? `Metti il nome di ${signer.label} su questo paragrafo. ` +
        `Solo una persona può avallare: un modello che garantisce per un ` +
        `modello non è una validazione.`
      : "Scegli con quale nome firmi — premi e ti porto al selettore.";
    b.classList.toggle("nv-endorse-unsigned", !signer);
    b.addEventListener("click", (e) => { e.stopPropagation(); endorse(); });
    strip.appendChild(b);
  }
  return strip;
}

/**
 * Render the narratives of `doc` into `container`.
 *
 * `onReveal` — when given, an embed that resolves becomes a way into the graph:
 * the same select-and-centre gesture the Log tab uses.
 */
/** The authoring hooks (N3). Absent → the view is read-only, which is what N2
 *  was and what a published render should stay. */
export interface NarrativeEditor {
  narrativeId: string;
  addChapter(): void;
  renameChapter(index: number, title: string): void;
  moveChapter(index: number, delta: number): void;
  deleteChapter(index: number): void;
  toggleCanonical(index: number): void;
  setAnchor(index: number, anchor: string | null): void;
  addProse(chapter: number): void;
  setProse(chapter: number, block: number, text: string): void;
  addEmbed(chapter: number, ref: string, at?: number): void;
  setViewType(chapter: number, block: number, viewType: string): void;
  moveBlock(chapter: number, block: number, delta: number): void;
  deleteBlock(chapter: number, block: number): void;
  /** Lanes a chapter may be anchored to: epochs and activities. */
  lanes(): { id: string; label: string }[];
  // — NARR1 · scaffold-from-graph affordances (all optional: the editor works
  //   without them, they only add the "reintroduce epoch" + regenerate seam) —
  /** Top-level epochs not yet described by a chapter (the reintroduce chips). */
  undescribedEpochs?(): { id: string; name: string }[];
  /** Append a chapter anchored to `epochId` (default embed) — reintroduce. */
  addEpochChapter?(epochId: string): void;
  /** Seam: rebuild the draft from s3Dgraphy site_story via the bridge. */
  regenerateViaBridge?(): void;
  /** Whether the bridge regenerate is available (else the button is disabled). */
  canRegenerate?(): boolean;

  // — authorship, generation, endorsement (N6) —
  /** Everyone the graph knows as an author, models included. */
  authors(): AuthorRef[];
  /** Only people. A model may not sign — see `endorse`. */
  humanAuthors(): AuthorRef[];
  addAuthor(authorId: string): void;
  removeAuthor(authorId: string): void;
  setChapterAuthor(index: number, authorId: string | null): void;
  /** Who is signing, right now. One place says it; every Valida uses it. */
  signer(): AuthorRef | null;
  setSigner(authorId: string | null): void;
  endorse(chapter: number, block: number): void;
  /** Vouch for every unendorsed AI paragraph in one chapter, one act each. */
  endorseChapter(chapter: number): void;
  /** How many paragraphs `endorseChapter` would sign right now. */
  pendingIn(chapter: number): number;
  retract(chapter: number, block: number): void;
  /** True where a draft can be generated: the chapter narrates an ACTIVITY,
   *  which is where the actions — and so the story — are. */
  canGenerate(index: number): boolean;
  generate(index: number): void;
  /** A request is in flight for this chapter. */
  generating(index: number): boolean;
}

/**
 * CURRENT-ELEMENT · which chapter this window is working on.
 *
 * A separate parameter from the editor on purpose: choosing the chapter you are
 * looking at is NAVIGATION, not editing — it has to work while merely reading,
 * which is exactly when someone reaches for "insert a map here".
 */
export interface CurrentChapter {
  index(): number | null;
  set(index: number): void;
}

function authorChip(a: AuthorRef, ai: boolean): HTMLElement {
  const style = nodeStyle(ai ? "author_ai" : "author");
  const chip = el("span", "nv-author-chip", a.label);
  chip.style.background = style.fill;
  chip.style.borderColor = style.border;
  chip.style.color = style.textColor;
  return chip;
}

function chipRemove(a: AuthorRef, onClick: () => void): HTMLButtonElement {
  const x = el("button", "nv-chip-x", "✕") as HTMLButtonElement;
  x.title = `Togli ${a.label} dagli autori di questa narrativa`;
  x.addEventListener("click", onClick);
  return x;
}

/** A `<select>` over authors. Resets to its placeholder after a pick when the
 *  chosen value is an action rather than a state ("+ autore"). */
function authorSelect(options: AuthorRef[], selected: string | null,
                      placeholder: string, title: string,
                      onPick: (id: string | null) => void): HTMLSelectElement {
  const sel = document.createElement("select");
  sel.className = "nv-author-select";
  sel.title = title;
  const none = document.createElement("option");
  none.value = "";
  none.textContent = placeholder;
  none.selected = !selected;
  sel.appendChild(none);
  for (const a of options) {
    const o = document.createElement("option");
    o.value = a.id;
    o.textContent = a.ai ? `${a.label} (AI)` : a.label;
    o.selected = a.id === selected;
    sel.appendChild(o);
  }
  sel.disabled = options.length === 0;
  sel.addEventListener("change", () => onPick(sel.value || null));
  return sel;
}

function iconButton(label: string, title: string,
                    onClick: () => void): HTMLButtonElement {
  const b = el("button", "nv-mini", label) as HTMLButtonElement;
  b.title = title;
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export function renderNarrativeView(
  container: HTMLElement,
  doc: EmDocument | null,
  selectedId: string | null,
  onSelect: (id: string) => void,
  onReveal?: (nodeId: string) => void,
  editor?: NarrativeEditor,
  currentChapter?: CurrentChapter,
): void {
  container.textContent = "";
  const narratives = narrativesIn(doc);

  if (!narratives.length) {
    const empty = el("div", "nv-empty");
    empty.appendChild(
      el("p", undefined,
        doc ? "This document contains no narrative."
            : "No document loaded."),
    );
    if (doc)
      empty.appendChild(
        el("p", "nv-empty-hint",
          "A narrative is a NarrativeNode in the em.json: chapters over the " +
          "graph's lanes, with prose and embeds. The s3Dgraphy `site_story` " +
          "template generates a first draft from an existing graph."),
      );
    container.appendChild(empty);
    return;
  }

  const current =
    narratives.find((n) => n.id === selectedId) ?? narratives[0];

  if (narratives.length > 1) {
    const bar = el("div", "nv-picker");
    for (const n of narratives) {
      const b = el("button", "nv-picker-btn", n.name) as HTMLButtonElement;
      b.classList.toggle("active", n.id === current.id);
      b.addEventListener("click", () => onSelect(n.id));
      bar.appendChild(b);
    }
    container.appendChild(bar);
  }

  const head = el("header", "nv-head");
  head.appendChild(el("h1", "nv-title", current.name));
  const meta: string[] = [];
  if (current.lang) meta.push(current.lang);
  if (current.templateId) meta.push(`template: ${current.templateId}`);
  meta.push(`${current.chapters.length} chapters`);
  head.appendChild(el("div", "nv-meta", meta.join(" · ")));
  if (current.description)
    head.appendChild(el("p", "nv-lede", current.description));

  // The byline is TWO lines, and the split is the point (N8). People who can be
  // asked about a claim go first, as responsible; models follow as assistance.
  // One line listing them as equal co-authors would state something false.
  const { responsible, assisted } = bylineOf(doc, current.id, current.chapters);
  const declared = narrativeAuthors(doc, current.id);

  const byline = el("div", "nv-authors");
  byline.appendChild(el("span", "nv-authors-label", "a cura di"));
  if (!responsible.length)
    byline.appendChild(el("span", "nv-prov-dim nv-prov-missing",
      "nessuna persona responsabile"));
  for (const a of responsible) {
    const chip = authorChip(a, false);
    chip.title = declared.some((d) => d.id === a.id)
      ? "Autore umano: risponde di questo racconto"
      : "Ha avallato del testo generato — e quindi ne risponde";
    if (editor && declared.some((d) => d.id === a.id))
      chip.appendChild(chipRemove(a, () => editor.removeAuthor(a.id)));
    byline.appendChild(chip);
  }
  if (editor) {
    const add = authorSelect(
      editor.authors().filter(
        (a) => !a.ai && !responsible.some((x) => x.id === a.id)),
      null, "+ autore", "Aggiungi una persona fra gli autori di questa narrativa",
      (id) => { if (id) editor.addAuthor(id); });
    byline.appendChild(add);

    // "Signing as" lives once, at the top: an endorsement is the same act
    // whichever paragraph it lands on, and asking who you are on every click
    // would turn a signature into a form.
    const signing = el("span", "nv-signing");
    signing.appendChild(el("span", "nv-authors-label", "firmo come"));
    const humans = editor.humanAuthors();
    signing.appendChild(authorSelect(
      humans, editor.signer()?.id ?? null,
      humans.length ? "(nessuno)" : "(nessun autore umano nel grafo)",
      "Chi mette il proprio nome quando premi Valida. Solo persone: " +
      "un modello non può avallare.",
      (id) => editor.setSigner(id)));
    byline.appendChild(signing);
  }
  head.appendChild(byline);

  // «con l'assistenza di …» — declared, attributed, and subordinate. A model is
  // never a co-author here: nothing it wrote counts until a person endorses it.
  if (assisted.length) {
    const help = el("div", "nv-authors nv-assist");
    help.appendChild(el("span", "nv-authors-label", "con l'assistenza di"));
    for (const a of assisted) {
      const chip = authorChip(a, true);
      chip.title =
        "Modello che ha scritto del testo. Non può avallarlo: " +
        "un modello che garantisce per un modello non è una validazione.";
      if (editor && declared.some((d) => d.id === a.id))
        chip.appendChild(chipRemove(a, () => editor.removeAuthor(a.id)));
      help.appendChild(chip);
    }
    head.appendChild(help);
  }
  container.appendChild(head);

  const index = new Map((doc?.graph?.nodes ?? []).map((n) => [n.id, n]));

  current.chapters.forEach((chapter, ci) => {
    const section = el("section", "nv-chapter");
    // CURRENT-ELEMENT · clicking anywhere in a chapter makes it the window's
    // current one (the marker is a left accent rule, see `.nv-chapter.nv-current`).
    // Menus that say "the current chapter" then have something true to mean.
    if (currentChapter?.index() === ci) section.classList.add("nv-current");
    if (currentChapter)
      section.addEventListener("mousedown", () => currentChapter.set(ci));
    const h = el("div", "nv-chapter-head");
    h.appendChild(el("h2", "nv-chapter-title", chapter.title || "(untitled)"));
    if (chapter.canonical) {
      const badge = el("span", "nv-badge", "canonical");
      badge.title =
        "Settled by the author: regenerating the template leaves this chapter " +
        "untouched.";
      h.appendChild(badge);
    }
    if (chapter.authored_by && !editor) {
      const node = index.get(chapter.authored_by);
      const who = node ? String(node.name || node.id) : chapter.authored_by;
      const chip = el("span", "nv-author-chip nv-author-inline", who);
      const style = nodeStyle(node?.node_type ?? "author");
      chip.style.background = style.fill;
      chip.style.borderColor = style.border;
      chip.style.color = style.textColor;
      chip.title = "Chi firma questo capitolo";
      h.appendChild(chip);
    }
    if (chapter.anchor) {
      // The chapter usually takes its title FROM the lane, so echoing the lane's
      // name beside it just says the same word twice. Show the id in that case:
      // it is the part the reader cannot already see.
      const anchorNode = index.get(chapter.anchor);
      const laneName = anchorNode ? String(anchorNode.name || "") : "";
      const label = laneName && laneName !== chapter.title
        ? laneName
        : chapter.anchor;
      const chip = el("span", "nv-anchor", label);
      chip.title = laneName
        ? `This chapter narrates the lane “${laneName}” (${chapter.anchor})`
        : `This chapter narrates the lane “${chapter.anchor}”, which is not in this graph`;
      if (!anchorNode) chip.classList.add("nv-anchor-missing");
      h.appendChild(chip);
    }
    if (editor) {
      const tools = el("div", "nv-chapter-tools");
      // The chapter toolbar already carries an author select; without a label
      // the two reads as one, and the user looks for "firmo come" here.
      tools.appendChild(el("span", "nv-tool-label", "autore cap."));
      const canon = iconButton(
        chapter.canonical ? "★" : "☆",
        chapter.canonical
          ? "Settled: the template regeneration leaves this chapter alone. Click to un-settle."
          : "Mark as settled, so regenerating the template does not touch it.",
        () => editor.toggleCanonical(ci));
      tools.appendChild(canon);
      const laneSel = document.createElement("select");
      laneSel.className = "nv-lane-select";
      laneSel.title = "The lane this chapter narrates";
      const none = document.createElement("option");
      none.value = "";
      none.textContent = "(no lane)";
      none.selected = !chapter.anchor;
      laneSel.appendChild(none);
      for (const lane of editor.lanes()) {
        const o = document.createElement("option");
        o.value = lane.id;
        o.textContent = lane.label;
        o.selected = lane.id === chapter.anchor;
        laneSel.appendChild(o);
      }
      laneSel.addEventListener("change", () =>
        editor.setAnchor(ci, laneSel.value || null));
      tools.appendChild(laneSel);
      tools.appendChild(iconButton("▲", "Move chapter up",
        () => editor.moveChapter(ci, -1)));
      tools.appendChild(iconButton("▼", "Move chapter down",
        () => editor.moveChapter(ci, 1)));
      tools.appendChild(iconButton("✕", "Delete this chapter",
        () => editor.deleteChapter(ci)));
      tools.appendChild(authorSelect(
        editor.authors(), chapter.authored_by ?? null, "(nessun autore)",
        "Chi firma questo capitolo",
        (id) => editor.setChapterAuthor(ci, id)));
      // Generation is anchored to an ACTIVITY: that is where the actions are,
      // and a briefing built from anything else would be empty. The button is
      // simply absent elsewhere rather than present and disabled — a control
      // that can never apply is noise.
      if (editor.canGenerate(ci)) {
        const busy = editor.generating(ci);
        const gen = el("button", "nv-generate",
          busy ? "genero…" : "Genera bozza (AI)") as HTMLButtonElement;
        gen.disabled = busy;
        gen.title =
          "Manda al modello un briefing di QUESTA attività — le sue azioni in " +
          "ordine stratigrafico, le epoche e le evidenze già registrate — e " +
          "inserisce la prosa come bozza non avallata, attribuita al modello, " +
          "col prompt registrato come fonte. Nient'altro del grafo viene " +
          "inviato.";
        gen.addEventListener("click", (e) => {
          e.stopPropagation();
          editor.generate(ci);
        });
        tools.appendChild(gen);
      }
      // "Valida capitolo" states the count in its own label: an endorsement is
      // a signature, and a button that doesn't say how much it is signing
      // invites an absent-minded stamp.
      const pending = editor.pendingIn(ci);
      if (pending > 0) {
        const signer = editor.signer();
        const all = el("button", "nv-endorse nv-endorse-all",
          `Valida capitolo (${pending})`) as HTMLButtonElement;
        all.classList.toggle("nv-endorse-unsigned", !signer);
        all.title = signer
          ? `Metti il nome di ${signer.label} su ${pending} ` +
            `paragraf${pending === 1 ? "o" : "i"} di questo capitolo. ` +
            `Resta un atto per paragrafo: nel grafo si vedrà a quali frasi ` +
            `ha messo la firma, non solo che ha firmato il capitolo.`
          : "Scegli con quale nome firmi — premi e ti porto al selettore.";
        all.addEventListener("click", (e) => {
          e.stopPropagation();
          editor.endorseChapter(ci);
        });
        tools.appendChild(all);
      }
      h.appendChild(tools);

      const titleEl = h.querySelector(".nv-chapter-title") as HTMLElement;
      titleEl.contentEditable = "true";
      titleEl.spellcheck = false;
      titleEl.classList.add("nv-editable");
      titleEl.title = "Click to rename";
      titleEl.addEventListener("blur", () => {
        const next = (titleEl.textContent || "").trim();
        if (next && next !== chapter.title) editor.renameChapter(ci, next);
      });
      titleEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          titleEl.blur();
        }
      });
    }
    section.appendChild(h);

    const blocks = chapter.blocks ?? [];
    blocks.forEach((block, bi) => {
      let body = block.block_type === "prose"
        ? (editor ? editableProse(block.text ?? "", (t) =>
            editor.setProse(ci, bi, t))
          : renderProse(block.text ?? ""))
        : renderEmbed(block, index, doc,
            `${current.id}:${ci}:${bi}:${block.ref ?? ""}`, onReveal);
      // Provenance rides with the paragraph in BOTH modes: knowing a machine
      // wrote this is not an authoring convenience, it is what the reader needs.
      const strip = block.block_type === "prose"
        ? provenanceStrip(block, index, onReveal,
            editor ? () => editor.endorse(ci, bi) : undefined,
            editor ? () => editor.retract(ci, bi) : undefined,
            editor ? editor.signer() : null)
        : null;
      if (strip) {
        const wrap = el("div", `nv-prose-wrap nv-${blockStatus(block)}`);
        wrap.appendChild(body);
        wrap.appendChild(strip);
        body = wrap;
      }
      if (!editor) {
        section.appendChild(body);
        return;
      }
      const row = el("div", "nv-block-row");
      body.classList.add("nv-block-body");
      row.appendChild(body);
      const tools = el("div", "nv-block-tools");
      if (block.block_type === "embed") {
        const current = canonicalViewType(block.view_type);
        const sel = document.createElement("select");
        sel.className = "nv-viewtype";
        sel.title = "How this reference is shown";
        for (const vt of VIEW_TYPES) {
          const o = document.createElement("option");
          o.value = vt;
          o.textContent = vt;
          // The datamodel's own definition, so the author reads what a view type
          // means instead of inferring it from eleven one-word labels.
          const what = narrativeViewTypeDescription(vt);
          if (what) o.title = what;
          // Compared against the CANONICAL name: a block still holding the
          // retired `epoch3d` must show `scene3d` as its current selection, not
          // fall through and silently look like `matrix` (the first option).
          o.selected = vt === current;
          sel.appendChild(o);
        }
        sel.addEventListener("change", () =>
          editor.setViewType(ci, bi, sel.value));
        tools.appendChild(sel);
      }
      tools.appendChild(iconButton("▲", "Move up",
        () => editor.moveBlock(ci, bi, -1)));
      tools.appendChild(iconButton("▼", "Move down",
        () => editor.moveBlock(ci, bi, 1)));
      tools.appendChild(iconButton("✕", "Remove this block",
        () => editor.deleteBlock(ci, bi)));
      row.appendChild(tools);
      section.appendChild(row);
    });

    if (editor) {
      const add = el("div", "nv-add-row");
      add.appendChild(iconButton("+ prose", "Add a paragraph",
        () => editor.addProse(ci)));
      const hint = el("span", "nv-drop-hint",
        "…or drag a node from the Nodes tab into this chapter");
      add.appendChild(hint);
      section.appendChild(add);

      // Drag-to-embed. The drop target is the whole chapter, so the gesture is
      // "put this in that chapter" rather than a hunt for a 4-pixel line.
      section.addEventListener("dragover", (e) => {
        if (!e.dataTransfer?.types.includes("application/x-em-node-id")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        section.classList.add("nv-drop-over");
      });
      section.addEventListener("dragleave", () =>
        section.classList.remove("nv-drop-over"));
      section.addEventListener("drop", (e) => {
        section.classList.remove("nv-drop-over");
        const ref = e.dataTransfer?.getData("application/x-em-node-id");
        if (!ref) return;
        e.preventDefault();
        editor.addEmbed(ci, ref);
      });
    }
    container.appendChild(section);
  });

  if (editor) {
    const foot = el("div", "nv-chapter");
    foot.appendChild(iconButton("+ capitolo", "Add a chapter at the end",
      () => editor.addChapter()));
    // NARR1 · reintroduce an epoch you deleted (or never described): one chip per
    // top-level epoch without a chapter. Deleting a chapter (the ✕ above) is the
    // "togli"; these chips are the "reintroduci".
    const undescribed = editor.undescribedEpochs?.() ?? [];
    if (undescribed.length) {
      const bar = el("div", "nv-undescribed");
      bar.appendChild(el("span", "nv-tool-label", "epoche non descritte:"));
      for (const ep of undescribed)
        bar.appendChild(iconButton(`+ ${ep.name}`,
          `Add a chapter for the epoch “${ep.name}”`,
          () => editor.addEpochChapter?.(ep.id)));
      foot.appendChild(bar);
    }
    // Seam · "regenerate the full draft" via the rich s3Dgraphy site_story
    // (build_narrative) over the bridge — a follow-up when the endpoint exists.
    if (editor.regenerateViaBridge) {
      const regen = iconButton("Rigenera bozza completa",
        editor.canRegenerate?.()
          ? "Rebuild the draft from s3Dgraphy site_story via the bridge"
          : "Needs the bridge and an s3Dgraphy build_narrative endpoint (follow-up)",
        () => editor.regenerateViaBridge?.());
      if (!editor.canRegenerate?.()) (regen as HTMLButtonElement).disabled = true;
      foot.appendChild(regen);
    }
    container.appendChild(foot);
  }
}

/** A paragraph that becomes a textarea when you click it. Editing prose should
 *  not need a mode switch or a dialog — the text is the interface. */
function editableProse(text: string,
                       onCommit: (text: string) => void): HTMLElement {
  const wrap = el("div", "nv-prose-edit");
  const view = renderProse(text || "");
  if (!text.trim())
    view.appendChild(el("p", "nv-todo", "(paragrafo vuoto — clicca per scrivere)"));
  wrap.appendChild(view);
  wrap.title = "Click to edit";
  wrap.addEventListener("click", () => {
    if (wrap.querySelector("textarea")) return;
    const ta = document.createElement("textarea");
    ta.className = "nv-textarea";
    ta.value = text;
    ta.rows = Math.max(3, text.split("\n").length + 1);
    wrap.textContent = "";
    wrap.appendChild(ta);
    ta.focus();
    const commit = () => {
      if (ta.value !== text) onCommit(ta.value);
      else wrap.replaceChildren(renderProse(text));
    };
    ta.addEventListener("blur", commit);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        wrap.replaceChildren(renderProse(text));
      }
    });
  });
  return wrap;
}

/** Which view types this build actually draws — used by the tests and worth
 *  stating out loud so the gap between the enum and the implementation stays
 *  visible. */
export function renderedViewTypes(): string[] {
  return [...RENDERED_VIEW_TYPES];
}
