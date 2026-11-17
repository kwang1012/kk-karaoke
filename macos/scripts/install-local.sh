#!/bin/bash
# Builds the app and installs it over /Applications/KKaraoke.app, with "Check for Updates" switched on.
#
# The build is signed with your Developer ID and points at the published update feed, with a build number one above
# the newest published one, so Sparkle sees it as current and never swaps it for the older published release. Not
# notarized: fine on the Mac that built it. The app being replaced is kept in the scratch folder given by BACKUP_TO.
#
#   ./scripts/install-local.sh
#
# Settings: UPDATES (default https://updates.kkaraoke.app), SIGN_IDENTITY, SPARKLE_ACCOUNT (default kkaraoke),
# BACKUP_TO (default /tmp/KKaraoke-previous.app), ARCHS (default: this Mac's).
set -euo pipefail
cd "$(dirname "$0")/.."

UPDATES="${UPDATES:-https://updates.kkaraoke.app}"
ACCOUNT="${SPARKLE_ACCOUNT:-kkaraoke}"
BACKUP_TO="${BACKUP_TO:-/tmp/KKaraoke-previous.app}"
ARCHS="${ARCHS:-$(uname -m)}"
identity="${SIGN_IDENTITY:-$(security find-identity -v -p codesigning | sed -nE 's/.*"(Developer ID Application:[^"]+)".*/\1/p' | head -1)}"
[ -n "$identity" ] || { echo "No Developer ID Application certificate in the Keychain (or set SIGN_IDENTITY)." >&2; exit 1; }

published="$(curl -fsS "$UPDATES/macos/appcast.xml" | sed -nE 's/.*<sparkle:version>([0-9]+)<.*/\1/p' | sort -n | tail -1)"
[ -n "$published" ] || { echo "Could not read the published build from $UPDATES/macos/appcast.xml" >&2; exit 1; }
bin="build/SourcePackages/artifacts/sparkle/Sparkle/bin"
[ -x "$bin/generate_keys" ] || { echo "Sparkle is not resolved yet: run ./scripts/release.sh once." >&2; exit 1; }
key="$("$bin/generate_keys" --account "$ACCOUNT" -p)"

echo "==> Building (published build $published, this one $((published + 1)))"
SIGN_IDENTITY="$identity" ARCHS="$ARCHS" SKIP_TESTS=1 BUILD_NUMBER="$((published + 1))" \
  KARAOKE_UPDATE_FEED_URL="$UPDATES/macos/appcast.xml" KARAOKE_UPDATE_PUBLIC_KEY="$key" ./scripts/release.sh | grep -E "valid on disk|error|Done"

echo "==> Installing"
osascript -e 'tell application "KKaraoke" to quit' 2>/dev/null || true
sleep 3
rm -rf "$BACKUP_TO"
[ -d /Applications/KKaraoke.app ] && mv /Applications/KKaraoke.app "$BACKUP_TO"
ditto build/release/Build/Products/Release/KKaraoke.app /Applications/KKaraoke.app
codesign --verify --deep --strict /Applications/KKaraoke.app
killall KKaraokeWidget 2>/dev/null || true
open /Applications/KKaraoke.app
echo "Installed build $((published + 1)). The previous app is at $BACKUP_TO"
