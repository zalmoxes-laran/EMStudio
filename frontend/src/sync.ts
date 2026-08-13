// Live-sync client (ADR-002, phase 1: ephemeral selection/focus).
//
// EMStudio is always a WebSocket CLIENT. It connects to a host that runs the
// server — EMtools inside Blender (local pairing) or, later, em-server. This
// module carries ONLY the ephemeral selection/focus channel: it mutates no
// graph data, so there is no ownership/collision concern (the op-log data
// channel is a separate, later phase).
//
// Wire format (JSON text frames):
//   { v:1, type:"select", node_id:"<uuid>", source:"emstudio"|"emtools" }
//   { v:1, type:"focus",  node_id:"<uuid>", source:... }   // reserved
// `source` lets a peer ignore its own echo.

import type { GraphOp } from "./model";
import type { EmDocument } from "./types";
import { roomUrl } from "./hub";

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
}

export type SyncMessage =
  | {
      v: number;
      type: "select" | "focus";
      node_id: string | null;
      /** full multi-selection (active + others); node_id is the active one */
      node_ids?: string[];
      source?: string;
    }
  | { v: number; type: "request_snapshot"; source?: string }
  | {
      v: number;
      type: "snapshot";
      doc: EmDocument;
      source?: string;
      /** optional host metadata piggy-backed on the snapshot */
      host?: HostInfo;
    }
  | { v: number; type: "request_save"; source?: string }
  | ({ v: number; type: "host_info"; source?: string } & HostInfo)
  | {
      v: number;
      type: "command";
      verb: string;
      target: string;
      params: Record<string, unknown>;
      cmd_id: string;
      source?: string;
    }
  | {
      v: number;
      type: "command_result";
      cmd_id: string;
      ok: boolean;
      delta?: { nodes?: unknown[]; edges?: unknown[] };
      error?: string;
      repeated?: boolean;
      info?: Record<string, unknown>;
      source?: string;
    }
  | {
      v: number;
      type: "presence";
      room?: string;
      members?: Array<Record<string, unknown>>;
      source?: string;
    }
  | {
      v: number;
      type: "op_result";
      applied: boolean;
      reason?: string;
      op?: Record<string, unknown>;
      source?: string;
    }
  | ({ v: number; type: "op"; source?: string } & GraphOp);

/** P4.3 · what a HUB connection needs that a sidecar one does not. */
export interface HubOptions {
  /** the em-server base URL (http/https or ws/wss — both are accepted) */
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

const SOURCE = "emstudio";

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
   * P4.3 · join a ROOM on an em-server (the hub mode).
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
        ws.send(JSON.stringify({ v: 1, type: "request_snapshot", source: SOURCE }));
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
      let msg: SyncMessage;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.source === SOURCE) return; // ignore our own echo
      if (msg.type === "select" && (msg.node_id || msg.node_ids?.length)) {
        // P4.3 · a selection frame that says WHO made it is a ROOM frame, and it
        // is AWARENESS: it must not move my selection. Following somebody's
        // clicks is the two-screens mirror (a sidecar), and in a room it would
        // drag every view around whenever anybody looked at something.
        const from = (msg as unknown as Record<string, unknown>).connection_id;
        if (from) {
          this.cb?.onPeerSelect?.(msg as unknown as Record<string, unknown>);
        } else if (this.receives) {
          // MODES1 · gated, not disconnected: the socket stays up (the host's
          // document and its status keep arriving), only the echo stops.
          this.cb?.onSelect(msg.node_id ?? "", msg.node_ids);
        }
      } else if (msg.type === "snapshot") {
        this.cb?.onSnapshot(msg.doc);
        if (msg.host) this.cb?.onHostInfo?.(msg.host);
      } else if (msg.type === "host_info") {
        const { type: _t, v: _v, source: _s, ...info } = msg;
        this.cb?.onHostInfo?.(info as HostInfo);
      } else if (msg.type === "presence") {
        // P4.3 · awareness, never gated by the sync direction: knowing who is in
        // the room is not an echo of anybody's work.
        this.cb?.onPresence?.(msg as unknown as Record<string, unknown>);
      } else if (msg.type === "op_result") {
        this.cb?.onOpResult?.(msg as unknown as Record<string, unknown>);
      } else if (msg.type === "command_result") {
        // CMD1 · NOT gated by the sync direction: this is the answer to
        // something this user explicitly asked for, and dropping it would leave
        // the request hanging with no way to tell why.
        const { type: _t, v: _v, source: _s, ...res } = msg;
        this.cb?.onCommandResult?.(res as Parameters<
          NonNullable<SyncCallbacks["onCommandResult"]>>[0]);
      } else if (msg.type === "op") {
        if (!this.receives) return;   // MODES1 · same gate as the selection
        const { type: _t, v: _v, source: _s, ...op } = msg;
        this.cb?.onOp(op as GraphOp);
      }
    };
  }

  /** Announce a local selection to the peer (no-op when disconnected).
   * `nodeId` is the active node; `nodeIds` the full multi-selection. */
  sendSelect(nodeId: string | null, nodeIds?: string[]): void {
    if (!this.sends) return;          // MODES1 · off / receive: nothing leaves
    if (!this.connected || (!nodeId && !nodeIds?.length)) return;
    const msg: SyncMessage = {
      v: 1,
      type: "select",
      node_id: nodeId,
      source: SOURCE,
    };
    if (nodeIds && nodeIds.length > 1) msg.node_ids = nodeIds;
    try {
      this.ws!.send(JSON.stringify(msg));
    } catch {
      /* dropped */
    }
  }

  /** Send a graph mutation to the peer/host (no-op when disconnected). */
  sendOp(op: GraphOp): void {
    if (!this.sends) return;          // MODES1 · off / receive: nothing leaves
    if (!this.connected) return;
    try {
      this.ws!.send(JSON.stringify({ v: 1, type: "op", source: SOURCE, ...op }));
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
      this.ws!.send(
        JSON.stringify({ v: 1, type: "request_save", source: SOURCE }),
      );
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
