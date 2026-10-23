#!/bin/bash
# Uploads dist/ (from `yarn package-windows`) to the kkaraoke-updates R2 bucket, served at
# https://updates.kkaraoke.app/windows/. The installer goes first and latest.yml last, so an installed app
# never reads a feed that points at a missing file. Bump "version" in package.json before each release:
# installed apps only update to a higher version.
set -euo pipefail
cd "$(dirname "$0")/.."

BUCKET="${BUCKET:-kkaraoke-updates}"
PREFIX="${PREFIX:-windows}"
[ -f dist/latest.yml ] && [ -f dist/KKaraoke-Setup.exe ] || { echo "No dist/latest.yml: run yarn package-windows first"; exit 1; }
if command -v wrangler >/dev/null; then WRANGLER=(wrangler); else WRANGLER=(npx --yes wrangler); fi

put() { "${WRANGLER[@]}" r2 object put "$BUCKET/$PREFIX/$1" --file "dist/$1" --content-type "$2" --cache-control no-cache --remote; }
put KKaraoke-Setup.exe application/vnd.microsoft.portable-executable
put KKaraoke-Setup.exe.blockmap application/octet-stream
put latest.yml text/yaml
echo "Published: https://updates.kkaraoke.app/$PREFIX/latest.yml"
