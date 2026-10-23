import SwiftUI

/// A compact native player that stays useful without bringing the main window forward.
struct MenuBarContent: View {
  @Environment(AppModel.self) private var app
  @Environment(PlayerModel.self) private var player
  @Environment(RoomModel.self) private var room
  @Environment(SingingModel.self) private var singing
  @Environment(\.openWindow) private var openWindow
  @Environment(\.dismiss) private var dismiss
  @State private var scrubbing: Double?
  @State private var dragging = false

  var body: some View {
    @Bindable var player = player
    VStack(spacing: 20) {
      header
      if let track = player.track {
        VStack(spacing: 16) {
          HStack(alignment: .center, spacing: 14) {
            Artwork(url: track.artworkURL, size: 72, radius: 12)
              .shadow(color: .black.opacity(0.2), radius: 8, y: 4)
            VStack(alignment: .leading, spacing: 5) {
              Text("NOW SINGING").font(.system(size: 10, weight: .semibold)).tracking(1)
                .foregroundStyle(AppTheme.accent)
              Text(track.name).font(.system(size: 17, weight: .semibold)).lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
              Text(track.artistText).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(
                1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
          }
          playbackProgress
          transport
        }

        VStack(spacing: 12) {
          HStack(spacing: 10) {
            Button {
              player.vocalVolume = player.vocalVolume > 0 ? 0 : 1
            } label: {
              Label(
                player.vocalVolume > 0 ? "Original vocal" : "Karaoke",
                lucide: player.vocalVolume > 0 ? "mic" : "mic-off"
              )
              .frame(maxWidth: .infinity)
            }
            .buttonStyle(
              WebButtonStyle(
                background: AppTheme.accent.opacity(0.13), foreground: AppTheme.accent,
                capsule: true)
            )
            .help("Toggle original vocal")
            Button {
              singing.toggleMic()
            } label: {
              Label(singing.micOn ? "Mic on" : "Sing", lucide: singing.micOn ? "mic" : "mic-vocal")
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(
              WebButtonStyle(
                background: singing.micOn ? AppTheme.accent : Color.primary.opacity(0.06),
                foreground: singing.micOn ? .white : .primary, capsule: true)
            )
            .help(singing.micOn ? "Turn microphone off" : "Turn microphone on")
          }
          HStack(spacing: 10) {
            LucideIcon(player.masterVolume == 0 ? "volume-x" : "volume-2", size: 16)
              .foregroundStyle(.secondary)
            Slider(value: $player.masterVolume, in: 0...1).stableCursor(.link).controlSize(.mini).accessibilityLabel(
              "Volume")
            Text("\(Int(player.masterVolume * 100))%")
              .font(.system(size: 11).monospacedDigit()).foregroundStyle(.secondary).frame(
                width: 32, alignment: .trailing)
          }
          if let error = singing.micError {
            Text(error).font(.caption).foregroundStyle(.red).frame(
              maxWidth: .infinity, alignment: .leading)
          } else if singing.micOn, let score = singing.score {
            Text("Score \(score)").font(.caption.monospacedDigit()).foregroundStyle(AppTheme.accent)
          }
        }
        if !room.upcoming.isEmpty { upNext }
      } else {
        VStack(spacing: 12) {
          LucideIcon("music", size: 28).foregroundStyle(AppTheme.accent)
            .frame(width: 64, height: 64)
            .background(AppTheme.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 18))
          Text("Your next song starts here").font(.system(size: 17, weight: .semibold))
          Text("Pick a favorite and make it yours.")
            .font(.callout).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 16)
      }
      footer
    }
    .padding(20).frame(width: 360)
    .background(AppTheme.card).preferredColorScheme(.dark).tint(AppTheme.accent)
    .menuHost().thinScrollbars()
  }

  private var header: some View {
    HStack(spacing: 9) {
      Image("AppLogo").resizable().frame(width: 26, height: 26)
      VStack(alignment: .leading, spacing: 2) {
        Text("KKaraoke").font(.system(size: 13, weight: .semibold))
        Text(room.isGuest ? "Remote control" : "Menu player").font(.system(size: 10))
          .foregroundStyle(.secondary)
      }
      Spacer()
      if room.offline {
        Label("Offline", lucide: "wifi-off").font(.system(size: 10)).foregroundStyle(.orange)
      }
      AppMenu {
        AppMenuItem(title: "Open KKaraoke", icon: "library-big") { show("main") }
        AppMenuItem(title: "Open TV Display", icon: "tv") { show("tv") }
        AppMenuItem(title: "Settings…", icon: "settings") {
          app.requestedSection = .settings
          show("main")
        }
        AppMenuDivider()
        AppMenuItem(title: "Quit KKaraoke", icon: "log-out", destructive: true) {
          NSApplication.shared.terminate(nil)
        }
      }
    }
  }

  private var transport: some View {
    HStack(spacing: 24) {
      Button {
        player.perform(.previous)
      } label: {
        LucideIcon("skip-back", size: 20)
      }
      .buttonStyle(WebIconButtonStyle()).help("Previous song").accessibilityLabel("Previous song")
      Button {
        player.toggle()
      } label: {
        LucideIcon(player.isPlaying ? "pause" : "play", size: 22)
          .foregroundStyle(.white).frame(width: 48, height: 48)
          .background(AppTheme.accent, in: Circle())
          .shadow(color: AppTheme.accent.opacity(0.2), radius: 8, y: 3)
      }
      .buttonStyle(.plain).stableCursor(.link).disabled(player.status != .ready)
      .opacity(player.status == .ready ? 1 : 0.45)
      .help(player.isPlaying ? "Pause" : "Play").accessibilityLabel(
        player.isPlaying ? "Pause" : "Play")
      Button {
        player.perform(.next)
      } label: {
        LucideIcon("skip-forward", size: 20)
      }
      .buttonStyle(WebIconButtonStyle()).help("Next song").accessibilityLabel("Next song")
    }
    .frame(maxWidth: .infinity)
  }

  @ViewBuilder private var playbackProgress: some View {
    switch player.status {
    case .loading(let fraction):
      VStack(alignment: .leading, spacing: 6) {
        ProgressView(value: fraction).controlSize(.small)
        Text(fraction.map { "Downloading… \(Int($0 * 100))%" } ?? "Downloading…")
          .font(.caption).foregroundStyle(.secondary)
      }
    case .failed(let message):
      Text(message).font(.caption).foregroundStyle(.red).fixedSize(
        horizontal: false, vertical: true)
    default:
      TimelineView(.animation(minimumInterval: 0.25, paused: !player.isPlaying && scrubbing == nil))
      { _ in
        let duration = max(player.duration, 0.1)
        let time = scrubbing ?? player.currentTime
        VStack(spacing: 4) {
          Slider(
            value: Binding(get: { min(time, duration) }, set: { if dragging { scrubbing = $0 } }),
            in: 0...duration
          ) { editing in
            dragging = editing
            if !editing, let target = scrubbing {
              player.seek(to: target)
              scrubbing = nil
            }
          }
          .controlSize(.mini).stableCursor(.link).disabled(player.status != .ready).accessibilityLabel("Song position")
          HStack {
            Text(TrackRow.format(time))
            Spacer()
            Text(TrackRow.format(player.duration))
          }
          .font(.system(size: 10).monospacedDigit()).foregroundStyle(.secondary)
        }
      }
    }
  }

  private var upNext: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text("UP NEXT").font(.system(size: 10, weight: .semibold)).tracking(1)
        Spacer()
        Text("\(room.upcoming.count) queued").font(.system(size: 10))
      }
      .foregroundStyle(.secondary)
      ForEach(Array(room.upcoming.prefix(2).enumerated()), id: \.element.queueID) { index, track in
        HStack(spacing: 10) {
          Artwork(url: track.artworkURL, size: 32, radius: 6)
          VStack(alignment: .leading, spacing: 2) {
            Text(track.name).font(.system(size: 12, weight: .medium)).lineLimit(1)
            Text(track.artistText).font(.system(size: 10)).foregroundStyle(.secondary).lineLimit(1)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          Button {
            room.skip(to: index)
          } label: {
            LucideIcon("play", size: 14)
          }
          .buttonStyle(WebIconButtonStyle()).help("Play \(track.name) now").accessibilityLabel(
            "Play \(track.name) now")
        }
      }
    }
    .padding(12).background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
  }

  private var footer: some View {
    HStack(spacing: 8) {
      Button {
        show("main")
      } label: {
        HStack {
          Text("Open KKaraoke")
          Spacer()
          LucideIcon("chevron-right", size: 16)
        }
        .frame(maxWidth: .infinity)
      }
      .buttonStyle(
        WebButtonStyle(background: Color.primary.opacity(0.06), foreground: .primary, height: 38))
      Button {
        show("tv")
      } label: {
        LucideIcon("tv", size: 18)
      }
      .buttonStyle(WebIconButtonStyle()).help("Open TV Display").accessibilityLabel(
        "Open TV Display")
    }
  }

  private func show(_ id: String) {
    dismiss()
    NSApplication.shared.activate(ignoringOtherApps: true)
    openWindow(id: id)
  }
}

