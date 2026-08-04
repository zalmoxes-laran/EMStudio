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
# the class hierarchy now lives in a separate GENERATED file (s3Dgraphy P1-A);
# vendor both: the datamodel (hand-authored semantics/CIDOC) and the registry
# (generated parent/node_type hierarchy that rules.ts reads).
cp "$CFG/node_registry.generated.json" "$DST/"
cp "$CFG/em_qualia_types.json" "$DST/"
mkdir -p "$DST/icons2d"
# BOTH raster and vector. Only `*.png` was copied here, which is why EMStudio drew
# no SVG icons even after 28 of them shipped in s3Dgraphy: the renderer prefers
# vector (`icons.ts::asset` tries .svg before .png) and there was simply nothing to
# prefer. `nullglob` because a checkout may legitimately have one kind and not the
# other, and an unmatched glob must not copy a literal `*.svg`.
# Vendor the 2D icons — but only the ones the renderer can actually REACH.
#
# Every vendored byte is inlined as a data URL by the single-file build, so an
# unreachable asset is pure bundle weight. Two conditions, both facts rather than
# guesses (a size threshold would guess):
#
#  1. **The pair is resolved the way `icons.ts::asset` resolves it.** By default
#     that is vector-before-raster, so a PNG beside its own SVG can never be
#     reached: 16 of them, 2.5 MB. POL5 added the exception, and it is the
#     datamodel's own: a type carrying `2d_icon_prefer: "raster"` (NARR, SE — two
#     stipple ILLUSTRATIONS of 617 and 284 KB) is resolved the other way round, so
#     for those the SVG is the unreachable one. The flag is read here and in
#     `icons.ts`; if only one of the two honoured it, the build would inline a file
#     the renderer never asks for — which is exactly what happened before this rule
#     existed and cost 604 KB.
#  2. **A basename that neither names a node type nor is declared by one is
#     skipped.** Those are exactly `icons.ts`'s two lookup paths (name first, then
#     the `em_visual_rules` declaration), plus its spelled-out aliases. Anything
#     else is unreferenced artwork: today `EMNarrative.*` alone, 2.2 MB.
#
# Both rules are computed FROM the rules file, so adding an icon and declaring it
# is enough — this script needs no edit.
python3 - "$CFG" "$DST" <<'PYEOF'
import json, pathlib, shutil, sys

cfg, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
styles = json.loads((cfg / "em_visual_rules.json").read_text())["node_styles"]

reachable = set(styles)                       # named after a node type
raster_only = set()                           # stems where the SVG is unreachable
for style in styles.values():                 # or declared by one
    if not isinstance(style, dict):
        continue
    for key in ("2d_file_vect", "2d_file_rast", "file_2d"):
        path = style.get(key)
        if isinstance(path, str):
            reachable.add(pathlib.PurePath(path).stem)
    # POL5: the datamodel says which of the pair is the icon. `icons.ts` reads the
    # same field, so the copied file and the drawn file are one decision.
    if style.get("2d_icon_prefer") == "raster":
        for key in ("2d_file_rast", "file_2d", "2d_file_vect"):
            path = style.get(key)
            if isinstance(path, str):
                raster_only.add(pathlib.PurePath(path).stem)
# Sharing that icons.ts spells out in FILE_ALIAS (BR → continuity, serUSVn/s →
# serUSV): declared nowhere, deliberate all the same.
reachable |= {"continuity", "serUSV"}

src = cfg / "src/2D"
out = dst / "icons2d"
out.mkdir(parents=True, exist_ok=True)
copied = skipped = 0
for f in sorted(src.iterdir()):
    if f.suffix.lower() not in (".svg", ".png"):
        continue
    ext = f.suffix.lower()
    if f.stem in raster_only:
        # the pair is resolved raster-first for this type → the vector is the
        # unreachable half (and it is the heavy one, which is the whole point)
        shadowed = ext == ".svg" and (src / f"{f.stem}.png").is_file()
    else:
        shadowed = ext == ".png" and (src / f"{f.stem}.svg").is_file()
    if f.stem not in reachable or shadowed:
        skipped += 1
        continue
    shutil.copy2(f, out / f.name)
    copied += 1
print(f"  icons2d          {copied} vendored, {skipped} unreachable/shadowed")
PYEOF

# The 2017 DTC glyphs. They live in s3Dgraphy — the single source — under
# `src/2D/dtc/`, and `em_visual_rules.dtc_kinds[*].glyph` names them WITHOUT an
# extension, so the vendored basenames must match the glyph names exactly.
# Before POL2 these files existed only inside EMStudio, copied in by hand: a second
# source of truth that nothing kept in step with the rules that reference it.
mkdir -p "$DST/dtc-glyphs"
cp "$CFG"/src/2D/dtc/*.svg "$DST/dtc-glyphs/" 2>/dev/null || true
shopt -u nullglob

echo "synced from $CFG:"
python3 - "$CFG" <<'EOF'
import json, sys, pathlib
cfg = pathlib.Path(sys.argv[1])
n = json.loads((cfg / "s3Dgraphy_node_datamodel.json").read_text())
r = json.loads((cfg / "node_registry.generated.json").read_text())
c = json.loads((cfg / "s3Dgraphy_connections_datamodel.json").read_text())
v = json.loads((cfg / "em_visual_rules.json").read_text())
q = json.loads((cfg / "em_qualia_types.json").read_text())
total = sum(len(s.get("qualia", []))
            for cat in q.get("qualia_categories", [])
            for s in cat.get("subcategories", {}).values())
print(f"  node datamodel   {n.get('s3Dgraphy_data_model_version')} (hand-authored semantics)")
print(f"  node registry    {r.get('s3Dgraphy_data_model_version')} ({len(r.get('node_types', {}))} classes)")
print(f"  connections      {c.get('s3Dgraphy_connections_model_version')} ({len(c.get('edge_types', {}))} edge types)")
print(f"  visual rules     {v.get('version')} ({len(v.get('node_styles', {}))} styles)")
print(f"  qualia vocab     {q.get('metadata', {}).get('version')} ({total} terms)")
EOF
