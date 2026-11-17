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
            } else if let now = spotify.now {
              SpotifyNowRow(now: now)
            } else {
              HStack(spacing: 12) {
                LucideIcon("music").foregroundStyle(.secondary).frame(width: 40, height: 40)
                  .background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 8))
                Text("Waiting for Spotify").font(.system(size: 14, weight: .medium))
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
          upNext
          if let message = room.message {
            Text(message).font(.caption).foregroundStyle(.red).padding(8)
          }
        }
        .padding(.horizontal, 12).padding(.top, 8).padding(.bottom, 8)
      }
    }
    .background(AppTheme.card)
    .thinScrollbars()
    .onChange(of: spotify.web.isConnected) { _, _ in spotify.refreshAhead() }
  }

  /// What Spotify has queued, with whether each song can be sung already.
  @ViewBuilder private var upNext: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("UP NEXT IN SPOTIFY").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary).padding(.horizontal, 8)
      if !spotify.web.isConnected {
        VStack(alignment: .leading, spacing: 10) {
          Text("Connect Spotify to see what is coming up, and to have those songs ready before their turn.")
            .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
          Button("Connect Spotify") { spotify.web.connect() }.buttonStyle(.secondary)
        }
        .padding(.horizontal, 8)
      } else if let message = spotify.aheadMessage {
        Text(message).font(.system(size: 12)).foregroundStyle(.red).padding(.horizontal, 8)
      } else if spotify.ahead.isEmpty {
        Text("Nothing is queued in Spotify.").font(.system(size: 12)).foregroundStyle(.secondary).padding(.horizontal, 8)
      } else {
        ForEach(spotify.ahead) { item in
          HStack(spacing: 12) {
            Artwork(url: item.match?.artworkURL, size: 36, radius: 8)
            VStack(alignment: .leading, spacing: 2) {
              Text(item.spotify.name).font(.system(size: 13, weight: .medium)).lineLimit(1)
              Text(item.spotify.artist).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 8)
            switch item.stage {
            case .singing: LucideIcon("check", size: 12).foregroundStyle(.green).help("Ready to sing")
            case .preparing, .matching: ProgressView().controlSize(.mini).help("Getting it ready")
            case .missing, .failed: Text("–").foregroundStyle(.secondary).help("No karaoke version found")
            }
          }
          .padding(.horizontal, 8)
        }
      }
    }
  }
}

/// A song Spotify is on that KKaraoke cannot play yet: it is still shown as now playing, with what is happening to it.
private struct SpotifyNowRow: View {
  var now: SpotifyTakeover.Now

  var body: some View {
    HStack(spacing: 12) {
      Artwork(url: now.match?.artworkURL, size: 40, radius: 8)
      VStack(alignment: .leading, spacing: 3) {
        Text(now.spotify.name).font(.system(size: 14, weight: .medium)).lineLimit(1)
        Text(now.spotify.artist).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
        HStack(spacing: 6) {
          switch now.stage {
          case .matching: ProgressView().controlSize(.mini); Text("Looking for the karaoke version…")
          case .preparing: ProgressView().controlSize(.mini); Text("Preparing the karaoke version. Playing in Spotify meanwhile.")
          case .missing: Text("No karaoke version found. Playing in Spotify.")
          case .failed: Text("Could not look it up. Playing in Spotify.")
          case .singing: EmptyView()
          }
        }
        .font(.system(size: 11)).foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(8)
  }
}
