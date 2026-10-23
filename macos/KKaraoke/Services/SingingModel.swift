import Foundation
import Observation

/// Singing along: the microphone, the song's melody, and how well the two match. The fast-moving parts (the trail of
/// what you sang, the view of the roll) are not observed: the roll reads them every frame.
@MainActor
@Observable
final class SingingModel {
  /// A sung pitch placed on the song's timeline.
  struct Sample {
    var time: Double
    var midi: Double
    var on: Bool
  }

  private enum Keys {
    static let showMelody = "showMelody", detail = "melodyDetail", micVolume = "micVolume",
      reverb = "micReverb"
    static let monitor = "micMonitor", inputUID = "inputDeviceUID", outputUID = "outputDeviceUID"
  }

  // MARK: Settings

  var showMelody: Bool {
    didSet {
      save(showMelody, Keys.showMelody)
      wake()
    }
  }
  var melodyDetail: Double {
    didSet {
      save(melodyDetail, Keys.detail)
      rebuildMelody()
    }
  }
  var micVolume: Double {
    didSet {
      save(micVolume, Keys.micVolume)
      applyLevels()
    }
  }
  var reverb: Double {
    didSet {
      save(reverb, Keys.reverb)
      applyLevels()
    }
  }
  /// Hear yourself through the speakers. Off by default: a microphone next to a speaker howls.
  var monitor: Bool {
    didSet {
      save(monitor, Keys.monitor)
      applyLevels()
    }
  }
  var inputUID: String {
    didSet {
      save(inputUID, Keys.inputUID)
      if micOn { Task { await restartMic() } }
    }
  }
  var outputUID: String {
    didSet {
      save(outputUID, Keys.outputUID)
      applyOutput()
    }
  }

  // MARK: State

  private(set) var micOn = false
  private(set) var micError: String?
  /// Somebody is singing into a phone in the room.
  private(set) var remoteSinging = false
  private(set) var score: Int?
  private(set) var melodyState: MelodyState = .idle
  private(set) var melody: [Note] = []
  private(set) var refreshingDevices = false
  private(set) var inputs: [AudioDevice] = []
  private(set) var outputs: [AudioDevice] = []

  @ObservationIgnored private(set) var range: (low: Double, high: Double) = (60, 72)
  @ObservationIgnored private(set) var trail: [Sample] = []
  @ObservationIgnored private var found: [Note] = []
  @ObservationIgnored private var scorer = Scorer()
  @ObservationIgnored private let mic = MicEngine()
  @ObservationIgnored private weak var player: PlayerModel?
  @ObservationIgnored weak var room: RoomModel?
  @ObservationIgnored private var lastPitchSent = 0.0
  @ObservationIgnored private var client: APIClient?
  @ObservationIgnored private var loop: Task<Void, Never>?
  @ObservationIgnored private var melodyTask: Task<Void, Never>?
  @ObservationIgnored private var melodyTrackId: String?

  /// Seconds of the singer's trail kept.
  static let trailSeconds = 2.5
  /// Pitch is read at most this often; reading is far more work than drawing.
  private static let readInterval = Duration.milliseconds(25)

  @ObservationIgnored private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    let d = defaults
    showMelody = d.object(forKey: Keys.showMelody) as? Bool ?? false
    melodyDetail = Melody.detail(d.object(forKey: Keys.detail) as? Double ?? Melody.defaultDetail)
    micVolume = d.object(forKey: Keys.micVolume) as? Double ?? 0.8
    reverb = d.object(forKey: Keys.reverb) as? Double ?? 0.3
    monitor = d.object(forKey: Keys.monitor) as? Bool ?? false
    inputUID = d.string(forKey: Keys.inputUID) ?? ""
    outputUID = d.string(forKey: Keys.outputUID) ?? ""
    refreshDevices()
  }

  func attach(_ player: PlayerModel, client: @escaping @MainActor () -> APIClient?) {
    self.player = player
    clientProvider = client
    player.onTrackChange = { [weak self] in self?.wake() }
    if !outputUID.isEmpty { applyOutput() }
  }

  @ObservationIgnored private var clientProvider: (@MainActor () -> APIClient?)?

  // MARK: Microphone

  func toggleMic() {
    if micOn { stopMic() } else { Task { await startMic() } }
  }

  func refreshDevices() {
    guard !refreshingDevices else { return }
    refreshingDevices = true
    Task { [weak self] in
      // CoreAudio property queries can wait for hardware/driver responses. Never
      // perform them on the UI thread, including the initial device discovery.
      let devices = await Task.detached(priority: .utility) {
        (inputs: AudioDevices.all(input: true), outputs: AudioDevices.all(input: false))
      }.value
      guard let self else { return }
      inputs = devices.inputs
      outputs = devices.outputs
      refreshingDevices = false
    }
  }

  private func startMic() async {
    micError = nil
    do {
      try await mic.start(
        device: inputUID.isEmpty ? nil : AudioDevices.device(uid: inputUID, input: true))
      micOn = true
      scorer.reset()
      score = nil
      applyLevels()
      wake()
    } catch {
      micOn = false
      micError = error.localizedDescription
    }
  }

  private func restartMic() async {
    mic.stop()
    micOn = false
    await startMic()
  }

  private func stopMic() {
    mic.stop()
    micOn = false
    trail.removeAll()
  }

  private func applyLevels() { mic.setLevels(volume: micVolume, reverb: reverb, monitor: monitor) }

  private func applyOutput() {
    guard let player else { return }
    let device = outputUID.isEmpty ? nil : AudioDevices.device(uid: outputUID, input: false)
    player.setOutputDevice(device)
    mic.setOutputDevice(device)
  }

  // MARK: Melody

  private func rebuildMelody() {
    melody = Melody.simplify(found, detail: melodyDetail)
    range = Melody.range(of: melody)
    scorer.reset()
    score = nil
  }

  private func loadMelody(for trackId: String?) {
    melodyTask?.cancel()
    melodyTrackId = trackId
    found = []
    melody = []
    trail.removeAll()
    scorer.reset()
    score = nil
    guard let trackId, let client = clientProvider?() else {
      melodyState = .idle
      return
    }
    melodyState = .loading
    melodyTask = Task {
      for attempt in 1...30 {
        do {
          switch try await client.melody(trackId: trackId) {
          case .notes(let notes):
            guard !Task.isCancelled else { return }
            found = notes
            rebuildMelody()
            melodyState = .ready
            return
          case .none:
            if !Task.isCancelled { melodyState = .none }
            return
          case .pending:
            melodyState = .waiting
          }
        } catch {
          guard !Task.isCancelled else { return }
          if let kept = OfflineStore.shared.song(trackId)?.melody, !kept.isEmpty {
            found = kept
            rebuildMelody()
            melodyState = .ready
          } else {
            melodyState = .gaveUp
          }
          return
        }
        try? await Task.sleep(for: .seconds(4))
        if Task.isCancelled { return }
        if attempt == 30 { melodyState = .gaveUp }
      }
    }
  }

  // MARK: The loop

  /// Runs while there is something to show or score, and follows the song: a new song brings a new melody.
  func wake() {
    let id = player?.track?.id
    if id != melodyTrackId { loadMelody(for: id) }
    guard loop == nil, showMelody || micOn || (room?.remoteSingingActive() ?? false) else { return }
    loop = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: Self.readInterval)
        guard let self else { return }
        if !self.tick() {
          self.loop = nil
          return
        }
      }
    }
  }

  /// Reads the mic (or a phone's) and scores it. False when there is nothing left to do and the loop can end.
  private func tick() -> Bool {
    let remote = room?.remoteSingingActive() ?? false
    if remote != remoteSinging { remoteSinging = remote }
    guard showMelody || micOn || remote else { return false }
    guard micOn || remote, let player else { return true }
    let time = player.currentTime
    var hz = micOn ? mic.pitch?.hz : nil
    if hz == nil, !player.isFollower { hz = room?.remotePitchHz() }
    if player.isFollower, micOn, let hz {
      // a guest's owner draws and scores the singing: send what the mic hears, ten times a second
      let now = ProcessInfo.processInfo.systemUptime
      if now - lastPitchSent >= 0.1 {
        lastPitchSent = now
        room?.sendPitch(hz: hz)
      }
    }
    let sung = hz.map(PitchDetector.midi(fromHz:))
    let on = player.isPlaying ? scorer.update(time: time, sung: sung, notes: melody) : nil
    if let sung {
      let target = Scoring.noteUnder(melody, time)
      let hit =
        target.map { abs(Scoring.semitonesOff(sung, $0.note)) <= Scoring.tolerance } ?? false
      trail.append(Sample(time: time, midi: sung, on: on ?? hit))
    }
    trail.removeAll { $0.time < time - Self.trailSeconds || $0.time > time + 1 }
    if scorer.score != score { score = scorer.score }
    return true
  }

  private func save(_ value: Any, _ key: String) { defaults.set(value, forKey: key) }
}
