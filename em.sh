#!/usr/bin/env bash
# EMStudio dev/build helper — one entry point for the frontend build chain,
# analogous to EMtools' em.sh. The EMStudio *frontend* is a browser/TS app that
# bundles the EM datamodels at build time (it can't import the Python s3dgraphy
# package at runtime), so refreshing them is a build step, not a runtime one.
#
# Usage:
#   ./em.sh sync   [s3Dgraphy]   Refresh the vendored EM datamodels (visual
#                                rules, node/edge models, qualia vocab, 2D
#                                icons) from a s3Dgraphy checkout OR the
#                                installed s3dgraphy (pip). No arg = auto-detect.
#   ./em.sh build                Build the single-file frontend (dist/) from the
#                                datamodels already vendored. No s3dgraphy needed.
#   ./em.sh wasm                 Rebuild em-core → WASM (needs Rust/cargo).
#   ./em.sh all    [s3Dgraphy]   sync → wasm → build, in one shot (sync + wasm
#                                are best-effort: skipped with a warning if their
#                                inputs/tools are missing).
#   ./em.sh dev    [args…]       Start the dev stack (GraphML bridge + Vite,
#                                delegates to ./dev.sh; HMR picks up datamodel
#                                edits after a sync automatically).
#   ./em.sh help
#
# In a DISTRIBUTED build the datamodels are already inlined into dist/index.html
# (and the Tauri app), so the end user needs neither Python nor s3dgraphy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FE="$ROOT/frontend"

log() { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠  %s\033[0m\n' "$*" >&2; }

do_sync() { log "sync datamodels"; "$FE/scripts/sync-datamodels.sh" "$@"; }
do_wasm() { log "build WASM (em-core)"; "$FE/scripts/build-wasm.sh"; }
do_build() {
  log "build frontend (dist)"
  if [ ! -d "$FE/node_modules" ]; then
    log "installing frontend deps (first run)"
    (cd "$FE" && npm install)
  fi
  (cd "$FE" && npm run build)
}

cmd="${1:-help}"
shift || true
case "$cmd" in
  sync) do_sync "$@" ;;
  wasm) do_wasm ;;
  build) do_build ;;
  dev) "$ROOT/dev.sh" "$@" ;;
  all)
    do_sync "$@" || warn "sync skipped (no s3Dgraphy source found) — using the vendored copies"
    do_wasm || warn "WASM skipped (needs Rust/cargo) — reusing the vendored .wasm"
    do_build
    ;;
  help | -h | --help)
    sed -n '2,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    ;;
  *)
    warn "unknown command: $cmd"
    sed -n '2,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
