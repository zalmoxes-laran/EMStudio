#!/usr/bin/env bash
# Build the GraphML transformer sidecar (tools/em_bridge.py + s3Dgraphy)
# into a standalone binary that the Tauri desktop shell spawns at launch.
#
# Output: src-tauri/binaries/em-bridge-<target-triple>  (Tauri externalBin
# naming). The binary is gitignored — CI / packagers run this before
# `cargo tauri build`. On a dev machine it makes desktop GraphML
# import/export work with no external Python.
#
# Needs s3Dgraphy importable (its venv has pyinstaller + pandas + lxml):
#   (cd ../../s3Dgraphy && python3 -m venv .venv \
#      && .venv/bin/pip install -e '.[sync,minio,geo]' pandas lxml pyinstaller)
# The [minio] extra enables the /ingest-minio + /presign endpoints in the
# sidecar; without it those endpoints 501 gracefully (like TTL without rdflib).
# The [geo] extra (pyproj) enables /reproject + /georeference-scene, i.e. the map
# for projected coordinates. For image previews add, optionally:
#   .venv/bin/pip install Pillow
# pyproj and Pillow are bundled if present in the build venv; PyMuPDF is
# EXCLUDED on purpose (22 MB for a PDF cover — dev-only, see below). Each of them
# degrades to the previous behaviour when absent.
#
# Full packaging instructions for the three OSes, including how the PROJ data
# directory gets into the binary and how to VERIFY it afterwards, live in
# ../../docs/DEVELOPMENT.md § "Packaging the desktop app". Keep them there, not
# duplicated here.
#
# Usage:
#   ./build-bridge.sh                 # uses ../../s3Dgraphy
#   S3DGRAPHY=/path/to/s3Dgraphy ./build-bridge.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EMSTUDIO="$(cd "$HERE/../.." && pwd)"
S3="${S3DGRAPHY:-$EMSTUDIO/../s3Dgraphy}"
SRC="$S3/src/s3dgraphy"
PY="${PYTHON:-$S3/.venv/bin/python}"
TRIPLE="$(rustc -vV | sed -n 's/host: //p')"
OUT="$HERE/src-tauri/binaries"

[[ -x "$PY" ]] || { echo "python not found at $PY (set PYTHON=…)"; exit 1; }
[[ -d "$SRC" ]] || { echo "s3Dgraphy src not found at $SRC (set S3DGRAPHY=…)"; exit 1; }
"$PY" -c "import PyInstaller" 2>/dev/null || { echo "pyinstaller missing: $PY -m pip install pyinstaller"; exit 1; }

WORK="$(mktemp -d)"
echo "Building em-bridge sidecar for $TRIPLE …"

# Bundle the MinIO SDK only if it is installed in the build venv, so the shared
# object-store endpoints (/ingest-minio, /presign) work offline in the desktop
# sidecar. If [minio] wasn't installed, skip it — those endpoints then 501
# gracefully (like TTL without rdflib), and the build still succeeds.
MINIO_ARGS=()
if "$PY" -c "import minio" 2>/dev/null; then
  MINIO_ARGS=(--collect-submodules minio --copy-metadata minio)
  echo "  · bundling the 'minio' SDK (shared MinIO endpoints enabled)"
else
  echo "  · 'minio' SDK not in build venv — /ingest-minio + /presign will 501"
fi

# The optional engines added by the geo + preview work.
#
# WHAT THESE FLAGS ACTUALLY DO — measured, because the obvious reading is wrong.
# PyInstaller's analysis follows imports inside FUNCTION BODIES, so a library that
# the bridge imports lazily (pyproj inside api.reproject_many, PIL inside
# _thumbnail) is bundled whenever it is installed in the build venv, flags or no
# flags: builds with and without these `--collect-submodules` came out the same
# size to the megabyte. What the flags add is the part the analysis CANNOT infer —
# the PROJ data directory and the package metadata. And the only way to keep a
# library OUT is `--exclude-module` (see PyMuPDF below, verified: 47 MB → 26 MB).
#
#   pyproj   (G1/G3) — EPSG → WGS84. Wheels BUNDLE PROJ, so no system GDAL is
#                      needed; the PROJ data directory must travel or the frozen
#                      binary finds no datum grids.
#   Pillow   (G2)    — server-side image thumbnails. Pays for itself: a 2 MB
#                      orthophoto travels as ~40 kB instead of 2.9 MB of base64.
# Together they measure +8 MB (18 MB → 26 MB) on this machine.
GEO_ARGS=()
# `${ARR[@]+"${ARR[@]}"}` below, not `"${ARR[@]}"`: macOS ships bash 3.2, where
# expanding an EMPTY array under `set -u` aborts with "unbound variable". That bit
# for real — the build failed on any machine without the minio SDK.
if "$PY" -c "import pyproj" 2>/dev/null; then
  PROJ_DATA_DIR="$("$PY" -c 'import pyproj, os; print(os.path.join(os.path.dirname(pyproj.__file__), "proj_dir", "share", "proj"))')"
  GEO_ARGS=(--collect-submodules pyproj --copy-metadata pyproj)
  if [[ -d "$PROJ_DATA_DIR" ]]; then
    GEO_ARGS+=(--add-data "$PROJ_DATA_DIR:pyproj/proj_dir/share/proj")
  fi
  echo "  · bundling 'pyproj' (/reproject + /georeference-scene enabled)"
else
  echo "  · 'pyproj' not in build venv — /reproject will 501, the map refuses"
fi

PREVIEW_ARGS=()
if "$PY" -c "import PIL" 2>/dev/null; then
  PREVIEW_ARGS+=(--collect-submodules PIL)
  echo "  · bundling 'Pillow' (server-side thumbnails: less bandwidth, not more)"
else
  echo "  · 'Pillow' not in build venv — big images get no thumbnail"
fi
# PyMuPDF is deliberately NOT bundled (C2): 22 MB for a PDF cover page, on a
# binary that is otherwise ~15 MB. `/resource-preview` then falls back to the
# typed document icon, which is what it did before G2.
#
# The exclusion has to be EXPLICIT. PyInstaller's analysis follows imports inside
# function bodies too, so `import fitz` in `_pdf_first_page` would pull the whole
# library in on any machine whose build venv happens to have it — silently, and
# only visible as a suddenly-doubled binary. Same reason pandas/numpy are excluded
# below. Developers who want PDF covers install PyMuPDF next to the DEV bridge
# (./dev.sh reads the venv directly, no freezing involved).

"$PY" -m PyInstaller --onefile --name em-bridge \
  --paths "$S3/src" --collect-submodules s3dgraphy \
  --add-data "$SRC/JSON_config:s3dgraphy/JSON_config" \
  --add-data "$SRC/templates:s3dgraphy/templates" \
  --add-data "$SRC/mappings:s3dgraphy/mappings" \
  --hidden-import lxml --hidden-import lxml.etree --hidden-import lxml._elementpath \
  --collect-submodules rdflib --copy-metadata rdflib \
  ${MINIO_ARGS[@]+"${MINIO_ARGS[@]}"} \
  ${GEO_ARGS[@]+"${GEO_ARGS[@]}"} \
  ${PREVIEW_ARGS[@]+"${PREVIEW_ARGS[@]}"} \
  --exclude-module pandas --exclude-module numpy --exclude-module openpyxl \
  --exclude-module fitz --exclude-module pymupdf --exclude-module pymupdf.mupdf \
  --distpath "$WORK/dist" --workpath "$WORK/build" --specpath "$WORK" \
  --noconfirm --log-level WARN \
  "$EMSTUDIO/tools/em_bridge.py"

mkdir -p "$OUT"
cp "$WORK/dist/em-bridge" "$OUT/em-bridge-$TRIPLE"
# ad-hoc sign so macOS lets the sidecar's child process run (real releases
# get Developer ID + notarization at the .app level).
codesign -s - --force "$OUT/em-bridge-$TRIPLE" 2>/dev/null || true
rm -rf "$WORK"
echo "✓ $OUT/em-bridge-$TRIPLE"
