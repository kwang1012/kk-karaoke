import AVFoundation

/// Plays a song's vocal and instrumental stems together. Both player nodes start at one host time, so they
/// stay on the same clock, and the vocal level is a plain gain (0 is a karaoke track, 1 the original song).
@MainActor
final class StemPlayer {
    private let engine = AVAudioEngine()
    private let vocalNode = AVAudioPlayerNode()
    private let instrumentalNode = AVAudioPlayerNode()
    /// The key change: each stem is shifted by the same number of semitones, without changing its speed.
    private let vocalPitch = AVAudioUnitTimePitch()
    private let instrumentalPitch = AVAudioUnitTimePitch()
    private var vocalFile: AVAudioFile?
    private var instrumentalFile: AVAudioFile?
    /// The song position the nodes were last started from.
    private var base: TimeInterval = 0
    /// Bumped whenever playback stops or restarts, so a stale completion callback is ignored.
    private var generation = 0

    /// The last position read from the render clock. When that clock goes quiet (the engine stopped under us) this,
    /// not the start of the scheduled segment, is where the song still is.
    private var lastTime: TimeInterval = 0
    /// Uptime after which a playing engine should be advancing: the start of the scheduled segment, plus a settling moment.
    private var healthyAfter: TimeInterval = 0
    private var watched: (time: TimeInterval, uptime: TimeInterval)?
    private var watchdog: Task<Void, Never>?
    private var configObserver: NSObjectProtocol?

    private(set) var isPlaying = false
    private(set) var duration: TimeInterval = 0
    var onFinish: (() -> Void)?

    init() {
        engine.attach(vocalNode)
        engine.attach(instrumentalNode)
        engine.attach(vocalPitch)
        engine.attach(instrumentalPitch)
        // A new output (headphones, Bluetooth, a sample-rate change) or waking from sleep stops the engine and its
        // nodes without a word: isPlaying stays true, the render clock stops, and the song looks frozen.
        configObserver = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.recover() }
        }
    }

    /// Starts the song again from where it stopped, after the engine went away. Nothing to do when paused.
    private func recover() {
        guard isPlaying else { if isLoaded { engine.prepare() }; return }
        try? play(from: lastTime, startingIn: 0.1)
    }

    /// While playing, checks once a second that the position is moving; if the engine has stopped or the clock is
    /// frozen, restarts from the last known position.
    private func startWatchdog() {
        watchdog?.cancel()
        watched = nil
        watchdog = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard let self, self.isPlaying else { return }
                let now = ProcessInfo.processInfo.systemUptime
                guard now > self.healthyAfter else { self.watched = nil; continue }
                let time = self.currentTime
                defer { self.watched = (time, now) }
                guard let before = self.watched, now - before.uptime >= 0.9 else { continue }
                let stalled = !self.engine.isRunning || (time - before.time) < 0.3
                if stalled, time < self.duration - 1 { self.recover(); self.watched = nil }
            }
        }
    }

    var isLoaded: Bool { instrumentalFile != nil }

    func load(vocal: URL, instrumental: URL) throws {
        stop()
        let vocalFile = try AVAudioFile(forReading: vocal)
        let instrumentalFile = try AVAudioFile(forReading: instrumental)
        engine.stop()
        engine.disconnectNodeOutput(vocalNode)
        engine.disconnectNodeOutput(instrumentalNode)
        engine.disconnectNodeOutput(vocalPitch)
        engine.disconnectNodeOutput(instrumentalPitch)
        engine.connect(vocalNode, to: vocalPitch, format: vocalFile.processingFormat)
        engine.connect(vocalPitch, to: engine.mainMixerNode, format: vocalFile.processingFormat)
        engine.connect(instrumentalNode, to: instrumentalPitch, format: instrumentalFile.processingFormat)
        engine.connect(instrumentalPitch, to: engine.mainMixerNode, format: instrumentalFile.processingFormat)
        self.vocalFile = vocalFile
        self.instrumentalFile = instrumentalFile
        duration = max(Self.length(vocalFile), Self.length(instrumentalFile))
        base = 0
        engine.prepare()
    }

    /// Plays through `device` (nil is the system's default output). Playback stops where it is; call `play` to go on.
    func setOutputDevice(_ device: AudioDevice?) throws {
        guard let id = device?.id ?? AudioDevices.defaultOutputID() else { return }
        pause()
        engine.stop()
        try engine.outputNode.auAudioUnit.setDeviceID(id)
        if isLoaded { engine.prepare() }
    }

    /// Raises (or lowers) the song by `semitone` semitones, playing or not.
    func setSemitone(_ semitone: Int) {
        let cents = Float(semitone * 100)
        vocalPitch.pitch = cents
        instrumentalPitch.pitch = cents
    }

    func setVolumes(vocal: Float, instrumental: Float) {
        vocalNode.volume = vocal
        instrumentalNode.volume = instrumental
    }

    var currentTime: TimeInterval {
        guard isPlaying else { return base }
        guard let render = instrumentalNode.lastRenderTime, let player = instrumentalNode.playerTime(forNodeTime: render)
        else { return lastTime }
        lastTime = min(duration, base + max(0, Double(player.sampleTime)) / player.sampleRate)
        return lastTime
    }

    /// How long after the engine renders a sample it reaches the speakers; only known once the engine runs.
    var outputLatency: TimeInterval { engine.outputNode.presentationLatency }

    /// Starts the engine without playing, so `outputLatency` is known before a start is scheduled.
    func prepareToPlay() throws {
        if !engine.isRunning { try engine.start() }
    }

    /// Plays from `time` (or where it was), starting `lead` seconds from now: a short lead keeps the two stems together,
    /// a longer one is how a duet lands on the moment it shares with other devices.
    func play(from time: TimeInterval? = nil, startingIn lead: TimeInterval = 0.1) throws {
        guard let vocalFile, let instrumentalFile else { return }
        let start = min(max(time ?? base, 0), duration)
        halt()
        base = start
        lastTime = start
        if start >= duration { onFinish?(); return }
        let generation = generation
        schedule(vocalFile, on: vocalNode, from: start, completion: nil)
        schedule(instrumentalFile, on: instrumentalNode, from: start) { [weak self] in
            Task { @MainActor in
                guard let self, self.generation == generation, self.isPlaying else { return }
                self.finish()
            }
        }
        if !engine.isRunning { try engine.start() }
        // A shared start time in the near future, so neither stem gets a head start.
        let at = AVAudioTime(hostTime: mach_absolute_time() + AVAudioTime.hostTime(forSeconds: max(0, lead)))
        vocalNode.play(at: at)
        instrumentalNode.play(at: at)
        isPlaying = true
        healthyAfter = ProcessInfo.processInfo.systemUptime + max(0, lead) + 1.5
        startWatchdog()
    }

    func pause() {
        guard isPlaying else { return }
        base = currentTime
        halt()
    }

    func seek(to time: TimeInterval) throws {
        if isPlaying { try play(from: time) } else { base = min(max(time, 0), duration) }
    }

    func stop() {
        halt()
        base = 0
        lastTime = 0
    }

    private func finish() {
        halt()
        base = duration
        onFinish?()
    }

    private func halt() {
        generation += 1
        isPlaying = false
        watchdog?.cancel()
        vocalNode.stop()
        instrumentalNode.stop()
    }

    private func schedule(_ file: AVAudioFile, on node: AVAudioPlayerNode, from time: TimeInterval,
                          completion: (@Sendable () -> Void)?) {
        let rate = file.processingFormat.sampleRate
        let startFrame = AVAudioFramePosition(time * rate)
        let frames = AVAudioFrameCount(max(0, file.length - startFrame))
        guard frames > 0 else { completion?(); return }
        node.scheduleSegment(file, startingFrame: startFrame, frameCount: frames, at: nil,
                             completionCallbackType: .dataPlayedBack) { _ in completion?() }
    }

    private static func length(_ file: AVAudioFile) -> TimeInterval {
        Double(file.length) / file.processingFormat.sampleRate
    }
}
