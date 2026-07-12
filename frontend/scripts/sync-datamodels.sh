#!/usr/bin/env bash
# Sync the EM datamodel assets from s3Dgraphy — the single source of truth
# (ADR-001). Run after any datamodel bump in s3Dgraphy, review the diff,
# commit. Never edit the copies in src/assets by hand.
#
#   ./scripts/sync-datamodels.sh [path-to-s3Dgraphy-checkout]
set -euo pipefail

S3D="${1:-../../s3Dgraphy}"
CFG="$S3D/src/s3dgraphy/JSON_config"
DST="$(cd "$(dirname "$0")/.." && pwd)/src/assets"

[ -d "$CFG" ] || { echo "s3Dgraphy JSON_config not found at $CFG" >&2; exit 1; }

cp "$CFG/em_visual_rules.json" "$DST/"
cp "$CFG/s3Dgraphy_connections_datamodel.json" "$DST/"
cp "$CFG/s3Dgraphy_node_datamodel.json" "$DST/"
mkdir -p "$DST/icons2d"
cp "$CFG"/src/2D/*.png "$DST/icons2d/"

echo "synced from $CFG:"
python3 - "$CFG" <<'EOF'
import json, sys, pathlib
cfg = pathlib.Path(sys.argv[1])
n = json.loads((cfg / "s3Dgraphy_node_datamodel.json").read_text())
c = json.loads((cfg / "s3Dgraphy_connections_datamodel.json").read_text())
v = json.loads((cfg / "em_visual_rules.json").read_text())
print(f"  node datamodel   {n.get('s3Dgraphy_data_model_version')} ({len(n.get('node_types', {}))} classes)")
print(f"  connections      {c.get('s3Dgraphy_connections_model_version')} ({len(c.get('edge_types', {}))} edge types)")
print(f"  visual rules     {v.get('version')} ({len(v.get('node_styles', {}))} styles)")
EOF
