import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Single-file build: dist/index.html is fully self-contained, so it works
// over file://, inside the Tauri shell, and as an e-mail-able artefact.
export default defineConfig({
  base: "./",
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
