# EMStudio desktop (Tauri shell)

Not yet initialised — requires local toolchain (not available in the CI
sandbox). To scaffold (phase 2):

```bash
# prerequisites: rustup, node >= 20
cargo install tauri-cli --locked
cd apps/desktop
cargo tauri init   # app name: EMStudio, frontend dist: ../../frontend/dist
```

Then add `apps/desktop/src-tauri` to the workspace members in the root
`Cargo.toml`, and wire `em-core` as a dependency of the Tauri backend.
Oxigraph embedding (local SPARQL) comes in phase 6:

```toml
[dependencies]
em-core = { path = "../../crates/em-core" }
oxigraph = "0.4"   # MIT/Apache-2.0 — GPLv3-compatible
```
