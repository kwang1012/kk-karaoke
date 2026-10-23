import SwiftUI

struct NowPlayingView: View {
  @Environment(PlayerModel.self) private var player
  @Environment(SingingModel.self) private var singing
  var fullscreen = false
  var active = true
  var onToggleFullscreen: () -> Void = {}
  @State private var palette = CoverPalette.fallback
  @AppStorage("showRomanizedLyrics") private var showRomanized = false
  @AppStorage("showVideo") private var showVideo = false

  var body: some View {
    GeometryReader { geometry in
      ZStack {
        palette.background
        // Keep the web player running behind the lyrics. Removing it on every mode change
        // reloads YouTube and discards the buffered video.
        if let id = videoId {
          VideoBackdrop(videoId: id)
        }
        lyrics(fontSize: max(26, geometry.size.width * 0.035))
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(palette.background)
          .opacity(videoShown ? 0 : 1)
          .allowsHitTesting(!videoShown)
          .accessibilityHidden(videoShown)
        VStack {
          if active && singing.showMelody {
            PitchRollView().frame(height: min(150, geometry.size.height * 0.25))
          }
          HStack {
            Spacer()
            if let by = player.track?.orderedBy {
              HStack(spacing: 8) {
                UserAvatar(avatar: by.avatar, name: by.name, size: 32)
                Text(by.name).font(.callout.weight(.semibold))
              }
              .padding(6).padding(.trailing, 8).background(.black.opacity(0.25), in: Capsule())
            }
          }
          Spacer()
          HStack(alignment: .bottom) {
            Spacer()
            if videoId != nil {
              Button {
                showVideo.toggle()
              } label: {
                LucideIcon(showVideo ? "video-off" : "video", size: 22)
              }
              .buttonStyle(WebIconButtonStyle()).padding(6)
              .background(.white.opacity(showVideo ? 0.2 : 0), in: Circle())
              .background(.black.opacity(0.3), in: Circle())
              .help(showVideo ? "Show lyrics" : "Show video")
              .accessibilityLabel("Video")
              .accessibilityValue(showVideo ? "On" : "Off")
            }
            if hasRomanizedLyrics && !videoShown {
              Button {
                showRomanized.toggle()
              } label: {
                LucideIcon("languages", size: 22)
              }
              .buttonStyle(WebIconButtonStyle()).padding(6)
              .background(.white.opacity(showRomanized ? 0.2 : 0), in: Circle())
              .background(.black.opacity(0.3), in: Circle())
              .help(showRomanized ? "Hide romanization" : "Show romanization")
              .accessibilityLabel("Romanization")
              .accessibilityValue(showRomanized ? "On" : "Off")
            }
            Button(action: onToggleFullscreen) {
              LucideIcon(fullscreen ? "minimize" : "maximize", size: 24)
            }
            .buttonStyle(WebIconButtonStyle()).padding(6)
            .background(.black.opacity(0.3), in: Circle())
            .help(fullscreen ? "Exit fullscreen" : "Enter fullscreen")
            .accessibilityLabel(fullscreen ? "Exit fullscreen" : "Enter fullscreen")
          }
        }.padding(16)
      }.foregroundStyle(.white)
    }
    .task(id: player.track?.artworkURL) {
      palette = .fallback
      let result = await CoverPalette.load(player.track?.artworkURL)
      guard !Task.isCancelled else { return }
      withAnimation(.easeInOut(duration: 0.5)) { palette = result }
    }
    .thinScrollbars()
  }

  private var videoId: String? { player.track.map { $0.videoId ?? $0.id } }
  private var videoShown: Bool { showVideo && videoId != nil }

  private var hasRomanizedLyrics: Bool {
    guard case .synced(let lines) = player.lyrics else { return false }
    return lines.contains {
      !($0.romanized?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }
  }

  @ViewBuilder private func lyrics(fontSize: CGFloat) -> some View {
    if player.track == nil {
      LyricsMessage(text: "Start playing a track!")
    } else {
      switch player.lyrics {
      case .none, .loading: LyricsSkeleton()
      case .missing: LyricsMessage(text: "No lyrics available for this track.")
      case .failed: LyricsFailed()
      case .plain(let text):
        ScrollView {
          VStack(alignment: .leading, spacing: 20) {
            Text("These lyrics have no timing, so they can't follow the song.").font(.callout)
              .opacity(0.7)
            Text(text).font(.system(size: fontSize, weight: .bold)).lineSpacing(8).textSelection(
              .enabled)
          }.frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 64).padding(
            .vertical, 72)
        }
      case .synced(let lines):
        ScrollViewReader { proxy in
          ScrollView {
            let _ = player.seekCount
            TimelineView(.animation(minimumInterval: 1.0 / 60, paused: !active || videoShown || !player.isPlaying)) { _ in
              ScrollingLyricLines(
                lines: lines,
                current: LyricsTiming.lineIndex(
                  in: lines, at: player.currentTime, delay: player.lyricsDelay),
                delay: player.lyricsDelay, fontSize: fontSize, dim: palette.lyrics.opacity(0.7),
                showRomanized: showRomanized, topPadding: singing.showMelody ? 180 : 64,
                ticking: active && !videoShown, proxy: proxy
              ).equatable()
            }
          }
        }
      }
    }
  }
}

/// The clock checks boundaries every frame; the list only changes when its presentation does.
/// A lyric line you can click to jump to: it lights up under the pointer, which shows as a hand.
private struct LyricHover: ViewModifier {
  @State private var hovered = false

  func body(content: Content) -> some View {
    content
      .background(
        RoundedRectangle(cornerRadius: 16).fill(.white.opacity(hovered ? 0.08 : 0)).padding(.horizontal, -12)
      )
      .contentShape(Rectangle())
      .onHover { hovered = $0 }
  }
}

private struct ScrollingLyricLines: View, Equatable {
  @Environment(PlayerModel.self) private var player
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  var lines: [LyricLine]
  var current: Int?
  var delay: Double
  var fontSize: CGFloat
  var dim: Color
  var showRomanized: Bool
  var topPadding: CGFloat
  var ticking: Bool
  var proxy: ScrollViewProxy

  nonisolated static func == (lhs: Self, rhs: Self) -> Bool {
    lhs.current == rhs.current && lhs.delay == rhs.delay && lhs.fontSize == rhs.fontSize
      && lhs.dim == rhs.dim && lhs.showRomanized == rhs.showRomanized
      && lhs.topPadding == rhs.topPadding && lhs.lines == rhs.lines && lhs.ticking == rhs.ticking
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      gapMarker(after: -1)
      ForEach(lines.indices, id: \.self) { index in
        PlaybackLyricLine(
          line: lines[index], active: current == index,
          completed: current.map { index < $0 } ?? false, delay: delay, dim: dim,
          showRomanized: showRomanized, ticking: ticking
        )
        .font(.system(size: fontSize, weight: .bold)).lineSpacing(4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .scaleEffect(current == index ? 1.04 : 1, anchor: .leading)
        // padding, not stack spacing: the pointer stays a hand across the gap between two lines
        .padding(.vertical, 14)
        .animation(
          reduceMotion ? nil : .timingCurve(0.22, 1, 0.36, 1, duration: 0.3),
          value: current == index
        )
        .modifier(LyricHover())
        .onTapGesture { jump(to: index) }
        .accessibilityAction(named: "Jump to lyric") { jump(to: index) }
        .id(index)
        gapMarker(after: index)
      }
    }
    .padding(.horizontal, 64).padding(.top, topPadding).padding(.bottom, 120)
    // One AppKit cursor rect for the whole list, not SwiftUI's per-row pointer style: the rows are redrawn
    // every frame and slide under a still pointer while the list scrolls, and that made the hand flicker
    // back to the arrow.
    .stableCursor(.link)
    .onChange(of: current, initial: true) { old, index in
      guard let index else { return }
      // Seeking jumps immediately; adjacent lines move promptly without an ease-in delay.
      let animate = !reduceMotion && old.map { abs(index - $0) == 1 } == true
      withAnimation(animate ? .timingCurve(0.22, 1, 0.36, 1, duration: 0.3) : nil) {
        proxy.scrollTo(index, anchor: .center)
      }
    }
  }

  @ViewBuilder private func gapMarker(after index: Int) -> some View {
    if let gap = LyricGap.after(lines, index: index, delay: delay) {
      LyricGapMarker(gap: gap, active: (current ?? -1) == index, size: fontSize * 0.9)
        .padding(.vertical, 18)
    }
  }

  /// Clicking a line sings from it: the song goes there and starts if it was paused.
  private func jump(to index: Int) {
    player.seek(to: max(0, lines[index].time + delay))
    if !player.isPlaying { player.perform(.play) }
  }
}

/// The lyrics could not be fetched (the connection, not the song): offer to ask again.
struct LyricsFailed: View {
  @Environment(PlayerModel.self) private var player

  var body: some View {
    VStack(spacing: 14) {
      LucideIcon("wifi-off", size: 40).foregroundStyle(.secondary)
      Text("Can't load the lyrics").font(.title3.weight(.semibold))
      Text("Check your connection and try again.").font(.callout).foregroundStyle(.secondary)
      Button("Try Again") { player.retryLyrics() }.buttonStyle(.secondary)
    }
    .padding(32).frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

/// Said where the lyrics would be: no song yet, or a song with none. Big and centred, like the web app's.
struct LyricsMessage: View {
  var text: LocalizedStringKey

  var body: some View {
    VStack {
      Text(text).font(.system(size: 28, weight: .bold)).multilineTextAlignment(.center).padding(.top, 96)
      Spacer()
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity).padding(.horizontal, 32)
  }
}

/// Placeholder lines while a song's lyrics are loading.
struct LyricsSkeleton: View {
  private static let widths: [CGFloat] = [0.6, 0.8, 0.4, 0.75, 0.5, 0.67]
  @State private var pulse = false

  var body: some View {
    GeometryReader { geometry in
      VStack(alignment: .leading, spacing: 28) {
        ForEach(Self.widths.indices, id: \.self) { index in
          Capsule().fill(.white.opacity(pulse ? 0.16 : 0.07))
            .frame(width: (geometry.size.width - 128) * Self.widths[index], height: 36)
            .animation(.easeInOut(duration: 0.9).repeatForever().delay(Double(index) * 0.12), value: pulse)
        }
      }
      .padding(.horizontal, 64).padding(.top, 64)
    }
    .onAppear { pulse = true }
    .accessibilityLabel("Loading…")
  }
}
