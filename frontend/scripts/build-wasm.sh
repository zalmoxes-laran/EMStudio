#!/usr/bin/env bash
# Rebuild em-core → WebAssembly and vendor it into the frontend.
# Prerequisite (once): rustup target add wasm32-unknown-unknown
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cargo build -p em-wasm --target wasm32-unknown-unknown --release \
  --manifest-path "$ROOT/Cargo.toml"
cp "$ROOT/target/wasm32-unknown-unknown/release/em_wasm.wasm" \
   "$ROOT/frontend/src/wasm/em_wasm.wasm"
ls -la "$ROOT/frontend/src/wasm/em_wasm.wasm"
