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

## Quickstart — how to run EMStudio

**A. Standalone desktop app (Tauri).** Native window, no browser, with
native **Open / Save / Save As…** dialogs (⌘S save in place, ⇧⌘S save as)
and the open file + dirty state shown in the window title:

```bash
cargo install tauri-cli --locked   # first time only
cd frontend && npm install         # first time only
cd ../apps/desktop
cargo tauri dev                    # run (dev, live reload)
cargo tauri build                  # → .app / .dmg bundle to install
```

**B. Zero-install browser file.** One self-contained HTML, works offline:

```bash
cd frontend
npm install        # first time only
npm run build      # → frontend/dist/index.html — double-click it
```

**C. Server + client (local network).** Serve the built app at a local
address and open it from any browser (yours or a colleague's on the LAN):

```bash
cd frontend
npm run build
npm run serve      # → http://<your-ip>:4173  (Vite preview, --host)
npm run dev        # dev alternative: http://localhost:5173, live reload
```

This is single-user-per-document for now; the multi-user `em-server`
(axum, CRDT) is phase 6 of the roadmap and will serve the same frontend.

**D. Iterative dev stack (`./dev.sh`, macOS/Linux).** One command starts
the Vite frontend (live reload, no Tauri rebuild) *and* the local Python
GraphML bridge that backs the in-app **GraphML** export button:

```bash
./dev.sh                 # frontend :5173 + bridge :8765
./dev.sh --port 8888     # override the bridge port
```

The frontend cannot run s3Dgraphy (ADR-001 invariant 2: batch interop
stays in Python), so the GraphML button POSTs the current `.em.json` to
`tools/em_bridge.py`, which runs the s3Dgraphy exporter in-process and
returns a yEd-openable `.graphml` for download (US/USD/VSF containers,
ActivityNodeGroups, continuity BR diamonds, epoch swimlanes). Edit the
frontend and just reload; edit the Python exporter and restart the bridge
(Ctrl-C, re-run `./dev.sh`). The bridge needs a Python that can import
s3Dgraphy (pandas + lxml) — `dev.sh` prefers `../s3Dgraphy/.venv`.

**Importing a yEd GraphML.** Batch interop runs on the Python reference
implementation (see `docs/adr-001`, Addendum C):

```bash
python3 tools/graphml2em.py project.graphml project.em.json
emstudio layout project.em.json -o project.em.json   # compute the layout
```

then open `project.em.json` from EMStudio (Open… or drag & drop). The
importer needs `s3dgraphy` (pip install, or `--s3dgraphy` pointing at a
checkout's `src/`).

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
