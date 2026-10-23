import Foundation
import Observation

/// The room this Mac is in: its own, where it plays the songs, or another's, where it is a remote control.
/// The queue lives on the server; this keeps a copy, and the websocket says when it changed.
@MainActor
@Observable
final class RoomModel {
    private enum Keys { static let userId = "userId", name = "userName", avatar = "userAvatar" }

    /// The pictures the web app bundles for people to pick from; the server only stores the path.
    static let avatars = ["shiba", "cat", "panda", "bunny", "bear", "owl", "suitcase", "balloon", "plane", "train", "camera",
                          "compass", "lemon", "toast", "egg", "ghost", "dumpling", "potato"].map { "/avatars/\($0).svg" }

    // MARK: Who

    let userId: String
    var name: String { didSet { defaults.set(name, forKey: Keys.name); rejoin() } }
    var avatar: String { didSet { defaults.set(avatar, forKey: Keys.avatar); rejoin() } }
    var user: User { User(id: userId, name: name, avatar: avatar) }

    @ObservationIgnored weak var auth: HostAuth?
    private(set) var isHosting = false
    var isInJam: Bool { isGuest || isHosting }

    // MARK: Where

    /// The room this Mac joined with a code or a link; nil while it is in its own.
    private(set) var joinedRoomId: String?
    var activeRoomId: String { joinedRoomId ?? userId }
    var isGuest: Bool { joinedRoomId != nil && joinedRoomId != userId }

    /// The join code, once the room is open to others.
    private(set) var code: String?
    private(set) var participants: [User] = []
    private(set) var socketState: RoomSocket.State = .disconnected
    /// The server can't be reached: the queue is kept here, so downloaded songs can still be sung.
    private(set) var offline = false
    /// The web address people can open to join, for the QR code.
    private(set) var joinURL: URL?
    private(set) var message: String?

    // MARK: Queue

    private(set) var queue: [Track] = []
    /// Called as songs in the queue move through processing, for notifications; not observed.
    @ObservationIgnored var onSongReady: ((Track) -> Void)?
    @ObservationIgnored var onProcessing: (() -> Void)?
    /// Songs in the queue still being prepared.
    var processingCount: Int {
        queue.filter { if let status = $0.status { return status != "ready" && status != "failed" && status != "error" } else { return false } }.count
    }
    private(set) var queueIdx = -1
    var currentTrack: Track? { queue.indices.contains(queueIdx) ? queue[queueIdx] : nil }
    var upcoming: [Track] { queueIdx + 1 < queue.count ? Array(queue[(queueIdx + 1)...]) : [] }

    /// Whether the next song should start by itself: the last one was playing, or the person asked for play.
    @ObservationIgnored private(set) var wantsPlay = false

    @ObservationIgnored private let socket = RoomSocket()
    @ObservationIgnored private weak var player: PlayerModel?
    @ObservationIgnored private weak var singing: SingingModel?
    @ObservationIgnored private var clientProvider: (@MainActor () -> APIClient?)?
    @ObservationIgnored private var publisher: Task<Void, Never>?
    @ObservationIgnored private var refreshTask: Task<Void, Never>?
    @ObservationIgnored private var controlTasks: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var remotePitch: (hz: Double, at: TimeInterval)?
    @ObservationIgnored private var lastControlAt = Date.distantPast
    @ObservationIgnored private var tick = 0

    /// A pitch heard from a phone is good for this long, and singing counts as going on for this long after it.
    static let remotePitchFresh = 0.3
    static let remoteActive = 2.0

    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let saved = defaults.string(forKey: Keys.userId) { userId = saved } else {
            userId = UUID().uuidString.lowercased()
            defaults.set(userId, forKey: Keys.userId)
        }
        name = defaults.string(forKey: Keys.name) ?? NSFullUserName()
        avatar = defaults.string(forKey: Keys.avatar) ?? Self.avatars[0]
    }

    // MARK: Wiring

    func attach(player: PlayerModel, singing: SingingModel, client: @escaping @MainActor () -> APIClient?) {
        self.player = player
        self.singing = singing
        clientProvider = client
        player.onControl = { [weak self] in self?.playerControl($0) }
        player.onEnded = { [weak self] in self?.songEnded() }
        player.onAudioReady = { [weak self] in self?.preloadNeighbors() }
        socket.onMessage = { [weak self] in self?.handle($0) }
        socket.onState = { [weak self] state in
            self?.socketState = state
            if state == .connected { self?.reconnected() }
        }
    }

    /// Told whether the server answers. Without it the queue lives here; when it is back, the server's queue takes over again.
    func setServerReachable(_ reachable: Bool) {
        guard reachable == offline else { return }
        offline = !reachable
        if offline {
            if isGuest { leave() }
        } else {
            Task { await refreshAll() }
        }
    }

    /// Connects to the server (again, after the address changed) and joins the room.
    func connect() {
        guard let client = clientProvider?(), let url = client.socketURL else { socket.disconnect(); return }
        isHosting = defaults.bool(forKey: "hostedRoom-" + client.baseURL.absoluteString)
        socket.connect(url: url, room: activeRoomId, user: user)
        Task { await refreshAll() }
        startPublishing()
    }

    func disconnect() {
        socket.disconnect()
        publisher?.cancel()
        publisher = nil
    }

    private func rejoin() {
        guard let client = clientProvider?(), let url = client.socketURL else { return }
        socket.connect(url: url, room: activeRoomId, user: user)
    }

    private func reconnected() {
        // control messages sent while the socket was down never reached anyone: learn what the room is now
        Task { await refreshAll() }
    }

    // MARK: Rooms

    /// Opens this Mac's room so others can join with its code.
    func openRoom() async {
        guard let client = clientProvider?() else { return }
        if let auth, !auth.requireSignIn(.host, retry: { [weak self] in Task { await self?.openRoom() } }) { return }
        message = nil
        do {
            code = try await client.createRoom(id: userId)
            isHosting = true
            defaults.set(true, forKey: "hostedRoom-" + client.baseURL.absoluteString)
            joinURL = joinLink(room: userId)
        } catch APIError.status(401, _) {
            if let auth, auth.isEnabled {
                auth.signOut()
                auth.requireSignIn(.host, retry: { [weak self] in Task { await self?.openRoom() } })
            } else {
                message = tr("Sign-in is required. Configure this build with the same public Supabase settings as the web app.")
            }
        } catch { message = error.localizedDescription }
    }

    /// Joins the room behind `code`. False when no room has it.
    @discardableResult
    func join(code: String) async -> Bool {
        guard let client = clientProvider?() else { return false }
        message = nil
        do {
            guard let room = try await client.room(forCode: code) else {
                message = tr("No room has that code.")
                return false
            }
            enter(room: room)
            return true
        } catch {
            message = error.localizedDescription
            return false
        }
    }

    func enter(room: String) {
        guard room != userId else { leave(); return }
        joinedRoomId = room
        code = nil
        joinURL = nil
        wantsPlay = false
        player?.setFollower(true)
        queue = []
        queueIdx = -1
        participants = []
        rejoin()
        Task { await refreshAll() }
    }

    func leaveJam() {
        if isGuest { leave(); return }
        guard isHosting else { return }
        isHosting = false
        code = nil
        joinURL = nil
        if let client = clientProvider?() { defaults.removeObject(forKey: "hostedRoom-" + client.baseURL.absoluteString) }
    }

    func leave() {
        guard joinedRoomId != nil else { return }
        joinedRoomId = nil
        code = nil
        joinURL = nil
        player?.setFollower(false)
        queue = []
        queueIdx = -1
        participants = []
        rejoin()
        Task { await refreshAll() }
    }

    /// The link and QR code that bring someone into `room`: the web app's join page.
    func joinLink(room: String) -> URL? {
        var components = URLComponents(url: AppModel.webApp, resolvingAgainstBaseURL: false)
        components?.path = "/join"
        components?.queryItems = [URLQueryItem(name: "room", value: room)]
        return components?.url
    }

    // MARK: Queue actions

    func addToQueue(_ track: Track) { Task { await add(track, next: false, thenPlay: false) } }
    func playNext(_ track: Track) { Task { await add(track, next: true, thenPlay: false) } }

    /// Puts the song right after the current one and goes to it.
    func playNow(_ track: Track) { Task { await add(track, next: true, thenPlay: true) } }

    private func add(_ track: Track, next: Bool, thenPlay: Bool) async {
        guard let client = clientProvider?() else { return }
        // where the song lands: right after the current one, or at the end
        let landing = next ? (queue.isEmpty ? 0 : queueIdx + 1) : queue.count
        var entry = track
        entry.orderedBy = user
        entry.status = nil
        entry.progress = nil
        message = nil
        if thenPlay, !isGuest { wantsPlay = true } // so the song starts as it loads
        if offline { localAdd(entry, next: next, thenPlay: thenPlay); return }
        do {
            try await client.addToQueue(room: activeRoomId, track: entry, next: next)
            await refreshQueue()
            if thenPlay, !isGuest, queue.indices.contains(landing) {
                wantsPlay = true
                await setIndex(landing, announce: .next)
            } else if currentTrack == nil, !isGuest, !queue.isEmpty {
                await setIndex(0, announce: nil) // the first song is made ready, paused
            }
        } catch APIError.status(403, let detail) {
            if !isGuest, let auth, auth.isEnabled, auth.accessToken == nil {
                auth.requireSignIn(.addSong, retry: { [weak self] in Task { await self?.add(track, next: next, thenPlay: thenPlay) } })
            } else { message = detail ?? tr("That song has to be processed first, and only a host can start that.") }
        } catch APIError.offline {
            offline = true
            localAdd(entry, next: next, thenPlay: thenPlay)
        } catch { message = error.localizedDescription }
    }

    // MARK: The queue without a server

    private func localAdd(_ track: Track, next: Bool, thenPlay: Bool) {
        var entry = track
        entry.timeAdded = Int(Date().timeIntervalSince1970 * 1000)
        entry.status = "ready" // only downloaded songs play offline: whether it can is found out when it loads
        let landing = next ? (queue.isEmpty ? 0 : queueIdx + 1) : queue.count
        queue.insert(entry, at: min(landing, queue.count))
        if queueIdx == -1 { queueIdx = 0 }
        if thenPlay { Task { await setIndex(landing, announce: nil) } } else { queueChanged() }
    }

    func remove(_ track: Track) {
        if offline { queue.removeAll { $0.isSameEntry(as: track) }; preloadNeighbors(); return }
        guard let client = clientProvider?() else { return }
        Task {
            do { try await client.removeFromQueue(room: activeRoomId, track: track) } catch { message = error.localizedDescription }
            await refreshQueue()
        }
    }

    func clear() {
        if offline { queue = Array(queue.prefix(queueIdx + 1)); preloadNeighbors(); return }
        guard let client = clientProvider?() else { return }
        Task {
            do { try await client.clearQueue(room: activeRoomId) } catch { message = error.localizedDescription }
            await refreshQueue()
        }
    }

    /// Moves an upcoming song: `from` and `to` count within `upcoming`.
    func move(from: Int, to: Int) {
        guard let client = clientProvider?(), upcoming.indices.contains(from), from != to else { return }
        let offset = queueIdx + 1
        let id = upcoming[from].id
        // show it at once; the server's message brings the same order
        var local = queue
        let item = local.remove(at: offset + from)
        local.insert(item, at: offset + min(max(0, to), local.count - offset))
        queue = local
        preloadNeighbors()
        if offline { return }
        Task {
            do { try await client.reorderQueue(room: activeRoomId, from: offset + from, to: offset + to, id: id) } catch { message = error.localizedDescription }
            await refreshQueue()
        }
    }

    func arrange(_ mode: QueueOrder) {
        if offline {
            if mode == .shuffle, queueIdx + 1 < queue.count { queue = Array(queue[...queueIdx]) + queue[(queueIdx + 1)...].shuffled() }
            preloadNeighbors()
            return
        }
        guard let client = clientProvider?() else { return }
        Task {
            do { try await client.arrangeQueue(room: activeRoomId, mode: mode) } catch { message = error.localizedDescription }
            await refreshQueue()
        }
    }

    /// Jumps to the upcoming song at `offset` in `upcoming`.
    func skip(to offset: Int) {
        let target = queueIdx + 1 + offset
        guard queue.indices.contains(target) else { return }
        if isGuest { socket.send(.control("next", room: activeRoomId, data: .object(["index": .number(Double(target))]))); return }
        wantsPlay = true
        Task { await setIndex(target, announce: .next) }
    }

    // MARK: Following the queue

    private func refreshAll() async {
        await refreshQueue()
        await refreshInfo()
    }

    func refreshQueue() async {
        guard !offline, let client = clientProvider?() else { return }
        let room = activeRoomId
        guard let snapshot = try? await client.queue(room: room), room == activeRoomId else { return }
        apply(queue: snapshot)
    }

    /// Takes the server's queue as the queue: the songs, and which one is current.
    func apply(queue snapshot: QueueSnapshot) {
        queue = snapshot.tracks
        queueIdx = snapshot.tracks.isEmpty ? -1 : min(max(snapshot.index, -1), snapshot.tracks.count - 1)
        if queueIdx == -1 && !queue.isEmpty && !isGuest { queueIdx = 0 }
        queueChanged()
    }

    func refreshInfo() async {
        guard !offline, let client = clientProvider?() else { return }
        let room = activeRoomId
        guard let info = try? await client.roomInfo(id: room), room == activeRoomId else { return }
        participants = info.participants
        if isInJam {
            code = info.code ?? code
            joinURL = joinLink(room: room)
            guard room == activeRoomId else { return }
        }
        if isGuest {
            if let index = info.queueIdx, index != queueIdx, queue.indices.contains(index) { queueIdx = index; queueChanged() }
            player?.applyRemote(time: info.currentTime, playing: info.playing, duration: info.duration, volume: info.volume,
                                vocalOn: info.vocalOn, guideLevel: info.guideLevel)
        }
    }

    /// The song to play changed: load it here, or show it as what the room is playing.
    private func queueChanged() {
        guard let player, let client = clientProvider?() else { return }
        defer { preloadNeighbors() }
        if isGuest { player.follow(currentTrack, using: client); return }
        guard let target = currentTrack else { if player.track != nil { player.stop() }; return }
        if target.isSameEntry(as: player.track) {
            if target.status == "ready" { player.retryAfterProcessing(trackId: target.id, using: client) }
            if wantsPlay, !player.isPlaying { player.perform(.play, fromRemote: true) } // already loaded, waiting for play
            return
        }
        player.play(target, using: client, autoplay: wantsPlay)
    }

    private func preloadNeighbors() {
        guard let player, let client = clientProvider?() else { return }
        let neighbors = !isGuest && currentTrack != nil
            ? [queueIdx + 1, queueIdx - 1].filter { queue.indices.contains($0) }.map { queue[$0] }
            : []
        player.preload(neighbors, using: client)
    }

    private enum Announce { case next, previous }

    /// Makes `index` the current song on the server and here.
    private func setIndex(_ index: Int, announce: Announce?) async {
        guard let client = clientProvider?(), queue.indices.contains(index) else { return }
        queueIdx = index
        queueChanged()
        if offline { return }
        socketSend(.control(announce == .previous ? "previous" : "next", room: activeRoomId), if: announce != nil)
        try? await client.setQueueIndex(room: activeRoomId, index: index)
        publish(force: true, full: true)
    }

    private func socketSend(_ message: SocketMessage, if condition: Bool) { if condition { socket.send(message) } }

    private func goNext() async {
        guard queueIdx + 1 < queue.count else { player?.perform(.pause, fromRemote: true); wantsPlay = false; publish(force: true, full: true); return }
        await setIndex(queueIdx + 1, announce: .next)
    }

    private func goPrevious() async {
        // a few seconds in, "previous" starts the song again, as every player does
        if let player, player.currentTime > 3 || queueIdx <= 0 { player.perform(.seek(0), fromRemote: true); publish(force: true, full: true); return }
        await setIndex(queueIdx - 1, announce: .previous)
    }

    private func songEnded() {
        guard !isGuest else { return }
        wantsPlay = true
        Task { await goNext() }
    }

    // MARK: Controls from this Mac's player

    private func playerControl(_ control: PlayerModel.Control) {
        lastControlAt = Date()
        if isGuest {
            sendToOwner(control)
            return
        }
        switch control {
        case .play: wantsPlay = true; socket.send(.control("play", room: activeRoomId))
        case .pause: wantsPlay = false; socket.send(.control("pause", room: activeRoomId))
        case .next: wantsPlay = player?.isPlaying ?? wantsPlay; Task { await goNext() }
        case .previous: Task { await goPrevious() }
        case .volume, .guideLevel: sendToOwnerOrRoom(control); return // sliders: sent (and published) once they settle
        case .seek, .toggleVocal: sendToOwnerOrRoom(control)
        }
        publish(force: true, full: true)
    }

    /// An owner tells its guests what it did, in the web app's words.
    private func sendToOwnerOrRoom(_ control: PlayerModel.Control) {
        switch control {
        case .seek(let time): socket.send(.control("seek", room: activeRoomId, data: .object(["seekTime": .number(time)])))
        case .volume(let value):
            debounced("volume") {
                self.socket.send(.control("setVolume", room: self.activeRoomId, data: .object(["volume": .number(value)])))
                self.publish(force: true, full: true)
            }
        case .guideLevel(let level):
            debounced("guide") {
                self.socket.send(.control("setGuideLevel", room: self.activeRoomId, data: .object(["level": .number(level)])))
                self.publish(force: true, full: true)
            }
        case .toggleVocal: socket.send(.control("toggleVocal", room: activeRoomId))
        default: break
        }
    }

    private func sendToOwner(_ control: PlayerModel.Control) {
        switch control {
        case .play: socket.send(.control("play", room: activeRoomId))
        case .pause: socket.send(.control("pause", room: activeRoomId))
        case .next: socket.send(.control("next", room: activeRoomId))
        case .previous: socket.send(.control("previous", room: activeRoomId))
        default: sendToOwnerOrRoom(control)
        }
    }

    /// Sliders send many values a second; only the last one matters.
    private func debounced(_ kind: String, _ send: @escaping @MainActor () -> Void) {
        controlTasks[kind]?.cancel()
        controlTasks[kind] = Task {
            try? await Task.sleep(for: .milliseconds(120))
            if !Task.isCancelled { send() }
        }
    }

    // MARK: Messages

    private func handle(_ message: SocketMessage) {
        switch message.type {
        case "jam": handleJam(message)
        case "queue": scheduleQueueRefresh()
        case "notify": handleNotify(message)
        default: break
        }
    }

    private func scheduleQueueRefresh() {
        refreshTask?.cancel()
        refreshTask = Task {
            try? await Task.sleep(for: .milliseconds(150))
            if !Task.isCancelled { await refreshQueue() }
        }
    }

    private func handleNotify(_ message: SocketMessage) {
        guard let data = message.data, let id = data["track"]?["id"]?.string, let status = data["status"]?.string else { return }
        let progress = data["total"]?.double.flatMap { $0 > 0 ? (data["value"]?.double ?? 0) / $0 : nil }
        for index in queue.indices where queue[index].id == id {
            let before = queue[index].status
            queue[index].status = status
            queue[index].progress = status == "ready" ? nil : progress
            if status != "ready", status != "failed", status != "error" { onProcessing?() }
            if status == "ready", before != nil, before != "ready" { onSongReady?(queue[index]) }
        }
        if status == "ready" {
            APIClient.invalidateLibrary()
            if let client = clientProvider?() { player?.retryAfterProcessing(trackId: id, using: client) }
            scheduleQueueRefresh()
        }
        preloadNeighbors()
    }

    private func handleJam(_ message: SocketMessage) {
        guard message.roomId == nil || message.roomId == activeRoomId else { return }
        let data = message.data
        switch message.action {
        case "joined", "left": Task { await refreshInfo() }
        case "pitch":
            if let hz = data?["hz"]?.double, hz > 0 {
                remotePitch = (hz, ProcessInfo.processInfo.systemUptime)
                singing?.wake()
            }
        case "update": if isGuest { applyUpdate(data) }
        case "control": if !isGuest { runControl(message.op, data) }
        default: break
        }
    }

    // MARK: A guest follows the owner

    private func applyUpdate(_ data: JSON?) {
        guard let data, let player else { return }
        // right after this Mac's own control, the owner's state is older than what the person just did
        let settled = Date().timeIntervalSince(lastControlAt) > 1.5
        player.applyRemote(time: data["currentTime"]?.double, playing: data["playing"]?.bool, duration: data["duration"]?.double,
                           volume: settled ? data["volume"]?.double : nil, vocalOn: settled ? data["vocalOn"]?.bool : nil,
                           guideLevel: settled ? data["guideLevel"]?.double : nil)
        if settled, let index = data["queueIdx"]?.int, index != queueIdx {
            if queue.indices.contains(index) { queueIdx = index; queueChanged() } else { scheduleQueueRefresh() }
        }
    }

    // MARK: The owner obeys its guests

    private func runControl(_ op: String?, _ data: JSON?) {
        guard let player else { return }
        switch op {
        case "play": wantsPlay = true; player.perform(.play, fromRemote: true)
        case "pause": wantsPlay = false; player.perform(.pause, fromRemote: true)
        case "next":
            if let index = data?["index"]?.int, queue.indices.contains(index) { wantsPlay = true; Task { await setIndex(index, announce: .next) } }
            else { wantsPlay = player.isPlaying || wantsPlay; Task { await goNext() } }
            return
        case "previous": Task { await goPrevious() }; return
        case "seek":
            guard let time = data?["seekTime"]?.double else { return }
            player.perform(.seek(time), fromRemote: true)
            publish(force: true, full: true, extra: ["seekRequestId": data?["seekRequestId"] ?? .null])
            return
        case "toggleVocal": player.perform(.toggleVocal, fromRemote: true)
        case "setGuideLevel": if let level = data?["level"]?.double { player.perform(.guideLevel(level), fromRemote: true) }
        case "setVolume": if let volume = data?["volume"]?.double { player.perform(.volume(volume), fromRemote: true) }
        case "increaseVolume": player.perform(.volume(player.masterVolume + 0.1), fromRemote: true)
        case "decreaseVolume": player.perform(.volume(player.masterVolume - 0.1), fromRemote: true)
        case "setShowMelody": if let value = data?["value"]?.bool { singing?.showMelody = value }
        // The lyrics screen reads this same key (@AppStorage), so it switches between video and lyrics at once.
        case "setShowVideo": if let value = data?["value"]?.bool { UserDefaults.standard.set(value, forKey: "showVideo") }
        default: return
        }
        publish(force: true, full: true)
    }

    // MARK: The owner announces itself

    private func startPublishing() {
        guard publisher == nil else { return }
        publisher = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(200))
                guard let self else { return }
                self.tick += 1
                guard !self.isGuest, self.socketState == .connected, self.player?.isPlaying == true else { continue }
                if self.tick % 5 == 0 { self.publish(force: false, full: self.tick % 25 == 0) } // each second, the whole state every five
            }
        }
    }

    /// Tells everyone in the room how things stand: the time and whether it plays, and (`full`) everything a remote shows.
    private func publish(force: Bool, full: Bool, extra: [String: JSON] = [:]) {
        guard !isGuest, let player, socketState == .connected else { return }
        var data: [String: JSON] = ["currentTime": .number(player.currentTime), "playing": .bool(player.isPlaying)]
        if full {
            data["queueIdx"] = .number(Double(queueIdx))
            data["volume"] = .number(player.masterVolume)
            data["vocalOn"] = .bool(player.vocalOn)
            data["guideLevel"] = .number(player.vocalVolume)
            data["showVideo"] = .bool(UserDefaults.standard.bool(forKey: "showVideo"))
            data["showMelody"] = .bool(singing?.showMelody ?? false)
            data["semitone"] = .number(0)
            data["duration"] = .number(player.duration)
            data["pitchShift"] = .bool(false) // the key cannot be changed on a Mac yet
        }
        for (key, value) in extra { data[key] = value }
        socket.send(.update(room: activeRoomId, force: force, data))
    }

    // MARK: Singing into a phone

    /// What a phone in the room hears the singer sing right now (Hz), or nil.
    func remotePitchHz(now: TimeInterval = ProcessInfo.processInfo.systemUptime) -> Double? {
        guard let remotePitch, now - remotePitch.at <= Self.remotePitchFresh else { return nil }
        return remotePitch.hz
    }

    /// Whether somebody is singing into a phone at the moment, even between notes.
    func remoteSingingActive(now: TimeInterval = ProcessInfo.processInfo.systemUptime) -> Bool {
        guard let remotePitch else { return false }
        return now - remotePitch.at <= Self.remoteActive
    }

    /// A guest sends what its own microphone hears to the room's owner, who draws and scores it.
    func sendPitch(hz: Double) {
        guard isGuest else { return }
        socket.send(SocketMessage(type: "jam", action: "pitch", roomId: activeRoomId, data: .object(["hz": .number((hz * 10).rounded() / 10)])))
    }
}

extension RoomModel {
    /// For tests: feed a message as if it came over the socket.
    func receive(_ message: SocketMessage) { handle(message) }
}
