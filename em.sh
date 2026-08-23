#!/usr/bin/env bash
# EMStudio dev/build/release helper — one entry point, the same ergonomics as
# EMtools' `em.sh`. Two halves:
#
#   the FRONTEND chain (sync/build/wasm/all/dev) — the EMStudio frontend is a
#   browser/TS app that bundles the EM datamodels at BUILD time (it cannot import
#   the Python s3dgraphy at runtime), so refreshing them is a build step;
#
#   the RELEASE chain (inc/pack/devrel/ghrelease/s3d/doc) — one command bumps the
#   app version, tags and pushes, and GitHub Actions builds the desktop app for
#   macOS (arm64 + Intel), Windows and Linux.
#
# THE ORDER THAT MATTERS, and the reason `s3d` is in here: the desktop app ships a
# FROZEN Python sidecar (`em-bridge`) built against the s3dgraphy version pinned in
# `tools/requirements.txt`. That build is reproducible only if the pin is published
# on PyPI, so `devrel` REFUSES to tag when it is not. Publish the s3dgraphy dev
# first (in the s3Dgraphy repo: `./bump_and_push.sh`), then release EMStudio.
#
# Usage:
#   ./em.sh sync   [s3Dgraphy]   Refresh the vendored EM datamodels (visual rules,
#                                node/edge models, qualia vocab, 2D icons) from a
#                                s3Dgraphy checkout OR the installed s3dgraphy.
#                                No arg = auto-detect.
#   ./em.sh build                Build the single-file frontend (dist/).
#   ./em.sh wasm                 Rebuild em-core → WASM (needs Rust/cargo).
#   ./em.sh all    [s3Dgraphy]   sync → wasm → build (sync/wasm best-effort).
#   ./em.sh dev    [args…]       Start the dev stack (bridge + Vite → ./dev.sh).
#
#   ./em.sh version              What version is set, per file.
#   ./em.sh inc                  Bump the dev counter (1.6.0-dev.2 → -dev.3).
#   ./em.sh s3d status           The pinned s3dgraphy: is it published? is the
#                                local checkout ahead of it?
#   ./em.sh s3d pin <version>    Move the pin (refuses one that is not on PyPI).
#   ./em.sh doc    [path]        Build the manual (EMStudio-doc) as a CHECK: -W,
#                                with the version aligned to this app.
#   ./em.sh pack                 Build the desktop app LOCALLY (sidecar + Tauri)
#                                for this machine only.
#   ./em.sh devrel [--dry-run] [--yes] [--if-changed]
#                                A dev release: gate → inc → commit → tag → push.
#                                GitHub Actions then builds the four installers.
#   ./em.sh ghrelease <x.y.z>    A stable release at an exact version.
#   ./em.sh help
#
# In a DISTRIBUTED build the datamodels are already inlined into dist/index.html
# (and the Tauri app), so the end user needs neither Python nor s3dgraphy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FE="$ROOT/frontend"
REQ="$ROOT/tools/requirements.txt"
REPO_URL="https://github.com/zalmoxes-laran/EMStudio"

log() { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠  %s\033[0m\n' "$*" >&2; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

usage() {
  # From the header above, so the help cannot drift from the comment a reader
  # opens the file for. (It used to be a fixed line range, which went stale the
  # first time the header grew.)
  sed -n '/^# Usage:/,/^# In a DISTRIBUTED/p' "${BASH_SOURCE[0]}" \
    | sed 's/^# \{0,1\}//' | sed '$d'
}

# ── the frontend chain ───────────────────────────────────────────────────────

do_sync() { log "sync datamodels"; "$FE/scripts/sync-datamodels.sh" "$@"; }
do_wasm() { log "build WASM (em-core)"; "$FE/scripts/build-wasm.sh"; }
do_build() {
  log "build frontend (dist)"
  if [ ! -d "$FE/node_modules" ]; then
    log "installing frontend deps (first run)"
    (cd "$FE" && npm install)
  fi
  (cd "$FE" && npm run build)
}

# ── the app version ──────────────────────────────────────────────────────────
#
# ONE implementation of the bump, and it is `scripts/set-version.mjs` — the script
# that also knows the part a shell would get wrong: `-dev.N` belongs in
# package.json and Cargo.toml but NOT in tauri.conf.json, because the macOS and
# Windows bundle formats take `x.y.z` and silently truncate a pre-release suffix.
# So this file never computes a version; it asks for one.

app_version() { node -p "require('$FE/package.json').version"; }

next_dev_version() {
  # Asked of the one implementation, in dry-run, and PARSED — rather than
  # recomputed here, which would be a second bump rule to keep in step.
  local line
  line="$(node "$ROOT/scripts/set-version.mjs" --bump-dev --dry-run \
          | sed -n 's/^would set app version \([0-9][^ ]*\).*/\1/p' | tail -1)"
  [[ -n "$line" ]] || die "could not read the next version from set-version.mjs \
(its output changed: fix this parse rather than guessing a version to tag)"
  printf '%s' "$line"
}

do_inc() {
  log "bump the dev counter"
  node "$ROOT/scripts/set-version.mjs" --bump-dev "$@"
}

# ── the s3dgraphy gate ───────────────────────────────────────────────────────
#
# The desktop app is only as reproducible as its sidecar, and the sidecar is
# frozen against the PINNED s3dgraphy. E.D.'s rule, and it is a release order, not
# a preference: publish the s3dgraphy dev, THEN release EMStudio.

pinned_s3dgraphy() {
  # `s3dgraphy[geo,rdf]==1.6.0.dev12` → `1.6.0.dev12`
  sed -n 's/^s3dgraphy\(\[[^]]*\]\)\{0,1\}==\([^ #]*\).*/\2/p' "$REQ" | head -1
}

local_s3dgraphy_version() {
  local pyproject="$ROOT/../s3Dgraphy/pyproject.toml"
  [[ -f "$pyproject" ]] || return 0
  sed -n 's/^version = "\([^"]*\)".*/\1/p' "$pyproject" | head -1
}

#: Is this exact version on PyPI? Three outcomes, and the third is why this is a
#: function and not a one-liner: published / not published / COULD NOT CHECK. A
#: gate that cannot reach the index must not answer "yes" — that is how an
#: unpublishable release gets tagged on a train with no wifi.
#: 0 = published · 1 = not published · 2 = could not verify
s3dgraphy_published() {
  local version="$1" out
  local tmp
  tmp="$(mktemp -d)"
  # `pip download` with an EXACT pin is the real question ("can a packager get
  # these bytes?"). `pip index versions` needs `--pre` to even SEE a dev release
  # — measured: without it the index lists only 1.5.4 and every dev pin looks
  # unpublished, which would make this gate refuse every release forever.
  if out="$(python3 -m pip download --no-deps --quiet --dest "$tmp" \
            "s3dgraphy==$version" 2>&1)"; then
    rm -rf "$tmp"
    return 0
  fi
  rm -rf "$tmp"
  if printf '%s' "$out" | grep -qiE "no matching distribution|could not find a version"; then
    return 1
  fi
  warn "could not reach PyPI to verify s3dgraphy==$version:"
  printf '%s\n' "$out" | tail -3 >&2
  return 2
}

do_s3d_status() {
  local pin local_v rc
  pin="$(pinned_s3dgraphy)"
  [[ -n "$pin" ]] || die "no exact s3dgraphy pin found in tools/requirements.txt"
  echo "pinned (the sidecar freezes this)   s3dgraphy==$pin"
  local_v="$(local_s3dgraphy_version || true)"
  if [[ -n "$local_v" ]]; then
    echo "local checkout (../s3Dgraphy)       $local_v"
  else
    echo "local checkout (../s3Dgraphy)       not found"
  fi
  set +e
  s3dgraphy_published "$pin"
  rc=$?
  set -e
  case "$rc" in
    0) echo "on PyPI                             yes — a packager can build the sidecar" ;;
    1) echo "on PyPI                             NO — publish it before releasing" ;;
    *) echo "on PyPI                             unknown (no index reachable)" ;;
  esac
  if [[ -n "$local_v" && "$local_v" != "$pin" ]]; then
    warn "the checkout ($local_v) is not the pin ($pin): whatever you are \
developing against is NOT what the packaged sidecar will contain. Publish a dev \
and move the pin (./em.sh s3d pin <version>) when the app depends on it."
  fi
  return 0
}

do_s3d_pin() {
  local version="${1:-}" rc
  [[ -n "$version" ]] || die "usage: ./em.sh s3d pin <version>   e.g. 1.6.0.dev15"
  set +e
  s3dgraphy_published "$version"
  rc=$?
  set -e
  [[ "$rc" -eq 0 ]] || die "s3dgraphy==$version is not installable from PyPI \
(rc=$rc) — pinning it would produce a sidecar nobody else can build. Publish it \
first: cd ../s3Dgraphy && ./bump_and_push.sh"
  python3 - "$REQ" "$version" <<'PY'
import re, sys
path, version = sys.argv[1], sys.argv[2]
text = open(path, encoding="utf-8").read()
new, n = re.subn(r'(?m)^(s3dgraphy(?:\[[^\]]*\])?==)([^\s#]+)',
                 lambda m: m.group(1) + version, text, count=1)
if n != 1:
    sys.exit("no s3dgraphy== line to move in tools/requirements.txt")
open(path, "w", encoding="utf-8").write(new)
print(f"  tools/requirements.txt -> s3dgraphy=={version}")
PY
  log "pin moved — the next sidecar freezes s3dgraphy==$version"
}

#: The gate itself, shared by `devrel` and the nightly. Fails CLOSED.
s3d_gate() {
  local pin rc
  pin="$(pinned_s3dgraphy)"
  [[ -n "$pin" ]] || die "no exact s3dgraphy pin in tools/requirements.txt — the \
sidecar build has no version to freeze"
  log "gate: is s3dgraphy==$pin published?"
  set +e
  s3dgraphy_published "$pin"
  rc=$?
  set -e
  case "$rc" in
    0) log "gate: s3dgraphy==$pin is on PyPI — the sidecar is reproducible" ;;
    1) die "s3dgraphy==$pin is NOT on PyPI, so nobody (including CI) can build \
the sidecar this release ships.
   Publish that dev FIRST, then release EMStudio:
       cd ../s3Dgraphy && ./bump_and_push.sh      # bumps + publishes
   …then, if the pin should move:  ./em.sh s3d pin <the published version>" ;;
    *) die "cannot verify s3dgraphy==$pin on PyPI, and this gate does not guess: \
an unverified pin is exactly how a release ships a sidecar nobody can rebuild.
   Check the network, or run again when the index answers." ;;
  esac
}

# ── the manual (EMStudio-doc), built as a check ──────────────────────────────
#
# The manual lives in its OWN repository (github.com/zalmoxes-laran/EMStudio-doc),
# and this touches it as little as a thing can be touched: it is checked out and
# BUILT, with the version passed as a Sphinx override (`-D version=… -D release=…`).
# So a release verifies that the documentation still compiles and that it carries
# the app's version — with no commit, no dispatch and no token in the doc repo.

do_doc() {
  local doc="${1:-$ROOT/../EMStudio-doc}"
  local version
  version="$(app_version)"
  [[ -d "$doc/docs" ]] || die "no manual at $doc (pass the path: ./em.sh doc \
/path/to/EMStudio-doc, or clone github.com/zalmoxes-laran/EMStudio-doc)"
  local py="python3"
  [[ -x "$doc/.venv/bin/python" ]] && py="$doc/.venv/bin/python"
  log "build the manual as a check (-W) at version $version"
  "$py" -m sphinx -b html -W \
    -D "version=$version" -D "release=$version" \
    "$doc/docs" "$doc/docs/_build/check"
  log "manual OK — it compiles with no warnings, and says $version"
}

# ── a LOCAL desktop build (this machine only) ────────────────────────────────
#
# Called `pack`, not `dev`: in this repo `dev` already means the dev server, and
# renaming it to match EMtools' `dev` (a local build) would break the command
# everybody's muscle memory types twenty times a day. Same ergonomics, one
# deliberate difference in the word.

do_pack() {
  log "sidecar (PyInstaller) for this machine's target triple"
  (cd "$ROOT/apps/desktop" && ./build-bridge.sh)
  log "desktop bundle (cargo tauri build)"
  (cd "$ROOT/apps/desktop" && cargo tauri build)
}

# ── the release ──────────────────────────────────────────────────────────────

require_clean_tree() {
  [[ -z "$(git -C "$ROOT" status --porcelain)" ]] || die "the working tree is not \
clean. A release tags what is COMMITTED; anything else would produce a build that \
does not exist in any commit."
}

do_devrel() {
  local dry=0 assume_yes=0 if_changed=0
  for arg in "$@"; do
    case "$arg" in
      --dry-run) dry=1 ;;
      --yes | -y) assume_yes=1 ;;
      --if-changed) if_changed=1 ;;
      *) die "unknown option for devrel: $arg" ;;
    esac
  done

  local branch current next tag
  branch="$(git -C "$ROOT" branch --show-current)"
  current="$(app_version)"
  next="$(next_dev_version)"
  tag="v$next"

  echo "════════════════════════════════════════════"
  echo "  EMStudio dev release"
  echo "════════════════════════════════════════════"
  echo "  branch        $branch"
  echo "  version       $current → $next"
  echo "  tag           $tag"
  echo "  s3dgraphy pin $(pinned_s3dgraphy)"
  echo "  files touched frontend/package.json"
  echo "                apps/desktop/src-tauri/Cargo.toml"
  echo "                apps/desktop/src-tauri/tauri.conf.json (numeric core)"
  echo "  then          commit · tag $tag · push → GitHub Actions builds"
  echo "                macOS arm64 · macOS Intel · Windows · Linux"
  echo "════════════════════════════════════════════"

  # `--if-changed` is what the nightly uses: a night with no commits should not
  # produce a release that differs from the last one only by its number.
  if [[ "$if_changed" -eq 1 ]]; then
    local last
    last="$(git -C "$ROOT" describe --tags --abbrev=0 --match 'v*' 2>/dev/null || true)"
    if [[ -n "$last" ]]; then
      local since
      since="$(git -C "$ROOT" rev-list --count "$last..HEAD")"
      if [[ "$since" -eq 0 ]]; then
        log "nothing to build: no commits since $last — skipping (not an error)"
        return 0
      fi
      log "$since commit(s) since $last"
    else
      log "no previous v* tag — this is the first release from this checkout"
    fi
  fi

  # THE GATE, before anything is written: refusing after the version was bumped
  # would leave the tree dirty for a reason that has nothing to do with the tree.
  s3d_gate

  if [[ "$dry" -eq 1 ]]; then
    log "dry run: nothing was written, nothing was tagged, nothing was pushed"
    node "$ROOT/scripts/set-version.mjs" --bump-dev --dry-run
    return 0
  fi

  require_clean_tree

  if [[ "$assume_yes" -eq 0 ]]; then
    printf 'Push %s and start the four builds? (y/N): ' "$tag"
    read -r reply
    [[ "$reply" =~ ^[Yy]$ ]] || { log "cancelled"; return 0; }
  fi

  do_inc
  git -C "$ROOT" add frontend/package.json \
      apps/desktop/src-tauri/Cargo.toml \
      apps/desktop/src-tauri/tauri.conf.json
  git -C "$ROOT" commit -m "build: dev release $next"
  git -C "$ROOT" tag "$tag"
  git -C "$ROOT" push origin "$branch"
  git -C "$ROOT" push origin "$tag"

  echo
  log "pushed $tag — the installers are being built"
  echo "   $REPO_URL/actions"
  echo "   $REPO_URL/releases/tag/$tag"
}

do_ghrelease() {
  local version="${1:-}"
  [[ -n "$version" ]] || die "usage: ./em.sh ghrelease <x.y.z>   (an exact, \
stable version — a dev release is ./em.sh devrel)"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "'$version' is not a stable \
x.y.z — a dev build is what ./em.sh devrel is for"
  require_clean_tree
  s3d_gate
  log "set the app version to $version"
  node "$ROOT/scripts/set-version.mjs" "$version"
  local branch
  branch="$(git -C "$ROOT" branch --show-current)"
  git -C "$ROOT" add frontend/package.json \
      apps/desktop/src-tauri/Cargo.toml \
      apps/desktop/src-tauri/tauri.conf.json
  git -C "$ROOT" commit -m "release: $version"
  git -C "$ROOT" tag "v$version"
  git -C "$ROOT" push origin "$branch"
  git -C "$ROOT" push origin "v$version"
  log "pushed v$version — $REPO_URL/releases/tag/v$version"
}

# ── dispatch ─────────────────────────────────────────────────────────────────

cmd="${1:-help}"
shift || true
case "$cmd" in
  sync) do_sync "$@" ;;
  wasm) do_wasm ;;
  build) do_build ;;
  dev) "$ROOT/dev.sh" "$@" ;;
  all)
    do_sync "$@" || warn "sync skipped (no s3Dgraphy source found) — using the vendored copies"
    do_wasm || warn "WASM skipped (needs Rust/cargo) — reusing the vendored .wasm"
    do_build
    ;;
  version) node "$ROOT/scripts/set-version.mjs" --print ;;
  inc) do_inc "$@" ;;
  s3d)
    sub="${1:-status}"
    shift || true
    case "$sub" in
      status) do_s3d_status ;;
      pin) do_s3d_pin "$@" ;;
      *) die "s3d: expected 'status' or 'pin <version>', got '$sub'" ;;
    esac
    ;;
  doc) do_doc "$@" ;;
  pack) do_pack ;;
  devrel) do_devrel "$@" ;;
  ghrelease) do_ghrelease "$@" ;;
  help | -h | --help) usage ;;
  *)
    warn "unknown command: $cmd"
    usage
    exit 1
    ;;
esac
