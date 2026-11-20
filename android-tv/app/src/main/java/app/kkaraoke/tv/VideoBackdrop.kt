package app.kkaraoke.tv

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay

/**
 * The recording's own YouTube video, muted and kept in step with our audio (which is the clock), as the web TV display
 * does. It keeps loading while hidden, so showing it is instant. Some videos can't be embedded: [onFailed] says so, and
 * the lyrics stay.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun VideoBackdrop(videoId: String, visible: Boolean, player: PlayerController, onFailed: () -> Unit, modifier: Modifier = Modifier) {
    val failed by rememberUpdatedState(onFailed)
    var view: WebView? = null
    AndroidView(
        modifier = modifier.fillMaxSize(),
        factory = { context ->
            WebView(context).also { web ->
                view = web
                web.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null)
                web.isFocusable = false
                web.isFocusableInTouchMode = false
                web.setBackgroundColor(AndroidColor.BLACK)
                web.webChromeClient = object : android.webkit.WebChromeClient() {
                    override fun onConsoleMessage(m: android.webkit.ConsoleMessage): Boolean { android.util.Log.d("KKaraoke", "video: ${m.message()}"); return true }
                }
                web.settings.javaScriptEnabled = true
                web.settings.mediaPlaybackRequiresUserGesture = false
                web.addJavascriptInterface(object { @JavascriptInterface fun failed() { web.post { failed() } } }, "Host")
                web.loadDataWithBaseURL("https://kkaraoke.app", page(videoId), "text/html", "utf-8", null)
            }
        },
        update = { it.alpha = if (visible) 1f else 0f }, // not a Compose layer: that makes a WebView's video draw black
        onRelease = { it.destroy() },
    )
    LaunchedEffect(videoId) {
        while (true) {
            delay(400)
            val playing = player.isPlaying && !player.buffering
            view?.evaluateJavascript("sync(${player.livePositionMs() / 1000.0},$playing)", null)
        }
    }
}

private fun page(id: String) = """
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{margin:0;height:100%;background:#000;overflow:hidden}
#p{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(100vw,177.78vh);height:min(100vh,56.25vw)}
</style></head><body><div id="p"></div>
<script src="https://www.youtube.com/iframe_api"></script>
<script>
var pl, ready = false;
function onYouTubeIframeAPIReady() {
  pl = new YT.Player('p', {
    width: '100%', height: '100%', videoId: '$id',
    playerVars: {controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, iv_load_policy: 3, playsinline: 1, mute: 1},
    events: {
      onReady: function (e) { console.log('ready'); e.target.mute(); e.target.playVideo(); ready = true; },
      onError: function (e) { console.log('error ' + e.data); Host.failed(); },
      onStateChange: function (e) { console.log('state ' + e.data); }
    }
  });
}
function sync(t, playing) {
  if (!ready) return;
  try {
    if (playing && Math.abs(pl.getCurrentTime() - t) > 0.6) pl.seekTo(t, true);
    var s = pl.getPlayerState();
    if (!playing) { if (s == 1) pl.pauseVideo(); }
    else if (s != 1 && s != 3) pl.playVideo();
  } catch (e) {}
}
</script></body></html>
"""
