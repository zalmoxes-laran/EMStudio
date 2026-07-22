#!/usr/bin/env bash
# Bump the EMStudio app version across its three sources of truth in one shot:
#   frontend/package.json           (the canonical value; Vite inlines it and
#                                     the GUI shows it next to the wordmark)
#   apps/desktop/src-tauri/tauri.conf.json   (the .app / .dmg bundle version)
#   apps/desktop/src-tauri/Cargo.toml        (the desktop crate version)
#
# This is the EMStudio APP version — distinct from the EM *language* version
# (the "Extended Matrix 1.6" badge, data-driven from the datamodel).
#
# Use a semver-valid string (Cargo/Tauri/npm reject 4-part "1.6.0.dev01"):
#   ./set-version.sh 1.6.0-dev.2
#   ./set-version.sh 1.6.0
set -euo pipefail

VER="${1:-}"
if [[ -z "$VER" ]]; then
  echo "usage: ./set-version.sh <semver>   e.g. 1.6.0-dev.2"
  exit 1
fi
# minimal semver check (MAJOR.MINOR.PATCH with optional -prerelease / +build)
if ! [[ "$VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]]; then
  echo "error: '$VER' is not valid semver (Cargo/Tauri need e.g. 1.6.0-dev.2, not 1.6.0.dev02)"
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 - "$ROOT" "$VER" <<'PY'
import json, re, sys
root, ver = sys.argv[1], sys.argv[2]

for rel in ("frontend/package.json", "apps/desktop/src-tauri/tauri.conf.json"):
    p = f"{root}/{rel}"
    d = json.load(open(p))
    d["version"] = ver
    json.dump(d, open(p, "w"), indent=2)
    open(p, "a").write("\n")
    print(f"  {rel} -> {ver}")

cargo = f"{root}/apps/desktop/src-tauri/Cargo.toml"
txt = open(cargo).read()
txt = re.sub(r'(?m)^version = ".*"$', f'version = "{ver}"', txt, count=1)
open(cargo, "w").write(txt)
print(f"  apps/desktop/src-tauri/Cargo.toml -> {ver}")
PY
echo "✓ EMStudio version set to $VER — rebuild to pick it up (npm run build / cargo tauri build)"
