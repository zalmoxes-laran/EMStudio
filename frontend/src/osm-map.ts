/**
 * N9 — a real OpenStreetMap map, in about two hundred lines and zero bytes of
 * dependency.
 *
 * Why not Leaflet. EMStudio ships as ONE self-contained HTML file (vite
 * singlefile, `assetsInlineLimit` set high enough to inline the icons): that is
 * the artefact people e-mail each other and open from a USB stick. A CDN
 * <script> would make the map the only part of the app that stops working when
 * cdnjs is unreachable, and bundling Leaflet costs ~145 KB of JS plus ~15 KB of
 * CSS plus its marker PNGs — which a single-file build has to inline too, and
 * which are the classic bundler breakage. For one embed type in a reading view,
 * paying that is a bad trade when the whole map we need is: raster tiles in a
 * grid, drag to pan, two zoom buttons, one marker.
 *
 * So this module does exactly that. What Leaflet would give us and this does not
 * is everything we are not using: vector layers, GeoJSON, projections other than
 * Web Mercator, plugins. If a future view type needs those, this is the moment
 * to reconsider — and the seam is one function.
 *
 * Tiles come from the standard OSM tile servers: no key, no account, no paid
 * service. The attribution is not decoration — it is the licence condition, so
 * it is part of the widget and not removable from outside.
 */

const TILE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 19;

/** Standard OSM raster tiles. Keyless, and the attribution below is the deal. */
function tileUrl(z: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

export interface OsmView {
  lat: number;
  lon: number;
  zoom: number;
}

export interface OsmMap {
  /** The widget. Append it, then call `activate()` when it is on screen. */
  readonly el: HTMLElement;
  /** Build the tile grid. Cheap to call twice; does nothing until laid out. */
  activate(): void;
  /** Where the camera is now — so a re-render can put it back. */
  view(): OsmView;
  /**
   * The scene's oriented footprint as a lon/lat ring (G3), or `null` to clear.
   *
   * Already-reprojected corners, deliberately: the rotation AND the grid
   * convergence are baked into them. Drawing a rectangle from the local frame
   * and rotating it by the azimuth would be wrong by the convergence angle
   * (≈1.7° at 2.5° from a UTM central meridian) — small, real, and exactly the
   * kind of error that looks like sloppy rendering.
   */
  setFootprint(ring: [number, number][] | null): void;
  /** Move the marker — the centroid arrives after the footprint is computed. */
  setMarker(lat: number, lon: number): void;
  /** Drop observers and listeners. */
  destroy(): void;
}

// ── Web Mercator (EPSG:3857) tile arithmetic ──────────────────────────────────
// World pixel coordinates at zoom z: the whole planet is TILE·2^z pixels wide.

function worldSize(z: number): number {
  return TILE * Math.pow(2, z);
}

function lonToX(lon: number, z: number): number {
  return ((lon + 180) / 360) * worldSize(z);
}

function latToY(lat: number, z: number): number {
  const s = Math.sin((Math.max(-85.05112878, Math.min(85.05112878, lat)) *
    Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * worldSize(z);
}

function xToLon(x: number, z: number): number {
  return (x / worldSize(z)) * 360 - 180;
}

function yToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / worldSize(z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface OsmMapOptions {
  /** The marker — the position the graph actually records. */
  lat: number;
  lon: number;
  zoom?: number;
  /** Where the camera starts, if not on the marker (a remembered pan). */
  center?: { lat: number; lon: number };
  /** Tooltip on the marker — usually the node's name. */
  markerLabel?: string;
  /** Called after every pan/zoom, so the caller can remember the camera. */
  onViewChange?: (v: OsmView) => void;
  /**
   * GEO1 · picker mode. When set, a plain click (not a drag) reports the
   * clicked ground point in lon/lat and moves the marker there — the same
   * Web-Mercator math the tiles use, so it works even offline (no basemap, but
   * the coordinate is exact). Absent = a read-only map (the narrative embed).
   */
  onPick?: (lat: number, lon: number) => void;
}

/**
 * A pannable, zoomable OSM map with one marker at (`lat`, `lon`).
 *
 * The marker is geographic, not screen-fixed: pan away and it leaves with the
 * ground, which is the whole point — the reader has to be able to see the
 * position in its surroundings, not a pin glued to the middle of a box.
 */
export function createOsmMap(opts: OsmMapOptions): OsmMap {
  const root = el("div", "osm");
  const tilesLayer = el("div", "osm-tiles");
  // The footprint layer is an SVG over the tiles: a polygon is a polygon, and
  // canvas here would mean a second renderer with its own DPI handling.
  const shapes = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  shapes.setAttribute("class", "osm-shapes");
  const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  poly.setAttribute("class", "osm-footprint");
  shapes.appendChild(poly);
  const marker = el("div", "osm-marker");
  marker.title = opts.markerLabel ?? "";
  // North is UP on a Web-Mercator map, always — so the arrow is a fixed corner
  // ornament and not something that has to be kept in sync with anything.
  const northMark = el("div", "osm-north");
  northMark.innerHTML = "<span>↑</span>N";
  northMark.title =
    "Nord geografico. La mappa è in Web Mercator, quindi il nord è in alto: " +
    "l'impronta è disegnata dai vertici già riproiettati, e la sua inclinazione " +
    "comprende sia l'azimut della scena sia la convergenza della griglia.";
  const controls = el("div", "osm-zoom");
  const attr = el("div", "osm-attr");
  const hint = el("div", "osm-hint", "⌘ / Ctrl + rotella per lo zoom");
  const offline = el("div", "osm-offline");
  offline.appendChild(el("div", undefined, "tile OSM non raggiungibili"));
  offline.appendChild(
    el("div", "osm-offline-note",
      "la posizione qui sotto resta esatta; la mappa torna appena c'è rete"),
  );

  const link = document.createElement("a");
  link.href = "https://www.openstreetmap.org/copyright";
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  link.textContent = "© OpenStreetMap contributors";
  attr.appendChild(link);

  root.appendChild(tilesLayer);
  root.appendChild(shapes);
  root.appendChild(marker);
  root.appendChild(northMark);
  root.appendChild(controls);
  root.appendChild(hint);
  root.appendChild(offline);
  root.appendChild(attr);

  let zoom = Math.round(
    Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, opts.zoom ?? 16)),
  );
  // Camera = the world-pixel point at the centre of the viewport.
  let cx = lonToX(opts.center?.lon ?? opts.lon, zoom);
  let cy = latToY(opts.center?.lat ?? opts.lat, zoom);
  let active = false;
  let loaded = 0;
  let failed = 0;
  const imgs = new Map<string, HTMLImageElement>();
  // The marker's ground position, and the footprint ring, both in lon/lat. They
  // may arrive after construction (the centroid is computed by the bridge).
  let markerLat = opts.lat;
  let markerLon = opts.lon;
  let footprint: [number, number][] | null = null;

  function currentView(): OsmView {
    return { lat: yToLat(cy, zoom), lon: xToLon(cx, zoom), zoom };
  }

  function announce(): void {
    opts.onViewChange?.(currentView());
  }

  function render(): void {
    if (!active) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (!w || !h) return; // not laid out yet — the ResizeObserver will call back
    const originX = cx - w / 2;
    const originY = cy - h / 2;
    const n = Math.pow(2, zoom);
    const minTx = Math.floor(originX / TILE);
    const maxTx = Math.floor((originX + w) / TILE);
    const minTy = Math.max(0, Math.floor(originY / TILE));
    const maxTy = Math.min(n - 1, Math.floor((originY + h) / TILE));

    const wanted = new Set<string>();
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        // Longitude wraps; latitude does not (clamped above).
        const wrapped = ((tx % n) + n) % n;
        const key = `${zoom}/${wrapped}/${ty}@${tx}`;
        wanted.add(key);
        let img = imgs.get(key);
        if (!img) {
          img = new Image();
          img.className = "osm-tile";
          img.decoding = "async";
          img.alt = "";
          img.addEventListener("load", () => {
            loaded++;
            offline.classList.remove("on");
          });
          img.addEventListener("error", () => {
            failed++;
            img!.classList.add("osm-tile-failed");
            // Every tile of the first screenful failing means no network (or a
            // blocked host), and a grey grid explains nothing. Say it.
            if (loaded === 0 && failed >= 3) offline.classList.add("on");
          });
          img.src = tileUrl(zoom, wrapped, ty);
          imgs.set(key, img);
          tilesLayer.appendChild(img);
        }
        img.style.left = `${Math.round(tx * TILE - originX)}px`;
        img.style.top = `${Math.round(ty * TILE - originY)}px`;
      }
    }
    for (const [key, img] of imgs) {
      if (wanted.has(key)) continue;
      img.remove();
      imgs.delete(key);
    }

    // The marker sits where the ground is, so it can leave the viewport.
    const mx = lonToX(markerLon, zoom) - originX;
    const my = latToY(markerLat, zoom) - originY;
    marker.style.left = `${Math.round(mx)}px`;
    marker.style.top = `${Math.round(my)}px`;
    const inside = mx >= -20 && my >= -20 && mx <= w + 20 && my <= h + 20;
    marker.classList.toggle("off-screen", !inside);

    // The footprint, in the same world-pixel space as the tiles.
    shapes.setAttribute("width", String(w));
    shapes.setAttribute("height", String(h));
    if (footprint?.length) {
      poly.setAttribute("points", footprint
        .map(([lon, lat]) =>
          `${(lonToX(lon, zoom) - originX).toFixed(1)},` +
          `${(latToY(lat, zoom) - originY).toFixed(1)}`)
        .join(" "));
      shapes.classList.add("on");
    } else {
      shapes.classList.remove("on");
    }
  }

  function setZoom(next: number, anchorX?: number, anchorY?: number): void {
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(next)));
    if (z === zoom) return;
    const w = root.clientWidth || 1;
    const h = root.clientHeight || 1;
    // Keep the point under the cursor (or the centre) fixed across the zoom.
    const ax = anchorX ?? w / 2;
    const ay = anchorY ?? h / 2;
    const lon = xToLon(cx - w / 2 + ax, zoom);
    const lat = yToLat(cy - h / 2 + ay, zoom);
    zoom = z;
    cx = lonToX(lon, zoom) + (w / 2 - ax);
    cy = latToY(lat, zoom) + (h / 2 - ay);
    // Tiles are per-zoom; keeping the old level's images would misplace them.
    for (const img of imgs.values()) img.remove();
    imgs.clear();
    render();
    announce();
  }

  for (const [label, delta, title] of [
    ["+", 1, "Zoom avanti"],
    ["−", -1, "Zoom indietro"],
  ] as const) {
    const b = el("button", "osm-btn", label) as HTMLButtonElement;
    b.type = "button";
    b.title = title;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      setZoom(zoom + delta);
    });
    controls.appendChild(b);
  }
  const home = el("button", "osm-btn osm-home", "◎") as HTMLButtonElement;
  home.type = "button";
  home.title = "Torna sulla posizione";
  home.addEventListener("click", (e) => {
    e.stopPropagation();
    cx = lonToX(markerLon, zoom);
    cy = latToY(markerLat, zoom);
    render();
    announce();
  });
  controls.appendChild(home);

  // ── panning ────────────────────────────────────────────────────────────────
  let dragId: number | null = null;
  let lastX = 0;
  let lastY = 0;
  let moved = false;

  root.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest(".osm-zoom, .osm-attr")) return;
    dragId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    moved = false;
    root.setPointerCapture(e.pointerId);
    root.classList.add("dragging");
  });
  root.addEventListener("pointermove", (e) => {
    if (dragId !== e.pointerId) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    lastX = e.clientX;
    lastY = e.clientY;
    cx -= dx;
    cy -= dy;
    render();
  });
  const endDrag = (e: PointerEvent): void => {
    if (dragId !== e.pointerId) return;
    dragId = null;
    root.classList.remove("dragging");
    if (moved) announce();
  };
  root.addEventListener("pointerup", endDrag);
  root.addEventListener("pointercancel", endDrag);
  // A drag inside the embed must not also count as "reveal this node in the
  // graph": the embed is clickable, and panning a map is not a click.
  root.addEventListener("click", (e) => {
    if (moved) {
      e.stopPropagation();
      return;
    }
    // GEO1 · picker mode: a plain click drops the site position here. Ignore
    // clicks on the controls/attribution. The ground point is read with the
    // same tile math, so it is exact with or without a basemap.
    if (opts.onPick && !(e.target as HTMLElement).closest(".osm-zoom, .osm-attr")) {
      const r = root.getBoundingClientRect();
      const originX = cx - r.width / 2;
      const originY = cy - r.height / 2;
      const lon = xToLon(originX + (e.clientX - r.left), zoom);
      const lat = yToLat(originY + (e.clientY - r.top), zoom);
      markerLat = lat;
      markerLon = lon;
      render();
      opts.onPick(lat, lon);
    }
  });
  if (opts.onPick) root.classList.add("osm-picker");

  // Wheel: only with a modifier. A map that swallowed the wheel would trap the
  // reader's scroll halfway through a chapter, which is the single most
  // annoying thing an embedded map can do.
  root.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) {
      hint.classList.add("on");
      window.setTimeout(() => hint.classList.remove("on"), 1400);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const r = root.getBoundingClientRect();
    setZoom(zoom + (e.deltaY < 0 ? 1 : -1), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  root.addEventListener("dblclick", (e) => {
    const r = root.getBoundingClientRect();
    e.preventDefault();
    e.stopPropagation();
    setZoom(zoom + 1, e.clientX - r.left, e.clientY - r.top);
  });

  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => render());
  }

  return {
    el: root,
    activate(): void {
      if (active) return;
      active = true;
      ro?.observe(root);
      render();
    },
    view: currentView,
    setFootprint(ring: [number, number][] | null): void {
      footprint = ring && ring.length >= 3 ? ring : null;
      render();
    },
    setMarker(lat: number, lon: number): void {
      markerLat = lat;
      markerLon = lon;
      render();
    },
    destroy(): void {
      active = false;
      ro?.disconnect();
      for (const img of imgs.values()) img.remove();
      imgs.clear();
    },
  };
}

// Reading the graph's georeferencing anchor — and reprojecting it when the frame
// needs PROJ — moved to `geo.ts` in G1: that is about what the GRAPH says, while
// this module is only the widget. `geoOf` is re-exported for callers that used to
// import it from here.
export { geoOf } from "./geo";
export type { GeoRef } from "./geo";
