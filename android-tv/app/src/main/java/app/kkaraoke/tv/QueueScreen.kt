package app.kkaraoke.tv

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** The room's queue, and how phones join it. */
@Composable
fun QueueScreen(room: RoomController, entry: FocusRequester, onOpenNowPlaying: () -> Unit) {
    var selected by remember { mutableStateOf<Int?>(null) }
    // opens near the song that is playing, not at the first of hundreds
    val state = rememberLazyListState(initialFirstVisibleItemIndex = 0)

    Row(
        Modifier.fillMaxSize().padding(start = ScreenInset, end = ScreenInset - 14.dp, top = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(36.dp),
    ) {
        JoinCard(room, Modifier.width(280.dp))
        Column(Modifier.weight(1f)) {
            if (!room.isPlayer) PlayingElsewhere(room, Modifier.padding(bottom = 12.dp, end = 14.dp))
            Row(
                Modifier.fillMaxWidth().padding(bottom = 8.dp, end = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Queue", style = Type.title, modifier = Modifier.weight(1f))
                if (room.upNext.size > 1) TvButton("Shuffle", room::shuffle)
                if (room.queue.isNotEmpty()) TvButton("Clear", room::clear)
            }
            if (room.queue.isEmpty()) {
                EmptyState("Nothing queued", "Pick a song on the TV, or scan the code and add songs from your phone.", Modifier.padding(0.dp))
            } else {
                val upNext = room.upNext
                val suggested = room.suggested
                LazyColumn(state = state, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 48.dp)) {
                    room.current?.let { current ->
                        item("now") {
                            Label("Now playing")
                            QueueRow(current, 0, isCurrent = true, playing = room.playing, onClick = { selected = room.queueIdx }, focusRequester = entry)
                        }
                    }
                    if (upNext.isNotEmpty()) {
                        item("next") { Label("Up next  ·  ${upNext.size}") }
                        items(upNext.size, key = { "n-$it-${upNext[it].id}-${upNext[it].timeAdded}" }) { i ->
                            QueueRow(upNext[i], i + 1, isCurrent = false, playing = false, onClick = { selected = room.queue.indexOfFirst { it.isSameEntry(upNext[i]) } })
                        }
                    } else {
                        item("none") { Label("Nothing queued by anyone yet") }
                    }
                    if (suggested.isNotEmpty()) {
                        item("suggested") { Label("Suggested to keep the music going") }
                        items(suggested.size, key = { "s-$it-${suggested[it].id}-${suggested[it].timeAdded}" }) { i ->
                            QueueRow(suggested[i], i + 1, isCurrent = false, playing = false, onClick = { selected = room.queue.indexOfFirst { it.isSameEntry(suggested[i]) } })
                        }
                    }
                }
            }
        }
    }

    selected?.let { index ->
        val track = room.queue.getOrNull(index)
        if (track != null) {
            val actions = buildList {
                if (index == room.queueIdx) add(SheetAction("Open player", Glyph.Play, onOpenNowPlaying))
                else add(SheetAction("Play now", Glyph.Play) { room.playAt(index); onOpenNowPlaying() })
                add(SheetAction("Remove from queue") { room.remove(track) })
            }
            ActionSheet(track.name, track.artistText, actions, onDismiss = { selected = null }, artwork = track.artworkUrl)
        } else {
            selected = null
        }
    }
}

@Composable
internal fun Label(text: String) {
    Text(text, style = Type.label, color = TextDim, modifier = Modifier.padding(top = 14.dp, bottom = 6.dp))
}

@Composable
internal fun QueueRow(track: Track, number: Int, isCurrent: Boolean, playing: Boolean, onClick: () -> Unit, focusRequester: FocusRequester? = null) {
    Focusable(onClick, Modifier.fillMaxWidth().padding(vertical = 1.dp), RoundedCornerShape(CardRadius), focusRequester, scaleOnFocus = 1.015f) { focused ->
        Row(
            Modifier
                .fillMaxWidth()
                .background(if (focused) PanelFocused else if (isCurrent) Color(0x1FFFFFFF) else Color.Transparent)
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Box(Modifier.width(34.dp), contentAlignment = Alignment.CenterStart) {
                if (isCurrent) Equalizer(playing, Accent, size = 20.dp) else Text(number.toString(), style = Type.label, color = TextFaint)
            }
            Cover(track.artworkUrl, Modifier.size(54.dp), RoundedCornerShape(4.dp), px = 160)
            Column(Modifier.weight(1f)) {
                Text(
                    track.name, style = Type.bodyStrong, color = if (isCurrent) Accent else TextPrimary,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                val who = track.orderedBy?.name?.takeIf { it.isNotBlank() }
                Text(
                    listOfNotNull(track.artistText.takeIf { it.isNotEmpty() }, who?.let { "added by $it" }).joinToString("  ·  "),
                    style = Type.caption.copy(fontSize = 15.sp), color = TextDim, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            when {
                track.isFailed -> Text("Couldn't prepare", style = Type.caption, color = Accent)
                !track.isReady -> Text(
                    "Preparing" + (track.progress?.let { "  ${(it * 100).toInt()}%" } ?: "…"),
                    style = Type.caption, color = Accent,
                )
                else -> track.durationMs?.let { Text(formatTime(it), style = Type.label, color = TextDim) }
            }
        }
    }
}

/** The QR code and code phones use to join this TV's room, and who is in it. */
@Composable
private fun JoinCard(room: RoomController, modifier: Modifier = Modifier) {
    Column(
        modifier.clip(RoundedCornerShape(12.dp)).background(Panel).padding(22.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Join with your phone", style = Type.heading.copy(fontSize = 20.sp))
        QrCode(room.joinUrl, Modifier.size(176.dp))
        val code = room.code
        if (code != null) {
            Text(code, fontSize = 38.sp, fontWeight = FontWeight.Bold, letterSpacing = 6.sp)
            Text("or open kkaraoke.app and enter the code", style = Type.caption, color = TextDim)
        } else {
            Text("Opening the room…", style = Type.label, color = TextDim)
        }
        Spacer(Modifier.height(2.dp))
        val guests = room.guests.size
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(if (room.connected) Color(0xFF4CD964) else Accent))
            Text(
                when {
                    !room.connected -> "Reconnecting…"
                    guests == 0 -> "Waiting for phones"
                    guests == 1 -> "1 phone connected"
                    else -> "$guests phones connected"
                },
                style = Type.caption.copy(fontSize = 14.sp), color = TextDim,
            )
        }
    }
}

/** Another device of the account plays the room's audio: this TV shows the queue and can take over. */
@Composable
fun PlayingElsewhere(room: RoomController, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(CardRadius)).background(Panel).padding(start = 18.dp, top = 8.dp, bottom = 8.dp, end = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Playing on another device", style = Type.label, color = TextDim, modifier = Modifier.weight(1f))
        TvButton("Play on this TV", room::playHere, primary = true)
    }
}
