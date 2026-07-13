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

export type SyncMessage = {
  v: number;
  type: "select" | "focus";
  node_id: string | null;
  source?: string;
};

export interface SyncCallbacks {
  onSelect: (nodeId: string) => void;
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
    ws.onopen = () => this.cb?.onStatus("open");
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
      if (msg.type === "select" && msg.node_id) this.cb?.onSelect(msg.node_id);
    };
  }

  /** Announce a local selection to the peer (no-op when disconnected). */
  sendSelect(nodeId: string | null): void {
    if (!this.connected || !nodeId) return;
    const msg: SyncMessage = { v: 1, type: "select", node_id: nodeId, source: SOURCE };
    try {
      this.ws!.send(JSON.stringify(msg));
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
