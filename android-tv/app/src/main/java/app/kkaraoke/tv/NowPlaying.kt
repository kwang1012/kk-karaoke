package app.kkaraoke.tv

import android.os.SystemClock
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.BoxWithConstraintsScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.runtime.withFrameNanos as frame
import kotlin.math.abs
import kotlin.math.min

private const val SEEK_STEP_MS = 5_000L

/** A short message in the middle of the screen, for feedback on a key or a change made from a phone. */
private data class Flash(val id: Long, val glyph: Glyph, val text: String)

/**
 * The karaoke screen, after the web and Mac TV displays and the best TV players: a flat stage in the cover's colour, the
 * lyrics large in the middle with the words filling in left to right, who ordered the song, who is up next, and how to
 * join. The controls are always on it, as a TV needs: a big play button beside the progress, and a row of round icons
 * under it, with no words on them.
 */
@Composable
fun NowPlayingScreen(player: PlayerController, room: RoomController, onBack: () -> Unit) {
    val track = room.shownSong
    val stage by rememberStageColor(track?.artworkUrl)
    val playFocus = remember { FocusRequester() }
    var showQueue by remember { mutableStateOf(false) }
    var flash by remember { mutableStateOf<Flash?>(null) }
    fun show(glyph: Glyph, text: String) { flash = Flash(SystemClock.elapsedRealtime(), glyph, text) }

    LaunchedEffect(flash) {
        val shown = flash ?: return@LaunchedEffect
        kotlinx.coroutines.delay(1_400)
        if (flash?.id == shown.id) flash = null
    }
    // the play button is not on screen for the first moment: ask again until it takes focus
    LaunchedEffect(Unit) {
        repeat(12) {
            if (runCatching { playFocus.requestFocus() }.isSuccess) return@LaunchedEffect
            kotlinx.coroutines.delay(80)
        }
    }

    // Feedback for what changed, whoever changed it: a key here, or a phone. Each song starts with a clean slate.
    key(track?.id) {
        OnChange(player.volume) { show(if (it <= 0f) Glyph.Mute else Glyph.Speaker, "Volume ${(it * 100).toInt()}%") }
        OnChange(player.vocalOn) { show(if (it) Glyph.Mic else Glyph.MicOff, if (it) "Original vocal on" else "Original vocal off") }
        OnChange(player.guideLevel) { show(if (it > 0.0) Glyph.Mic else Glyph.MicOff, "Guide vocal ${(it * 100).toInt()}%") }
        OnChange(player.semitone) { show(Glyph.Music, "Key ${if (it > 0) "+" else ""}$it") }
        OnChange(room.lyricsDelay) { show(Glyph.Timer, "Lyrics ${if (it >= 0) "+" else "−"}${"%.1f".format(abs(it))} s") }
        OnChange(player.isPlaying) { show(if (it) Glyph.Play else Glyph.Pause, if (it) "Playing" else "Paused") }
    }

    var videoFailed by remember(track?.id) { mutableStateOf(false) }
    val videoId = player.videoId
    val overVideo = Prefs.showVideo && videoId != null && !videoFailed
    // The controls and progress go away after a few quiet seconds while a song plays; any key brings them back (and that
    // first key only wakes them).
    var lastKey by remember { mutableStateOf(SystemClock.elapsedRealtime()) }
    var awake by remember { mutableStateOf(true) }
    LaunchedEffect(lastKey, player.isPlaying, showQueue) {
        awake = true
        if (!player.isPlaying || showQueue) return@LaunchedEffect
        kotlinx.coroutines.delay(5_000)
        awake = false
    }
    val controlsAlpha by androidx.compose.animation.core.animateFloatAsState(if (awake) 1f else 0f, androidx.compose.animation.core.tween(350), label = "controls")
    Box(
        Modifier
            .fillMaxSize()
            .background(stage)
            .onPreviewKeyEvent { e ->
                val wasHidden = !awake
                lastKey = SystemClock.elapsedRealtime()
                wasHidden && e.key != androidx.compose.ui.input.key.Key.Back && e.key != androidx.compose.ui.input.key.Key.Escape
            },
    ) {
        if (videoId != null) key(videoId) { VideoBackdrop(videoId, overVideo, player, onFailed = { videoFailed = true }) }
        // the same darkening at the top and bottom as the TV display, so white text reads on any colour
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color(if (overVideo) 0x8C000000 else 0x4D000000), 0.5f to Color.Transparent, 1f to Color(if (overVideo) 0xCC000000 else 0x99000000))))
        Column(Modifier.fillMaxSize().padding(start = ScreenInset, end = ScreenInset, top = 22.dp, bottom = 18.dp)) {
            Header(track, room)
            Box(Modifier.weight(1f).fillMaxWidth().padding(vertical = 2.dp)) { if (!overVideo) LyricsStage(player, track) }
            UpNext(room)
            Box(
                Modifier.graphicsLayer { alpha = controlsAlpha }.layout { measurable, constraints ->
                    // hidden controls give their room back, so the lyrics and Up next settle lower instead of leaving a gap
                    val placeable = measurable.measure(constraints)
                    val h = (placeable.height * controlsAlpha).toInt()
                    layout(placeable.width, h) { placeable.place(0, 0) }
                },
            ) { BottomBlock(player, room, playFocus, videoId != null, onQueue = { showQueue = true }) }
        }
        Column(Modifier.align(Alignment.TopCenter).padding(top = 12.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (track != null && track.isReady && !player.isPlaying && player.error == null && flash == null) StatusPill("Paused", Glyph.Pause)
            if (!room.connected) StatusPill("Reconnecting…", null)
            if (!room.isPlayer) PlayingElsewhere(room, Modifier.width(440.dp))
        }
        flash?.let { Flash(it, Modifier.align(Alignment.Center)) }
    }
    if (showQueue) QueuePanel(room, onDismiss = { showQueue = false })
    BackHandler(onBack = onBack)
}

/** Runs [action] when [value] changes, not for the value it starts with. */
@Composable
private fun <T> OnChange(value: T, action: (T) -> Unit) {
    var previous by remember { mutableStateOf(value) }
    LaunchedEffect(value) {
        if (value != previous) {
            action(value)
            previous = value
        }
    }
}

// MARK: Header

/** The song at the left; at the right who ordered it, and under that how to join. */
@Composable
private fun Header(track: Track?, room: RoomController) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(24.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(track?.name.orEmpty(), style = Type.title.copy(fontSize = 25.sp), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(track?.artistText.orEmpty(), style = Type.heading.copy(fontSize = 15.sp, fontWeight = FontWeight.Normal), modifier = Modifier.graphicsLayer { alpha = 0.7f }, maxLines = 1, overflow = TextOverflow.Ellipsis)
            // who ordered it, quietly under the song
            track?.orderedBy?.let { room.orderer(it) }?.takeIf { it.name.isNotBlank() }?.let { by ->
                Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Avatar(by.name.take(1).uppercase(), by.avatar.takeIf { it.startsWith("/avatars/") }, diameter = 26.dp)
                    Text(by.name, style = Type.label.copy(fontSize = 15.sp), color = TextDim, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 260.dp))
                }
            }
        }
        JoinCode(room)
    }
}

/** How to add songs: a small QR code with the code under it, and nothing else. */
@Composable
private fun JoinCode(room: RoomController) {
    Column(
        Modifier,
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        QrCode(room.joinUrl, Modifier.size(112.dp))
        room.code?.let {
            Text(it, style = Type.title.copy(fontSize = 15.sp, fontFamily = FontFamily.Monospace, letterSpacing = 2.sp, fontWeight = FontWeight.Bold))
        }
    }
}

@Composable
private fun StatusPill(text: String, glyph: Glyph?) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(Color(0x99000000)).padding(horizontal = 16.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (glyph != null) Icon(glyph, Color.White, 16.dp)
        Text(text, style = Type.label.copy(fontWeight = FontWeight.SemiBold))
    }
}

/** What just changed, big, in the middle: the way the web TV display answers a key. */
@Composable
private fun Flash(flash: Flash, modifier: Modifier) {
    key(flash.id) {
        val appear by animateFloatAsState(1f, tween(160), label = "flash")
        Column(
            modifier
                .graphicsLayer { alpha = appear; scaleX = 0.95f + 0.05f * appear; scaleY = 0.95f + 0.05f * appear }
                .clip(RoundedCornerShape(20.dp)).background(Color(0x99000000)).padding(horizontal = 44.dp, vertical = 30.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(flash.glyph, Color.White, 64.dp)
            Text(flash.text, style = Type.title.copy(fontSize = 24.sp))
        }
    }
}

// MARK: Up next

/** The next songs, whoever chose them. Each one somebody ordered carries a small badge of who. */
@Composable
private fun UpNext(room: RoomController) {
    val next = room.upcoming.take(3)
    if (next.isEmpty()) return
    Row(Modifier.fillMaxWidth().padding(bottom = 10.dp).height(36.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("UP NEXT", style = Type.caption.copy(fontSize = 11.sp, fontWeight = FontWeight.Medium, letterSpacing = 1.sp), modifier = Modifier.graphicsLayer { alpha = 0.6f })
        next.forEach { song ->
            Row(
                Modifier.widthIn(max = 230.dp).clip(RoundedCornerShape(50)).background(Color(0x66000000)).padding(start = 3.dp, end = 14.dp, top = 3.dp, bottom = 3.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(Modifier.size(30.dp)) {
                    Cover(song.artworkUrl, Modifier.fillMaxSize(), CircleShape, px = 100)
                    song.orderedBy?.takeIf { it.name.isNotBlank() }?.let { by ->
                        Avatar(
                            by.name.take(1).uppercase(), by.avatar.takeIf { it.startsWith("/avatars/") },
                            Modifier.align(Alignment.BottomEnd).border(1.dp, Color(0xCC000000), CircleShape), diameter = 15.dp,
                        )
                    }
                }
                Text(song.name, style = Type.label.copy(fontSize = 13.sp), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

// MARK: The controls

/**
 * Always on screen, with no words on them. A big play button with the progress beside it; under that a row of round icons:
 * previous, back and forward ten seconds, next, then the karaoke ones (the singer's voice, volume, lyrics timing) and the
 * queue. The two that hold a value, volume and timing, show small arrows while they have focus: Up and Down change them.
 */
@Composable
private fun BottomBlock(player: PlayerController, room: RoomController, playFocus: FocusRequester, hasVideo: Boolean, onQueue: () -> Unit) {
    val delay = room.lyricsDelay
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        // the play button and the progress
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            IconButton(
                if (player.isPlaying) Glyph.Pause else Glyph.Play, if (player.isPlaying) "Pause" else "Play",
                room::toggle, diameter = 58.dp, primary = true, focusRequester = playFocus,
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                val fraction = if (player.durationMs > 0) (player.positionMs.toFloat() / player.durationMs).coerceIn(0f, 1f) else 0f
                Box(Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(3.dp)).background(Color(0x33FFFFFF))) {
                    Box(Modifier.fillMaxWidth(fraction).fillMaxHeight().background(Color.White))
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(formatTime(player.positionMs), style = Type.label.copy(fontSize = 13.sp), modifier = Modifier.graphicsLayer { alpha = 0.75f })
                    Text(formatTime(player.durationMs), style = Type.label.copy(fontSize = 13.sp), modifier = Modifier.graphicsLayer { alpha = 0.75f })
                }
            }
        }
        // the round icons
        Row(Modifier.fillMaxWidth().padding(start = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            IconButton(Glyph.Previous, "Previous song", room::previous, diameter = 46.dp)
            IconButton(Glyph.Next, "Next song", room::next, diameter = 46.dp)
            Box(Modifier.padding(horizontal = 6.dp).width(1.dp).height(26.dp).background(Color(0x40FFFFFF)))
            IconButton(
                if (player.vocal > 0.0) Glyph.Mic else Glyph.MicOff, "Vocal", room::toggleVocal, diameter = 46.dp, active = player.vocalOn,
                onUp = { room.changeGuide(0.25) }, onDown = { room.changeGuide(-0.25) },
            )
            IconButton(
                when {
                    player.volume <= 0f -> Glyph.Mute
                    player.volume < 0.34f -> Glyph.VolumeLow
                    player.volume < 0.67f -> Glyph.VolumeMid
                    else -> Glyph.Speaker
                }, "Volume", room::toggleMute, diameter = 46.dp, active = player.volume <= 0f,
                onUp = { room.changeVolume(0.1f) }, onDown = { room.changeVolume(-0.1f) },
            )
            if (hasVideo) IconButton(Glyph.Video, "Video", { Prefs.chooseShowVideo(!Prefs.showVideo) }, diameter = 46.dp, active = Prefs.showVideo)
            IconButton(
                Glyph.Music, "Key", { room.changeKey(-player.semitone) }, diameter = 46.dp, active = player.semitone != 0,
                onUp = { room.changeKey(1) }, onDown = { room.changeKey(-1) },
            )
            IconButton(
                Glyph.Timer, "Lyrics timing", { room.nudgeLyrics(-delay) }, diameter = 46.dp,
                onUp = { room.nudgeLyrics(0.1) }, onDown = { room.nudgeLyrics(-0.1) },
            )
            Spacer(Modifier.weight(1f))
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                IconButton(Glyph.Queue, "Queue", onQueue, diameter = 46.dp)
                Text("Queue  ·  ${room.upNext.size}", style = Type.label.copy(fontSize = 13.sp), color = TextDim)
            }
        }
    }
}

// MARK: The queue, without leaving the player

/** The queue in a panel at the side. The player and its lyrics stay behind it; Back closes it. */
@Composable
private fun QueuePanel(room: RoomController, onDismiss: () -> Unit) {
    var selected by remember { mutableStateOf<Track?>(null) }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterEnd) {
            Column(
                Modifier.width(430.dp).height(520.dp).clip(RoundedCornerShape(topStart = 16.dp, bottomStart = 16.dp)).background(Color(0xF2121212)).padding(start = 22.dp, end = 12.dp, top = 22.dp),
            ) {
                Row(Modifier.fillMaxWidth().padding(end = 10.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Queue", style = Type.title.copy(fontSize = 26.sp), modifier = Modifier.weight(1f))
                    if (room.upNext.size > 1) TvButton("Shuffle", room::shuffle)
                }
                val upNext = room.upNext
                val suggested = room.suggested
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                    room.current?.let { current ->
                        item("now") { Label("Now playing"); QueueRow(current, 0, isCurrent = true, playing = room.playing, onClick = { selected = current }) }
                    }
                    item("next") { Label(if (upNext.isEmpty()) "Nothing queued yet" else "Up next  ·  ${upNext.size}") }
                    items(upNext.size, key = { "n-$it-${upNext[it].id}-${upNext[it].timeAdded}" }) { i ->
                        QueueRow(upNext[i], i + 1, isCurrent = false, playing = false, onClick = { selected = upNext[i] })
                    }
                    if (suggested.isNotEmpty()) {
                        item("suggested") { Label("Suggested") }
                        items(suggested.size, key = { "s-$it-${suggested[it].id}-${suggested[it].timeAdded}" }) { i ->
                            QueueRow(suggested[i], i + 1, isCurrent = false, playing = false, onClick = { selected = suggested[i] })
                        }
                    }
                }
            }
        }
    }
    selected?.let { song ->
        val index = room.queue.indexOfFirst { it.isSameEntry(song) }
        val actions = buildList {
            if (index != room.queueIdx && index >= 0) add(SheetAction("Play now", Glyph.Play) { room.playAt(index); onDismiss() })
            add(SheetAction("Remove from queue") { room.remove(song) })
        }
        ActionSheet(song.name, song.artistText, actions, onDismiss = { selected = null }, artwork = song.artworkUrl)
    }
}

// MARK: Lyrics

@Composable
private fun LyricsStage(player: PlayerController, track: Track?) {
    val notice = when {
        track != null && track.isFailed -> "Couldn't prepare this song."
        track != null && !track.isReady -> "Preparing this song…" + (track.progress?.let { " ${(it * 100).toInt()}%" } ?: "")
        player.error != null -> player.error
        else -> null
    }
    if (notice != null) {
        Notice(notice)
        return
    }
    when (val lyrics = player.lyrics) {
        LyricsState.Loading -> Notice(if (player.buffering) "Loading…" else "Loading lyrics…")
        LyricsState.Missing -> Notice("No lyrics for this song")
        LyricsState.Failed -> Notice("Can't load the lyrics")
        is LyricsState.Plain -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(lyrics.text, style = Type.title.copy(fontSize = 26.sp, lineHeight = 38.sp, textAlign = TextAlign.Center, fontWeight = FontWeight.ExtraBold))
        }
        is LyricsState.Synced -> TvLyrics(player, lyrics)
    }
}

@Composable
private fun Notice(text: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            text, style = Type.title.copy(fontSize = 24.sp, textAlign = TextAlign.Center),
            modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(Color(0x80000000)).padding(horizontal = 24.dp, vertical = 12.dp),
        )
    }
}

private val LineEase = CubicBezierEasing(0.22f, 1f, 0.36f, 1f)

/**
 * The lyrics as the web TV display lays them out: each line is measured, then placed and scaled around the one being sung
 * (full size, the next one 65%, the others 55%), fading with distance, and every move is eased. Long lines shrink to fit
 * rather than being cut. The lines are scaled, not re-laid-out, so the graphics chip hardly notices.
 */
@Composable
private fun TvLyrics(player: PlayerController, lyrics: LyricsState.Synced) {
    val lines = lyrics.lines
    val delay = lyrics.delay
    // A clock that moves every frame, so the words fill in smoothly. Only the line being sung reads it.
    val seconds = produceState(player.livePositionMs() / 1000.0 - delay, delay) {
        while (true) {
            frame { }
            value = player.livePositionMs() / 1000.0 - delay
        }
    }
    val sung by remember(lines) { derivedStateOf { lines.indexOfLast { it.time <= seconds.value } } }
    // a long silence before the next line: for its last seconds the next line moves into the singing place, and three dots
    // count it down in the room it leaves above (as on the web and Mac TV displays)
    val gap by remember(lines) { derivedStateOf { LyricGap.after(lines, sung) } }
    val remaining by remember(lines) { derivedStateOf { gap?.countdown(seconds.value) } }
    val focus = if (remaining != null) sung + 1 else sung
    // lines ease into place, unless the song was skipped to somewhere far away
    var previous by remember { mutableIntStateOf(focus) }
    val animate = abs(focus - previous) <= 1
    LaunchedEffect(focus) { previous = focus }
    val heights = remember(lines) { mutableStateMapOf<Int, Int>() }

    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
            .drawWithContent {
                drawContent()
                drawRect(
                    Brush.verticalGradient(0f to Color.Transparent, 0.08f to Color.Black, 0.88f to Color.Black, 1f to Color.Transparent),
                    blendMode = BlendMode.DstIn,
                )
            },
    ) {
        val widthPx = constraints.maxWidth.toFloat()
        val heightPx = constraints.maxHeight.toFloat()
        val fallback = widthPx * 0.064f
        fun measured(i: Int) = heights[i]?.toFloat() ?: fallback
        fun scaleOf(i: Int): Float {
            val emphasis = if (i == focus) 1f else if (i == focus + 1) 0.65f else 0.55f
            return min(emphasis, heightPx * 0.42f / measured(i))
        }
        fun sizeOf(i: Int) = measured(i) * scaleOf(i)
        val gap = widthPx * 0.016f
        val first = maxOf(0, focus - 3)
        val last = minOf(lines.lastIndex, focus + 3)
        val y = HashMap<Int, Float>()
        y[focus] = 0f
        for (i in focus + 1..last) y[i] = (y[i - 1] ?: 0f) + sizeOf(i - 1) / 2 + gap + sizeOf(i) / 2
        for (i in focus - 1 downTo first) y[i] = (y[i + 1] ?: 0f) - (sizeOf(i + 1) / 2 + gap + sizeOf(i) / 2)

        remaining?.let { left ->
            val dots = 34f
            val centre = heightPx * 0.45f + (y[focus] ?: 0f) - (sizeOf(focus) / 2 + gap + dots)
            CountdownDots(left, centre)
        }
        for (i in first..last) {
            key(i) {
                val relative = i - focus
                TvLine(
                    line = lines[i], active = i == focus, seconds = seconds,
                    centre = heightPx * 0.45f + (y[i] ?: 0f),
                    scale = scaleOf(i),
                    opacity = when {
                        relative == 0 -> 1f
                        relative == 1 -> 0.6f
                        relative == -1 && remaining != null -> 0f // the dots' room
                        kotlin.math.abs(relative) <= 2 -> 0.3f
                        else -> 0f
                    },
                    animate = animate,
                    onHeight = { heights[i] = it },
                )
            }
        }
    }
}

/** Three dots that light up one by one over the last seconds of a wait, all lit as the line begins. */
@Composable
private fun BoxWithConstraintsScope.CountdownDots(left: Double, centre: Float) {
    Row(
        Modifier.fillMaxWidth().graphicsLayer { translationY = centre - 17f },
        horizontalArrangement = Arrangement.Center,
    ) {
        for (dot in 0..2) {
            val lit = ((LyricGap.COUNTDOWN_S - left) / (LyricGap.COUNTDOWN_S / 3) - dot + 0.5).coerceIn(0.0, 1.0).toFloat()
            Box(
                Modifier.padding(horizontal = 9.dp).size(20.dp)
                    .graphicsLayer { alpha = 0.25f + 0.75f * lit; scaleX = 0.8f + 0.2f * lit; scaleY = 0.8f + 0.2f * lit }
                    .background(Color.White, CircleShape),
            )
        }
    }
}

@Composable
private fun TvLine(
    line: LyricLine,
    active: Boolean,
    seconds: State<Double>,
    centre: Float,
    scale: Float,
    opacity: Float,
    animate: Boolean,
    onHeight: (Int) -> Unit,
) {
    val spec: AnimationSpec<Float> = if (animate) tween(420, easing = LineEase) else snap()
    val centreAnimated by animateFloatAsState(centre, spec, label = "lineY")
    val scaleAnimated by animateFloatAsState(scale, spec, label = "lineScale")
    val opacityAnimated by animateFloatAsState(opacity, spec, label = "lineOpacity")
    Column(
        Modifier
            .fillMaxWidth()
            .onSizeChanged { onHeight(it.height) }
            .graphicsLayer {
                translationY = centreAnimated - size.height / 2f
                scaleX = scaleAnimated
                scaleY = scaleAnimated
                alpha = opacityAnimated
            },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val style = Type.title.copy(fontSize = 46.sp, lineHeight = 55.sp, textAlign = TextAlign.Center, fontWeight = FontWeight.ExtraBold)
        if (active && !line.words.isNullOrEmpty()) {
            WipeLine(line, seconds, style, Modifier.fillMaxWidth().padding(horizontal = 8.dp))
        } else {
            Text(line.text.ifBlank { "♪" }, style = style, modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp))
        }
    }
}

/**
 * The line being sung, filled from left to right as it is sung: the whole line is drawn dim, then again in white, clipped to
 * what has been sung so far. Within a word the fill moves across its letters in step with the singing. The clip is worked
 * out as each frame is drawn, so nothing is laid out again and the motion is as smooth as the screen.
 */
@Composable
private fun WipeLine(line: LyricLine, seconds: State<Double>, style: TextStyle, modifier: Modifier) {
    val words = line.words.orEmpty()
    val text = remember(line) { words.joinToString("") { it.text } }
    // which letters of the line each word is
    val ranges = remember(line) { var start = 0; words.map { word -> (start until start + word.text.length).also { start += word.text.length } } }
    var layout by remember(line) { mutableStateOf<TextLayoutResult?>(null) }
    Box(modifier) {
        Text(text, style = style, color = Color.White.copy(alpha = 0.55f), modifier = Modifier.fillMaxWidth(), onTextLayout = { layout = it })
        Text(
            text, style = style, color = Color.White,
            modifier = Modifier.matchParentSize().drawWithContent {
                val measured = layout ?: return@drawWithContent
                val now = seconds.value
                val sung = Path()
                words.forEachIndexed { w, word ->
                    val progress = ((now - word.start) / (word.end - word.start).coerceAtLeast(0.08)).coerceIn(0.0, 1.0).toFloat()
                    if (progress <= 0f) return@forEachIndexed
                    val letters = ranges[w]
                    letters.forEachIndexed { k, index ->
                        val filled = (progress * letters.count() - k).coerceIn(0f, 1f)
                        if (filled > 0f && index < measured.layoutInput.text.length) {
                            val box = measured.getBoundingBox(index)
                            sung.addRect(Rect(box.left, box.top, box.left + box.width * filled, box.bottom))
                        }
                    }
                }
                clipPath(sung) { this@drawWithContent.drawContent() }
            },
        )
    }
}
