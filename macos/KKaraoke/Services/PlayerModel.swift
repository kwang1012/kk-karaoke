import Foundation
import Observation

/// What is playing, and the controls over it. The song position is not observed: it moves every frame, so views
/// that show it read `currentTime` inside a `TimelineView`.
@MainActor
@Observable
final class PlayerModel {
    enum Status: Equatable {
        case idle
        /// Fetching the stems; the fraction is nil until the size is known.
        case loading(Double?)
        case ready
        case failed(String)
    }

    private(set) var track: Track?
    private(set) var status: Status = .idle
    private(set) var isPlaying = false
    private(set) var duration: TimeInterval = 0
    /// Bumps when the position jumps, so a screen that is not ticking (paused) still moves to the new place.
    private(set) var seekCount = 0
    private(set) var lyrics: LyricsState = .none
    /// The server's shared per-track offset: seconds added to every line time.
    private(set) var trackDelay: Double = 0
    private(set) var confidence: String?

    /// The level of the original singer over the instrumental (0 is a karaoke track). The room calls it the guide level.
    var vocalVolume: Double {
        didSet {
            applyVolumes()
            guard !applyingRemote else { return }
            UserDefaults.standard.set(vocalVolume, forKey: Keys.vocal)
            onControl?(.guideLevel(vocalVolume))
        }
    }
    var instrumentalVolume: Double { didSet { applyVolumes(); UserDefaults.standard.set(instrumentalVolume, forKey: Keys.instrumental) } }
    /// Both stems' level, the room's volume.
    var masterVolume: Double = 1 {
        didSet { applyVolumes(); if !applyingRemote { onControl?(.volume(masterVolume)) } }
    }
    /// The original singer at full level, whatever the guide level says.
    var vocalOn = false { didSet { applyVolumes() } }
    /// The key change in semitones (-12...12), for the song and the melody that follows it.
    private(set) var semitone = 0 { didSet { stems.setSemitone(semitone) } }
    static let semitoneRange = -12...12
    /// Seconds the lyrics show before the singing, for this Mac's speakers and screen. Not shared with other devices.
    var lyricsLead: Double { didSet { UserDefaults.standard.set(lyricsLead, forKey: Keys.lead) } }

    private enum Keys {
        static let vocal = "vocalVolume", instrumental = "instrumentalVolume", lead = "lyricsLead"
    }

    /// Told when the song changes, so what follows the song (the melody) can follow.
    var onTrackChange: (() -> Void)?
    /// The current audio is ready; adjacent songs can now download without delaying it.
    var onAudioReady: (() -> Void)?
    /// Told of everything done to the player: the room passes it on (a guest's controls go to the room's owner).
    var onControl: ((Control) -> Void)?
    /// The song played to its end.
    var onEnded: (() -> Void)?

    /// What can be done to a player, here or from another device in the room.
    enum Control: Equatable, Sendable {
        case play, pause, next, previous
        case seek(Double)
        case volume(Double)
        case toggleVocal
        case guideLevel(Double)
        case increaseSemitone, decreaseSemitone
    }

    /// Following another device's room: nothing plays here, and the time and state come from the room.
    private(set) var isFollower = false
    private var remoteClock: (time: TimeInterval, at: TimeInterval) = (0, 0)
    private var applyingRemote = false
    /// Start by itself when the stems have arrived: set by play, and by a play pressed while they are still coming.
    private var autoplayWhenReady = false
    private var waitingForProcessing = false
    private var processingFinishedDuringLoad = false

    private let stems = StemPlayer()
    /// A TV or speaker the song plays on instead of this Mac. While it is on, the stems still run here, silently,
    /// as the clock the lyrics and the score follow; they wait for the device so the two stay together.
    let cast = CastOutput()
    private var castLevel = -1
    private var castReload: Task<Void, Never>?
    private var loadTask: Task<Void, Never>?
    private var delayTask: Task<Void, Never>?
    private var client: APIClient?
    private let cache: StemCache
    private var preloads: [String: Task<LyricsResponse?, Never>] = [:]

    init(cache: StemCache = .shared) {
        self.cache = cache
        let defaults = UserDefaults.standard
        vocalVolume = defaults.object(forKey: Keys.vocal) as? Double ?? 0
        instrumentalVolume = defaults.object(forKey: Keys.instrumental) as? Double ?? 1
        lyricsLead = defaults.object(forKey: Keys.lead) as? Double ?? 0
        cast.onReady = { [weak self] in self?.pushToCast() }
        cast.onPlayerState = { [weak self] state, time, _ in self?.castReported(state, time) }
        cast.onClosed = { [weak self] in self?.castClosed() }
        stems.onFinish = { [weak self] in
            self?.isPlaying = false
            self?.onEnded?()
        }
    }

    /// Where the lyrics are, relative to the audio: the song's own offset and the lead before the singing.
    var lyricsDelay: Double { trackDelay - lyricsLead }

    /// The song position now.
    var currentTime: TimeInterval {
        guard isFollower else { return stems.currentTime }
        let elapsed = isPlaying ? ProcessInfo.processInfo.systemUptime - remoteClock.at : 0
        let time = remoteClock.time + elapsed
        return duration > 0 ? min(time, duration) : time
    }

    /// How many seconds earlier than the audio the lyrics show; what the offset stepper changes.
    var ahead: Double { -trackDelay }

    // MARK: Controls

    /// Loads `track` and, with `autoplay`, starts it.
    func play(_ track: Track, using client: APIClient?, autoplay: Bool = true) {
        guard let client else { status = .failed(tr("The server address is not valid.")); return }
        setFollower(false)
        if track.isSameEntry(as: self.track), case .ready = status {
            if autoplay && !isPlaying { perform(.play) }
            return
        }
        loadTask?.cancel()
        let prefetched = preloads.removeValue(forKey: track.id)
        cancelPreloads()
        stems.stop()
        self.client = client
        self.track = track
        isPlaying = false
        duration = 0
        trackDelay = 0
        confidence = nil
        lyrics = .loading
        status = .loading(nil)
        waitingForProcessing = false
        processingFinishedDuringLoad = false
        onTrackChange?()
        autoplayWhenReady = autoplay
        loadTask = Task { await load(track, client, prefetched: prefetched) }
    }

    func toggle() { perform(isPlaying ? .pause : .play) }

    func seek(to time: TimeInterval) { perform(.seek(time)) }

    /// Does `control` here, or (following a room) asks the room's owner to. Nothing is passed on when it came from the room.
    func perform(_ control: Control, fromRemote: Bool = false) {
        if isFollower && !fromRemote { onControl?(control); return }
        switch control {
        case .play: resume()
        case .pause: halt()
        case .seek(let time): jump(to: time)
        case .volume(let value): applyingRemote = fromRemote; masterVolume = min(1, max(0, value)); applyingRemote = false
        case .toggleVocal: vocalOn.toggle()
        case .guideLevel(let level): applyingRemote = fromRemote; vocalVolume = min(1, max(0, level)); applyingRemote = false
        case .increaseSemitone: setSemitone(semitone + 1)
        case .decreaseSemitone: setSemitone(semitone - 1)
        case .next, .previous: break // the queue decides
        }
        if !fromRemote { onControl?(control) }
    }

    /// Sets the key here; a follower only mirrors the room's, which changes on the owner's word.
    func setSemitone(_ value: Int) {
        semitone = min(Self.semitoneRange.upperBound, max(Self.semitoneRange.lowerBound, value))
    }

    private func resume() {
        if waitingForProcessing { autoplayWhenReady = true; return }
        if case .loading = status { autoplayWhenReady = true; return } // starts as soon as it has arrived
        guard case .ready = status, !isPlaying else { return }
        if cast.isActive { isPlaying = true; cast.play(); return } // this Mac starts when the device does
        do { try stems.play(); isPlaying = true } catch { status = .failed(error.localizedDescription) }
    }

    private func halt() {
        autoplayWhenReady = false
        guard isPlaying else { return }
        stems.pause()
        if cast.isActive { cast.pause() }
        isPlaying = false
    }

    private func jump(to time: TimeInterval) {
        guard case .ready = status else { return }
        do { try stems.seek(to: time) } catch { status = .failed(error.localizedDescription) }
        if cast.isActive { cast.seek(to: time) }
        seekCount += 1
    }

    // MARK: Following a room

    /// Turns following on or off. Following has no audio of its own.
    func setFollower(_ on: Bool) {
        guard on != isFollower else { return }
        isFollower = on
        waitingForProcessing = false
        processingFinishedDuringLoad = false
        cancelPreloads()
        loadTask?.cancel()
        stems.stop()
        isPlaying = false
        track = nil
        status = .idle
        lyrics = .none
        trackDelay = 0
        duration = 0
        onTrackChange?()
    }

    /// Shows `track` (nil for none) as what the room is playing: its lyrics, with the time from `applyRemote`.
    func follow(_ track: Track?, using client: APIClient?) {
        guard isFollower else { return }
        if track?.isSameEntry(as: self.track) == true { return }
        loadTask?.cancel()
        self.track = track
        self.client = client
        guard let track, let client else { status = .idle; lyrics = .none; onTrackChange?(); return }
        status = .ready
        lyrics = .loading
        onTrackChange?()
        loadTask = Task { await loadLyrics(track, client) }
    }

    /// What the room's owner last announced.
    func applyRemote(time: Double? = nil, playing: Bool? = nil, duration: Double? = nil, volume: Double? = nil,
                     vocalOn: Bool? = nil, guideLevel: Double? = nil, semitone: Int? = nil) {
        guard isFollower else { return }
        if let semitone { setSemitone(semitone) }
        if let time { remoteClock = (time, ProcessInfo.processInfo.systemUptime); if !isPlaying { seekCount += 1 } }
        if let playing { isPlaying = playing }
        if let duration, duration > 0 { self.duration = duration }
        applyingRemote = true
        if let volume { masterVolume = volume }
        if let vocalOn { self.vocalOn = vocalOn }
        if let guideLevel { vocalVolume = guideLevel }
        applyingRemote = false
    }

    /// Show the lyrics `seconds` earlier (negative: later), and save it for everyone who sings this song.
    func setAhead(_ seconds: Double) {
        guard let track, let client else { return }
        trackDelay = -seconds
        let delay = trackDelay
        delayTask?.cancel()
        delayTask = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            _ = try? await client.setLyricsDelay(trackId: track.id, delay: delay)
        }
    }

    func stop() {
        loadTask?.cancel()
        waitingForProcessing = false
        processingFinishedDuringLoad = false
        cancelPreloads()
        stems.stop()
        isPlaying = false
        track = nil
        status = .idle
        lyrics = .none
        onTrackChange?()
    }

    /// Plays through `device` (nil is the system's default output), going on from where it was.
    func setOutputDevice(_ device: AudioDevice?) {
        let resume = isPlaying
        let position = stems.currentTime
        do {
            try stems.setOutputDevice(device)
            if stems.isLoaded { try stems.seek(to: position); if resume { try stems.play(); isPlaying = true } else { isPlaying = false } }
        } catch { status = .failed(error.localizedDescription) }
    }

    // MARK: Loading

    /// Processing notifications and refreshed queues can make a previously missing song playable.
    /// Keep the latest play/pause intent, including a pause while processing was still running.
    func retryAfterProcessing(trackId: String, using client: APIClient) {
        guard !isFollower, var track, track.id == trackId else { return }
        if case .loading = status {
            processingFinishedDuringLoad = true
            return
        }
        guard waitingForProcessing, case .failed = status else { return }
        track.status = "ready"
        track.progress = nil
        play(track, using: client, autoplay: autoplayWhenReady)
    }

    /// Warms only the queue's immediate neighbors. StemCache shares downloads with playback if the
    /// person skips before they finish; preparing a song never changes the active audio or lyrics.
    func preload(_ tracks: [Track], using client: APIClient) {
        guard !isFollower, case .ready = status else { cancelPreloads(); return }
        let eligible = tracks.filter { $0.id != track?.id && ($0.status == nil || $0.status == "ready") }
        let ids = Set(eligible.map(\.id))
        for id in Array(preloads.keys) where !ids.contains(id) { preloads.removeValue(forKey: id)?.cancel() }
        for track in eligible where preloads[track.id] == nil {
            preloads[track.id] = Task { [cache] in
                guard !Task.isCancelled else { return nil }
                async let vocal = try? cache.fetch(.vocal, trackId: track.id, client: client)
                async let instrumental = try? cache.fetch(.instrumental, trackId: track.id, client: client)
                async let lyrics = try? client.lyrics(trackId: track.id)
                let response = await lyrics
                _ = await (vocal, instrumental)
                return response
            }
        }
    }

    private func cancelPreloads() {
        for task in preloads.values { task.cancel() }
        preloads.removeAll()
    }

    private func load(_ track: Track, _ client: APIClient, prefetched: Task<LyricsResponse?, Never>?) async {
        async let lyricsResult: Void = loadLyrics(track, client, prefetched: prefetched)
        do {
            let sizes = ProgressTally()
            let report: @Sendable (Int) -> StemCache.Progress = { [self] index in
                { loaded, total in
                    let fraction = sizes.update(index, loaded: loaded, total: total)
                    Task { @MainActor in
                        guard self.track?.id == track.id, case .loading = self.status else { return }
                        self.status = .loading(fraction)
                    }
                }
            }
            async let vocal = cache.fetch(.vocal, trackId: track.id, client: client, progress: report(0))
            async let instrumental = cache.fetch(.instrumental, trackId: track.id, client: client, progress: report(1))
            let urls = try await (vocal, instrumental)
            try Task.checkCancellation()
            try stems.load(vocal: urls.0, instrumental: urls.1)
            applyVolumes()
            duration = stems.duration
            status = .ready
            if autoplayWhenReady {
                if !cast.isActive { try stems.play() }
                isPlaying = true
            }
            if cast.isActive { pushToCast() }
            onAudioReady?()
        } catch is CancellationError {
        } catch APIError.status(404, _) {
            guard !Task.isCancelled else { return }
            waitingForProcessing = true
            status = .failed(tr("This song hasn't been processed yet."))
            if processingFinishedDuringLoad { retryAfterProcessing(trackId: track.id, using: client) }
        } catch APIError.offline {
            guard !Task.isCancelled else { return }
            status = .failed(tr("Can't reach the server, and this song isn't downloaded. Pin it while you're online to sing it offline."))
        } catch {
            if !Task.isCancelled { status = .failed(error.localizedDescription) }
        }
        await lyricsResult
    }

    /// Asks again for the lyrics after a failure: the button on the lyrics screen.
    func retryLyrics() {
        guard let track, let client else { return }
        lyrics = .loading
        loadTask?.cancel()
        loadTask = Task { await loadLyrics(track, client) }
    }

    /// Fetches the lyrics, trying again a few times when the connection fails. A song the server has no
    /// lyrics for ends as `.missing`; one that could not be asked ends as `.failed`, which can be retried.
    private func loadLyrics(_ track: Track, _ client: APIClient, prefetched: Task<LyricsResponse?, Never>? = nil) async {
        let waits: [Double] = [0, 2, 5, 10]
        for (attempt, wait) in waits.enumerated() {
            if wait > 0 {
                try? await Task.sleep(for: .seconds(wait))
                if Task.isCancelled { return }
            }
            guard !Task.isCancelled, self.track?.id == track.id else { return }
            do {
                let response: LyricsResponse
                if attempt == 0, let kept = await prefetched?.value { response = kept }
                else { response = try await client.lyrics(trackId: track.id) }
                guard !Task.isCancelled, self.track?.id == track.id else { return }
                trackDelay = response.delay ?? 0
                confidence = response.confidence
                if !response.lyrics.isEmpty { lyrics = .synced(response.lyrics) }
                else if let plain = response.plain, !plain.isEmpty { lyrics = .plain(plain) }
                else { lyrics = .missing }
                return
            } catch is CancellationError {
                return
            } catch {
                guard self.track?.id == track.id else { return }
                // no server: a pinned song brings its own
                if let kept = OfflineStore.shared.song(track.id)?.lyrics {
                    trackDelay = kept.delay ?? 0
                    confidence = kept.confidence
                    if !kept.lyrics.isEmpty { lyrics = .synced(kept.lyrics) }
                    else if let plain = kept.plain, !plain.isEmpty { lyrics = .plain(plain) }
                    else { lyrics = .missing }
                    return
                }
                if case APIError.status(404, _) = error { lyrics = .missing; return }
                if attempt == waits.count - 1 { lyrics = .failed }
            }
        }
    }

    // MARK: Casting

    /// Plays on `device` from now on, going on from where the song is.
    func castTo(_ device: CastDevice) { cast.connect(to: device) }

    /// Back to this Mac's speakers, going on from where the song is.
    func stopCasting() {
        guard cast.state != .off else { return }
        cast.disconnect()
        castClosed()
    }

    private var castGuideLevel: Int { Int(((vocalOn ? 1 : vocalVolume) * 4).rounded()) }

    private func pushToCast() {
        guard cast.isActive, let track, let client, case .ready = status else { return }
        let start = stems.currentTime
        stems.pause() // the clock waits until the device says it is playing
        guard let url = try? client.mixURL(trackId: track.id, vocal: Double(castGuideLevel) / 4) else { return }
        castLevel = castGuideLevel
        cast.load(url: url, title: track.name, artist: track.artistText, artwork: track.artworkURL, start: start, autoplay: isPlaying)
        applyVolumes()
    }

    private func castReported(_ state: String, _ time: Double) {
        guard cast.isActive else { return }
        switch state {
        case "PLAYING":
            guard isPlaying else { return }
            if !stems.isPlaying || abs(stems.currentTime - time) > 0.6 { try? stems.play(from: time) }
        case "BUFFERING":
            if stems.isPlaying { stems.pause() }
        default:
            break
        }
    }

    private func castClosed() {
        castReload?.cancel()
        castLevel = -1
        applyVolumes()
        if isPlaying, case .ready = status, !stems.isPlaying { try? stems.play() }
    }

    private func applyVolumes() {
        if cast.isActive {
            stems.setVolumes(vocal: 0, instrumental: 0)
            cast.setVolume(masterVolume)
            if castLevel >= 0, castGuideLevel != castLevel {
                castReload?.cancel()
                castReload = Task {
                    try? await Task.sleep(for: .milliseconds(500))
                    guard !Task.isCancelled else { return }
                    pushToCast()
                }
            }
            return
        }
        stems.setVolumes(vocal: Float(masterVolume * (vocalOn ? 1 : vocalVolume)),
                         instrumental: Float(masterVolume * instrumentalVolume))
    }
}

/// Adds up the progress of the two stems that download at once.
final class ProgressTally: @unchecked Sendable {
    private let lock = NSLock()
    private var sizes: [(loaded: Int64, total: Int64)] = [(0, 0), (0, 0)]

    func update(_ index: Int, loaded: Int64, total: Int64) -> Double? {
        lock.lock(); defer { lock.unlock() }
        sizes[index] = (loaded, total)
        let total = sizes.reduce(0) { $0 + $1.total }
        guard total > 0 else { return nil }
        return min(1, Double(sizes.reduce(0) { $0 + $1.loaded }) / Double(total))
    }
}
