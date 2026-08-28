// Live-sync client (ADR-002, phase 1: ephemeral selection/focus).
//
// EMStudio is always a WebSocket CLIENT. It connects to a host that runs the
// server — EMtools inside Blender (local pairing) or, later, StratiGraph Server. This
// module carries ONLY the ephemeral selection/focus channel: it mutates no
// graph data, so there is no ownership/collision concern (the op-log data
// channel is a separate, later phase).
//
// Wire format (JSON text frames), WIRE 2 — the envelope and the BODY are
// separate namespaces, and `wire.ts` says why at length:
//   { v:2, type:"select", source:"emstudio", payload:{ node_id, node_ids? } }
// `source` (the envelope's) lets a peer ignore its own echo; nothing inside
// `payload` can ever collide with it.

import type { ConnectorDescriptor } from "./connectors";
import type { GraphOp } from "./model";
import type { EmDocument } from "./types";
import { roomUrl } from "./hub";
import { envelope, read as readWire, SOURCE } from "./wire";

function hubUrl(options: { url: string; room: string; token?: string | null;
                           since?: string | null }): string {
  return roomUrl(options.url, options.room,
                 { token: options.token, since: options.since });
}

/** What the connected HOST is editing — surfaced in the footer sidecar badge.
 *  All fields optional so an older host that never sends `host_info` simply
 *  shows less. `label` is a free-form status line the host may push. */
export interface HostInfo {
  /** the host's self-reported tool id, e.g. "emtools" / "blender" */
  tool?: string;
  /** the document the host has open, e.g. "TempluMare.em.json" or a .graphml */
  file?: string;
  /** remote database / project name, when the host is DB-backed */
  database?: string;
  /** any extra status text the host wants displayed verbatim */
  label?: string;
  /**
   * CMD1 · does this host EXECUTE commands (model a proxy, import a geometry)?
   *
   * Declared by the host, never guessed: an affordance that is offered and then
   * refused is worse than one that is greyed out with a reason. An older host
   * that does not say anything is treated as a no — the safe reading of silence
   * when the question is "may I act on your scene".
   */
  accepts_commands?: boolean;
  /**
   * P5 · what this client may do in the room, decided by the SERVER.
   *
   * A room resolves a role at the door (owner/admin/editor/viewer) and says so
   * here, so a viewer's client can show a read-only session instead of offering
   * editing that leaves and comes back refused. A host that says nothing is
   * treated as writable — that is every EMtools pairing, where the question
   * does not arise.
   */
  role?: string;
  can_write?: boolean;
  /**
   * CONNECTOR · the host's DESCRIPTOR — what it is, what it can do, and what it
   * speaks (`connectors.ts`; the contract itself is `s3dgraphy.contract`).
   *
   * It rides on `host_info` because that is already the frame where a host says
   * what it is: `tool` and `accepts_commands` were the first two answers to the
   * same question, asked one capability at a time. A host that sends no descriptor
   * is not refused — it is a peer from before this existed, and it keeps working
   * with what it does declare.
   */
  connector?: ConnectorDescriptor;
}

/** The BODY of each message type. The envelope (`v`, `type`, `source`) is
 *  `wire.ts`'s business and is not repeated in any of these. */
export interface SelectPayload {
  node_id: string | null;
  /** full multi-selection (active + others); node_id is the active one */
  node_ids?: string[];
  /** set by a ROOM: whose selection this is. Its presence is what makes the
   *  frame AWARENESS rather than a mirror to follow. */
  connection_id?: string;
  author?: string | null;
}

export interface SnapshotPayload {
  doc: EmDocument;
  /** optional host metadata piggy-backed on the snapshot */
  host?: HostInfo;
  gc_watermark?: string | null;
}

export interface CommandResultPayload {
  cmd_id: string;
  ok: boolean;
  delta?: { nodes?: unknown[]; edges?: unknown[] };
  error?: string;
  repeated?: boolean;
  info?: Record<string, unknown>;
}

export interface OpResultPayload {
  applied: boolean;
  reason?: string;
  op?: Record<string, unknown>;
}

export interface PresencePayload {
  room?: string;
  members?: Array<Record<string, unknown>>;
}

/** P4.3 · what a HUB connection needs that a sidecar one does not. */
export interface HubOptions {
  /** the StratiGraph Server base URL (http/https or ws/wss — both are accepted) */
  url: string;
  room: string;
  /** the access token, held in MEMORY for this session only — never stored, the
   *  same rule the AI key follows: a token on disk is a token that leaks */
  token?: string | null;
  /** how far this client is already synced; drives resume-vs-resync (see `hub.ts`) */
  since?: string | null;
}

export interface SyncCallbacks {
  onSelect: (nodeId: string, nodeIds?: string[]) => void;
  /** a graph mutation arrived from the peer (ADR-002 phase 2 op-log) */
  onOp: (op: GraphOp) => void;
  /** the host sent its full graph as an .em.json doc (ADR-002 snapshot-READ):
   * "sync mode = see the host's data". Replaces the local document. */
  onSnapshot: (doc: EmDocument) => void;
  /** the host reported what it is editing (tool / file / database) */
  onHostInfo?: (info: HostInfo) => void;
  /** P4.3 · the room roster / awareness changed (relay only) */
  onPresence?: (message: Record<string, unknown>) => void;
  /** P4.3 · SOMEBODY ELSE selected something. Awareness, never my selection. */
  onPeerSelect?: (message: Record<string, unknown>) => void;
  /** P4.3 · the hub answered one of MY operations (applied, or stale) */
  onOpResult?: (message: Record<string, unknown>) => void;
  /** P4.3 · the socket dropped and a reconnect is scheduled / has happened.
   *  Reported so the UI can say "reconnecting" instead of going quiet. */
  onReconnect?: (attempt: number, delayMs: number) => void;
  /** P5 · the room REFUSED something this client sent, and said why.
   *
   *  A refusal that arrives and is dropped is indistinguishable from a message
   *  that never arrived: the edit vanishes and the room looks broken. So it is
   *  surfaced, with the role the server resolved. */
  onDenied?: (info: { verb?: string; reason?: string; role?: string;
                      can_write?: boolean }) => void;
  /** WIRE 2 · a frame this client cannot read — another protocol version, or a
   *  host that answered `error`. Surfaced rather than dropped: a host talking
   *  a different wire looks exactly like a host that has gone quiet, and the
   *  user deserves the difference. */
  onWireMismatch?: (reason: string) => void;
  /** CMD1 · the host answered a command: a delta to merge, or an error */
  onCommandResult?: (result: {
    cmd_id: string; ok: boolean;
    delta?: { nodes?: unknown[]; edges?: unknown[] };
    error?: string; repeated?: boolean; info?: Record<string, unknown>;
  }) => void;
  onStatus: (state: "connecting" | "open" | "closed") => void;
}

/**
 * MODES1 · what EMStudio does on the live channel. FOUR states, because two
 * (on/off) cannot express the situation people are actually in:
 *
 *   off      — no echo at all: neither sent nor applied
 *   send     — my selection shows up over there, theirs does not come here
 *   receive  — the host's selection shows up here, mine does not leave
 *   both     — the two screens follow each other
 *
 * The principle this exists for: **nobody has somebody else's state imposed on
 * them without having chosen it.** One person on two screens wants `both`; two
 * people working at once want `off` or one direction, and until now that was
 * not a choice anybody could make.
 *
 * It governs the EPHEMERAL channels — selection and operations. The snapshot and
 * `host_info` are NOT gated: the snapshot is how a sidecar comes to show the
 * host's document at all, and refusing it would make connecting in `off` look
 * like a broken app rather than a quiet one.
 */
export type SyncDirection = "off" | "send" | "receive" | "both";

export const SYNC_DIRECTIONS: SyncDirection[] = ["off", "send", "receive", "both"];

// `SOURCE` now lives in `wire.ts` beside the envelope it belongs to: one
// spelling of "who is speaking", used by both the builder and the echo guard.

export class SyncClient {
  private ws: WebSocket | null = null;
  private url = "";
  private cb: SyncCallbacks | null = null;
  private manualClose = false;
  /** MODES1 · default `both`: it is exactly today's behaviour, so turning the
   *  control on changes nothing until somebody chooses otherwise. */
  private direction: SyncDirection = "both";
  //: P4.3 · reconnect state. Phase 1 deliberately had none ("no auto-reconnect")
  //: because a sidecar is a laptop pairing you re-establish by hand. A ROOM is
  //: not: a dropped Wi-Fi must not end a session, and coming back is where the
  //: rebase check belongs.
  private hub: HubOptions | null = null;
  private attempt = 0;
  private retryTimer: number | null = null;

  get syncDirection(): SyncDirection {
    return this.direction;
  }

  /** Change what this client does on the channel. Takes effect immediately —
   *  including on a connection already open, which is the point: you turn the
   *  echo off when the other person starts working, not before. */
  setDirection(direction: SyncDirection): void {
    this.direction = direction;
  }

  private get sends(): boolean {
    return this.direction === "send" || this.direction === "both";
  }

  private get receives(): boolean {
    return this.direction === "receive" || this.direction === "both";
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(url: string, cb: SyncCallbacks): void {
    this.disconnect();
    this.url = url;
    this.cb = cb;
    this.hub = null;              // a sidecar pairing: no room, no reconnect
    this.manualClose = false;
    this.attempt = 0;
    this.open();
  }

  /**
   * P4.3 · join a ROOM on an StratiGraph Server (the hub mode).
   *
   * Same client, same wire, a different endpoint — which is the whole point of
   * P4.2 having spoken the protocol EMStudio already knew. What is new here is
   * that the connection is expected to LAST: it reconnects with a backoff, and
   * every (re)join carries `since`, so the hub can send only what was missed.
   */
  connectHub(options: HubOptions, cb: SyncCallbacks): void {
    this.disconnect();
    this.hub = { ...options };
    this.cb = cb;
    this.manualClose = false;
    this.attempt = 0;
    this.url = hubUrl(this.hub);
    this.open();
  }

  /** Where this client is synced to — updated by the app as ops are applied, so
   *  a reconnect resumes instead of reloading. */
  setSince(since: string | null): void {
    if (this.hub) this.hub.since = since;
  }

  get room(): string | null {
    return this.hub?.room ?? null;
  }

  private open(): void {
    if (!this.url || !this.cb) return;
    this.cb.onStatus("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.cb.onStatus("closed");
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.cb?.onStatus("open");
      // ask the host for its current graph — this is what makes "sync mode"
      // show the host's data (ADR-002 snapshot-READ). No-op if it fails.
      try {
        ws.send(JSON.stringify(envelope("request_snapshot")));
      } catch {
        /* dropped */
      }
    };
    ws.onclose = () => {
      this.cb?.onStatus("closed");
      if (this.manualClose || !this.hub) return;
      // P4.3 · a room reconnects. Backoff so a server that is down is not
      // hammered, capped so a session that comes back is not left waiting for
      // minutes; every attempt re-opens with the CURRENT `since`, which is what
      // turns a reconnect into a resume.
      this.attempt += 1;
      const delay = Math.min(30_000, 500 * 2 ** Math.min(this.attempt, 6));
      this.cb?.onReconnect?.(this.attempt, delay);
      this.retryTimer = window.setTimeout(() => {
        if (this.manualClose || !this.hub) return;
        this.url = hubUrl(this.hub);
        this.open();
      }, delay);
    };
    ws.onerror = () => {
      /* onclose follows */
    };
    ws.onmessage = (ev) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      const answer = readWire(parsed);
      if (!answer.ok) {
        // A host from another protocol version is SAID, not half-understood.
        // Reading a v1 frame as a v2 one is exactly how an edge lost its
        // endpoints, so this refuses and reports instead of guessing.
        this.cb?.onWireMismatch?.(answer.error);
        return;
      }
      const { type, payload, source } = answer.message;
      if (source === SOURCE) return; // ignore our own echo

      if (type === "select") {
        const body = payload as unknown as SelectPayload;
        if (!body.node_id && !body.node_ids?.length) return;
        // P4.3 · a selection frame that says WHO made it is a ROOM frame, and it
        // is AWARENESS: it must not move my selection. Following somebody's
        // clicks is the two-screens mirror (a sidecar), and in a room it would
        // drag every view around whenever anybody looked at something.
        if (body.connection_id) {
          this.cb?.onPeerSelect?.(payload);
        } else if (this.receives) {
          // MODES1 · gated, not disconnected: the socket stays up (the host's
          // document and its status keep arriving), only the echo stops.
          this.cb?.onSelect(body.node_id ?? "", body.node_ids);
        }
      } else if (type === "snapshot") {
        const body = payload as unknown as SnapshotPayload;
        this.cb?.onSnapshot(body.doc);
        if (body.host) this.cb?.onHostInfo?.(body.host);
      } else if (type === "host_info") {
        this.cb?.onHostInfo?.(payload as HostInfo);
      } else if (type === "presence") {
        // P4.3 · awareness, never gated by the sync direction: knowing who is in
        // the room is not an echo of anybody's work.
        this.cb?.onPresence?.(payload);
      } else if (type === "op_result") {
        this.cb?.onOpResult?.(payload);
      } else if (type === "command_result") {
        // CMD1 · NOT gated by the sync direction: this is the answer to
        // something this user explicitly asked for, and dropping it would leave
        // the request hanging with no way to tell why.
        this.cb?.onCommandResult?.(payload as unknown as CommandResultPayload);
      } else if (type === "op") {
        if (!this.receives) return;   // MODES1 · same gate as the selection
        this.cb?.onOp(payload as unknown as GraphOp);
      } else if (type === "denied") {
        // NOT gated by the sync direction: this is the answer to something this
        // user did, and swallowing it would leave them staring at an edit that
        // silently did not happen.
        this.cb?.onDenied?.(payload as { verb?: string; reason?: string });
      } else if (type === "error") {
        this.cb?.onWireMismatch?.(String(payload.detail ?? "the host reported an error"));
      }
    };
  }

  /** Announce a local selection to the peer (no-op when disconnected).
   * `nodeId` is the active node; `nodeIds` the full multi-selection. */
  sendSelect(nodeId: string | null, nodeIds?: string[]): void {
    if (!this.sends) return;          // MODES1 · off / receive: nothing leaves
    if (!this.connected || (!nodeId && !nodeIds?.length)) return;
    const body: SelectPayload = { node_id: nodeId };
    if (nodeIds && nodeIds.length > 1) body.node_ids = nodeIds;
    try {
      this.ws!.send(JSON.stringify(envelope("select", body as unknown as Record<string, unknown>)));
    } catch {
      /* dropped */
    }
  }

  /** Send a graph mutation to the peer/host (no-op when disconnected). */
  sendOp(op: GraphOp): void {
    if (!this.sends) return;          // MODES1 · off / receive: nothing leaves
    if (!this.connected) return;
    try {
      this.ws!.send(JSON.stringify(
        envelope("op", op as unknown as Record<string, unknown>)));
    } catch {
      /* dropped */
    }
  }

  /**
   * CMD1 · send a command to the host — "model the proxy for this unit".
   *
   * Deliberately NOT gated by the sync direction. `off` means "do not mirror my
   * selection", which is about an echo; a command is a deliberate act by the
   * person at this end, and silently swallowing it because a mirror is off
   * would make the button lie. What DOES gate it is the host's consent, and the
   * host is the one who enforces that (it also declares it in `host_info` so
   * the UI can grey the action out instead of failing).
   *
   * Returns false when there is no connection, so the caller can say so.
   */
  sendCommand(msg: object): boolean {
    if (!this.connected) return false;
    try {
      this.ws!.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  /** Ask the host (EMtools) to persist its em.json before we leave Sidecar
   *  mode — the host owns the canonical file (ADR-002 §4). Fire-and-forget. */
  sendRequestSave(): void {
    if (!this.connected) return;
    try {
      this.ws!.send(JSON.stringify(envelope("request_save")));
    } catch {
      /* dropped */
    }
  }

  disconnect(): void {
    this.manualClose = true;
    this.hub = null;
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const wasConnected = this.ws !== null;
    if (this.ws) {
      try {
        // Detach handlers first so the async onclose doesn't double-fire the
        // status after we've already emitted it below.
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    // Emit "closed" synchronously. Relying on ws.onclose is unreliable once
    // the socket is dropped (and in the Tauri webview it may not fire at
    // all), which left the UI stuck in "Sidecar mode" after New/Open.
    if (wasConnected) this.cb?.onStatus("closed");
  }
}
