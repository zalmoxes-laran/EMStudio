/**
 * The wire ENVELOPE — the body travels nested, and here is the bug that taught
 * us why.
 *
 * ADR-002 gave the ecosystem one protocol, and every message used to be one flat
 * object: `{v, type, source, …the body's fields…}`. That is a **shared
 * namespace** between two vocabularies with nothing to do with each other, and
 * it bites exactly where nobody looks:
 *
 * ```
 * { v: 1, type: "op", source: "emstudio",
 *   op: "add_edge", source: "reg-1", target: "US1" }
 *                    ↑ the WIRE's "who sent this"
 *                    ↑ …and the EDGE's "where it starts"
 * ```
 *
 * The relay stripped `source` — correct for the origin tag — and the edge
 * arrived with no beginning. It applied, it was broadcast, and the only trace
 * was a load warning about an edge whose ends do not exist.
 *
 * From **WIRE 2** the envelope carries only what the transport owns:
 *
 * ```
 * { v: 2, type: "op", source: "emstudio", payload: { …the body… } }
 * ```
 *
 * and a relay treats the payload as opaque. A new verb with a field called
 * `type`, `v` or `source` is now simply a field.
 *
 * This module is the one place this client spells that out — the same shape as
 * `stratigraph-server/app/wire.py` and `EM-blender-tools/sync_bridge/wire.py`. Three
 * languages, one rule, small enough to state three times.
 */

/** The protocol version. Bumped 1 → 2 when the body moved inside `payload`. */
export const WIRE = 2;

/** What this client calls itself on the wire. */
export const SOURCE = "emstudio";

export interface WireMessage {
  v: number;
  type: string;
  source?: string;
  /** routing the transport itself reads (which graph of the container) */
  graph_id?: string;
  payload: Record<string, unknown>;
}

/** Build one message. `routing` stays OUTSIDE the payload on purpose: the relay
 *  reads it, so it is the wire's word, not the body's. */
export function envelope(type: string, payload: Record<string, unknown> = {},
                         routing: Record<string, unknown> = {}): WireMessage {
  const message: WireMessage = { v: WIRE, type, source: SOURCE, payload: { ...payload } };
  for (const [key, value] of Object.entries(routing)) {
    if (value !== undefined && value !== null) {
      (message as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return message;
}

export interface WireRead {
  type: string;
  payload: Record<string, unknown>;
  source?: string;
  graph_id?: string;
}

/**
 * Read a message, or explain why it cannot be read.
 *
 * A message from another protocol version is **refused by name**, never
 * partially understood: half-reading a frame is how an edge ends up with no
 * beginning, and how the reason for it is discovered three weeks later.
 */
export function read(raw: unknown): { ok: true; message: WireRead }
                                   | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "a wire message must be a JSON object" };
  }
  const message = raw as Record<string, unknown>;
  if (message.v !== WIRE) {
    return {
      ok: false,
      error: `this client talks wire v${WIRE} and the message says `
        + `v${String(message.v)}. From v2 the body travels nested under `
        + `\`payload\` instead of spread across the envelope — update the host.`,
    };
  }
  const type = String(message.type ?? "");
  if (!type) return { ok: false, error: "a wire message must say its `type`" };
  const payload = message.payload;
  if (payload !== undefined && (typeof payload !== "object" || payload === null)) {
    return { ok: false, error: `the payload of a ${type} message must be an object` };
  }
  return {
    ok: true,
    message: {
      type,
      payload: (payload as Record<string, unknown>) ?? {},
      source: message.source as string | undefined,
      graph_id: message.graph_id as string | undefined,
    },
  };
}
