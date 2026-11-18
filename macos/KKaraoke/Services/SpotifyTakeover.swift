import AppKit
import Foundation
import Observation

/// A song as Spotify names it.
struct SpotifyTrack: Equatable, Sendable {
  var id: String
  var name: String
  var artist: String
  /// Seconds. Another service may call the song something else, and its length is what finds it then.
  var duration: Double?
  var album: String?
  /// Which song of its album it is.
  var trackNumber: Int?

  init?(id: String?, name: String?, artist: String?, duration: Double? = nil, album: String? = nil, trackNumber: Int? = nil) {
    guard let id, !id.isEmpty, let name, !name.isEmpty else { return nil }
    self.id = id
    self.name = name
    self.artist = artist ?? ""
    self.duration = duration.flatMap { $0 > 0 ? $0 : nil }
    self.album = album?.isEmpty == false ? album : nil
    self.trackNumber = trackNumber.flatMap { $0 > 0 ? $0 : nil }
  }

  /// The same song, however much of it is known: the length may come from one source and not another.
  static func == (a: SpotifyTrack, b: SpotifyTrack) -> Bool { a.id == b.id && a.name == b.name && a.artist == b.artist }
}

enum SpotifyPlayState: String, Sendable { case playing = "Playing", paused = "Paused", stopped = "Stopped" }

/// What Spotify announced: its state, and the song it is on.
struct SpotifyEvent: Equatable, Sendable {
  var state: SpotifyPlayState
  var track: SpotifyTrack?
  var artwork: URL?

  /// The `userInfo` of Spotify's `com.spotify.client.PlaybackStateChanged` notification.
  init?(userInfo: [AnyHashable: Any]?) {
    guard let userInfo, let raw = userInfo["Player State"] as? String, let state = SpotifyPlayState(rawValue: raw) else { return nil }
    self.state = state
    // Spotify reports the length in milliseconds
    let milliseconds = (userInfo["Duration"] as? NSNumber)?.doubleValue
    track = SpotifyTrack(id: userInfo["Track ID"] as? String, name: userInfo["Name"] as? String, artist: userInfo["Artist"] as? String,
                         duration: milliseconds.map { $0 / 1000 }, album: userInfo["Album"] as? String,
                         trackNumber: (userInfo["Track Number"] as? NSNumber)?.intValue)
  }

  init(state: SpotifyPlayState, track: SpotifyTrack?, artwork: URL? = nil) {
    self.state = state
    self.track = track
    self.artwork = artwork
  }
}

/// Talks to the Spotify desktop app. Playing it needs no permission; controlling it asks once for Automation access.
@MainActor
enum SpotifyApp {
  static let bundleID = "com.spotify.client"
  static let notification = Notification.Name("com.spotify.client.PlaybackStateChanged")

  enum Failure: LocalizedError {
    case notRunning, denied, failed(String)
    var errorDescription: String? {
      switch self {
      case .notRunning: tr("Spotify is not open.")
      case .denied: tr("Allow KKaraoke to control Spotify in System Settings → Privacy & Security → Automation.")
      case .failed(let message): message
      }
    }
  }

  static var isRunning: Bool { !NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).isEmpty }

  /// Runs `body` inside `tell application "Spotify"`. Never starts Spotify: a closed Spotify is an error.
  @discardableResult
  static func run(_ body: String) throws -> NSAppleEventDescriptor {
    guard isRunning else { throw Failure.notRunning }
    var error: NSDictionary?
    let source = "tell application id \"\(bundleID)\"\nwith timeout of 3 seconds\n\(body)\nend timeout\nend tell"
    let result = NSAppleScript(source: source)?.executeAndReturnError(&error)
    if let error {
      if (error[NSAppleScript.errorNumber] as? Int) == -1743 { throw Failure.denied }
      throw Failure.failed(error[NSAppleScript.errorMessage] as? String ?? "Spotify did not answer.")
    }
    return result ?? .null()
  }

  static func volume() throws -> Int { Int(try run("return sound volume").int32Value) }
  static func setVolume(_ value: Int) throws { try run("set sound volume to \(min(100, max(0, value)))") }
  static func pause() throws { try run("pause") }
  static func play() throws { try run("play") }
  static func playPause() throws { try run("playpause") }
  /// Moves Spotify to its next song and has it start. Whether a paused Spotify starts the song it skips to varies, and
  /// this must announce the new song either way, so it is asked to play (it is silent: its volume is 0 while held).
  static func next() throws { try run("next track\nplay") }
  /// Silences Spotify and holds it, in one step, so nothing leaks out between the two.
  static func muteAndPause() throws { try run("set sound volume to 0\npause") }

  /// Seconds into the song Spotify is on.
  static func position() throws -> Double { Double(try run("return round ((player position) * 1000)").int32Value) / 1000 }

  /// What Spotify is on right now.
  static func current() throws -> SpotifyEvent? {
    let answer = try run("""
      if player state is stopped then return {"Stopped"}
      return {player state as string, id of current track, name of current track, artist of current track, artwork url of current track, duration of current track, album of current track, track number of current track}
      """)
    guard let raw = answer.atIndex(1)?.stringValue else { return nil }
    let state = SpotifyPlayState(rawValue: raw.capitalized) ?? .stopped
    return SpotifyEvent(
      state: state,
      track: SpotifyTrack(id: answer.atIndex(2)?.stringValue, name: answer.atIndex(3)?.stringValue, artist: answer.atIndex(4)?.stringValue,
                         duration: answer.atIndex(6).map { Double($0.int32Value) / 1000 }, album: answer.atIndex(7)?.stringValue,
                         trackNumber: answer.atIndex(8).map { Int($0.int32Value) }),
      artwork: answer.atIndex(5)?.stringValue.flatMap { URL(string: $0) })
  }
}

/// Sings what Spotify plays. Spotify keeps choosing the songs; KKaraoke plays each one's karaoke version in its place.
///
/// While a song is sung, Spotify is held silent (volume 0) and paused, so nothing doubles and it never moves on by itself.
/// When the song ends KKaraoke asks Spotify for the next one, and the cycle repeats. A song with no karaoke version yet
/// is started in the background and played by Spotify as usual, so a song heard often turns into a karaoke one.
@MainActor
@Observable
final class SpotifyTakeover {
  enum Status: Equatable {
    case off
    case waiting
    case matching(String)
    case singing(String)
    case spotifyPlays(String)
    case problem(String)
  }

  /// The song Spotify is on and how far KKaraoke's version of it has got: shown in "now playing" even before it can play.
  struct Now: Equatable {
    enum Stage: Equatable { case matching, singing, preparing, missing, failed }
    var spotify: SpotifyTrack
    var match: Track?
    var stage: Stage
    /// Spotify's cover, for as long as there is no match to take one from.
    var artwork: URL?
  }

  /// A song Spotify has queued, and whether its karaoke version is ready.
  struct Ahead: Identifiable, Equatable {
    var spotify: SpotifyTrack
    var match: Track?
    var stage: Now.Stage
    var artwork: URL?
    var id: String { spotify.id }
  }

  /// How many of Spotify's queued songs are looked up, and started on if they are not ready, ahead of their turn.
  static let lookahead = 3

  private enum Keys { static let enabled = "spotifyTakeover", volume = "spotifyVolumeToRestore" }

  private(set) var status: Status = .off
  private(set) var now: Now?
  private(set) var ahead: [Ahead] = []
  private(set) var aheadMessage: String?
  /// Signing in to Spotify's Web API, which is what shows the queue.
  let web = SpotifyWebAuth()
  var isEnabled: Bool {
    didSet {
      guard isEnabled != oldValue else { return }
      defaults.set(isEnabled, forKey: Keys.enabled)
      if isEnabled { start() } else { stop() }
    }
  }

  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private weak var player: PlayerModel?
  @ObservationIgnored private weak var room: RoomModel?
  @ObservationIgnored private var clientProvider: (@MainActor () -> APIClient?)?
  @ObservationIgnored private var observer: NSObjectProtocol?
  /// The Spotify song being handled: a second announcement of it (a pause, a replay) is not a new song.
  @ObservationIgnored private var spotifyTrack: SpotifyTrack?
  @ObservationIgnored private var matching: Task<Void, Never>?
  @ObservationIgnored private var readiness: Task<Void, Never>?
  @ObservationIgnored private var aheadTask: Task<Void, Never>?
  /// Matches that were ready: a song is looked up once.
  @ObservationIgnored private var readyMatches: [String: SongMatch] = [:]
  @ObservationIgnored private var beganAt = Date.distantPast

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    isEnabled = defaults.bool(forKey: Keys.enabled)
  }

  /// What this is doing, in words.
  var statusText: String? {
    switch status {
    case .off: nil
    case .waiting: tr("Waiting for Spotify to play something.")
    case .matching(let name): tr("Looking up \(name)…")
    case .singing(let name): tr("Singing \(name)")
    case .spotifyPlays(let why): why
    case .problem(let message): message
    }
  }

  func attach(player: PlayerModel, room: RoomModel, client: @escaping @MainActor () -> APIClient?) {
    self.player = player
    self.room = room
    clientProvider = client
    room.nextOverride = { [weak self] _ in self?.skip() ?? false }
    if isEnabled { start() } else { restoreVolume() } // a crash while singing would have left Spotify silent
  }

  // MARK: Switching on and off

  private func start() {
    guard observer == nil else { return }
    room?.followSpotify(true)
    status = .waiting
    observer = DistributedNotificationCenter.default().addObserver(forName: SpotifyApp.notification, object: nil, queue: .main) { [weak self] note in
      let event = SpotifyEvent(userInfo: note.userInfo)
      MainActor.assumeIsolated { if let event { self?.heard(event) } }
    }
    if SpotifyApp.isRunning, let event = try? SpotifyApp.current() {
      if event.state == .playing { heard(event) } else if let track = event.track { peek(track, artwork: event.artwork) }
    }
  }

  private func stop() {
    if let observer { DistributedNotificationCenter.default().removeObserver(observer) }
    observer = nil
    matching?.cancel()
    readiness?.cancel()
    aheadTask?.cancel()
    ahead = []
    spotifyTrack = nil
    now = nil
    room?.followSpotify(false)
    restoreVolume()
    status = .off
  }

  /// Gives Spotify its sound back: when switched off, when the app quits.
  func restoreVolume() {
    guard let saved = defaults.object(forKey: Keys.volume) as? Int else { return }
    defaults.removeObject(forKey: Keys.volume)
    try? SpotifyApp.setVolume(saved)
  }

  func shutdown() {
    restoreVolume()
  }

  // MARK: Following Spotify

  func heard(_ event: SpotifyEvent) {
    guard isEnabled, event.state == .playing else { return }
    guard let room, !room.isFollowing else {
      status = .problem(tr("Another device plays this room, so Spotify plays as usual."))
      return
    }
    // Announcements can arrive late or out of order (the one for the song we just left, say): what Spotify is on now is
    // the truth, and acting on a stale one would send it back to the previous song.
    let track: SpotifyTrack
    var artwork = event.artwork
    if let actual = try? SpotifyApp.current() {
      guard actual.state == .playing, let current = actual.track else { return }
      track = current
      artwork = actual.artwork
    } else if let announced = event.track {
      track = announced
    } else { return }
    if track == spotifyTrack {
      // Spotify is playing the song held here: play pressed in Spotify, which means "play" or "pause" for ours.
      // (Right after a song begins it is just Spotify not having paused yet.)
      if case .singing = status, Date().timeIntervalSince(beganAt) > 2 { try? SpotifyApp.pause(); player?.toggle() }
      return
    }
    begin(track, artwork: artwork)
  }

  /// Spotify is on a song but not playing it (paused, or just opened): show it as the song, and start preparing it, so
  /// pressing play finds it ready. Nothing is played or silenced.
  private func peek(_ track: SpotifyTrack, artwork: URL?) {
    guard spotifyTrack == nil else { return }
    now = Now(spotify: track, match: readyMatches[track.id]?.track, stage: readyMatches[track.id] == nil ? .matching : .singing, artwork: artwork)
    guard readyMatches[track.id] == nil else { return }
    matching = Task { [weak self] in
      guard let self, let client = clientProvider?() else { return }
      let match = try? await client.matchSong(for: track, artwork: artwork, process: true)
      guard !Task.isCancelled, spotifyTrack == nil, now?.spotify == track else { return }
      if let match, match.ready { readyMatches[track.id] = match }
      let stage: Now.Stage = match?.track == nil ? .missing : (match?.ready == true ? .singing : .preparing)
      now = Now(spotify: track, match: match?.track, stage: stage, artwork: artwork)
    }
  }

  private func begin(_ track: SpotifyTrack, artwork: URL? = nil) {
    spotifyTrack = track
    beganAt = Date()
    matching?.cancel()
    readiness?.cancel()
    status = .matching(track.name)
    now = Now(spotify: track, match: nil, stage: .matching, artwork: artwork)
    room?.setSpotifySong(nil) // the last song stops while this one is looked up
    // Spotify's queue is only reported while it plays: it is silenced at once, and paused once the queue has been read
    let readsQueue = isEnabled && web.isConnected
    do { try holdSpotify(pause: !readsQueue) } catch {
      status = .problem(error.localizedDescription)
      now = Now(spotify: track, match: nil, stage: .failed, artwork: artwork)
      return
    }
    refreshAhead(thenPause: readsQueue)
    matching = Task { [weak self] in
      guard let self else { return }
      var found: SongMatch? = readyMatches[track.id]
      var failure: String?
      if found == nil {
        do {
          guard let client = clientProvider?() else { throw APIError.badURL }
          found = try await client.matchSong(for: track, artwork: artwork, process: true)
        } catch { failure = error.localizedDescription }
      }
      guard !Task.isCancelled, spotifyTrack == track else { return } // the person moved on while this was looked up
      if let match = found, let song = match.track, match.ready {
        readyMatches[track.id] = match
        now = Now(spotify: track, match: song, stage: .singing, artwork: artwork)
        status = .singing(song.name)
        room?.setSpotifySong(song)
      } else if let song = found?.track {
        now = Now(spotify: track, match: song, stage: .preparing, artwork: artwork)
        status = .spotifyPlays(tr("Preparing the karaoke version of \(track.name). Spotify plays it meanwhile."))
        letSpotifyPlay()
        watchReadiness(of: track, song: song, artwork: artwork)
      } else {
        now = Now(spotify: track, match: nil, stage: failure == nil ? .missing : .failed, artwork: artwork)
        status = .spotifyPlays(failure ?? tr("No karaoke version found for \(track.name)."))
        letSpotifyPlay()
        if failure != nil { retryLookup(of: track, artwork: artwork) }
      }
    }
  }

  /// Pauses between attempts at a lookup that failed: quick at first (a dropped connection usually comes back at once), then
  /// every minute for about ten minutes, so a song is not left unsung for good by a blip.
  static let retryDelays: [Double] = [3, 6, 12, 20, 30, 30, 30] + Array(repeating: 60, count: 9)

  /// A lookup that failed (the network dropped, the server was busy) is tried again while the song is still on. Spotify plays
  /// it meanwhile; once the lookup works, KKaraoke prepares it, or takes over from where Spotify has got to.
  private func retryLookup(of track: SpotifyTrack, artwork: URL?) {
    readiness?.cancel()
    readiness = Task { [weak self] in
      for delay in Self.retryDelays {
        try? await Task.sleep(for: .seconds(delay))
        guard let self, !Task.isCancelled, spotifyTrack == track else { return }
        guard let client = clientProvider?(),
              let match = try? await client.matchSong(for: track, artwork: artwork, process: true) else { continue }
        guard !Task.isCancelled, spotifyTrack == track else { return }
        if match.ready, let song = match.track {
          readyMatches[track.id] = match
          takeOver(track, with: song, artwork: artwork)
        } else if let song = match.track {
          now = Now(spotify: track, match: song, stage: .preparing, artwork: artwork)
          status = .spotifyPlays(tr("Preparing the karaoke version of \(track.name). Spotify plays it meanwhile."))
          watchReadiness(of: track, song: song, artwork: artwork)
        } else {
          now = Now(spotify: track, match: nil, stage: .missing, artwork: artwork)
          status = .spotifyPlays(tr("No karaoke version found for \(track.name)."))
        }
        return
      }
    }
  }

  /// Spotify has been playing this song meanwhile: KKaraoke's version picks up from where it has got to.
  private func takeOver(_ track: SpotifyTrack, with song: Track, artwork: URL?) {
    let position = (try? SpotifyApp.position()) ?? 0
    guard (try? holdSpotify()) != nil else { return }
    beganAt = Date()
    now = Now(spotify: track, match: song, stage: .singing, artwork: artwork)
    status = .singing(song.name)
    room?.setSpotifySong(song, at: position + 0.3)
  }

  /// Reads what Spotify has queued (once the Web API is connected), looks up the first few songs and starts preparing the
  /// ones that are not ready, and downloads the ready ones' audio, so each is there when its turn comes.
  func refreshAhead(thenPause: Bool = false) {
    aheadTask?.cancel()
    guard isEnabled, web.isConnected else {
      ahead = []
      room?.setSpotifyPrefetch([])
      return
    }
    aheadTask = Task { [weak self] in
      guard let self else { return }
      do {
        var read: [SpotifyQueued] = []
        var failure: Error?
        do { read = try await web.upcoming() } catch { failure = error }
        if thenPause, !Task.isCancelled { try? SpotifyApp.pause() } // held now; the rest can take its time
        if let failure { throw failure }
        let queued = Array(read.prefix(5))
        guard !Task.isCancelled else { return }
        ahead = queued.map { item in
          let known = readyMatches[item.track.id]
          return Ahead(spotify: item.track, match: known?.track, stage: known == nil ? .matching : .singing, artwork: item.artwork)
        }
        aheadMessage = nil
        for queuedItem in queued.prefix(Self.lookahead) {
          let item = queuedItem.track
          var match = readyMatches[item.id]
          var couldNotCheck = false
          if match == nil {
            if let client = clientProvider?() {
              // an answer of "none" is a missing song; no answer at all (the network, a busy server) is not
              do { match = try await client.matchSong(for: item, artwork: queuedItem.artwork, process: true) } catch { couldNotCheck = true }
            } else { couldNotCheck = true }
          }
          guard !Task.isCancelled else { return }
          if let match, match.ready { readyMatches[item.id] = match }
          if let index = ahead.firstIndex(where: { $0.id == item.id }) {
            ahead[index].match = match?.track
            ahead[index].stage = couldNotCheck ? .failed : (match?.track == nil ? .missing : (match?.ready == true ? .singing : .preparing))
          }
          if couldNotCheck { retryAheadSoon() }
          room?.setSpotifyPrefetch(ahead.compactMap { $0.stage == .singing ? $0.match : nil })
        }
      } catch {
        guard !Task.isCancelled else { return }
        aheadMessage = error.localizedDescription
      }
    }
  }

  private var aheadRetry: Task<Void, Never>?

  /// A song in the queue could not be checked: read the queue and look again shortly.
  private func retryAheadSoon() {
    guard aheadRetry == nil else { return }
    aheadRetry = Task { [weak self] in
      try? await Task.sleep(for: .seconds(20))
      guard let self, !Task.isCancelled else { return }
      aheadRetry = nil
      refreshAhead()
    }
  }

  /// While Spotify plays a song that is still being prepared, asks now and then whether it is ready; when it is, KKaraoke
  /// takes over from where Spotify has got to.
  private func watchReadiness(of track: SpotifyTrack, song: Track, artwork: URL?) {
    readiness?.cancel()
    readiness = Task { [weak self] in
      for _ in 0..<120 { // up to about twenty minutes
        try? await Task.sleep(for: .seconds(10))
        guard let self, !Task.isCancelled, spotifyTrack == track else { return }
        guard let client = clientProvider?(), let match = try? await client.matchSong(for: track, artwork: artwork, process: false),
              match.ready, let ready = match.track else { continue }
        guard !Task.isCancelled, spotifyTrack == track else { return }
        takeOver(track, with: ready, artwork: artwork)
        return
      }
    }
  }

  /// Silences and pauses Spotify, remembering the volume the person had.
  private func holdSpotify(pause: Bool = true) throws {
    if defaults.object(forKey: Keys.volume) == nil {
      let volume = try SpotifyApp.volume()
      defaults.set(volume > 0 ? volume : 60, forKey: Keys.volume)
    }
    if pause { try SpotifyApp.muteAndPause() } else { try SpotifyApp.setVolume(0) }
  }

  /// Play pressed here while nothing of ours is playing: start the song Spotify is on, instead of leaving the button dead.
  func playPressed() {
    guard isEnabled else { return }
    if let now, let held = spotifyTrack, now.spotify == held {
      try? SpotifyApp.playPause() // Spotify is playing it itself (no karaoke version yet)
    } else if let now {
      begin(now.spotify, artwork: now.artwork) // Spotify is paused on it
    } else {
      try? SpotifyApp.play() // Spotify has nothing: its announcement brings the song
    }
  }

  /// No karaoke version: Spotify plays this one itself.
  private func letSpotifyPlay() {
    restoreVolume()
    try? SpotifyApp.play()
  }

  /// Moves on to Spotify's next song: the Next button, and the end of a song. There is no queue of our own to consult.
  @discardableResult
  func skip() -> Bool {
    guard isEnabled else { return false }
    do { try SpotifyApp.next() } catch {
      status = .problem(error.localizedDescription)
      return false
    }
    return true
  }
}
