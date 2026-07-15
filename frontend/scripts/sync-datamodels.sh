#!/usr/bin/env bash
# Sync the EM datamodel assets from s3Dgraphy — the single source of truth
# (ADR-001). The EMStudio frontend is a browser/TS app: it cannot import the
# Python s3dgraphy package at runtime, so the datamodel JSONs are VENDORED into
# src/assets and bundled at build time. Run this after any datamodel change in
# s3Dgraphy, review the diff, commit. Never edit the copies in src/assets by hand.
#
#   ./scripts/sync-datamodels.sh                 # from an installed s3dgraphy (pip) or the sibling checkout
#   ./scripts/sync-datamodels.sh ../../s3Dgraphy # from an explicit checkout
#
# Source resolution (first hit wins): an explicit path arg (a checkout root, a
# path ending in JSON_config, or a dir containing one) → the sibling
# ../../s3Dgraphy checkout → the INSTALLED s3dgraphy package (pip), located via
# the sibling .venv python or python3. So `pip install s3dgraphy` is enough — no
# source checkout required.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$(cd "$SCRIPT_DIR/.." && pwd)"
DST="$FRONTEND/src/assets"
GITHUB="$(cd "$FRONTEND/../.." && pwd)" # …/EMStudio/.. = repos root
SIBLING="$GITHUB/s3Dgraphy"

has_cfg() { [ -f "$1/em_visual_rules.json" ]; }

CFG=""
ARG="${1:-}"
if [ -n "$ARG" ]; then
  for cand in "$ARG/src/s3dgraphy/JSON_config" "$ARG/JSON_config" "$ARG"; do
    if has_cfg "$cand"; then CFG="$cand"; break; fi
  done
  [ -n "$CFG" ] || { echo "no JSON_config under '$ARG'" >&2; exit 1; }
fi
# sibling checkout
if [ -z "$CFG" ] && has_cfg "$SIBLING/src/s3dgraphy/JSON_config"; then
  CFG="$SIBLING/src/s3dgraphy/JSON_config"
fi
# installed package (pip): ask a python where s3dgraphy lives
if [ -z "$CFG" ]; then
  for PY in "$SIBLING/.venv/bin/python" python3 python; do
    ( [ -x "$PY" ] || command -v "$PY" >/dev/null 2>&1 ) || continue
    d="$("$PY" -c 'import s3dgraphy,os;print(os.path.join(os.path.dirname(s3dgraphy.__file__),"JSON_config"))' 2>/dev/null || true)"
    if [ -n "$d" ] && has_cfg "$d"; then CFG="$d"; break; fi
  done
fi
[ -n "$CFG" ] || {
  echo "s3Dgraphy JSON_config not found — pass a checkout path, or pip-install s3dgraphy." >&2
  exit 1
}

cp "$CFG/em_visual_rules.json" "$DST/"
cp "$CFG/s3Dgraphy_connections_datamodel.json" "$DST/"
cp "$CFG/s3Dgraphy_node_datamodel.json" "$DST/"
cp "$CFG/em_qualia_types.json" "$DST/"
mkdir -p "$DST/icons2d"
cp "$CFG"/src/2D/*.png "$DST/icons2d/"

echo "synced from $CFG:"
python3 - "$CFG" <<'EOF'
import json, sys, pathlib
cfg = pathlib.Path(sys.argv[1])
n = json.loads((cfg / "s3Dgraphy_node_datamodel.json").read_text())
c = json.loads((cfg / "s3Dgraphy_connections_datamodel.json").read_text())
v = json.loads((cfg / "em_visual_rules.json").read_text())
q = json.loads((cfg / "em_qualia_types.json").read_text())
total = sum(len(s.get("qualia", []))
            for cat in q.get("qualia_categories", [])
            for s in cat.get("subcategories", {}).values())
print(f"  node datamodel   {n.get('s3Dgraphy_data_model_version')} ({len(n.get('node_types', {}))} classes)")
print(f"  connections      {c.get('s3Dgraphy_connections_model_version')} ({len(c.get('edge_types', {}))} edge types)")
print(f"  visual rules     {v.get('version')} ({len(v.get('node_styles', {}))} styles)")
print(f"  qualia vocab     {q.get('metadata', {}).get('version')} ({total} terms)")
EOF
