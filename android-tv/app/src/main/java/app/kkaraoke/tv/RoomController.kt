package app.kkaraoke.tv

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.UUID
import kotlin.math.min
import kotlin.math.pow

/**
 * The room this TV hosts. Signed out, the room is named after the TV itself; signed in, it is the account's room, shared
 * with the person's other devices. Phones join it with its code or QR link and add songs or press play, and the device
 * that plays, this TV when it is the one, obeys them. The queue lives on the server: this keeps a copy, and the websocket
 * says when it changed. Mirrors what the Mac app does for its own room (`RoomModel.swift`).
 */
class RoomController(context: Context, private val player: PlayerController) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val prefs = context.getSharedPreferences("kkaraoke", Context.MODE_PRIVATE)

    /** Random per TV and kept: names this device to the server, and is the room while the TV is signed out. */
    val deviceId: String = prefs.getString("deviceId", null)
        ?: UUID.randomUUID().toString().lowercase().also { prefs.edit().putString("deviceId", it).apply() }

    private val deviceName = android.os.Build.MODEL?.takeIf { it.isNotBlank() } ?: "TV"

    /** The account's id when signed in, else this TV's own. It names the room. */
    private val userId: String get() = Auth.userId ?: deviceId
    val roomId: String get() = userId
    private val user: RoomUser get() = RoomUser(userId, Prefs.name.ifBlank { Auth.nickname ?: deviceName }, Prefs.avatar.ifBlank { Auth.avatar ?: "/avatars/shiba.svg" })
    val name: String get() = deviceName

    /** Who an order was from, as to show. Songs ordered from this TV before it was signed in carry the TV's model name: they show who it is now. */
    fun orderer(by: RoomUser): RoomUser =
        if (by.id == userId || by.id == deviceId || by.name == deviceName) user else by

    var queue by mutableStateOf<List<Track>>(emptyList()); private set
    var queueIdx by mutableIntStateOf(-1); private set

    /** False until the server has answered once: until then the song shown is the one remembered from last time. */
    var queueLoaded by mutableStateOf(false); private set
    val shownSong: Track? get() = if (queueLoaded) current else (current ?: remembered)
    private val remembered: Track? = Remembered.song()
    var participants by mutableStateOf<List<RoomUser>>(emptyList()); private set
    var code by mutableStateOf<String?>(null); private set
    var connected by mutableStateOf(false); private set

    /** The device that plays the room's audio; null while nobody has claimed it. A signed-in account may have several. */
    var activePlayer by mutableStateOf<String?>(null); private set
    val isPlayer: Boolean get() = activePlayer == null || activePlayer == deviceId

    /** Something to tell the person (a song the server wouldn't take); the screen shows it once and clears it. */
    var message by mutableStateOf<String?>(null)

    val current: Track? get() = queue.getOrNull(queueIdx)
    /** Whether the song is playing, for screens that show it. */
    val playing: Boolean get() = player.isPlaying

    val upcoming: List<Track> get() = if (queueIdx + 1 < queue.size) queue.subList(queueIdx + 1, queue.size) else emptyList()
    /** What people queued, in order: the songs a singer is waiting for. */
    val upNext: List<Track> get() = upcoming.filter { !it.recommended }

    /** What the server added to keep the music going. It is not counted, and it plays after what people queued. */
    val suggested: List<Track> get() = upcoming.filter { it.recommended }
    val joinUrl: String get() = code?.let { "${Api.WEB}/join?code=$it" } ?: "${Api.WEB}/join?room=$roomId"

    /** People in the room other than this TV. */
    val guests: List<RoomUser> get() = participants.filter { it.id != userId }

    /** Whether the next song should start by itself: the last one was playing, or someone asked for play. */
    private var wantsPlay = false

    /** How the device that plays says things stand, while it is not this TV. */
    private var remotePlaying = false

    private var socket: WebSocket? = null
    private var generation = 0
    private var retry = 0
    private var refreshJob: Job? = null
    private var started = false

    /** Only the first connection of a session takes the room from the account's other devices; a reconnect must not. */
    private var takeOver = true

    init {
        player.onEnded = { songEnded() }
        Api.onTokenRejected = { scope.launch { signedOut(revoke = false) } }
    }

    fun start() {
        if (started) return
        started = true
        startPublishing()
        scope.launch {
            Auth.refreshIfNeeded()
            open()
        }
    }

    // MARK: Whose room

    /** Opens this room and connects to it. Signed in, the room is opened as a jam by a host: it gets a join code, and
     *  guests can add songs that aren't processed yet. Signed out, the TV just joins its own. */
    private suspend fun open() {
        if (Auth.signedIn) {
            val made = try { Api.createRoom(roomId) } catch (e: CancellationException) { throw e } catch (e: Exception) { null }
            if (made != null) code = made
        } else {
            runCatching { Api.joinRoom(roomId, user) } // opens the room, which is what gives it a code
        }
        connect()
        refreshAll()
    }

    /** The TV just signed in with a phone's approval: it moves into the account's room. */
    fun signedIn() = scope.launch { moveRooms() }

    /** The person signed the TV out (or the server stopped accepting its token): it goes back to its own room. */
    fun signOut() = scope.launch { signedOut(revoke = true) }

    private suspend fun signedOut(revoke: Boolean) {
        if (!Auth.signedIn) return
        if (revoke) runCatching { Api.revokeToken() }
        Auth.forget()
        moveRooms()
    }

    private suspend fun moveRooms() {
        generation += 1 // the old connection's messages are ignored from here
        socket?.cancel()
        socket = null
        connected = false
        wantsPlay = false
        queue = emptyList()
        queueIdx = -1
        participants = emptyList()
        code = null
        activePlayer = null
        takeOver = true
        player.clear()
        open()
    }

    // MARK: Websocket

    private fun connect() {
        generation += 1
        val mine = generation
        socket?.cancel()
        socket = Api.openSocket(object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                scope.launch {
                    if (mine != generation) return@launch
                    connected = true
                    retry = 0
                    webSocket.send(buildJsonObject {
                        put("type", "join")
                        put("roomId", roomId)
                        put("data", buildJsonObject {
                            put("id", user.id); put("name", user.name); put("avatar", user.avatar); put("deviceId", deviceId)
                        })
                    }.toString())
                    claimPlayer(webSocket, ifFree = !(Auth.signedIn && takeOver))
                    takeOver = false
                    refreshAll()
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                scope.launch { if (mine == generation) handle(text) }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { dropped(mine) }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { dropped(mine) }
        })
    }

    /** Asks to be the device that plays the room's audio. A TV that opens the app on an account takes the room over from
     *  its other devices (it is the screen people look at); signed out, it only takes it when nobody has. */
    private fun claimPlayer(webSocket: WebSocket? = socket, ifFree: Boolean) {
        webSocket?.send(buildJsonObject {
            put("type", "jam"); put("action", "player"); put("roomId", roomId)
            put("data", buildJsonObject { put("deviceId", deviceId); put("ifFree", ifFree) })
        }.toString())
    }

    /** Plays the room's audio here, instead of the device that does. */
    fun playHere() { claimPlayer(ifFree = false) }

    private fun dropped(mine: Int) {
        scope.launch {
            if (mine != generation) return@launch
            connected = false
            val wait = min(2.0.pow(retry), 30.0) + Math.random()
            retry += 1
            delay((wait * 1000).toLong())
            if (mine == generation) connect()
        }
    }

    private fun send(message: JsonObject) { socket?.send(message.toString()) }

    // MARK: What the room tells us

    private fun JsonObject.obj(key: String): JsonObject? = this[key] as? JsonObject
    private fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull
    private fun JsonObject.num(key: String): Double? = (this[key] as? JsonPrimitive)?.doubleOrNull
    private fun JsonObject.int(key: String): Int? = (this[key] as? JsonPrimitive)?.intOrNull
    private fun JsonObject.bool(key: String): Boolean? = (this[key] as? JsonPrimitive)?.booleanOrNull

    private fun handle(text: String) {
        val message = runCatching { Api.json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return
        val data = message.obj("data")
        when (message.str("type")) {
            "jam" -> {
                val room = message.str("roomId")
                if (room != null && room != roomId) return
                when (message.str("action")) {
                    "joined", "left" -> scope.launch { refreshInfo() }
                    "control" -> if (isPlayer) runControl(message.str("op"), data)
                    "player" -> applyPlayer(data?.str("deviceId"))
                    "update" -> if (!isPlayer) followUpdate(data)
                }
            }
            "queue" -> {
                // the first song into an empty queue starts by itself, on the screen that plays
                if (data?.bool("autoplay") == true && isPlayer) wantsPlay = true
                scheduleQueueRefresh()
            }
            "notify" -> handleNotify(data)
            "lyrics" -> if (data?.str("action") == "delay") {
                val id = data.str("trackId")
                val delay = data.num("delay")
                if (id != null && delay != null) player.applySharedDelay(id, delay)
            }
        }
    }

    /** The server says which device plays. This TV stops and follows when it is not the one, and takes over when it is. */
    private fun applyPlayer(id: String?) {
        // The server frees the player when this TV's old socket closes, and says so right after the new one joins, before
        // the claim that follows lands: keep playing, and ask again (it only takes the room while nobody has it).
        if (id == null && isPlayer && activePlayer == deviceId) {
            claimPlayer(ifFree = true)
            return
        }
        val wasPlayer = isPlayer
        activePlayer = id
        if (wasPlayer && !isPlayer) {
            wantsPlay = false
            player.pause()
        } else if (!wasPlayer && isPlayer) {
            scope.launch { refreshAll() } // picks up what the room is on
        }
    }

    /** The device that plays tells the room where it is, so this TV can show what is current. */
    private fun followUpdate(data: JsonObject?) {
        data?.bool("playing")?.let { remotePlaying = it }
        val index = data?.int("queueIdx") ?: return
        if (index != queueIdx && index in queue.indices) queueIdx = index else if (index !in queue.indices) scheduleQueueRefresh()
    }

    /** The server says how far it is with a song in the queue. */
    private fun handleNotify(data: JsonObject?) {
        val id = data?.obj("track")?.str("id") ?: return
        val status = data.str("status") ?: return
        val total = data.num("total")
        val progress = if (total != null && total > 0) (data.num("value") ?: 0.0) / total else null
        queue = queue.map { if (it.id == id) it.copy(status = status, progress = if (status == "ready") null else progress) else it }
        if (status == "ready") {
            scope.launch { runCatching { Ready.refresh() } } // the song is now in the library
            scheduleQueueRefresh()
        }
    }

    private fun scheduleQueueRefresh() {
        refreshJob?.cancel()
        refreshJob = scope.launch {
            delay(150)
            refreshQueue()
        }
    }

    // MARK: What a phone asks for

    private fun runControl(op: String?, data: JsonObject?) {
        when (op) {
            "play" -> { wantsPlay = true; resume() }
            "pause" -> { wantsPlay = false; player.pause() }
            "next" -> {
                val index = data?.int("index")
                if (index != null && index in queue.indices) {
                    wantsPlay = true
                    scope.launch { setIndex(index, Announce.Next) }
                } else {
                    wantsPlay = player.isPlaying || wantsPlay
                    scope.launch { goNext() }
                }
                return
            }
            "previous" -> { scope.launch { goPrevious() }; return }
            "seek" -> {
                val time = data?.num("seekTime") ?: return
                player.seekTo((time * 1000).toLong())
                publish(force = true, full = true, extra = mapOf("seekRequestId" to (data["seekRequestId"] ?: JsonNull)))
                return
            }
            "toggleVocal" -> player.chooseVocalOn(!player.vocalOn)
            "setGuideLevel" -> data?.num("level")?.let { setGuide(it) }
            "setVolume" -> data?.num("volume")?.let { player.chooseVolume(it.toFloat()) }
            "increaseVolume" -> player.chooseVolume(player.volume + 0.1f)
            "decreaseVolume" -> player.chooseVolume(player.volume - 0.1f)
            "increaseSemitone" -> player.chooseSemitone(player.semitone + 1)
            "decreaseSemitone" -> player.chooseSemitone(player.semitone - 1)
            else -> return // pitch shift and the like: not something this player does
        }
        publish(force = true, full = true)
    }

    private fun setGuide(level: Double) = player.chooseGuideLevel(level)

    // MARK: Controls on this TV

    private fun resume() {
        val target = current ?: return
        if (target.isReady && player.loaded?.isSameEntry(target) == true) player.resume()
    }

    /** What a press on this TV does while another device plays: ask that device. */
    private fun ask(op: String) {
        send(buildJsonObject { put("type", "jam"); put("action", "control"); put("roomId", roomId); put("op", op) })
    }

    fun toggle() {
        if (!isPlayer) { ask(if (remotePlaying) "pause" else "play"); remotePlaying = !remotePlaying; return }
        if (player.isPlaying) { wantsPlay = false; player.pause() } else { wantsPlay = true; resume() }
        publish(force = true, full = true)
    }

    fun next() {
        if (!isPlayer) { ask("next"); return }
        wantsPlay = player.isPlaying || wantsPlay
        scope.launch { goNext() }
    }

    fun previous() {
        if (!isPlayer) { ask("previous"); return }
        scope.launch { goPrevious() }
    }

    fun seekBy(ms: Long) {
        if (!isPlayer) return
        player.seekBy(ms)
        publish(force = true, full = true)
    }

    /** The saved timing of the lyrics of the song that plays: seconds added to every line. */
    val lyricsDelay: Double get() = (player.lyrics as? LyricsState.Synced)?.delay ?: 0.0
    private var delayJob: Job? = null

    /** Moves the lyrics earlier or later, a tenth of a second at a time; the song keeps the new timing for everyone. */
    fun nudgeLyrics(by: Double) {
        val track = player.loaded ?: return
        if (player.lyrics !is LyricsState.Synced) return
        val next = (Math.round((lyricsDelay + by) * 10) / 10.0).coerceIn(-30.0, 30.0)
        player.applySharedDelay(track.id, next)
        delayJob?.cancel()
        delayJob = scope.launch {
            delay(600) // while the button is held, only the last value is worth saving
            runCatching { Api.setLyricsDelay(track.id, next) }
        }
    }

    private var volumeBeforeMute = 1f

    /** Silences the TV, or brings back the volume it had. */
    fun toggleMute() {
        if (!isPlayer) return
        if (player.volume > 0f) { volumeBeforeMute = player.volume; player.chooseVolume(0f) } else player.chooseVolume(volumeBeforeMute.coerceAtLeast(0.3f))
        publish(force = true, full = true)
    }

    /** Louder or quieter, by a tenth. */
    fun changeVolume(delta: Float) {
        if (!isPlayer) { ask(if (delta > 0) "increaseVolume" else "decreaseVolume"); return }
        player.chooseVolume(player.volume + delta)
        publish(force = true, full = true)
    }

    /** Up or down a semitone. */
    fun changeKey(delta: Int) {
        if (!isPlayer) { ask(if (delta > 0) "increaseSemitone" else "decreaseSemitone"); return }
        player.chooseSemitone(player.semitone + delta)
        publish(force = true, full = true)
    }

    /** Turns the original singer on or off. */
    fun toggleVocal() {
        if (!isPlayer) { ask("toggleVocal"); return }
        player.chooseVocalOn(!player.vocalOn)
        publish(force = true, full = true)
    }

    /** The guide singer louder or quieter, by a quarter. */
    fun changeGuide(delta: Double) {
        if (!isPlayer) return
        player.chooseGuideLevel(player.guideLevel + delta)
        publish(force = true, full = true)
    }

    // MARK: Queue actions

    fun addToQueue(track: Track) { scope.launch { add(track, next = false, thenPlay = false) } }
    fun playNext(track: Track) { scope.launch { add(track, next = true, thenPlay = false) } }
    fun playNow(track: Track) { scope.launch { add(track, next = true, thenPlay = true) } }

    /** Plays a list: the first song now, the rest right after it, in order. */
    fun playAll(tracks: List<Track>) {
        if (tracks.isEmpty()) return
        scope.launch {
            // each one goes "next", so adding the later ones first leaves them in order behind the first
            for (track in tracks.drop(1).asReversed()) add(track, next = true, thenPlay = false)
            add(tracks.first(), next = true, thenPlay = true)
        }
    }

    private suspend fun add(picked: Track, next: Boolean, thenPlay: Boolean) {
        val wasEmpty = queue.isEmpty()
        val landing = if (next) (if (queue.isEmpty()) 0 else queueIdx + 1) else queue.size
        val entry = picked.copy(orderedBy = user, status = null, progress = null, timeAdded = null)
        if ((thenPlay || wasEmpty) && isPlayer) wantsPlay = true // so the song starts as it loads
        try {
            Api.addToQueue(roomId, entry, next)
            refreshQueue()
            // The server decides where it lands (songs people queue go ahead of the ones it suggests): it is the newest
            // entry of that song.
            val added = queue.indices.filter { queue[it].id == picked.id }.maxByOrNull { queue[it].timeAdded ?: 0L } ?: landing
            if (thenPlay && isPlayer && queue.indices.contains(added)) {
                wantsPlay = true
                setIndex(added, Announce.Next)
            } else if (thenPlay && !isPlayer && queue.indices.contains(landing)) {
                // the device that plays goes to it
                send(buildJsonObject {
                    put("type", "jam"); put("action", "control"); put("roomId", roomId); put("op", "next")
                    put("data", buildJsonObject { put("index", landing) })
                })
            } else if (current == null && queue.isNotEmpty() && isPlayer) {
                setIndex(0, null)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: ApiException) {
            if (wasEmpty && !thenPlay) wantsPlay = false
            message = if (e.code == 403) {
                if (Auth.signedIn) "“${picked.name}” has to be processed first, and the server wouldn't start it."
                else "“${picked.name}” isn't processed yet. Sign in (top right) to add new songs."
            } else e.message
        } catch (e: Exception) {
            if (wasEmpty && !thenPlay) wantsPlay = false
            message = "Couldn't reach the server."
        }
    }

    fun remove(track: Track) {
        scope.launch {
            try { Api.removeFromQueue(roomId, track) } catch (e: CancellationException) { throw e } catch (e: Exception) { message = e.message }
            refreshQueue()
        }
    }

    fun clear() {
        scope.launch {
            try { Api.clearQueue(roomId) } catch (e: CancellationException) { throw e } catch (e: Exception) { message = e.message }
            refreshQueue()
        }
    }

    fun shuffle() {
        scope.launch {
            try { Api.shuffleQueue(roomId) } catch (e: CancellationException) { throw e } catch (e: Exception) { message = e.message }
            refreshQueue()
        }
    }

    /** Jumps to the song at [index] in the queue and plays it. */
    fun playAt(index: Int) {
        if (index !in queue.indices) return
        if (!isPlayer) {
            send(buildJsonObject {
                put("type", "jam"); put("action", "control"); put("roomId", roomId); put("op", "next")
                put("data", buildJsonObject { put("index", index) })
            })
            return
        }
        wantsPlay = true
        scope.launch { setIndex(index, Announce.Next) }
    }

    // MARK: Following the queue

    private suspend fun refreshAll() {
        refreshQueue()
        refreshInfo()
    }

    suspend fun refreshQueue() {
        val room = roomId
        val snapshot = try { Api.queue(room) } catch (e: CancellationException) { throw e } catch (e: Exception) { return }
        if (room != roomId) return // moved to another room while this was on its way
        queue = snapshot.tracks
        queueLoaded = true
        queueIdx = if (snapshot.tracks.isEmpty()) -1 else snapshot.index.coerceIn(0, snapshot.tracks.size - 1)
        Remembered.saveSong(current)
        queueChanged()
    }

    private suspend fun refreshInfo() {
        val room = roomId
        val info = try { Api.roomInfo(room) } catch (e: CancellationException) { throw e } catch (e: Exception) { null } ?: return
        if (room != roomId) return
        participants = info.participants
        code = info.code ?: code
    }

    /** The song to play changed: load it, or show it while the server is still making it ready. */
    private fun queueChanged() {
        if (!isPlayer) return // another device plays it; this TV only shows the queue
        val target = current
        if (target == null) { if (player.loaded != null) player.clear(); return }
        val loaded = player.loaded
        // the next song is made ready to start at once
        player.prefetch(listOfNotNull(queue.getOrNull(queueIdx + 1)))
        if (target.isSameEntry(loaded)) {
            if (target.isReady && !loaded!!.isReady) player.play(target, autoplay = wantsPlay) // it became ready
            else if (target.isReady && wantsPlay && !player.isPlaying && player.error == null) player.resume()
            return
        }
        if (target.isReady) player.play(target, autoplay = wantsPlay) else player.show(target)
    }

    private enum class Announce { Next, Previous }

    /** Makes [index] the current song on the server and here. */
    private suspend fun setIndex(index: Int, announce: Announce?) {
        if (index !in queue.indices) return
        queueIdx = index
        queueChanged()
        if (announce != null) {
            // the target index travels with it: a device that hears it lands on that song instead of stepping one more
            send(buildJsonObject {
                put("type", "jam"); put("action", "control"); put("roomId", roomId)
                put("op", if (announce == Announce.Previous) "previous" else "next")
                put("data", buildJsonObject { put("index", index) })
            })
        }
        runCatching { Api.setQueueIndex(roomId, index) }
        publish(force = true, full = true)
    }

    private suspend fun goNext() {
        if (queueIdx + 1 >= queue.size) {
            wantsPlay = false
            player.pause()
            publish(force = true, full = true)
            return
        }
        setIndex(queueIdx + 1, Announce.Next)
    }

    private suspend fun goPrevious() {
        // a few seconds in, "previous" starts the song again, as every player does
        if (player.positionMs > 3_000 || queueIdx <= 0) {
            player.seekTo(0)
            publish(force = true, full = true)
            return
        }
        setIndex(queueIdx - 1, Announce.Previous)
    }

    private fun songEnded() {
        if (!isPlayer) return
        wantsPlay = true
        scope.launch { goNext() }
    }

    // MARK: Telling the room how things stand

    private fun startPublishing() {
        scope.launch {
            var tick = 0
            while (true) {
                delay(200)
                tick += 1
                if (!connected || !isPlayer || !player.isPlaying) continue
                // each second the time, and every five the whole state a remote shows
                if (tick % 5 == 0) publish(force = false, full = tick % 25 == 0)
            }
        }
    }

    private fun publish(force: Boolean, full: Boolean, extra: Map<String, JsonElement> = emptyMap()) {
        if (!connected || !isPlayer) return
        send(buildJsonObject {
            put("type", "jam"); put("action", "update"); put("roomId", roomId)
            if (force) put("force", true)
            put("data", buildJsonObject {
                put("currentTime", player.positionMs / 1000.0)
                put("playing", player.isPlaying)
                if (full) {
                    put("queueIdx", queueIdx)
                    put("volume", player.volume.toDouble())
                    put("vocalOn", player.vocalOn)
                    put("guideLevel", player.guideLevel)
                    put("showVideo", false)
                    put("showMelody", false)
                    put("semitone", player.semitone)
                    put("duration", player.durationMs / 1000.0)
                    put("pitchShift", true)
                }
                extra.forEach { (key, value) -> put(key, value) }
            })
        })
    }
}
