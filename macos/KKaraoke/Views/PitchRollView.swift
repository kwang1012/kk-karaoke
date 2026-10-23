import SwiftUI

/// The song's melody as a piano roll: bars for the notes coming up, and a trail of what you are singing (green when it matches).
struct PitchRollView: View {
  @Environment(PlayerModel.self) private var player
  @Environment(SingingModel.self) private var singing
  @State private var state = RollState()

  /// Seconds of the song drawn before and after the playhead.
  private static let past = 2.0
  private static let future = 6.0
  /// How much of the way to the wanted pitch rows the view moves each frame: it follows the notes, gently.
  private static let follow = 0.1

  final class RollState {
    var view: RollView?
    var trackId: String?
  }

  var body: some View {
    let _ = player.seekCount
    TimelineView(.animation(minimumInterval: 1.0 / 60, paused: !player.isPlaying && !singing.micOn))
    { _ in
      Canvas { context, size in draw(&context, size) }
    }
    .background(Color(white: 0.11))
    .clipShape(RoundedRectangle(cornerRadius: 12))
    .overlay(alignment: .topTrailing) { ScoreBadge().padding(8) }
    .overlay { if singing.melodyState != .ready { MelodyStatus(state: singing.melodyState) } }
    .accessibilityLabel("Melody")
  }

  private func draw(_ context: inout GraphicsContext, _ size: CGSize) {
    let notes = singing.melody
    guard !notes.isEmpty, size.width > 0 else { return }
    if state.trackId != player.track?.id {
      state.view = nil
      state.trackId = player.track?.id
    }
    let time = player.currentTime
    let shift = Double(player.semitone)
    let wanted = RollView.fitting(
      notes, from: time - Self.past, to: time + Self.future, shift: shift, song: singing.range)
    let view = state.view.map { $0.eased(toward: wanted, Self.follow) } ?? wanted
    state.view = view

    let rows = view.hi - view.lo
    let rowHeight = size.height / rows
    func x(_ at: Double) -> CGFloat {
      CGFloat((at - time + Self.past) / (Self.past + Self.future)) * size.width
    }
    func y(_ midi: Double) -> CGFloat {
      size.height - CGFloat((midi - view.lo) / rows) * size.height
    }
    let barHeight = max(6, min(22, rowHeight * 0.8))
    // beyond the rows on show a note sits on the edge instead of vanishing
    func onScreen(_ midi: Double) -> CGFloat {
      min(size.height - barHeight / 2, max(barHeight / 2, y(midi)))
    }

    // the rows of a piano: black keys a shade darker, a labelled line at every C
    for midi in Int(view.lo.rounded(.up))...Int(view.hi.rounded(.down)) {
      let top = y(Double(midi)) - rowHeight / 2
      if RollView.isBlackKey(midi) {
        context.fill(
          Path(CGRect(x: 0, y: top, width: size.width, height: rowHeight)),
          with: .color(.white.opacity(0.05)))
      }
      if midi % 12 == 0 {
        context.fill(
          Path(CGRect(x: 0, y: y(Double(midi)) - 0.5, width: size.width, height: 1)),
          with: .color(.white.opacity(0.22)))
        context.draw(
          Text(RollView.octaveLabel(midi)).font(.system(size: 10)).foregroundColor(
            .white.opacity(0.55)),
          at: CGPoint(x: 5, y: y(Double(midi)) - 2), anchor: .bottomLeading)
      }
    }

    for n in notes {
      if n.end < time - Self.past { continue }
      if n.start > time + Self.future { break }
      let sounding = n.start <= time && n.end >= time
      let opacity = sounding ? 0.98 : n.end < time ? 0.28 : 0.7
      let left = x(n.start)
      let rect = CGRect(
        x: left, y: onScreen(n.note + shift) - barHeight / 2, width: max(3, x(n.end) - left),
        height: barHeight)
      context.fill(
        Path(roundedRect: rect, cornerRadius: min(barHeight / 2, 6)),
        with: .color(.white.opacity(opacity)))
    }

    // Your voice, drawn in whichever octave sits nearest the note you are meant to be on
    let anchor = Scoring.noteUnder(notes, time).map { $0.note + shift }
    let dot = max(3, min(6, rowHeight * 0.35))
    let near = anchor ?? (view.lo + view.hi) / 2
    for s in singing.trail {
      let folded = near + Scoring.semitonesOff(s.midi, near)
      let rect = CGRect(
        x: x(s.time) - dot, y: onScreen(folded) - dot, width: dot * 2, height: dot * 2)
      context.fill(
        Path(ellipseIn: rect),
        with: .color(
          s.on
            ? Color(red: 0.12, green: 0.84, blue: 0.38) : Color(red: 0.96, green: 0.65, blue: 0.14))
      )
    }

    context.fill(
      Path(CGRect(x: x(time) - 1, y: 0, width: 2, height: size.height)),
      with: .color(.white.opacity(0.7)))
  }
}

private struct ScoreBadge: View {
  @Environment(SingingModel.self) private var singing

  var body: some View {
    if singing.micOn || singing.remoteSinging {
      Text(singing.score.map { tr("Score \($0)") } ?? tr("Sing!"))
        .font(.callout.weight(.semibold).monospacedDigit())
        .padding(.horizontal, 12).padding(.vertical, 4)
        .background(.black.opacity(0.5), in: Capsule())
        .foregroundStyle(.white)
    }
  }
}

private struct MelodyStatus: View {
  var state: MelodyState

  var body: some View {
    Text(message).font(.callout).foregroundStyle(.white.opacity(0.8))
  }

  private var message: String {
    switch state {
    case .idle, .loading: tr("Looking for the melody…")
    case .waiting: tr("Working out the melody. This can take a minute.")
    case .none: tr("This song has no melody to show.")
    case .gaveUp: tr("The melody could not be loaded.")
    case .ready: ""
    }
  }
}
