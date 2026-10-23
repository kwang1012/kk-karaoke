import CoreSpotlight
import SwiftUI

@main
struct KKaraokeApp: App {
  @NSApplicationDelegateAdaptor private var delegate: AppDelegate
  @StateObject private var updater = AppUpdater()
  @State private var model = AppModel()
  @State private var player = PlayerModel()
  @State private var singing = SingingModel()
  @State private var room = RoomModel()
  @State private var offline = OfflineLibrary()
  @State private var cast = CastDiscovery()
  @State private var ready = ReadyStore()
  @State private var media = NowPlayingBridge()
  @AppStorage("showMenuBar") private var showMenuBar = true
  @AppStorage("showNotchLyrics") private var showNotchLyrics = false
  @State private var notch: NotchPanelController?
  @State private var widget = WidgetBridge()

  var body: some Scene {
    WindowGroup(id: "main") {
      RootView()
        .environment(model)
        .environment(player)
        .environment(singing)
        .environment(room)
        .environment(offline)
        .environment(cast)
        .environment(ready)
        .environmentObject(updater)
        .frame(minWidth: 1100, minHeight: 600)
        .modifier(FloatingLyricsOnMinimize())
        .task {
          updater.isPlaybackActive = {
            if case .loading = player.status { return true }
            return player.isPlaying
          }
          room.auth = model.auth
          singing.attach(player) { model.client }
          singing.room = room
          room.attach(player: player, singing: singing) { model.client }
          media.start(player: player)
          let bridge = AppBridge.shared
          (bridge.player, bridge.room, bridge.offline, bridge.model) = (player, room, offline, model)
          room.onProcessing = { AppNotifier.prepare() }
          room.onSongReady = {
            ready.add($0.id)
            AppNotifier.songReady($0)
          }
          notch = NotchPanelController(player: player)
          notch?.update(visible: showNotchLyrics && player.track != nil)
          await model.auth.restore()
          await model.checkConnection()
          if model.connection == .online { room.connect() }
        }
        // without the server the queue is kept here; with it back, pinned songs catch up
        .onChange(of: player.track?.id) { _, _ in widget.update(player: player, room: room) }
        .onChange(of: player.isPlaying) { _, _ in widget.update(player: player, room: room) }
        .onChange(of: room.queue) { _, _ in widget.update(player: player, room: room) }
        .onChange(of: room.queueIdx) { _, _ in widget.update(player: player, room: room) }
        .onChange(of: room.processingCount) { _, count in AppNotifier.badge(count) }
        .onChange(of: offline.tracks) { _, tracks in SpotlightIndex.index(tracks) }
        .onContinueUserActivity(CSSearchableItemActionType) { activity in
          guard let id = SpotlightIndex.trackID(from: activity) else { return }
          Task { if let track = await AppBridge.shared.track(id: id) { room.playNow(track) } }
        }
        .onChange(of: showNotchLyrics) { _, _ in notch?.update(visible: showNotchLyrics && player.track != nil) }
        .onChange(of: player.track?.id) { _, _ in notch?.update(visible: showNotchLyrics && player.track != nil) }
        .onChange(of: player.isPlaying) { _, _ in updater.playbackDidChange() }
        .onChange(of: player.status) { _, _ in updater.playbackDidChange() }
        .onChange(of: model.connection) { _, state in
          switch state {
          case .online:
            room.setServerReachable(true)
            offline.refresh(using: model.client)
            Task { await ready.refresh(using: model.client) }
          case .offline: room.setServerReachable(false)
          default: break
          }
        }
    }
    .defaultSize(width: 1280, height: 820)
    .windowStyle(.hiddenTitleBar)
    .windowToolbarStyle(.unified)
    .commands {
      TVCommands()
      SettingsCommands(model: model)
      CommandGroup(after: .appInfo) { CheckForUpdatesButton(updater: updater) }
    }

    Window("TV Display", id: "tv") {
      TVView().environment(model).environment(player).environment(singing).environment(room)
        .menuHost().thinScrollbars()
    }
    .defaultSize(width: 1280, height: 720)

    Window("Lyrics", id: MiniLyrics.windowID) {
      MiniLyricsView().environment(player).menuHost()
    }
    .defaultSize(width: 460, height: 200)
    .windowStyle(.hiddenTitleBar)
    .windowLevel(.floating)
    .windowBackgroundDragBehavior(.enabled)
    .windowResizability(.contentMinSize)

    MenuBarExtra(isInserted: $showMenuBar) {
      MenuBarContent().environment(model).environment(player).environment(room).environment(singing)
    } label: {
      Image("MenuBarIcon").renderingMode(.original).accessibilityLabel("KKaraoke")
    }
    .menuBarExtraStyle(.window)
  }
}

struct TVCommands: Commands {
  @Environment(\.openWindow) private var openWindow

  var body: some Commands {
    CommandGroup(after: .windowArrangement) {
      Button("Open TV Display") { openWindow(id: "tv") }.keyboardShortcut(
        "t", modifiers: [.command, .shift])
    }
  }
}

struct SettingsCommands: Commands {
  @Environment(\.openWindow) private var openWindow
  var model: AppModel

  var body: some Commands {
    CommandGroup(replacing: .appSettings) {
      Button("Settings…") {
        model.requestedSection = .settings
        if let main = WindowFocus.window("main") {
          main.makeKeyAndOrderFront(nil)
        } else {
          openWindow(id: "main")
        }
        NSApp.activate()
      }
      .keyboardShortcut(",")
    }
  }
}
