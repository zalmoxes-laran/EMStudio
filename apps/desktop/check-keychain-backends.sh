#!/usr/bin/env bash
# Assert that the desktop shell resolves the RIGHT keychain backend on each OS.
#
# ── why this exists ─────────────────────────────────────────────────────────
#
# The API key lives in the OS keychain (S2). Which backend the `keyring` crate
# uses is decided by per-target features in src-tauri/Cargo.toml, and getting
# them wrong does NOT necessarily break the build:
#
#   * `sync-secret-service` without `crypto-rust` (or `crypto-openssl`) compiles
#     perfectly well on Linux — and then talks to the Secret Service over D-Bus
#     **with no encryption at all**. The key goes across the session bus in
#     plaintext, silently. That is the bug this script is here to catch, and
#     `cargo tree`'s exit code does NOT catch it: the graph resolves fine, the
#     crypto crates are simply absent from it.
#   * a missing `apple-native` / `windows-native` would fall back to a different
#     store, or none.
#
# So the check is on the CONTENT of the resolved graph, not on whether cargo
# succeeded. `cargo tree --target` resolves a foreign target's dependencies
# without installing that target's std and without compiling anything, so all
# three platforms can be checked from one runner in seconds.
#
# Run it anywhere:  apps/desktop/check-keychain-backends.sh
set -uo pipefail

CRATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/src-tauri" && pwd)"
cd "$CRATE_DIR"

# triple|crate that must appear|what its absence would mean
CHECKS=(
  "aarch64-apple-darwin|security-framework|macOS would not use the Keychain"
  "x86_64-apple-darwin|security-framework|macOS would not use the Keychain"
  "x86_64-pc-windows-msvc|windows-sys|Windows would not use the Credential Manager"
  "x86_64-unknown-linux-gnu|dbus-secret-service|Linux would not use the Secret Service"
  "x86_64-unknown-linux-gnu|aes|Linux would send the key over D-Bus UNENCRYPTED (no crypto-rust feature)"
)

fail=0
for check in "${CHECKS[@]}"; do
  IFS='|' read -r triple want why <<< "$check"
  tree="$(cargo tree --target "$triple" -p keyring -e normal 2>/dev/null)"
  if [[ -z "$tree" ]]; then
    echo "FAIL  $triple — cargo tree resolved nothing for the keyring crate"
    fail=1
    continue
  fi
  # match "<crate> v<version>" so a substring of another crate name cannot pass
  if grep -qE "(^|[[:space:]])${want} v[0-9]" <<< "$tree"; then
    echo "ok    $triple → $want"
  else
    echo "FAIL  $triple → '$want' is NOT in the resolved graph"
    echo "        consequence: $why"
    echo "        fix: the [target.'cfg(target_os = \"…\")'.dependencies] block"
    echo "             for keyring in apps/desktop/src-tauri/Cargo.toml"
    fail=1
  fi
done

if [[ $fail -ne 0 ]]; then
  echo
  echo "The desktop shell would ship the wrong keychain backend on at least one"
  echo "platform. This is not a build error — it compiles either way — which is"
  echo "exactly why it is checked here."
  exit 1
fi
echo
echo "All three keychain backends resolve as intended."
