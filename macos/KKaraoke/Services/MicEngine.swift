@preconcurrency import AVFoundation
import Foundation

/// The microphone: always listened to for pitch, and played back (with a reverb send) only while `monitor` is on.
///
/// It is captured with `AVCaptureSession`, which opens any input device on its own. `AVAudioEngine`'s input node
/// cannot: on macOS it shares one I/O unit with the output, and when the default output has no microphone (a display,
/// Bluetooth speakers) it fails with an Objective-C exception that cannot be caught. The engine here only plays the
/// monitor, so it never touches the input at all.
@MainActor
final class MicEngine {
    enum Failure: LocalizedError {
        case denied
        case noInput
        case engine(String)

        var errorDescription: String? {
            switch self {
            case .denied: tr("KKaraoke can't use the microphone. Allow it in System Settings → Privacy & Security → Microphone.")
            case .noInput: tr("No microphone is available.")
            case .engine(let message): tr("The microphone could not be opened: \(message)")
            }
        }
    }

    private let session = AVCaptureSession()
    private let output = AVCaptureAudioDataOutput()
    private let queue = DispatchQueue(label: "app.kkaraoke.mic", qos: .userInteractive)
    private let sink = CaptureSink()

    private let monitorEngine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let dry = AVAudioMixerNode()
    private let send = AVAudioMixerNode()
    private let reverb = AVAudioUnitReverb()
    private var monitoring = false
    private var outputDevice: AudioDevice?

    private(set) var isRunning = false

    init() {
        output.audioSettings = [
            AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: MicFormat.target.sampleRate, AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true, AVLinearPCMIsNonInterleaved: true,
            AVLinearPCMIsBigEndianKey: false,
        ]
        output.setSampleBufferDelegate(sink, queue: queue)
        reverb.loadFactoryPreset(.largeHall)
        reverb.wetDryMix = 100
        monitorEngine.attach(player)
        monitorEngine.attach(dry)
        monitorEngine.attach(send)
        monitorEngine.attach(reverb)
        monitorEngine.connect(player, to: [AVAudioConnectionPoint(node: dry, bus: 0), AVAudioConnectionPoint(node: send, bus: 0)],
                              fromBus: 0, format: MicFormat.target)
        monitorEngine.connect(send, to: reverb, format: MicFormat.target)
        monitorEngine.connect(dry, to: monitorEngine.mainMixerNode, format: MicFormat.target)
        // The reverb takes a mono send but only gives stereo back.
        monitorEngine.connect(reverb, to: monitorEngine.mainMixerNode, format: AVAudioFormat(standardFormatWithSampleRate: MicFormat.target.sampleRate, channels: 2))
    }

    static func requestAccess() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: return true
        case .notDetermined: return await AVCaptureDevice.requestAccess(for: .audio)
        default: return false
        }
    }

    /// Opens `device` (nil is the system's default input).
    func start(device: AudioDevice?) async throws {
        stop()
        guard await Self.requestAccess() else { throw Failure.denied }
        // A CoreAudio device UID is the capture device's unique ID.
        guard let capture = device.flatMap({ AVCaptureDevice(uniqueID: $0.uid) }) ?? AVCaptureDevice.default(for: .audio)
        else { throw Failure.noInput }
        session.beginConfiguration()
        session.inputs.forEach { session.removeInput($0) }
        do {
            let input = try AVCaptureDeviceInput(device: capture)
            guard session.canAddInput(input) else { throw Failure.engine(tr("\(capture.localizedName) can't be used")) }
            session.addInput(input)
            if !session.outputs.contains(output) {
                guard session.canAddOutput(output) else { throw Failure.engine(tr("the audio output can't be added")) }
                session.addOutput(output)
            }
        } catch {
            session.commitConfiguration()
            throw (error as? Failure) ?? Failure.engine(error.localizedDescription)
        }
        session.commitConfiguration()
        let session = session
        queue.async { session.startRunning() }
        isRunning = true
        applyMonitor()
    }

    func stop() {
        guard isRunning else { return }
        let session = session
        queue.async { session.stopRunning() }
        sink.setMonitor(nil)
        stopMonitor()
        sink.reset()
        isRunning = false
    }

    /// The pitch box, for a reading taken without a microphone.
    var pitchBox: PitchBox { sink.box }

    /// 0...1 each; the reverb level is how much of the room is mixed in. Nothing is heard unless `monitor`.
    func setLevels(volume: Double, reverb level: Double, monitor: Bool) {
        dry.outputVolume = Float(volume)
        send.outputVolume = Float(volume)
        reverb.wetDryMix = Float(level * 100)
        monitoring = monitor
        applyMonitor()
    }

    /// Where the monitor is heard (nil is the system's default output).
    func setOutputDevice(_ device: AudioDevice?) {
        outputDevice = device
        if monitorEngine.isRunning { stopMonitor(); applyMonitor() }
    }

    /// The pitch being sung right now, or nil for silence or noise.
    var pitch: Pitch? { sink.box.fresh() }

    /// Whether the monitor's engine is up, so the monitor is the part that can be tried without a microphone.
    var monitorIsRunning: Bool { monitorEngine.isRunning }

    var captureSink: CaptureSink { sink }

    private func applyMonitor() {
        guard monitoring else { stopMonitor(); return }
        guard !monitorEngine.isRunning else { return }
        do {
            if let id = outputDevice?.id ?? AudioDevices.defaultOutputID() { try monitorEngine.outputNode.auAudioUnit.setDeviceID(id) }
            monitorEngine.prepare()
            try monitorEngine.start()
            player.play()
            sink.setMonitor(player)
        } catch {
            sink.setMonitor(nil)
        }
    }

    private func stopMonitor() {
        sink.setMonitor(nil)
        guard monitorEngine.isRunning else { return }
        player.stop()
        monitorEngine.stop()
    }
}

enum MicFormat {
    /// What the pitch detector and the monitor both get: mono, so a stereo interface is not a surprise.
    static let target = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 44100, channels: 1, interleaved: false)!
}

/// Gathers the last 2048 samples and reads their pitch, at most every `interval` seconds: reading is far more work than hearing.
struct PitchAccumulator {
    static let window = 2048
    private var ring = [Float](repeating: 0, count: PitchAccumulator.window)
    private var filled = 0
    private var lastRead = -Double.infinity
    var interval = 0.025

    mutating func append(_ samples: UnsafeBufferPointer<Float>) {
        if samples.count >= Self.window {
            ring = Array(samples.suffix(Self.window))
            filled = Self.window
            return
        }
        ring.removeFirst(samples.count)
        ring.append(contentsOf: samples)
        filled = min(Self.window, filled + samples.count)
    }

    /// The pitch of what has been appended, or nil when it is quiet, too early, or not enough has arrived yet.
    mutating func read(now: Double, sampleRate: Double) -> Pitch?? {
        guard filled >= Self.window, now - lastRead >= interval else { return .none }
        lastRead = now
        return .some(PitchDetector.detect(ring, sampleRate: sampleRate))
    }

    mutating func reset() { filled = 0; lastRead = -.infinity }
}

/// Receives the captured audio on the capture queue.
final class CaptureSink: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate, @unchecked Sendable {
    let box = PitchBox()
    private let lock = NSLock()
    private var accumulator = PitchAccumulator()
    private var monitor: AVAudioPlayerNode?
    /// Buffers handed to the monitor and not yet played; when the output runs slower than the input they pile up.
    private var queued = 0
    private var converter: AVAudioConverter?

    func setMonitor(_ node: AVAudioPlayerNode?) {
        lock.lock(); defer { lock.unlock() }
        monitor = node
        queued = 0
    }

    func reset() {
        lock.lock(); defer { lock.unlock() }
        accumulator.reset()
        box.store(nil)
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        process(sampleBuffer)
    }

    func process(_ sampleBuffer: CMSampleBuffer) {
        guard let buffer = Self.pcm(from: sampleBuffer, converter: &converter), let channel = buffer.floatChannelData?[0] else { return }
        let samples = UnsafeBufferPointer(start: channel, count: Int(buffer.frameLength))
        lock.lock()
        accumulator.append(samples)
        let reading = accumulator.read(now: ProcessInfo.processInfo.systemUptime, sampleRate: MicFormat.target.sampleRate)
        let node = monitor
        let backlog = queued
        if node != nil, backlog < 4 { queued += 1 }
        lock.unlock()
        if let reading { box.store(reading) }
        if let node, backlog < 4 {
            node.scheduleBuffer(buffer) { [weak self] in
                guard let self else { return }
                self.lock.lock(); self.queued = max(0, self.queued - 1); self.lock.unlock()
            }
        }
    }

    /// The samples as mono float at the rate the rest of the app expects, whatever the device delivered.
    private static func pcm(from sampleBuffer: CMSampleBuffer, converter: inout AVAudioConverter?) -> AVAudioPCMBuffer? {
        guard let description = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(description) else { return nil }
        var streamDescription = asbd.pointee
        guard let format = AVAudioFormat(streamDescription: &streamDescription) else { return nil }
        let frames = AVAudioFrameCount(CMSampleBufferGetNumSamples(sampleBuffer))
        guard frames > 0, let source = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return nil }
        source.frameLength = frames
        guard CMSampleBufferCopyPCMDataIntoAudioBufferList(sampleBuffer, at: 0, frameCount: Int32(frames),
                                                           into: source.mutableAudioBufferList) == noErr else { return nil }
        if format.commonFormat == .pcmFormatFloat32, format.channelCount == 1, format.sampleRate == MicFormat.target.sampleRate {
            return source
        }
        // The device ignored the requested settings: convert.
        if converter?.inputFormat != format { converter = AVAudioConverter(from: format, to: MicFormat.target) }
        guard let converter else { return nil }
        let capacity = AVAudioFrameCount(Double(frames) * MicFormat.target.sampleRate / format.sampleRate) + 64
        guard let converted = AVAudioPCMBuffer(pcmFormat: MicFormat.target, frameCapacity: capacity) else { return nil }
        var supplied = false
        var error: NSError?
        converter.convert(to: converted, error: &error) { _, status in
            if supplied { status.pointee = .noDataNow; return nil }
            supplied = true
            status.pointee = .haveData
            return source
        }
        return error == nil ? converted : nil
    }
}

/// The latest pitch the audio thread heard. A reading is only good for a moment: one from a note ago is silence.
final class PitchBox: @unchecked Sendable {
    static let freshSeconds = 0.3
    private let lock = NSLock()
    private var value: (pitch: Pitch, at: TimeInterval)?

    func store(_ pitch: Pitch?) {
        lock.lock(); defer { lock.unlock() }
        value = pitch.map { ($0, ProcessInfo.processInfo.systemUptime) }
    }

    func fresh(now: TimeInterval = ProcessInfo.processInfo.systemUptime) -> Pitch? {
        lock.lock(); defer { lock.unlock() }
        guard let value, now - value.at <= Self.freshSeconds else { return nil }
        return value.pitch
    }
}
