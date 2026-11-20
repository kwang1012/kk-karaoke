package app.kkaraoke.tv

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.gestures.BringIntoViewSpec
import androidx.compose.foundation.gestures.LocalBringIntoViewSpec
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

sealed interface Load<out T> {
    data object Loading : Load<Nothing>
    data class Ok<T>(val value: T) : Load<T>
    data class Fail(val message: String) : Load<Nothing>
}

class Loader<T>(private val scope: CoroutineScope, private val block: suspend () -> T, initial: T? = null) {
    /** Starts out loaded when [initial] is known, so coming back to a screen shows it at once instead of "Loading…". */
    var state by mutableStateOf<Load<T>>(if (initial != null) Load.Ok(initial) else Load.Loading)
        private set

    fun reload() {
        state = Load.Loading
        scope.launch {
            state = try {
                Load.Ok(block())
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Load.Fail(e.message ?: "Couldn't reach the server.")
            }
        }
    }
}

@Composable
fun <T> rememberLoader(key: Any?, initial: T? = null, block: suspend () -> T): Loader<T> {
    val scope = rememberCoroutineScope()
    return remember(key) { Loader(scope, block, initial).also { if (initial == null) it.reload() } }
}

@Composable
private fun <T> LoadView(loader: Loader<T>, messageModifier: Modifier = Modifier, loading: @Composable () -> Unit = { Message("Loading…", messageModifier) }, content: @Composable (T) -> Unit) {
    when (val s = loader.state) {
        Load.Loading -> loading()
        is Load.Fail -> Message(s.message, messageModifier) { TvButton("Try again", loader::reload) }
        is Load.Ok -> content(s.value)
    }
}

// MARK: Home

private val languages = listOf("chinese" to "Chinese", "korean" to "Korean", "english" to "English", "japanese" to "Japanese")

private object HomeCache {
    var shelves: Map<String, List<MusicCollection>>? = null
}

/**
 * Moving focus never scrolls a thing under the floating bar: what is already in view stays where it is, and what has to
 * come into view stops below the bar.
 */
@OptIn(ExperimentalFoundationApi::class)
private fun keepClearOfBar(top: Float, bottom: Float) = object : BringIntoViewSpec {
    override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float {
        val trailing = offset + size
        val limit = containerSize - bottom
        return when {
            offset >= top && trailing <= limit -> 0f
            offset < top -> offset - top
            else -> trailing - limit
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun HomeScreen(
    onOpen: (MusicCollection) -> Unit,
    onPick: (Track) -> Unit,
    onPlayNow: (Track) -> Unit,
    onAdd: (Track) -> Unit,
    entry: FocusRequester,
) {
    val loader = rememberLoader("home", HomeCache.shelves) {
        Api.topCategories(languages.map { it.first }).also { HomeCache.shelves = it }
    }
    // Home runs under the floating bar, so its messages start below it.
    Box(Modifier.fillMaxSize()) { run {
        val shelves = (loader.state as? Load.Ok)?.value.orEmpty()
        val songs = Ready.shown
        var featured by rememberSaveable { mutableIntStateOf(0) }
        val topInset = with(LocalDensity.current) { TopBarHeight.toPx() }
        val bottomInset = with(LocalDensity.current) { 40.dp.toPx() }
        val spec = remember(topInset) { keepClearOfBar(topInset, bottomInset) }
        val listState = androidx.compose.foundation.lazy.rememberLazyListState()
        val scope = androidx.compose.runtime.rememberCoroutineScope()
        CompositionLocalProvider(LocalBringIntoViewSpec provides spec) {
        LazyColumn(Modifier.fillMaxSize(), state = listState, contentPadding = PaddingValues(bottom = 56.dp)) {
            // Always the same height, empty until the library arrives, so nothing jumps when it does.
            item("hero") { Box(Modifier.onFocusChanged { if (it.hasFocus) scope.launch { listState.animateScrollToItem(0) } }) { Hero(songs.take(5), featured, { featured = it }, onPick, onPlayNow, onAdd, entry) } }
            item("tiles") { Tiles(songs.drop(5).take(8), onPick) }
            item("charts") {
                val charts = rememberLoader("charts") { runCatching { Api.charts() }.getOrDefault(emptyList()) }
                val sources = (charts.state as? Load.Ok)?.value.orEmpty()
                sources.forEach { source ->
                    Shelf(source.name, source.charts, key = { it.id }) { chart -> ChartCard(source.id, chart) { onOpen(chart) } }
                }
            }
            when (val st = loader.state) {
                Load.Loading -> item("shelf-skeleton") { ShelfSkeleton() }
                is Load.Fail -> item("shelf-fail") { Message(st.message) { TvButton("Try again", loader::reload) } }
                else -> {}
            }
            languages.forEachIndexed { row, (keyword, title) ->
                val entries = shelves[keyword].orEmpty()
                if (entries.isNotEmpty()) {
                    item(keyword) {
                        Shelf(title, entries, key = { it.id }) { c ->
                            val first = songs.isEmpty() && row == languages.indexOfFirst { shelves[it.first].orEmpty().isNotEmpty() } && c == entries.first()
                            PosterCard(c.name, c.subtitle, c.artworkUrl, { onOpen(c) }, focusRequester = if (first) entry else null)
                        }
                    }
                }
            }
        }
        }
    }
}
}

/**
 * The newest songs that are ready to sing, as the Home screen opens: the one in the middle is large, behind it the whole
 * screen takes its colours, and moving along the thumbnails changes which one it is.
 */
@Composable
private fun Hero(
    songs: List<Track>,
    featured: Int,
    onFeature: (Int) -> Unit,
    onPick: (Track) -> Unit,
    onPlayNow: (Track) -> Unit,
    onAdd: (Track) -> Unit,
    entry: FocusRequester,
) {
    val track = songs.getOrNull(featured.coerceIn(0, (songs.size - 1).coerceAtLeast(0)))
    Box(Modifier.fillMaxWidth().height(360.dp)) {
        Crossfade(track?.artworkUrl, label = "heroBackdrop") { url ->
            Backdrop(url, Modifier.fillMaxSize(), strength = 0.85f, sideFade = true, px = 96)
        }
        if (track == null) {
            Column(Modifier.align(Alignment.BottomStart).padding(start = ScreenInset, bottom = 28.dp).width(430.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(tr("New and ready to sing"), style = Type.body, color = TextDim)
                Bone(Modifier.width(360.dp).height(40.dp))
                Bone(Modifier.width(200.dp).height(20.dp))
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Bone(Modifier.width(150.dp).height(48.dp), RoundedCornerShape(24.dp))
                    Bone(Modifier.width(170.dp).height(48.dp), RoundedCornerShape(24.dp))
                }
            }
        } else {
            Column(
                Modifier.align(Alignment.BottomStart).padding(start = ScreenInset, bottom = 28.dp).width(430.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(tr("New and ready to sing"), style = Type.body, color = TextDim)
                Text(track.name, style = Type.display, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(
                    listOfNotNull(track.artistText.takeIf { it.isNotEmpty() }, track.durationMs?.let { formatTime(it) }).joinToString("  ·  "),
                    style = Type.body, color = TextDim, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    TvButton("Play now", { onPlayNow(track) }, primary = true, icon = Glyph.Play, focusRequester = entry)
                    TvButton("Add to queue", { onAdd(track) }, icon = Glyph.Plus)
                }
            }
            Row(
                Modifier.align(Alignment.BottomEnd).padding(end = ScreenInset, bottom = 28.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                songs.take(5).forEachIndexed { i, song ->
                    Focusable(
                        { onPick(song) }, Modifier.size(74.dp), RoundedCornerShape(6.dp), scaleOnFocus = 1.1f,
                        onFocusChange = { if (it) onFeature(i) },
                    ) { Cover(song.artworkUrl, Modifier.fillMaxSize(), RoundedCornerShape(0.dp), px = 200) }
                }
            }
        }
    }
}

/** Flat shortcuts to more songs that are ready, four to a row. */
@Composable
private fun Tiles(songs: List<Track>, onPick: (Track) -> Unit) {
    if (songs.isEmpty()) return
    Column(Modifier.padding(horizontal = ScreenInset).padding(top = 8.dp, bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        songs.chunked(4).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                row.forEach { TileCard(it.name, it.artworkUrl, { onPick(it) }, Modifier.weight(1f)) }
                repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

// MARK: Search

@Composable
fun SearchScreen(room: RoomController, onOpen: (MusicCollection) -> Unit, onPick: (Track) -> Unit, entry: FocusRequester) {
    val context = androidx.compose.ui.platform.LocalContext.current
    var recents by remember { mutableStateOf(Recents.load(context)) }
    var text by rememberSaveable { mutableStateOf("") }
    var query by rememberSaveable { mutableStateOf("") }
    var focused by remember { mutableStateOf(false) }
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val shape = RoundedCornerShape(34.dp)

    Column(Modifier.fillMaxSize()) {
        // One focus target: the text field itself. Select opens the on-screen keyboard; Up and Down leave it.
        Row(
            Modifier
                .padding(horizontal = ScreenInset, vertical = 12.dp)
                .fillMaxWidth()
                .height(68.dp)
                .clip(shape)
                .background(if (focused) PanelFocused else Panel)
                .border(if (focused) 2.dp else 1.dp, if (focused) Ring else Outline, shape)
                .padding(horizontal = 26.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Icon(Glyph.Search, if (focused) TextPrimary else TextDim, 28.dp)
            Box(Modifier.weight(1f)) {
                if (text.isEmpty()) Text("Search songs and artists", style = Type.body.copy(fontSize = 22.sp), color = TextFaint)
                BasicTextField(
                    value = text,
                    onValueChange = { text = it },
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(entry)
                        .onFocusChanged { focused = it.isFocused }
                        .onPreviewKeyEvent { e ->
                            when {
                                e.type == KeyEventType.KeyDown && e.key == Key.DirectionDown -> { focusManager.moveFocus(FocusDirection.Down); true }
                                e.type == KeyEventType.KeyDown && e.key == Key.DirectionUp -> { focusManager.moveFocus(FocusDirection.Up); true }
                                e.type == KeyEventType.KeyUp && e.key == Key.DirectionCenter -> { keyboard?.show(); false }
                                else -> false
                            }
                        },
                    singleLine = true,
                    textStyle = TextStyle(color = TextPrimary, fontSize = 22.sp),
                    cursorBrush = SolidColor(Accent),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { query = text.trim(); keyboard?.hide(); recents = Recents.add(context, query) }),
                )
            }
        }
        if (query.isEmpty()) {
            val ordered = rememberLoader("ordered:${Auth.userId}") { runCatching { Api.history(room.roomId) }.getOrDefault(emptyList()) }
            val before = (ordered.state as? Load.Ok)?.value.orEmpty()
            if (recents.isEmpty() && before.isEmpty()) {
                EmptyState("Find a song", "Press Select on the search bar to type, or hold the mic button on your remote.")
            } else LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = 8.dp, bottom = 56.dp)) {
                if (recents.isNotEmpty()) {
                    item("recent") {
                        SectionTitle(tr("Recent searches"))
                        androidx.compose.foundation.lazy.LazyRow(
                            contentPadding = PaddingValues(horizontal = ScreenInset, vertical = 14.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) { items(recents.size) { i -> TvButton(recents[i], { text = recents[i]; query = recents[i]; recents = Recents.add(context, recents[i]) }) } }
                    }
                }
                if (before.isNotEmpty()) {
                    item("before-title") { SectionTitle(tr("Ordered before")) }
                    items(before.size, key = { "h-$it-" + before[it].id }) { i ->
                        TrackRow(before[i], before[i].id in Ready.ids, { onPick(before[i]) }, Modifier.padding(horizontal = ScreenInset - 14.dp, vertical = 2.dp))
                    }
                }
            }
        } else {
            val loader = rememberLoader(query) { Api.search(query) }
            LoadView(loader, loading = { TrackListSkeleton(6, Modifier.padding(horizontal = ScreenInset - 14.dp)) }) { results ->
                if (results.tracks.isEmpty() && results.albums.isEmpty() && results.playlists.isEmpty()) {
                    EmptyState("Nothing found", "Nothing matched “$query”. Try another spelling or an artist's name.")
                } else {
                    val songs = results.tracks.take(10)
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = 8.dp, bottom = 56.dp)) {
                        if (songs.isNotEmpty()) {
                            item("songs-title") { SectionTitle("Songs", trailing = "${songs.size}") }
                            items(songs, key = { "t-" + it.id }) { track ->
                                TrackRow(
                                    track, track.id in Ready.ids, { onPick(track) },
                                    Modifier.padding(horizontal = ScreenInset - 14.dp, vertical = 2.dp),
                                )
                            }
                        }
                        if (results.albums.isNotEmpty()) {
                            item("albums") {
                                Shelf("Albums", results.albums, key = { it.id }) { c ->
                                    PosterCard(c.name, c.subtitle, c.artworkUrl, { onOpen(c) })
                                }
                            }
                        }
                        if (results.playlists.isNotEmpty()) {
                            item("playlists") {
                                Shelf("Playlists", results.playlists, key = { it.id }) { c ->
                                    PosterCard(c.name, c.subtitle, c.artworkUrl, { onOpen(c) })
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: Library

@Composable
fun LibraryScreen(onPick: (Track) -> Unit, entry: FocusRequester) {
    LaunchedEffect(Unit) { runCatching { Ready.refresh() } }
    val songs = Ready.songs
    if (songs.isEmpty()) {
        EmptyState("Nothing here yet", "Songs that have been processed for karaoke appear here.")
        return
    }
    Column(Modifier.fillMaxSize()) {
        SectionTitle("Library", Modifier.padding(top = 10.dp), trailing = "${songs.size} songs")
        LazyVerticalGrid(
            columns = GridCells.Adaptive(150.dp),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = ScreenInset, end = ScreenInset, top = 18.dp, bottom = 56.dp),
            horizontalArrangement = Arrangement.spacedBy(22.dp),
            verticalArrangement = Arrangement.spacedBy(22.dp),
        ) {
            items(songs.size, key = { songs[it].id }) { i ->
                val track = songs[i]
                PosterCard(track.name, track.artistText, track.artworkUrl, { onPick(track) }, focusRequester = if (i == 0) entry else null)
            }
        }
    }
}

// MARK: Album or playlist

@Composable
fun CollectionScreen(collection: MusicCollection, onPick: (Track) -> Unit, onPlayAll: (List<Track>) -> Unit) {
    val loader = rememberLoader(collection.id) { Api.tracks(collection) }
    val firstFocus = remember { FocusRequester() }
    Row(Modifier.fillMaxSize().padding(start = ScreenInset, end = ScreenInset - 14.dp, top = 40.dp)) {
        Column(Modifier.width(320.dp).padding(end = 44.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            val shape = RoundedCornerShape(18.dp)
            Cover(collection.artworkUrl, Modifier.size(276.dp).shadow(24.dp, shape), shape, px = 600)
            Spacer(Modifier.height(6.dp))
            Text(collection.name, style = Type.title, maxLines = 3, overflow = TextOverflow.Ellipsis)
            if (collection.subtitle.isNotEmpty()) Text(collection.subtitle, style = Type.body, color = TextDim, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val state = loader.state
            if (state is Load.Loading) {
                Bone(Modifier.width(180.dp).height(14.dp))
                Spacer(Modifier.height(4.dp))
                Bone(Modifier.fillMaxWidth().height(52.dp), RoundedCornerShape(26.dp))
            }
            if (state is Load.Ok) {
                val ready = state.value.filter { it.id in Ready.ids }
                Text("${state.value.size} songs  ·  ${ready.size} ready to sing", style = Type.label, color = TextFaint)
                Spacer(Modifier.height(4.dp))
                LaunchedEffect(state) { runCatching { firstFocus.requestFocus() } }
                TvButton(
                    if (ready.isEmpty()) "Nothing ready yet" else "Play ${ready.size} ready",
                    { onPlayAll(ready) }, Modifier.fillMaxWidth(), primary = true,
                    focusRequester = firstFocus, icon = Glyph.Play, fill = true,
                )
            }
        }
        LoadView(loader, loading = { TrackListSkeleton(9) }) { tracks ->
            LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(2.dp), contentPadding = PaddingValues(bottom = 48.dp)) {
                items(tracks.size, key = { "${tracks[it].id}-$it" }) { i ->
                    val track = tracks[i]
                    TrackRow(track, track.id in Ready.ids, { onPick(track) }, number = i + 1)
                }
            }
        }
    }
}

/** The last things typed into search, newest first, kept on this TV. */
private object Recents {
    private const val KEY = "recent"
    private fun prefs(c: android.content.Context) = c.getSharedPreferences("kkaraoke-search", android.content.Context.MODE_PRIVATE)
    fun load(c: android.content.Context): List<String> = prefs(c).getString(KEY, "").orEmpty().split('\n').filter { it.isNotBlank() }
    fun add(c: android.content.Context, text: String): List<String> {
        val next = (listOf(text.trim()) + load(c)).filter { it.isNotBlank() }.distinctBy { it.lowercase() }.take(8)
        prefs(c).edit().putString(KEY, next.joinToString("\n")).apply()
        return next
    }
}

private val providerColor = mapOf("kkbox" to 0xFF4088FF, "spotify" to 0xFF1DB954, "apple" to 0xFFFA243C, "ytmusic" to 0xFFFF0000)

/** A chart as a coloured tile in its service's colour: who publishes it, and which one it is. */
@Composable
private fun ChartCard(source: String, chart: MusicCollection, onClick: () -> Unit) {
    val color = androidx.compose.ui.graphics.Color(providerColor[source] ?: 0xFF6C5CE7)
    val title = chart.name.substringAfter("·", chart.name).trim()
    Focusable(onClick, Modifier.width(230.dp), RoundedCornerShape(CardRadius)) { focused ->
        Column(
            Modifier.fillMaxWidth().height(138.dp)
                .background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(color, color.copy(alpha = 0.55f))))
                .padding(18.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Icon(Glyph.Trophy, androidx.compose.ui.graphics.Color.White.copy(alpha = if (focused) 1f else 0.85f), 26.dp)
            Text(title, style = Type.bodyStrong, color = androidx.compose.ui.graphics.Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}
