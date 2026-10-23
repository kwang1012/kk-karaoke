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

    private(set) var isPlaying = false
    private(set) var duration: TimeInterval = 0
    var onFinish: (() -> Void)?

    init() {
        engine.attach(vocalNode)
        engine.attach(instrumentalNode)
        engine.attach(vocalPitch)
        engine.attach(instrumentalPitch)
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
        else { return base }
        return min(duration, base + max(0, Double(player.sampleTime)) / player.sampleRate)
    }

    func play(from time: TimeInterval? = nil) throws {
        guard let vocalFile, let instrumentalFile else { return }
        let start = min(max(time ?? base, 0), duration)
        halt()
        base = start
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
        let at = AVAudioTime(hostTime: mach_absolute_time() + AVAudioTime.hostTime(forSeconds: 0.1))
        vocalNode.play(at: at)
        instrumentalNode.play(at: at)
        isPlaying = true
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
    }

    private func finish() {
        halt()
        base = duration
        onFinish?()
    }

    private func halt() {
        generation += 1
        isPlaying = false
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
