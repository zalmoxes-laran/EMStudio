#!/usr/bin/env bash
# Set the EMStudio APP version — a thin front for `scripts/set-version.mjs`.
#
# There were TWO setters in this repository, and they disagreed on the one thing
# that is easy to get wrong: this script used to write the full version —
# `1.6.0-dev.3` — into all three files, `apps/desktop/src-tauri/tauri.conf.json`
# included. The macOS `CFBundleShortVersionString` and a Windows MSI
# ProductVersion are numeric (`x.y.z`), so a pre-release suffix there is either
# rejected or **silently truncated** — silently being the worse of the two,
# because the .dmg then claims a version nobody chose.
#
# `scripts/set-version.mjs` knows that (it keeps the suffix in package.json and
# Cargo.toml and writes the numeric core to the bundle config), it can bump the
# dev counter on its own, it can print, and it has a dry run. Two behaviours for
# one act is one too many, so this is now the same act under the name people
# already type — and `./em.sh inc` / `devrel` call the same implementation.
#
#   ./set-version.sh 1.6.0-dev.3     set exactly
#   ./set-version.sh --bump-dev      1.6.0-dev.2 → 1.6.0-dev.3
#   ./set-version.sh --print         what is set now, per file
#   ./set-version.sh <any> --dry-run
#
# This is the APP version, distinct from the EM *language* version (the
# "Extended Matrix 1.6" badge, data-driven from the datamodels and never written
# by hand).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -eq 0 ]]; then
  echo "usage: ./set-version.sh <semver | --bump-dev | --print> [--dry-run]"
  echo
  node "$ROOT/scripts/set-version.mjs" --print
  exit 1
fi

node "$ROOT/scripts/set-version.mjs" "$@"
