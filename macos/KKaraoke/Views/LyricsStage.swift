import AppKit
import ImageIO
import SwiftUI

/// Dominant real cover color, with the same HSL lightness bounds as the web stage.
struct CoverPalette: Equatable, Sendable {
  var hue: Double
  var saturation: Double
  var lightness: Double
  static let fallback = CoverPalette(hue: 0, saturation: 0, lightness: 0.227)
  var background: Color { color(lightness: min(0.32, max(0.16, lightness))) }
  var lyrics: Color { self == .fallback ? Color(white: 211.0 / 255) : color(lightness: 0.92) }

  private func color(lightness: Double) -> Color {
    let a = saturation * min(lightness, 1 - lightness)
    func channel(_ n: Double) -> Double {
      let k = (n + hue * 12).truncatingRemainder(dividingBy: 12)
      return lightness - a * max(-1, min(k - 3, 9 - k, 1))
    }
    return Color(red: channel(0), green: channel(8), blue: channel(4))
  }

  static func dominant(pixels: [UInt8]) -> CoverPalette {
    // Quantized population, rather than an average that turns colorful covers gray.
    var buckets: [Int: (count: Int, r: Double, g: Double, b: Double)] = [:]
    for offset in stride(from: 0, to: pixels.count - 3, by: 4) {
      guard pixels[offset + 3] > 128 else { continue }
      let r = Int(pixels[offset])
      let g = Int(pixels[offset + 1])
      let b = Int(pixels[offset + 2])
      let key = (r / 32) << 6 | (g / 32) << 3 | (b / 32)
      var bucket = buckets[key] ?? (0, 0, 0, 0)
      bucket.count += 1
      bucket.r += Double(r)
      bucket.g += Double(g)
      bucket.b += Double(b)
      buckets[key] = bucket
    }
    guard let base = buckets.max(by: { $0.value.count < $1.value.count })?.value else {
      return .fallback
    }
    let r = base.r / Double(base.count) / 255
    let g = base.g / Double(base.count) / 255
    let b = base.b / Double(base.count) / 255
    let high = max(r, g, b)
    let low = min(r, g, b)
    let delta = high - low
    let l = (high + low) / 2
    guard delta > 0 else { return CoverPalette(hue: 0, saturation: 0, lightness: l) }
    var h = high == r ? (g - b) / delta : high == g ? (b - r) / delta + 2 : (r - g) / delta + 4
    h = (h / 6 + 1).truncatingRemainder(dividingBy: 1)
    return CoverPalette(hue: h, saturation: delta / (1 - abs(2 * l - 1)), lightness: l)
  }

  static func load(_ url: URL?) async -> CoverPalette {
    guard let url else { return .fallback }
    do {
      let (data, _) = try await URLSession.shared.data(from: url)
      try Task.checkCancellation()
      return await Task.detached(priority: .utility) { decode(data) }.value
    } catch { return .fallback }
  }

  /// Decode a small thumbnail on a worker, avoiding AppKit's first-use image work on the UI thread.
  static func decode(_ data: Data) -> CoverPalette {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceThumbnailMaxPixelSize: 64,
        kCGImageSourceCreateThumbnailWithTransform: true,
      ] as CFDictionary) else { return .fallback }
    var pixels = [UInt8](repeating: 0, count: 64 * 64 * 4)
    let drawn = pixels.withUnsafeMutableBytes { bytes -> Bool in
      guard
        let context = CGContext(
          data: bytes.baseAddress, width: 64, height: 64,
          bitsPerComponent: 8, bytesPerRow: 64 * 4, space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
      else { return false }
      context.draw(cg, in: CGRect(x: 0, y: 0, width: 64, height: 64))
      return true
    }
    return drawn ? dominant(pixels: pixels) : .fallback
  }
}

/// One native Text keeps CJK wrapping, spaces, and accessibility intact across timed words.
struct KaraokeText: View {
  var line: LyricLine
  var time: Double
  var delay: Double
  var dim: Color
  var completed = false
  var active = false
  var showRomanized = false
  var showSinger = false
  var showSingerLabel = true

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      if showSinger && showSingerLabel, let singer = line.singer {
        Text(singer.label + (line.role == "background" ? " · " + tr("Backing vocals") : ""))
          .font(.system(size: 13, weight: .semibold)).foregroundStyle(vocalColor(singer))
      }
      text.foregroundStyle(showSinger ? vocalColor(line.singer) : .white)
        .textRenderer(KaraokeFillRenderer(dim: dim))
      if showRomanized, let romanized = line.romanized, !romanized.isEmpty {
        Text("(\(romanized))").font(.system(size: 18, weight: .medium)).foregroundStyle(dim)
      }
    }
  }

  private var text: Text {
    guard let words = line.words, !words.isEmpty else {
      return Text(line.text.isEmpty ? "♪" : line.text).customAttribute(
        WordFill(amount: completed || active ? 1 : 0))
    }
    return words.enumerated().reduce(Text("")) { result, item in
      let (index, word) = item
      let fill = LyricsTiming.wordFill(
        word, next: words[safe: index + 1], delay: delay, progress: time)
      return result
        + Text(word.text).customAttribute(WordFill(amount: completed ? 1 : fill, wordIndex: index))
    }
  }
}

/// Only the line being sung needs frame-by-frame word fills. Other rows keep their text layout.
struct PlaybackLyricLine: View {
  @Environment(PlayerModel.self) private var player
  var line: LyricLine
  var active: Bool
  var completed: Bool
  var delay: Double
  var dim: Color
  var showRomanized = false
  var ticking = true
  var showSinger = false
  var showSingerLabel = true

  var body: some View {
    // Keep the same Text and TimelineView mounted across line boundaries. Switching view
    // branches here replaces the glyph layout exactly when its position starts animating.
    TimelineView(
      .animation(
        minimumInterval: 1.0 / 60,
        paused: !ticking || !active || !player.isPlaying || (line.words?.isEmpty ?? true))
    ) { _ in
      KaraokeText(
        line: line,
        time: active ? player.currentTime : completed ? .infinity : -.infinity,
        delay: delay, dim: dim, completed: completed, active: active,
        showRomanized: showRomanized, showSinger: showSinger, showSingerLabel: showSingerLabel
      )
      .transaction { $0.animation = nil }
    }
  }
}

private struct WordFill: TextAttribute {
  var amount: Double
  // Keep adjacent words as separate runs even when both have identical fill amounts.
  var wordIndex: Int = -1
}

/// Clip native glyph runs to fill each timed word continuously from left to right.
private struct KaraokeFillRenderer: TextRenderer {
  var dim: Color
  func draw(layout: Text.Layout, in context: inout GraphicsContext) {
    for line in layout {
      for run in line {
        let amount = min(1, max(0, run[WordFill.self]?.amount ?? 0))
        if amount == 1 {
          // Do not paint white over an already rasterized dim glyph: overlapping
          // antialiased edges make the highlighted letter appear heavier.
          context.draw(run, options: .disablesSubpixelQuantization)
        } else if amount == 0 {
          var base = context
          base.addFilter(.colorMultiply(dim))
          base.draw(run, options: .disablesSubpixelQuantization)
        } else {
          let bounds = run.typographicBounds.rect
          // A half-plane also includes italic overhangs and tall combining marks.
          let edge = bounds.minX + bounds.width * amount
          let filled = Path(
            CGRect(
              x: bounds.minX - 10000, y: bounds.minY - 10000,
              width: edge - bounds.minX + 10000, height: bounds.height + 20000))
          var base = context
          base.clip(to: filled, options: .inverse)
          base.addFilter(.colorMultiply(dim))
          base.draw(run, options: .disablesSubpixelQuantization)
          var highlight = context
          highlight.clip(to: filled)
          highlight.draw(run, options: .disablesSubpixelQuantization)
        }
      }
    }
  }
}

/// The lead-in after a long wait: three dots that light up one by one over the last seconds, all lit as
/// the line starts. Nothing shows before that, but the room is kept so the lines around it do not jump.
struct LyricGapMarker: View {
    @Environment(PlayerModel.self) private var player
    var gap: LyricGap
    var active: Bool
    var size: CGFloat
    var centered = false

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !active || !player.isPlaying)) { _ in
            let remaining = active ? gap.countdown(at: player.currentTime) : nil
            HStack(spacing: size * 0.5) {
                ForEach(0..<3, id: \.self) { dot in
                    let lit = remaining.map {
                        min(1, max(0, (LyricGap.countdownSeconds - $0) / (LyricGap.countdownSeconds / 3) - Double(dot) + 0.5))
                    } ?? 0
                    Circle().frame(width: size * 0.55, height: size * 0.55)
                        .scaleEffect(0.8 + 0.2 * lit).opacity(0.25 + 0.75 * lit)
                }
            }
            .frame(maxWidth: .infinity, minHeight: size, alignment: centered ? .center : .leading)
            .opacity(remaining == nil ? 0 : 1)
            .animation(.easeOut(duration: 0.3), value: remaining == nil)
            .accessibilityHidden(remaining == nil)
            .accessibilityLabel("Next line starting")
        }
    }
}

struct StageControls: View {
  @Environment(SingingModel.self) private var singing
  @State private var mixerOpen = false
  var body: some View {
    HStack(spacing: 8) {
      Button {
        singing.showMelody.toggle()
      } label: {
        LucideIcon("music", size: 22)
      }
      .background(.white.opacity(singing.showMelody ? 0.2 : 0), in: Circle())
      .help(singing.showMelody ? "Hide melody" : "Show melody")
      if singing.showMelody {
        Slider(value: Bindable(singing).melodyDetail, in: 0...1).stableCursor(.link).frame(width: 80)
          .controlSize(.mini).accessibilityLabel("Melody detail")
      }
      Button {
        singing.toggleMic()
      } label: {
        LucideIcon(singing.micOn ? "mic" : "mic-off", size: 22)
      }
      .background(.white.opacity(singing.micOn ? 0.2 : 0), in: Circle())
      .help(singing.micError ?? (singing.micOn ? tr("Turn microphone off") : tr("Sing with microphone")))
      Button {
        mixerOpen.toggle()
      } label: {
        LucideIcon("sliders-horizontal", size: 22)
      }
      .help("Sound and lyric timing").dropdown(isPresented: $mixerOpen, edge: .trailing, width: 380) {
        MixerView().padding(20)
      }
    }
    .buttonStyle(WebIconButtonStyle()).padding(6).background(.black.opacity(0.3), in: Capsule())
    .foregroundStyle(.white)
  }
}


func vocalColor(_ singer: LyricSinger?) -> Color {
  switch singer?.side ?? 0 {
  case -1: Color(red: 165.0 / 255, green: 232.0 / 255, blue: 1)
  case 1: Color(red: 1, green: 209.0 / 255, blue: 163.0 / 255)
  default: .white
  }
}

/// Independent vocal parts stay on screen together, including equal-start and overlapping lines.
struct DuetStage: View {
  @Environment(PlayerModel.self) private var player
  var lines: [LyricLine]
  var unit: CGFloat

  var body: some View {
    TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !player.isPlaying)) { _ in
      let time = player.currentTime
      let active = LyricsTiming.activeIndices(in: lines, at: time, delay: player.lyricsDelay)
      let current = LyricsTiming.lineIndex(in: lines, at: time, delay: player.lyricsDelay) ?? -1
      let nearby = Set(max(0, current - 1)..<min(lines.count, current + 3))
      let visible = active.union(nearby).sorted()
      GeometryReader { viewport in
        ScrollViewReader { proxy in
          ScrollView {
            VStack(spacing: unit * 1.4) {
              ForEach(visible, id: \.self) { index in
                let line = lines[index]
                let side = line.singer?.side ?? 0
                HStack {
                  if side > 0 { Spacer(minLength: 0) }
                  PlaybackLyricLine(
                    line: line, active: active.contains(index),
                    completed: index < current && !active.contains(index), delay: player.lyricsDelay,
                    dim: .white.opacity(0.45), showSinger: true,
                    showSingerLabel: LyricsTiming.startsVocalPart(line, previous: lines[safe: index - 1])
                  )
                  .font(.system(size: unit * 3.8, weight: .heavy))
                  .multilineTextAlignment(side < 0 ? .leading : side > 0 ? .trailing : .center)
                  .frame(maxWidth: viewport.size.width * 0.8, alignment: side < 0 ? .leading : side > 0 ? .trailing : .center)
                  if side < 0 { Spacer(minLength: 0) }
                }
                .frame(maxWidth: .infinity)
                .opacity(active.contains(index) ? 1 : 0.45)
                .id(index)
              }
            }
            .padding(.horizontal, unit * 3).padding(.vertical, unit * 3)
            .frame(minHeight: viewport.size.height)
          }
          .scrollIndicators(.hidden)
          .onChange(of: current, initial: true) { _, _ in
            proxy.scrollTo(active.min() ?? max(0, current), anchor: .center)
          }
        }
      }
    }
  }
}
