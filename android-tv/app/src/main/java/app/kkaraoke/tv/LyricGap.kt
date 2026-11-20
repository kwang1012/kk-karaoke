package app.kkaraoke.tv

/**
 * A silent stretch between two lines, long enough to get a countdown for its last seconds. The same rules as the web app's
 * lyricGap.ts and the Mac app's: times here are the song's own, before the lyrics' sync delay.
 */
class LyricGap(val start: Double, val end: Double) {
    /** Seconds left until the next line once the wait is down to its last [COUNTDOWN_S], else null. */
    fun countdown(at: Double): Double? {
        val left = end - at
        return if (at >= start && left > 0 && left <= COUNTDOWN_S) left else null
    }

    companion object {
        const val MIN_S = 5.0
        const val COUNTDOWN_S = 3.0
        private const val GUESS_S_PER_CHAR = 0.75
        private const val GUESS_MIN_S = 4.0
        private const val WORD_END_GRACE_S = 1.8

        /** The silence after line [index] (-1 for the intro before the first line), or null when it is short. */
        fun after(lines: List<LyricLine>, index: Int): LyricGap? {
            val next = lines.getOrNull(index + 1)
            if (next == null || next.text.isEmpty()) return null
            var start = 0.0
            if (index >= 0) {
                val line = lines[index]
                if (line.text.isEmpty()) return null
                var sung = line.words?.lastOrNull()?.let { it.end + WORD_END_GRACE_S }
                    ?: (line.time + maxOf(GUESS_MIN_S, line.text.length * GUESS_S_PER_CHAR))
                line.end?.let { sung = maxOf(sung, it + WORD_END_GRACE_S) }
                start = minOf(sung, next.time)
            }
            return if (next.time - start >= MIN_S) LyricGap(start, next.time) else null
        }
    }
}
