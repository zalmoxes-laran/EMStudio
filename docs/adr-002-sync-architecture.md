# ADR-002 — Live sync & source of truth across EM tools

Status: **accepted** (E. Demetrescu, July 2026).
Scope: EMStudio, EM-blender-tools (EMtools), Heriverse, and the future
`em-server`, whenever two or more of them work on the **same** EM graph at
the same time. Builds on ADR-001 (s3Dgraphy is the language's source of
truth); this ADR is about the *runtime* data, not the language.

## Problem

The whole ecosystem now speaks one formalism (s3Dgraphy / `.em.json`).
EMStudio can create, import, convert and **edit** a graph; EMtools loads a
live s3dgraphy graph in Blender to drive the 3D; Heriverse renders
`.em.json` on the web. As soon as two tools touch the same graph, three
questions decide everything:

1. **Who holds the canonical data** while they are connected?
2. **What travels on the wire** — files, or operations?
3. **Who is the source of truth** when the session goes online / multi-user?

The interop history frames the risk. yEd → GraphML was one-way, single
writer. EMtools then also *wrote* GraphML — but only safely "with yEd
closed", i.e. collisions were avoided **by hand**. `.em.json` gives full
freedom but reproduces the same two-writers hazard unless we make a
deliberate choice.

## Decision

### 1. The source of truth is a ROLE — the *host* — not a fixed tool

Every live session has exactly **one host** that owns the canonical graph
in memory; all other participants are **clients** (viewer/editors) that
send it operations. "Host" is a role that different tools can play:

| Session | Host (source of truth) | Others | Persists the file |
|---|---|---|---|
| EMStudio alone | EMStudio (`DocumentStore`) | — | user (Save) |
| 3D-centric (Blender open) | **EMtools/Blender** (s3dgraphy in memory) | EMStudio = client editor | Blender |
| Graph-centric (desktop) | **EMStudio-desktop (Tauri)** | Blender/other = client | EMStudio |
| Online / multi-user | **em-server** (CRDT) | all clients | server |

Host ≠ editor: the host is the authoritative store + the server endpoint,
not "who is typing". A rich editor talking to an authoritative store is the
normal client-server shape.

### 2. A browser can only be a WebSocket client

Hard constraint that resolves most ambiguity: a browser cannot be a WS
*server*. Therefore **EMStudio-in-a-browser is always a client**. Only a
native process can host: EMtools (Python asyncio server inside Blender),
**EMStudio-desktop** (Tauri/Rust can run a WS server), or `em-server`.
Which native tool hosts is negotiated per session by "who is primary / who
opened the project", constrained by "must be able to run a server".

### 3. Two independent channels

- **Selection / focus** (ephemeral): `{type:"select"|"focus", node_id}`.
  Bidirectional, mutates no data → **no ownership concern**. This is the
  "click here, see there" between Blender and EMStudio.
- **Op-log** (mutations): `add/update/delete node/edge`, `move`,
  `layout-patch`. Flow **only toward the host**, which applies them to the
  one canonical graph and re-broadcasts. EMStudio-client never hands over a
  file — it *proposes operations*.

### 4. The file is persistence, not a live surface

No shared file for live work (races, no fine-grained ops). The `.em.json`
on disk is written by the **host** at save time. Live state lives in the
host's in-memory graph + op-log.

### 5. Single-host is what removes collisions

Collision = two independent copies edited apart and reconciled (the yEd
file + the EMtools file). With one host there is **one** authoritative copy
and no divergence — the structural replacement for "close yEd first".
Collisions only return **while disconnected** (two tools editing the same
file offline), and are then mitigated by:

### 6. Node identity is a UUID

Every node id is a UUID (identity), separate from `name` (human label).
New nodes created in the EMStudio GUI now mint a UUID (`DocumentStore.newId`)
instead of the old sequential `US_01` id, so nodes minted independently in
EMStudio and EMtools never clash on merge/sync. Imported nodes already carry
their GraphML EMID (a UUID).

### 7. One protocol, from local pairing to the server

The host↔client op-log is designed **once**. In local pairing the host is a
peer tool; online the same op stream is what `em-server` reconciles as a
CRDT. Local pairing is not throw-away — it is the first implementation of
the phase-6 protocol.

## Options considered

- **A. Shared file + locking** — rejected: it is exactly today's manual
  "close the other tool" discipline; no live interaction, race-prone.
- **B. Single-host op-log over WebSocket** — **CHOSEN**: one authoritative
  in-memory graph, operations on the wire, host role negotiated per session,
  same protocol reused by `em-server`.
- **C. Full CRDT in every tool from day one** — deferred: the CRDT belongs
  in `em-server` (phase 6); peer-to-peer CRDT between two desktop tools is
  more than the near-term scenarios need.

## Consequences — phased plan

1. **Phase 1 (first code):** selection/focus sync EMStudio ↔ Blender.
   Blender runs the WS server (asyncio + `bpy.app.timers`); EMStudio is the
   client. Zero ownership risk, immediate "click here / see there" value,
   and it stands up the transport reused by phase 2.
2. **Phase 2:** op-log data sync with Blender as host — an EMStudio edit
   becomes an operation applied to EMtools' s3dgraphy graph (3D updates
   live). Same protocol `em-server` will speak.
3. **Phase 3:** `em-server` (online, CRDT) — the host role moves from a peer
   tool to the server; clients are unchanged.

## Open questions (to refine through iterations)

- Host discovery / negotiation and reconnection (fixed localhost port to
  start; a real handshake later).
- EMStudio-desktop as host (Tauri WS server) — needed for graph-centric and
  EMStudio↔Heriverse sessions (two web viewers cannot pair without a host).
- Offline reconciliation when a graph *was* edited in two places
  disconnected (UUIDs help; a merge/diff tool may be needed).
