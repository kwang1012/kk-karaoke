import AppKit
import SwiftUI

/// A black pill that grows out of the camera notch (or hangs from the top edge on Macs without one): the cover and
/// an equalizer beside the notch while a song plays, and on hover the lyrics and controls. Not an Apple feature:
/// it is a borderless panel placed over the menu bar, sized from the screen's notch.
@MainActor
final class NotchPanelController {
  private let player: PlayerModel
  private var panel: NSPanel?
  private var expanded = false
  private var collapseTask: Task<Void, Never>?

  init(player: PlayerModel) {
    self.player = player
    NotificationCenter.default.addObserver(
      forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
    ) { [weak self] _ in Task { @MainActor in self?.place(animated: false) } }
  }

  /// Shown while enabled and a song is chosen.
  func update(visible: Bool) {
    guard visible else { panel?.orderOut(nil); return }
    if panel == nil { makePanel() }
    place(animated: false)
    panel?.orderFrontRegardless()
  }

  func hover(_ inside: Bool) {
    collapseTask?.cancel()
    if inside {
      setExpanded(true)
    } else {
      collapseTask = Task {
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled else { return }
        setExpanded(false)
      }
    }
  }

  private func setExpanded(_ value: Bool) {
    guard expanded != value else { return }
    expanded = value
    place(animated: true)
  }

  private func makePanel() {
    let panel = NSPanel(
      contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    panel.isFloatingPanel = true
    panel.level = .statusBar
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = false
    panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
    let notch = Self.geometry(of: Self.targetScreen())
    let view = NotchView(notchWidth: notch.width, notchHeight: notch.height) { [weak self] in
      self?.hover($0)
    }
    .environment(player)
    panel.contentView = NSHostingView(rootView: view)
    self.panel = panel
  }

  private func place(animated: Bool) {
    guard let panel, let screen = Self.targetScreen() else { return }
    let notch = Self.geometry(of: screen)
    let size =
      expanded
      ? NSSize(width: max(440, notch.width + 160), height: notch.height + 118)
      : NSSize(width: notch.width + 2 * 44, height: notch.height)
    let frame = NSRect(
      x: screen.frame.midX - size.width / 2, y: screen.frame.maxY - size.height,
      width: size.width, height: size.height)
    panel.setFrame(frame, display: true, animate: animated)
  }

  /// The screen with a notch, else the main one.
  private static func targetScreen() -> NSScreen? {
    NSScreen.screens.first { $0.safeAreaInsets.top > 0 } ?? NSScreen.main
  }

  /// Notch width and height; without a notch, a stand-in as tall as the menu bar and as wide as a notch.
  static func geometry(of screen: NSScreen?) -> (width: CGFloat, height: CGFloat) {
    guard let screen else { return (180, 24) }
    guard screen.safeAreaInsets.top > 0, let left = screen.auxiliaryTopLeftArea,
      let right = screen.auxiliaryTopRightArea
    else { return (180, max(24, NSStatusBar.system.thickness)) }
    return (screen.frame.width - left.width - right.width, screen.safeAreaInsets.top)
  }
}

private struct NotchView: View {
  @Environment(PlayerModel.self) private var player
  @State private var inside = false
  @AppStorage("showRomanizedLyrics") private var showRomanized = false
  var notchWidth: CGFloat
  var notchHeight: CGFloat
  var onHover: (Bool) -> Void

  var body: some View {
    VStack(spacing: 0) {
      header
      if inside { details.transition(.opacity) }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(
      .black,
      in: UnevenRoundedRectangle(bottomLeadingRadius: 18, bottomTrailingRadius: 18, style: .continuous)
    )
    .foregroundStyle(.white)
    .onHover { hovering in
      withAnimation(.easeOut(duration: 0.2)) { inside = hovering }
      onHover(hovering)
    }
  }

  /// Level with the notch: the cover on its left, the equalizer on its right.
  private var header: some View {
    HStack(spacing: 0) {
      Artwork(url: player.track?.artworkURL, size: notchHeight - 10, radius: 4).padding(.leading, 12)
      Spacer(minLength: notchWidth)
      Equalizer(playing: player.isPlaying).frame(width: 16, height: notchHeight - 14).padding(.trailing, 14)
    }
    .frame(height: notchHeight)
  }

  @ViewBuilder private var details: some View {
    VStack(spacing: 8) {
      lyrics.frame(maxWidth: .infinity, alignment: .leading).frame(height: 56, alignment: .top)
      HStack(spacing: 16) {
        VStack(alignment: .leading, spacing: 1) {
          Text(player.track?.name ?? "").font(.system(size: 12, weight: .semibold)).lineLimit(1)
          Text(player.track?.artistText ?? "").font(.system(size: 11)).opacity(0.6).lineLimit(1)
        }
        Spacer()
        Button { player.perform(.previous) } label: { LucideIcon("skip-back", size: 16) }
        Button { player.toggle() } label: { LucideIcon(player.isPlaying ? "pause" : "play", size: 18) }
          .disabled(player.status != .ready)
        Button { player.perform(.next) } label: { LucideIcon("skip-forward", size: 16) }
      }
      .buttonStyle(.plain).stableCursor(.link)
    }
    .padding(.horizontal, 18).padding(.bottom, 12)
  }

  @ViewBuilder private var lyrics: some View {
    if case .synced(let lines) = player.lyrics {
      let _ = player.seekCount
      TimelineView(.animation(minimumInterval: 1.0 / 60, paused: !player.isPlaying)) { _ in
        let current = LyricsTiming.lineIndex(in: lines, at: player.currentTime, delay: player.lyricsDelay)
        let start = current ?? 0
        VStack(alignment: .leading, spacing: 4) {
          ForEach(Array(start..<min(lines.count, start + 2)), id: \.self) { index in
            PlaybackLyricLine(
              line: lines[index], active: current == index,
              completed: current.map { index < $0 } ?? false, delay: player.lyricsDelay,
              dim: .white.opacity(0.45), showRomanized: showRomanized
            )
            .font(.system(size: current == index ? 18 : 14, weight: .bold)).lineLimit(2)
          }
        }
      }
    } else {
      Text(player.lyrics == .missing ? "No lyrics for this song" : "").font(.callout).opacity(0.6)
    }
  }
}

private struct Equalizer: View {
  var playing: Bool
  var body: some View {
    TimelineView(.animation(minimumInterval: 1.0 / 20, paused: !playing)) { context in
      let t = context.date.timeIntervalSinceReferenceDate
      HStack(alignment: .center, spacing: 2) {
        ForEach(0..<4, id: \.self) { i in
          Capsule().fill(AppTheme.accent)
            .frame(width: 2.5, height: playing ? 4 + 8 * abs(sin(t * 5 + Double(i) * 1.3)) : 4)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}
