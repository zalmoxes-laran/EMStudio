# EMStudio desktop (Tauri shell)

Phase-2 scaffold: a Tauri v2 window wrapping the web frontend. File opening
uses the frontend's own picker / drag-and-drop (native menus, recent files
and in-process em-core calls come with the editing phase; Oxigraph embedding
for local SPARQL comes in phase 6).

## Prerequisites (macOS)

```sh
xcode-select --install          # if not already present
cargo install tauri-cli --locked
cd ../../frontend && npm install
```

## Run

```sh
cd apps/desktop
cargo tauri dev        # dev: Vite server + live reload
cargo tauri build      # release bundle (.app / .dmg)
```

Before the first `cargo tauri build`, generate the full icon set from the
base PNG:

```sh
cargo tauri icon src-tauri/icons/icon.png
```

## Notes

- The Tauri crate is deliberately **outside** the root cargo workspace
  (`[workspace]` table in `src-tauri/Cargo.toml`) so `cargo build` at the
  repo root stays lean (em-core + em-cli only).
- When the editing phase lands, wire em-core in-process:

```toml
[dependencies]
em-core = { path = "../../../crates/em-core" }
```
