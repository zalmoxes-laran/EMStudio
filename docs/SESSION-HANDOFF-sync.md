# Handoff — EMStudio ⇄ EMtools live sync + EMStudio authoring UX

_State as of 2026-07-14. Two repos side by side: `EMStudio/` (TS/Vite frontend +
Rust core) and `EM-blender-tools/` (EMtools, the Blender addon). Sibling
`s3Dgraphy/` (Python reference impl). ADR: `EMStudio/docs/adr-002-sync-architecture.md`._

## 1. What this work is

Two tracks, done together:

- **EMStudio authoring UX** — make EMStudio a real graph editor (add nodes/epochs,
  group, multi-select, pan, drag in/out of groups, em.json load/save).
- **Live sync EMStudio ⇄ EMtools** (ADR-002) — EMStudio is a WebSocket **client**,
  EMtools (Blender) is the **host** running a stdlib WS server; **em.json is the
  canonical format** (GraphML is legacy import-only). One graph, propagated as
  ops + an initial snapshot.

## 2. Status — DONE (all built + verified in pieces; see §4 for the gap)

**EMStudio frontend (`EMStudio/frontend/src`)**
- **em.json Load/Save** wired into EMtools (see below); EMStudio already had Save/Save As.
- **Empty-canvas boot** (no auto-fixture) + **New** (empty graph) + **clear-on-Sync-disconnect** + **sync-mode colour indicator** (header/footer green while synced).
- **Add epochs** in a new graph: palette `EpochNode` → click → `DocumentStore.addEpoch()` mints an EpochNode + a swimlane (Matrix lane / Graph node).
- **Canvas gestures (D):**
  - Pan-always via **middle-drag or Space+drag** (empty-canvas left-drag is now **marquee**).
  - **Shift+drag** pulls node(s) **out** of a group (`removeFromGroup`).
  - **Drop into a group box** re-parents (innermost/matryoshka wins, datamodel-constrained edge); drop in another **lane** re-assigns `has_first_epoch`. Works for the **whole multi-selection**.
  - **Multi-select**: shift/cmd-click toggles, **left-drag empty = marquee**; two-tier highlight (active bold, selected medium) via a screen-space overlay in `draw()`.
  - **Right-click → Group** (`import.em_graph`-style menu): creates a NodeGroup whose type is **constrained to what the datamodel allows** for the selection.
  - **Multi-move fidelity**: `moveOneByDelta` moves each selected node respecting its container (members via `moveInGroupSpace`, free via `moveNode`); group-drag still uses `moveNodesBy`.
- **Header dropdowns**: File ▾ (New/Open/Save/Save As), Export ▾ (SVG/GraphML).
- **Op-log** (`model.ts` `GraphOp`): `update_node | add_node | delete_node | add_edge | delete_edge`; every mutation (incl. addEpoch/groupNodes/moveToGroup/removeFromGroup/setFirstEpoch) emits granular ops; `applyRemoteOp` applies incoming ones without re-emitting.
- **Snapshot / selection sync** in `sync.ts`: `request_snapshot`/`snapshot` (doc) + `select` with `node_id` + `node_ids` (multi).

**EMtools / Blender (`EM-blender-tools`)**
- **em.json import/export operators**: `import.em_emjson` (Load, ImportHelper; registers the graph in the multigraph since `parse_emjson` doesn't; `file_index` for silent per-row reload), `export.em_saveas` (Save As… — **em.json full/lossless** default OR **GraphML not-lossless** via from-scratch `GraphMLExporter`), `export.em_save` (in-place em.json). `emjson_support.py` wraps s3dgraphy `export_emjson`/`import_emjson`/`graph_to_emjson_dict`/`build_emjson`.
- **UI** (`em_setup/ui.py`): "Add graph / Remove graph" + "Save / Save As…"; per-entry Path auto-detects format (`file_format` on `GraphMLFileItem`, `detect_graph_format`); per-row 🔄 reload dispatches by format.
- **Sync server** `sync_manager/` — **event-driven, NO polling timer**:
  - Outbound selection via `bpy.msgbus.subscribe_rna` on active object.
  - Inbound via WsServer `on_message` → **one-shot** `bpy.app.timers.register(_drain_inbox, first_interval=0)`.
  - `_apply_op`: `update_node` (targeted) + structural `add/delete node/edge` (via `Graph.add_node`/`add_edge`/`remove_*`, node built by the importer's `_instantiate`); **repopulate is BATCHED** (once per drain burst via `_pending_repop`).
  - Snapshot on `request_snapshot` (`build_emjson`); multi-select in/out (`node_ids`, `_apply_incoming_select_many`, full selection broadcast, `_last_selection` echo guard).
- **Reverse Blender→EMStudio**:
  - **Description** edit in the Stratigraphy Manager writes to the graph node + emits `update_node` — via `EMListItem.description` `update=` callback (`stratigraphy_manager/data.py`), guarded so it only emits when the value actually differs from the node (no populate/echo loop).
  - **Add-US** (structural): emit `add_node` + new edges from the **graphml-independent factory `create_us_node`** (`us_helpers.py`), so it fires for every create-US flow (add_us / ProxyBox / Surface Areas), decoupled from the GraphML persist in `strat.add_us`.

## 3. Architecture decisions (do not re-litigate)

- **em.json is canonical** for sync/authoring; GraphML is legacy (import in 1.6, convertible from 1.7). `.em.json` (not `.emjson`) — stays a valid `.json`.
- **Host = role** (ADR-002). Local pairing: Blender hosts, EMStudio is the WS client. Two web tools (EMStudio, Heriverse) never pair directly — they'd share the **StratiGraph Service**.
- **No polling timers** in Blender (msgbus + one-shot dispatch only).
- **Sync edits are graphml-independent**: mutate the s3dgraphy graph + repopulate + emit. The **host persists em.json on Save** (no auto-graphml).
- **GA mapping** (GAP-101232855): "em-server" = **StratiGraph Service** (orchestrator) fronting **KG Engine** (graph/triple store) + **Cloud Storage Module** (objects); s3dgraphy is the *model the server speaks*, not the server. Heriverse-Server (`GitHub/Heriverse-Server`, Node/Express + CouchDB + Keycloak + S3, already under the `stratigraph/` registry namespace) covers Cloud Storage + Auth, NOT the KG Engine. KG backend evolution: **oxigraph** local → **Virtuoso** on a Field Computing Node → remote sync.

## 0. NEXT SESSION — agreed order (Emanuel, 2026-07-14)

Do the three tracks **in this exact order**, one at a time:

1. **(a) Live round-trip verification** (§4) — the top-priority gap. Emanuel
   drives (reload addon, Start Sync :8788, connect EMStudio, run the flows);
   assist on errors. Start here.
2. **(b) Backlog item** (§5) — after the live test is green: reverse name/epoch
   from Blender (needs Blender authoring UI), the msgbus shrink-selection limit,
   container-member multi-move fidelity, re-parent-on-Group-draws-box.
3. **(c) Cloud phase** (§5 last bullet) — StratiGraph Service / KG Engine
   (em-server), oxigraph→Virtuoso on a Field Computing Node, Heriverse via the
   shared host, Keycloak/ORCID auth.

Session stopped here for the evening; nothing new was coded this turn.

## 4. THE GAP — verify live (top priority)

Almost everything above was verified **in pieces** (direct `_apply_op`/callback/factory
calls, captured broadcasts, `tsc+vite`/`py_compile`). The **live WS round-trip has NOT
been exercised end to end.** First next step:

1. **Reload the EMtools addon** (VSCode → "Blender: Reload Addons") — property/msgbus/hook
   changes need a re-register. EMStudio frontend is on Vite HMR (or `npm run build`).
2. In Blender: reopen the project, **Start Sync** (panel "EMStudio Sync", tab EM, port 8788).
3. In EMStudio: toolbar **Sync** → `ws://localhost:8788`.
4. Drive and confirm:
   - EMStudio → Blender: add a node / add an epoch / group nodes / edit a description → appears in Blender's graph + lists.
   - Blender → EMStudio: **strat.add_us** a US / edit a unit's **description** → appears in EMStudio.
   - selection single + multi both ways; snapshot shows Blender's graph on connect.

## 5. Backlog / next steps (after the live test)

- Consolidate whatever the live test reveals.
- **Reverse for name / epoch** from Blender — deferred: no clean Blender edit surface
  (name not inline-editable; no per-unit epoch edit UI; rename fragile because
  `EMListItem.node_id` is often empty). Needs Blender authoring UI first.
- Selection reverse limitation: `msgbus` fires on **active** change, so shrinking a
  selection without changing active may not re-broadcast.
- **Cloud phase** (big arc): StratiGraph Service / KG Engine (em-server), oxigraph→Virtuoso,
  Heriverse via the shared host, Keycloak/ORCID auth.

## 6. Gotchas / dev flow

- **s3dgraphy in Blender**: `./em.sh s3d` rebuilds+installs the dev wheel from the sibling
  repo (needs Blender **restart**). The installed wheel was `1.6.0.dev10` WITHOUT
  `emjson_exporter`/`emjson_importer` until this flow was run.
- Addon runs from `~/Library/Application Support/Blender/5.1/extensions/vscode_development/EM-blender-tools`
  (VSCode "Blender Development" symlink). Module import in MCP:
  `importlib.import_module("bl_ext.vscode_development.EM-blender-tools.<sub>")` (hyphen in name).
- `bpy.app.timers`/`msgbus` don't fire when Blender is driven headlessly via MCP — test apply
  logic by calling functions directly.
- `populate_blender_lists_from_graph` **appends** (no internal clear) — always `clear_lists`
  first (fixed the doubled-rows bug).
- `cargo`/`emstudio` CLI: `export PATH="$HOME/.cargo/bin:$PATH"` in Bash.

## 7. Persistent memory

Full dense append-log lives in the Claude memory:
`project_emstudio_graphml_roundtrip` (auto-recalled in a new session on this machine).
This file is the readable synthesis of it.
