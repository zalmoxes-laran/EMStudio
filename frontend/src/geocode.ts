/**
 * GEO2 — place-name search (geocoding) for the Site Position map.
 *
 * Nominatim, the OpenStreetMap geocoder, queried directly: the map next door
 * already draws OSM tiles, so the names and the basemap come from the same data
 * and the same licence. No key, no account, no paid service — and no library:
 * `osm-map.ts` explains why a single-file build cannot afford a CDN dependency,
 * and one JSON endpoint is not the place to start.
 *
 * The usage policy is not decoration either — it is what keeps a free service
 * usable by everyone. This module is the ONE place that talks to Nominatim, so
 * the policy is enforced in one place too:
 *
 *  * **at most one request per second**, globally, whatever the caller does
 *    (`MIN_INTERVAL_MS`, enforced on a shared clock, not per input box);
 *  * **debounce is the caller's job** (the search box waits for a pause), and
 *    this gate is the backstop for when it is not;
 *  * **a result cache**, so re-typing a query already answered costs nothing;
 *  * **identification**: a browser sets its own `User-Agent` and `Referer` and
 *    forbids fetch from touching either, so the identification a browser app can
 *    give is the Referer of the page. DECLARED LIMIT: a single-file build opened
 *    from `file://` sends no Referer, and Nominatim may rate-limit it harder or
 *    refuse. It degrades to "search unavailable" — the map and the manual pick
 *    do not depend on it.
 *
 * Search is ONLINE-ONLY and a comfort: EMStudio is offline-first, and a site is
 * positioned by clicking the map or typing coordinates whether or not a geocoder
 * answers.
 */

export interface GeoHit {
  /** the display name Nominatim returns — what the user recognises */
  label: string;
  lat: number;
  lon: number;
  /** "city", "archaeological_site", … — shown as a faint qualifier */
  kind: string;
  /** south, north, west, east — used to choose a sensible zoom */
  bbox: [number, number, number, number] | null;
}

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
/** The policy is one request per second. 1100ms leaves room for clock jitter. */
const MIN_INTERVAL_MS = 1100;

let lastCallAt = 0;
const cache = new Map<string, GeoHit[]>();

/** Absolute-value span of a bbox → a zoom that shows the whole place. */
function zoomForBbox(b: [number, number, number, number] | null): number {
  if (!b) return 14;
  const dLat = Math.abs(b[1] - b[0]);
  const dLon = Math.abs(b[3] - b[2]);
  const span = Math.max(dLat, dLon);
  if (!Number.isFinite(span) || span <= 0) return 14;
  // 360° across ≈ zoom 0; halve the span, gain a zoom level.
  const z = Math.log2(360 / span) - 0.5;
  return Math.max(2, Math.min(18, Math.round(z)));
}

export function zoomFor(hit: GeoHit): number {
  return zoomForBbox(hit.bbox);
}

/** Thrown when the network (or the service) is not there. The caller shows a
 *  plain "search is an online comfort" message rather than a stack trace. */
export class GeocodeOffline extends Error {}

/**
 * Look a place name up. Returns at most `limit` hits, best first.
 *
 * Rejects with {@link GeocodeOffline} when the request cannot be made or the
 * service answers with an error — the two cases the UI treats alike, because for
 * the person searching they are the same thing: no answer.
 */
export async function geocode(
  query: string,
  opts: { limit?: number; signal?: AbortSignal } = {},
): Promise<GeoHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const limit = opts.limit ?? 8;
  const key = `${limit}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;

  // The shared rate gate: wait our turn even if two panels ask at once.
  const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - Date.now());
  if (wait > 0)
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, wait);
      opts.signal?.addEventListener("abort", () => {
        window.clearTimeout(timer);
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
  lastCallAt = Date.now();

  const url =
    `${ENDPOINT}?format=jsonv2&addressdetails=0&limit=${limit}` +
    `&q=${encodeURIComponent(q)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      signal: opts.signal,
      // Referer is what identifies us; `Accept` is the only header a browser
      // lets us set here that Nominatim cares about.
      headers: { Accept: "application/json" },
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new GeocodeOffline("no network");
  }
  if (!res.ok) throw new GeocodeOffline(`HTTP ${res.status}`);
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new GeocodeOffline("bad response");
  }
  const hits: GeoHit[] = (Array.isArray(raw) ? raw : [])
    .map((r) => {
      const o = r as Record<string, unknown>;
      const lat = Number(o.lat);
      const lon = Number(o.lon);
      const bb = Array.isArray(o.boundingbox)
        ? (o.boundingbox as unknown[]).map(Number)
        : null;
      return {
        label: String(o.display_name ?? o.name ?? ""),
        lat,
        lon,
        kind: String(o.type ?? o.category ?? ""),
        bbox:
          bb && bb.length === 4 && bb.every((n) => Number.isFinite(n))
            ? ([bb[0], bb[1], bb[2], bb[3]] as [number, number, number, number])
            : null,
      };
    })
    .filter((h) => h.label && Number.isFinite(h.lat) && Number.isFinite(h.lon));
  cache.set(key, hits);
  return hits;
}

/** Test/diagnostic seam: how long since the last outgoing call. */
export function msSinceLastCall(): number {
  return lastCallAt ? Date.now() - lastCallAt : Infinity;
}
