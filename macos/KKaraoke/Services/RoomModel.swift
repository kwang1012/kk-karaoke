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

    /// Random per Mac, used while signed out. A signed-in host's room is their account id instead, so every device they
    /// sign in on shares one queue and jam.
    let deviceId: String
    var userId: String { auth?.session?.user.id ?? deviceId }
    var name: String { didSet { defaults.set(name, forKey: Keys.name); rejoin() } }
    var avatar: String { didSet { defaults.set(avatar, forKey: Keys.avatar); rejoin() } }
    var user: User { User(id: userId, name: name, avatar: avatar) }

    @ObservationIgnored weak var auth: HostAuth? {
        didSet { auth?.onAccountChange = { [weak self] old, new in self?.accountChanged(from: old ?? self?.deviceId, to: new ?? self?.deviceId) } }
    }
    private(set) var isHosting = false

    /// Which of this person's devices plays the room's audio: the server says. A device that does not is a remote, like a
    /// guest: it shows the same queue, lyrics and position, and its controls go to the one that plays.
    private(set) var playerKnown = false
    private(set) var activePlayer: String?
    /// A screen that exists to play (the TV window) takes the room instead of waiting for nobody to be playing.
    var preferThisDevice = false
    var isPlayerDevice: Bool { !playerKnown || activePlayer == deviceId }
    var isFollowing: Bool { isGuest || !isPlayerDevice }
    var nobodyPlays: Bool { !isGuest && playerKnown && activePlayer == nil }
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
    /// Where in the song to start once its audio is ready, when this Mac took over from another device.
    @ObservationIgnored private var resumeAt: TimeInterval?
    /// Where this Mac's clock stands against the server's, learned from pings; a duet starts on the server's clock.
    @ObservationIgnored private(set) var clock = ClockSync()
    @ObservationIgnored private var clockPings: [String: Double] = [:]
    @ObservationIgnored private var clockSeq = 0
    @ObservationIgnored private var clockTask: Task<Void, Never>?
    /// The duet this Mac is singing in. While it lasts the room's own player is silent: every device plays the song.
    private(set) var duet: DuetStart?
    /// The last duet this Mac left: the room remembers a finished duet, and it must not be joined again.
    @ObservationIgnored private var endedDuet: DuetStart?

    /// Set by whatever else decides what plays next (Spotify). Asked, with the song waiting after this one, when a song
    /// ends or this Mac skips; true means it has taken that decision, and the queue stays where it is.
    @ObservationIgnored var nextOverride: ((Track?) -> Bool)?

    /// A pitch heard from a phone is good for this long, and singing counts as going on for this long after it.
    static let remotePitchFresh = 0.3
    static let remoteActive = 2.0

    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let saved = defaults.string(forKey: Keys.userId) { deviceId = saved } else {
            deviceId = UUID().uuidString.lowercased()
            defaults.set(deviceId, forKey: Keys.userId)
        }
        name = defaults.string(forKey: Keys.name) ?? NSFullUserName()
        avatar = defaults.string(forKey: Keys.avatar) ?? Self.avatars[0]
        socket.deviceId = deviceId
        socket.afterJoin = { [weak self] room in
            guard let self, room == self.userId else { return nil }
            return .player(room: room, deviceId: self.deviceId, ifFree: !self.preferThisDevice)
        }
    }

    // MARK: Wiring

    func attach(player: PlayerModel, singing: SingingModel, client: @escaping @MainActor () -> APIClient?) {
        self.player = player
        self.singing = singing
        clientProvider = client
        player.onControl = { [weak self] in self?.playerControl($0) }
        player.onEnded = { [weak self] in self?.songEnded() }
        player.onAudioReady = { [weak self] in
            self?.preloadNeighbors()
            if let self, let time = self.resumeAt, !self.isFollowing { self.player?.perform(.seek(time), fromRemote: true) }
            self?.resumeAt = nil
        }
        socket.onMessage = { [weak self] in self?.handle($0) }
        socket.onState = { [weak self] state in
            self?.socketState = state
            if state == .connected { self?.reconnected(); self?.startClockPings() }
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
        clockTask?.cancel()
        clockTask = nil
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

    /// Signing in or out changes whose room this Mac is in. Signing in brings the old room's queue along (the server
    /// moves it only if this account opened it); a room joined with a code is kept, under the new identity.
    func accountChanged(from old: String?, to new: String?) {
        guard let old, let new, old != new else { return }
        if isGuest { rejoin(); return }
        let wasHosting = isHosting
        queue = []
        queueIdx = -1
        participants = []
        code = nil
        joinURL = nil
        isHosting = false
        if let client = clientProvider?() { defaults.removeObject(forKey: "hostedRoom-" + client.baseURL.absoluteString) }
        forgetPlayer()
        player?.setFollower(false)
        rejoin()
        Task {
            if old == deviceId, let client = clientProvider?() {
                _ = try? await client.migrateRoom(from: old)
                await Self.carryQueue(from: old, to: new, client: client)
            }
            if wasHosting { await openRoom() }
            await refreshAll()
        }
    }

    /// The songs people ordered, in order, and where the current one lands once the suggestions are left out.
    static func carried(_ snapshot: QueueSnapshot) -> (tracks: [Track], index: Int) {
        let own = snapshot.tracks.filter { !$0.recommended }
        let before = snapshot.tracks.prefix(max(snapshot.index, 0) + 1).filter { !$0.recommended }.count
        return (own, max(before - 1, 0))
    }

    /// The server moves a room only if the account opened it as a jam; otherwise this Mac re-adds its own songs, once,
    /// into an account room that has none.
    private static func carryQueue(from old: String, to new: String, client: APIClient) async {
        guard let mine = try? await client.queue(room: new), mine.tracks.isEmpty,
              let previous = try? await client.queue(room: old) else { return }
        let (tracks, index) = carried(previous)
        guard !tracks.isEmpty else { return }
        for track in tracks { try? await client.addToQueue(room: new, track: track, next: false) }
        if index > 0 { try? await client.setQueueIndex(room: new, index: index) }
    }

    private func forgetPlayer() {
        playerKnown = false
        activePlayer = nil
    }

    /// Asks the server to make this Mac the device that plays. The answer (to everyone in the room) is `applyPlayer`.
    func playHere() {
        guard !isGuest else { return }
        socket.send(.player(room: activeRoomId, deviceId: deviceId, ifFree: false))
    }

    /// The server says which device plays. This Mac stops and follows when it is not the one, and takes over when it is.
    private func applyPlayer(_ id: String?) {
        // The server frees the player when this Mac's old socket closes, and says so right after the new one joins,
        // before the claim that follows it lands. Dropping to follower for that moment would stop the song and reload it
        // from the start: keep playing, and ask for the claim again (it only takes the room while nobody has it).
        if id == nil, !isGuest, !isFollowing {
            socket.send(.player(room: activeRoomId, deviceId: deviceId, ifFree: true))
            return
        }
        let wasFollowing = isFollowing
        let state = (time: player?.currentTime ?? 0, playing: player?.isPlaying ?? false)
        playerKnown = true
        activePlayer = id
        guard wasFollowing != isFollowing, !isGuest else { return }
        if isFollowing {
            wantsPlay = false
        } else {
            // picks up where the other device was
            wantsPlay = state.playing
            resumeAt = state.time > 1 ? state.time : nil
        }
        player?.setFollower(isFollowing)
        Task { await refreshAll() }
    }

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
        forgetPlayer()
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
        forgetPlayer()
        player?.setFollower(isFollowing)
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
        // the first song into an empty queue starts by itself
        let wasEmpty = queue.isEmpty
        // where the song lands: right after the current one, or at the end
        let landing = next ? (queue.isEmpty ? 0 : queueIdx + 1) : queue.count
        var entry = track
        entry.orderedBy = user
        entry.status = nil
        entry.progress = nil
        message = nil
        if (thenPlay || wasEmpty), !isFollowing { wantsPlay = true } // so the song starts as it loads
        if offline { localAdd(entry, next: next, thenPlay: thenPlay); return }
        do {
            try await client.addToQueue(room: activeRoomId, track: entry, next: next)
            await refreshQueue()
            if thenPlay, !isFollowing, queue.indices.contains(landing) {
                wantsPlay = true
                await setIndex(landing, announce: .next)
            } else if currentTrack == nil, !isFollowing, !queue.isEmpty {
                await setIndex(0, announce: nil) // the first song is made ready, paused
            } else if wasEmpty, isFollowing, !queue.isEmpty {
                socket.send(.control("play", room: activeRoomId)) // the room's player starts it
            }
        } catch APIError.status(403, let detail) {
            if wasEmpty, !thenPlay { wantsPlay = false } // the song is not on its way
            if !isGuest, let auth, auth.isEnabled, auth.accessToken == nil {
                auth.requireSignIn(.addSong, retry: { [weak self] in Task { await self?.add(track, next: next, thenPlay: thenPlay) } })
            } else { message = detail ?? tr("That song has to be processed first, and only a host can start that.") }
        } catch APIError.offline {
            offline = true
            localAdd(entry, next: next, thenPlay: thenPlay)
        } catch {
            if wasEmpty, !thenPlay { wantsPlay = false }
            message = error.localizedDescription
        }
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
        if isFollowing { socket.send(.control("next", room: activeRoomId, data: .object(["index": .number(Double(target))]))); return }
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
        if queueIdx == -1 && !queue.isEmpty && !isFollowing { queueIdx = 0 }
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
        if let started = info.duet, duet == nil, started != endedDuet { join(duet: started) } // joining a room mid-duet
        // a duet that ended while this Mac was away (its stop never arrived) would leave every control ignored
        else if info.duet == nil, duet != nil { endDuet() }
        if isFollowing, duet == nil {
            if let index = info.queueIdx, index != queueIdx, queue.indices.contains(index) { queueIdx = index; queueChanged() }
            player?.applyRemote(time: info.currentTime, playing: info.playing, duration: info.duration, volume: info.volume,
                                vocalOn: info.vocalOn, guideLevel: info.guideLevel)
        }
    }

    /// The song to play changed: load it here, or show it as what the room is playing.
    private func queueChanged() {
        guard let player, let client = clientProvider?() else { return }
        defer { preloadNeighbors() }
        if duet != nil { return } // the duet's song stays until it ends
        if isFollowing { player.follow(currentTrack, using: client); return }
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
        let neighbors = !isFollowing && currentTrack != nil
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
        // the target index travels with it: a device that hears it lands on that song instead of stepping one more
        socketSend(.control(announce == .previous ? "previous" : "next", room: activeRoomId, data: .object(["index": .number(Double(index))])), if: announce != nil)
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
        if duet != nil { endDuet(); return } // a duet is one song; the queue stays where it was
        guard !isFollowing else { return }
        wantsPlay = true
        if nextOverride?(upcoming.first) == true { return }
        Task { await goNext() }
    }

    // MARK: Singing together

    /// Asks the room to start the current song for everyone at once. The server names the start, so every device
    /// (this one too) hears the answer and starts together.
    func startDuet() {
        guard let track = currentTrack, duet == nil else { return }
        socket.send(.duetStart(room: activeRoomId, trackId: track.id))
    }

    func stopDuet() { socket.send(.duetStop(room: activeRoomId)) }

    private func applyDuet(_ message: SocketMessage) {
        if message.op == "stop" { endDuet(); return }
        guard let start = DuetStart(message: message.data) else { return }
        join(duet: start)
    }

    /// Plays the duet's song here, on the shared start.
    private func join(duet start: DuetStart) {
        duet = start
        wantsPlay = false
        Task {
            var track = queue.first { $0.id == start.trackId }
            if track == nil { await refreshQueue(); track = queue.first { $0.id == start.trackId } }
            guard duet == start, let player, let client = clientProvider?(), let track else { endDuet(); return }
            // the room remembers a duet after it ends: do not download a song just to find it is over
            let position = start.position(atServerMs: clock.serverMs(forLocal: ClockSync.nowMs))
            if let length = track.durationMs, position >= Double(length) / 1000 { endDuet(); return }
            player.playDuet(track, start, clock: clock, using: client)
        }
    }

    /// Back to the room's own player, which shows or plays whatever the room is on.
    private func endDuet() {
        guard let started = duet else { return }
        endedDuet = started
        duet = nil
        player?.endDuet()
        player?.setFollower(isFollowing)
        Task { await refreshAll() }
    }

    private func startClockPings() {
        clockTask?.cancel()
        clockPings.removeAll()
        clockTask = Task { [weak self] in
            for _ in 0..<6 { // a burst right after connecting, for a good estimate quickly
                self?.sendClockPing()
                try? await Task.sleep(for: .milliseconds(150))
            }
            while !Task.isCancelled { // then now and then, to follow drift
                try? await Task.sleep(for: .seconds(15))
                if Task.isCancelled { return }
                self?.sendClockPing()
            }
        }
    }

    private func sendClockPing() {
        guard socketState == .connected else { return }
        clockSeq += 1
        let id = String(clockSeq)
        clockPings[id] = ClockSync.nowMs
        socket.send(.clockPing(id: id))
    }

    private func handleClock(_ message: SocketMessage) {
        guard let id = message.id, let sent = clockPings.removeValue(forKey: id), let serverTime = message.serverTime else { return }
        clock.add(ClockSync.sample(sentAt: sent, serverTime: serverTime, receivedAt: ClockSync.nowMs))
    }

    // MARK: Controls from this Mac's player

    private func playerControl(_ control: PlayerModel.Control) {
        lastControlAt = Date()
        if isFollowing {
            sendToOwner(control)
            return
        }
        switch control {
        case .play: wantsPlay = true; socket.send(.control("play", room: activeRoomId))
        case .pause: wantsPlay = false; socket.send(.control("pause", room: activeRoomId))
        case .next:
            if nextOverride?(upcoming.first) == true { wantsPlay = true; break }
            wantsPlay = player?.isPlaying ?? wantsPlay; Task { await goNext() }
        case .previous: Task { await goPrevious() }
        case .volume, .guideLevel: sendToOwnerOrRoom(control); return // sliders: sent (and published) once they settle
        case .seek, .toggleVocal, .increaseSemitone, .decreaseSemitone: sendToOwnerOrRoom(control)
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
        case .increaseSemitone: socket.send(.control("increaseSemitone", room: activeRoomId))
        case .decreaseSemitone: socket.send(.control("decreaseSemitone", room: activeRoomId))
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
        case "clock": handleClock(message)
        case "queue":
            // the first song into an empty queue starts by itself, on the screen that plays
            if message.data?["autoplay"]?.bool == true, !isFollowing { wantsPlay = true }
            scheduleQueueRefresh()
        case "notify": handleNotify(message)
        case "lyrics": // someone nudged this song's sync: the server says so to every device
            if message.data?["action"]?.string == "delay", let id = message.data?["trackId"]?.string, let delay = message.data?["delay"]?.double {
                player?.applySharedDelay(delay, trackId: id)
            }
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
        case "update": if isFollowing, duet == nil { applyUpdate(data) } // in a duet this device follows the shared clock
        case "control": if !isFollowing, duet == nil { runControl(message.op, data) }
        case "player": applyPlayer(data?["deviceId"]?.string)
        case "duet": applyDuet(message)
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
                           guideLevel: settled ? data["guideLevel"]?.double : nil,
                           semitone: settled ? data["semitone"]?.double.map { Int($0.rounded()) } : nil)
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
        case "increaseSemitone": player.perform(.increaseSemitone, fromRemote: true)
        case "decreaseSemitone": player.perform(.decreaseSemitone, fromRemote: true)
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
                guard !self.isFollowing, self.socketState == .connected, self.player?.isPlaying == true else { continue }
                if self.tick % 5 == 0 { self.publish(force: false, full: self.tick % 25 == 0) } // each second, the whole state every five
            }
        }
    }

    /// Tells everyone in the room how things stand: the time and whether it plays, and (`full`) everything a remote shows.
    private func publish(force: Bool, full: Bool, extra: [String: JSON] = [:]) {
        guard !isFollowing, duet == nil, let player, socketState == .connected else { return }
        var data: [String: JSON] = ["currentTime": .number(player.currentTime), "playing": .bool(player.isPlaying)]
        if full {
            data["queueIdx"] = .number(Double(queueIdx))
            data["volume"] = .number(player.masterVolume)
            data["vocalOn"] = .bool(player.vocalOn)
            data["guideLevel"] = .number(player.vocalVolume)
            data["showVideo"] = .bool(UserDefaults.standard.bool(forKey: "showVideo"))
            data["showMelody"] = .bool(singing?.showMelody ?? false)
            data["semitone"] = .number(Double(player.semitone))
            data["duration"] = .number(player.duration)
            data["pitchShift"] = .bool(true)
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
        guard isFollowing else { return }
        socket.send(SocketMessage(type: "jam", action: "pitch", roomId: activeRoomId, data: .object(["hz": .number((hz * 10).rounded() / 10)])))
    }
}

extension RoomModel {
    /// For tests: feed a message as if it came over the socket.
    func receive(_ message: SocketMessage) { handle(message) }
}
