/**
 * MEMBERS · the half of the room's access that lives HERE — RECEIVING an invite.
 *
 * THE PANEL WAS RETIRED on 8 September 2026, and this file is what is left. What
 * it does now is one thing: honour a link somebody else minted.
 *
 * ## Why the panel went
 *
 * Design note `EM_design_condividi-e-firma.md`, Regola IV: «il pannello sta sul
 * nodo che ospita la stanza… EMStudio, il chatbot e il catalogo ci portano un
 * link, mai una copia del pannello». This file WAS that copy — 449 lines of it —
 * and two measured facts made keeping it worse than removing it:
 *
 * 1. **it showed half the ACL.** A grant to a TEAM has existed since 7 September
 *    (`PUT /v1/rooms/{id}/groups/{gid}`) and this surface never drew one. The
 *    label added on 8 September («N team grants are not shown here») was the
 *    honest move inside a diff that was about something else, but a panel that
 *    tells you it is showing half is still a panel somebody decides an access on;
 * 2. **it minted a DIFFERENT invite link.** `inviteUrl()` pointed at *this
 *    build*; the node's panel takes the link from the door the node declares
 *    (`/v1/rooms/{id}/open`). Two addresses for one door, and which one an
 *    invited person received depended on where the inviter happened to be
 *    standing. Not an incompleteness — an ambiguity.
 *
 * ## Why the other half STAYS
 *
 * Minting and managing were the copy. **Receiving** is the other end of the same
 * gesture and lives here by construction: a link arrives at an app, and the app
 * has to be able to honour it. Removing this half would land an invitation in a
 * program that cannot redeem it — a worse defect than the one being repaired.
 *
 * So what is left is exactly that path:
 *
 *     `pendingJoin()`   the token this page was opened with, if any
 *     `acceptInvite()`  POST /v1/join — the one call, with the server's sentence
 *     `canManage()`     a role question the roster chip asks about ITSELF
 *
 * `RoomAccess` and the private `call()` stay because `acceptInvite` is built on
 * them, which is a fact measured rather than assumed: they have no other caller.
 *
 * ## Where the panel is now
 *
 * On the node, at `/em/work/?room=<id>` — one place, and a link from every app.
 * EMStudio's link is `Mode ▸ «Share this room…»`; the roster chip opens it too,
 * because that is where somebody already looks to see who is in the room.
 *
 * `scripts/check-members.mjs` keeps the checks for the path that stayed, and
 * turns the ones about writing into a TEST OF ABSENCE: the panel may not come
 * back here without somebody first reading why it left.
 */


/** What the panel needs from the app: where the room is, and who is asking. */
export interface RoomAccess {
  /** the StratiGraph Server base, as the sync settings hold it (`https://host/em`) */
  base: string;
  room: string;
  token: string | null;
}

const MANAGING = new Set(["admin", "owner"]);

export function canManage(role: string | null | undefined): boolean {
  return MANAGING.has(String(role ?? "").toLowerCase());
}

function apiBase(access: RoomAccess): string {
  return access.base.replace(/\/+$/, "") + "/v1";
}

async function call<T>(access: RoomAccess, method: string, path: string,
                       body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (access.token) headers.Authorization = `Bearer ${access.token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const answer = await fetch(apiBase(access) + path, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await answer.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { detail: text };
  }
  if (!answer.ok) {
    const detail = (payload as { detail?: string } | null)?.detail;
    // The SERVER's sentence. Every refusal in StratiGraph Server names what is missing
    // and who can grant it; replacing it with a status code throws away the
    // only part somebody can act on.
    throw new Error(detail || `${answer.status} ${method} ${path}`);
  }
  return payload as T;
}

/** The token an invite link carries, if this page was opened by one. */
export function pendingJoin(): { token: string; room: string | null } | null {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("join");
  if (!token) return null;
  return { token, room: params.get("room") };
}

export interface JoinResult {
  room_id: string;
  title: string;
  role: string;
  already_had: boolean;
}

/** Accept an invitation. The server needs an identity — without one it answers
 *  401 and the caller has to sign in first, which is the whole design. */
export function acceptInvite(base: string, token: string,
                             bearer: string | null): Promise<JoinResult> {
  return call<JoinResult>({ base, room: "", token: bearer }, "POST", "/join",
                          { token });
}

