package app.kkaraoke.tv

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.datasource.HttpDataSource
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

sealed interface LyricsState {
    data object Loading : LyricsState
    data object Missing : LyricsState
    data object Failed : LyricsState
    data class Plain(val text: String) : LyricsState
    data class Synced(val lines: List<LyricLine>, val delay: Double) : LyricsState
}

/**
 * Plays one song at a time as its two separate tracks, the instrumental and the original singer, together. The singer's
 * volume is the "guide vocal": changing it is only a volume change, so it is instant. (The server can also mix the two into
 * one file, but it makes that mix on request and takes about eight seconds each time.) What plays, and when to go to the
 * next song, is decided by [RoomController]; this only plays and reports how the song stands.
 */
@UnstableApi
class PlayerController(private val context: Context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    /** Adds the original singer into the instrumental, inside the one player. */
    private val mixer = StemMixer()

    private val renderers = object : DefaultRenderersFactory(context) {
        override fun buildAudioSink(context: Context, enableFloatOutput: Boolean, enableAudioTrackPlaybackParams: Boolean): AudioSink =
            DefaultAudioSink.Builder(context).setAudioProcessors(arrayOf(mixer)).build()
    }

    /** The instrumental, with the singer mixed in: the only player, so there is one clock. */
    private val inst: ExoPlayer = ExoPlayer.Builder(context, renderers)
        .setAudioAttributes(
            AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true,
        )
        .setHandleAudioBecomingNoisy(true)
        .build()

    /** The song loaded now (it may still be getting ready on the server). */
    var loaded by mutableStateOf<Track?>(null); private set

    /** Whether the song is meant to be playing (it may be waiting for audio to arrive). */
    var isPlaying by mutableStateOf(false); private set
    var buffering by mutableStateOf(false); private set
    var positionMs by mutableLongStateOf(0L); private set
    var durationMs by mutableLongStateOf(0L); private set
    var lyrics by mutableStateOf<LyricsState>(LyricsState.Missing); private set

    /** The YouTube video of the recording, when it has one. */
    var videoId by mutableStateOf<String?>(null); private set
    var error by mutableStateOf<String?>(null); private set

    /** How loud the original singer is: 0 is a karaoke track, 1 is the original recording. */
    var vocalOn by mutableStateOf(false); private set

    /** How much of the original singer stays under the karaoke track when the original is not fully on. */
    var guideLevel by mutableStateOf(0.0); private set

    /** What the singer's volume is now: all of it with the original on, else the guide level (as on the web and Mac). */
    val vocal: Double get() = if (vocalOn) 1.0 else guideLevel
    var volume by mutableStateOf(1f); private set

    /** The key, in semitones: the whole song (singer and instrumental together) is shifted, at the same speed. */
    var semitone by mutableStateOf(0); private set

    /** The song ended by itself. */
    var onEnded: (() -> Unit)? = null

    private var lyricsJob: Job? = null
    private var singerJob: Job? = null
    private var want = false

    private val launchedAt = android.os.SystemClock.elapsedRealtime()
    private var lastSavedAt = 0L

    private fun saveJam() = Remembered.saveJam(volume, vocalOn, guideLevel, semitone)

    init {
        // the settings the person left, and (below) the song's place
        volume = Remembered.volume(); vocalOn = Remembered.vocalOn(); guideLevel = Remembered.guide()
        semitone = Remembered.semitone()
        if (semitone != 0) inst.playbackParameters = PlaybackParameters(1f, Math.pow(2.0, semitone / 12.0).toFloat())
        inst.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) = stateChanged()

            override fun onPlayerError(e: PlaybackException) {
                val cause = e.cause
                error = if (cause is HttpDataSource.InvalidResponseCodeException && cause.responseCode == 404) {
                    "This song isn't ready yet."
                } else {
                    "Couldn't play this song."
                }
            }
        })
        applyVolumes()
        scope.launch {
            while (true) {
                delay(100)
                if (inst.isPlaying) {
                    positionMs = inst.currentPosition
                    val now = android.os.SystemClock.elapsedRealtime()
                    val id = loaded?.id
                    if (id != null && positionMs > 1_000 && now - lastSavedAt > 5_000) { lastSavedAt = now; Remembered.savePosition(id, positionMs) }
                }
            }
        }
    }

    private fun stateChanged() {
        if (inst.playbackState == Player.STATE_READY) durationMs = inst.duration.coerceAtLeast(0L)
        buffering = inst.playbackState == Player.STATE_BUFFERING
        if (inst.playbackState == Player.STATE_ENDED) {
            want = false
            isPlaying = false
            onEnded?.invoke()
            return
        }
        reconcile()
    }

    private fun reconcile() {
        inst.playWhenReady = want && inst.playbackState == Player.STATE_READY
        isPlaying = want
    }

    private fun applyVolumes() {
        inst.volume = volume
        mixer.gain = vocal.toFloat()
    }

    /** Loads [track] and, when [autoplay], starts it. */
    fun play(track: Track, autoplay: Boolean) {
        show(track)
        want = autoplay
        isPlaying = autoplay
        // coming back after a restart goes to where the song was left, once
        val saved = Remembered.position()
        val start = if (saved != null && saved.first == track.id && android.os.SystemClock.elapsedRealtime() - launchedAt < 30_000) saved.second else 0L
        Remembered.savePosition(track.id, start)
        positionMs = start
        mixer.expectPosition(start)
        inst.setMediaItem(MediaItem.fromUri(Api.stemUrl(Api.Stem.Instrumental, track.id)), start)
        inst.playWhenReady = false
        inst.prepare()
        loadSinger(track)
    }

    /** The singers of the songs next to this one, already downloading and decoding, so a skip starts with them. */
    private val prefetched = LinkedHashMap<String, Pair<SingerBuffer, Job>>()

    /** Gets the singer's track of each of [tracks] (the ones that are ready) going in the background. */
    fun prefetch(tracks: List<Track>) {
        val wanted = tracks.filter { it.isReady }.map { it.id }.toSet()
        prefetched.keys.filter { it !in wanted }.forEach { prefetched.remove(it)?.second?.cancel() }
        for (id in wanted) {
            if (id == loaded?.id || id in prefetched) continue
            val buffer = SingerBuffer()
            val job = scope.launch {
                try { StemDecoder.decodeInto(Api.stemUrl(Api.Stem.Vocal, id), buffer) }
                catch (e: CancellationException) { throw e }
                catch (e: Exception) { android.util.Log.w("KKaraoke", "could not prefetch", e) }
            }
            prefetched[id] = buffer to job
        }
    }

    /** The original singer is fetched and decoded once, then mixed in at whatever volume is chosen. */
    private fun loadSinger(track: Track) {
        prefetched.remove(track.id)?.let { (buffer, job) ->
            mixer.setSinger(buffer)
            singerJob = job
            return
        }
        val buffer = SingerBuffer()
        mixer.setSinger(buffer)
        singerJob = scope.launch {
            val t0 = android.os.SystemClock.elapsedRealtime()
            try {
                StemDecoder.decodeInto(Api.stemUrl(Api.Stem.Vocal, track.id), buffer)
                android.util.Log.d("KKaraoke", "singer decoded: ${buffer.count / buffer.channels / buffer.rate} s at ${buffer.rate} Hz x${buffer.channels} in ${android.os.SystemClock.elapsedRealtime() - t0} ms")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                android.util.Log.w("KKaraoke", "could not load the singer's track", e)
            }
        }
    }

    /** Shows [track] as the song of the moment without playing: it is still being made ready on the server. */
    fun show(track: Track) {
        loaded = track
        error = null
        want = false
        isPlaying = false
        positionMs = 0L
        durationMs = track.durationMs ?: 0L
        singerJob?.cancel()
        mixer.setSinger(null)
        inst.stop(); inst.clearMediaItems()
        loadLyrics(track)
    }

    /** Nothing is queued: stop and clear. */
    fun clear() {
        loaded = null
        error = null
        want = false
        isPlaying = false
        positionMs = 0L
        durationMs = 0L
        lyricsJob?.cancel()
        lyrics = LyricsState.Missing
        singerJob?.cancel()
        mixer.setSinger(null)
        inst.stop(); inst.clearMediaItems()
    }

    /** Where the song is right now, to the millisecond: what a screen reads each frame to move smoothly. */
    fun livePositionMs(): Long = inst.currentPosition

    fun resume() { want = true; reconcile() }
    fun pause() { want = false; reconcile() }

    fun seekTo(ms: Long) {
        val target = ms.coerceAtLeast(0L)
        mixer.expectPosition(target)
        inst.seekTo(target)
        positionMs = target
    }

    fun seekBy(ms: Long) = seekTo((inst.currentPosition + ms).coerceIn(0L, durationMs.takeIf { it > 0 } ?: Long.MAX_VALUE))

    fun chooseVolume(level: Float) {
        volume = level.coerceIn(0f, 1f)
        applyVolumes()
        saveJam()
    }

    fun chooseSemitone(steps: Int) {
        semitone = steps.coerceIn(-12, 12)
        inst.playbackParameters = PlaybackParameters(1f, Math.pow(2.0, semitone / 12.0).toFloat())
        saveJam()
    }

    /** The original recording's singer on (all of it) or off (back to the guide level). */
    fun chooseVocalOn(enabled: Boolean) {
        if (!enabled && guideLevel >= 1.0) guideLevel = 0.0 // otherwise turning it off would change nothing
        vocalOn = enabled
        applyVolumes()
        saveJam()
    }

    /** How loud the quiet guide singer is. Instant: the singer is always in the mix. */
    fun chooseGuideLevel(level: Double) {
        guideLevel = level.coerceIn(0.0, 1.0)
        applyVolumes()
        saveJam()
    }

    /** Adopts the lyrics offset someone set for the song that is playing. */
    fun applySharedDelay(trackId: String, delay: Double) {
        val state = lyrics
        if (loaded?.id == trackId && state is LyricsState.Synced) lyrics = state.copy(delay = delay)
    }

    private fun loadLyrics(track: Track) {
        lyricsJob?.cancel()
        lyrics = LyricsState.Loading
        videoId = track.videoId
        lyricsJob = scope.launch {
            lyrics = try {
                val response = Api.lyrics(track.id)
                response.videoId?.let { videoId = it }
                when {
                    response.lyrics.isNotEmpty() -> LyricsState.Synced(response.lyrics, response.delay ?: 0.0)
                    !response.plain.isNullOrBlank() -> LyricsState.Plain(response.plain)
                    else -> LyricsState.Missing
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: ApiException) {
                if (e.code == 404) LyricsState.Missing else LyricsState.Failed
            } catch (e: Exception) {
                LyricsState.Failed
            }
        }
    }
}
