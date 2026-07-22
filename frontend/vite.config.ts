import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// EMStudio app version — single source of truth is package.json (kept in sync
// with Cargo.toml + tauri.conf.json by scripts/set-version.sh). Inlined at
// build time and shown in the GUI so testers know which build they're on.
const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
) as { version: string };

// Single-file build: dist/index.html is fully self-contained, so it works
// over file://, inside the Tauri shell, and as an e-mail-able artefact.
export default defineConfig({
  base: "./",
  define: { __EMSTUDIO_VERSION__: JSON.stringify(pkg.version) },
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist",
    // single-file output: nothing stale can linger, and unlink is not
    // always permitted on synced/mounted folders
    emptyOutDir: false,
    // inline every asset (official EM icons) into the single file
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 6000,
  },
});
