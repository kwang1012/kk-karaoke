import AppKit
import AVKit
import SwiftUI

struct PlayerBar: View {
  @State private var volumeBeforeMute = 0.8
  @Environment(PlayerModel.self) private var player
  @State private var scrubbing: Double?
  @State private var dragging = false
  @State private var showMixer = false
  @Environment(\.openWindow) private var openWindow
  @Environment(\.dismissWindow) private var dismissWindow
  var onNowPlaying: () -> Void = {}
  var onQueue: () -> Void = {}
  var onToggleLyrics: () -> Void = {}
  var queueOpen = false
  var lyricsOpen = false

  var body: some View {
    @Bindable var player = player
    GeometryReader { geometry in
      HStack(spacing: 16) {
        Button(action: onNowPlaying) {
          HStack(spacing: 12) {
            Artwork(url: player.track?.artworkURL, size: 40, radius: 8)
            VStack(alignment: .leading, spacing: 3) {
              Text(player.track?.name ?? tr("Nothing playing")).font(.system(size: 14, weight: .medium))
                .lineLimit(1)
              Text(player.track?.artistText ?? tr("Choose a song to get started")).font(
                .system(size: 12)
              ).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain).stableCursor(.link).help("Open lyrics").frame(maxWidth: .infinity)

        VStack(spacing: 4) {
          HStack(spacing: 12) {
            Button {
              player.perform(.previous)
            } label: {
              LucideIcon("skip-back", size: 18)
            }
            .buttonStyle(WebIconButtonStyle()).help("Previous song").accessibilityLabel(
              "Previous song"
            )
            .disabled(player.track == nil)
            Button {
              player.toggle()
            } label: {
              LucideIcon(player.isPlaying ? "pause" : "play", size: 20)
                .foregroundStyle(.white).frame(width: 40, height: 40)
                .background(
                  player.status == .ready ? AppTheme.accent : Color.secondary.opacity(0.3),
                  in: Circle())
            }
            .buttonStyle(.plain).stableCursor(.link).keyboardShortcut(.space, modifiers: [])
            .help(player.isPlaying ? "Pause" : "Play").accessibilityLabel(
              player.isPlaying ? "Pause" : "Play"
            )
            .disabled(player.status != .ready)
            Button {
              player.perform(.next)
            } label: {
              LucideIcon("skip-forward", size: 18)
            }
            .buttonStyle(WebIconButtonStyle()).help("Next song").accessibilityLabel("Next song")
            .disabled(player.track == nil)
          }
          scrubber
        }
        .frame(width: min(560, max(320, geometry.size.width * 0.4)))

        HStack(spacing: 2) {
          Button(action: onToggleLyrics) { LucideIcon("mic-vocal") }
            .buttonStyle(WebIconButtonStyle())
            .foregroundStyle(lyricsOpen ? AppTheme.accent : .primary)
            .background(lyricsOpen ? AppTheme.accent.opacity(0.12) : .clear, in: Circle())
            .overlay(alignment: .bottom) {
              if lyricsOpen { Circle().fill(AppTheme.accent).frame(width: 4, height: 4) }
            }
            .help(lyricsOpen ? "Hide lyrics" : "Show lyrics")
            .accessibilityLabel("Lyrics")
            .accessibilityValue(lyricsOpen ? "On" : "Off")
            .accessibilityAddTraits(lyricsOpen ? .isSelected : [])
          Button {
            player.vocalVolume = player.vocalVolume > 0 ? 0 : 1
          } label: {
            HStack(spacing: 5) {
              LucideIcon(player.vocalVolume > 0 ? "mic" : "mic-off", size: 14)
              Text(player.vocalVolume > 0 ? "Vocal" : "Karaoke").font(
                .system(size: 11, weight: .medium)
              ).lineLimit(1).fixedSize()
            }
            .padding(.horizontal, 10).frame(height: 30)
            .background(AppTheme.accent.opacity(0.1), in: Capsule())
            .overlay { Capsule().strokeBorder(AppTheme.accent.opacity(0.25)) }
          }
          .buttonStyle(.plain).stableCursor(.link).foregroundStyle(AppTheme.accent).help("Toggle original vocal")
          Button {
            showMixer.toggle()
          } label: {
            LucideIcon("sliders-horizontal", size: 16)
          }
          .buttonStyle(WebIconButtonStyle()).help("Mix, lyrics timing and output").accessibilityLabel(
            "Mix and lyrics timing"
          )
          .dropdown(isPresented: $showMixer, edge: .trailing, width: 340) { MixerView().padding(16) }
          HStack(spacing: 6) {
            Button {
              if player.masterVolume > 0 {
                volumeBeforeMute = player.masterVolume
                player.masterVolume = 0
              } else {
                player.masterVolume = volumeBeforeMute
              }
            } label: {
              LucideIcon(player.masterVolume == 0 ? "volume-x" : "volume-2", size: 16)
                .foregroundStyle(.secondary).frame(width: 22, height: 22)
            }
            .buttonStyle(.plain).stableCursor(.link)
            .help(player.masterVolume == 0 ? "Unmute" : "Mute")
            .accessibilityLabel(player.masterVolume == 0 ? "Unmute" : "Mute")
            Slider(value: $player.masterVolume, in: 0...1).stableCursor(.link).controlSize(.mini).frame(width: 58)
              .accessibilityLabel("Volume")
          }
          .padding(.horizontal, 6)
          Button {
            if WindowFocus.isVisible(MiniLyrics.windowID) {
              dismissWindow(id: MiniLyrics.windowID)
            } else {
              openWindow(id: MiniLyrics.windowID)
            }
          } label: {
            Image(systemName: "pip.enter").font(.system(size: 15))
          }
          .buttonStyle(WebIconButtonStyle()).help("Floating lyrics").accessibilityLabel("Floating lyrics")
          Button(action: onQueue) { LucideIcon("list-music") }
            .buttonStyle(WebIconButtonStyle()).foregroundStyle(
              queueOpen ? AppTheme.accent : .primary
            )
            .help(queueOpen ? "Hide queue" : "Show queue").accessibilityLabel(
              queueOpen ? "Hide queue" : "Show queue"
            )
            .keyboardShortcut("q", modifiers: [.command, .shift])
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
      }
      .padding(.horizontal, 16).frame(height: 84)
    }
    .frame(height: 84)
  }

  @ViewBuilder private var scrubber: some View {
    switch player.status {
    case .loading(let fraction):
      HStack(spacing: 8) {
        ProgressView(value: fraction).controlSize(.mini)
        Text(fraction.map { "Loading \(Int($0 * 100))%" } ?? "Loading…").font(.caption)
          .foregroundStyle(.secondary)
      }.frame(height: 16)
    case .failed(let message):
      Text(message).font(.caption).foregroundStyle(.red).lineLimit(1).help(message).frame(
        height: 16)
    default:
      let _ = player.seekCount
      TimelineView(.animation(minimumInterval: 0.2, paused: !player.isPlaying && scrubbing == nil))
      { _ in
        let duration = max(player.duration, 0.1)
        let time = scrubbing ?? player.currentTime
        HStack(spacing: 8) {
          Text(TrackRow.format(time)).frame(width: 36, alignment: .trailing)
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
          Text(TrackRow.format(player.duration)).frame(width: 36, alignment: .leading)
        }
        .font(.system(size: 11).monospacedDigit()).foregroundStyle(.secondary).frame(height: 16)
      }
    }
  }
}

struct MixerView: View {
  @State private var showOutputs = false
  @Environment(PlayerModel.self) private var player
  @Environment(SingingModel.self) private var singing

  var body: some View {
    @Bindable var player = player
    @Bindable var singing = singing
    VStack(alignment: .leading, spacing: 14) {
      LabeledContent("Volume") { Slider(value: $player.masterVolume, in: 0...1).stableCursor(.link) }
      LabeledContent("Original vocal") { Slider(value: $player.vocalVolume, in: 0...1).stableCursor(.link) }
      LabeledContent("Instrumental") { Slider(value: $player.instrumentalVolume, in: 0...1).stableCursor(.link) }
      LabeledContent("Key") {
        HStack(spacing: 4) {
          Button {
            player.perform(.decreaseSemitone)
          } label: {
            LucideIcon("minus", size: 14)
          }
          .buttonStyle(WebIconButtonStyle()).accessibilityLabel("Lower the key")
          .disabled(player.semitone <= PlayerModel.semitoneRange.lowerBound)
          Text(player.semitone > 0 ? "+\(player.semitone)" : "\(player.semitone)")
            .font(.system(size: 13).monospacedDigit()).frame(width: 52)
          Button {
            player.perform(.increaseSemitone)
          } label: {
            LucideIcon("plus", size: 14)
          }
          .buttonStyle(WebIconButtonStyle()).accessibilityLabel("Raise the key")
          .disabled(player.semitone >= PlayerModel.semitoneRange.upperBound)
        }
      }
      Divider()
      LabeledContent("Lyrics lead") {
        Slider(value: $player.lyricsLead, in: 0...1.5).stableCursor(.link)
      }
      Text(
        "Shows the lyrics earlier on this Mac only, to make up for how long it takes to read and sing."
      )
      .font(.caption).foregroundStyle(.secondary)
      LabeledContent("This song's timing") {
        HStack(spacing: 4) {
          Button {
            player.setAhead(max(-5, player.ahead - 0.1))
          } label: {
            LucideIcon("minus", size: 14)
          }
          .buttonStyle(WebIconButtonStyle()).accessibilityLabel("Earlier")
          Text(String(format: "%+.1f s", player.ahead)).font(.system(size: 13).monospacedDigit())
            .frame(width: 52)
          Button {
            player.setAhead(min(5, player.ahead + 0.1))
          } label: {
            LucideIcon("plus", size: 14)
          }
          .buttonStyle(WebIconButtonStyle()).accessibilityLabel("Later")
        }
      }
      Text("Saved for everyone who sings this song.").font(.caption).foregroundStyle(.secondary)
      Divider()
      LabeledContent("Microphone") { Slider(value: $singing.micVolume, in: 0...1).stableCursor(.link) }
      LabeledContent("Reverb") { Slider(value: $singing.reverb, in: 0...1).stableCursor(.link) }
      Toggle("Hear myself through the speakers", isOn: $singing.monitor).toggleStyle(AppSwitchStyle())
      Text("Use headphones, or the microphone will pick up the speakers and squeal.").font(.caption)
        .foregroundStyle(.secondary)
      LabeledContent("Melody detail") { Slider(value: $singing.melodyDetail, in: 0...1).stableCursor(.link) }
      Divider()
      Button {
        showOutputs.toggle()
      } label: {
        MenuRowLabel(title: "Output device", icon: "speaker")
      }
      .buttonStyle(MenuRowStyle())
      if showOutputs { OutputDevicePicker() }
    }
  }
}

/// Where the sound plays, laid out like Spotify's Connect list: the device in use, then the others.
struct OutputDevicePicker: View {
  @Environment(SingingModel.self) private var singing
  @Environment(CastDiscovery.self) private var cast
  @Environment(PlayerModel.self) private var player
  @Environment(\.dismissMenu) private var dismiss

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("Output device").font(.system(size: 16, weight: .semibold))
        .padding(.horizontal, 10).padding(.top, 8).padding(.bottom, 8)
      row("System Default", icon: "laptop", uid: "")
      ForEach(singing.outputs) { row(LocalizedStringKey($0.name), icon: Self.icon($0.kind), uid: $0.uid) }
      if !singing.outputUID.isEmpty, !singing.outputs.contains(where: { $0.uid == singing.outputUID }) {
        row("Selected output (unavailable)", icon: "speaker", uid: singing.outputUID)
      }
      if !cast.devices.isEmpty {
        Divider().padding(.vertical, 6).padding(.horizontal, 4)
        Text("Nearby TVs and speakers").font(.system(size: 11, weight: .medium))
          .foregroundStyle(.secondary).padding(.horizontal, 10).padding(.bottom, 2)
        ForEach(cast.devices) { device in
          let current = player.cast.device?.id == device.id && player.cast.state != .off
          Button {
            if current { player.stopCasting() } else { player.castTo(device) }
          } label: {
            HStack(spacing: 12) {
              LucideIcon("tv", size: 20)
              VStack(alignment: .leading, spacing: 1) {
                Text(device.name).lineLimit(1)
                Text(castCaption(device, current: current)).font(.system(size: 11))
                  .foregroundStyle(.secondary).lineLimit(1)
              }
              Spacer(minLength: 0)
              if current, player.cast.state == .connecting { ProgressView().controlSize(.small) }
              else if current { LucideIcon("check", size: 14) }
            }
            .foregroundStyle(current ? AppTheme.accent : .primary)
            .padding(.vertical, 6)
          }
          .buttonStyle(MenuRowStyle())
        }
      }
      Divider().padding(.vertical, 6).padding(.horizontal, 4)
      Button {
        dismiss()
        if let url = URL(string: "x-apple.systempreferences:com.apple.Sound-Settings.extension") {
          NSWorkspace.shared.open(url)
        }
      } label: {
        MenuRowLabel(title: "Don't see your device?", icon: "external-link")
      }
      .buttonStyle(MenuRowStyle())
    }
    .onAppear {
      if singing.outputs.isEmpty { singing.refreshDevices() }
      cast.start()
    }
  }

  private func castCaption(_ device: CastDevice, current: Bool) -> String {
    if current, case .failed(let message) = player.cast.state { return message }
    return device.model.isEmpty ? tr("Google Cast") : tr("Google Cast · \(device.model)")
  }

  private static func icon(_ kind: AudioDevice.Kind) -> String {
    switch kind {
    case .builtIn: "laptop"
    case .bluetooth: "headphones"
    case .airplay: "airplay"
    case .display: "monitor"
    case .usb, .other: "speaker"
    }
  }

  private func row(_ name: LocalizedStringKey, icon: String, uid: String) -> some View {
    let current = singing.outputUID == uid && !player.cast.isActive
    return Button {
      player.stopCasting()
      singing.outputUID = uid
    } label: {
      HStack(spacing: 12) {
        LucideIcon(icon, size: 20)
        Text(name).lineLimit(1)
        Spacer(minLength: 0)
        if current { LucideIcon("check", size: 14) }
      }
      .foregroundStyle(current ? AppTheme.accent : .primary)
      .padding(.vertical, 6)
    }
    .buttonStyle(MenuRowStyle())
  }
}
