import SwiftUI

struct SearchView: View {
  @Environment(AppModel.self) private var model
  @Binding var query: String
  @State private var results: Load<SearchResults> = .idle

  private static let suggestions = [
    "周杰倫", "五月天", "蔡依林", "鄧紫棋", "BTS", "IU", "Taylor Swift", "米津玄師", "YOASOBI", "Adele",
  ]

  var body: some View {
    VStack(spacing: 0) {
      PageHeading(
        title: "Find your next song",
        subtitle: "Search songs, artists, and albums. Your next favorite is a search away.")
      Group {
        switch results {
        case .idle:
          VStack(alignment: .leading, spacing: 12) {
            Text("Start with an artist").font(.title3.weight(.semibold))
            FlowLayout(spacing: 8) {
              ForEach(Self.suggestions, id: \.self) { name in
                Button(name) {
                  query = name
                }.buttonStyle(.chip)
              }
            }
            Spacer()
          }
          .padding(32).frame(maxWidth: .infinity, alignment: .leading)
        case .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message): ErrorState(message: message) { Task { await search() } }
        case .loaded(let found):
          if found.tracks.isEmpty && found.albums.isEmpty && found.playlists.isEmpty {
            ContentUnavailableView.search(text: query)
          } else {
            List {
              if !found.tracks.isEmpty {
                Section("Songs") { ForEach(found.tracks) { TrackRow(track: $0) } }
              }
              if !found.albums.isEmpty { shelf(tr("Albums"), found.albums) }
              if !found.playlists.isEmpty { shelf(tr("Playlists"), found.playlists) }
            }
            .listStyle(.inset).scrollContentBackground(.hidden)
          }
        }
      }
    }
    .navigationTitle("Search")
    .thinScrollbars()
    .task(id: [query, model.serverText]) { await search() }
  }

  private func shelf(_ title: String, _ items: [Collection]) -> some View {
    Section(title) {
      ScrollView(.horizontal, showsIndicators: false) {
        LazyHStack(alignment: .top, spacing: 16) {
          ForEach(items) { CollectionCard(collection: $0) }
        }
      }
      .listRowSeparator(.hidden)
    }
  }

  private func search() async {
    let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else {
      results = .idle
      return
    }
    guard let client = model.client else {
      results = .failed("The server address is not valid.")
      return
    }
    results = .loading
    do {
      try await Task.sleep(for: .milliseconds(300))
      let found = try await client.search(text)
      try Task.checkCancellation()
      results = .loaded(found)
    } catch {
      if !Task.isCancelled { results = .failed(error.localizedDescription) }
    }
  }

}

/// Wraps its children onto new lines, like text.
struct FlowLayout: Layout {
  var spacing: CGFloat = 8

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    arrange(width: proposal.width ?? .infinity, subviews: subviews).size
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    for (index, origin) in arrange(width: bounds.width, subviews: subviews).origins.enumerated() {
      subviews[index].place(
        at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y), proposal: .unspecified)
    }
  }

  private func arrange(width: CGFloat, subviews: Subviews) -> (size: CGSize, origins: [CGPoint]) {
    var origins: [CGPoint] = []
    var x: CGFloat = 0
    var y: CGFloat = 0
    var rowHeight: CGFloat = 0
    var maxX: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > 0, x + size.width > width {
        x = 0
        y += rowHeight + spacing
        rowHeight = 0
      }
      origins.append(CGPoint(x: x, y: y))
      x += size.width + spacing
      rowHeight = max(rowHeight, size.height)
      maxX = max(maxX, x - spacing)
    }
    return (CGSize(width: maxX, height: y + rowHeight), origins)
  }
}
