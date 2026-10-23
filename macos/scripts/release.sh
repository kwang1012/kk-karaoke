#!/bin/bash
# Builds KKaraoke.app in Release and packs it into dist/KKaraoke-<version>-<build>.dmg.
#
#   ./scripts/release.sh                  ad-hoc signed: runs on this Mac (and any Mac where you allow it by hand)
#   SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" ./scripts/release.sh
#                                         signed for distribution
#   ... NOTARY_PROFILE=kkaraoke ./scripts/release.sh
#                                         signed, notarized by Apple and stapled: opens on any Mac with no warning
#
# The notary profile is made once with:
#   xcrun notarytool store-credentials kkaraoke --apple-id you@example.com --team-id TEAMID
# (it asks for an app-specific password from appleid.apple.com).
#
# Other settings: ARCHS (default "arm64 x86_64"), BUILD_NUMBER, SKIP_TESTS=1.
# OTA=1 additionally requires Developer ID signing, notarization, BUILD_NUMBER,
# KARAOKE_UPDATE_FEED_URL and KARAOKE_UPDATE_PUBLIC_KEY. See ../README.md.
set -euo pipefail
cd "$(dirname "$0")/.."

SIGN_IDENTITY="${SIGN_IDENTITY:--}"
ARCHS="${ARCHS:-arm64 x86_64}"
VERSION="$(grep -m1 MARKETING_VERSION project.yml | sed -E 's/.*"([^"]+)".*/\1/')"
BUILD="${BUILD_NUMBER:-$(sed -nE 's/.*CURRENT_PROJECT_VERSION: "([^"]+)".*/\1/p' project.yml)}"
DERIVED="build/release"
DIST="dist"
DMG="$DIST/KKaraoke-$VERSION-$BUILD.dmg"
OTA="${OTA:-0}"
SPARKLE_ACCOUNT="${SPARKLE_ACCOUNT:-kkaraoke}"
PACKAGES="build/SourcePackages"
SPARKLE_BIN="$PACKAGES/artifacts/sparkle/Sparkle/bin"

command -v xcodegen >/dev/null || { echo "xcodegen is required: brew install xcodegen"; exit 1; }
real_identity=0
[ "$SIGN_IDENTITY" != "-" ] && real_identity=1
if [ -n "${NOTARY_PROFILE:-}" ] && [ "$real_identity" = 0 ]; then
  echo "NOTARY_PROFILE needs a Developer ID SIGN_IDENTITY: Apple only notarizes signed apps"; exit 1
fi
if ! [[ "$BUILD" =~ ^[1-9][0-9]*$ ]]; then
  echo "BUILD_NUMBER must be a positive integer"; exit 1
fi
if [ "$OTA" = 1 ]; then
  if [ "$real_identity" = 0 ] || [ -z "${NOTARY_PROFILE:-}" ] || [ -z "${BUILD_NUMBER:-}" ]; then
    echo "OTA=1 requires SIGN_IDENTITY, NOTARY_PROFILE and an increasing BUILD_NUMBER"; exit 1
  fi
  python3 - <<'PY'
import os, base64
from pathlib import Path
import xml.etree.ElementTree as ET
from urllib.parse import urlsplit
feed = urlsplit(os.environ.get('KARAOKE_UPDATE_FEED_URL', ''))
if (feed.scheme != 'https' or not feed.hostname or feed.username or feed.password
    or feed.query or feed.fragment or not feed.path.endswith('/appcast.xml')):
    raise SystemExit('KARAOKE_UPDATE_FEED_URL must be an HTTPS URL ending in /appcast.xml (no credentials, query or fragment)')
try:
    key = base64.b64decode(os.environ.get('KARAOKE_UPDATE_PUBLIC_KEY', ''), validate=True)
except ValueError:
    key = b''
if len(key) != 32:
    raise SystemExit('KARAOKE_UPDATE_PUBLIC_KEY must be a base64-encoded 32-byte Ed25519 public key')
history = Path('dist/updates/appcast.xml')
if history.exists():
    root = ET.parse(history).getroot()
    ns = '{http://www.andymatuschak.org/xml-namespaces/sparkle}'
    versions = []
    for item in root.findall('./channel/item'):
        version = item.findtext(ns + 'version')
        enclosure = item.find('enclosure')
        if version is None and enclosure is not None:
            version = enclosure.get(ns + 'version')
        if version is not None:
            if not version.isdigit():
                raise SystemExit('Existing feed uses non-integer build versions; migrate its version scheme before releasing')
            versions.append(int(version))
    if versions and int(os.environ['BUILD_NUMBER']) <= max(versions):
        raise SystemExit('BUILD_NUMBER must be greater than every version in dist/updates/appcast.xml')
PY
fi

echo "==> Generating the Xcode project"
xcodegen generate >/dev/null

if [ "$OTA" = 1 ]; then
  xcodebuild -resolvePackageDependencies -project KKaraoke.xcodeproj -scheme KKaraoke \
    -derivedDataPath "$DERIVED" -clonedSourcePackagesDirPath "$PACKAGES" >/dev/null
  public_key="$("$SPARKLE_BIN/generate_keys" --account "$SPARKLE_ACCOUNT" -p)"
  [ "$public_key" = "$KARAOKE_UPDATE_PUBLIC_KEY" ] || {
    echo "The Sparkle Keychain public key does not match KARAOKE_UPDATE_PUBLIC_KEY"; exit 1;
  }
fi

if [ "${SKIP_TESTS:-0}" != "1" ]; then
  echo "==> Running the tests"
  log="$(mktemp)"
  xcodebuild -project KKaraoke.xcodeproj -scheme KKaraoke -destination 'platform=macOS,arch=arm64' \
    -derivedDataPath build/test -clonedSourcePackagesDirPath "$PACKAGES" test >"$log" 2>&1 || true
  grep -E "error:|Test run with|TEST (SUCCEEDED|FAILED)" "$log" | sort -u
  grep -q "TEST SUCCEEDED" "$log" || { echo "The tests fail: not building a release"; exit 1; }
fi

echo "==> Building $VERSION ($BUILD) for: $ARCHS"
rm -rf "$DERIVED"
flags=(CODE_SIGN_IDENTITY="$SIGN_IDENTITY" CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM="" CURRENT_PROJECT_VERSION="$BUILD"
       ARCHS="$ARCHS" ONLY_ACTIVE_ARCH=NO ENABLE_HARDENED_RUNTIME=YES CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO)
[ "$real_identity" = 1 ] && flags+=(OTHER_CODE_SIGN_FLAGS="--timestamp")
# Local ad-hoc builds need to load the third-party framework without a team identity.
[ "$real_identity" = 0 ] && flags+=(CODE_SIGN_ENTITLEMENTS=KKaraoke/KKaraoke-Debug.entitlements)
flags+=(KARAOKE_UPDATE_FEED_URL="${KARAOKE_UPDATE_FEED_URL:-}" KARAOKE_UPDATE_PUBLIC_KEY="${KARAOKE_UPDATE_PUBLIC_KEY:-}")
xcodebuild -project KKaraoke.xcodeproj -scheme KKaraoke -configuration Release -destination 'generic/platform=macOS' \
  -derivedDataPath "$DERIVED" -clonedSourcePackagesDirPath "$PACKAGES" "${flags[@]}" build | grep -E "error:|warning: .*sign|BUILD (SUCCEEDED|FAILED)"

APP="$DERIVED/Build/Products/Release/KKaraoke.app"
[ -d "$APP" ] || { echo "No app was built"; exit 1; }

# This script uses `build` rather than archive/export, so sign Sparkle's nested
# helpers explicitly, inside out, before re-signing the containing application.
if [ "$real_identity" = 1 ]; then
  framework="$APP/Contents/Frameworks/Sparkle.framework"
  for component in XPCServices/Installer.xpc XPCServices/Downloader.xpc Autoupdate Updater.app; do
    codesign --force --sign "$SIGN_IDENTITY" --options runtime --timestamp \
      --preserve-metadata=entitlements "$framework/Versions/B/$component"
  done
  codesign --force --sign "$SIGN_IDENTITY" --options runtime --timestamp "$framework"
  codesign --force --sign "$SIGN_IDENTITY" --options runtime --timestamp \
    --entitlements "$DERIVED/Build/Intermediates.noindex/KKaraoke.build/Release/KKaraoke.build/KKaraoke.app.xcent" "$APP"
fi

echo "==> Checking the signature"
codesign --verify --deep --strict --verbose=2 "$APP" 2>&1 | tail -2
codesign -d --entitlements - "$APP" 2>/dev/null | grep -q "get-task-allow" && { echo "A debug entitlement is in the release build"; exit 1; }
lipo -archs "$APP/Contents/MacOS/KKaraoke" | sed 's/^/    architectures: /'

echo "==> Making the disk image"
rm -rf "$DIST/stage" "$DMG"
mkdir -p "$DIST/stage"
cp -R "$APP" "$DIST/stage/"
ln -s /Applications "$DIST/stage/Applications"
hdiutil create -volname "KKaraoke" -srcfolder "$DIST/stage" -ov -format UDZO "$DMG" >/dev/null
rm -rf "$DIST/stage"
[ "$real_identity" = 1 ] && codesign --force --sign "$SIGN_IDENTITY" --timestamp "$DMG"

if [ -n "${NOTARY_PROFILE:-}" ]; then
  echo "==> Notarizing (this waits for Apple, usually a few minutes)"
  xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait
  xcrun stapler staple "$DMG"
  xcrun stapler validate "$DMG"
fi

if [ "$OTA" = 1 ]; then
  echo "==> Generating the signed update feed"
  updates="$DIST/updates"
  mkdir -p "$updates"
  [ ! -e "$updates/$(basename "$DMG")" ] || { echo "This update archive already exists: use a new BUILD_NUMBER"; exit 1; }
  cp "$DMG" "$updates/"
  "$SPARKLE_BIN/generate_appcast" --account "$SPARKLE_ACCOUNT" \
    --download-url-prefix "${KARAOKE_UPDATE_FEED_URL%appcast.xml}" \
    -o "$updates/appcast.xml" "$updates"
  echo "Upload $updates/ archives and deltas first, then appcast.xml to $KARAOKE_UPDATE_FEED_URL"
fi

echo "==> Done"
ls -lh "$DMG"
shasum -a 256 "$DMG"
if [ "$real_identity" = 0 ]; then
  echo "Ad-hoc signed: on another Mac, right-click the app and choose Open the first time (or run xattr -dr com.apple.quarantine on it)."
elif [ -z "${NOTARY_PROFILE:-}" ]; then
  echo "Signed but not notarized: other Macs will warn. Set NOTARY_PROFILE to notarize."
fi
