/**
 * "Open this room in EMStudio" — the deep-link, consumed.
 *
 * This kills the hand-typed Hub. Before it, joining a room meant three fields in
 * Settings — an address, a room name, and a token pasted out of a terminal — and
 * the third one was a secret travelling by clipboard.
 *
 * The contract is StratiGraph Server's (`app/handoff.py`), and its security
 * property is the whole design:
 *
 *     stratigraph://open?server=<addr>&room=<id>
 *
 * **The link carries a PLACE, never a permission.** No token, no ticket. This
 * module reads `{server, room}` out of it and then signs in AGAINST THAT SERVER
 * by itself — Authorization Code + PKCE, public client, token in memory. So a
 * link in a chat, a screenshot or a bug report leaks nothing, and the token
 * belongs to whoever clicked rather than to whoever forwarded.
 *
 * **A link is not a membership.** If the caller has no grant, the room refuses
 * and the remedy is the INVITE (`members.ts`), which is a different link that
 * carries a role. Conflating the two would turn "here is where it is" into
 * "here, have access".
 *
 * Two ways in, one reader:
 *
 * * **desktop** — the OS hands the app a `stratigraph://` URL (registered in the
 *   Tauri bundle) and Tauri delivers it as a deep-link event;
 * * **web** — the same parameters arrive on this page's own query string, which
 *   is what the server's `/open` page falls back to.
 *
 * The grammar is deliberately re-implemented here rather than fetched: a client
 * that had to reach a server to find out WHICH server to reach would not be able
 * to start. It is kept honest by `check-handoff.mjs`, which measures this reader
 * against the same links the server's own parser is measured against.
 */

/** What a handoff names, and all it names. */
export interface Handoff {
  server: string;
  room: string;
}

/** The ecosystem's scheme — not `emstudio://`. One namespace, two actions: the
 *  Catalog opens a STUDY, the room browser opens a ROOM. */
export const SCHEME = "stratigraph";
export const ACTION = "open";

/** Query keys that must never appear in a handoff. Refused rather than ignored:
 *  accepting one teaches whoever built the link that sending one works, and then
 *  the contract has no property left. */
const FORBIDDEN = ["token", "access_token", "id_token", "password", "secret",
                   "code", "authorization", "bearer", "api_key"];

export class HandoffError extends Error {}

/** `{server, room}` out of either form of the link, or a sentence. */
export function parseHandoff(link: string): Handoff {
  const raw = (link || "").trim();
  if (!raw) throw new HandoffError("empty link");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HandoffError(`not a link: ${raw}`);
  }

  const scheme = url.protocol.replace(/:$/, "");
  if (scheme === SCHEME) {
    // `stratigraph://open?…` — the host is the action for a non-special scheme
    const action = url.host || url.pathname.replace(/^\/+/, "");
    if (action !== ACTION) {
      throw new HandoffError(
        `unknown action "${action}": this scheme understands ${SCHEME}://${ACTION}`);
    }
  } else if (scheme === "http" || scheme === "https") {
    if (!url.pathname.replace(/\/+$/, "").endsWith(`/${ACTION}`)) {
      throw new HandoffError(
        `not a handoff link: ${raw} (expected a path ending in /${ACTION})`);
    }
  } else {
    throw new HandoffError(
      `not a handoff link: ${raw} (expected ${SCHEME}://${ACTION}?… or an https link to /${ACTION})`);
  }

  const carried = FORBIDDEN.filter((key) => url.searchParams.has(key));
  if (carried.length) {
    throw new HandoffError(
      `this link carries ${carried.join(", ")} — a handoff names a place and `
      + `never a permission. Refused so that sending one never starts working: `
      + `EMStudio signs in by itself.`);
  }

  const room = (url.searchParams.get("room") || "").trim();
  if (!room) throw new HandoffError("the link names no room");
  let server = (url.searchParams.get("server") || "").trim().replace(/\/+$/, "");
  if (!server) {
    // the web form may leave it implicit: the page IS on the server
    if (scheme === "http" || scheme === "https") server = url.origin;
    else throw new HandoffError("the link names no server");
  }
  return { server, room };
}

/** A handoff on THIS page's URL, if there is one.
 *
 *  The web half. Two spellings are read because both exist in the wild: the
 *  server's `/open?server=&room=` page, and a plain `?handoff=<the whole link>`
 *  that anything can append. */
export function handoffFromLocation(search?: string): Handoff | null {
  const params = new URLSearchParams(
    search ?? (typeof window !== "undefined" ? window.location.search : ""));
  const whole = params.get("handoff");
  if (whole) {
    try { return parseHandoff(whole); } catch { return null; }
  }
  const room = (params.get("room") || "").trim();
  const server = (params.get("server") || "").trim();
  // `?room=` alone is the INVITE's spelling (`members.ts::pendingJoin`) and must
  // not be mistaken for a handoff: that one arrives with `?join=<token>` and
  // means something else entirely.
  if (!room || !server || params.has("join")) return null;
  try {
    return parseHandoff(`${SCHEME}://${ACTION}?server=`
      + `${encodeURIComponent(server)}&room=${encodeURIComponent(room)}`);
  } catch {
    return null;
  }
}

/** Take the handoff off the address bar once it has been read.
 *
 *  Not a secret — there is nothing secret in it — but a URL that still says
 *  `?room=` will re-join on every reload, including after the person has
 *  deliberately left. */
export function clearHandoffFromLocation(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const key of ["handoff", "server", "room"]) url.searchParams.delete(key);
  window.history.replaceState({}, "", url.toString());
}

/** Build one — for a test, and for the day EMStudio hands a room to something
 *  else. The same grammar in both directions is what keeps the reader honest. */
export function buildHandoff({ server, room }: Handoff): string {
  if (!room) throw new HandoffError("a handoff needs a room");
  if (!server) throw new HandoffError("a handoff needs a server");
  const query = new URLSearchParams({ server: server.replace(/\/+$/, ""), room });
  return `${SCHEME}://${ACTION}?${query.toString()}`;
}
