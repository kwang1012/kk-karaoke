import Foundation

/// The two stems of every song played, kept on disk so a song plays again (and, later, offline) without the server.
actor StemCache {
    static let shared = StemCache()

    typealias Progress = @Sendable (_ loaded: Int64, _ total: Int64) -> Void

    private let root: URL
    private var inflight: [String: Task<URL, Error>] = [:]

    init(root: URL? = nil) {
        self.root = root ?? FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("KKaraoke/Stems", isDirectory: true)
    }

    func location(_ stem: APIClient.Stem, trackId: String) -> URL {
        root.appendingPathComponent(stem.rawValue, isDirectory: true).appendingPathComponent("\(trackId).mp3")
    }

    func cachedURL(_ stem: APIClient.Stem, trackId: String) -> URL? {
        let url = location(stem, trackId: trackId)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    func isCached(trackId: String) -> Bool {
        cachedURL(.vocal, trackId: trackId) != nil && cachedURL(.instrumental, trackId: trackId) != nil
    }

    /// Songs kept that nobody pinned: the ones played longest ago go first once there are more than this.
    static let defaultLimit = 40

    /// The stem's file, downloading it first if it is not on disk. Concurrent calls for one stem share a download.
    func fetch(_ stem: APIClient.Stem, trackId: String, client: APIClient, progress: Progress? = nil) async throws -> URL {
        if let url = cachedURL(stem, trackId: trackId) {
            touch(url) // played now: the last to be evicted
            if let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize { progress?(Int64(size), Int64(size)) }
            return url
        }
        let key = "\(stem.rawValue)/\(trackId)"
        if let running = inflight[key] { return try await running.value }
        let destination = location(stem, trackId: trackId)
        let task = Task { try await Self.download(from: try client.stemURL(stem, trackId: trackId), to: destination,
                                                   token: client.token, session: client.session, progress: progress) }
        inflight[key] = task
        defer { inflight[key] = nil }
        let url = try await task.value
        trim(keeping: OfflineStore.shared.ids(), limit: Self.defaultLimit)
        return url
    }

    private func touch(_ url: URL) {
        try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: url.path)
    }

    /// Every song with stems on disk, the longest unplayed first.
    func songsOnDisk() -> [(id: String, bytes: Int64, lastUsed: Date)] {
        let fileManager = FileManager.default
        var byId: [String: (bytes: Int64, lastUsed: Date)] = [:]
        for stem in [APIClient.Stem.vocal, .instrumental] {
            let directory = root.appendingPathComponent(stem.rawValue, isDirectory: true)
            let files = (try? fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey])) ?? []
            for file in files where file.pathExtension == "mp3" {
                let values = try? file.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
                let id = file.deletingPathExtension().lastPathComponent
                let current = byId[id] ?? (0, .distantPast)
                byId[id] = (current.bytes + Int64(values?.fileSize ?? 0), max(current.lastUsed, values?.contentModificationDate ?? .distantPast))
            }
        }
        return byId.map { (id: $0.key, bytes: $0.value.bytes, lastUsed: $0.value.lastUsed) }.sorted { $0.lastUsed < $1.lastUsed }
    }

    var totalBytes: Int64 { songsOnDisk().reduce(0) { $0 + $1.bytes } }

    /// Deletes the longest unplayed songs beyond `limit`, never one in `keeping` (the pinned ones).
    func trim(keeping: Set<String>, limit: Int) {
        let loose = songsOnDisk().filter { !keeping.contains($0.id) }
        for song in loose.dropLast(limit) { remove(trackId: song.id) }
    }

    /// Deletes every song that is not in `keeping`.
    func removeAll(except keeping: Set<String>) {
        for song in songsOnDisk() where !keeping.contains(song.id) { remove(trackId: song.id) }
    }

    func remove(trackId: String) {
        for stem in [APIClient.Stem.vocal, .instrumental] { try? FileManager.default.removeItem(at: location(stem, trackId: trackId)) }
    }

    private static func download(from source: URL, to destination: URL, token: String?, session: URLSession,
                                 progress: Progress?) async throws -> URL {
        var request = URLRequest(url: source, timeoutInterval: 30)
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let delegate = ProgressDelegate(progress)
        let (temporary, response): (URL, URLResponse)
        do { (temporary, response) = try await session.download(for: request, delegate: delegate) }
        catch { throw APIError.offline(error) }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            try? FileManager.default.removeItem(at: temporary)
            throw APIError.status(status, nil)
        }
        let fileManager = FileManager.default
        try fileManager.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? fileManager.removeItem(at: destination)
        try fileManager.moveItem(at: temporary, to: destination)
        return destination
    }
}

/// Reports a download's progress through the task's own `Progress`.
private final class ProgressDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private let handler: StemCache.Progress?
    private var observation: NSKeyValueObservation?

    init(_ handler: StemCache.Progress?) { self.handler = handler }

    func urlSession(_ session: URLSession, didCreateTask task: URLSessionTask) {
        guard let handler else { return }
        observation = task.progress.observe(\.completedUnitCount) { progress, _ in
            handler(progress.completedUnitCount, progress.totalUnitCount)
        }
    }
}
