import Foundation

/// What the desktop widget shows. The app writes it into the app group's shared folder and the widget reads it:
/// the widget is a separate process and cannot ask the app.
struct WidgetSnapshot: Codable, Equatable, Sendable {
  var title: String?
  var artist: String?
  var isPlaying = false
  var nextTitle: String?
  /// Songs waiting after the current one.
  var upNext = 0
  var updatedAt = Date()

  /// Team-prefixed, which macOS accepts for app groups without a provisioning profile.
  static let group = "V3XYRJ87X8.app.kkaraoke.KKaraoke"

  static var folder: URL? { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) }
  static var file: URL? { folder?.appendingPathComponent("now-playing.json") }
  static var coverFile: URL? { folder?.appendingPathComponent("cover.png") }

  static func load() -> WidgetSnapshot? {
    guard let file, let data = try? Data(contentsOf: file) else { return nil }
    return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
  }

  func save() {
    guard let file = Self.file, let data = try? JSONEncoder().encode(self) else { return }
    try? data.write(to: file, options: .atomic)
  }
}
