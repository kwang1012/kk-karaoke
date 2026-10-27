import Foundation

enum APIError: LocalizedError {
    case badURL
    case status(Int, String?)
    case offline(Error)

    var errorDescription: String? {
        switch self {
        case .badURL: tr("The server address is not valid.")
        case .status(let code, let detail): detail.map { tr("Server answered \(code): \($0)") } ?? tr("Server answered \(code).")
        case .offline(let error): error.localizedDescription
        }
    }
}

/// Talks to the KKaraoke API. `baseURL` is the API root: the app always uses `AppModel.productionAPI`.
struct APIClient: Sendable {
    var baseURL: URL
    var token: String?
    var session: URLSession = .shared

    private static let decoder = JSONDecoder()
    private static let encoder = JSONEncoder()

    func url(_ path: String, query: [String: String] = [:]) throws -> URL {
        let trimmed = path.hasPrefix("/") ? String(path.dropFirst()) : path
        guard var components = URLComponents(url: baseURL.appendingPathComponent(trimmed), resolvingAgainstBaseURL: false)
        else { throw APIError.badURL }
        if !query.isEmpty { components.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) } }
        guard let url = components.url else { throw APIError.badURL }
        return url
    }

    func send(_ request: URLRequest) async throws -> (Data, Int) {
        var request = request
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        do {
            let (data, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200..<300).contains(status) else {
                let detail = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])
                    .flatMap { ($0["error"] ?? $0["detail"]) as? String }
                throw APIError.status(status, detail)
            }
            return (data, status)
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.offline(error)
        }
    }

    func get<T: Decodable>(_ type: T.Type, _ path: String, query: [String: String] = [:]) async throws -> T {
        let (data, _) = try await send(URLRequest(url: try url(path, query: query), timeoutInterval: 20))
        return try Self.decoder.decode(T.self, from: data)
    }

    func post<B: Encodable, T: Decodable>(_ type: T.Type, _ path: String, body: B) async throws -> T {
        var request = URLRequest(url: try url(path), timeoutInterval: 20)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try Self.encoder.encode(body)
        let (data, _) = try await send(request)
        return try Self.decoder.decode(T.self, from: data)
    }

    // MARK: Endpoints

    struct Health: Decodable, Sendable { var api: Bool; var redis: Bool; var worker: Bool }

    func health() async throws -> Health { try await get(Health.self, "health") }

    func topCategories(_ keywords: [String], refresh: Bool = false) async throws -> [String: [Collection]] {
        struct Response: Decodable { var categories: [String: [Collection]] }
        return try await cached("top-categories|\(keywords)", staleTime: Freshness.browse, refresh: refresh) {
            try await self.get(Response.self, "top-categories", query: ["keyword": keywords.joined(separator: ",")]).categories
        }
    }

    func search(_ query: String) async throws -> SearchResults {
        struct Items<T: Decodable>: Decodable { var items: [T] }
        struct Results: Decodable {
            var tracks: Items<Track>?
            var albums: Items<Collection>?
            var playlists: Items<Collection>?
        }
        struct Response: Decodable { var results: Results }
        return try await cached("search|\(query.lowercased())", staleTime: Freshness.search) {
            let results = try await self.get(Response.self, "search", query: ["q": query]).results
            return SearchResults(tracks: results.tracks?.items ?? [], albums: results.albums?.items ?? [],
                                 playlists: results.playlists?.items ?? [])
        }
    }

    func contents(of collection: Collection) async throws -> CollectionContents {
        struct Response: Decodable { var collection: Collection?; var tracks: [Track]? }
        let kind = collection.isAlbum ? "album" : "playlist"
        return try await cached("\(kind)/\(collection.id)", staleTime: Freshness.browse) {
            let response = try await self.get(Response.self, "\(kind)/\(collection.id)/tracks")
            return CollectionContents(collection: response.collection ?? collection, tracks: response.tracks ?? [])
        }
    }

    func library(refresh: Bool = false) async throws -> [Track] {
        struct Response: Decodable { var tracks: [Track] }
        return try await cached("library", staleTime: Freshness.library, refresh: refresh) {
            try await self.get(Response.self, "library").tracks
        }
    }

    func randomTracks() async throws -> [Track] {
        struct Response: Decodable { var tracks: [Track] }
        return try await get(Response.self, "random_tracks").tracks
    }

    /// Which of these songs are ready to play.
    func ready(among ids: [String]) async throws -> Set<String> {
        struct Response: Decodable { var ready: [String] }
        let response = try await get(Response.self, "library/ready", query: ["ids": ids.prefix(100).joined(separator: ",")])
        return Set(response.ready)
    }

    /// Charts from other services, as playlists the app can open.
    func charts() async throws -> [ChartSource] {
        struct Response: Decodable { var sources: [ChartSource] }
        return try await cached("charts", staleTime: Freshness.library) { try await self.get(Response.self, "charts").sources }
    }

    func stemURL(_ kind: Stem, trackId: String) throws -> URL { try url("tracks/\(kind.rawValue)/\(trackId)") }

    enum Stem: String, Sendable { case vocal, instrumental }

    /// The song as one file with the original singer at `vocal` (0 to 1): what a TV plays.
    func mixURL(trackId: String, vocal: Double) throws -> URL {
        var parts = URLComponents(url: try url("tracks/mix/\(trackId)"), resolvingAgainstBaseURL: false)
        parts?.queryItems = [URLQueryItem(name: "vocal", value: String(format: "%.2f", min(1, max(0, vocal))))]
        guard let result = parts?.url else { throw APIError.badURL }
        return result
    }
}

extension APIClient {
    /// 404 when the song has no lyrics at all.
    func lyrics(trackId: String) async throws -> LyricsResponse { try await get(LyricsResponse.self, "lyrics/\(trackId)") }

    struct Ignored: Decodable { init(from decoder: Decoder) throws {} }

    /// Uses the same one-report-per-song endpoint as the web app.
    func reportLyrics(trackId: String) async throws {
        _ = try await post(Ignored.self, "lyrics/\(trackId)/report", body: [String: String]())
    }

    /// Saves the song's lyrics offset for everyone: seconds added to every line time.
    func setLyricsDelay(trackId: String, delay: Double) async throws {
        struct Body: Encodable { var id: String; var delay: Double }
        _ = try await post(Ignored.self, "lyrics/delay", body: Body(id: trackId, delay: delay))
    }
}

enum MelodyResult: Sendable {
    /// The server is still finding it (202).
    case pending
    /// The song has no notes (404).
    case none
    case notes([Note])
}

extension APIClient {
    /// The notes sung in a song, sorted by start.
    func melody(trackId: String) async throws -> MelodyResult {
        struct Response: Decodable { var noteEvents: [Note] }
        do {
            let (data, status) = try await send(URLRequest(url: try url("tracks/midi/\(trackId)"), timeoutInterval: 20))
            if status == 202 { return .pending }
            let notes = try JSONDecoder().decode(Response.self, from: data).noteEvents
            return notes.isEmpty ? .none : .notes(notes.sorted { $0.start < $1.start })
        } catch APIError.status(404, _) {
            return .none
        }
    }
}

// MARK: Rooms and the queue

extension APIClient {
    private struct Message: Decodable { var message: String? }
    private struct Empty: Encodable {}

    /// Opens the room for others to join; answers its join code. Needs a signed-in host where the server asks for one.
    func createRoom(id: String) async throws -> String? {
        struct Body: Encodable { var id: String }
        struct Response: Decodable { var code: String? }
        return try await post(Response.self, "room/create", body: Body(id: id)).code
    }

    /// The room behind a join code, or nil when no room has it.
    func room(forCode code: String) async throws -> String? {
        struct Response: Decodable { var roomId: String }
        do {
            let encoded = code.trimmingCharacters(in: .whitespaces).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? code
            return try await get(Response.self, "room/code/\(encoded)").roomId
        } catch APIError.status(404, _) { return nil }
    }

    func roomInfo(id: String) async throws -> RoomInfo? {
        let (data, _) = try await send(URLRequest(url: try url("room/\(id)"), timeoutInterval: 20))
        if data.isEmpty || String(data: data, encoding: .utf8) == "null" { return nil }
        return try JSONDecoder().decode(RoomInfo.self, from: data)
    }

    func queue(room: String) async throws -> QueueSnapshot {
        struct Response: Decodable { var tracks: [Track]; var index: Int? }
        let response = try await get(Response.self, "queue/\(room)/tracks")
        return QueueSnapshot(tracks: response.tracks, index: response.index ?? -1)
    }

    /// Adds a song to the end of the queue, or (`next`) right after the one playing.
    func addToQueue(room: String, track: Track, next: Bool) async throws {
        _ = try await post(Ignored.self, "queue/\(room)/\(next ? "add_to_next" : "add")", body: track)
    }

    func removeFromQueue(room: String, track: Track) async throws {
        var object = (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(track))) as? [String: Any] ?? [:]
        if let added = track.timeAdded { object["time_added"] = added } // the server matches on the snake_case name
        var request = URLRequest(url: try url("queue/\(room)/remove"), timeoutInterval: 20)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: object)
        _ = try await send(request)
    }

    func clearQueue(room: String) async throws {
        _ = try await post(Ignored.self, "queue/\(room)/tracks/clear", body: Empty())
    }

    func reorderQueue(room: String, from: Int, to: Int, id: String) async throws {
        struct Body: Encodable { var oldIndex: Int; var newIndex: Int; var id: String }
        _ = try await post(Ignored.self, "queue/\(room)/reorder", body: Body(oldIndex: from, newIndex: to, id: id))
    }

    func arrangeQueue(room: String, mode: QueueOrder) async throws {
        _ = try await post(Ignored.self, "queue/\(room)/arrange/\(mode.rawValue)", body: Empty())
    }

    func setQueueIndex(room: String, index: Int) async throws {
        struct Body: Encodable { var index: Int }
        _ = try await post(Ignored.self, "queue/\(room)/update_queue_idx", body: Body(index: index))
    }

    /// The address of the room's websocket: the API's own, with the scheme swapped.
    var socketURL: URL? {
        guard var components = URLComponents(url: baseURL.appendingPathComponent("ws"), resolvingAgainstBaseURL: false) else { return nil }
        components.scheme = baseURL.scheme == "https" ? "wss" : "ws"
        return components.url
    }
}
