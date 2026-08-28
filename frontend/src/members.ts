/**
 * MEMBERS · who is in this room, and what they may do — the OWNER's face.
 *
 * The other face of the same contract. StratiGraph Server holds the policy (`access.py`:
 * four ordered roles, the owner untouchable by an admin, a grant to a person
 * being a grant to a person), the node console shows it across every room, and
 * this shows it for the room you have open. **No rule is implemented here.** Every
 * action is one call to the room's own endpoints:
 *
 *     GET    /v1/rooms/{room}/members
 *     PUT    /v1/rooms/{room}/members/{orcid}   {role}
 *     DELETE /v1/rooms/{room}/members/{orcid}
 *     GET  · POST   /v1/rooms/{room}/invites
 *     DELETE        /v1/rooms/{room}/invites/{token_id}
 *
 * Two things this panel is careful about, and both are about not lying:
 *
 * **It does not offer what the server would refuse.** A viewer sees the roster
 * and no controls; the owner's row has no role selector (a transfer is a
 * deliberate act, not a dropdown on a list). When the server refuses anyway — a
 * revocation somebody else already made, a role that changed under us — its
 * sentence is shown verbatim, because "the owner cannot be demoted; transfer the
 * room first" is the answer and "Forbidden" is not.
 *
 * **The invite token is shown once.** The server keeps a digest, not the link, so
 * there is no second chance to read it and no point pretending otherwise: it is
 * rendered with a copy button and never fetched again.
 */

import { t } from "./i18n";

export interface MemberRow {
  orcid: string;
  role: string;
}

export interface Roster {
  room: string;
  owner: string | null;
  members: MemberRow[];
  /** what the CALLER may do here, as the server resolved it */
  your_role: string | null;
}

export interface InviteRow {
  token_id: string;
  role: string;
  state: string;
  uses: number;
  max_uses: number | null;
  accepted_by: string[];
  expires_at: number | null;
  /** present ONLY in the answer that minted it */
  token?: string | null;
}

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

/** The roles a panel may offer. `owner` is absent: a transfer is not a dropdown.
 *  Same reason `invites.OFFERABLE` leaves it out of a link. */
export const ASSIGNABLE = ["viewer", "editor", "admin"] as const;

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

export function fetchRoster(access: RoomAccess): Promise<Roster> {
  return call<Roster>(access, "GET", `/rooms/${encodeURIComponent(access.room)}/members`);
}

export function setRole(access: RoomAccess, orcid: string,
                        role: string): Promise<Roster> {
  return call<Roster>(access, "PUT",
                      `/rooms/${encodeURIComponent(access.room)}/members/`
                      + encodeURIComponent(orcid), { role });
}

export function revokeMember(access: RoomAccess, orcid: string): Promise<Roster> {
  return call<Roster>(access, "DELETE",
                      `/rooms/${encodeURIComponent(access.room)}/members/`
                      + encodeURIComponent(orcid));
}

export function fetchInvites(access: RoomAccess): Promise<InviteRow[]> {
  return call<InviteRow[]>(access, "GET",
                           `/rooms/${encodeURIComponent(access.room)}/invites`);
}

export function mintInvite(access: RoomAccess, role: string,
                           options: { max_uses?: number | null } = {},
                           ): Promise<InviteRow> {
  return call<InviteRow>(access, "POST",
                         `/rooms/${encodeURIComponent(access.room)}/invites`,
                         { role, ...options });
}

export function revokeInvite(access: RoomAccess,
                             tokenId: string): Promise<InviteRow> {
  return call<InviteRow>(access, "DELETE",
                         `/rooms/${encodeURIComponent(access.room)}/invites/`
                         + encodeURIComponent(tokenId));
}

/**
 * The link a person actually receives.
 *
 * It points at THIS build of EMStudio (`?join=<token>`), so following it lands in
 * the app, which signs the person in and then calls `/v1/join`. The token is in
 * the fragment-free query on purpose: it has to survive a redirect through the
 * identity provider, and a fragment does not.
 */
export function inviteUrl(token: string, room: string): string {
  const here = new URL(window.location.href);
  here.hash = "";
  here.searchParams.set("join", token);
  here.searchParams.set("room", room);
  return here.toString();
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

// ── the panel ───────────────────────────────────────────────────────────────

export interface PanelHooks {
  access: RoomAccess;
  /** the role the SERVER said this client has (`host_info.role`) */
  role: string | null;
  /** a line for the log / a toast */
  note(message: string, kind?: "info" | "good" | "bad"): void;
}

/**
 * Render the panel into `root`. Returns a function that re-reads it from the
 * server — which is what every action calls when it succeeds: the roster after an
 * act is the server's, never a local edit of the list we happened to be showing.
 */
export function renderMembersPanel(root: HTMLElement,
                                   hooks: PanelHooks): () => Promise<void> {
  const el = (tag: string, cls = "", text = ""): HTMLElement => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  };

  async function refresh(): Promise<void> {
    root.innerHTML = "";
    root.appendChild(el("p", "mem-loading", t("members.loading")));
    let roster: Roster;
    try {
      roster = await fetchRoster(hooks.access);
    } catch (error) {
      root.innerHTML = "";
      // A viewer is REFUSED the member list by the server (a membership list is
      // a list of people working on an unpublished study). That is not an error
      // to hide: the panel says it, and says what the person can still see.
      root.appendChild(el("p", "mem-refused", (error as Error).message));
      return;
    }
    root.innerHTML = "";

    const manage = canManage(roster.your_role ?? hooks.role);
    const head = el("div", "mem-head");
    head.appendChild(el("strong", "", roster.room));
    head.appendChild(el("span", "mem-role",
                        t("members.youAre", { role: roster.your_role ?? "—" })));
    root.appendChild(head);

    const table = el("table", "mem-table");
    const body = el("tbody");
    const rows: MemberRow[] = [];
    if (roster.owner) rows.push({ orcid: roster.owner, role: "owner" });
    for (const member of roster.members) {
      if (member.orcid !== roster.owner) rows.push(member);
    }
    if (!rows.length) {
      const empty = el("tr");
      const cell = el("td", "mem-empty", t("members.nobody"));
      cell.setAttribute("colspan", "3");
      empty.appendChild(cell);
      body.appendChild(empty);
    }
    for (const member of rows) {
      body.appendChild(memberRow(member, roster, manage));
    }
    table.appendChild(body);
    root.appendChild(table);

    if (!manage) {
      // Read-only, and it says WHY rather than just showing nothing to click.
      root.appendChild(el("p", "mem-note", t("members.readOnly")));
      return;
    }
    root.appendChild(addRow());
    root.appendChild(inviteRow());
  }

  function memberRow(member: MemberRow, roster: Roster,
                     manage: boolean): HTMLElement {
    const row = el("tr");
    row.appendChild(el("td", "mem-orcid", member.orcid));
    const isOwner = member.orcid === roster.owner;
    const roleCell = el("td", "mem-rolecell");
    if (!manage || isOwner) {
      roleCell.appendChild(el("span", "", member.role));
      if (isOwner && manage) {
        // The server refuses a demotion outright; not offering it is the same
        // rule, one step earlier, so the UI never sends what would come back
        // refused.
        roleCell.appendChild(el("span", "mem-hint", t("members.ownerHint")));
      }
    } else {
      const select = document.createElement("select");
      for (const role of ASSIGNABLE) {
        const option = document.createElement("option");
        option.value = option.textContent = role;
        if (role === member.role) option.selected = true;
        select.appendChild(option);
      }
      select.addEventListener("change", async () => {
        try {
          await setRole(hooks.access, member.orcid, select.value);
          hooks.note(t("members.changed", { orcid: member.orcid,
                                            role: select.value }), "good");
        } catch (error) {
          hooks.note((error as Error).message, "bad");
        }
        await refresh();
      });
      roleCell.appendChild(select);
    }
    row.appendChild(roleCell);

    const actions = el("td", "mem-actions");
    if (manage && !isOwner) {
      const revoke = el("button", "mem-ghost", t("members.revoke"));
      revoke.addEventListener("click", async () => {
        if (!window.confirm(t("members.revokeSure", { orcid: member.orcid })))
          return;
        try {
          await revokeMember(hooks.access, member.orcid);
          hooks.note(t("members.revoked", { orcid: member.orcid }), "good");
        } catch (error) {
          hooks.note((error as Error).message, "bad");
        }
        await refresh();
      });
      actions.appendChild(revoke);
    }
    row.appendChild(actions);
    return row;
  }

  function addRow(): HTMLElement {
    const form = document.createElement("form");
    form.className = "mem-add";
    const orcid = document.createElement("input");
    orcid.placeholder = "0000-0000-0000-0000";
    orcid.size = 21;
    const role = document.createElement("select");
    for (const value of ASSIGNABLE) {
      const option = document.createElement("option");
      option.value = option.textContent = value;
      role.appendChild(option);
    }
    const add = el("button", "", t("members.add"));
    form.append(orcid, role, add);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const who = orcid.value.trim();
      if (!who) return;
      try {
        await setRole(hooks.access, who, role.value);
        hooks.note(t("members.changed", { orcid: who, role: role.value }), "good");
        orcid.value = "";
      } catch (error) {
        hooks.note((error as Error).message, "bad");
      }
      await refresh();
    });
    return form;
  }

  function inviteRow(): HTMLElement {
    const box = el("div", "mem-invites");
    box.appendChild(el("h4", "", t("members.invites")));
    const controls = el("div", "mem-inline");
    const role = document.createElement("select");
    for (const value of ["viewer", "editor"]) {
      const option = document.createElement("option");
      option.value = option.textContent = value;
      role.appendChild(option);
    }
    const make = el("button", "", t("members.mint"));
    const list = el("div", "mem-invite-list");
    const shown = el("div", "mem-token");

    make.addEventListener("click", async () => {
      try {
        const invite = await mintInvite(hooks.access, role.value);
        const url = invite.token ? inviteUrl(invite.token, hooks.access.room) : "";
        shown.innerHTML = "";
        const code = el("code", "", url || invite.token || "");
        const copy = el("button", "mem-ghost", t("members.copy"));
        copy.addEventListener("click", () => {
          navigator.clipboard?.writeText(url || invite.token || "");
          hooks.note(t("members.copied"), "good");
        });
        shown.append(code, copy);
        // Said out loud: there is no second chance to read it.
        hooks.note(t("members.mintedOnce", { role: invite.role }), "good");
        await drawInvites(list);
      } catch (error) {
        hooks.note((error as Error).message, "bad");
      }
    });

    controls.append(role, make);
    box.append(controls, shown, list);
    void drawInvites(list);
    return box;
  }

  async function drawInvites(list: HTMLElement): Promise<void> {
    list.innerHTML = "";
    let invites: InviteRow[];
    try {
      invites = await fetchInvites(hooks.access);
    } catch (error) {
      list.appendChild(el("p", "mem-note", (error as Error).message));
      return;
    }
    if (!invites.length) {
      list.appendChild(el("p", "mem-note", t("members.noInvites")));
      return;
    }
    for (const invite of invites) {
      const row = el("div", "mem-invite");
      row.appendChild(el("span", "mem-orcid",
                         `${invite.token_id} · ${invite.role} · ${invite.state}`
                         + ` · ${t("members.used", { n: String(invite.uses) })}`));
      if (invite.state === "live") {
        const stop = el("button", "mem-ghost", t("members.revokeLink"));
        stop.addEventListener("click", async () => {
          try {
            await revokeInvite(hooks.access, invite.token_id);
            hooks.note(t("members.linkRevoked"), "good");
          } catch (error) {
            hooks.note((error as Error).message, "bad");
          }
          await drawInvites(list);
        });
        row.appendChild(stop);
      }
      list.appendChild(row);
    }
  }

  void refresh();
  return refresh;
}
