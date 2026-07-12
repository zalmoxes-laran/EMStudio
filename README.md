# EMStudio

**The sovereign graph editor for the Extended Matrix** — one graph, two views:
the EM swimlane matrix (epochs as lanes, time flowing upward) and the full
knowledge graph with every relation visible. Web service and desktop app from
a single codebase.

> Status: read-only GUI (roadmap phases 2–3, July 2026) — core + CLI + layout
> engine v1 + web frontend (matrix/graph views) + Tauri shell scaffold.
> See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Why

The Extended Matrix ecosystem authors stratigraphic knowledge graphs today
through yEd + GraphML, with s3Dgraphy as the semantic engine behind it. That
pipeline works but caps the model: yEd cannot learn new node types (USM/USR
live only in label conventions), GraphML accumulates "belly data" it can
neither display nor edit, and the round-trip is structurally lossy.
EMStudio inverts the roles: **`.em.json` becomes the native format**
(property graph + layout section), GraphML becomes a legacy one-way import,
and the editor understands the EM node system natively — palette, sockets and
validation driven by the same versioned JSON datamodels that drive s3Dgraphy.

## Core design decisions

1. **One Rust core, three deliveries.** `em-core` (graph model, `.em.json`
   I/O, connection validation, layout engine) is delivered as: browser app
   against an `axum` server, desktop app via **Tauri** (core in-process,
   local files, embedded **Oxigraph** for local SPARQL), and CLI.
2. **Layout is a first-class engine, not manual placement.** Like yEd's
   hierarchic swimlane layout — but specialised: in EM the layer assignment
   is *semantic* (the epoch lane is given by `has_first_epoch` /
   `survive_in_epoch`), so the engine solves a constrained Sugiyama problem:
   fixed lanes, crossing minimisation, group-contiguity constraints,
   orthogonal routing, plus a "from sketch" incremental mode that respects
   manual adjustments. See ARCHITECTURE §4.
3. **Hypergraph folding.** Any group (paradata group, activity, series)
   collapses into a single proxy node; double-click enters an isolated
   canvas showing only its members; breadcrumb/back returns to the full
   graph. Folded state and per-context positions are part of the `.em.json`
   layout section. See ARCHITECTURE §5.
4. **Sovereignty by format.** `.em.json` v1 (FROZEN 11 July 2026) = header
   with format/datamodel/ontology versions + flat graph (nodes[]/edges[]) +
   optional reconstructable `layout`. Spec: [`docs/emjson-v1-draft.md`](docs/emjson-v1-draft.md);
   reference implementation in s3Dgraphy (`emjson_exporter` / `emjson_importer`).

## Quickstart — the two ways to run the GUI

**A. Browser (no install).** Build once, then double-click the file — it is a
single self-contained HTML that also works offline:

```bash
cd frontend
npm install        # first time only
npm run build      # → frontend/dist/index.html  (double-click it)
npm run dev        # OR: live-reload dev server at http://localhost:5173
```

**B. Standalone desktop app (Tauri).** Native window, no browser:

```bash
cargo install tauri-cli --locked   # first time only
cd apps/desktop
cargo tauri dev                    # run it
cargo tauri build                  # → .app / .dmg bundle
```

A third delivery — `em-server` (axum) serving the same frontend to Chrome at a
local address, for multi-user work — is phase 6 of the roadmap.

Core library and command line:

```bash
# prerequisites: Rust toolchain (https://rustup.rs)
cargo test                      # run the test suite (em-core)
cargo build --release -p em-cli # build the CLI → target/release/emstudio
cargo install --path crates/em-cli   # or: install `emstudio` into ~/.cargo/bin

# usage
emstudio validate  file.em.json          # header/format conformance + stats
emstudio stats     file.em.json          # node counts by type
emstudio layout    file.em.json -o out.em.json   # compute swimlane layout
```

`.em.json` files are produced from GraphML (or any s3Dgraphy source) with:

```python
from s3dgraphy.importer.import_graphml import GraphMLImporter
from s3dgraphy.exporter.emjson_exporter import export_emjson
export_emjson(GraphMLImporter("project.graphml").parse(), "project.em.json")
```

## Repository layout

```
crates/em-core/     Rust core: model, emjson I/O, validation, layout
crates/em-server/   axum HTTP/WebSocket delivery (skeleton, TBD)
apps/desktop/       Tauri v2 shell wrapping the web frontend
frontend/           web UI: TS + Vite, single canvas renderer, dual views
docs/               architecture, format spec, yEd parity checklist
schemas/            JSON Schema drafts for .em.json
```

## License

GPL-3.0-or-later. All runtime dependencies are GPLv3-compatible
(MIT / Apache-2.0 / MPL-2.0). The layout engine is our own — ELK would be
license-compatible (it declares the EPL-2.0→GPL-3.0 Secondary License) but
is excluded for architectural reasons (see ARCHITECTURE §4.1).

## Ecosystem

[Extended Matrix](https://extendedmatrix.org) ·
[s3Dgraphy](https://github.com/zalmoxes-laran/s3Dgraphy) ·
Heriverse · EM tools for Blender · developed within the
**StratiGraph** project (Horizon Europe GA 101232855) and the CNR ISPC
Extended Matrix framework.
