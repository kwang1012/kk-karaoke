import AppKit
import SwiftUI

/// Lyrics in a small window that floats above other apps: the line being sung and the one after it.
/// Opened from the player bar, and when the main window is minimized.
struct MiniLyricsView: View {
  @Environment(PlayerModel.self) private var player
  @Environment(\.dismissWindow) private var dismissWindow
  @State private var palette = CoverPalette.fallback
  @AppStorage("showRomanizedLyrics") private var showRomanized = false

  var body: some View {
    ZStack {
      palette.background
      VStack(spacing: 8) {
        content.padding(.horizontal, 24).padding(.top, 18)
        controls.padding(.horizontal, 16).padding(.bottom, 12)
      }
    }
    .foregroundStyle(.white)
    .exclusiveWindow(MiniLyrics.windowID)
    .containerBackground(palette.background, for: .window)
    .task(id: player.track?.artworkURL) {
      palette = .fallback
      let result = await CoverPalette.load(player.track?.artworkURL)
      guard !Task.isCancelled else { return }
      withAnimation(.easeInOut(duration: 0.5)) { palette = result }
    }
  }

  /// Previous, play or pause, next, and back to the main window.
  private var controls: some View {
    HStack(spacing: 14) {
      Button { player.perform(.previous) } label: { LucideIcon("skip-back", size: 16) }
        .help("Previous song").accessibilityLabel("Previous song")
      Button { player.toggle() } label: { LucideIcon(player.isPlaying ? "pause" : "play", size: 20) }
        .disabled(player.status != .ready).help(player.isPlaying ? "Pause" : "Play")
        .accessibilityLabel(player.isPlaying ? "Pause" : "Play")
      Button { player.perform(.next) } label: { LucideIcon("skip-forward", size: 16) }
        .help("Next song").accessibilityLabel("Next song")
      VStack(alignment: .leading, spacing: 0) {
        Text(player.track?.name ?? "Nothing playing").font(.system(size: 12, weight: .semibold)).lineLimit(1)
        Text(player.track?.artistText ?? "").font(.system(size: 11)).opacity(0.6).lineLimit(1)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Button { dismissWindow(id: MiniLyrics.windowID) } label: { LucideIcon("maximize", size: 16) }
        .help("Back to the main window").accessibilityLabel("Back to the main window")
    }
    .buttonStyle(.plain).pointerStyle(.link)
  }

  @ViewBuilder private var content: some View {
    if player.track == nil {
      message("Nothing playing")
    } else {
      switch player.lyrics {
      case .none, .loading: ProgressView().tint(.white)
      case .missing: message("No lyrics for this song")
      case .failed: LyricsFailed().scaleEffect(0.7)
      case .plain: message("These lyrics have no timing")
      case .synced(let lines):
        let _ = player.seekCount
        TimelineView(.animation(minimumInterval: 1.0 / 60, paused: !player.isPlaying)) { _ in
          let current = LyricsTiming.lineIndex(
            in: lines, at: player.currentTime, delay: player.lyricsDelay)
          VStack(alignment: .leading, spacing: 10) {
            ForEach(shown(current: current, count: lines.count), id: \.self) { index in
              PlaybackLyricLine(
                line: lines[index], active: current == index,
                completed: current.map { index < $0 } ?? false, delay: player.lyricsDelay,
                dim: palette.lyrics.opacity(0.7), showRomanized: showRomanized
              )
              .font(.system(size: current == index ? 26 : 20, weight: .bold))
              .frame(maxWidth: .infinity, alignment: .leading)
            }
          }
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
      }
    }
  }

  /// The line being sung and the next; before the first line, the first two.
  private func shown(current: Int?, count: Int) -> [Int] {
    let start = current ?? 0
    return Array(start..<min(count, start + 2))
  }

  private func message(_ text: LocalizedStringKey) -> some View {
    Text(text).font(.callout).opacity(0.7).frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

/// Opens the floating lyrics when the main window is minimized, and closes them when the main window comes back.
struct FloatingLyricsOnMinimize: ViewModifier {
  @Environment(\.openWindow) private var openWindow
  @Environment(\.dismissWindow) private var dismissWindow
  @AppStorage("floatingLyricsOnMinimize") private var enabled = true

  func body(content: Content) -> some View {
    content
      .onReceive(NotificationCenter.default.publisher(for: NSWindow.didMiniaturizeNotification)) { note in
        guard enabled, WindowFocus.isMain(note.object as? NSWindow), !WindowFocus.isVisible(MiniLyrics.windowID)
        else { return }
        openWindow(id: MiniLyrics.windowID)
      }
      .onReceive(NotificationCenter.default.publisher(for: NSWindow.didDeminiaturizeNotification)) { note in
        guard WindowFocus.isMain(note.object as? NSWindow) else { return }
        dismissWindow(id: MiniLyrics.windowID)
      }
  }
}

enum MiniLyrics { static let windowID = "lyrics-mini" }

/// One window at a time: the floating lyrics and the TV display each replace the main window while they are open,
/// and the main window comes back when they close.
@MainActor
enum WindowFocus {
  /// The windows that stand in for the main one.
  static let secondary = [MiniLyrics.windowID, "tv"]

  static func window(_ id: String) -> NSWindow? {
    NSApp.windows.first { $0.identifier?.rawValue.contains(id) == true }
  }
  static func isVisible(_ id: String) -> Bool { window(id)?.isVisible == true }
  static func isMain(_ window: NSWindow?) -> Bool { window?.identifier?.rawValue.contains("main") == true }

  static func hideMain() {
    guard let main = window("main"), !main.isMiniaturized else { return }
    main.orderOut(nil)
  }

  static func showMain() {
    guard !secondary.contains(where: isVisible), let main = window("main") else { return }
    if main.isMiniaturized { main.deminiaturize(nil) } else { main.makeKeyAndOrderFront(nil) }
    NSApp.activate()
  }
}

private struct ExclusiveWindow: ViewModifier {
  @Environment(\.dismissWindow) private var dismissWindow
  var id: String

  func body(content: Content) -> some View {
    content
      .onAppear {
        for other in WindowFocus.secondary where other != id && WindowFocus.isVisible(other) {
          dismissWindow(id: other)
        }
        WindowFocus.hideMain()
      }
      .onDisappear {
        // Going from one of these windows to the other must not flash the main window in between.
        Task {
          try? await Task.sleep(for: .milliseconds(250))
          WindowFocus.showMain()
        }
      }
  }
}

extension View {
  func exclusiveWindow(_ id: String) -> some View { modifier(ExclusiveWindow(id: id)) }
}
