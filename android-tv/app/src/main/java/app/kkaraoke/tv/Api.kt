package app.kkaraoke.tv

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.io.IOException
import java.util.concurrent.TimeUnit

// The API camel-cases every key, so these use the same names as the web and Mac apps.

@Serializable
data class CoverImage(val url: String, val width: Int? = null, val height: Int? = null)

@Serializable
data class Artist(val id: String = "", val uri: String = "", val name: String = "")

@Serializable
data class Album(val id: String = "", val name: String = "", val images: List<CoverImage> = emptyList())

/** A person or a device in a room. [avatar] is a path to one of the web app's bundled pictures. */
@Serializable
data class RoomUser(val id: String, val name: String = "", val avatar: String = "")

@Serializable
data class Track(
    val id: String,
    val name: String = "",
    val artists: List<Artist> = emptyList(),
    val album: Album? = null,
    val durationMs: Long? = null,
    val timeAdded: Long? = null,
    val videoId: String? = null,
    val kind: String? = null,
    /** Who put it in the queue. */
    val orderedBy: RoomUser? = null,
    /** "ready", or the stage the server is at while it makes the karaoke version. */
    val status: String? = null,
    val progress: Double? = null,
    val recommended: Boolean = false,
) {
    val artistText: String get() = artists.map { it.name }.filter { it.isNotEmpty() }.joinToString(", ")
    val artworkUrl: String? get() = album?.images?.firstOrNull()?.url
    val isReady: Boolean get() = status == null || status == "ready"
    val isFailed: Boolean get() = status == "failed" || status == "error"

    /** The same song put in the queue at the same moment: the queue may hold one song twice. */
    fun isSameEntry(other: Track?): Boolean = other != null && other.id == id && other.timeAdded == timeAdded
}

@Serializable
data class Owner(val displayName: String? = null)

/** A playlist or an album. */
@Serializable
data class MusicCollection(
    val id: String,
    val name: String = "",
    val description: String = "",
    val type: String = "playlist",
    val images: List<CoverImage> = emptyList(),
    val owner: Owner? = null,
    val totalTracks: Int = 0,
    val artists: List<Artist> = emptyList(),
) {
    val isAlbum: Boolean get() = type == "album"
    val artworkUrl: String? get() = images.firstOrNull()?.url
    val subtitle: String
        get() = if (isAlbum) artists.map { it.name }.filter { it.isNotEmpty() }.joinToString(", ")
        else owner?.displayName.orEmpty()
}

data class SearchResults(
    val tracks: List<Track>,
    val albums: List<MusicCollection>,
    val playlists: List<MusicCollection>,
)

data class QueueSnapshot(val tracks: List<Track>, val index: Int)

/** What `GET room/{id}` answers: the room as its player last announced it. */
@Serializable
data class RoomInfo(
    val participants: List<RoomUser> = emptyList(),
    val code: String? = null,
    val isOn: Boolean = false,
)

@Serializable
data class LyricWord(val start: Double, val end: Double, val text: String = "")

@Serializable
data class LyricLine(
    val time: Double,
    val text: String = "",
    val romanized: String? = null,
    val words: List<LyricWord>? = null,
    val end: Double? = null,
)

@Serializable
data class LyricsResponse(
    val lyrics: List<LyricLine> = emptyList(),
    val plain: String? = null,
    /** Seconds added to every line time; one per song, shared by everyone. */
    val delay: Double? = null,
    @kotlinx.serialization.SerialName("video_id") val videoId: String? = null,
)

/** What a TV is given to wait with while a person approves it on their phone. */
@Serializable
data class PairingStart(val deviceCode: String, val userCode: String, val expiresIn: Int = 600, val interval: Int = 3)

@Serializable
data class AuthUser(val id: String, val email: String = "", val nickname: String = "", val avatar: String = "")

@Serializable
data class PairingPoll(
    val status: String = "",
    val accessToken: String? = null,
    val expiresIn: Long? = null,
    val user: AuthUser? = null,
)

class ApiException(val code: Int, message: String) : IOException(message)

object Api {
    /** The API and the web app: the production ones, unless a build is pointed elsewhere (see app/build.gradle.kts). */
    val BASE: String = BuildConfig.API_BASE
    val WEB: String = BuildConfig.WEB_BASE

    val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        isLenient = true
    }

    /** For what the server reads back: defaults are written out too (the server wants an artist's `uri`). */
    private val outJson = Json {
        encodeDefaults = true
        explicitNulls = false
    }

    /** The signed-in account's token, sent with every request; null when the TV is a guest. */
    @Volatile var token: String? = null

    /** Told when the server refuses the token (signed out elsewhere, or expired): the TV is a guest again. */
    @Volatile var onTokenRejected: (() -> Unit)? = null

    private val http = OkHttpClient.Builder()
        .callTimeout(25, TimeUnit.SECONDS)
        .pingInterval(15, TimeUnit.SECONDS)
        .build()

    private fun url(path: String, query: Map<String, String> = emptyMap()) =
        BASE.toHttpUrl().newBuilder().apply {
            addPathSegments(path.trimStart('/'))
            query.forEach { (k, v) -> addQueryParameter(k, v) }
        }.build()

    private suspend fun execute(request: Request): String = withContext(Dispatchers.IO) {
        val sent = token
        val authed = if (sent != null) request.newBuilder().header("Authorization", "Bearer $sent").build() else request
        http.newCall(authed).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (response.code == 401 && sent != null && sent == token) onTokenRejected?.invoke()
            if (!response.isSuccessful) {
                val detail = runCatching { (json.parseToJsonElement(body).jsonObject["detail"] as? JsonPrimitive)?.content }.getOrNull()
                throw ApiException(response.code, detail ?: "Server answered ${response.code}")
            }
            body
        }
    }

    private suspend fun getString(path: String, query: Map<String, String> = emptyMap()): String =
        execute(Request.Builder().url(url(path, query)).build())

    private suspend fun postString(path: String, body: JsonElement = JsonObject(emptyMap())): String =
        execute(
            Request.Builder().url(url(path))
                .post(body.toString().toRequestBody("application/json".toMediaType())).build(),
        )

    /** Parsing happens off the main thread: the library is hundreds of KB, which a TV box takes seconds to read. */
    private suspend inline fun <reified T> get(path: String, query: Map<String, String> = emptyMap()): T {
        val t0 = System.currentTimeMillis()
        val body = getString(path, query)
        val t1 = System.currentTimeMillis()
        val value = withContext(Dispatchers.Default) { json.decodeFromString<T>(body) }
        android.util.Log.d("KKaraoke", "GET $path: ${t1 - t0} ms to fetch ${body.length} chars, ${System.currentTimeMillis() - t1} ms to parse")
        return value
    }

    @Serializable private class Categories(val categories: Map<String, List<MusicCollection>> = emptyMap())
    @Serializable private class Items<T>(val items: List<T> = emptyList())
    @Serializable private class SearchBody(
        val tracks: Items<Track>? = null,
        val albums: Items<MusicCollection>? = null,
        val playlists: Items<MusicCollection>? = null,
    )
    @Serializable private class SearchResponse(val results: SearchBody = SearchBody())
    @Serializable private class Created(val code: String? = null)
    @Serializable private class Tracks(val tracks: List<Track> = emptyList(), val index: Int? = null)

    /** How long an answer is trusted before asking again, as on the web app and the Mac app. */
    private const val BROWSE_MS = 10 * 60_000L
    private const val LIBRARY_MS = 2 * 60_000L
    private const val SEARCH_MS = 5 * 60_000L

    private class Entry(val at: Long, val value: Any)
    private val memo = java.util.concurrent.ConcurrentHashMap<String, Entry>()

    /** Forgets what was fetched (the library after a song becomes ready, everything after signing in or out). */
    fun forget(prefix: String = "") { memo.keys.removeAll { it.startsWith(prefix) } }

    /**
     * A fresh answer is reused; a stale one is replaced, but if the server can't be reached the stale one is still better
     * than an error.
     */
    @Suppress("UNCHECKED_CAST")
    private suspend fun <T : Any> cached(key: String, maxAge: Long, load: suspend () -> T): T {
        val hit = memo[key]
        if (hit != null && System.currentTimeMillis() - hit.at < maxAge) return hit.value as T
        return try {
            load().also { memo[key] = Entry(System.currentTimeMillis(), it) }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            if (hit != null) hit.value as T else throw e
        }
    }

    suspend fun topCategories(keywords: List<String>): Map<String, List<MusicCollection>> =
        cached("browse:" + keywords.joinToString(","), BROWSE_MS) {
            get<Categories>("top-categories", mapOf("keyword" to keywords.joinToString(","))).categories
        }

    suspend fun search(query: String): SearchResults = cached("search:" + query.trim().lowercase(), SEARCH_MS) {
        val r = get<SearchResponse>("search", mapOf("q" to query)).results
        SearchResults(r.tracks?.items.orEmpty(), r.albums?.items.orEmpty(), r.playlists?.items.orEmpty())
    }

    suspend fun tracks(of: MusicCollection): List<Track> = cached("tracks:${of.id}", BROWSE_MS) {
        get<Tracks>("${if (of.isAlbum) "album" else "playlist"}/${of.id}/tracks").tracks
    }

    /** Every song that is processed and ready to sing. */
    suspend fun library(): List<Track> = cached("library", LIBRARY_MS) { get<Tracks>("library").tracks }

    @Serializable class Singer(
        @kotlinx.serialization.SerialName("user_id") val userId: String = "",
        val name: String = "Singer", val avatar: String = "", val rank: Int = 0, val points: Int = 0, val songs: Int = 0,
    )
    @Serializable private class Board(val singers: List<Singer> = emptyList())

    /** The top singers, as on the web app's ranking page. */
    suspend fun leaderboard(week: Boolean = false, limit: Int = 12): List<Singer> =
        cached("board:$week:$limit", BROWSE_MS) {
            get<Board>("scores/leaderboard", mapOf("scope" to if (week) "week" else "all", "limit" to "$limit")).singers
        }

    /** The signed-in person's own songs, newest first: what they ordered before. Nothing for a guest. */
    suspend fun history(room: String, limit: Int = 12): List<Track> =
        if (token == null) emptyList() else get<Tracks>("queue/$room/history", mapOf("limit" to "$limit")).tracks

    @Serializable class ChartSource(val id: String = "", val name: String = "", val charts: List<MusicCollection> = emptyList())
    @Serializable private class ChartSources(val sources: List<ChartSource> = emptyList())

    /** The charts other services publish (KKBOX, Spotify, Apple Music, YouTube Music), each openable as a playlist. */
    suspend fun charts(): List<ChartSource> = cached("charts", 60 * 60_000L) { get<ChartSources>("charts").sources }

    @Serializable private class StudioAnswer(val track: Track? = null)

    /** The studio recording of a music video, when there is a different one. */
    suspend fun studioVersion(video: Track): Track? = cached("studio:${video.id}", BROWSE_MS) {
        val query = buildMap {
            put("video_id", video.videoId ?: video.id)
            put("title", video.name)
            put("artists", video.artists.map { it.name }.filter { it.isNotEmpty() }.joinToString(","))
            video.durationMs?.let { put("duration_ms", it.toString()) }
        }
        get<StudioAnswer>("studio_version", query).track ?: video
    }.takeIf { it.id != video.id }

    suspend fun lyrics(trackId: String): LyricsResponse = cached("lyrics:$trackId", BROWSE_MS) { get<LyricsResponse>("lyrics/$trackId") }

    enum class Stem(val path: String) { Instrumental("instrumental"), Vocal("vocal") }

    /** One of the song's two separate tracks: they stream at once, where the mix has to be made first. */
    fun stemUrl(kind: Stem, trackId: String): String = url("tracks/${kind.path}/$trackId").toString()

    /** The song as one file with the original singer at [vocal] (0 is a karaoke track): what a TV plays. */
    fun mixUrl(trackId: String, vocal: Double): String =
        url("tracks/mix/$trackId", mapOf("vocal" to String.format(java.util.Locale.US, "%.2f", vocal.coerceIn(0.0, 1.0))))
            .toString()

    /** Saves the song's lyrics offset for everyone: seconds added to every line time. */
    suspend fun setLyricsDelay(trackId: String, delay: Double) {
        postString("lyrics/delay", buildJsonObject { put("id", trackId); put("delay", delay) })
    }

    // MARK: Rooms and the queue

    /** Joins a room; a device whose id is the room's id opens it, which is what gives it a join code. */
    suspend fun joinRoom(room: String, user: RoomUser) {
        postString("room/$room/join", outJson.encodeToJsonElement(RoomUser.serializer(), user))
    }

    suspend fun roomInfo(room: String): RoomInfo? {
        val body = getString("room/$room")
        return if (body.isBlank() || body == "null") null else json.decodeFromString(body)
    }

    suspend fun queue(room: String): QueueSnapshot {
        val r = get<Tracks>("queue/$room/tracks")
        return QueueSnapshot(r.tracks, if (r.tracks.isEmpty()) -1 else r.index ?: -1)
    }

    private fun trackBody(track: Track): JsonObject = outJson.encodeToJsonElement(Track.serializer(), track).jsonObject

    /** Adds a song to the end of the queue, or (next) right after the one playing. */
    suspend fun addToQueue(room: String, track: Track, next: Boolean) {
        postString("queue/$room/${if (next) "add_to_next" else "add"}", trackBody(track))
    }

    suspend fun removeFromQueue(room: String, track: Track) {
        // the server matches on the snake_case name
        val body = JsonObject(trackBody(track) + ("time_added" to JsonPrimitive(track.timeAdded)))
        postString("queue/$room/remove", body)
    }

    suspend fun clearQueue(room: String) { postString("queue/$room/tracks/clear") }

    suspend fun shuffleQueue(room: String) { postString("queue/$room/arrange/shuffle") }

    suspend fun setQueueIndex(room: String, index: Int) {
        postString("queue/$room/update_queue_idx", buildJsonObject { put("index", index) })
    }

    // MARK: Signing in by pairing with a phone

    suspend fun startPairing(deviceName: String): PairingStart =
        json.decodeFromString(postString("auth/device/start", buildJsonObject { put("deviceName", deviceName) }))

    /** Pending until a person approves; then the token, once. Throws 410 when the code ran out. */
    suspend fun pollPairing(deviceCode: String): PairingPoll =
        json.decodeFromString(postString("auth/device/token", buildJsonObject { put("deviceCode", deviceCode) }))

    suspend fun refreshToken(): PairingPoll = json.decodeFromString(postString("auth/device/refresh"))

    suspend fun revokeToken() { postString("auth/device/revoke") }

    /** Opens the account's room as a jam for hosts: guests can add songs to it, and it has a join code. */
    suspend fun createRoom(room: String): String? {
        val body = postString("room/create", buildJsonObject { put("id", room) })
        return json.decodeFromString<Created>(body).code
    }

    // MARK: Websocket

    /** The room's websocket: the API's own address, with the scheme swapped. */
    fun openSocket(listener: WebSocketListener): WebSocket =
        http.newWebSocket(Request.Builder().url(BASE.replaceFirst("https", "wss") + "/ws").build(), listener)
}

/** What the last run knew, so the first frame already shows the song that was playing and the newest songs. */
object Remembered {
    private var prefs: android.content.SharedPreferences? = null
    fun init(context: android.content.Context) { prefs = context.getSharedPreferences("kkaraoke-remembered", android.content.Context.MODE_PRIVATE) }

    fun song(): Track? = prefs?.getString("song", null)?.let { runCatching { Api.json.decodeFromString<Track>(it) }.getOrNull() }
    fun saveSong(track: Track?) {
        prefs?.edit()?.apply { if (track == null) remove("song") else putString("song", Api.json.encodeToString(Track.serializer(), track)) }?.apply()
    }

    /** The jam's settings as the person left them: the volume, how loud the singer is, and the key. */
    fun volume(): Float = prefs?.getFloat("volume", 1f) ?: 1f
    fun vocalOn(): Boolean = prefs?.getBoolean("vocalOn", false) ?: false
    fun guide(): Double = (prefs?.getFloat("guide", 0f) ?: 0f).toDouble()
    fun semitone(): Int = prefs?.getInt("semitone", 0) ?: 0
    fun saveJam(volume: Float, vocalOn: Boolean, guide: Double, semitone: Int) {
        prefs?.edit()?.putFloat("volume", volume)?.putBoolean("vocalOn", vocalOn)?.putFloat("guide", guide.toFloat())?.putInt("semitone", semitone)?.apply()
    }

    /** Where the song was, so a restart picks up there. */
    fun position(): Pair<String, Long>? = prefs?.getString("posId", null)?.let { it to (prefs?.getLong("posMs", 0L) ?: 0L) }
    fun savePosition(id: String, ms: Long) { prefs?.edit()?.putString("posId", id)?.putLong("posMs", ms)?.apply() }

    fun songs(): List<Track> = prefs?.getString("songs", null)
        ?.let { runCatching { Api.json.decodeFromString<List<Track>>(it) }.getOrNull() }.orEmpty()
    fun saveSongs(list: List<Track>) {
        prefs?.edit()?.putString("songs", Api.json.encodeToString(kotlinx.serialization.builtins.ListSerializer(Track.serializer()), list.take(12)))?.apply()
    }
}
