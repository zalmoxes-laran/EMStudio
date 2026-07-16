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
  | ({ v: number; type: "op"; source?: string } & GraphOp);

export interface SyncCallbacks {
  onSelect: (nodeId: string, nodeIds?: string[]) => void;
  /** a graph mutation arrived from the peer (ADR-002 phase 2 op-log) */
  onOp: (op: GraphOp) => void;
  /** the host sent its full graph as an .em.json doc (ADR-002 snapshot-READ):
   * "sync mode = see the host's data". Replaces the local document. */
  onSnapshot: (doc: EmDocument) => void;
  /** the host reported what it is editing (tool / file / database) */
  onHostInfo?: (info: HostInfo) => void;
  onStatus: (state: "connecting" | "open" | "closed") => void;
}

const SOURCE = "emstudio";

export class SyncClient {
  private ws: WebSocket | null = null;
  private url = "";
  private cb: SyncCallbacks | null = null;
  private manualClose = false;

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(url: string, cb: SyncCallbacks): void {
    this.disconnect();
    this.url = url;
    this.cb = cb;
    this.manualClose = false;
    this.open();
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
      if (!this.manualClose) return; // no auto-reconnect for now (phase 1)
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
      if (msg.type === "select" && (msg.node_id || msg.node_ids?.length))
        this.cb?.onSelect(msg.node_id ?? "", msg.node_ids);
      else if (msg.type === "snapshot") {
        this.cb?.onSnapshot(msg.doc);
        if (msg.host) this.cb?.onHostInfo?.(msg.host);
      } else if (msg.type === "host_info") {
        const { type: _t, v: _v, source: _s, ...info } = msg;
        this.cb?.onHostInfo?.(info as HostInfo);
      } else if (msg.type === "op") {
        const { type: _t, v: _v, source: _s, ...op } = msg;
        this.cb?.onOp(op as GraphOp);
      }
    };
  }

  /** Announce a local selection to the peer (no-op when disconnected).
   * `nodeId` is the active node; `nodeIds` the full multi-selection. */
  sendSelect(nodeId: string | null, nodeIds?: string[]): void {
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
    if (!this.connected) return;
    try {
      this.ws!.send(JSON.stringify({ v: 1, type: "op", source: SOURCE, ...op }));
    } catch {
      /* dropped */
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
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }
}
