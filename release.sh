#!/usr/bin/env bash
# Release the desktop apps: build, check, and publish the update feeds on https://updates.kkaraoke.app.
#
#   ./release.sh                 Windows and Mac
#   ./release.sh windows         only the Windows installer (Electron)
#   ./release.sh mac             only the Mac app (signed, notarized, delta updates)
#   ./release.sh -n              show the versions and what would run, change nothing
#
# The web app and backend are deployed with ./deploy.sh; this does not touch them.
#
# Versions are chosen from what is already published, so a release is always higher than the last one:
#   Windows  patch bump of the published latest.yml (or frontend/package.json when that is higher)
#   Mac      the highest published build number + 1 (override with BUILD_NUMBER=...)
#
# Needs: yarn, wrangler logged in, and for Mac xcodegen, the Developer ID certificate, the Sparkle key and the
# `kkaraoke` notary profile in the Keychain (see macos/README.md). SIGN_IDENTITY / NOTARY_PROFILE override them.
set -euo pipefail

API_ADDR="${API_ADDR:-api.kkaraoke.app}"
UPDATES="${UPDATES:-https://updates.kkaraoke.app}"
NOTARY_PROFILE="${NOTARY_PROFILE:-kkaraoke}"
SPARKLE_ACCOUNT="${SPARKLE_ACCOUNT:-kkaraoke}"

target="all"
dry=0
for arg in "$@"; do
  case "$arg" in
    windows | mac | all) target="$arg" ;;
    -n | --dry-run) dry=1 ;;
    -h | --help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 1 ;;
  esac
done

cd "$(dirname "$0")"

run() {
  echo "+ $*"
  if [ "$dry" -eq 0 ]; then "$@"; fi
}

# 0.2.9 < 0.2.10: compare each part as a number. Prints the higher of two versions.
higher_version() {
  python3 - "$1" "$2" <<'PY'
import sys
a, b = sys.argv[1:3]
key = lambda v: [int(p) for p in v.split(".")]
print(a if key(a) >= key(b) else b)
PY
}

# ---------------------------------------------------------------- Windows

release_windows() {
  echo "==> Windows"
  local published local_version version
  published="$(curl -fsS "$UPDATES/windows/latest.yml" | sed -nE 's/^version: *//p' | head -1)"
  local_version="$(sed -nE 's/^ *"version": *"([^"]+)".*/\1/p' frontend/package.json | head -1)"
  [ -n "$published" ] || { echo "Could not read the published Windows version from $UPDATES/windows/latest.yml" >&2; exit 1; }
  version="$(higher_version "$published" "$local_version")"
  if [ "$version" = "$published" ]; then
    version="$(python3 -c "import sys; p=sys.argv[1].split('.'); p[-1]=str(int(p[-1])+1); print('.'.join(p))" "$published")"
  fi
  echo "published $published, releasing $version"

  if [ "$dry" -eq 0 ] && [ "$version" != "$local_version" ]; then
    python3 - "$version" <<'PY'
import re, sys
path = "frontend/package.json"
text = open(path).read()
open(path, "w").write(re.sub(r'("version":\s*")[^"]+(")', rf'\g<1>{sys.argv[1]}\g<2>', text, count=1))
PY
  fi

  # The API address is baked into the build. A value in the environment beats every .env file, so a
  # frontend/.env.local pointing at localhost (for development) cannot leak into the installer.
  run bash -c "cd frontend && VITE_API_ADDR='$API_ADDR' yarn package-windows"
  [ "$dry" -eq 1 ] || check_bundle
  run bash -c "cd frontend && yarn publish-windows"
  if [ "$dry" -eq 0 ]; then
    echo "published: $(curl -fsS "$UPDATES/windows/latest.yml" | sed -nE 's/^version: *//p' | head -1)"
  fi
}

# The installer must talk to production: it contains the API address, and none of the addresses a developer
# machine configures in its .env.*.local files.
check_bundle() {
  local bundle=frontend/build/assets
  grep -lF "$API_ADDR" "$bundle"/*.js >/dev/null || { echo "The build does not contain $API_ADDR: not publishing." >&2; exit 1; }
  local file addr
  for file in frontend/.env.local frontend/.env.*.local; do
    [ -f "$file" ] || continue
    addr="$(sed -nE 's/^VITE_API_ADDR=//p' "$file" | head -1)"
    if [ -n "$addr" ] && [ "$addr" != "$API_ADDR" ] && grep -lF "$addr" "$bundle"/*.js >/dev/null; then
      echo "The build contains $addr from $file: not publishing." >&2
      exit 1
    fi
  done
  echo "checked: the build talks to $API_ADDR"
}

# -------------------------------------------------------------------- Mac

release_mac() {
  echo "==> Mac"
  local published build identity bin key
  published="$(curl -fsS "$UPDATES/macos/appcast.xml" | sed -nE 's/.*<sparkle:version>([0-9]+)<.*/\1/p' | sort -n | tail -1)"
  [ -n "$published" ] || { echo "Could not read the published Mac build from $UPDATES/macos/appcast.xml" >&2; exit 1; }
  build="${BUILD_NUMBER:-$((published + 1))}"
  echo "published build $published, releasing $build"

  identity="${SIGN_IDENTITY:-$(security find-identity -v -p codesigning | sed -nE 's/.*"(Developer ID Application:[^"]+)".*/\1/p' | head -1)}"
  [ -n "$identity" ] || { echo "No Developer ID Application certificate in the Keychain (or set SIGN_IDENTITY)." >&2; exit 1; }
  echo "signing as: $identity"

  bin="macos/build/SourcePackages/artifacts/sparkle/Sparkle/bin"
  if [ -x "$bin/generate_keys" ]; then
    key="$("$bin/generate_keys" --account "$SPARKLE_ACCOUNT" -p)"
  elif [ "$dry" -eq 1 ]; then
    key="(read from the Keychain)"
  else
    echo "Sparkle is not resolved yet: run macos/scripts/release.sh once (see macos/README.md)." >&2; exit 1
  fi

  run env OTA=1 BUILD_NUMBER="$build" SIGN_IDENTITY="$identity" NOTARY_PROFILE="$NOTARY_PROFILE" \
    KARAOKE_UPDATE_FEED_URL="$UPDATES/macos/appcast.xml" KARAOKE_UPDATE_PUBLIC_KEY="$key" \
    macos/scripts/release.sh
  run macos/scripts/publish-update.sh
  if [ "$dry" -eq 0 ]; then
    echo "published build: $(curl -fsS "$UPDATES/macos/appcast.xml" | sed -nE 's/.*<sparkle:version>([0-9]+)<.*/\1/p' | sort -n | tail -1)"
  fi
}

case "$target" in
  windows) release_windows ;;
  mac) release_mac ;;
  all) release_windows; release_mac ;;
esac
echo "Done."
