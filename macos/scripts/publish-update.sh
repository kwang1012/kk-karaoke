#!/bin/bash
# Uploads dist/updates/ to the kkaraoke-updates R2 bucket (served at https://updates.kkaraoke.app/macos/).
# Archives and deltas go first and appcast.xml last, so clients never see a feed pointing at a missing file.
set -euo pipefail
cd "$(dirname "$0")/.."

BUCKET="${BUCKET:-kkaraoke-updates}"
PREFIX="${PREFIX:-macos}"
SRC="dist/updates"
if command -v wrangler >/dev/null; then WRANGLER=(wrangler); else WRANGLER=(npx --yes wrangler); fi
[ -f "$SRC/appcast.xml" ] || { echo "No $SRC/appcast.xml: run an OTA=1 release first"; exit 1; }

for f in "$SRC"/*; do
  name="$(basename "$f")"
  [ "$name" = "appcast.xml" ] && continue
  case "$name" in
    *.dmg) type="application/x-apple-diskimage" ;;
    *.delta) type="application/octet-stream" ;;
    *.html) type="text/html" ;;
    *) continue ;;
  esac
  echo "==> $name"
  "${WRANGLER[@]}" r2 object put "$BUCKET/$PREFIX/$name" --file "$f" --content-type "$type" \
    --cache-control "public, max-age=31536000, immutable" --remote
done

# A fixed URL for first-time downloads (https://updates.kkaraoke.app/macos/KKaraoke.dmg): the newest build.
latest="$(ls "$SRC"/KKaraoke-*.dmg | sort -t- -k3 -n | tail -1)"
echo "==> KKaraoke.dmg (copy of $(basename "$latest"))"
"${WRANGLER[@]}" r2 object put "$BUCKET/$PREFIX/KKaraoke.dmg" --file "$latest" \
  --content-type "application/x-apple-diskimage" --cache-control "no-cache" --remote

echo "==> appcast.xml"
"${WRANGLER[@]}" r2 object put "$BUCKET/$PREFIX/appcast.xml" --file "$SRC/appcast.xml" \
  --content-type "application/xml" --cache-control "no-cache" --remote
echo "Published: https://updates.kkaraoke.app/$PREFIX/appcast.xml"
