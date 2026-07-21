# EMStudio — working notes for AI-assisted development

EMStudio is the sovereign graph editor for the Extended Matrix (EM 1.6):
one graph, two projections (swimlane **Matrix view** and full **Graph
view**), one Rust core with three deliveries (browser, Tauri desktop, CLI).
It is part of the StratiGraph ecosystem (CNR ISPC, Horizon Europe GA
101232855) alongside **s3Dgraphy** (Python reference implementation) and
**EM-blender-tools** (EMtools). Developed intensively with AI assistance in
July 2026; this file is the handoff map — read it before touching anything.

## Non-negotiable invariants (decisions already made, do not re-litigate)

1. **The s3Dgraphy JSON datamodels are the single source of truth** for the
   EM language (ADR-001, `docs/adr-001-s3dgraphy-consumption.md` — read it).
   `frontend/src/assets/*` are pinned vendored copies refreshed ONLY via
   `frontend/scripts/sync-datamodels.sh <path-to-s3Dgraphy>`. Never edit
   them by hand, never hardcode EM types/colours/rules anywhere.
   The class hierarchy lives in `s3Dgraphy_node_datamodel.json`
   (`node_types` entries with `parent`/`node_type`), kept in sync with the
   Python classes by `python -m s3dgraphy.tools.sync_node_datamodel`.
   **The whole UI is data-driven from the JSON config — as much as
   possible.** Not only node types/colours, but the palette, allowed
   connections, the "circles of detail" filters, the create-node menus and
   their taxonomic submenus, and controlled vocabularies (e.g.
   `em_qualia_types.json` for property labels) all derive from the vendored
   `frontend/src/assets/*` datamodels. Adding a node/edge type, a rule, or a
   vocabulary term happens in s3Dgraphy + `sync-datamodels.sh`, never in
   hand-written UI code. When you build UI that enumerates EM concepts,
   read the datamodel, don't hardcode a list.
2. **No JavaScript port of s3dgraphy.** Runtime semantics live in em-core
   (Rust), delivered to the web as WASM (`crates/em-wasm`, rebuilt with
   `frontend/scripts/build-wasm.sh`). Batch interop (GraphML import/export,
   Excel) stays in Python (`tools/graphml2em.py`).
3. **Arrows point DOWN.** A directed edge means "source above target"
   inside its container; chronologically earlier = lower on screen.
   Symmetric connectors (`has_same_time`, `equals`, `is_physically_equal_to`,
   `bonded_to`, `is_bonded_to`, `contrasts_with`) sit side by side.
   `layout::upward_edges()` reports residual violations as data warnings.
4. **Epochs are swimlanes**, not nodes, in Matrix view (they are nodes only
   in Graph view). Lane order: newest on top.
5. **Containment is a relation, not a node type.** yEd US/USD/VSF
   containers = regular stratigraphic nodes + `is_part_of` (CIDOC P46i).
   Every EM node group renders as a yEd-style container (outline box around
   engine-placed members). Multi-membership is legal in the graph; the
   DRAWING follows the **primary parent** (priority: is_part_of >
   paradata group > location > timebranch > activity; ties by node order) —
   secondary memberships stay visible as edges.
6. **Master/Instance documents (EM 1.6).** The graph holds ONE document
   node (the GraphML importer dedupes); the drawing re-instances it per
   usage context with a corner use-count decorator. Border width = Master
   role, border colour = geometry variant (`document_variant_styles`).
   Data travels in `data.is_master` / `data.certainty_class` /
   `data.instances` (emjson exporter lifts `node.attributes`).
7. **Determinism is a contract**: same document → same layout, across CLI,
   WASM and desktop (verified byte-identical). The 8 tests in
   `crates/em-core/src/layout.rs` are the behavioural contract — they must
   stay green through any engine change.
8. **From-Sketch + fold compaction**: the Layout action preserves manual
   arrangements by default (Alt = fresh) and folded groups release their
   space on re-layout.

## Architecture map

- `crates/em-core` — model, em.json I/O, validation, **layout engine v4**:
  recursive group layout (`layout_container`): every group is laid out as
  its own hierarchic subgraph (local topological layering with edges
  projected onto member representatives, local barycenter, width-aware row
  wrapping, median X alignment with column reservation) and becomes a rigid
  macro-block in its parent. Key rule: `layer[v] >= layer[u] + span(u)` —
  successors of a tall block go BELOW it. Lane assignment is semantic
  (`has_first_epoch` + chain + membership inheritance in both directions).
- `crates/em-wasm` — manual-ABI cdylib (no wasm-bindgen): `em_alloc` /
  `em_layout` / `em_free` / `em_free_result`; input `{graph, layout?}`
  (layout = From-Sketch + folded_groups), output `{ok: Layout}|{err}`.
- `crates/em-cli` — `emstudio validate|stats|layout [--from-sketch]`.
- `apps/desktop` — Tauri v2 shell (OUTSIDE the root cargo workspace on
  purpose). TODO: native file open/save instead of browser download.
- `frontend` — TS + Vite single-file build (`emptyOutDir:false`, all assets
  inlined). Modules: `model.ts` (DocumentStore: the in-memory truth is the
  em.json document itself — plain JSON graph + layout — with snapshot
  undo/redo; s3dgraphy is NOT in memory), `rules.ts` (socket validation
  from the datamodels), `folding.ts` (membership, primary containment,
  fold projection), `views/matrix.ts` (containers, instancing, lane
  elasticity), `views/graph.ts` (layered projection + liquid type
  filters), `routing.ts` (orthogonal edges, ports, crossing bridges),
  `renderer.ts` (canvas; official 2D icons; vector property chip and
  document sheet), `emcore.ts` (WASM bridge), `svg-export.ts`.
- Test fixture: `frontend/testdata/TempluMare.em.json` — regenerate with
  `tools/graphml2em.py` + `emstudio layout` after import/export changes.

## Build & verify

```bash
cargo test                                   # 8/8 = engine contract
cargo build -p em-cli --release
./frontend/scripts/build-wasm.sh             # after touching em-core
cd frontend && npm run build                 # single-file dist
```
Visual check: load `frontend/dist/index.html` (the app auto-loads the
fixture when served, or open the file and drop an .em.json).

## Backlog (owner: Emanuel — ordered, July 2026)

1. **GraphML exporter** (round-trip): Python side, next to the importer.
   - DONE (July 2026): `is_part_of` US/USD/VSF containers now re-emit as
     yEd group nodes (nesting, not edges — yEd edges carry only a line
     style, so an explicit `is_part_of` would re-import as a bogus
     `is_after`). Wired `generate_us_container_group` into
     `s3Dgraphy exporter/graphml/graphml_exporter.py` step 6b, dropped
     `is_part_of` from `export_edges`, container name+description survive.
     CLI: `tools/em2graphml.py` (em.json → GraphML). Regression test:
     `tests/test_lossless_roundtrip.py::test_is_part_of_container_roundtrip`.
     Verified on TempluMare: is_part_of 28→28, 10 containers, no regression.
   - DONE (July 2026): continuity/BR round-trip. BR nodes now emit as a
     `<Shape type="diamond"/>` ShapeNode (node_generator
     `_generate_continuity_node`) instead of the US-shape fallback that
     broke re-import recognition. Result: survive_in_epoch 15→15, US
     10→10 (was 10→48). Life-span classification: only US/serSU live to
     the most recent epoch by default (bounded → BR diamond); special
     finds (SF/RSF), documentary (USD/serUSD), negatives/transforms and all
     virtuals are BIRTH-ONLY (BR only to EXTEND life). Single source of
     truth `s3dgraphy.classification.CONTINUITY_PERSISTENT_TYPES` shared by
     the exporter and the importer's positional rule. Result: diamonds
     38→2, BR 2→2. Tests: `test_continuity_diamond_roundtrip`,
     `test_special_finds_are_birth_only`.
   - DONE (July 2026): **activity groups** (`is_in_activity`). Single-parent
     nesting pass (step 5c + `generate_activity_group`, #CCFFFF): activities
     render as yEd group nodes nested in the swimlane; members (strat nodes,
     containers, PD groups) nest inside, priority is_part_of > activity per
     invariant 5. `is_in_activity` dropped from export_edges. Verified:
     is_in_activity 76→78, ActivityNodeGroup 6→6, is_part_of/survive_in_epoch
     intact. Test: `test_activity_group_roundtrip`. (PD-group activity
     membership is approximate — the exporter synthesises PD groups by
     us_node, so a PD group inherits its us_node's activity; count drifts
     17→20 synthesised, hence 76→78 not exactly 76→76.)
   - TODO: re-emit document instances from `data.instances` (the graph
     holds ONE doc node per invariant 6; instances are a drawing concern).
2. **Tauri real file ops**: DONE (July 2026) — native Open/Save/Save-As via
   tauri-plugin-dialog + tauri-plugin-fs. Frontend routing lives in
   `frontend/src/tauri.ts` (`isTauri()` gate; open→dialog+fs read, save→fs
   write in place, save-as→dialog save, `setWindowTitle` for the
   dirty-state title). `main.ts` tracks `currentFilePath`; Save falls back
   to Save-As when no path, and both fall back to browser download /
   `<input type=file>` when not in Tauri. Save-As button + ⇧⌘S. Rust:
   `apps/desktop/src-tauri` registers both plugins in `main.rs`;
   `capabilities/default.json` grants dialog + fs read/write text (scope
   `**`) + `core:window:allow-set-title`. Frontend verified (build +
   browser fallback); the Rust/desktop side needs `cargo tauri dev` to
   verify natively (no cargo in the dev sandbox). Likely tweak if it
   fails: the fs scope `**` (Tauri glob) — narrow/adjust to the real path
   roots if read/write is denied.
   - DONE (July 2026): **GraphML transformer as a pluggable service**. The
     Python transformer (`tools/em_bridge.py` + s3Dgraphy; `/health`
     `/graphml` `/import-graphml`) now reachable from the packaged app.
     Endpoint precedence (frontend `bridgeUrl()` in main.ts + `transformerUrl()`
     in tauri.ts → Rust `transformer_url` command): `?bridge=` > `window.EM_BRIDGE`
     > desktop (remote `EM_TRANSFORMER_URL` — a StratiGraph server — else the
     local sidecar) > browser-dev `localhost:8765`. `main.rs` registers
     tauri-plugin-shell and, unless `EM_TRANSFORMER_URL` is set, spawns the
     bundled `em-bridge` sidecar on :8765 at launch (killed on exit; graceful
     if missing/port-taken). Sidecar = PyInstaller-frozen bridge built by
     `apps/desktop/build-bridge.sh` → `src-tauri/binaries/em-bridge-<triple>`
     (bundle.externalBin, gitignored; data via --add-data; ad-hoc signed).
     Cold start a few seconds (onefile + pandas); speed-ups: `--onedir` or
     `--exclude-module pandas`. This is the "many dockerised services in
     parallel" hook — same contract points at a remote transformer online.
3. **GUI refinements** (Emanuel's list, first pass DONE July 2026):
   - Header overflow fixed: body is now a column flex (header · main · footer);
     the toolbar `flex-wrap`s instead of clipping, and `#breadcrumb` + `#info`
     moved OUT of the crowded header into a new `<footer id="statusbar">` — so
     entering a hypergraph (context breadcrumb) no longer overflows.
   - Canvas header metadata editable: the inspector's no-selection state now
     shows a "Canvas" panel with editable Name + ID (`store.updateGraphMeta`).
     The richer base paradata (authors/license as real nodes) is deferred.
   - Stratigraphic nodes get a THICK coloured frame (the historical EM look):
     `NodeStyle.borderWidth` (from `em_visual_rules` `border_width` if present,
     else 2.6) used by the renderer's shape stroke. Colours already came from
     the visual rules.
   - Still TODO (Emanuel: "poi lo miglioreremo"): expandable header sections,
     base-paradata nodes (title/authors), per-type border widths in the rules.
4. **EMtools (Blender)**: ship the emjson importer in the addon.
5. **Realtime bridge EMStudio ⇄ EMtools**: design fixed in
   **`docs/adr-002-sync-architecture.md`** (July 2026). Source of truth =
   a single HOST role per session (not a fixed tool); browser EMStudio is
   always a WS client, EMStudio-desktop/EMtools/em-server can host. Two
   channels: ephemeral selection/focus vs the op-log (add/update/delete/
   move/layout-patch → host applies + rebroadcasts, same stream em-server
   will CRDT). Single-host removes collisions while connected; UUID node
   ids (done — `DocumentStore.newId`, GUI nodes no longer `US_01`) guard
   offline merges. Phased: (1) selection sync EMStudio↔Blender (Blender
   host, EMStudio client) — NEXT; (2) op-log data; (3) em-server.
6. **Auth**: Keycloak (existing StratiGraph services) + ORCID as user id —
   enters with em-server (phase 6); frontend OIDC flow.
7. **Multigraph + cross-graph edges** (Emanuel knows the design), and
   internal citation edges rendered ONLY in Graph view, hidden in Matrix
   view (hook exists: per-view edge filtering in `buildScenes`).
8. Engine polish: MOSTLY DONE (July 2026). Removed the unused
   `max_row_nodes` LayoutOptions field + the dead `Ctx.graph` field (0
   warnings). `sectors` + `edge_routes` now PERSIST across a re-layout —
   `compute_with_sketch` carries them from the sketch instead of clobbering
   to empty (the engine still doesn't synthesise them; test
   `sectors_and_edge_routes_persist_across_relayout`, 9/9 green). The
   upward alignment sweep stays DISABLED: re-enabling keeps tests green and
   deterministic but blows the TempluMare canvas from ~3213 wide to ~28223
   (9x) — the documented "unstable with column reservation" regression;
   proper re-enable needs a fix to the multi-layer block-reservation
   interaction, not just the extra sweep (see the comment at the sweep
   loop). Still open: persist `folded_groups` on output (currently reset to
   empty in the returned Layout).

## Gotchas

- If cargo seems to compile stale code after out-of-band file edits,
  `touch` the changed .rs files (mtime granularity on synced folders).
- `frontend/dist` is not emptied on build (deliberate); the .wasm in
  `frontend/src/wasm/` is vendored — rebuild it explicitly.
- yEd parity reference: `docs/yed-parity.md` + Emanuel's dialog screenshots
  (General/Edges/Layers/Labeling/Grouping/Swimlanes/Grid) drive parameter
  naming in `LayoutOptions`.
