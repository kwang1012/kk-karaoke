import AppKit
import Foundation
import Observation

/// A song as Spotify names it.
struct SpotifyTrack: Equatable, Sendable {
  var id: String
  var name: String
  var artist: String

  init?(id: String?, name: String?, artist: String?) {
    guard let id, !id.isEmpty, let name, !name.isEmpty else { return nil }
    self.id = id
    self.name = name
    self.artist = artist ?? ""
  }
}

enum SpotifyPlayState: String, Sendable { case playing = "Playing", paused = "Paused", stopped = "Stopped" }

/// What Spotify announced: its state, and the song it is on.
struct SpotifyEvent: Equatable, Sendable {
  var state: SpotifyPlayState
  var track: SpotifyTrack?

  /// The `userInfo` of Spotify's `com.spotify.client.PlaybackStateChanged` notification.
  init?(userInfo: [AnyHashable: Any]?) {
    guard let userInfo, let raw = userInfo["Player State"] as? String, let state = SpotifyPlayState(rawValue: raw) else { return nil }
    self.state = state
    track = SpotifyTrack(id: userInfo["Track ID"] as? String, name: userInfo["Name"] as? String, artist: userInfo["Artist"] as? String)
  }

  init(state: SpotifyPlayState, track: SpotifyTrack?) {
    self.state = state
    self.track = track
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
  /// Moves Spotify to its next song and has it start. Whether a paused Spotify starts the song it skips to varies, and
  /// this must announce the new song either way, so it is asked to play (it is silent: its volume is 0 while held).
  static func next() throws { try run("next track\nplay") }
  /// Silences Spotify and holds it, in one step, so nothing leaks out between the two.
  static func muteAndPause() throws { try run("set sound volume to 0\npause") }

  /// What Spotify is on right now.
  static func current() throws -> SpotifyEvent? {
    let answer = try run("""
      if player state is stopped then return {"Stopped"}
      return {player state as string, id of current track, name of current track, artist of current track}
      """)
    guard let raw = answer.atIndex(1)?.stringValue else { return nil }
    let state = SpotifyPlayState(rawValue: raw.capitalized) ?? .stopped
    return SpotifyEvent(state: state, track: SpotifyTrack(
      id: answer.atIndex(2)?.stringValue, name: answer.atIndex(3)?.stringValue, artist: answer.atIndex(4)?.stringValue))
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

  private enum Keys { static let enabled = "spotifyTakeover", volume = "spotifyVolumeToRestore" }

  private(set) var status: Status = .off
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
    if SpotifyApp.isRunning, let event = try? SpotifyApp.current() { heard(event) }
  }

  private func stop() {
    if let observer { DistributedNotificationCenter.default().removeObserver(observer) }
    observer = nil
    matching?.cancel()
    spotifyTrack = nil
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
    guard isEnabled, event.state == .playing, let track = event.track else { return }
    guard let room, !room.isFollowing else {
      status = .problem(tr("Another device plays this room, so Spotify plays as usual."))
      return
    }
    if track == spotifyTrack {
      // Play pressed in Spotify on the song held here: that is "play" or "pause" for the karaoke version
      if case .singing = status { try? SpotifyApp.pause(); player?.toggle() }
      return
    }
    begin(track)
  }

  private func begin(_ track: SpotifyTrack) {
    spotifyTrack = track
    matching?.cancel()
    status = .matching(track.name)
    do { try holdSpotify() } catch {
      status = .problem(error.localizedDescription)
      return
    }
    matching = Task { [weak self] in
      guard let self else { return }
      var outcome: Status
      var found: Track?
      do {
        guard let client = clientProvider?() else { throw APIError.badURL }
        let match = try await client.matchSong(title: track.name, artist: track.artist, process: true)
        if let song = match.track, match.ready {
          found = song
          outcome = .singing(song.name)
        } else {
          outcome = .spotifyPlays(match.track == nil ? tr("No karaoke version found for \(track.name).") : tr("Preparing the karaoke version of \(track.name)."))
        }
      } catch {
        outcome = .spotifyPlays(error.localizedDescription)
      }
      guard !Task.isCancelled, spotifyTrack == track else { return } // the person moved on while this was looked up
      status = outcome
      if let found { room?.setSpotifySong(found) } else { room?.setSpotifySong(nil); letSpotifyPlay() }
    }
  }

  /// Silences and pauses Spotify, remembering the volume the person had.
  private func holdSpotify() throws {
    if defaults.object(forKey: Keys.volume) == nil {
      let volume = try SpotifyApp.volume()
      defaults.set(volume > 0 ? volume : 60, forKey: Keys.volume)
    }
    try SpotifyApp.muteAndPause()
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
