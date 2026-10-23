import Foundation

/// The API camel-cases every JSON key (backend/middlewares/format.py), so the models use plain names.
/// Fields the server may leave out are optional or defaulted: a song from one source carries less than another.

struct CoverImage: Codable, Hashable, Sendable {
    var url: String
    var width: Int?
    var height: Int?
}

struct Artist: Codable, Hashable, Sendable {
    var id: String = ""
    var uri: String = ""
    var name: String = ""

    init(id: String = "", uri: String = "", name: String = "") {
        self.id = id
        self.uri = uri
        self.name = name
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? ""
        uri = try c.decodeIfPresent(String.self, forKey: .uri) ?? ""
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
    }
}

struct Album: Codable, Hashable, Sendable {
    var id: String = ""
    var name: String = ""
    var images: [CoverImage] = []

    init(id: String = "", name: String = "", images: [CoverImage] = []) {
        self.id = id
        self.name = name
        self.images = images
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? ""
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        images = try c.decodeIfPresent([CoverImage].self, forKey: .images) ?? []
    }
}

struct Track: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var name: String
    var artists: [Artist] = []
    var album: Album?
    var durationMs: Int?
    var timeAdded: Int?
    var videoId: String?
    /// "song" (studio audio) or "video" (music video, live, upload).
    var kind: String?
    /// Who put it in the queue.
    var orderedBy: User?
    /// How far the server is with processing it: "ready", or the stage it is at.
    var status: String?
    var progress: Double?

    init(id: String, name: String, artists: [Artist] = [], album: Album? = nil, durationMs: Int? = nil,
         timeAdded: Int? = nil, videoId: String? = nil, kind: String? = nil, orderedBy: User? = nil,
         status: String? = nil, progress: Double? = nil) {
        self.id = id
        self.name = name
        self.artists = artists
        self.album = album
        self.durationMs = durationMs
        self.timeAdded = timeAdded
        self.videoId = videoId
        self.kind = kind
        self.orderedBy = orderedBy
        self.status = status
        self.progress = progress
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        artists = try c.decodeIfPresent([Artist].self, forKey: .artists) ?? []
        album = try c.decodeIfPresent(Album.self, forKey: .album)
        durationMs = try c.decodeIfPresent(Int.self, forKey: .durationMs)
        timeAdded = try c.decodeIfPresent(Int.self, forKey: .timeAdded)
        videoId = try c.decodeIfPresent(String.self, forKey: .videoId)
        kind = try c.decodeIfPresent(String.self, forKey: .kind)
        orderedBy = try? c.decodeIfPresent(User.self, forKey: .orderedBy)
        status = try c.decodeIfPresent(String.self, forKey: .status)
        progress = try c.decodeIfPresent(Double.self, forKey: .progress)
    }

    /// The same song put in the queue at the same moment: the queue may hold one song twice.
    func isSameEntry(as other: Track?) -> Bool { other.map { $0.id == id && $0.timeAdded == timeAdded } ?? false }

    var artistText: String { artists.map(\.name).filter { !$0.isEmpty }.joined(separator: ", ") }
    var artworkURL: URL? { album?.images.first.flatMap { URL(string: $0.url) } }
    var duration: TimeInterval? { durationMs.map { TimeInterval($0) / 1000 } }
}

/// A playlist or an album.
struct Collection: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var name: String
    var description: String = ""
    /// "playlist" or "album".
    var type: String = "playlist"
    var images: [CoverImage] = []
    var ownerName: String = ""
    var totalTracks: Int = 0
    var releaseDate: String = ""
    var artists: [Artist] = []

    private enum CodingKeys: String, CodingKey {
        case id, name, description, type, images, owner, tracks, totalTracks, releaseDate, artists
    }

    private struct Owner: Codable { var displayName: String? }
    private struct Tracks: Codable { var total: Int? }

    init(id: String, name: String, type: String = "playlist") {
        self.id = id
        self.name = name
        self.type = type
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        description = try c.decodeIfPresent(String.self, forKey: .description) ?? ""
        type = try c.decodeIfPresent(String.self, forKey: .type) ?? "playlist"
        images = try c.decodeIfPresent([CoverImage].self, forKey: .images) ?? []
        ownerName = try c.decodeIfPresent(Owner.self, forKey: .owner)?.displayName ?? ""
        totalTracks = try c.decodeIfPresent(Int.self, forKey: .totalTracks)
            ?? c.decodeIfPresent(Tracks.self, forKey: .tracks)?.total ?? 0
        releaseDate = try c.decodeIfPresent(String.self, forKey: .releaseDate) ?? ""
        artists = try c.decodeIfPresent([Artist].self, forKey: .artists) ?? []
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(name, forKey: .name)
        try c.encode(description, forKey: .description)
        try c.encode(type, forKey: .type)
        try c.encode(images, forKey: .images)
        try c.encode(Owner(displayName: ownerName), forKey: .owner)
        try c.encode(Tracks(total: totalTracks), forKey: .tracks)
        try c.encode(totalTracks, forKey: .totalTracks)
        try c.encode(releaseDate, forKey: .releaseDate)
        try c.encode(artists, forKey: .artists)
    }

    var isAlbum: Bool { type == "album" }
    var artworkURL: URL? { images.first.flatMap { URL(string: $0.url) } }
    var subtitle: String {
        if isAlbum { return artists.map(\.name).filter { !$0.isEmpty }.joined(separator: ", ") }
        return ownerName
    }
}

struct SearchResults: Sendable {
    var tracks: [Track] = []
    var albums: [Collection] = []
    var playlists: [Collection] = []
}

struct CollectionContents: Sendable {
    var collection: Collection
    var tracks: [Track]
}

/// A service that publishes charts (KKBOX, Spotify, ...) and the charts of it we can open.
struct ChartSource: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var name: String
    var charts: [Collection]
}
