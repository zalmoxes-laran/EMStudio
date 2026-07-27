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
#      && .venv/bin/pip install -e '.[sync,minio]' pandas lxml pyinstaller)
# The [minio] extra enables the /ingest-minio + /presign endpoints in the
# sidecar; without it those endpoints 501 gracefully (like TTL without rdflib).
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

"$PY" -m PyInstaller --onefile --name em-bridge \
  --paths "$S3/src" --collect-submodules s3dgraphy \
  --add-data "$SRC/JSON_config:s3dgraphy/JSON_config" \
  --add-data "$SRC/templates:s3dgraphy/templates" \
  --add-data "$SRC/mappings:s3dgraphy/mappings" \
  --hidden-import lxml --hidden-import lxml.etree --hidden-import lxml._elementpath \
  --collect-submodules rdflib --copy-metadata rdflib \
  "${MINIO_ARGS[@]}" \
  --exclude-module pandas --exclude-module numpy --exclude-module openpyxl \
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
