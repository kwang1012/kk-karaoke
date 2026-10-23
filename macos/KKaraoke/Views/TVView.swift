import AppKit
import SwiftUI

struct TVView: View {
  @Environment(PlayerModel.self) private var player
  @Environment(RoomModel.self) private var room
  @Environment(SingingModel.self) private var singing
  @Environment(\.dismissWindow) private var dismissWindow
  @State private var palette = CoverPalette.fallback
  @State private var controlsVisible = true
  @State private var lastInteraction = Date()
  @State private var displayActivity: NSObjectProtocol?
  @State private var window: NSWindow?
  @State private var isFullscreen = false

  var body: some View {
    GeometryReader { geometry in
      let unit = geometry.size.width / 100
      ZStack {
        palette.background.ignoresSafeArea()
        if let url = player.track?.artworkURL {
          AsyncImage(url: url) { image in
            image.resizable().scaledToFill().frame(
              width: geometry.size.width, height: geometry.size.height
            )
            .clipped().blur(radius: 60).opacity(0.3)
          } placeholder: {
            Color.clear
          }
          .allowsHitTesting(false)
        }
        LinearGradient(
          colors: [.black.opacity(0.3), .clear, .black.opacity(0.6)], startPoint: .top,
          endPoint: .bottom
        )
        .ignoresSafeArea()
        if let track = player.track {
          VStack(spacing: 0) {
            HStack(alignment: .top) {
              VStack(alignment: .leading, spacing: 4) {
                Text(track.name).font(.system(size: unit * 2.6, weight: .bold)).lineLimit(1)
                Text(track.artistText).font(.system(size: unit * 1.6)).opacity(0.7).lineLimit(1)
              }
              Spacer()
              if let by = track.orderedBy {
                HStack(spacing: unit * 0.9) {
                  UserAvatar(avatar: by.avatar, name: by.name, size: unit * 3.4)
                  Text(by.name).font(.system(size: unit * 1.7, weight: .semibold)).lineLimit(1)
                }.padding(unit * 0.4).padding(.trailing, unit).background(
                  .black.opacity(0.4), in: Capsule())
              }
            }
            VStack(spacing: unit) {
              if singing.showMelody, singing.melodyState == .ready {
                PitchRollView().frame(height: min(120, geometry.size.height * 0.18))
              }
              lyrics(unit: unit)
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
            footer(unit: unit)
          }.padding(.horizontal, unit * 5).padding(.top, unit * 3).padding(.bottom, unit * 2.5)
        } else {
          VStack(spacing: unit * 2.5) {
            HStack(spacing: unit * 1.2) {
              Image("AppLogo").resizable().scaledToFit().frame(width: unit * 5, height: unit * 5)
              Text("KKaraoke").font(.system(size: unit * 4, weight: .bold))
            }
            Text("Join the room and add your first song").font(
              .system(size: unit * 2.2, weight: .medium))
            joinCard(unit: unit, large: true)
          }
        }
        VStack {
          HStack {
            Spacer()
            if controlsVisible {
              Button {
                window?.toggleFullScreen(nil)
              } label: {
                LucideIcon(isFullscreen ? "minimize" : "maximize", size: 16)
              }
              .buttonStyle(WebButtonStyle(background: .black.opacity(0.4)))
              .keyboardShortcut("f", modifiers: [])
              .help(isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)")
              .accessibilityLabel(isFullscreen ? "Exit fullscreen" : "Enter fullscreen")
              Button {
                dismissWindow(id: "tv")
              } label: {
                Label("Exit TV", lucide: "log-out")
              }
              .buttonStyle(WebButtonStyle(background: .black.opacity(0.4)))
            }
          }
          .overlay(alignment: .center) {
            if player.track != nil, !player.isPlaying, player.status == .ready {
              Label("Paused", lucide: "pause").padding(10)
                .background(.black.opacity(0.5), in: Capsule()).allowsHitTesting(false)
            }
          }
          Spacer()
          if player.track != nil {
            HStack(spacing: 12) {
              Button {
                player.perform(.previous)
              } label: {
                LucideIcon("skip-back", size: 24)
              }.help("Previous song")
              Button {
                player.toggle()
              } label: {
                LucideIcon(player.isPlaying ? "pause" : "play", size: 28)
              }
              .keyboardShortcut(.space, modifiers: []).help(player.isPlaying ? "Pause" : "Play")
              Button {
                player.perform(.next)
              } label: {
                LucideIcon("skip-forward", size: 24)
              }.help("Next song")
              StageControls()
            }.buttonStyle(WebIconButtonStyle()).padding(8).background(
              .black.opacity(0.65), in: Capsule()
            )
            .opacity(controlsVisible ? 1 : 0).allowsHitTesting(controlsVisible)
          }
        }.padding(12)
      }.foregroundStyle(.white).clipped()
        .onContinuousHover { phase in
          if case .active = phase {
            lastInteraction = .now
            controlsVisible = true
          }
        }
    }
    .preferredColorScheme(.dark).frame(minWidth: 800, minHeight: 480)
    .exclusiveWindow("tv")
    .background(WindowReader { found in
      window = found
      found.collectionBehavior.formUnion([.fullScreenPrimary, .fullScreenAllowsTiling])
      isFullscreen = found.styleMask.contains(.fullScreen)
    })
    .onReceive(NotificationCenter.default.publisher(for: NSWindow.didEnterFullScreenNotification)) { note in
      if (note.object as? NSWindow) === window { isFullscreen = true }
    }
    .onReceive(NotificationCenter.default.publisher(for: NSWindow.didExitFullScreenNotification)) { note in
      if (note.object as? NSWindow) === window { isFullscreen = false }
    }
    .task(id: player.track?.artworkURL) {
      palette = .fallback
      let result = await CoverPalette.load(player.track?.artworkURL)
      guard !Task.isCancelled else { return }
      withAnimation(.easeInOut(duration: 0.5)) { palette = result }
    }
    .task {
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(1))
        if Date().timeIntervalSince(lastInteraction) > 3 {
          withAnimation(.easeOut(duration: 0.25)) { controlsVisible = false }
        }
      }
    }
    .onAppear {
      displayActivity = ProcessInfo.processInfo.beginActivity(
        options: [.idleDisplaySleepDisabled], reason: "Karaoke TV display")
    }
    .onDisappear {
      if let displayActivity { ProcessInfo.processInfo.endActivity(displayActivity) }
      displayActivity = nil
    }
    .focusable().focusEffectDisabled()
    .onKeyPress(.escape) {
      dismissWindow(id: "tv")
      return .handled
    }
    .onKeyPress(.rightArrow) {
      player.seek(to: min(player.duration, player.currentTime + 5))
      return .handled
    }
    .onKeyPress(.leftArrow) {
      player.seek(to: max(0, player.currentTime - 5))
      return .handled
    }
  }

  @ViewBuilder private func lyrics(unit: CGFloat) -> some View {
    switch player.status {
    case .failed(let message): Text(message).font(.system(size: unit * 2.6, weight: .semibold))
    case .loading: ProgressView().tint(.white).controlSize(.large)
    default:
      switch player.lyrics {
      case .synced(let lines):
        let _ = player.seekCount
        TimelineView(.animation(minimumInterval: 1.0 / 60, paused: !player.isPlaying)) { _ in
          let time = player.currentTime
          let current = LyricsTiming.lineIndex(in: lines, at: time, delay: player.lyricsDelay) ?? -1
          TVCarousel(
            lines: lines, current: current, delay: player.lyricsDelay, unit: unit,
            waiting: LyricGap.after(lines, index: current, delay: player.lyricsDelay)?
              .countdown(at: time) != nil
          ).equatable().id(player.track?.id)
        }
      case .plain(let text):
        ScrollView {
          Text(text).font(.system(size: unit * 2.4, weight: .bold)).multilineTextAlignment(.center)
            .frame(maxWidth: .infinity).padding(.vertical, 24)
        }.scrollIndicators(.hidden)
      case .loading, .none: ProgressView().tint(.white)
      case .failed:
        Text("Can't load the lyrics").font(.system(size: unit * 2.6, weight: .semibold)).opacity(0.7)
      case .missing:
        Text("No lyrics for this song").font(.system(size: unit * 2.6, weight: .semibold)).opacity(
          0.7)
      }
    }
  }

  private func footer(unit: CGFloat) -> some View {
    VStack(spacing: unit * 1.6) {
      let _ = player.seekCount
      TimelineView(.animation(minimumInterval: 0.2, paused: !player.isPlaying)) { _ in
        VStack(spacing: unit * 0.5) {
          HStack {
            Text(TrackRow.format(player.currentTime))
            Spacer()
            Text(TrackRow.format(player.duration))
          }.font(.system(size: unit * 1.4).monospacedDigit()).opacity(0.7)
          GeometryReader { proxy in
            Capsule().fill(.white.opacity(0.2)).overlay(alignment: .leading) {
              Capsule().fill(.white.opacity(0.9))
                .frame(
                  width: proxy.size.width
                    * min(1, max(0, player.currentTime / max(1, player.duration))))
            }
          }.frame(height: max(3, unit * 0.45))
        }
      }
      HStack(alignment: .bottom, spacing: unit * 3) {
        VStack(alignment: .leading, spacing: unit * 0.7) {
          if !room.upcoming.isEmpty {
            Text("UP NEXT").font(.system(size: unit * 1.1, weight: .medium)).opacity(0.6)
            HStack(spacing: unit * 1.2) {
              ForEach(Array(room.upcoming.prefix(3)), id: \.queueID) { track in
                HStack(spacing: unit * 0.7) {
                  Artwork(url: track.artworkURL, size: unit * 2.6, radius: unit * 1.3)
                    .overlay(alignment: .bottomTrailing) {
                      if let by = track.orderedBy {
                        UserAvatar(avatar: by.avatar, name: by.name, size: unit * 1.2).offset(
                          x: 2, y: 2)
                      }
                    }
                  Text(track.name).font(.system(size: unit * 1.35, weight: .medium)).lineLimit(1)
                }.padding(unit * 0.35).padding(.trailing, unit).background(
                  .black.opacity(0.4), in: Capsule()
                )
                .frame(maxWidth: unit * 20, alignment: .leading)
                .fixedSize(horizontal: true, vertical: false)
              }
            }
          }
          if let score = singing.score, singing.micOn || singing.remoteSinging {
            Text("Score \(score)").font(.system(size: unit * 1.5, weight: .bold).monospacedDigit())
          }
        }
        Spacer(minLength: 0)
        joinCard(unit: unit, large: false)
      }
    }
  }

  @ViewBuilder private func joinCard(unit: CGFloat, large: Bool) -> some View {
    if let code = room.code, let url = room.joinURL {
      if large {
        VStack(spacing: unit * 1.5) {
          QRCodeView(text: url.absoluteString, size: unit * 16).padding(unit).background(
            .white, in: RoundedRectangle(cornerRadius: unit))
          Text(code).font(.system(size: unit * 5, weight: .bold, design: .monospaced)).tracking(
            unit * 0.5)
        }
      } else {
        HStack(spacing: unit * 1.2) {
          QRCodeView(text: url.absoluteString, size: unit * 6.5).padding(unit * 0.45).background(
            .white, in: RoundedRectangle(cornerRadius: unit * 0.5))
          VStack(alignment: .leading, spacing: unit * 0.3) {
            Text("SCAN TO JOIN").font(.system(size: unit * 1.1, weight: .medium)).opacity(0.7)
            Text(code).font(.system(size: unit * 2.6, weight: .bold, design: .monospaced)).tracking(
              unit * 0.25)
          }
        }.padding(unit * 0.8).background(
          .black.opacity(0.45), in: RoundedRectangle(cornerRadius: unit))
      }
    } else {
      Button {
        Task { await room.openRoom() }
      } label: {
        Label("Open a room", lucide: "users")
      }
      .buttonStyle(WebButtonStyle(background: .white.opacity(0.15), height: large ? 44 : 34))
    }
  }
}

private struct TVCarousel: View, Equatable {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  var lines: [LyricLine]
  var current: Int
  var delay: Double
  var unit: CGFloat
  /// A long wait is under way, so the countdown stands in for the line just sung.
  var waiting = false
  @State private var previous: Int?
  @State private var heights: [Int: CGFloat] = [:]

  nonisolated static func == (lhs: Self, rhs: Self) -> Bool {
    lhs.current == rhs.current && lhs.delay == rhs.delay && lhs.unit == rhs.unit
      && lhs.waiting == rhs.waiting && lhs.lines == rhs.lines
  }

  var body: some View {
    GeometryReader { viewport in
      let visible = Array(max(0, current - 3)..<min(lines.count, current + 4))
      let placement = TVLyricsPlacement(
        current: current, visible: visible, heights: heights,
        availableHeight: viewport.size.height, fallbackHeight: unit * 6.4, gap: unit * 1.6)
      let wait = LyricGap.after(lines, index: current, delay: delay)
      ZStack {
        ForEach(visible, id: \.self) { index in
          let distance = abs(index - current)
          PlaybackLyricLine(
            line: lines[index], active: index == current,
            completed: index < current, delay: delay, dim: .white.opacity(0.55)
          )
          // Measure once at a stable font and width. Only the transform changes emphasis,
          // so a line keeps exactly the same wrapping before, during and after its turn.
          .font(.system(size: unit * 4.8, weight: .heavy))
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
          .frame(width: viewport.size.width)
          .onGeometryChange(for: CGFloat.self) {
            $0.size.height
          } action: { height in
            if heights[index] != height { heights[index] = height }
          }
          .scaleEffect(placement.scale(for: index))
          .position(
            x: viewport.size.width / 2,
            y: viewport.size.height * 0.45 + placement.offset(for: index)
          )
          .opacity(
            distance == 0
              ? (waiting ? (current < 0 ? 0 : 0.25) : 1)
              : index == current + 1 ? 0.6 : distance <= 2 ? 0.3 : 0
          )
          .transition(.identity)
        }
        if let wait, waiting {
          LyricGapMarker(gap: wait, active: true, size: unit * 6, centered: true)
            .frame(width: viewport.size.width)
            .position(x: viewport.size.width / 2, y: viewport.size.height * 0.45)
        }
      }
      .animation(
        !reduceMotion && previous.map { abs(current - $0) <= 1 } == true
          ? .timingCurve(0.22, 1, 0.36, 1, duration: 0.42) : nil, value: current
      )
      .onChange(of: current, initial: true) { _, value in previous = value }
    }
    .mask(
      LinearGradient(
        stops: [
          .init(color: .clear, location: 0), .init(color: .black, location: 0.12),
          .init(color: .black, location: 0.88), .init(color: .clear, location: 1),
        ], startPoint: .top, endPoint: .bottom)
    )
    .clipped().accessibilityElement(children: .combine)
  }
}

/// Web TV geometry: scale measured text without reflow, then center neighbors by their
/// scaled heights. Long lines shrink to fit the stage rather than getting truncated.
struct TVLyricsPlacement {
  var current: Int
  var visible: [Int]
  var heights: [Int: CGFloat]
  var availableHeight: CGFloat
  var fallbackHeight: CGFloat
  var gap: CGFloat

  func scale(for index: Int) -> CGFloat {
    let emphasis: CGFloat = index == current ? 1 : index == current + 1 ? 0.65 : 0.55
    return min(emphasis, max(0, availableHeight) * 0.42 / max(1, heights[index] ?? fallbackHeight))
  }

  private func height(for index: Int) -> CGFloat {
    (heights[index] ?? fallbackHeight) * scale(for: index)
  }

  func offset(for index: Int) -> CGFloat {
    guard index != current else { return 0 }
    if index > current {
      return (current..<index).reduce(0) { result, previous in
        result + height(for: previous) / 2 + gap + height(for: previous + 1) / 2
      }
    }
    return -(index..<current).reduce(0) { result, next in
      result + height(for: next) / 2 + gap + height(for: next + 1) / 2
    }
  }
}

extension Array {
  subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}

/// Hands over the window the view is in, once it has one.
struct WindowReader: NSViewRepresentable {
  var onWindow: (NSWindow) -> Void

  func makeNSView(context: Context) -> NSView { Reader(onWindow) }
  func updateNSView(_ view: NSView, context: Context) {}

  private final class Reader: NSView {
    let onWindow: (NSWindow) -> Void
    init(_ onWindow: @escaping (NSWindow) -> Void) {
      self.onWindow = onWindow
      super.init(frame: .zero)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      if let window { DispatchQueue.main.async { self.onWindow(window) } }
    }
  }
}
