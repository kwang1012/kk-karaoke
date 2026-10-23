import SwiftUI
import WidgetKit

struct NowPlayingEntry: TimelineEntry {
  var date: Date
  var snapshot: WidgetSnapshot?
}

struct NowPlayingProvider: TimelineProvider {
  func placeholder(in context: Context) -> NowPlayingEntry {
    NowPlayingEntry(
      date: .now, snapshot: WidgetSnapshot(title: "Song title", artist: "Artist", isPlaying: true, nextTitle: "Next song", upNext: 2))
  }
  func getSnapshot(in context: Context, completion: @escaping (NowPlayingEntry) -> Void) {
    completion(NowPlayingEntry(date: .now, snapshot: WidgetSnapshot.load()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<NowPlayingEntry>) -> Void) {
    // The app asks for a reload whenever the song or queue changes.
    completion(Timeline(entries: [NowPlayingEntry(date: .now, snapshot: WidgetSnapshot.load())], policy: .never))
  }
}

struct NowPlayingView: View {
  @Environment(\.widgetFamily) private var family
  var entry: NowPlayingEntry

  var body: some View {
    if let snapshot = entry.snapshot, let title = snapshot.title {
      HStack(spacing: 12) {
        cover.frame(width: family == .systemSmall ? 52 : 84, height: family == .systemSmall ? 52 : 84)
        VStack(alignment: .leading, spacing: 3) {
          Label(snapshot.isPlaying ? "Now singing" : "Paused", systemImage: snapshot.isPlaying ? "mic.fill" : "pause.fill")
            .font(.caption2.weight(.semibold)).foregroundStyle(.pink)
          Text(title).font(.headline).lineLimit(2)
          if let artist = snapshot.artist { Text(artist).font(.subheadline).foregroundStyle(.secondary).lineLimit(1) }
          Spacer(minLength: 0)
          if family != .systemSmall, let next = snapshot.nextTitle {
            Text("Next: \(next)").font(.caption).foregroundStyle(.secondary).lineLimit(1)
            if snapshot.upNext > 1 { Text("+\(snapshot.upNext - 1) more").font(.caption2).foregroundStyle(.tertiary) }
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    } else {
      VStack(spacing: 6) {
        Image(systemName: "mic.fill").font(.title2).foregroundStyle(.pink)
        Text("Nothing playing").font(.headline)
        Text("Pick a song in KKaraoke").font(.caption).foregroundStyle(.secondary)
      }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  @ViewBuilder private var cover: some View {
    if let url = WidgetSnapshot.coverFile, let image = NSImage(contentsOf: url) {
      Image(nsImage: image).resizable().scaledToFill().clipShape(RoundedRectangle(cornerRadius: 10))
    } else {
      RoundedRectangle(cornerRadius: 10).fill(.quaternary).overlay { Image(systemName: "music.note").foregroundStyle(.secondary) }
    }
  }
}

struct NowPlayingWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "app.kkaraoke.nowPlaying", provider: NowPlayingProvider()) { entry in
      NowPlayingView(entry: entry).containerBackground(.background, for: .widget)
    }
    .configurationDisplayName("Now Singing")
    .description("The current song and what is next in the queue.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

@main
struct KKaraokeWidgetBundle: WidgetBundle {
  var body: some Widget { NowPlayingWidget() }
}
