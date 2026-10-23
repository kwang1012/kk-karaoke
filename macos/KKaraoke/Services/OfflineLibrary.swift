import Foundation
import Observation

/// The songs pinned for offline use: downloaded once, kept until unpinned, and playable with no server.
@MainActor
@Observable
final class OfflineLibrary {
    private(set) var songs: [PinnedSong] = []
    /// Songs being downloaded, and how far along they are (nil until the size is known).
    private(set) var downloading: [String: Double?] = [:]
    private(set) var failures: [String: String] = [:]
    private(set) var storageBytes: Int64 = 0

    @ObservationIgnored private let store: OfflineStore
    @ObservationIgnored private let cache: StemCache
    @ObservationIgnored private var tasks: [String: Task<Void, Never>] = [:]

    init(store: OfflineStore = .shared, cache: StemCache = .shared) {
        self.store = store
        self.cache = cache
        songs = store.all()
        Task { await updateStorage() }
    }

    func isPinned(_ id: String) -> Bool { songs.contains { $0.id == id } }
    var tracks: [Track] { songs.map(\.track) }

    // MARK: Pinning

    /// Downloads the song's stems, lyrics and melody and keeps them. Safe to call again while it runs.
    func pin(_ track: Track, using client: APIClient?) {
        guard let client, tasks[track.id] == nil else { return }
        failures[track.id] = nil
        downloading[track.id] = .some(nil)
        tasks[track.id] = Task {
            defer { tasks[track.id] = nil; downloading[track.id] = nil }
            do {
                let tally = ProgressTally()
                let report: @Sendable (Int) -> StemCache.Progress = { [self] index in
                    { loaded, total in
                        let fraction = tally.update(index, loaded: loaded, total: total)
                        Task { @MainActor in if self.downloading[track.id] != nil { self.downloading[track.id] = .some(fraction) } }
                    }
                }
                async let vocal = cache.fetch(.vocal, trackId: track.id, client: client, progress: report(0))
                async let instrumental = cache.fetch(.instrumental, trackId: track.id, client: client, progress: report(1))
                _ = try await (vocal, instrumental)
                try Task.checkCancellation()
                let lyrics = try? await client.lyrics(trackId: track.id)
                var melody: [Note]?
                if case .notes(let notes)? = try? await client.melody(trackId: track.id) { melody = notes }
                var kept = track
                (kept.status, kept.progress, kept.orderedBy) = (nil, nil, nil)
                try store.save(PinnedSong(track: kept, pinnedAt: Date(), lyrics: lyrics, melody: melody))
                songs = store.all()
                AppNotifier.downloaded(kept)
                await updateStorage()
            } catch is CancellationError {
            } catch let APIError.status(404, _) {
                failures[track.id] = tr("This song hasn't been processed yet.")
            } catch {
                failures[track.id] = error.localizedDescription
            }
        }
    }

    /// Stops keeping the song. Its audio stays until the cache needs the room, like any song that was played.
    func unpin(_ track: Track) {
        tasks[track.id]?.cancel()
        store.remove(track.id)
        songs = store.all()
    }

    /// Brings every pinned song up to date while the server is there: new lyrics, a melody that was still pending.
    func refresh(using client: APIClient?) {
        guard let client else { return }
        for song in songs {
            Task {
                var updated = song
                if let lyrics = try? await client.lyrics(trackId: song.id) { updated.lyrics = lyrics }
                if song.melody == nil, case .notes(let notes)? = try? await client.melody(trackId: song.id) { updated.melody = notes }
                if updated != song || updated.lyrics?.lyrics != song.lyrics?.lyrics || updated.melody != song.melody {
                    try? store.save(updated)
                    songs = store.all()
                }
            }
        }
    }

    // MARK: Storage

    func updateStorage() async { storageBytes = await cache.totalBytes }

    /// Deletes every song's audio that is not pinned.
    func clearCache() async {
        await cache.removeAll(except: Set(songs.map(\.id)))
        await updateStorage()
    }

    /// Unpins everything and deletes all audio.
    func removeEverything() async {
        tasks.values.forEach { $0.cancel() }
        store.removeAll()
        songs = []
        await cache.removeAll(except: [])
        await updateStorage()
    }
}
