#!/usr/bin/env bash
# EMStudio dev launcher (macOS / Linux).
#
# Starts, together, the iterative dev stack:
#   1. the Python GraphML bridge (tools/em_bridge.py) — backs the in-app
#      "GraphML" export button; runs s3Dgraphy in-process.
#   2. the Vite frontend dev server (npm run dev) — live reload, no Tauri
#      rebuild needed.
#
# Both stop together on Ctrl-C. No desktop-app compile in the loop: edit
# frontend/src or the s3Dgraphy exporter, save, and just reload the browser
# (frontend HMR is instant; the bridge re-imports s3Dgraphy per request, so a
# Python edit only needs a bridge restart — Ctrl-C and re-run this script).
#
# Usage:
#   ./dev.sh                 # bridge :8765 + frontend :5173
#   ./dev.sh --port 8888     # override bridge port
#   S3DGRAPHY=/path/src ./dev.sh   # override s3Dgraphy src location
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_PORT="8765"
if [[ "${1:-}" == "--port" && -n "${2:-}" ]]; then BRIDGE_PORT="$2"; fi

# --- locate s3Dgraphy checkout + a Python that can import it ---------------
S3DGRAPHY_SRC="${S3DGRAPHY:-$ROOT/../s3Dgraphy/src}"
VENV_PY="$ROOT/../s3Dgraphy/.venv/bin/python"
if [[ -x "$VENV_PY" ]]; then
  PY="$VENV_PY"
else
  PY="$(command -v python3 || command -v python)"
  echo "⚠️  s3Dgraphy .venv not found at $VENV_PY — using $PY."
  echo "    If GraphML export fails on import, create the venv:"
  echo "    (cd $ROOT/../s3Dgraphy && python3 -m venv .venv && .venv/bin/pip install -e '.[sync]' pandas lxml)"
fi

if [[ ! -d "$S3DGRAPHY_SRC" ]]; then
  echo "⚠️  s3Dgraphy src not found at $S3DGRAPHY_SRC — set S3DGRAPHY=/path/to/s3Dgraphy/src"
fi

# --- frontend deps ---------------------------------------------------------
if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  echo "📦  Installing frontend deps (first run)…"
  (cd "$ROOT/frontend" && npm install)
fi

# --- launch, with a single trap that stops both children ------------------
pids=()
cleanup() {
  echo ""
  echo "🛑  Stopping EMStudio dev stack…"
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

echo "🐍  Bridge:   http://localhost:$BRIDGE_PORT  (GraphML export)"
"$PY" "$ROOT/tools/em_bridge.py" --port "$BRIDGE_PORT" --s3dgraphy "$S3DGRAPHY_SRC" &
pids+=("$!")

echo "⚡  Frontend: http://localhost:5173  (Vite dev, live reload)"
(cd "$ROOT/frontend" && npm run dev) &
pids+=("$!")

echo ""
echo "✅  EMStudio dev stack up. Open http://localhost:5173, load an .em.json,"
echo "    click GraphML to export via the bridge. Ctrl-C to stop both."
wait
