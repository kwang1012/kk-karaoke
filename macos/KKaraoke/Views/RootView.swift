import SwiftUI

enum AppSection: Hashable { case browse, search, library, lyrics, settings }

/// Lyrics is a temporary view over the current browsing location, including its history.
struct AppNavigation {
  struct Location {
    var section: AppSection = .browse
    var path: [Collection] = []
    var forwardPath: [Collection] = []
  }
  var location = Location()
  private var lyricsReturnTo = Location()
  var lyricsOpen: Bool { location.section == .lyrics && location.path.isEmpty }

  mutating func navigate(_ destination: AppSection) {
    if destination == .lyrics, !lyricsOpen { lyricsReturnTo = location }
    location = Location(section: destination)
  }

  mutating func toggleLyrics() {
    if lyricsOpen { location = lyricsReturnTo }
    else { navigate(.lyrics) }
  }
}

private enum JamSheet: String, Identifiable {
  case invite, join, login
  var id: String { rawValue }
}

struct RootView: View {
  @Environment(AppModel.self) private var model
  @Environment(RoomModel.self) private var room
  @Environment(\.openWindow) private var openWindow
  @State private var navigation = AppNavigation()
  private var section: AppSection { navigation.location.section }
  @State private var visited: Set<AppSection> = [.browse]
  @State private var searchText = ""
  @State private var activeSheet: JamSheet?
  @State private var lyricsFullscreen = false
  @State private var lyricsWindow: NSWindow?
  @State private var enteredNativeFullscreen = false
  @AppStorage("queueOpen") private var showQueue = true
  @AppStorage("queueWidth") private var queueWidth = 360.0
  @State private var queueResizeStart: Double?
  @FocusState private var searchFocused: Bool

  var body: some View {
    VStack(spacing: 12) {
      if !lyricsFullscreen { topBar }
      HStack(alignment: .top, spacing: 12) {
        VStack(spacing: 12) {
          NavigationStack(path: $navigation.location.path) {
            // Screens stay in the tree once opened, so coming back shows them as they were, at once,
            // instead of starting from a spinner. Build the lyrics stage before a click, too:
            // creating WebKit for the first time is expensive while a song is already playing.
            ZStack {
              if visited.contains(.browse) {
                kept(.browse) {
                  BrowseView(onSearch: { navigate(.search) }, onLibrary: { navigate(.library) })
                }
              }
              if visited.contains(.search) { kept(.search) { SearchView(query: $searchText) } }
              if visited.contains(.library) { kept(.library) { LibraryView() } }
              if visited.contains(.settings) { kept(.settings) { SettingsView() } }
              kept(.lyrics) {
                NowPlayingView(
                  fullscreen: lyricsFullscreen, active: navigation.lyricsOpen,
                  onToggleFullscreen: toggleLyricsFullscreen)
              }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(AppTheme.card)
            .navigationDestination(for: Collection.self) { CollectionView(collection: $0) }
          }
          .toolbarVisibility(.hidden, for: .windowToolbar)
          .clipShape(RoundedRectangle(cornerRadius: lyricsFullscreen ? 0 : 16))
          .overlay {
            RoundedRectangle(cornerRadius: lyricsFullscreen ? 0 : 16)
              .strokeBorder(.primary.opacity(lyricsFullscreen ? 0 : 0.08))
          }
        }
        .frame(maxWidth: .infinity)
        if showQueue && !lyricsFullscreen {
          QueueView(
            onClose: { showQueue = false }, onInvite: { activeSheet = .invite },
            onSearch: { navigate(.search) }
          )
          .frame(width: queueWidth)
          .clipShape(RoundedRectangle(cornerRadius: 16))
          .overlay { RoundedRectangle(cornerRadius: 16).strokeBorder(.primary.opacity(0.08)) }
          .overlay(alignment: .leading) {
            Color.clear.frame(width: 12).contentShape(Rectangle()).offset(x: -10)
              .stableCursor(.columnResize)
              .gesture(
                DragGesture(minimumDistance: 1, coordinateSpace: .global)
                  .onChanged { drag in
                    let start = queueResizeStart ?? queueWidth
                    queueResizeStart = start
                    queueWidth = min(560, max(300, start - drag.translation.width))
                  }
                  .onEnded { _ in queueResizeStart = nil }
              )
          }
        }
      }
      if !lyricsFullscreen {
        VStack(spacing: 0) {
          RoomBanner()
          PlayerBar(
            onNowPlaying: { navigate(.lyrics) }, onQueue: { showQueue.toggle() },
            onToggleLyrics: {
              navigation.toggleLyrics()
              searchFocused = section == .search
            },
            queueOpen: showQueue, lyricsOpen: navigation.lyricsOpen
          )
        }
        .background(AppTheme.card.opacity(0.9), in: RoundedRectangle(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).strokeBorder(.primary.opacity(0.08)) }
      }
    }
    .padding(lyricsFullscreen ? 0 : 12).background(AppTheme.background).tint(AppTheme.accent)
    .ignoresSafeArea(.container, edges: .top)
    .preferredColorScheme(.dark)
    .menuHost()
    .thinScrollbars()
    .onAppear { openRequestedSection() }
    .onChange(of: model.requestedSection) { _, _ in openRequestedSection() }
    .onExitCommand { if lyricsFullscreen { toggleLyricsFullscreen() } }
    .onReceive(NotificationCenter.default.publisher(for: NSWindow.didExitFullScreenNotification)) {
      notification in
      guard let window = notification.object as? NSWindow, window === lyricsWindow else { return }
      lyricsFullscreen = false
      enteredNativeFullscreen = false
    }
    .sheet(item: $activeSheet) { sheet in
      switch sheet {
      case .invite:
        InviteView(onJoin: { activeSheet = .join }, onClose: { activeSheet = nil })
      case .join:
        JoinRoomView(onClose: { activeSheet = nil }, onLogin: { model.auth.openAccount() })
      case .login:
        LoginView(onClose: {
          model.auth.cancelLogin()
          activeSheet = nil
        })
      }
    }
    .onChange(of: model.auth.showLogin) { _, show in
      if show {
        activeSheet = .login
      } else if activeSheet == .login {
        activeSheet = model.auth.reason == .host && model.auth.session != nil ? .invite : nil
      }
    }
    .onChange(of: section) { _, now in
      visited.insert(now)
    }
    .onChange(of: searchText) { _, value in
      if !value.isEmpty, section != .search { navigate(.search) }
    }
  }

  private func toggleLyricsFullscreen() {
    if lyricsFullscreen {
      lyricsFullscreen = false
      if enteredNativeFullscreen, lyricsWindow?.styleMask.contains(.fullScreen) == true {
        lyricsWindow?.toggleFullScreen(nil)
      }
      enteredNativeFullscreen = false
    } else {
      guard let window = NSApp.keyWindow else { return }
      lyricsWindow = window
      lyricsFullscreen = true
      enteredNativeFullscreen = !window.styleMask.contains(.fullScreen)
      if enteredNativeFullscreen { window.toggleFullScreen(nil) }
    }
  }

  private var topBar: some View {
    HStack(spacing: 4) {
      WindowControls().frame(width: 64, height: 48).padding(.trailing, 8)
      Button {
        if let last = navigation.location.path.popLast() { navigation.location.forwardPath.append(last) }
      } label: {
        LucideIcon("chevron-left")
      }
      .buttonStyle(WebIconButtonStyle()).disabled(navigation.location.path.isEmpty).help("Back").accessibilityLabel(
        "Back")
      Button {
        if let next = navigation.location.forwardPath.popLast() { navigation.location.path.append(next) }
      } label: {
        LucideIcon("chevron-right")
      }
      .buttonStyle(WebIconButtonStyle()).disabled(navigation.location.forwardPath.isEmpty).help("Forward")
      .accessibilityLabel("Forward")
      Button {
        navigate(.library)
      } label: {
        LucideIcon("library-big")
      }
      .buttonStyle(WebIconButtonStyle()).help("Library").accessibilityLabel("Library")
      .foregroundStyle(section == .library ? AppTheme.accent : .primary)
      Button {
        navigate(.browse)
      } label: {
        LucideIcon("house")
      }
      .buttonStyle(WebIconButtonStyle()).help("Browse").accessibilityLabel("Browse")
      .foregroundStyle(section == .browse ? AppTheme.accent : .primary)
      HStack(spacing: 8) {
        LucideIcon("search", size: 18).foregroundStyle(.secondary)
        TextField("Search songs, artists, albums", text: $searchText)
          .textFieldStyle(.plain).focused($searchFocused)
          .onSubmit { navigate(.search) }.accessibilityLabel("Search songs, artists, albums")
        if !searchText.isEmpty {
          Button {
            searchText = ""
            searchFocused = true
          } label: {
            LucideIcon("x", size: 14)
          }
          .buttonStyle(.plain).stableCursor(.link).foregroundStyle(.secondary).help("Clear search").accessibilityLabel(
            "Clear search")
        }
      }
      .padding(.horizontal, 14).frame(height: 38).frame(maxWidth: 576)
      .background(AppTheme.card, in: Capsule())
      .overlay {
        Capsule().strokeBorder(
          searchFocused ? AppTheme.accent.opacity(0.6) : Color.primary.opacity(0.1))
      }
      .padding(.horizontal, 8)
      Spacer(minLength: 0)
      UpdateIndicator()
      if !room.participants.isEmpty {
        HStack(spacing: -5) {
          ForEach(Array(room.participants.prefix(4))) { person in
            Button {
              activeSheet = person.id == room.userId ? .join : .invite
            } label: {
              UserAvatar(avatar: person.avatar, name: person.name)
                .overlay { Circle().stroke(AppTheme.card, lineWidth: 2) }
            }.buttonStyle(.plain).stableCursor(.link).help(person.name)
          }
        }
        .padding(.trailing, 6)
      }
      AppMenu {
        AppMenuItem(title: room.isInJam ? "Room" : "Invite Friends", icon: "user-plus") {
          activeSheet = .invite
        }
        if model.auth.isEnabled {
          AppMenuItem(
            title: model.auth.session == nil ? "Sign In" : "Account", icon: "user-round"
          ) { model.auth.openAccount() }
        }
        AppMenuItem(title: "Open TV Display", icon: "tv") { openWindow(id: "tv") }
        AppMenuItem(title: "Settings…", icon: "settings") { navigate(.settings) }
        if room.isInJam {
          AppMenuDivider()
          AppMenuItem(title: "Leave Room", icon: "log-out", destructive: true) { room.leaveJam() }
        }
      }
    }
    .frame(height: 48)
    .background(HeaderDragRegion())
  }

  private func kept<Content: View>(_ screen: AppSection, @ViewBuilder _ content: () -> Content) -> some View {
    content()
      .opacity(section == screen ? 1 : 0)
      .allowsHitTesting(section == screen)
      .accessibilityHidden(section != screen)
  }

  private func openRequestedSection() {
    guard let requested = model.requestedSection else { return }
    model.requestedSection = nil
    navigate(requested)
  }

  private func navigate(_ destination: AppSection) {
    navigation.navigate(destination)
    searchFocused = destination == .search
  }
}

struct ConnectionBadge: View {
  @Environment(AppModel.self) private var model

  var body: some View {
    HStack(spacing: 6) {
      Circle().fill(color).frame(width: 8, height: 8)
      Text(label).font(.caption).foregroundStyle(.secondary).lineLimit(1)
      Spacer()
      Button {
        Task { await model.checkConnection() }
      } label: {
        LucideIcon("arrow.clockwise")
      }
      .buttonStyle(.plain).stableCursor(.link).help("Check the server again")
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var color: Color {
    switch model.connection {
    case .online: .green
    case .offline: .red
    default: .orange
    }
  }

  private var label: String {
    switch model.connection {
    case .unknown, .checking: tr("Connecting…")
    case .online: tr("Connected")
    case .offline: tr("Offline")
    }
  }
}
