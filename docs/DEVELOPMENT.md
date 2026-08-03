# Development setup (from a clean clone)

EMStudio's batch-interop tools resolve **sibling repos**, so clone these
side by side under one parent directory:

```
<parent>/
  EMStudio/          # this repo
  s3Dgraphy/         # EM language reference impl (Python); dev.sh/tools use ../s3Dgraphy/src
  EM-blender-tools/  # EMtools Blender addon (sync server lives here)
```

## Prerequisites

- **Node.js 18+** (frontend / Vite).
- **Rust** via [rustup](https://rustup.rs) (`cargo` on PATH) — NOT Homebrew's
  `rust`. `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
  then `source "$HOME/.cargo/env"`.
- **Python 3.10+** for the interop tools / GraphML bridge.
- macOS: Xcode Command Line Tools (for Tauri) — usually already present.
- Only for **packaging** the desktop app: PyInstaller in the s3Dgraphy venv, plus
  the platform's own Tauri prerequisites (Windows: MSVC build tools + WebView2;
  Linux: `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`).
  See § *Packaging the desktop app*.

## One-time setup

```bash
# 1. s3Dgraphy venv (the GraphML bridge + em2graphml import it; pandas+lxml
#    are needed by the importer, sqlalchemy only for its own test suite)
cd s3Dgraphy
python3 -m venv .venv
.venv/bin/pip install -e '.[sync]' pandas lxml

# 2. EMStudio frontend deps
cd ../EMStudio/frontend
npm install
#   If Vite/rollup fails with "Cannot find module @rollup/rollup-darwin-arm64"
#   (npm optional-deps bug), reinstall clean:
#   rm -rf node_modules package-lock.json && npm install

# 3. Rust core (optional here; built on demand)
cd ..
cargo build --release -p em-cli   # → target/release/emstudio (CLI)
cargo test -p em-core             # 9/9 layout+emjson contract tests

# 4. Tauri desktop (optional — native app)
cargo install tauri-cli --locked
```

## Everyday dev

```bash
# Browser + live GraphML bridge together (macOS/Linux):
cd EMStudio
./dev.sh                 # frontend :5173 + Python GraphML bridge :8765
                         # (bridge uses ../s3Dgraphy/.venv python)

# Native desktop app (live reload, native Open/Save):
cd apps/desktop && cargo tauri dev
```

- Edit `frontend/src/**` → the browser hot-reloads.
- Edit the s3Dgraphy exporter → restart the bridge (Ctrl-C, re-run `dev.sh`);
  it imports s3Dgraphy once at startup.

## Packaging the desktop app (macOS · Windows · Linux)

The distributable app is the Tauri bundle **plus** a frozen Python sidecar: the
`em-bridge` binary the shell spawns at launch, which is what answers GraphML
export, resource previews and coordinate reprojection. Build the sidecar FIRST —
`cargo tauri build` picks it up from `src-tauri/binaries/` by target triple.

```bash
# 1. build venv for the sidecar (once per machine)
cd s3Dgraphy
python3 -m venv .venv
.venv/bin/pip install -e '.[sync,minio,geo]' pandas lxml pyinstaller
.venv/bin/pip install Pillow                     # image thumbnails (recommended)

# 2. the sidecar, for THIS machine's target triple
cd ../EMStudio/apps/desktop
./build-bridge.sh                                # → src-tauri/binaries/em-bridge-<triple>

# 3. the app
cargo tauri build                                # → .dmg / .msi / .AppImage
```

`build-bridge.sh` is the single source of truth for the freeze flags — read it
rather than reproducing its command line here. It prints, per optional engine,
whether it went in and what is lost if it did not.

**The sidecar is per-platform and per-architecture.** PyInstaller does not
cross-compile: each target needs a build on that OS (and on macOS, on that arch —
`aarch64-apple-darwin` and `x86_64-apple-darwin` are separate files, both of which
Tauri will look for when building a universal app).

### The optional engines, and what they cost

Measured on an M-series Mac, same code, only the flags differing:

| bundle | size | note |
|---|---|---|
| none of the three | 18 MB | reprojection 501s, no image thumbnails, PDF icon |
| **shipped: + pyproj + Pillow** | **26 MB** | what `build-bridge.sh` produces |
| + PyMuPDF as well | 47 MB | **not shipped** — 21 MB for a PDF cover page |

- **pyproj** (`s3dgraphy[geo]`) — needed by `/reproject` and
  `/georeference-scene`, i.e. by the map for any projected CRS (UTM, national
  grids). Its wheels bundle PROJ, so **no system GDAL is required** on any of the
  three OSes. Without it those endpoints return 501 and the map refuses honestly
  instead of guessing.
- **Pillow** — server-side image thumbnails. Worth it in the other direction too:
  a 2.2 MB orthophoto travels as ~40 kB instead of 2.9 MB of base64 (54× less).
- **PyMuPDF** — first page of a PDF, **deliberately excluded**. Developers who
  want PDF covers install it beside the *dev* bridge (`pip install pymupdf`;
  `./dev.sh` runs from the venv, nothing is frozen) — the packaged app shows the
  typed document icon, which is the pre-existing behaviour.
- **minio** (`s3dgraphy[minio]`) — `/ingest-minio` + `/presign`; 501 without it.

A caveat that is easy to get wrong: **these `--collect-submodules` flags do not
control whether a library is bundled.** PyInstaller's analysis follows imports
inside function bodies, so a lazily imported library present in the build venv is
included regardless. The flags add the data files and metadata the analysis cannot
infer; keeping something OUT requires `--exclude-module`, which is how PyMuPDF is
excluded.

### How the PROJ data directory gets into the binary

PROJ needs its datum database (`proj.db` and friends) at runtime. Three layers,
in the order they apply:

1. **pyinstaller-hooks-contrib** ships `hook-pyproj.py`, which collects
   `pyproj/proj_dir/share/proj` from a pip wheel automatically, and handles
   repackaged (Conda/Debian) layouts plus the Windows `delvewheel` DLLs. On a
   normal `pip install pyproj` this alone is enough on all three OSes.
2. `build-bridge.sh` **also** passes `--add-data <pyproj>/proj_dir/share/proj:
   pyproj/proj_dir/share/proj` — belt for an old hooks-contrib or a de-vendored
   pyproj. Harmless when redundant.
3. At runtime, `tools/em_bridge.py` → `_ensure_proj_data()` runs only when frozen:
   if `PROJ_DATA`/`PROJ_LIB` is unset and pyproj's own lookup would fail, it points
   `PROJ_DATA` at whichever bundled candidate actually contains `proj.db`. It does
   **not** import pyproj (that import stays lazy) and never overrides a variable
   the operator set.

If reprojection ever fails only in the packaged app — PROJ errors about missing
grids — this is the layer to look at. `PROJ_DATA=/path/to/share/proj` in the
environment is the escape hatch.

### Verify the build (the step that catches a missing PROJ)

Reprojection working in dev proves nothing about the bundle: the data files are a
packaging concern. Run the frozen sidecar directly and reproject a point whose
answer is a definition, not a lookup — easting 500 000 in UTM zone 33 **is** the
zone's central meridian, so it must come back as longitude exactly 15:

```bash
./src-tauri/binaries/em-bridge-<triple> --port 8799 &
sleep 8                                    # onefile unpack + cold start
curl -s -X POST http://localhost:8799/reproject \
  -H 'Content-Type: application/json' \
  -d '{"x":500000,"y":4649776.22,"epsg_source":32633}'
# → {"ok": true, …, "lon": 14.999999999999982, "lat": 41.99999995659526}
```

`lon: 15.000…` means PROJ found its data. A 501 means pyproj is not in the bundle;
a PROJ error about `proj.db` means the data files are not (see the three layers
above). Two more checks worth the ten seconds:

```bash
# Pillow IS bundled → a big image answers with a resized thumbnail
curl -s -X POST http://localhost:8799/resource-preview -H 'Content-Type: application/json' \
  -d '{"resource_id":"<id>","folder":"/path/to/a/scanned/folder"}'   # "thumbnail": true
# PyMuPDF is NOT → a PDF answers with its type, and the UI draws the document icon
#   → "media_type": "application/pdf", "no_inline": true
```

Then kill it (`lsof -ti tcp:8799 | xargs kill`) before launching the app, or the
app's own sidecar finds the port taken.

## Live sync with Blender (ADR-002, phase 1 — WIP)

The WebSocket transport lives in `EM-blender-tools/sync_bridge/ws_server.py`
(stdlib only, no `websockets` package needed). EMStudio connects as a client
via the **Sync** toolbar button (`ws://localhost:8788`). The Blender-side
`sync_manager` operator/panel that runs the server is not committed yet.

## What is NOT in the repo (regenerated / local)

`frontend/node_modules/`, `frontend/dist/`, `target/`,
`apps/desktop/src-tauri/target/`, `apps/desktop/src-tauri/gen/` (Tauri
regenerates the capability schemas on build), any `.venv/`, and `.claude/`
(local Claude Code tooling). All are `.gitignore`d — a clean build recreates
them. `apps/desktop/src-tauri/Cargo.lock` **is** committed (reproducible app
builds).
