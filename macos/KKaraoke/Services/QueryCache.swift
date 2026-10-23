import Foundation

/// Remembers what the server answered, like React Query does for the web app: a screen opened again within `staleTime`
/// shows the earlier answer at once, and screens asking for the same thing together share one request.
actor QueryCache {
    static let shared = QueryCache()

    private struct Entry { var value: any Sendable; var fetchedAt: Date }
    private var entries: [String: Entry] = [:]
    private var inflight: [String: Task<any Sendable, Error>] = [:]

    /// The cached answer for `key` if it is younger than `staleTime`, else the result of `load`, which is then cached.
    /// A failed load is not cached, so the next ask tries again.
    func fetch<T: Sendable>(
        _ key: String, staleTime: TimeInterval, refresh: Bool = false, load: @escaping @Sendable () async throws -> T
    ) async throws -> T {
        if !refresh, let entry = entries[key], Date().timeIntervalSince(entry.fetchedAt) < staleTime,
           let value = entry.value as? T { return value }
        if let running = inflight[key], let value = try await running.value as? T { return value }
        let task = Task<any Sendable, Error> { try await load() }
        inflight[key] = task
        do {
            let value = try await task.value
            inflight[key] = nil
            entries[key] = Entry(value: value, fetchedAt: Date())
            guard let typed = value as? T else { throw CancellationError() }
            return typed
        } catch {
            inflight[key] = nil
            throw error
        }
    }

    /// Forgets every answer whose key contains `text`: used when something changed on the server.
    func invalidate(containing text: String) { entries = entries.filter { !$0.key.contains(text) } }

    func clear() { entries = [:]; inflight = [:] }
}

extension APIClient {
    /// How long an answer stays fresh. The web app keeps everything for ten minutes.
    enum Freshness {
        static let browse: TimeInterval = 10 * 60
        static let library: TimeInterval = 2 * 60
        static let search: TimeInterval = 5 * 60
        static let ready: TimeInterval = 30
    }

    func cached<T: Sendable>(
        _ key: String, staleTime: TimeInterval, refresh: Bool = false, load: @escaping @Sendable () async throws -> T
    ) async throws -> T {
        try await QueryCache.shared.fetch("\(baseURL.absoluteString)|\(key)", staleTime: staleTime, refresh: refresh, load: load)
    }

    /// Something changed on the server (a song finished processing): the library lists must be asked for again.
    static func invalidateLibrary() { Task { await QueryCache.shared.invalidate(containing: "|library") } }
}
