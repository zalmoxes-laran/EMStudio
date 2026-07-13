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
