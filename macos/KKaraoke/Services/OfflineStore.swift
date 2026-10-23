import Foundation

/// A song kept for offline use: what the server knows about it beyond the audio, which stays in `StemCache`.
struct PinnedSong: Codable, Sendable, Identifiable, Equatable {
    var track: Track
    var pinnedAt: Date
    var lyrics: LyricsResponse?
    /// nil when the server had not worked the melody out yet.
    var melody: [Note]?
    var id: String { track.id }

    static func == (lhs: PinnedSong, rhs: PinnedSong) -> Bool { lhs.track == rhs.track && lhs.pinnedAt == rhs.pinnedAt }
}

/// The pinned songs' details on disk, one small file each, so lyrics and melody are there when the server is not.
final class OfflineStore: @unchecked Sendable {
    static let shared = OfflineStore()

    private let root: URL
    private let lock = NSLock()

    init(root: URL? = nil) {
        self.root = root ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("KKaraoke/Pinned", isDirectory: true)
    }

    private func file(_ id: String) -> URL { root.appendingPathComponent("\(id).json") }

    func song(_ id: String) -> PinnedSong? {
        lock.lock(); defer { lock.unlock() }
        guard let data = try? Data(contentsOf: file(id)) else { return nil }
        return try? Self.decoder.decode(PinnedSong.self, from: data)
    }

    func all() -> [PinnedSong] {
        lock.lock(); defer { lock.unlock() }
        let files = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        return files.filter { $0.pathExtension == "json" }
            .compactMap { try? Self.decoder.decode(PinnedSong.self, from: Data(contentsOf: $0)) }
            .sorted { $0.pinnedAt > $1.pinnedAt }
    }

    func ids() -> Set<String> {
        lock.lock(); defer { lock.unlock() }
        let files = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        return Set(files.filter { $0.pathExtension == "json" }.map { $0.deletingPathExtension().lastPathComponent })
    }

    func save(_ song: PinnedSong) throws {
        lock.lock(); defer { lock.unlock() }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try Self.encoder.encode(song).write(to: file(song.id), options: .atomic)
    }

    func remove(_ id: String) {
        lock.lock(); defer { lock.unlock() }
        try? FileManager.default.removeItem(at: file(id))
    }

    func removeAll() {
        lock.lock(); defer { lock.unlock() }
        try? FileManager.default.removeItem(at: root)
    }

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .secondsSince1970
        return encoder
    }()

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        return decoder
    }()
}
