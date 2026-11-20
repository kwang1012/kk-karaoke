package app.kkaraoke.tv

import android.app.Application
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.memory.MemoryCache

class KApp : Application(), ImageLoaderFactory {
    /** Lives as long as the process, so the song keeps playing across configuration changes. */
    val player: PlayerController by lazy { PlayerController(this) }
    val room: RoomController by lazy { RoomController(this, player) }

    // A TV box has little memory: keep the covers cache small and decode without alpha.
    override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
        .memoryCache { MemoryCache.Builder(this).maxSizePercent(0.10).build() }
        .components { add(coil.decode.SvgDecoder.Factory()) } // the account avatars are SVG
        .allowRgb565(true)
        .crossfade(true)
        .build()
}

class MainActivity : ComponentActivity() {
    private val player get() = (application as KApp).player
    private val room get() = (application as KApp).room

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Remembered.init(applicationContext)
        Prefs.load(applicationContext)
        Auth.load(applicationContext)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        room.start()
        setContent { KTheme { AppRoot(player, room) } }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean = when (keyCode) {
        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PAUSE -> {
            room.toggle(); true
        }
        KeyEvent.KEYCODE_MEDIA_NEXT -> { room.next(); true }
        KeyEvent.KEYCODE_MEDIA_PREVIOUS -> { room.previous(); true }
        KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> { room.seekBy(10_000); true }
        KeyEvent.KEYCODE_MEDIA_REWIND -> { room.seekBy(-10_000); true }
        else -> super.onKeyDown(keyCode, event)
    }
}
