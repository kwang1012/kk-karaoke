import SwiftUI

/// The queue's place while KKaraoke follows Spotify: Spotify chooses the songs, so there is nothing to order here.
/// It shows the song that is on, what is happening to it, and the two things that can still be done from here.
struct SpotifyPanel: View {
  @Environment(RoomModel.self) private var room
  @Environment(SpotifyTakeover.self) private var spotify
  var onClose: () -> Void = {}

  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Text("Spotify").font(.system(size: 18, weight: .semibold))
        Spacer()
        Button(action: onClose) { LucideIcon("x", size: 16) }
          .buttonStyle(WebIconButtonStyle()).help("Hide queue").accessibilityLabel("Hide queue")
      }
      .padding(.leading, 20).padding(.trailing, 12).padding(.top, 12).padding(.bottom, 4)
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          Text("NOW PLAYING").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary).padding(.horizontal, 8)
          Group {
            if let current = room.currentTrack {
              QueueRow(track: current, current: true)
            } else {
              HStack(spacing: 12) {
                LucideIcon("music").foregroundStyle(.secondary).frame(width: 40, height: 40)
                  .background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 8))
                Text("Playing in Spotify").font(.system(size: 14, weight: .medium))
                Spacer()
              }
              .padding(8)
            }
          }
          .background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
          if let line = spotify.statusText {
            Text(line).font(.system(size: 12)).foregroundStyle(.secondary).padding(.horizontal, 8)
              .fixedSize(horizontal: false, vertical: true)
          }
          VStack(alignment: .leading, spacing: 14) {
            Text("KKaraoke is following Spotify. Spotify chooses the songs: play, skip or pick them there. Each one plays here without the vocals once its karaoke version is ready.")
              .font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
              Button { spotify.skip() } label: { Label("Next song", lucide: "skip-forward") }
                .buttonStyle(WebButtonStyle(capsule: true))
              Button("Stop following") { spotify.isEnabled = false }
                .buttonStyle(.secondary)
            }
          }
          .padding(16).frame(maxWidth: .infinity, alignment: .leading)
          .background(AppTheme.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
          .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(AppTheme.accent.opacity(0.2)) }
          if let message = room.message {
            Text(message).font(.caption).foregroundStyle(.red).padding(8)
          }
        }
        .padding(.horizontal, 12).padding(.top, 8).padding(.bottom, 8)
      }
    }
    .background(AppTheme.card)
    .thinScrollbars()
  }
}
