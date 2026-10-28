import AppKit
import SwiftUI

/// Lyrics in a small window that floats above other apps: the line being sung and the one after it.
/// Opened from the player bar, and when the main window is minimized.
struct MiniLyricsView: View {
  @Environment(PlayerModel.self) private var player
  @State private var palette = CoverPalette.fallback
  /// The level to come back to when the speaker button unmutes.
  @State private var unmutedVolume = 1.0
  @AppStorage("showRomanizedLyrics") private var showRomanized = false

  var body: some View {
    ZStack {
      palette.background
      VStack(spacing: 8) {
        content
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
          .padding(.horizontal, 24).padding(.top, 18)
        controls.frame(height: 28).padding(.horizontal, 16).padding(.bottom, 12)
      }
    }
    .frame(minWidth: 480, minHeight: 180)
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

  /// Playback and volume; the window’s close button returns to the main window.
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
      Button { player.perform(.toggleVocal) } label: {
        HStack(spacing: 4) {
          LucideIcon(player.fullVocal ? "mic" : "mic-off", size: 13)
          Text(player.fullVocal ? "Vocal" : "Karaoke").font(.system(size: 11, weight: .medium)).lineLimit(1)
            .fixedSize()
        }
        .padding(.horizontal, 9).frame(height: 26)
        .background(.white.opacity(0.16), in: Capsule())
      }
      .help("Toggle original vocal").accessibilityLabel(player.fullVocal ? "Vocal" : "Karaoke")
      HStack(spacing: 6) {
        Button {
          if player.masterVolume == 0 {
            player.masterVolume = unmutedVolume
          } else {
            unmutedVolume = player.masterVolume
            player.masterVolume = 0
          }
        } label: { LucideIcon(player.masterVolume == 0 ? "volume-x" : "volume-2", size: 16) }
          .help(player.masterVolume == 0 ? "Unmute" : "Mute")
          .accessibilityLabel(player.masterVolume == 0 ? "Unmute" : "Mute")
        Slider(value: Binding(get: { player.masterVolume }, set: { player.masterVolume = $0 }), in: 0...1)
          .controlSize(.mini).tint(.white).frame(width: 64).stableCursor(.link).accessibilityLabel("Volume")
      }
    }
    .buttonStyle(.plain).stableCursor(.link)
  }

  @ViewBuilder private var content: some View {
    if player.track == nil {
      message("Nothing playing")
    } else {
      switch player.lyrics {
      case .none, .loading: MiniLyricsSkeleton()
      case .missing: message("No lyrics for this song")
      case .failed: LyricsFailed().scaleEffect(0.7)
      case .plain: message("These lyrics have no timing")
      case .synced(let lines):
        let _ = player.seekCount
        TimelineView(.animation(minimumInterval: 1.0 / 60, paused: !player.isPlaying)) { _ in
          let current = LyricsTiming.lineIndex(
            in: lines, at: player.currentTime, delay: player.lyricsDelay)
          let activeLines = LyricsTiming.activeIndices(in: lines, at: player.currentTime, delay: player.lyricsDelay)
          VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(activeLines.union(activeLines.count < 2 ? shown(current: current, count: lines.count) : [])).sorted(), id: \.self) { index in
              PlaybackLyricLine(
                line: lines[index], active: activeLines.contains(index),
                completed: (current.map { index < $0 } ?? false) && !activeLines.contains(index), delay: player.lyricsDelay,
                dim: palette.lyrics.opacity(0.7), showRomanized: showRomanized, showSinger: LyricsTiming.hasDuetParts(lines),
                showSingerLabel: LyricsTiming.startsVocalPart(lines[index], previous: lines[safe: index - 1])
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

/// Two placeholder lines with the same alignment and footprint as the compact lyrics.
struct MiniLyricsSkeleton: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var pulse = false

  var body: some View {
    GeometryReader { geometry in
      VStack(alignment: .leading, spacing: 10) {
        RoundedRectangle(cornerRadius: 6).frame(width: geometry.size.width * 0.72, height: 26)
        RoundedRectangle(cornerRadius: 5).frame(width: geometry.size.width * 0.54, height: 20)
      }
      .foregroundStyle(.white.opacity(reduceMotion || pulse ? 0.16 : 0.08))
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
    .animation(reduceMotion ? nil : .easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: pulse)
    .onAppear { pulse = true }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Loading…")
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

enum MiniLyrics {
  static let windowID = "lyrics-mini"

  @MainActor static func configure(_ window: NSWindow) {
    window.collectionBehavior.remove([.fullScreenPrimary, .fullScreenAuxiliary])
    window.collectionBehavior.insert(.fullScreenNone)
    window.standardWindowButton(.zoomButton)?.isHidden = true
    window.standardWindowButton(.zoomButton)?.isEnabled = false
  }
}

/// One window at a time: the floating lyrics and the TV display each replace the main window while they are open,
/// and the main window comes back when they close.
@MainActor
enum WindowFocus {
  /// The windows that stand in for the main one.
  static let secondary = [MiniLyrics.windowID, "tv"]

  static func window(_ id: String, in windows: [NSWindow] = NSApp.windows) -> NSWindow? {
    windows.first { $0.identifier?.rawValue.contains(id) == true }
  }
  static func isVisible(_ id: String) -> Bool { window(id)?.isVisible == true }
  static func isMain(_ window: NSWindow?) -> Bool { window?.identifier?.rawValue.contains("main") == true }

  static func hideMain() {
    guard let main = window("main"), !main.isMiniaturized else { return }
    main.orderOut(nil)
  }

  static func showMain(windows: [NSWindow] = NSApp.windows, createMain: () -> Void = {}) {
    guard !secondary.contains(where: { window($0, in: windows)?.isVisible == true }) else { return }
    if let main = window("main", in: windows) {
      if main.isMiniaturized { main.deminiaturize(nil) }
      main.makeKeyAndOrderFront(nil)
    } else {
      createMain()
    }
    NSApp.activate()
  }
}

private struct ExclusiveWindow: ViewModifier {
  @Environment(\.dismissWindow) private var dismissWindow
  @Environment(\.openWindow) private var openWindow
  @State private var window: NSWindow?
  var id: String

  func body(content: Content) -> some View {
    content
      .background(WindowReader { window in
        self.window = window
        if id == MiniLyrics.windowID { MiniLyrics.configure(window) }
      })
      .onAppear {
        for other in WindowFocus.secondary where other != id && WindowFocus.isVisible(other) {
          dismissWindow(id: other)
        }
        WindowFocus.hideMain()
      }
      // SwiftUI may keep a closed Window's content alive, so onDisappear alone is not enough.
      .onReceive(NotificationCenter.default.publisher(for: NSWindow.willCloseNotification)) { note in
        guard let closed = note.object as? NSWindow, closed === window else { return }
        restoreMain()
      }
      .onDisappear { restoreMain() }
  }

  private func restoreMain() {
    // Let AppKit finish closing and any replacement secondary window appear first.
    Task {
      try? await Task.sleep(for: .milliseconds(250))
      WindowFocus.showMain { openWindow(id: "main") }
    }
  }
}

extension View {
  func exclusiveWindow(_ id: String) -> some View { modifier(ExclusiveWindow(id: id)) }
}
