import Foundation

/// Any JSON value: what the room's websocket messages carry in `data`.
enum JSON: Codable, Hashable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSON])
    case object([String: JSON])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSON].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSON].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }

    subscript(key: String) -> JSON? { if case .object(let o) = self { o[key] } else { nil } }
    var string: String? { if case .string(let v) = self { v } else { nil } }
    var double: Double? { if case .number(let v) = self { v } else { nil } }
    var int: Int? { double.map { Int($0) } }
    var bool: Bool? { if case .bool(let v) = self { v } else { nil } }
    var array: [JSON]? { if case .array(let v) = self { v } else { nil } }

    /// This value as a model, by way of its JSON.
    func decoded<T: Decodable>(_ type: T.Type) -> T? {
        guard let data = try? JSONEncoder().encode(self) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    static func from<T: Encodable>(_ value: T) -> JSON? {
        guard let data = try? JSONEncoder().encode(value) else { return nil }
        return try? JSONDecoder().decode(JSON.self, from: data)
    }
}

/// A person in a room. `avatar` is whatever the web app puts there (a path to one of its bundled pictures).
struct User: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var name: String
    var avatar: String
}

/// One message on the room's websocket, in either direction.
struct SocketMessage: Codable, Sendable, Equatable {
    var type: String
    var action: String?
    var op: String?
    var roomId: String?
    /// An update that must not be throttled away: a new song's length, the result of a control.
    var force: Bool?
    var data: JSON?

    init(type: String, action: String? = nil, op: String? = nil, roomId: String? = nil, force: Bool? = nil, data: JSON? = nil) {
        self.type = type
        self.action = action
        self.op = op
        self.roomId = roomId
        self.force = force
        self.data = data
    }

    static func join(room: String, user: User) -> SocketMessage {
        SocketMessage(type: "join", roomId: room, data: JSON.from(user))
    }

    static func control(_ op: String, room: String, data: JSON? = nil) -> SocketMessage {
        SocketMessage(type: "jam", action: "control", op: op, roomId: room, data: data)
    }

    static func update(room: String, force: Bool = false, _ data: [String: JSON]) -> SocketMessage {
        SocketMessage(type: "jam", action: "update", roomId: room, force: force ? true : nil, data: .object(data))
    }
}

/// What `GET room/{id}` answers: the room as its owner last announced it.
struct RoomInfo: Decodable, Sendable {
    var currentTime: Double = 0
    var playing = false
    var volume: Double = 0.8
    var vocalOn = false
    var guideLevel: Double = 0
    var duration: Double = 0
    var queueIdx: Int?
    var isOn = false
    var participants: [User] = []
    var code: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        currentTime = try c.decodeIfPresent(Double.self, forKey: .currentTime) ?? 0
        playing = try c.decodeIfPresent(Bool.self, forKey: .playing) ?? false
        volume = try c.decodeIfPresent(Double.self, forKey: .volume) ?? 0.8
        vocalOn = try c.decodeIfPresent(Bool.self, forKey: .vocalOn) ?? false
        guideLevel = try c.decodeIfPresent(Double.self, forKey: .guideLevel) ?? 0
        duration = try c.decodeIfPresent(Double.self, forKey: .duration) ?? 0
        queueIdx = try c.decodeIfPresent(Int.self, forKey: .queueIdx)
        isOn = try c.decodeIfPresent(Bool.self, forKey: .isOn) ?? false
        participants = try c.decodeIfPresent([User].self, forKey: .participants) ?? []
        code = try c.decodeIfPresent(String.self, forKey: .code)
    }

    private enum CodingKeys: String, CodingKey {
        case currentTime, playing, volume, vocalOn, guideLevel, duration, queueIdx, isOn, participants, code
    }
}

struct QueueSnapshot: Sendable {
    var tracks: [Track]
    var index: Int
}

enum QueueOrder: String, Sendable {
    case shuffle
    /// Takes turns between the people who added songs.
    case orderers
}

/// Where the processing of a song stands: what the server's `notify` messages and the queue's `status` say.
enum SongStage: Equatable, Sendable {
    case ready
    case working(String, Double?)

    init(status: String?, progress: Double?) {
        switch status {
        case nil, "ready": self = .ready
        case let other?: self = .working(other, progress)
        }
    }
}
