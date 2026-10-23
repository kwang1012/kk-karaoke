import Foundation

/// The websocket every room talks over. It keeps itself connected: when the connection drops it comes back with a
/// growing wait (capped), joins the room again, and replays the controls pressed while it was down, if recent.
@MainActor
final class RoomSocket {
    enum State: Equatable { case disconnected, connecting, connected }

    var onMessage: ((SocketMessage) -> Void)?
    var onState: ((State) -> Void)?

    private(set) var state: State = .disconnected {
        didSet { if state != oldValue { onState?(state) } }
    }

    /// Controls sent while the socket was down are replayed on reconnect, if they are this recent.
    static let pendingMaxAge: TimeInterval = 10
    static let pendingMax = 20
    private static let keepAlive = Duration.seconds(25)

    private let session: URLSession
    private var url: URL?
    private var join: (room: String, user: User)?
    private var task: URLSessionWebSocketTask?
    private var generation = 0
    private var retry = 0
    private var reconnect: Task<Void, Never>?
    private var pending: [(message: SocketMessage, at: Date)] = []

    init(session: URLSession = .shared) { self.session = session }

    /// Connects to `url` and joins `room` as `user`. Calling it again with a new room moves this socket there.
    func connect(url: URL, room: String, user: User) {
        let sameServer = self.url == url
        self.url = url
        join = (room, user)
        if sameServer, state == .connected {
            send(.join(room: room, user: user)) // a socket is in one room at a time: this moves it
        } else if !sameServer || state == .disconnected {
            open()
        }
    }

    func disconnect() {
        generation += 1
        reconnect?.cancel()
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        join = nil
        url = nil
        pending.removeAll()
        state = .disconnected
    }

    func send(_ message: SocketMessage) {
        if state == .connected, let task {
            Self.transmit(message, on: task)
        } else if message.type == "jam", message.action == "control" {
            pending = Array((pending + [(message, Date())]).suffix(Self.pendingMax))
        }
    }

    // MARK: Connection

    private func open() {
        guard let url else { return }
        generation += 1
        let mine = generation
        reconnect?.cancel()
        task?.cancel(with: .goingAway, reason: nil)
        state = .connecting
        let task = session.webSocketTask(with: url)
        self.task = task
        task.resume()
        Task { [weak self] in
            var failure: Error?
            do {
                try await Self.ping(task)
                guard let self, self.generation == mine else { return }
                self.state = .connected
                self.retry = 0
                if let join = self.join { Self.transmit(.join(room: join.room, user: join.user), on: task) }
                let now = Date()
                let replay = self.pending.filter { now.timeIntervalSince($0.at) <= Self.pendingMaxAge }
                self.pending = []
                for item in replay { Self.transmit(item.message, on: task) }
                let beat = Task { [weak self] in
                    while !Task.isCancelled {
                        try? await Task.sleep(for: Self.keepAlive)
                        if Task.isCancelled || self?.generation != mine { return }
                        try? await Self.ping(task)
                    }
                }
                defer { beat.cancel() }
                while true {
                    let incoming = try await task.receive()
                    guard self.generation == mine else { return }
                    self.handle(incoming)
                }
            } catch { failure = error }
            guard let self, self.generation == mine, failure != nil else { return }
            self.state = .disconnected
            self.scheduleReconnect()
        }
    }

    private func handle(_ incoming: URLSessionWebSocketTask.Message) {
        let data: Data?
        switch incoming {
        case .string(let text): data = text.data(using: .utf8)
        case .data(let bytes): data = bytes
        @unknown default: data = nil
        }
        guard let data, let message = try? JSONDecoder().decode(SocketMessage.self, from: data) else { return }
        onMessage?(message)
    }

    private func scheduleReconnect() {
        let wait = Self.backoff(attempt: retry)
        retry += 1
        reconnect = Task { [weak self] in
            try? await Task.sleep(for: .seconds(wait))
            guard !Task.isCancelled else { return }
            self?.open()
        }
    }

    /// Seconds to wait before attempt number `attempt` (from 0): doubling from one second, capped at thirty, plus up to a second of jitter.
    nonisolated static func backoff(attempt: Int, jitter: Double = Double.random(in: 0..<1)) -> Double {
        min(1 * pow(2, Double(attempt)), 30) + jitter
    }

    nonisolated private static func transmit(_ message: SocketMessage, on task: URLSessionWebSocketTask) {
        guard let data = try? JSONEncoder().encode(message), let text = String(data: data, encoding: .utf8) else { return }
        task.send(.string(text)) { _ in }
    }

    nonisolated private static func ping(_ task: URLSessionWebSocketTask) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            task.sendPing { error in
                if let error { continuation.resume(throwing: error) } else { continuation.resume() }
            }
        }
    }
}
