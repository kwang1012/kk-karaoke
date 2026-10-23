import SwiftUI

struct BrowseView: View {
  @Environment(AppModel.self) private var model
  @Environment(RoomModel.self) private var room
  @State private var readyTracks: [Track] = []
  @State private var suggestionError: String?
  @State private var shelves: Load<[String: [Collection]]> = .idle
  @State private var charts: [ChartSource] = []
  @AppStorage("chartSource") private var chartSource = "kkbox"

  private static let sections: [(keyword: String, title: String)] = [
    ("chinese", tr("Chinese")), ("korean", tr("Korean")), ("english", tr("English")), ("japanese", tr("Japanese")),
  ]

  var onSearch: () -> Void = {}
  var onLibrary: () -> Void = {}
  @State private var language = "all"

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        hero.padding(.horizontal, 32)
        if !readyTracks.isEmpty {
          VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .bottom) {
              VStack(alignment: .leading, spacing: 3) {
                Text("Ready to sing").font(.system(size: 18, weight: .semibold))
                Text("Processed songs start instantly").font(.system(size: 12)).foregroundStyle(
                  .secondary)
              }
              Spacer()
              Button("See all →", action: onLibrary).buttonStyle(.plain).stableCursor(.link).foregroundStyle(
                AppTheme.accent
              ).font(.callout)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), spacing: 16)], spacing: 0) {
              ForEach(Array(readyTracks.prefix(8))) { TrackRow(track: $0) }
            }
          }
          .padding(.horizontal, 32)
        }
        if !charts.isEmpty {
          VStack(alignment: .leading, spacing: 12) {
            Text("Charts").font(.system(size: 22, weight: .bold))
            ScrollView(.horizontal, showsIndicators: false) {
              HStack(spacing: 8) {
                ForEach(charts) { source in chip(source.name, selected: shownChartSource == source.id, mark: source.id) { chartSource = source.id } }
              }
            }
            if let source = charts.first(where: { $0.id == shownChartSource }) {
              LazyVGrid(columns: [GridItem(.adaptive(minimum: 200), spacing: 12)], spacing: 12) {
                ForEach(source.charts) { ChartCard(source: source.id, chart: $0) }
              }
            }
          }
          .padding(.horizontal, 32)
        }
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            languageChip("All", value: "all")
            ForEach(Self.sections, id: \.keyword) { languageChip($0.title, value: $0.keyword) }
          }
          .padding(.horizontal, 32)
        }
        if let suggestionError {
          Text(suggestionError).font(.caption).foregroundStyle(.red).padding(.horizontal, 32)
        }

        switch shelves {
        case .idle, .loading:
          ProgressView("Finding your next song…").frame(maxWidth: .infinity).padding(40)
        case .failed(let message): ErrorState(message: message) { Task { await load() } }
        case .loaded(let categories):
          if Self.sections.filter({ language == "all" || language == $0.keyword })
            .allSatisfy({ categories[$0.keyword]?.isEmpty ?? true })
          {
            AppEmptyState(
              "No collections yet", lucide: "square.grid.2x2",
              description: Text("Try another language or search for a song."))
          }
          ForEach(Self.sections, id: \.keyword) { section in
            if language == "all" || language == section.keyword,
              let items = categories[section.keyword], !items.isEmpty
            {
              CollectionShelf(title: tr("\(section.title) KTV favorites"), collections: items)
            }
          }
        }
      }
      .padding(.vertical, 24)
    }
    .navigationTitle("Browse")
    .thinScrollbars()
    .task(id: model.serverText) { await load() }
  }

  private var shownChartSource: String { charts.contains { $0.id == chartSource } ? chartSource : (charts.first?.id ?? "") }

  private func languageChip(_ title: String, value: String) -> some View {
    chip(title, selected: language == value) { language = value }
  }

  private func chip(_ title: String, selected: Bool, mark: String? = nil, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack(spacing: 8) {
        if let mark { ProviderMark(source: mark, size: 16) }
        Text(title).font(.system(size: 13, weight: .medium))
      }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .foregroundStyle(selected ? AppTheme.card : Color.secondary)
        .background(selected ? Color.primary : .clear, in: Capsule())
        .overlay {
          Capsule().strokeBorder(selected ? .clear : Color.primary.opacity(0.12))
        }
    }
    .buttonStyle(.plain).stableCursor(.link).accessibilityAddTraits(selected ? .isSelected : [])
  }

  private var hero: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(greeting).font(.system(size: 13, weight: .medium)).foregroundStyle(.white.opacity(0.8))
      Text("Ready to sing?").font(.system(size: 48, weight: .heavy)).tracking(-1.5)
      Text(
        "Pick a song, drop it in the queue, and the lyrics follow along. Invite friends from the queue panel."
      )
      .font(.system(size: 13)).foregroundStyle(.white.opacity(0.8)).lineSpacing(3)
      .frame(maxWidth: 448, alignment: .leading).fixedSize(horizontal: false, vertical: true)
      HStack(spacing: 8) {
        Button {
          surprise()
        } label: {
          Label("Surprise me", lucide: "shuffle")
        }
        .buttonStyle(WebButtonStyle(background: .white, foreground: .black))
        Button(action: onSearch) { Label("Search songs", lucide: "search") }
          .buttonStyle(WebButtonStyle(background: .white.opacity(0.15), foreground: .white))
      }
      .controlSize(.large).padding(.top, 12)
    }
    .padding(40).foregroundStyle(.white).frame(maxWidth: .infinity, alignment: .leading)
    .background(
      LinearGradient(
        colors: [
          Color(red: 1, green: 0.416, blue: 0.659), Color(red: 0.722, green: 0.114, blue: 0.345),
        ], startPoint: .topLeading, endPoint: .bottomTrailing)
    )
    .overlay(alignment: .bottomTrailing) {
      LucideIcon("mic-vocal", size: 200).rotationEffect(.degrees(-12))
        .foregroundStyle(.white.opacity(0.1)).offset(x: -30, y: 30).allowsHitTesting(false)
    }
    .clipShape(RoundedRectangle(cornerRadius: 24))
    .shadow(color: .black.opacity(0.08), radius: 12, y: 6)
  }

  private var greeting: String {
    let hour = Calendar.current.component(.hour, from: Date())
    if hour < 5 { return tr("Still up?") }
    if hour < 12 { return tr("Good morning") }
    if hour < 18 { return tr("Good afternoon") }
    return tr("Good evening")
  }

  private func surprise() {
    if let track = readyTracks.randomElement() {
      room.addToQueue(track)
    } else {
      suggestionError = tr("No ready songs yet. Search for a song to get started.")
    }
  }

  private func load() async {
    guard let client = model.client else {
      shelves = .failed("The server address is not valid.")
      return
    }
    shelves.startLoading()
    async let ready = try? client.library()
    async let chartList = try? client.charts()
    do { shelves = .loaded(try await client.topCategories(Self.sections.map(\.keyword))) } catch {
      shelves = .failed(error.localizedDescription)
    }
    charts = await chartList ?? []
    readyTracks = (await ready ?? []).sorted { ($0.timeAdded ?? 0) > ($1.timeAdded ?? 0) }
  }
}
