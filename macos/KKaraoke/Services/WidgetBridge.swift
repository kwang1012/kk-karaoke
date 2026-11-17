import AppKit
import Observation
import WidgetKit

/// Keeps the desktop widget's snapshot (and cover) in step with what is playing.
@MainActor
final class WidgetBridge {
  private var last: WidgetSnapshot?
  private var coverID: String?
  private var coverTask: Task<Void, Never>?

  private var watching = false

  /// Follows the player and the queue for as long as the app runs. This used to hang off the main window's view, so
  /// closing the window (the app stays in the menu bar) stopped every update and the widget froze on the last song.
  func start(player: PlayerModel, room: RoomModel) {
    guard !watching else { return }
    watching = true
    update(player: player, room: room)
    observe(player: player, room: room)
  }

  private func observe(player: PlayerModel, room: RoomModel) {
    withObservationTracking {
      _ = (player.track?.id, player.isPlaying, room.queue, room.queueIdx, room.followsSpotify)
    } onChange: { [weak self] in
      // called just before the change lands: look again once it has
      Task { @MainActor in
        guard let self else { return }
        self.update(player: player, room: room)
        self.observe(player: player, room: room)
      }
    }
  }

  /// The app is closing: the widget must not keep saying a song is playing.
  static func clear() {
    WidgetSnapshot().save()
    if let file = WidgetSnapshot.coverFile { try? FileManager.default.removeItem(at: file) }
    WidgetCenter.shared.reloadAllTimelines()
  }

  func update(player: PlayerModel, room: RoomModel) {
    var snapshot = WidgetSnapshot(
      title: player.track?.name, artist: player.track?.artistText, isPlaying: player.isPlaying)
    let after = room.upcoming
    snapshot.nextTitle = after.first?.name
    snapshot.upNext = after.count
    snapshot.updatedAt = last?.updatedAt ?? snapshot.updatedAt
    guard snapshot != last else { return }
    snapshot.updatedAt = Date()
    last = snapshot
    snapshot.save()
    updateCover(for: player.track)
    WidgetCenter.shared.reloadAllTimelines()
  }

  private func updateCover(for track: Track?) {
    guard track?.id != coverID else { return }
    coverID = track?.id
    coverTask?.cancel()
    guard let track, let url = track.artworkURL, let file = WidgetSnapshot.coverFile else {
      if let file = WidgetSnapshot.coverFile { try? FileManager.default.removeItem(at: file) }
      return
    }
    coverTask = Task {
      guard let (data, _) = try? await URLSession.shared.data(from: url), !Task.isCancelled,
        let image = NSImage(data: data), let png = Self.thumbnail(image)
      else { return }
      try? png.write(to: file, options: .atomic)
      WidgetCenter.shared.reloadAllTimelines()
    }
  }

  /// Widgets have a small memory budget: a small square is plenty.
  private static func thumbnail(_ image: NSImage) -> Data? {
    let side: CGFloat = 200
    let target = NSImage(size: NSSize(width: side, height: side))
    target.lockFocus()
    image.draw(in: NSRect(x: 0, y: 0, width: side, height: side), from: .zero, operation: .copy, fraction: 1)
    target.unlockFocus()
    guard let tiff = target.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { return nil }
    return rep.representation(using: .png, properties: [:])
  }
}
