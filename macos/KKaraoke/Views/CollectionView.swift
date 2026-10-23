import SwiftUI

/// The last answer for each playlist or album opened, so opening one again shows it at once while it is refreshed.
@MainActor
enum CollectionMemo {
  private static var kept: [String: CollectionContents] = [:]
  private static var order: [String] = []

  static func contents(_ id: String) -> CollectionContents? { kept[id] }

  static func remember(_ contents: CollectionContents, for id: String) {
    if kept[id] == nil { order.append(id) }
    kept[id] = contents
    while order.count > 40 { kept[order.removeFirst()] = nil }
  }
}

struct CollectionView: View {
  @Environment(AppModel.self) private var model
  @Environment(PlayerModel.self) private var player
  var collection: Collection
  @State private var contents: Load<CollectionContents>

  init(collection: Collection) {
    self.collection = collection
    _contents = State(initialValue: CollectionMemo.contents(collection.id).map { .loaded($0) } ?? .idle)
  }

  var body: some View {
    Group {
      switch contents {
      case .idle, .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
      case .failed(let message): ErrorState(message: message) { Task { await load() } }
      case .loaded(let loaded):
        List {
          header(loaded.collection, tracks: loaded.tracks).listRowSeparator(.hidden)
          ForEach(loaded.tracks) { TrackRow(track: $0) }
        }
        .listStyle(.inset).scrollContentBackground(.hidden)
      }
    }
    .navigationTitle(collection.name)
    .navigationBarBackButtonHidden()
    .thinScrollbars()
    .task(id: collection.id) { await load() }
  }

  private func header(_ collection: Collection, tracks: [Track]) -> some View {
    HStack(alignment: .bottom, spacing: 24) {
      Artwork(url: collection.artworkURL, size: 184, radius: 16)
      VStack(alignment: .leading, spacing: 10) {
        Text(collection.name).font(.system(size: 32, weight: .bold, design: .rounded)).lineLimit(2)
        if !collection.subtitle.isEmpty { Text(collection.subtitle).foregroundStyle(.secondary) }
        Text("\(tracks.count) songs").font(.callout).foregroundStyle(.secondary)
        Button {
          if let first = tracks.first { player.play(first, using: model.client) }
        } label: {
          Label("Play first song", lucide: "play.fill")
        }
        .buttonStyle(WebButtonStyle(capsule: true, height: 44)).disabled(tracks.isEmpty)
        .padding(.top, 6)
      }
    }
    .padding(24).frame(maxWidth: .infinity, alignment: .leading)
    .background(AppTheme.accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 20))
    .padding(.vertical, 16)
  }

  private func load() async {
    guard let client = model.client else {
      contents = .failed("The server address is not valid.")
      return
    }
    contents.startLoading()
    do {
      let fresh = try await client.contents(of: collection)
      CollectionMemo.remember(fresh, for: collection.id)
      contents = .loaded(fresh)
    } catch {
      contents = .failed(error.localizedDescription)
    }
  }
}
