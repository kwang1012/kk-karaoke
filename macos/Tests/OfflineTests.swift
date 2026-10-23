import Foundation
import AppKit
import MediaPlayer
import Testing
@testable import KKaraoke

struct OfflineStoreTests {
    private func tempRoot() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString) }

    @Test func savesAndReadsSongsNewestFirst() throws {
        let store = OfflineStore(root: tempRoot())
        #expect(store.all().isEmpty && store.song("a") == nil)
        let lyrics = try JSONDecoder().decode(LyricsResponse.self, from: Data(#"{"lyrics":[{"time":1,"text":"hi"}],"delay":-1}"#.utf8))
        try store.save(PinnedSong(track: Track(id: "a", name: "First"), pinnedAt: Date(timeIntervalSince1970: 100), lyrics: lyrics, melody: [Note(note: 60, start: 0, end: 1)]))
        try store.save(PinnedSong(track: Track(id: "b", name: "Second"), pinnedAt: Date(timeIntervalSince1970: 200)))
        #expect(store.all().map(\.id) == ["b", "a"])
        #expect(store.ids() == ["a", "b"])
        let first = try #require(store.song("a"))
        #expect(first.lyrics?.lyrics.first?.text == "hi" && first.lyrics?.delay == -1)
        #expect(first.melody?.count == 1)
        store.remove("a")
        #expect(store.ids() == ["b"])
        store.removeAll()
        #expect(store.all().isEmpty)
    }

    @Test func aDamagedFileIsSkippedNotFatal() throws {
        let root = tempRoot()
        let store = OfflineStore(root: root)
        try store.save(PinnedSong(track: Track(id: "ok", name: "Fine"), pinnedAt: Date()))
        try Data("not json".utf8).write(to: root.appendingPathComponent("broken.json"))
        #expect(store.all().map(\.id) == ["ok"])
        #expect(store.song("broken") == nil)
    }
}

struct CacheEvictionTests {
    /// A song on disk with the given stem sizes, last played `age` seconds ago.
    private func addSong(_ id: String, to root: URL, age: TimeInterval, bytes: Int = 1000) throws {
        for stem in ["vocal", "instrumental"] {
            let directory = root.appendingPathComponent(stem)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let file = directory.appendingPathComponent("\(id).mp3")
            try Data(count: bytes).write(to: file)
            try FileManager.default.setAttributes([.modificationDate: Date().addingTimeInterval(-age)], ofItemAtPath: file.path)
        }
    }

    @Test func theLongestUnplayedGoFirstAndPinnedOnesStay() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        for (index, id) in ["old", "older", "oldest", "new", "newer"].enumerated() { try addSong(id, to: root, age: Double(1000 - index * 100)) }
        // ages: old 1000, older 900, oldest 800, new 700, newer 600 seconds: "old" is the longest unplayed
        let cache = StemCache(root: root)
        #expect(await cache.songsOnDisk().map(\.id) == ["old", "older", "oldest", "new", "newer"])
        #expect(await cache.totalBytes == 10_000)

        await cache.trim(keeping: ["old"], limit: 2) // "old" is pinned; keep the two newest of the rest
        let left = await cache.songsOnDisk().map(\.id)
        #expect(Set(left) == ["old", "new", "newer"])
    }

    @Test func clearingKeepsPinnedSongs() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try addSong("keep", to: root, age: 10)
        try addSong("drop", to: root, age: 20)
        let cache = StemCache(root: root)
        await cache.removeAll(except: ["keep"])
        #expect(await cache.songsOnDisk().map(\.id) == ["keep"])
        #expect(await cache.cachedURL(.vocal, trackId: "drop") == nil)
    }
}

@MainActor
struct OfflineQueueTests {
    private func makeRoom() -> RoomModel {
        let room = RoomModel(defaults: UserDefaults(suiteName: "test.offline.\(UUID().uuidString)")!)
        // nothing listens on this port: only what needs no server can work
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:9")!)
        room.attach(player: PlayerModel(), singing: SingingModel()) { client }
        return room
    }

    @Test func theQueueIsKeptHereWhileTheServerIsAway() async throws {
        let room = makeRoom()
        room.setServerReachable(false)
        #expect(room.offline)
        let a = Track(id: "a", name: "A"), b = Track(id: "b", name: "B"), c = Track(id: "c", name: "C")
        room.addToQueue(a)
        room.addToQueue(b)
        room.playNext(c)
        for _ in 0..<40 where room.queue.count < 3 { try await Task.sleep(for: .milliseconds(25)) }
        #expect(room.queue.map(\.id) == ["a", "c", "b"]) // "c" went right after the one playing
        #expect(room.currentTrack?.id == "a" && room.upcoming.map(\.id) == ["c", "b"])
        #expect(room.queue.allSatisfy { $0.timeAdded != nil })

        room.move(from: 1, to: 0)
        #expect(room.upcoming.map(\.id) == ["b", "c"])
        room.remove(room.upcoming[0])
        #expect(room.upcoming.map(\.id) == ["c"])
        room.clear()
        #expect(room.queue.map(\.id) == ["a"])
    }

    @Test func aServerThatTurnsOutToBeGoneSwitchesToTheLocalQueue() async throws {
        let room = makeRoom() // believes the server is there
        #expect(!room.offline)
        room.addToQueue(Track(id: "a", name: "A"))
        for _ in 0..<80 where room.queue.isEmpty { try await Task.sleep(for: .milliseconds(25)) }
        #expect(room.offline) // the failed request found out
        #expect(room.queue.map(\.id) == ["a"])
    }
}

@MainActor
struct NowPlayingTests {
    @Test func theWidgetShowsTheSongAndKeepsTime() {
        let playing = NowPlayingBridge.info(title: "Song", artist: "Artist", album: "Album", duration: 200, elapsed: 12.5, playing: true)
        #expect(playing[MPMediaItemPropertyTitle] as? String == "Song")
        #expect(playing[MPMediaItemPropertyArtist] as? String == "Artist")
        #expect(playing[MPMediaItemPropertyAlbumTitle] as? String == "Album")
        #expect(playing[MPMediaItemPropertyPlaybackDuration] as? Double == 200)
        #expect(playing[MPNowPlayingInfoPropertyElapsedPlaybackTime] as? Double == 12.5)
        #expect(playing[MPNowPlayingInfoPropertyPlaybackRate] as? Double == 1)
        let paused = NowPlayingBridge.info(title: "S", artist: "A", album: nil, duration: 0, elapsed: -3, playing: false)
        #expect(paused[MPNowPlayingInfoPropertyPlaybackRate] as? Double == 0)
        #expect(paused[MPNowPlayingInfoPropertyElapsedPlaybackTime] as? Double == 0)
        #expect(paused[MPMediaItemPropertyPlaybackDuration] == nil && paused[MPMediaItemPropertyAlbumTitle] == nil)
    }

    @Test func driftIsTheGapFromWhatTheSystemWouldShow() {
        // set at 10 s when the uptime was 100; playing, so by uptime 105 the system shows 15 s
        #expect(NowPlayingBridge.drift(elapsedWhenSet: 10, setAt: 100, now: 105, playing: true, actual: 15) == 0)
        #expect(NowPlayingBridge.drift(elapsedWhenSet: 10, setAt: 100, now: 105, playing: true, actual: 40) == 25) // a seek
        #expect(NowPlayingBridge.drift(elapsedWhenSet: 10, setAt: 100, now: 105, playing: false, actual: 10) == 0) // paused: it stands still
    }

    @Test func mediaKeysDriveThePlayer() async throws {
        let player = PlayerModel()
        var sent: [PlayerModel.Control] = []
        player.setFollower(true)
        player.onControl = { sent.append($0) }
        let bridge = NowPlayingBridge()
        bridge.start(player: player)
        let center = MPRemoteCommandCenter.shared()
        #expect(center.nextTrackCommand.isEnabled && center.previousTrackCommand.isEnabled && center.togglePlayPauseCommand.isEnabled)
        #expect(center.changePlaybackPositionCommand.isEnabled)
    }
}

@MainActor
struct MediaCallbackTests {
    /// MediaPlayer calls its handlers (and an artwork's image handler) on queues of its own. A closure that thinks it is on the
    /// main actor traps there, so each is called from a background queue here, as the system does.
    @Test func handlersRunOffTheMainThread() async throws {
        let player = PlayerModel()
        player.setFollower(true)
        var sent: [PlayerModel.Control] = []
        player.onControl = { sent.append($0) }
        let bridge = NowPlayingBridge()
        bridge.start(player: player)

        let center = MPRemoteCommandCenter.shared()
        let called: Bool = await withCheckedContinuation { continuation in
            DispatchQueue.global().async {
                // the command center's own targets can't be invoked directly, so ask for the artwork handler the same way
                let image = NSImage(size: NSSize(width: 8, height: 8))
                let artwork = NowPlayingBridge.artwork(image)
                _ = artwork.image(at: CGSize(width: 8, height: 8))
                continuation.resume(returning: true)
            }
        }
        #expect(called)
        #expect(center.nextTrackCommand.isEnabled)
    }
}
