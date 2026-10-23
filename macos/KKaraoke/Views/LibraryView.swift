import SwiftUI

struct LibraryView: View {
  @Environment(AppModel.self) private var model
  @Environment(OfflineLibrary.self) private var offline
  @State private var tracks: Load<[Track]> = .idle
  @State private var filter = ""
  @State private var sort: Sort = .recent
  @State private var downloadedOnly = false
  /// The server could not be reached: the songs on show are the ones kept on this Mac.
  @State private var offlineView = false

  enum Sort: String, CaseIterable, Identifiable {
    case recent = "Recently added"
    case title = "Title"
    case artist = "Artist"
    var id: String { rawValue }
    var title: LocalizedStringKey {
      switch self {
      case .recent: "Recently added"
      case .title: "Title"
      case .artist: "Artist"
      }
    }
  }

  var body: some View {
    VStack(spacing: 0) {
      PageHeading(title: "Your library", subtitle: "All your ready-to-sing songs, in one place.")
      libraryControls
        .padding(.horizontal, 32).padding(.bottom, 16)
      if offlineView {
        Label(
          "Can't reach the server. Showing the songs downloaded to this Mac.", lucide: "wifi.slash"
        )
        .font(.callout).foregroundStyle(.orange).frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 32).padding(.bottom, 8)
      }
      Group {
        switch tracks {
        case .idle, .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message): ErrorState(message: message) { Task { await load() } }
        case .loaded(let all):
          let shown = visible(all)
          if all.isEmpty {
            AppEmptyState(
              "No songs yet", lucide: "music.note.list",
              description: Text("Songs that finish processing show up here."))
          } else if shown.isEmpty {
            ContentUnavailableView.search(text: filter)
          } else {
            List(shown) { TrackRow(track: $0) }
              .listStyle(.inset).scrollContentBackground(.hidden)
          }
        }
      }
    }
    .navigationTitle("Library")
    .thinScrollbars()
    .task(id: model.serverText) { await load() }
  }

  private var libraryControls: some View {
    HStack(spacing: 12) {
      HStack(spacing: 8) {
        LucideIcon("search", size: 16).foregroundStyle(.secondary)
        TextField("Search your library", text: $filter)
          .textFieldStyle(.plain).accessibilityLabel("Search your library")
        if !filter.isEmpty {
          Button {
            filter = ""
          } label: {
            LucideIcon("x", size: 14)
          }
          .buttonStyle(.plain).pointerStyle(.link).help("Clear library search").accessibilityLabel(
            "Clear library search")
        }
      }
      .padding(.horizontal, 14).frame(height: 40)
      .background(AppTheme.background, in: Capsule())
      .overlay { Capsule().strokeBorder(.primary.opacity(0.12)) }
      Toggle(isOn: $downloadedOnly) { Label("Downloaded", lucide: "download") }
        .toggleStyle(AppChipToggleStyle()).help("Only the songs downloaded to this Mac")
      AppSelect(
        label: "Sort library", selection: $sort,
        options: Sort.allCases.map { SelectOption(value: $0, title: $0.title) }, width: 160)
    }
  }

  private func visible(_ all: [Track]) -> [Track] {
    let needle = filter.trimmingCharacters(in: .whitespaces)
    let pool = downloadedOnly ? all.filter { offline.isPinned($0.id) } : all
    let matching =
      needle.isEmpty
      ? pool
      : pool.filter {
        "\($0.name) \($0.artistText) \($0.album?.name ?? "")".localizedCaseInsensitiveContains(
          needle)
      }
    switch sort {
    case .recent: return matching.sorted { ($0.timeAdded ?? 0) > ($1.timeAdded ?? 0) }
    case .title:
      return matching.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    case .artist:
      return matching.sorted {
        $0.artistText.localizedStandardCompare($1.artistText) == .orderedAscending
      }
    }
  }

  private func load() async {
    guard let client = model.client else {
      tracks = .failed("The server address is not valid.")
      return
    }
    tracks.startLoading()
    do {
      tracks = .loaded(try await client.library())
      offlineView = false
    } catch APIError.offline where !offline.songs.isEmpty {
      tracks = .loaded(offline.tracks)
      offlineView = true
    } catch {
      tracks = .failed(error.localizedDescription)
    }
  }
}
