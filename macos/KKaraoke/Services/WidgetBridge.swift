import AppKit
import WidgetKit

/// Keeps the desktop widget's snapshot (and cover) in step with what is playing.
@MainActor
final class WidgetBridge {
  private var last: WidgetSnapshot?
  private var coverID: String?
  private var coverTask: Task<Void, Never>?

  func update(player: PlayerModel, room: RoomModel) {
    var snapshot = WidgetSnapshot(
      title: player.track?.name, artist: player.track?.artistText, isPlaying: player.isPlaying)
    let after = room.queue.dropFirst(max(0, room.queueIdx + 1))
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
