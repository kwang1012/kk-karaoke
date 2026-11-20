package app.kkaraoke.tv

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor.AudioFormat
import androidx.media3.common.audio.AudioProcessor.UnhandledAudioFormatException
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * A stem as it is being decoded: 16-bit samples, interleaved, growing while it downloads. The mixer reads what is there.
 * Kept in fixed blocks, so growing never copies (a whole song is tens of megabytes, which a TV has little room for).
 */
class SingerBuffer {
    private val blocks = java.util.concurrent.atomic.AtomicReferenceArray<ShortArray>(64)
    @Volatile var count = 0
    @Volatile var rate = 0
    @Volatile var channels = 0
    @Volatile var done = false

    operator fun get(i: Int): Short = blocks.get(i ushr BITS)[i and MASK]

    fun append(source: java.nio.ShortBuffer) {
        var n = source.remaining()
        var at = count
        while (n > 0) {
            val block = at ushr BITS
            val block0 = blocks.get(block) ?: ShortArray(1 shl BITS).also { blocks.set(block, it) }
            val offset = at and MASK
            val take = minOf(n, block0.size - offset)
            source.get(block0, offset, take)
            at += take
            n -= take
        }
        count = at // published after the samples are in
    }

    private companion object {
        const val BITS = 20
        const val MASK = (1 shl BITS) - 1
    }
}

/**
 * Adds the original singer into the instrumental while it plays, inside the player's own audio path. There is one clock
 * and one output, so the two can never drift: the singer's sample is picked by how far the instrumental has got. Changing
 * how loud the singer is only changes a number, so it is instant. This is how the web and Mac apps do it too.
 */
@UnstableApi
class StemMixer : BaseAudioProcessor() {
    @Volatile private var singer: SingerBuffer? = null

    /** The singer in the player's own format, made once the whole stem is in, when it came in another one. */
    private var converted: ShortArray? = null
    @Volatile var gain: Float = 0f

    /** Where the instrumental will be after the next flush (a seek, or a new song). */
    @Volatile private var nextStartMs = 0L
    private var frame = 0L
    private var rate = 0
    private var channels = 0

    fun setSinger(buffer: SingerBuffer?) {
        singer = buffer
        converted = null
    }

    /** Must be called just before the player seeks or starts a song: the flush that follows reads it. */
    fun expectPosition(ms: Long) { nextStartMs = ms }

    private fun convert(b: SingerBuffer): ShortArray {
        val r = rate; val c = channels
        val inFrames = b.count / b.channels
        val outFrames = (inFrames.toLong() * r / b.rate).toInt()
        val out = ShortArray(outFrames * c)
        for (f in 0 until outFrames) {
            val src = (f.toLong() * b.rate / r).toInt().coerceAtMost(inFrames - 1)
            for (ch in 0 until c) out[f * c + ch] = b[src * b.channels + minOf(ch, b.channels - 1)]
        }
        return out
    }

    override fun onConfigure(inputAudioFormat: AudioFormat): AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) throw UnhandledAudioFormatException(inputAudioFormat)
        rate = inputAudioFormat.sampleRate
        channels = inputAudioFormat.channelCount
        converted = null
        return inputAudioFormat
    }

    override fun onFlush() {
        frame = nextStartMs * rate / 1000
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val size = inputBuffer.remaining()
        if (size == 0) return
        val out = replaceOutputBuffer(size)
        val ch = channels
        val frames = size / (2 * ch)
        val b = singer
        val g = gain
        var voice: ShortArray? = null
        var voiceSize = 0
        var live: SingerBuffer? = null
        if (b != null && b.rate > 0) {
            if (b.rate == rate && b.channels == ch) { live = b; voiceSize = b.count }
            else if (b.done) { voice = converted ?: convert(b).also { converted = it }; voiceSize = voice.size }
        }
        if ((voice == null && live == null) || g <= 0f) {
            out.put(inputBuffer)
        } else {
            inputBuffer.order(ByteOrder.nativeOrder())
            out.order(ByteOrder.nativeOrder())
            var base = (frame * ch).toInt()
            repeat(frames * ch) {
                var s = inputBuffer.getShort().toInt()
                if (base >= 0 && base < voiceSize) s += ((voice?.get(base) ?: live!![base]) * g).toInt()
                out.putShort(s.coerceIn(-32768, 32767).toShort())
                base++
            }
        }
        frame += frames
        out.flip()
    }
}

/** A stem being downloaded, readable from the start while the rest is still arriving. */
private class StreamSource(private val url: String) : android.media.MediaDataSource() {
    private val lock = Object()
    private var data = ByteArray(1 shl 20)
    private var length = 0
    private var finished = false
    private var failure: Exception? = null
    @Volatile private var closed = false

    fun download() {
        try {
            java.net.URL(url).openStream().use { input ->
                val chunk = ByteArray(32 * 1024)
                while (!closed) {
                    val n = input.read(chunk)
                    if (n < 0) break
                    synchronized(lock) {
                        if (length + n > data.size) data = data.copyOf(maxOf(data.size * 2, length + n))
                        System.arraycopy(chunk, 0, data, length, n)
                        length += n
                        lock.notifyAll()
                    }
                }
            }
        } catch (e: Exception) {
            failure = e
        } finally {
            synchronized(lock) { finished = true; lock.notifyAll() }
        }
    }

    override fun readAt(position: Long, buffer: ByteArray, offset: Int, size: Int): Int = synchronized(lock) {
        while (position >= length && !finished && !closed) lock.wait()
        if (position >= length) {
            failure?.let { throw java.io.IOException(it) }
            return -1
        }
        val n = minOf(size.toLong(), length - position).toInt()
        System.arraycopy(data, position.toInt(), buffer, offset, n)
        n
    }

    override fun getSize(): Long = synchronized(lock) { if (finished) length.toLong() else -1L }

    override fun close() { closed = true; synchronized(lock) { lock.notifyAll() } }
}

/** Reads a stem from the server and decodes it to samples as it arrives, so the start of the song is ready within a second or two. */
object StemDecoder {
    suspend fun decodeInto(url: String, out: SingerBuffer) = withContext(Dispatchers.IO) {
        val source = StreamSource(url)
        val downloader = Thread({ source.download() }, "stem-download").also { it.isDaemon = true; it.start() }
        val extractor = MediaExtractor()
        try {
            extractor.setDataSource(source)
            var track = -1
            var format: MediaFormat? = null
            for (i in 0 until extractor.trackCount) {
                val f = extractor.getTrackFormat(i)
                if (f.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) { track = i; format = f; break }
            }
            require(track >= 0 && format != null) { "no audio in the stem" }
            extractor.selectTrack(track)
            val codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
            codec.configure(format, null, null, 0)
            codec.start()
            out.channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            out.rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            val info = MediaCodec.BufferInfo()
            var inputDone = false
            var outputDone = false
            try {
                while (!outputDone) {
                    currentCoroutineContext().ensureActive()
                    if (!inputDone) {
                        val i = codec.dequeueInputBuffer(10_000)
                        if (i >= 0) {
                            val buffer = codec.getInputBuffer(i)!!
                            val n = extractor.readSampleData(buffer, 0)
                            if (n < 0) {
                                codec.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                                inputDone = true
                            } else {
                                codec.queueInputBuffer(i, 0, n, extractor.sampleTime, 0)
                                extractor.advance()
                            }
                        }
                    }
                    val o = codec.dequeueOutputBuffer(info, 10_000)
                    when {
                        o >= 0 -> {
                            val buffer = codec.getOutputBuffer(o)!!
                            buffer.position(info.offset)
                            buffer.limit(info.offset + info.size)
                            val shorts = buffer.order(ByteOrder.nativeOrder()).asShortBuffer()
                            val n = shorts.remaining()
                            out.append(shorts)
                            codec.releaseOutputBuffer(o, false)
                            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
                        }
                        o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                            val f = codec.outputFormat
                            out.rate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                            out.channels = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                        }
                    }
                }
            } finally {
                runCatching { codec.stop() }
                codec.release()
            }
            out.done = true
        } finally {
            source.close()
            extractor.release()
            downloader.interrupt()
        }
    }
}
