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
// TWO PAGES, TWO BUILDS — and it has to be two builds, not two inputs.
//
// `viteSingleFile` works by inlining every dynamic import into one bundle, and
// rollup refuses that with more than one entry. Since the single-file property
// is exactly what both pages are for (the editor must open over `file://`, the
// viewer must be servable from anywhere without an asset path to get wrong),
// the answer is to run the same config twice:
//
//   npm run build          → dist/index.html   (the editor)
//   npm run build:reader   → dist/reader.html  (the dissemination viewer, P3)
//
// `EM_ENTRY=reader` picks the second. It is `reader` and not `viewer` because
// `viewer.html` is already taken by the phase-2 read-only SVG GRAPH viewer —
// that one draws the matrix, this one reads the story. They share every module that matters — the
// narrative renderer, the embeds, the palette — so the viewer is a second ENTRY,
// never a second implementation.
const entry = process.env.EM_ENTRY === "reader" ? "reader" : "index";

export default defineConfig({
  base: "./",
  define: { __EMSTUDIO_VERSION__: JSON.stringify(pkg.version) },
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: new URL(`./${entry}.html`, import.meta.url).pathname,
    },
    // single-file output: nothing stale can linger, and unlink is not
    // always permitted on synced/mounted folders
    emptyOutDir: false,
    // inline every asset (official EM icons) into the single file
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 6000,
  },
});
