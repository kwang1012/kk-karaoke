import AppKit
import AppIntents
@preconcurrency import CoreSpotlight
import UserNotifications

/// How the parts of the app that run outside a window (the Dock menu, Shortcuts, Spotlight) reach the models.
@MainActor
final class AppBridge {
  static let shared = AppBridge()
  weak var player: PlayerModel?
  weak var room: RoomModel?
  weak var offline: OfflineLibrary?
  weak var model: AppModel?

  /// A song by id: a downloaded one, else the server's library.
  func track(id: String) async -> Track? {
    if let pinned = offline?.tracks.first(where: { $0.id == id }) { return pinned }
    return try? await model?.client?.library().first { $0.id == id }
  }

  /// Songs whose name or artist contain `text`, from the downloads and the library.
  func tracks(matching text: String) async -> [Track] {
    var all = offline?.tracks ?? []
    if let library = try? await model?.client?.library() {
      all += library.filter { song in !all.contains { $0.id == song.id } }
    }
    guard !text.isEmpty else { return Array(all.prefix(25)) }
    return all.filter { "\($0.name) \($0.artistText)".localizedCaseInsensitiveContains(text) }
  }
}

// MARK: Dock

final class AppDelegate: NSObject, NSApplicationDelegate {
  @MainActor func applicationDockMenu(_ sender: NSApplication) -> NSMenu? {
    guard let player = AppBridge.shared.player else { return nil }
    let menu = NSMenu()
    if let track = player.track {
      let title = NSMenuItem(title: track.name, action: nil, keyEquivalent: "")
      title.isEnabled = false
      menu.addItem(title)
      menu.addItem(.separator())
    }
    menu.addItem(ActionItem(player.isPlaying ? tr("Pause") : tr("Play")) { player.toggle() })
    menu.addItem(ActionItem(tr("Next Song")) { player.perform(.next) })
    menu.addItem(ActionItem(tr("Previous Song")) { player.perform(.previous) })
    return menu
  }
}

@MainActor private final class ActionItem: NSMenuItem {
  private let handler: @MainActor () -> Void
  init(_ title: String, handler: @escaping @MainActor () -> Void) {
    self.handler = handler
    super.init(title: title, action: #selector(run), keyEquivalent: "")
    target = self
  }
  required init(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  @objc private func run() { handler() }
}

// MARK: Notifications

/// Tells you when a song is ready or downloaded while you are in another app. Permission is asked for the first time
/// a song starts processing, which is when it is clear what the notification is for.
@MainActor
enum AppNotifier {
  private static var asked = false

  static func prepare() {
    guard !asked, Bundle.main.bundleIdentifier != nil else { return }
    asked = true
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
  }

  static func songReady(_ track: Track) {
    post(title: tr("Ready to sing"), body: tr("\(track.name) is ready. The vocals are removed, so you can sing it now."), id: "ready-\(track.id)")
  }

  static func downloaded(_ track: Track) {
    post(title: tr("Downloaded"), body: tr("\(track.name) is saved for offline singing."), id: "pinned-\(track.id)")
  }

  private static func post(title: String, body: String, id: String) {
    // The unit tests host the app and pin a stub song: they must not notify the person running them.
    guard !NSApp.isActive, Bundle.main.bundleIdentifier != nil,
      ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil
    else { return }
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
  }

  static func badge(_ count: Int) { NSApp.dockTile.badgeLabel = count > 0 ? String(count) : nil }
}

// MARK: Spotlight

/// Songs you can sing, findable from Spotlight: the library and the downloads.
@MainActor
enum SpotlightIndex {
  static func index(_ tracks: [Track]) {
    let items = tracks.map { track -> CSSearchableItem in
      let attributes = CSSearchableItemAttributeSet(contentType: .audio)
      attributes.title = track.name
      attributes.artist = track.artistText
      attributes.album = track.album?.name
      attributes.contentDescription = tr("Sing along in KKaraoke")
      return CSSearchableItem(
        uniqueIdentifier: "track:\(track.id)", domainIdentifier: "app.kkaraoke.songs", attributeSet: attributes)
    }
    let index = CSSearchableIndex.default()
    index.deleteSearchableItems(withDomainIdentifiers: ["app.kkaraoke.songs"]) { _ in
      index.indexSearchableItems(items) { _ in }
    }
  }

  /// The song id in a Spotlight result's activity, if it is one of ours.
  static func trackID(from activity: NSUserActivity) -> String? {
    guard let id = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String, id.hasPrefix("track:")
    else { return nil }
    return String(id.dropFirst("track:".count))
  }
}

// MARK: Shortcuts and Siri

struct SongEntity: AppEntity {
  static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Song")
  static let defaultQuery = SongQuery()
  var id: String
  var name: String
  var artist: String
  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)", subtitle: "\(artist)")
  }
}

struct SongQuery: EntityStringQuery {
  @MainActor func entities(for identifiers: [String]) async throws -> [SongEntity] {
    var found: [SongEntity] = []
    for id in identifiers {
      if let track = await AppBridge.shared.track(id: id) { found.append(SongEntity(track)) }
    }
    return found
  }
  @MainActor func entities(matching string: String) async throws -> [SongEntity] {
    await AppBridge.shared.tracks(matching: string).map(SongEntity.init)
  }
  @MainActor func suggestedEntities() async throws -> [SongEntity] {
    await AppBridge.shared.tracks(matching: "").map(SongEntity.init)
  }
}

extension SongEntity {
  init(_ track: Track) { self.init(id: track.id, name: track.name, artist: track.artistText) }
}

struct SingSongIntent: AppIntent {
  static let title: LocalizedStringResource = "Sing a Song"
  static let description = IntentDescription("Starts a song in KKaraoke.")
  static let openAppWhenRun = true
  @Parameter(title: "Song") var song: SongEntity

  @MainActor func perform() async throws -> some IntentResult {
    guard let track = await AppBridge.shared.track(id: song.id), let room = AppBridge.shared.room else {
      throw $song.needsValueError("KKaraoke couldn't find that song.")
    }
    room.playNow(track)
    return .result()
  }
}

struct PlayPauseIntent: AppIntent {
  static let title: LocalizedStringResource = "Play or Pause"
  @MainActor func perform() async throws -> some IntentResult {
    AppBridge.shared.player?.toggle()
    return .result()
  }
}

struct NextSongIntent: AppIntent {
  static let title: LocalizedStringResource = "Next Song"
  @MainActor func perform() async throws -> some IntentResult {
    AppBridge.shared.player?.perform(.next)
    return .result()
  }
}

struct KKaraokeShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: SingSongIntent(), phrases: ["Sing \(\.$song) in \(.applicationName)", "Play \(\.$song) in \(.applicationName)"],
      shortTitle: "Sing a Song", systemImageName: "mic")
    AppShortcut(
      intent: PlayPauseIntent(), phrases: ["Play or pause \(.applicationName)"], shortTitle: "Play or Pause",
      systemImageName: "playpause")
    AppShortcut(
      intent: NextSongIntent(), phrases: ["Next song in \(.applicationName)"], shortTitle: "Next Song",
      systemImageName: "forward")
  }
}
