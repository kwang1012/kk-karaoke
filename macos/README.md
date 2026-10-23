# KKaraoke for Mac

A native SwiftUI app for macOS 15 and later. It talks to the same backend as the web app (the API and the vocal-removal
worker), so songs, lyrics, melodies, rooms and queues are shared with it, and it adds what a browser can't: the microphone
on any device, media keys, a menu bar item, and songs downloaded to the Mac that play with no server at all.

## Build and run

```bash
brew install xcodegen
cd macos
xcodegen generate        # the Xcode project is generated from project.yml
open KKaraoke.xcodeproj  # then ⌘R
```

The app always uses the production backend (`https://api.kkaraoke.app/api`, in `AppModel.productionAPI`): there is no
setting for the address. To develop against a local backend, change that one constant.

Tests: `xcodebuild -project KKaraoke.xcodeproj -scheme KKaraoke -destination 'platform=macOS' test`

## What it does

| | |
| --- | --- |
| **Browse, search, library** | The same shelves, search and processed songs as the web app. |
| **Play** | Vocal and instrumental stems play together; the original vocal is a level (0 is a karaoke track). Synced lyrics fill word by word. Once the current audio is ready, the next and previous ready songs' stems and lyrics preload. |
| **Sing** | Pick any microphone; the melody scrolls as a piano roll and you are scored as you sing. Hear yourself through the speakers with reverb (use headphones). |
| **Rooms** | Open a room and friends join with a code or QR. Anyone can add songs and control playback. Or join someone else's room and use this Mac as the remote. |
| **TV display** | ⇧⌘T opens a window made for a second display: big lyrics, the join code, what's next. |
| **Offline** | Download a song (the arrow on its row) to keep its audio, lyrics and melody. With no server you can still sing downloaded songs from a queue kept on the Mac. |
| **Floating lyrics, notch** | A small always-on-top lyrics window (it also opens when the window is minimized), and an optional pill that grows out of the notch (Settings → Audio). |
| **Output device, AirPlay** | The speaker button in the player bar picks the output, with the system's AirPlay picker for speakers and TVs. |
| **Notifications, Dock, Spotlight, Shortcuts, widget** | A notification when a song is ready or downloaded, a Dock menu and badge, songs searchable in Spotlight, "Sing a song" in Shortcuts and Siri, and a Now Singing desktop widget. |
| **Media keys, Now Playing, menu bar** | Play/pause/next/previous from the keyboard or headphones, the Control Center widget, and a menu bar window. |

## Release

```bash
./scripts/release.sh                      # a DMG signed ad hoc: fine for this Mac
SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" ./scripts/release.sh
SIGN_IDENTITY="..." NOTARY_PROFILE=kkaraoke ./scripts/release.sh   # also notarized and stapled
```

The DMG lands in `dist/`. To distribute it to other people you need a paid Apple Developer account for the Developer ID
certificate and notarization; without them, other Macs ask the user to open the app by hand the first time. Create the
notary profile once with `xcrun notarytool store-credentials kkaraoke --apple-id you@example.com --team-id TEAMID`.

## Over-the-air updates

The Mac app uses [Sparkle 2](https://sparkle-project.org/documentation/) for updates distributed outside the Mac App Store.
Configured builds have **KKaraoke → Check for Updates…** and an automatic-check preference in Settings.
Sparkle asks permission before enabling automatic checks; installation requires user interaction.
If playback or a song download is active when installation requests a relaunch, the app waits until playback stops.
Builds without a valid HTTPS feed and Ed25519 public key leave the updater disabled.

### One-time setup

Resolve the package, then generate the update signing key in your login Keychain:

```bash
cd macos
xcodegen generate
xcodebuild -resolvePackageDependencies -project KKaraoke.xcodeproj -scheme KKaraoke \
  -derivedDataPath build/release -clonedSourcePackagesDirPath build/SourcePackages
build/SourcePackages/artifacts/sparkle/Sparkle/bin/generate_keys --account kkaraoke
```

Save the printed **public** key for `KARAOKE_UPDATE_PUBLIC_KEY`. Keep and back up the private key securely
using Sparkle's `generate_keys -x` option; never put it in the repository or host it with releases.
The release script uses the `kkaraoke` Keychain account by default (`SPARKLE_ACCOUNT` overrides it).
Prepare a public static HTTPS location such as `https://updates.example.com/macos/appcast.xml` for the feed
and place the update downloads in that same directory. No API server is needed for updates.

### Build a release

Increment `MARKETING_VERSION` in `project.yml` for a new display version. Set `BUILD_NUMBER` to an integer
greater than every build previously published, including builds made before enabling OTA. It defaults to
`CURRENT_PROJECT_VERSION` for local builds but is mandatory for OTA releases; Git commit counts are no longer used.

```bash
OTA=1 \
BUILD_NUMBER=1001 \
SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" \
NOTARY_PROFILE=kkaraoke \
KARAOKE_UPDATE_FEED_URL="https://updates.example.com/macos/appcast.xml" \
KARAOKE_UPDATE_PUBLIC_KEY="YOUR_PUBLIC_KEY_FROM_GENERATE_KEYS" \
./scripts/release.sh
```

The script runs tests, builds a universal app, signs the app and Sparkle helpers, notarizes and staples the DMG,
then puts `KKaraoke-<version>-<build>.dmg`, `appcast.xml`, and any generated delta files in `dist/updates/`.
It checks that the Keychain key matches the embedded public key before building an OTA release.
Preserve this directory between releases (or restore it from your release artifacts) so Sparkle can retain feed history
and create deltas. Never replace an existing release archive with different bytes.

Run `./scripts/publish-update.sh` to upload `dist/updates/` to the `kkaraoke-updates` R2 bucket (served at
`https://updates.kkaraoke.app/macos/`); it uploads DMGs and deltas first, then `appcast.xml` last. It also refreshes `KKaraoke.dmg` (a copy of the newest DMG, uncached) at
`https://updates.kkaraoke.app/macos/KKaraoke.dmg`: the fixed first-time download link used by the web app's `/download` page.
Upload new DMGs and delta files first, then upload `appcast.xml` last. Keep feed caching short or require revalidation;
versioned archives can be cached indefinitely. Hosting/upload credentials and publishing are managed separately.
For release notes, add a matching `.html` file beside the DMG in `dist/updates/` and rerun `generate_appcast`
with the same `--account`, `--download-url-prefix` and `-o` options used by the release script.

To test a configured build directly in Xcode, set the `KARAOKE_UPDATE_FEED_URL` and `KARAOKE_UPDATE_PUBLIC_KEY`
build settings. Debug builds disable library validation so locally signed builds can load Sparkle;
Developer ID releases keep library validation enabled. The sandbox installer service is enabled in both.

Before publishing the first update, install the previous configured release in `/Applications`, offer a higher build
from your HTTPS feed, and verify download, installation and relaunch, including an installation requested during a song.
Also verify that offline downloads and settings survive the update. Existing versions without Sparkle need one manual
upgrade to the first configured release. Developer ID signing, Apple notarization and a live feed are required to validate
the complete distribution flow.

The desktop widget shares the current song with the app through the app group `V3XYRJ87X8.app.kkaraoke.KKaraoke`
(team-prefixed, in both `.entitlements` files). Server answers are cached for a few minutes (`QueryCache`), like the web
app's React Query, and a song finishing processing refreshes the library.

## Not in the Mac app yet

- Changing the song's key (the web app pitch-shifts with SoundTouch).
- Signing in as a host. If your server requires it to open a room, use the web app to do that.
- Processing new songs on the Mac itself: processing happens on the server.
