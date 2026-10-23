import AppKit
import SwiftUI

/// A string shown to people that follows the Mac's language: errors, notifications, menu titles.
func tr(_ key: String.LocalizationValue) -> String { String(localized: key) }

/// Shared with the web palette, while following the Mac's light/dark appearance.
enum AppTheme {
  static let accent = adaptive(0xd6246e, 0xec4a85)
  static let background = adaptive(0xf5f4f0, 0x09090c)
  static let card = adaptive(0xffffff, 0x131318)
  static let popover = adaptive(0xffffff, 0x232329)

  private static func adaptive(_ light: Int, _ dark: Int) -> Color {
    Color(
      nsColor: NSColor(name: nil) { appearance in
        let value = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
        return NSColor(
          srgbRed: CGFloat((value >> 16) & 255) / 255,
          green: CGFloat((value >> 8) & 255) / 255,
          blue: CGFloat(value & 255) / 255, alpha: 1)
      })
  }
}

struct PageHeading: View {
  var title: LocalizedStringKey
  var subtitle: LocalizedStringKey

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title).font(.system(size: 30, weight: .bold, design: .rounded))
      Text(subtitle).font(.callout).foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 32).padding(.top, 28).padding(.bottom, 20)
  }
}

struct Artwork: View {
  var url: URL?
  var size: CGFloat
  var radius: CGFloat = 6

  var body: some View {
    AsyncImage(url: url) { phase in
      switch phase {
      case .success(let image): image.resizable().scaledToFill()
      default:
        ZStack {
          Color.secondary.opacity(0.15)
          LucideIcon("music.note").foregroundStyle(.secondary)
        }
      }
    }
    .frame(width: size, height: size)
    .clipShape(RoundedRectangle(cornerRadius: radius))
  }
}

struct TrackRow: View {
  @Environment(RoomModel.self) private var room
  @Environment(PlayerModel.self) private var player
  @Environment(AppModel.self) private var app
  @Environment(OfflineLibrary.self) private var offline
  @Environment(ReadyStore.self) private var ready
  var track: Track

  @State private var hovering = false

  var body: some View {
    HStack(spacing: 12) {
      Button {
        room.addToQueue(track)
      } label: {
        Artwork(url: track.artworkURL, size: 40, radius: 8)
          .overlay {
            if hovering {
              RoundedRectangle(cornerRadius: 8).fill(.black.opacity(0.55))
              LucideIcon("plus").foregroundStyle(.white)
            }
          }
          .overlay(alignment: .bottomTrailing) {
            if ready.contains(track.id) {
              LucideIcon("check", size: 10).foregroundStyle(.black)
                .frame(width: 16, height: 16).background(Color.green, in: Circle())
                .overlay { Circle().strokeBorder(AppTheme.card, lineWidth: 2) }
                .offset(x: 3, y: 3).help("Processed: vocals are separated, ready to sing")
            }
          }
      }
      .buttonStyle(.plain).pointerStyle(.link).help("Add to queue").accessibilityLabel("Add \(track.name) to queue")
      VStack(alignment: .leading, spacing: 3) {
        Text(track.name).font(.system(size: 14, weight: .medium)).lineLimit(1)
          .foregroundStyle(player.track?.id == track.id ? AppTheme.accent : .primary)
        Text(track.artistText).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if offline.downloading[track.id] != nil { ProgressView().controlSize(.mini) }
      AppMenu(label: "Song actions") {
        AppMenuItem(title: "Add to Queue", icon: "plus") { room.addToQueue(track) }
        AppMenuItem(title: "Play Next", icon: "skip-forward") { room.playNext(track) }
        AppMenuItem(title: "Play Now", icon: "play") { room.playNow(track) }
        AppMenuDivider()
        if offline.isPinned(track.id) {
          AppMenuItem(title: "Remove Download", icon: "trash-2") { offline.unpin(track) }
        } else {
          AppMenuItem(title: "Download for Offline", icon: "download") {
            offline.pin(track, using: app.client)
          }
        }
      }
    }
    .padding(.horizontal, 8).frame(minHeight: 56)
    .background(
      hovering ? Color.primary.opacity(0.04) : .clear, in: RoundedRectangle(cornerRadius: 12)
    )
    .contentShape(Rectangle()).onHover { hovering = $0 }
    .contextMenu { actions }
  }

  @ViewBuilder private var actions: some View {
    Button("Add to Queue") { room.addToQueue(track) }
    Button("Play Next") { room.playNext(track) }
    Button("Play Now") { room.playNow(track) }
    Divider()
    if offline.isPinned(track.id) {
      Button("Remove Download") { offline.unpin(track) }
    } else {
      Button("Download for Offline") { offline.pin(track, using: app.client) }
    }
  }

  static func format(_ seconds: TimeInterval) -> String {
    let total = Int(seconds.rounded())
    return String(format: "%d:%02d", total / 60, total % 60)
  }
}

struct CollectionCard: View {
  var collection: Collection
  @State private var hovering = false

  var body: some View {
    NavigationLink(value: collection) {
      VStack(alignment: .leading, spacing: 8) {
        Artwork(url: collection.artworkURL, size: 152, radius: 8)
          .shadow(color: .black.opacity(0.12), radius: 8, y: 4)
        Text(collection.name).font(.callout.weight(.medium)).lineLimit(1)
        Text(collection.subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
      }
      .frame(width: 152, alignment: .leading)
      .padding(12)
      .background(hovering ? AppTheme.card : .clear, in: RoundedRectangle(cornerRadius: 16))
    }
    .buttonStyle(.plain).pointerStyle(.link)
    .onHover { hovering = $0 }
    .animation(.easeOut(duration: 0.15), value: hovering)
  }
}

/// A service's mark in its colour: its logo, or a letter for KKBOX, which has no glyph to use.
struct ProviderMark: View {
  var source: String
  var size: CGFloat = 22

  static func color(_ source: String) -> Color {
    switch source {
    case "kkbox": Color(red: 0.25, green: 0.55, blue: 1.0)
    case "spotify": Color(red: 0.12, green: 0.78, blue: 0.38)
    case "apple": Color(red: 1.0, green: 0.30, blue: 0.40)
    default: Color(red: 1.0, green: 0.35, blue: 0.30)
    }
  }

  private var asset: String? {
    switch source {
    case "spotify": "brand-spotify"
    case "apple": "brand-applemusic"
    case "ytmusic": "brand-youtubemusic"
    default: nil
    }
  }

  var body: some View {
    Group {
      if let asset {
        Image(asset).renderingMode(.template).resizable().scaledToFit().foregroundStyle(Self.color(source))
      } else {
        Text("K").font(.system(size: size * 0.62, weight: .heavy, design: .rounded)).foregroundStyle(.white)
          .frame(width: size, height: size).background(Self.color(source), in: RoundedRectangle(cornerRadius: size * 0.28))
      }
    }
    .frame(width: size, height: size).accessibilityHidden(true)
  }
}

/// A chart from another service: a quiet card with the chart's name in the app's language. The service's
/// colour is only a small mark, so a long list of charts stays calm.
struct ChartCard: View {
  var source: String
  var chart: Collection
  @State private var hovering = false

  /// The chart's id says what it is: "chart:kkbox:297", "chart:ytmusic:tw:trending".
  private var parts: [String] { chart.id.split(separator: ":").map(String.init) }

  private var title: String {
    let key = parts.count > 2 ? parts[2] : ""
    switch (source, key) {
    case ("kkbox", "297"): return tr("Mandarin")
    case ("kkbox", "390"): return tr("Western")
    case ("kkbox", "308"): return tr("Japanese")
    case ("kkbox", "314"): return tr("Korean")
    case ("kkbox", "304"): return tr("Taiwanese")
    case (_, "tw"): return tr("Taiwan")
    case (_, "hk"): return tr("Hong Kong")
    case (_, "jp"): return tr("Japan")
    case (_, "kr"): return tr("Korea")
    case (_, "us"): return tr("United States")
    case (_, "global"): return tr("Global")
    default: return chart.name
    }
  }

  private var subtitle: String {
    switch source {
    case "kkbox": return tr("Daily chart")
    case "spotify": return tr("Daily top 50")
    case "apple": return tr("Top songs")
    default: return parts.last == "trending" ? tr("Trending 20") : tr("Top 100")
    }
  }

  var body: some View {
    NavigationLink(value: chart) {
      HStack(spacing: 12) {
        ProviderMark(source: source, size: 28)
        VStack(alignment: .leading, spacing: 2) {
          Text(title).font(.system(size: 14, weight: .semibold)).lineLimit(1)
          Text(subtitle).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
        }
        Spacer(minLength: 0)
        LucideIcon("chevron-right", size: 14).foregroundStyle(.secondary).opacity(hovering ? 1 : 0)
      }
      .padding(.horizontal, 14).frame(height: 60)
      .background(Color.primary.opacity(hovering ? 0.08 : 0.04), in: RoundedRectangle(cornerRadius: 12))
      .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(.primary.opacity(0.08)) }
      .contentShape(RoundedRectangle(cornerRadius: 12))
    }
    .buttonStyle(.plain).pointerStyle(.link)
    .onHover { hovering = $0 }
    .accessibilityLabel("\(source) \(title)")
  }
}

struct CollectionShelf: View {
  var title: String
  var collections: [Collection]

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(title).font(.system(size: 18, weight: .semibold)).padding(.horizontal, 32)
      ScrollView(.horizontal, showsIndicators: false) {
        LazyHStack(alignment: .top, spacing: 0) {
          ForEach(collections) { CollectionCard(collection: $0) }
        }
        .padding(.horizontal, 20)
      }
    }
  }
}

/// What a screen shows while it loads, fails or has nothing.
enum Load<Value> {
  case idle, loading
  case loaded(Value)
  case failed(String)

  /// Shows the spinner unless there is something to show already: a screen opened again keeps its earlier content.
  mutating func startLoading() { if case .loaded = self { return }; self = .loading }
}

struct ErrorState: View {
  var message: String
  var retry: () -> Void

  var body: some View {
    ContentUnavailableView {
      Label("Can't reach the server", lucide: "wifi.slash")
    } description: {
      Text(message)
    } actions: {
      Button("Try Again", action: retry)
    }
  }
}

/// Keeps a song on this Mac for singing offline: a button that shows the download, then that it is kept.
struct PinButton: View {
  @Environment(AppModel.self) private var app
  @Environment(OfflineLibrary.self) private var offline
  var track: Track

  var body: some View {
    Group {
      if let progress = offline.downloading[track.id] {
        if let fraction = progress {
          ProgressView(value: fraction).progressViewStyle(.circular).controlSize(.small)
        } else {
          ProgressView().controlSize(.small)
        }
      } else if offline.isPinned(track.id) {
        Button {
          offline.unpin(track)
        } label: {
          LucideIcon("arrow.down.circle.fill").font(.title3).foregroundStyle(.green)
        }
        .buttonStyle(.plain).pointerStyle(.link).help("Downloaded for offline. Click to remove.")
        .accessibilityLabel("Remove \(track.name) from downloads")
      } else {
        Button {
          offline.pin(track, using: app.client)
        } label: {
          LucideIcon("arrow.down.circle").font(.title3)
        }
        .buttonStyle(.plain).pointerStyle(.link).help(offline.failures[track.id] ?? tr("Download for offline"))
        .foregroundStyle(offline.failures[track.id] == nil ? Color.primary : Color.red)
        .accessibilityLabel("Download \(track.name) for offline")
      }
    }
    .frame(width: 24)
  }
}
