import Foundation
import Testing
@testable import KKaraoke

struct LyricsTests {
    private let lines = [
        LyricLine(time: 10, text: "a"), LyricLine(time: 20, text: "b"), LyricLine(time: 30, text: "c"),
    ]

    @Test func lineIndexFollowsTime() {
        #expect(LyricsTiming.lineIndex(in: lines, at: 5, delay: 0) == nil)
        #expect(LyricsTiming.lineIndex(in: lines, at: 10, delay: 0) == 0)
        #expect(LyricsTiming.lineIndex(in: lines, at: 25, delay: 0) == 1)
        #expect(LyricsTiming.lineIndex(in: lines, at: 99, delay: 0) == 2)
        #expect(LyricsTiming.lineIndex(in: [], at: 1, delay: 0) == nil)
    }

    @Test func delayShiftsEveryLine() {
        // A negative delay shows the lyrics earlier (the lead before the singing).
        #expect(LyricsTiming.lineIndex(in: lines, at: 9, delay: -1) == 0)
        #expect(LyricsTiming.lineIndex(in: lines, at: 9, delay: 0) == nil)
        #expect(LyricsTiming.lineIndex(in: lines, at: 20, delay: 1) == 0)
    }

    @Test func wordFillRamps() {
        let word = LyricWord(start: 1, end: 2, text: "hi")
        #expect(LyricsTiming.wordFill(word, next: nil, delay: 0, progress: 0.5) == 0)
        #expect(LyricsTiming.wordFill(word, next: nil, delay: 0, progress: 1.5) == 0.5)
        #expect(LyricsTiming.wordFill(word, next: nil, delay: 0, progress: 3) == 1)
        #expect(LyricsTiming.wordFill(word, next: nil, delay: 1, progress: 2.5) == 0.5)
    }

    @Test func wordStopsFillingWhenTheNextStarts() {
        let word = LyricWord(start: 1, end: 3, text: "a ")
        let next = LyricWord(start: 2, end: 3, text: "b")
        #expect(LyricsTiming.wordFill(word, next: next, delay: 0, progress: 2) == 1)
        #expect(LyricsTiming.wordFill(next, next: nil, delay: 0, progress: 2) == 0)
    }

    @Test func zeroLengthWordStillLightsUp() {
        let word = LyricWord(start: 1, end: 1, text: "x")
        #expect(LyricsTiming.wordFill(word, next: nil, delay: 0, progress: 1.06) == 1)
    }

    @Test func decodesLyricsResponse() throws {
        let json = """
        {"lyrics":[{"time":12.5,"text":"hello","romanized":null,"words":[{"start":12.5,"end":13,"text":"hello"}]},
                   {"time":15,"text":"bye","guess":true}],
         "content":"","delay":-0.5,"confidence":"high","videoId":"abc"}
        """
        let response = try JSONDecoder().decode(LyricsResponse.self, from: Data(json.utf8))
        #expect(response.lyrics.count == 2)
        #expect(response.lyrics[0].words?.first?.text == "hello")
        #expect(response.lyrics[1].words == nil)
        #expect(response.delay == -0.5)
    }

    @Test func decodesUnsyncedLyrics() throws {
        let json = #"{"lyrics":[],"content":"","plain":"la la","delay":0,"confidence":"unsynced","videoId":null}"#
        let response = try JSONDecoder().decode(LyricsResponse.self, from: Data(json.utf8))
        #expect(response.lyrics.isEmpty)
        #expect(response.plain == "la la")
    }
}

struct StemCacheTests {
    @Test func locatesStemsUnderKindAndId() async {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let cache = StemCache(root: root)
        let url = await cache.location(.vocal, trackId: "abc")
        #expect(url.path.hasSuffix("vocal/abc.mp3"))
        #expect(await cache.cachedURL(.vocal, trackId: "abc") == nil)
        #expect(await !cache.isCached(trackId: "abc"))
    }

    @Test func longWaitsGetACountdown() {
        let lines = [
            LyricLine(time: 20, text: "a", words: [LyricWord(start: 20, end: 22, text: "a")]),
            LyricLine(time: 24, text: "b"), LyricLine(time: 60, text: ""), LyricLine(time: 80, text: "c"),
        ]
        #expect(LyricGap.after(lines, index: -1, delay: 0) == LyricGap(start: 0, end: 20))
        #expect(LyricGap.after(lines, index: 0, delay: 0) == nil)
        #expect(LyricGap.after(lines, index: 1, delay: 0) == LyricGap(start: 26, end: 60))
        #expect(LyricGap.after(lines, index: 2, delay: 1) == LyricGap(start: 61, end: 81))
        #expect(LyricGap.after(lines, index: 3, delay: 0) == nil)
        let gap = LyricGap(start: 22, end: 40)
        #expect(gap.countdown(at: 21) == nil)
        #expect(gap.countdown(at: 36.2) == 4)
        #expect(gap.countdown(at: 39.99) == 1)
        #expect(gap.countdown(at: 40) == nil)
    }
}
