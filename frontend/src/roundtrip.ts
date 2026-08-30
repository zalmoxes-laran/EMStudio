/**
 * "Open this room in the other editor" — the round-trip, and why it is small.
 *
 * Word synchronises a FILE between web and desktop: save, upload, resolve. There
 * is nothing like that here, because the document does not live in the client —
 * it lives in the room (a CRDT graph behind a relay). Changing editor is
 * therefore a new JOIN to the same room, and the graph on the other side is the
 * same graph, live. No save step, no version conflict: that is a property of the
 * room rather than something this module arranges.
 *
 * So all this does is pick a DOOR. The bridge is the handoff contract that
 * already exists (`stratigraph-server/app/handoff.py`), asked for the room this
 * session is already in:
 *
 * * **web → desktop** — the `stratigraph://` scheme. If no handler is
 *   registered, the server's own `/open` page says what to install; that
 *   degradation is already built, so this does not invent a second one.
 * * **desktop → web** — the web build's URL, and ONLY when the deployment names
 *   one (`browser` is absent from the answer otherwise). A button pointing at a
 *   web app nobody deployed fails after the click.
 *
 * **No token, ever.** The other surface signs itself in (PKCE, `oidc.ts`). The
 * link names a place and never a permission — which is why handing one to
 * another program, or pasting it into a chat, leaks nothing.
 *
 * **The link is not built here.** It is ASKED FOR: one grammar, on the server,
 * measured against every consumer's copy. A client that assembled its own would
 * be a fifth implementation to keep in step.
 *
 * The view does NOT travel (design §4): camera, selection and active window are
 * per-client state and are not in the room. v1 carries the graph, which is the
 * whole use case; `focus=<node>` is named in the design as a later nice-to-have
 * and `otherSurface` leaves room for it without pretending it exists.
 */

/** What the server says about opening one room. The three doors of
 *  `GET /v1/rooms/{id}/open` — see `handoff.py`. */
export interface RoomHandoff {
  room: string;
  server: string;
  /** `stratigraph://open?server=&room=` — the desktop handler */
  scheme: string;
  /** the server's own `/open` page: works everywhere, explains itself */
  web: string;
  tools: Record<string, {
    label?: string;
    scheme?: string;
    web?: string;
    /** that tool's own web build, present only where one is configured */
    browser?: string;
  }>;
  carries_token?: boolean;
}

/** Which surface this build IS. Not a setting: a fact about where the code runs,
 *  and getting it from a setting would let a desktop offer to open itself. */
export type Surface = "web" | "desktop";

export function currentSurface(): Surface {
  const tauri = (globalThis as unknown as { __TAURI_INTERNALS__?: unknown });
  return tauri.__TAURI_INTERNALS__ ? "desktop" : "web";
}

/** What "the other editor" means from here. */
export function otherSurface(from: Surface = currentSurface()): Surface {
  return from === "desktop" ? "web" : "desktop";
}

export interface Door {
  /** where this would go */
  url: string;
  /** `scheme` opens a registered handler; `browser` opens a tab; `page` is the
   *  server's `/open`, which works with neither */
  kind: "scheme" | "browser" | "page";
  surface: Surface;
  /** true when nothing on this machine may answer it — see `openDoor` */
  mayNotOpen: boolean;
}

export class RoundTripError extends Error {}

/**
 * The door to the OTHER surface, out of a handoff answer.
 *
 * Returns `null` rather than throwing when there is no door: desktop → web is
 * genuinely unavailable on a deployment that does not host a web build, and a
 * missing option is not an error — it is a fact the menu should reflect by not
 * offering it.
 */
export function doorTo(handoff: RoomHandoff, surface: Surface): Door | null {
  const tool = handoff.tools?.emstudio ?? {};
  if (surface === "web") {
    // Only the tool's OWN web build will do. `handoff.web` is the server's
    // `/open` page — useful as a fallback FROM the web, useless as a
    // destination for somebody who is asking to leave the desktop.
    return tool.browser
      ? { url: tool.browser, kind: "browser", surface: "web", mayNotOpen: false }
      : null;
  }
  const scheme = tool.scheme || handoff.scheme;
  if (!scheme) return null;
  // A scheme may have no handler on this machine, and nothing in the browser can
  // tell us in advance. Said out loud so the caller can arrange the fallback
  // rather than discovering the silence.
  return { url: scheme, kind: "scheme", surface: "desktop", mayNotOpen: true };
}

/** The server's own page, which explains what to install. The declared
 *  degradation for a scheme nobody answered — already built, not re-invented. */
export function fallbackPage(handoff: RoomHandoff): Door | null {
  return handoff.web
    ? { url: handoff.web, kind: "page", surface: "desktop", mayNotOpen: false }
    : null;
}

/** Ask the server how to open the room this session is in.
 *
 *  `token` is the session's, held in memory by the caller — it authenticates the
 *  QUESTION (a handoff for a room you have no grant in is refused, because a
 *  listing is not a discovery service). It does not travel in the answer.
 */
export async function roomHandoff(
  base: string, room: string, token: string | null,
  doFetch: typeof fetch = fetch,
): Promise<RoomHandoff> {
  if (!base || !room) {
    throw new RoundTripError("this session is not in a room");
  }
  const url = `${base.replace(/\/+$/, "")}/v1/rooms/${encodeURIComponent(room)}/open`;
  const answer = await doFetch(url, {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await answer.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!answer.ok) {
    const detail = (payload as { detail?: string } | null)?.detail;
    throw new RoundTripError(detail || `HTTP ${answer.status}`);
  }
  const handoff = payload as RoomHandoff;
  // The property, checked at the door rather than trusted: if a future server
  // ever put a credential in here, this client refuses to hand it on.
  assertNoCredential(handoff);
  return handoff;
}

const FORBIDDEN = ["token", "access_token", "id_token", "password", "secret",
                   "code", "authorization", "bearer", "api_key"];

/** No link this client opens may carry a credential. Checked, not assumed. */
export function assertNoCredential(handoff: RoomHandoff): void {
  const urls = [handoff.scheme, handoff.web,
                ...Object.values(handoff.tools ?? {})
                  .flatMap((t) => [t.scheme, t.web, t.browser])];
  for (const url of urls) {
    if (!url) continue;
    const query = url.slice(url.indexOf("?") + 1).toLowerCase();
    for (const key of FORBIDDEN) {
      if (new RegExp(`(^|&)${key}=`).test(query)) {
        throw new RoundTripError(
          `the server offered a link carrying \`${key}\` — a handoff names a `
          + `place and never a permission. Refusing to open it.`);
      }
    }
  }
}
