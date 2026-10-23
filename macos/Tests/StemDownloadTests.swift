import Foundation
import SwiftUI
import Testing
import WebKit
@testable import KKaraoke

/// Answers every request from `StubProtocol.responses`, keyed by path.
final class StubProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var responses: [String: (status: Int, body: Data)] = [:]

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        let hit = Self.responses[request.url?.path ?? ""] ?? (404, Data())
        let response = HTTPURLResponse(url: request.url!, statusCode: hit.status, httpVersion: nil,
                                       headerFields: ["Content-Length": "\(hit.body.count)"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: hit.body)
        client?.urlProtocolDidFinishLoading(self)
    }
}

@Suite(.serialized)
struct StemDownloadTests {
    fileprivate func makeClient() -> APIClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubProtocol.self]
        return APIClient(baseURL: URL(string: "http://stub.test/api")!, session: URLSession(configuration: configuration))
    }

    private func makeCache() -> StemCache {
        StemCache(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
    }

    @Test func downloadsOnceThenServesFromDisk() async throws {
        let body = Data(repeating: 7, count: 200_000)
        StubProtocol.responses = ["/api/tracks/vocal/abc": (200, body)]
        let cache = makeCache()
        let client = makeClient()

        let url = try await cache.fetch(.vocal, trackId: "abc", client: client)
        #expect(try Data(contentsOf: url) == body)
        #expect(await cache.cachedURL(.vocal, trackId: "abc") == url)

        StubProtocol.responses = [:] // the server is gone: the cached file still plays
        let again = try await cache.fetch(.vocal, trackId: "abc", client: client)
        #expect(again == url)
    }

    @Test func missingStemIsA404AndLeavesNothingBehind() async throws {
        StubProtocol.responses = [:]
        let cache = makeCache()
        await #expect(throws: APIError.self) { try await cache.fetch(.instrumental, trackId: "nope", client: makeClient()) }
        #expect(await cache.cachedURL(.instrumental, trackId: "nope") == nil)
    }
}

// Pinning goes through the same stubbed server, so it joins the serialized suite.
extension StemDownloadTests {
    private func tempRoot() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString) }

    @MainActor @Test func pinningKeepsAudioLyricsAndMelody() async throws {
        let body = Data(repeating: 1, count: 50_000)
        StubProtocol.responses = [
            "/api/tracks/vocal/abc": (200, body), "/api/tracks/instrumental/abc": (200, body),
            "/api/lyrics/abc": (200, Data(#"{"lyrics":[{"time":1,"text":"la"}],"delay":0.5,"confidence":"high"}"#.utf8)),
            "/api/tracks/midi/abc": (200, Data(#"{"noteEvents":[{"note":60,"start":1,"end":2}]}"#.utf8)),
        ]
        let store = OfflineStore(root: tempRoot()), cache = StemCache(root: tempRoot())
        let library = OfflineLibrary(store: store, cache: cache)
        let track = Track(id: "abc", name: "Song", artists: [Artist(name: "A")], status: "separating", progress: 0.5)
        library.pin(track, using: makeClient())
        for _ in 0..<100 where !library.isPinned("abc") { try await Task.sleep(for: .milliseconds(50)) }

        #expect(library.isPinned("abc") && library.downloading["abc"] == nil)
        #expect(await cache.isCached(trackId: "abc"))
        let kept = try #require(store.song("abc"))
        #expect(kept.lyrics?.lyrics.first?.text == "la" && kept.lyrics?.delay == 0.5)
        #expect(kept.melody?.first?.note == 60)
        #expect(kept.track.status == nil && kept.track.progress == nil) // what the queue knew of its processing is not kept

        library.unpin(track)
        #expect(!library.isPinned("abc") && store.song("abc") == nil)
    }

    @MainActor @Test func aSongThatIsNotProcessedCannotBePinned() async throws {
        StubProtocol.responses = [:]
        let library = OfflineLibrary(store: OfflineStore(root: tempRoot()), cache: StemCache(root: tempRoot()))
        library.pin(Track(id: "nope", name: "Nope"), using: makeClient())
        for _ in 0..<100 where library.failures["nope"] == nil { try await Task.sleep(for: .milliseconds(50)) }
        #expect(library.failures["nope"] == tr("This song hasn't been processed yet."))
        #expect(!library.isPinned("nope"))
    }
}

extension StemDownloadTests {
    /// 0.1 seconds of silent MP3, encoded with LAME. Exercise real loading without starting sound.
    private func preloadAudio() throws -> Data {
        try #require(Data(base64Encoded: "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYyLjEyLjEwMAAAAAAAAAAAAAAA//sQZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xJkIg/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xBkRI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EmRmj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EGSJD/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV"))
    }

    private func servePreloadSongs(_ ids: [String]) throws {
        let audio = try preloadAudio()
        StubProtocol.responses = [:]
        for id in ids {
            StubProtocol.responses["/api/tracks/vocal/\(id)"] = (200, audio)
            StubProtocol.responses["/api/tracks/instrumental/\(id)"] = (200, audio)
            StubProtocol.responses["/api/lyrics/\(id)"] = (200, Data("{\"lyrics\":[{\"time\":0,\"text\":\"\(id)\"}]}".utf8))
        }
    }

    @MainActor private func waitUntil(_ condition: () async -> Bool) async throws {
        for _ in 0..<150 {
            if await condition() { return }
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(await condition(), "Preload did not finish")
    }

    @MainActor @Test func queuePreloadsBothNeighborsAndReusesTheirLyricsOnSkip() async throws {
        try servePreloadSongs(["previous", "current", "next"])
        let root = tempRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = StemCache(root: root)
        let player = PlayerModel(cache: cache), singing = SingingModel()
        let room = RoomModel(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        let client = makeClient()
        room.attach(player: player, singing: singing) { client }
        defer { player.stop() }
        let tracks = ["previous", "current", "next"].enumerated().map {
            Track(id: $0.element, name: $0.element, timeAdded: $0.offset + 1, status: "ready")
        }

        // Asking while the current song is not ready does no speculative work.
        player.preload(tracks, using: client)
        try await Task.sleep(for: .milliseconds(50))
        #expect(await cache.isCached(trackId: "next") == false)
        room.apply(queue: QueueSnapshot(tracks: tracks, index: 1))
        try await waitUntil {
            let previousReady = await cache.isCached(trackId: "previous")
            let nextReady = await cache.isCached(trackId: "next")
            return previousReady && nextReady
        }
        #expect(player.track?.id == "current" && player.status == .ready && !player.isPlaying)
        try await waitUntil { if case .synced(let lines) = player.lyrics { return lines.first?.text == "current" }; return false }

        // Selection must use the warmed audio and lyrics even when the server has disappeared.
        StubProtocol.responses = [:]
        room.apply(queue: QueueSnapshot(tracks: tracks, index: 2))
        try await waitUntil { if case .synced(let lines) = player.lyrics { return lines.first?.text == "next" }; return false }
        #expect(player.track?.id == "next" && player.status == .ready && !player.isPlaying)
    }

    @MainActor @Test func newNeighborsAndProcessingCompletionTriggerPreloads() async throws {
        try servePreloadSongs(["current", "waiting", "later"])
        let root = tempRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = StemCache(root: root)
        let player = PlayerModel(cache: cache), singing = SingingModel()
        let room = RoomModel(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        let client = makeClient()
        room.attach(player: player, singing: singing) { client }
        defer { player.stop() }
        let current = Track(id: "current", name: "Current", timeAdded: 1)
        let waiting = Track(id: "waiting", name: "Waiting", timeAdded: 2, status: "separating")
        let later = Track(id: "later", name: "Later", timeAdded: 3, status: "ready")
        room.apply(queue: QueueSnapshot(tracks: [current], index: 0))
        try await waitUntil { player.status == .ready }
        room.apply(queue: QueueSnapshot(tracks: [current, waiting, later], index: 0))
        try await Task.sleep(for: .milliseconds(50))
        #expect(await cache.isCached(trackId: "waiting") == false)
        #expect(await cache.isCached(trackId: "later") == false, "Only immediate neighbors should preload")
        room.receive(SocketMessage(type: "notify", data: .object([
            "track": .object(["id": .string("waiting")]), "status": .string("ready"),
        ])))
        try await waitUntil { await cache.isCached(trackId: "waiting") }
        room.apply(queue: QueueSnapshot(tracks: [current, later, room.queue[1]], index: 0))
        try await waitUntil { await cache.isCached(trackId: "later") }
        #expect(player.track?.id == "current" && !player.isPlaying)
    }

    @MainActor @Test func aRemoteDoesNotPreloadAudio() async throws {
        try servePreloadSongs(["next"])
        let root = tempRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = StemCache(root: root)
        let player = PlayerModel(cache: cache)
        player.setFollower(true)
        player.preload([Track(id: "next", name: "Next", status: "ready")], using: makeClient())
        try await Task.sleep(for: .milliseconds(50))
        #expect(await cache.isCached(trackId: "next") == false)
        #expect(player.track == nil && player.status == .idle)
    }

    @MainActor @Test func currentSongRecoversWhenProcessingFinishes() async throws {
        StubProtocol.responses = [:]
        let root = tempRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let player = PlayerModel(cache: StemCache(root: root)), singing = SingingModel()
        let room = RoomModel(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        let client = makeClient()
        room.attach(player: player, singing: singing) { client }
        defer { player.stop() }
        let track = Track(id: "processing", name: "Processing", timeAdded: 1, status: "separating")
        room.apply(queue: QueueSnapshot(tracks: [track], index: 0))
        try await waitUntil { if case .failed = player.status { return true }; return false }

        // A notification should recover immediately, even if fetching the queue fails.
        try servePreloadSongs([track.id])
        room.receive(SocketMessage(type: "notify", data: .object([
            "track": .object(["id": .string(track.id)]), "status": .string("ready"),
        ])))
        try await waitUntil { player.status == .ready }
        try await waitUntil { if case .synced = player.lyrics { return true }; return false }
        #expect(player.track?.id == track.id && player.track?.status == "ready")
        #expect(!player.isPlaying)
    }

    @MainActor @Test func refreshedQueueRecoversAfterAMissedProcessingNotification() async throws {
        StubProtocol.responses = [:]
        let root = tempRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let player = PlayerModel(cache: StemCache(root: root)), singing = SingingModel()
        let room = RoomModel(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        let client = makeClient()
        room.attach(player: player, singing: singing) { client }
        defer { player.stop() }
        var track = Track(id: "reconnected", name: "Reconnected", timeAdded: 1, status: "separating")
        room.apply(queue: QueueSnapshot(tracks: [track], index: 0))
        try await waitUntil { if case .failed = player.status { return true }; return false }
        try servePreloadSongs([track.id])
        track.status = "ready"
        room.apply(queue: QueueSnapshot(tracks: [track], index: 0))
        try await waitUntil { player.status == .ready }
        #expect(player.track?.id == track.id && !player.isPlaying)
    }

    @MainActor @Test(arguments: [false, true])
    func processingRecoveryAlsoWorksForASongPlayedOutsideTheQueue(playAgain: Bool) async throws {
        StubProtocol.responses = [:]
        let root = tempRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let player = PlayerModel(cache: StemCache(root: root)), singing = SingingModel()
        let room = RoomModel(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        let client = makeClient()
        room.attach(player: player, singing: singing) { client }
        defer { player.stop() }
        let track = Track(id: "direct", name: "Direct", status: "separating")
        player.play(track, using: client, autoplay: true)
        try await waitUntil { if case .failed = player.status { return true }; return false }
        player.perform(.pause) // Cancels the original request to start after processing.
        if playAgain { player.perform(.play) }
        try servePreloadSongs([track.id])
        room.receive(SocketMessage(type: "notify", data: .object([
            "track": .object(["id": .string(track.id)]), "status": .string("ready"),
        ])))
        try await waitUntil { player.status == .ready && player.isPlaying == playAgain }
        #expect(room.currentTrack == nil && player.track?.id == track.id && player.isPlaying == playAgain)
    }

    @MainActor @Test func lyricsAndVideoModesRetainTheSameWebView() async throws {
        try servePreloadSongs(["current"])
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        defaults.set(false, forKey: "showVideo")
        let player = PlayerModel()
        player.setFollower(true)
        player.follow(Track(id: "current", name: "Current", videoId: "M7lc1UVf-VE"), using: makeClient())
        let host = NSHostingView(rootView: NowPlayingView()
            .environment(player).environment(SingingModel()).defaultAppStorage(defaults))
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 700),
                              styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = host
        defer { window.contentView = nil; player.stop() }
        func webViews(_ view: NSView) -> [WKWebView] {
            (view as? WKWebView).map { [$0] } ?? view.subviews.flatMap { webViews($0) }
        }
        try await waitUntil {
            host.layoutSubtreeIfNeeded()
            return webViews(host).count == 1
        }
        let web = try #require(webViews(host).first)
        // This test checks native view identity, so it does not need YouTube or network access.
        web.stopLoading()
        web.loadHTMLString("<html><body>Buffered video fixture</body></html>", baseURL: nil)
        for visible in [true, false, true, false] {
            defaults.set(visible, forKey: "showVideo")
            try await Task.sleep(for: .milliseconds(50))
            host.layoutSubtreeIfNeeded()
            let mounted = webViews(host)
            #expect(mounted.count == 1)
            #expect(mounted.first === web, "Changing modes must retain the buffered web player")
        }
    }
}
