/**
 * CONNECTORS · the registry, on the study's side.
 *
 * A connector is an adapter that declares a DESCRIPTOR and speaks the common wire
 * (em.json · a content-addressed object store · CRDT ops), with every write
 * attributed as a DTC act. Blender (EMtools) is reference #1; a Heriverse viewer,
 * a Tropy import and a PyArchInit sync are next, and none of them should require
 * a line of this file.
 *
 * The contract itself lives in **s3Dgraphy** (`s3dgraphy.contract`): the four
 * refusals, the descriptor, the DTC-attributed delta, the version handshake and
 * the write seam. That is not an accident of language — the refusals belong where
 * the writes actually enter a graph, and a second implementation of "no write
 * without an author" in TypeScript would be a second place for it to be wrong.
 *
 * So what lives HERE is deliberately small, and it is the half a client owns:
 *
 * * what has ANNOUNCED itself (a connector arrives over `host_info` or a room's
 *   arrival frame), and in what state;
 * * whether we understand it — the **handshake**, mirrored from the Python one
 *   (same fields, same comparison, same verdicts) because a client that connects
 *   and then discovers at the first write that it cannot talk has already shown
 *   the user a lie;
 * * what the session therefore IS — the mode, **derived** from what is connected
 *   and never set (the same rule `sync.ts` follows for standalone/sidecar/hub).
 *
 * What does NOT live here: granting a capability (the room's role decides),
 * validating an edge against the EM language (s3Dgraphy, at the seam), applying a
 * delta (the store's CRDT path).
 */

/** The capability set, grouped by the layer it acts on — the same table as
 *  `s3dgraphy.contract.connector.CAPABILITY_LAYERS`. Vendored as a constant for
 *  the same reason the datamodels are (ADR-001): one source, copied on purpose,
 *  never re-derived from a guess. */
export const CAPABILITY_LAYERS = {
  /** the DOCUMENT: the study itself, and therefore what a role must allow */
  document: ["read-graph", "write-graph", "subscribe"],
  /** INTERACTION: the radius of a USER — ephemeral, never in the document */
  interaction: ["link-selection", "presence"],
  /** ASSETS: bytes in a content-addressed store; the graph points at them.
   *  `resolve-preview` is the thumbnail of the same bytes — its own capability
   *  because showing a contact sheet without handing over originals is a real
   *  arrangement, and NOT a weaker gate: an embargo covers the derivative. */
  asset: ["attach-asset", "resolve-asset", "resolve-preview",
          "materialize-3D", "publish-3D"],
  /** INGEST: one-shot, and a PROPOSAL (volatile until baked) */
  ingest: ["ingest-batch"],
  /** SEMANTICS: resolve an identifier against an authority */
  semantic: ["resolve-uri"],
} as const;

/** The connector API version — the shape of a descriptor plus the wire. Bumped
 *  when that shape changes, never for a new capability (adding one is what the
 *  set is for). Must match `s3dgraphy.contract.connector.CONNECTOR_API_VERSION`,
 *  which is what the handshake compares. */
export const CONNECTOR_API_VERSION = "1.0.0";

/** The em.json schema this build reads and writes — the same number
 *  `s3dgraphy.exporter.emjson_exporter.SCHEMA_VERSION` stamps into a header.
 *  Declared here because the handshake has to say what we speak, and the one
 *  place that knew it was a header field on whatever document happened to be
 *  open. */
export const EMJSON_SCHEMA_VERSION = "2";

/**
 * CONSUMERS · the read-only half of the same contract.
 *
 * A consumer disseminates: a Heriverse viewer, an ATON scene, a catalogue page.
 * It reads a published study and shows it, and it writes nothing — which makes
 * it the other half of the connector idea rather than a special case of it. The
 * serving rules (rights, tombstones, proposals, the role gate) live in
 * `s3dgraphy.contract.consumer`, where the study is; what a client owns is
 * saying WHO is a consumer and what it has actually been granted.
 *
 * Subsets of the one closed table, never a second list — `resolve-preview` is
 * the thumbnail of the same bytes and it is NOT a weaker gate: an embargo covers
 * a derivative, because a thumbnail of an embargoed photograph is the photograph.
 */
export const READ_CAPABILITIES: readonly string[] =
  ["read-graph", "subscribe", "resolve-asset", "resolve-preview", "resolve-uri"];

/** Everything a consumer may declare: the reads plus the ephemeral pair. A
 *  cursor and a roster are not reads of the document — they are the radius of a
 *  person, which is why they are their own layer and why they travel on the
 *  ephemeral channel rather than through the document one. */
export const CONSUMER_CAPABILITIES: readonly string[] =
  [...READ_CAPABILITIES, "link-selection", "presence"];

export type CapabilityLayer = keyof typeof CAPABILITY_LAYERS;
export type Capability = typeof CAPABILITY_LAYERS[CapabilityLayer][number];

export const CAPABILITIES: readonly string[] =
  Object.values(CAPABILITY_LAYERS).flat();

/** capability → its layer. Built from the table, so a new capability cannot be
 *  in the set and in no layer. */
export const CAPABILITY_LAYER: Record<string, CapabilityLayer> =
  Object.fromEntries(
    (Object.entries(CAPABILITY_LAYERS) as [CapabilityLayer, readonly string[]][])
      .flatMap(([layer, caps]) => caps.map((c) => [c, layer] as const)),
  ) as Record<string, CapabilityLayer>;

/** The three versions that decide whether two peers understand each other. */
export interface ConnectorVersions {
  emjson?: string | null;
  /** the connections datamodel — the EM language itself */
  datamodel?: string | null;
  /** the connector API: the shape of a descriptor plus the wire */
  connector_api?: string | null;
}

/** What a connector announces. The wire form of
 *  `s3dgraphy.contract.ConnectorDescriptor.as_dict()`. */
export interface ConnectorDescriptor {
  name: string;
  description?: string;
  /** where it runs: inside another application, or inside EMStudio */
  host: "app-side" | "emstudio-side";
  transport: Array<"direct" | "lan" | "cloud">;
  capabilities: string[];
  versions: ConnectorVersions;
  /** how it attributes what it writes, in one phrase */
  provenance?: string;
  /** False for a connector that only ever reads. The contract's own word for
   *  read-only (`Descriptor.writes`), and it was there before consumers were:
   *  a consumer needs no exemption from the no-author refusal, the refusal
   *  simply never applies. */
  writes?: boolean;
  /** the partner's own metadata (an addon version, a build id) */
  vendor?: Record<string, unknown>;
}

/** A connector as this session sees it: what it said, and how it went. */
export interface ConnectorState {
  descriptor: ConnectorDescriptor;
  /** `direct` for a paired host on this machine, `cloud` for a room */
  transport: "direct" | "lan" | "cloud";
  /** accepted, or refused with the reason (a version mismatch, so far) */
  status: "accepted" | "refused";
  reason?: string;
  /** the role the room resolved for us, when there is a room. A connector never
   *  grants itself a capability: a viewer does not write, whatever it declared. */
  role?: string | null;
  can_write?: boolean;
  announced_at: number;
}

/** Is this a shape we can treat as a descriptor at all? Checked rather than
 *  trusted: a peer sending half a descriptor should be refused with a sentence,
 *  not crash a registry on the first `.capabilities.length`. */
export function isConnectorDescriptor(value: unknown): value is ConnectorDescriptor {
  const d = value as ConnectorDescriptor | null;
  return !!d && typeof d === "object"
    && typeof d.name === "string" && !!d.name
    && (d.host === "app-side" || d.host === "emstudio-side")
    && Array.isArray(d.transport) && d.transport.length > 0
    && Array.isArray(d.capabilities)
    && !!d.versions && typeof d.versions === "object";
}

/** Capabilities this build does not know — reported, never silently ignored: an
 *  unknown capability from a newer peer is exactly the case the handshake exists
 *  for, and swallowing it would turn a version problem into a dead button. */
export function unknownCapabilities(d: ConnectorDescriptor): string[] {
  return d.capabilities.filter((c) => !CAPABILITIES.includes(c));
}

/**
 * Does this connector only ever read?
 *
 * Declared, not inferred from a name: `heriverse` is a consumer because of what
 * it asks for, and a viewer that grows an annotation write-back tomorrow stops
 * being one the moment it says so. Same predicate as
 * `s3dgraphy.contract.consumer.is_consumer`, so a peer is the same kind of thing
 * on both sides of the socket.
 */
export function isConsumer(d: ConnectorDescriptor): boolean {
  return d.capabilities.length > 0
    && !d.capabilities.some((c) => WRITING_CAPABILITIES.includes(c));
}

/**
 * A descriptor that contradicts itself, in one sentence — or null.
 *
 * The one contradiction that matters: `writes: false` beside a capability that
 * writes. The Python constructor RAISES on it (a descriptor is validated where it
 * is built), and this is the same refusal on the wire, where a partner's build
 * can send what our dataclass would never construct. Refused rather than
 * repaired: guessing which half the partner meant would either silence a real
 * write or offer an affordance that fails at the seam.
 */
export function descriptorContradiction(d: ConnectorDescriptor): string | null {
  const writing = d.capabilities.filter((c) => WRITING_CAPABILITIES.includes(c));
  if (d.writes === false && writing.length)
    return `«${d.name}» declares ${writing.join(", ")} and writes:false — one of `
      + `the two is wrong, and with writes:false the author refusal would never `
      + `fire`;
  return null;
}

/** capabilities grouped by layer — what the UI lists. */
export function layersOf(d: ConnectorDescriptor): Partial<Record<CapabilityLayer, string[]>> {
  const out: Partial<Record<CapabilityLayer, string[]>> = {};
  for (const cap of d.capabilities) {
    const layer = CAPABILITY_LAYER[cap];
    if (!layer) continue;
    (out[layer] ??= []).push(cap);
  }
  return out;
}

// ── the handshake ───────────────────────────────────────────────────────────

/** A comparable tuple, tolerant of anything that is not `a.b.c` — the same rule
 *  as `s3dgraphy.tools.consumer_drift.version_key`, including the part that
 *  matters: an unparseable version sorts LOWEST, i.e. behind, which is the safe
 *  direction when nobody is watching. */
export function versionKey(version: string | null | undefined): number[] {
  const parts = String(version ?? "").split(".").map((chunk) => {
    const digits = chunk.replace(/\D+/g, "");
    return digits ? Number(digits) : 0;
  });
  return parts.length ? parts : [0];
}

function compare(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

export type VersionState = "aligned" | "behind" | "ahead" | "undeclared";

export interface HandshakeVerdict {
  ok: boolean;
  reason?: string;
  /** per field: what they said, what we speak, and the verdict */
  report: Record<string, { theirs?: string | null; ours?: string | null;
                           state: VersionState }>;
}

/**
 * Do we understand this connector?
 *
 * The **datamodel is strict**: it IS the EM language, and a peer a minor behind
 * writes edges this build resolves differently. The em.json schema and the
 * connector API are compared and only a MAJOR difference refuses — a document
 * format that gained a field is still readable, and refusing there would make
 * every release a flag day for every partner.
 *
 * The verdict carries the REASON in words, because that is the whole point: "you
 * speak datamodel 1.6.2, current is 1.6.11 — update it" is a sentence somebody
 * can act on, and a half-understood edge in a study is not something they can
 * undo.
 */
export function handshake(descriptor: ConnectorDescriptor,
                          ours: ConnectorVersions): HandshakeVerdict {
  const report: HandshakeVerdict["report"] = {};
  const fields: Array<keyof ConnectorVersions> =
    ["emjson", "datamodel", "connector_api"];
  for (const field of fields) {
    const theirs = descriptor.versions?.[field] ?? null;
    const mine = ours[field] ?? null;
    let state: VersionState;
    if (theirs == null) state = "undeclared";
    else if (theirs === mine) state = "aligned";
    else state = compare(versionKey(theirs), versionKey(mine)) < 0
      ? "behind" : "ahead";
    report[field] = { theirs, ours: mine, state };
  }

  const say = (field: string, state: VersionState): string => {
    const { theirs, ours: mine } = report[field];
    if (state === "undeclared")
      return `this connector does not say which ${field} it speaks — a peer `
        + `that will not say cannot be trusted with a write`;
    if (state === "behind")
      return `this connector speaks ${field} ${theirs}, current is ${mine} `
        + `— update it`;
    return `this connector speaks ${field} ${theirs}, newer than this build's `
      + `${mine} — update the study side`;
  };

  const datamodel = report.datamodel.state;
  if (datamodel !== "aligned")
    return { ok: false, reason: say("datamodel", datamodel), report };

  for (const field of ["emjson", "connector_api"]) {
    const state = report[field].state;
    if (state === "aligned" || state === "undeclared") continue;
    const major = (v?: string | null) => versionKey(v)[0] ?? 0;
    if (major(report[field].theirs) !== major(report[field].ours))
      return { ok: false, reason: say(field, state), report };
  }
  return { ok: true, report };
}

// ── the registry ────────────────────────────────────────────────────────────

/** How this session is working — DERIVED from what is connected, never set.
 *  `standalone` = nothing; `sidecar` = a paired host on this machine or LAN;
 *  `hub` = through a room. The same rule the sync modes follow, for the same
 *  reason: a mode that can be set is a mode that can be wrong. */
export type SessionMode = "standalone" | "sidecar" | "hub";

export class ConnectorRegistry {
  private readonly byName = new Map<string, ConnectorState>();

  /**
   * A connector announced itself. Returns its state — including a refusal, which
   * is a state and not an exception: a stale peer connecting is a normal event,
   * and the UI has to be able to show it with its reason.
   */
  announce(descriptor: unknown, options: {
    ours: ConnectorVersions;
    transport?: ConnectorState["transport"];
    role?: string | null;
    canWrite?: boolean;
    at?: number;
  }): ConnectorState | null {
    if (!isConnectorDescriptor(descriptor)) return null;
    // A self-contradiction is answered BEFORE the version question: telling a
    // partner their datamodel is stale when the real problem is that their
    // descriptor cannot mean anything sends them to read the wrong table.
    const wrong = descriptorContradiction(descriptor);
    const verdict = wrong ? { ok: false, reason: wrong, report: {} }
                          : handshake(descriptor, options.ours);
    const state: ConnectorState = {
      descriptor,
      transport: options.transport ?? descriptor.transport[0] ?? "direct",
      status: verdict.ok ? "accepted" : "refused",
      reason: verdict.reason,
      role: options.role ?? null,
      can_write: options.canWrite,
      announced_at: options.at ?? Date.now(),
    };
    this.byName.set(descriptor.name, state);
    return state;
  }

  /** It went away (a socket closed, a room was left). */
  forget(name: string): boolean {
    return this.byName.delete(name);
  }

  clear(): void {
    this.byName.clear();
  }

  /** Everything announced, by name — the registry IS the list the UI shows. */
  list(): ConnectorState[] {
    return [...this.byName.values()]
      .sort((a, b) => a.descriptor.name.localeCompare(b.descriptor.name));
  }

  get(name: string): ConnectorState | undefined {
    return this.byName.get(name);
  }

  /**
   * Who can do this — among the ACCEPTED ones, and only if the session lets them.
   *
   * Two gates, and they are different: the connector must have DECLARED the
   * capability (a promise it made) and, for a capability that touches the
   * document, the session must allow a write (a role the room resolved). A
   * connector never grants itself either one.
   */
  providers(capability: string): ConnectorState[] {
    const writing = WRITING_CAPABILITIES.includes(capability);
    return this.list().filter((s) =>
      s.status === "accepted"
      && s.descriptor.capabilities.includes(capability)
      && (!writing || s.can_write !== false));
  }

  can(capability: string): boolean {
    return this.providers(capability).length > 0;
  }

  /**
   * What this connector has actually been GRANTED here — declared ∩ allowed.
   *
   * What the registry SHOWS, and the reason it is not a field on the descriptor:
   * what a connector declared is a promise it made, what it may do is a decision
   * somebody else took. A viewer's connector that declared `write-graph` is
   * listed with the reads and without the write — no drama at the door, and no
   * write. Mirrors `s3dgraphy.contract.consumer.granted`.
   */
  granted(name: string): string[] {
    const state = this.byName.get(name);
    if (!state || state.status !== "accepted") return [];
    return state.descriptor.capabilities.filter(
      (c) => !WRITING_CAPABILITIES.includes(c) || state.can_write !== false);
  }

  /** The accepted connectors that only ever read — who this session is SERVING
   *  rather than collaborating with. */
  consumers(): ConnectorState[] {
    return this.list().filter((s) => s.status === "accepted"
                                     && isConsumer(s.descriptor));
  }

  /**
   * Who asked to be told when the study changes.
   *
   * The list that makes `subscribe` more than a word: the changes travel on the
   * EXISTING channel (`sync.ts`'s op frames, rebroadcast by the host or the
   * room), so a subscriber is not a new transport — it is somebody whose
   * presence means the op stream must actually leave this client.
   */
  subscribers(): ConnectorState[] {
    return this.providers("subscribe");
  }

  /** The session's mode, derived. */
  mode(): SessionMode {
    const live = this.list().filter((s) => s.status === "accepted");
    if (!live.length) return "standalone";
    return live.some((s) => s.transport === "cloud") ? "hub" : "sidecar";
  }
}

/** The capabilities that touch the document, i.e. the ones a role has to allow.
 *  Same list as `s3dgraphy.contract.connector.WRITING_CAPABILITIES`. */
export const WRITING_CAPABILITIES: readonly string[] =
  ["write-graph", "attach-asset", "materialize-3D", "ingest-batch"];
