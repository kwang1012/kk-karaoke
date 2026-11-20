package app.kkaraoke.tv

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.focusGroup
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

enum class Tab(val label: String) { Home("Home"), Search("Search"), Library("Library") }

sealed interface Screen {
    data class Detail(val collection: MusicCollection) : Screen
    data object NowPlaying : Screen
    data object Pair : Screen
    data object Settings : Screen
}

/** The songs that are ready to sing, shared by every screen so each can mark them without asking again. */
/** What the person chose in Settings, kept on this TV. */
object Prefs {
    private var prefs: android.content.SharedPreferences? = null
    fun init(context: android.content.Context) { prefs = context.getSharedPreferences("kkaraoke-settings", android.content.Context.MODE_PRIVATE) }
    private fun text(key: String, default: String) = prefs?.getString(key, default) ?: default
    private fun put(key: String, value: String) { prefs?.edit()?.putString(key, value)?.apply() }

    /** "ask" (offer the studio recording of a music video), "studio" (always use it) or "keep" (always the video). */
    var versionMode by mutableStateOf("ask")
        private set
    var language by mutableStateOf("en")
        private set
    var name by mutableStateOf("")
        private set
    var avatar by mutableStateOf("")
        private set
    var showVideo by mutableStateOf(false)
        private set

    fun load(context: android.content.Context) {
        init(context)
        versionMode = text("versionMode", "ask"); language = text("language", "en"); name = text("name", ""); avatar = text("avatar", ""); showVideo = text("showVideo", "false") == "true"
    }
    fun chooseVersionMode(v: String) { versionMode = v; put("versionMode", v) }
    fun chooseLanguage(v: String) { language = v; put("language", v) }
    fun chooseName(v: String) { name = v; put("name", v) }
    fun chooseShowVideo(v: Boolean) { showVideo = v; put("showVideo", v.toString()) }
    fun chooseAvatar(v: String) { avatar = v; put("avatar", v) }
}

object Ready {
    var ids by mutableStateOf<Set<String>>(emptySet())
    var songs by mutableStateOf<List<Track>>(emptyList())
    var loaded by mutableStateOf(false); private set
    /** The newest songs, from the last run until the server answers. */
    val shown: List<Track> get() = if (songs.isNotEmpty()) songs else Remembered.songs()

    suspend fun refresh() {
        songs = Api.library().sortedByDescending { it.timeAdded ?: 0L }
        Remembered.saveSongs(songs.take(12))
        ids = songs.mapTo(HashSet()) { it.id }
        loaded = true
    }
}

@Composable
fun AppRoot(player: PlayerController, room: RoomController) {
    val context = LocalContext.current
    var tab by remember { mutableStateOf(Tab.Home) }
    val stack = remember { mutableStateListOf<Screen>() }
    val firstTab = remember { FocusRequester() }
    // where Down from the bar lands: one specific thing on each screen
    val contentFocus = remember(tab) { FocusRequester() }

    // Focus can only be requested once the tab is on screen, and may be refused: neither may stop the library loading.
    LaunchedEffect(Unit) { runCatching { firstTab.requestFocus() } }
    LaunchedEffect(Unit) {
        try { Ready.refresh() } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) {
            android.util.Log.w("KKaraoke", "Couldn't load the library: $e")
        }
    }

    BackHandler(enabled = stack.isNotEmpty()) { stack.removeAt(stack.lastIndex) }

    var picked by remember { mutableStateOf<Track?>(null) }
    var accountMenu by remember { mutableStateOf(false) }
    val toast = { text: String -> Toast.makeText(context, text, Toast.LENGTH_SHORT).show() }
    val open: (MusicCollection) -> Unit = { stack.add(Screen.Detail(it)) }
    val showNowPlaying = { if (stack.lastOrNull() != Screen.NowPlaying) stack.add(Screen.NowPlaying) }
    // choosing a song asks what to do with it: sing it now, or put it in the queue
    var versions by remember { mutableStateOf<Pair<Track, Track>?>(null) }
    val scope = rememberCoroutineScope()
    val pick: (Track) -> Unit = { track ->
        if (track.kind != "video" || Prefs.versionMode == "keep") picked = track
        else scope.launch {
            val studio = try { Api.studioVersion(track) } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { null }
            when {
                studio == null -> picked = track
                Prefs.versionMode == "studio" -> picked = studio.copy(timeAdded = track.timeAdded)
                else -> versions = track to studio
            }
        }
    }
    val playNow: (Track) -> Unit = { room.playNow(it); showNowPlaying() }
    val addToQueue: (Track) -> Unit = { room.addToQueue(it); toast("Added to the queue") }
    val playAll: (List<Track>) -> Unit = { list ->
        val ready = list.filter { it.id in Ready.ids }
        if (ready.isEmpty()) {
            Toast.makeText(context, "None of these songs are processed yet.", Toast.LENGTH_LONG).show()
        } else {
            room.playAll(ready)
            showNowPlaying()
        }
    }

    LaunchedEffect(room.message) {
        room.message?.let {
            Toast.makeText(context, it, Toast.LENGTH_LONG).show()
            room.message = null
        }
    }

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF15131E), Bg), endY = 1100f))) {
        when (val top = stack.lastOrNull()) {
            is Screen.NowPlaying -> NowPlayingScreen(player, room, onBack = { stack.removeAt(stack.lastIndex) })
            is Screen.Detail -> CollectionScreen(top.collection, pick, playAll)
            is Screen.Settings -> {
                val first = remember { FocusRequester() }
                Column(Modifier.fillMaxSize().padding(top = 28.dp)) {
                    Text(tr("Settings"), style = Type.title, modifier = Modifier.padding(horizontal = ScreenInset))
                    SettingsScreen(room, { stack.add(Screen.Pair) }, { room.signOut(); toast("Signed out") }, first)
                }
            }
            is Screen.Pair -> PairScreen(room, onClose = { stack.removeAt(stack.lastIndex) })
            null -> Box(Modifier.fillMaxSize()) {
                // Home runs under the bar (its hero fills the top); every other screen starts below it.
                when (tab) {
                    Tab.Home -> HomeScreen(open, pick, playNow, addToQueue, contentFocus)
                    Tab.Search -> Box(Modifier.padding(top = TopBarHeight)) { SearchScreen(room, open, pick, contentFocus) }
                    Tab.Library -> Box(Modifier.padding(top = TopBarHeight)) { LibraryScreen(pick, contentFocus) }
                }
                TopBar(
                    tab, room.upNext.size, onTab = { tab = it }, firstTab, contentFocus,
                    nowPlaying = room.shownSong, loading = !room.queueLoaded, playing = player.isPlaying,
                    email = Auth.email, nickname = Auth.nickname, signedIn = Auth.signedIn,
                    onNowPlaying = { if (room.queueLoaded) { if (!player.isPlaying) room.toggle(); stack.add(Screen.NowPlaying) } },
                    onAccount = { stack.add(Screen.Settings) },
                )
            }
        }
        if (accountMenu) {
            ActionSheet(
                Auth.nickname ?: "Signed in", Auth.email.orEmpty(),
                listOf(SheetAction(tr("Sign out of this TV")) { room.signOut(); toast("Signed out") }),
                onDismiss = { accountMenu = false },
            )
        }
        versions?.let { (video, studio) ->
            ActionSheet(
                video.name, tr("Which version?"),
                listOf(
                    SheetAction(tr("Studio recording"), Glyph.Studio) { picked = studio.copy(timeAdded = video.timeAdded) },
                    SheetAction(tr("Music video"), Glyph.Video) { picked = video },
                ),
                onDismiss = { versions = null }, artwork = video.artworkUrl,
            )
        }
        picked?.let { track ->
            ActionSheet(
                track.name, track.artistText,
                listOf(
                    SheetAction(tr("Play now"), Glyph.Play) { playNow(track) },
                    SheetAction(tr("Play next"), Glyph.Next) { room.playNext(track); toast("Playing next") },
                    SheetAction(tr("Add to queue"), Glyph.Plus) { addToQueue(track) },
                ),
                onDismiss = { picked = null },
                artwork = track.artworkUrl,
            )
        }
    }
}

@Composable
private fun TopBar(
    selected: Tab, queueSize: Int, onTab: (Tab) -> Unit, firstTab: FocusRequester, down: FocusRequester, nowPlaying: Track?, loading: Boolean, playing: Boolean,
    email: String?, nickname: String?, signedIn: Boolean, onNowPlaying: () -> Unit, onAccount: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .height(TopBarHeight)
            .background(Brush.verticalGradient(0f to Color(0xE6121212), 1f to Color.Transparent))
            .padding(start = ScreenInset, end = ScreenInset, top = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // at the left: what is playing (it opens the player), or the name of the app when nothing is
        Box(Modifier.width(232.dp)) { when {
            nowPlaying != null -> MiniPlayer(nowPlaying, playing, down, onNowPlaying)
            loading -> Bone(Modifier.fillMaxWidth().height(52.dp), RoundedCornerShape(6.dp))
            else -> Brand()
        } }
        Spacer(Modifier.width(28.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
            Tab.entries.forEach { tab ->
                val icon = when (tab) { Tab.Home -> Glyph.Home; Tab.Search -> Glyph.Search; Tab.Library -> Glyph.Library }
                NavItem(tr(tab.label), icon, null, tab == selected, { onTab(tab) }, if (tab == Tab.Home) firstTab else null, down)
            }
        }
        Spacer(Modifier.weight(1f))
        Focusable(onAccount, shape = CircleShape, scaleOnFocus = 1.18f, glow = true, down = down) { focused ->
            val name = Prefs.name.ifBlank { nickname ?: email.orEmpty() }
            // a gap between the picture and the ring, and a dimmer picture until it is chosen, so the active state reads at once
            Box(Modifier.padding(4.dp).graphicsLayer { alpha = if (focused) 1f else 0.7f }) {
                Avatar(name.firstOrNull()?.uppercase() ?: "K", Prefs.avatar.ifBlank { Auth.avatar })
            }
        }
    }
}

@Composable
private fun Brand() {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Image(painterResource(R.drawable.ic_launcher), "KKaraoke", Modifier.size(40.dp).clip(RoundedCornerShape(9.dp)))
        Text("KKaraoke", style = Type.heading.copy(fontSize = 22.sp))
    }
}

@Composable
private fun NavItem(label: String, icon: Glyph, count: Int?, selected: Boolean, onClick: () -> Unit, focusRequester: FocusRequester?, down: FocusRequester) {
    Focusable(onClick, shape = RoundedCornerShape(50), focusRequester = focusRequester, scaleOnFocus = 1.05f, down = down) { focused ->
        val ink = if (selected || focused) TextPrimary else TextDim
        Row(
            Modifier
                .background(if (focused) Color(0x29FFFFFF) else Color.Transparent)
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(9.dp),
        ) {
            Icon(icon, ink, 22.dp)
            Text(label, style = Type.bodyStrong.copy(fontSize = 17.sp, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium), color = ink)
            if (count != null) Text(count.toString(), style = Type.label, color = TextFaint)
        }
    }
}

/** The song that is playing, as a small card in the corner: its cover, name and artist. Select opens the player. */
@Composable
private fun MiniPlayer(track: Track, playing: Boolean, down: FocusRequester, onClick: () -> Unit) {
    Focusable(onClick, shape = RoundedCornerShape(6.dp), scaleOnFocus = 1.04f, down = down) { focused ->
        Row(
            Modifier
                .fillMaxWidth()
                .background(if (focused) Color(0x59FFFFFF) else Color(0x33FFFFFF)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Cover(track.artworkUrl, Modifier.size(52.dp), RoundedCornerShape(0.dp), px = 140)
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(track.name, style = Type.label.copy(fontWeight = FontWeight.Bold), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(track.artistText, style = Type.caption, color = TextDim, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (playing) Equalizer(true, Accent, size = 18.dp) else Icon(Glyph.Play, Color.White, 18.dp)
            Spacer(Modifier.width(14.dp))
        }
    }
}
