import SwiftUI

/// Asks which version of a song to queue when a music video has a studio recording: studio audio is the safe pick.
struct VersionChoiceSheet: View {
  var choice: RoomModel.VersionChoice
  var answer: (RoomModel.VersionPick?) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      VStack(alignment: .leading, spacing: 4) {
        Text("Which version?").font(.system(size: 18, weight: .semibold))
        Text("This is a video. Its lyrics can come out wrong, because videos have unreliable titles and timing.")
          .font(.system(size: 13)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      }
      option(icon: "opticaldisc", title: "Studio audio", track: choice.studio,
             note: "Recommended: the original recording, with accurate lyrics.", primary: true) { answer(.studio) }
      option(icon: "film", title: "Video", track: choice.video,
             note: "Lyrics may not match, or may be offset by an intro.", primary: false) { answer(.video) }
      HStack {
        Spacer()
        Button("Cancel") { answer(nil) }.buttonStyle(.secondary).keyboardShortcut(.cancelAction)
      }
    }
    .padding(24).frame(width: 420)
  }

  private func option(icon: String, title: LocalizedStringKey, track: Track, note: LocalizedStringKey, primary: Bool,
                      pick: @escaping () -> Void) -> some View {
    Button(action: pick) {
      HStack(alignment: .top, spacing: 12) {
        Image(systemName: icon).font(.system(size: 18)).foregroundStyle(.secondary).frame(width: 22).padding(.top, 2)
        VStack(alignment: .leading, spacing: 3) {
          Text(title).font(.system(size: 14, weight: .medium))
          Text("\(track.name) · \(TrackRow.format((track.duration ?? 0)))").font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
          Text(note).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
        Spacer(minLength: 0)
      }
      .padding(12).frame(maxWidth: .infinity, alignment: .leading)
      .background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
      .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(primary ? AppTheme.accent : .primary.opacity(0.14)) }
      .contentShape(RoundedRectangle(cornerRadius: 12))
    }
    .buttonStyle(.plain).stableCursor(.link)
  }
}
