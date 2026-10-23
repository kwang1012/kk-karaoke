The native app uses the web app's logo and Lucide icon release.

Run `node macos/Tools/sync-web-assets.mjs` from the repository after updating
`lucide-react` or `frontend/public/favicon.svg`. The script reads the installed
frontend package and uses `rsvg-convert` to produce vector PDF assets, the macOS
app icon sizes, and the bundled Lucide license. No icon package is required at
runtime. `Lucide.swift` provides the native SwiftUI views for those assets.

The Xcode build also runs `configure-auth.py` to bundle only the same public
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` used by the web client. It follows
Vite's `.env`, `.env.local`, `.env.production`, `.env.production.local` precedence,
with environment variables taking priority. Set `KARAOKE_AUTH_MODE=development`
to use the development files instead. Empty settings keep local use account-free.
Host credentials are entered in the app; only the session is saved in macOS Keychain.

## Provider logos

`brand-spotify`, `brand-applemusic` and `brand-youtubemusic` in the asset catalog are the [Simple Icons](https://simpleicons.org)
glyphs (CC0), converted to PDF with `rsvg-convert` and used as template images. KKBOX has no Simple Icons glyph, so the
app draws a plain "K" monogram for it instead of imitating the logo.
