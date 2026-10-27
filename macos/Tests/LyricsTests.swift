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

    @Test func syncUsesTheWebsLimitsAndLabels() {
        #expect(LyricsSync.clampedAhead(0.1 + 0.2) == 0.3)
        #expect(LyricsSync.clampedAhead(35) == 30)
        #expect(LyricsSync.clampedAhead(-35) == -30)
        #expect(LyricsSync.label(0) == "0.0s")
        #expect(LyricsSync.label(-0.0) == "0.0s")
        #expect(LyricsSync.label(0.1) == "+0.1s")
        #expect(LyricsSync.label(-0.1) == "-0.1s")
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
            LyricLine(time: 24, text: "b"), LyricLine(time: 60, text: "c"), LyricLine(time: 80, text: ""),
            LyricLine(time: 100, text: "d"),
        ]
        #expect(LyricGap.after(lines, index: -1, delay: 0) == LyricGap(start: 0, end: 20))
        #expect(LyricGap.after(lines, index: 0, delay: 0) == nil)
        #expect(LyricGap.after(lines, index: 1, delay: 0) == LyricGap(start: 26, end: 60))
        // no countdown into or after an instrumental line
        #expect(LyricGap.after(lines, index: 2, delay: 1) == nil)
        #expect(LyricGap.after(lines, index: 3, delay: 0) == nil)
        #expect(LyricGap.after(lines, index: 4, delay: 0) == nil)
        let gap = LyricGap(start: 22, end: 40)
        #expect(gap.countdown(at: 21) == nil)
        #expect(gap.countdown(at: 30) == nil)
        #expect(gap.countdown(at: 37.5) == 2.5)
        #expect(gap.countdown(at: 40) == nil)
    }
}

private final class LyricsReportProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var status = 200
    nonisolated(unsafe) static var reports: [String] = []
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let reporting = request.httpMethod == "POST"
        if reporting { Self.reports.append(request.url!.path) }
        let response = HTTPURLResponse(url: request.url!, statusCode: reporting ? Self.status : 200,
            httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        let json = reporting ? (Self.status == 200 ? #"{"reported":true}"# : #"{"detail":"Try again"}"#) : #"{"lyrics":[]}"#
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(json.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@MainActor @Suite(.serialized) struct LyricsReportTests {
    @Test func reportsOncePerSongAndRetriesFailures() async {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [LyricsReportProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        LyricsReportProtocol.status = 200
        LyricsReportProtocol.reports = []
        let client = APIClient(baseURL: URL(string: "https://karaoke.example/api")!, session: session)
        let player = PlayerModel()
        player.setFollower(true)
        player.follow(Track(id: "song-a", name: "A"), using: client)
        await player.reportLyrics()
        #expect(player.lyricsReported)
        #expect(!player.isReportingLyrics)
        await player.reportLyrics()
        #expect(LyricsReportProtocol.reports == ["/api/lyrics/song-a/report"])

        player.follow(Track(id: "song-b", name: "B"), using: client)
        #expect(!player.lyricsReported)
        LyricsReportProtocol.status = 503
        await player.reportLyrics()
        #expect(!player.lyricsReported)
        #expect(!player.isReportingLyrics)
        #expect(player.lyricsReportError != nil)
        LyricsReportProtocol.status = 200
        await player.reportLyrics()
        #expect(player.lyricsReported)
        #expect(player.lyricsReportError == nil)
        #expect(Array(LyricsReportProtocol.reports.suffix(2)) == ["/api/lyrics/song-b/report", "/api/lyrics/song-b/report"])
        player.stop()
    }
}
