# KKaraoke for Google TV

A native Kotlin app (Jetpack Compose) for Android TV and Google TV. It talks to the same backend as the web and Mac apps
(`https://api.kkaraoke.app/api`, in `Api.kt`), so browse shelves, search and processed songs are shared with them.

## What it does so far

| | |
| --- | --- |
| **Home, Search, Library** | The same shelves, search and processed songs as the other apps. Everything is reachable with the D-pad. |
| **Album / playlist** | Songs that are ready to sing are marked with a filled dot; Select plays them. |
| **Play** | Media3/ExoPlayer plays the server's mixed file (`tracks/mix/{id}?vocal=`). "Guide vocal" switches between the karaoke track and the original. |
| **Queue and room** | The queue lives on the server, in a room named after the TV. The Queue tab shows it, with a QR code and join code, so phones can join, add songs and press play, pause, next, seek, volume and the guide vocal. Picking a song on the TV asks: Play now, Play next, or Add to queue. |
| **Sign in** | "Sign in" (top right) shows a code and a QR code; approve it on your phone at `kkaraoke.app/link`. The TV then uses the account's room, can open it as a jam, and can add songs that aren't processed. If another device of the account plays, the TV says so and offers "Play on this TV". "Sign out of this TV" revokes its token. |
| **Lyrics** | Synced lyrics scroll with the song; the line being sung fills word by word when the server has word timing. |

Not done yet: localization (zh-TW), an update check, and a disk cache for the library. The TV has
no microphone input and no pitch shift in this version. Its player is one mixed file, so "Guide vocal" is on or off, and the
first time a song is played at a new vocal level the server needs several seconds to make the mix.

## Build and install

Needs the Android SDK and a **JDK 17** (the Gradle plugin does not support JDK 25).

```bash
cd android-tv
export JAVA_HOME=$(/usr/libexec/java_home -v 17) ANDROID_HOME=$HOME/Library/Android/sdk
./gradlew :app:assembleDebug
```

On the TV: Settings → System → About → tap "Android TV OS build" 7 times, then Developer options → USB debugging on.

```bash
adb connect <tv-ip>:5555        # accept the prompt on the TV
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n app.kkaraoke.tv/.MainActivity
```

The app also appears in the TV launcher (it declares a `LEANBACK_LAUNCHER` activity and a banner).

## Trying sign-in before it is deployed

Debug builds can talk to another server: `./gradlew :app:assembleDebug -PapiBase=http://localhost:8000/api` (cleartext is
allowed in debug builds only; `adb reverse tcp:8000 tcp:8000` lets the TV reach your computer). `-PwebBase=` changes the
address in the QR code.

## Notes for low-end TVs

Tested on a TCL Google TV (Android 14, 2.4 GB RAM, 32-bit `armeabi-v7a`). The UI is laid out for 960×540 dp, the image cache is
kept to 10% of memory and covers decode without alpha. Any native library added later needs a 32-bit build.
