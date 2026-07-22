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
#      && .venv/bin/pip install -e '.[sync]' pandas lxml pyinstaller)
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
"$PY" -m PyInstaller --onefile --name em-bridge \
  --paths "$S3/src" --collect-submodules s3dgraphy \
  --add-data "$SRC/JSON_config:s3dgraphy/JSON_config" \
  --add-data "$SRC/templates:s3dgraphy/templates" \
  --add-data "$SRC/mappings:s3dgraphy/mappings" \
  --hidden-import lxml --hidden-import lxml.etree --hidden-import lxml._elementpath \
  --collect-submodules rdflib --copy-metadata rdflib \
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
