import Combine
import Sparkle
import SwiftUI

/// Owns Sparkle for the lifetime of the app. Unconfigured development builds never check a feed.
@MainActor
final class AppUpdater: NSObject, ObservableObject, SPUUpdaterDelegate, SPUStandardUserDriverDelegate {
  @Published private(set) var canCheckForUpdates = false
  @Published private(set) var installationPending = false
  /// The version a check found and nobody has installed yet.
  @Published private(set) var availableVersion: String?
  @Published private(set) var configurationMessage: String?
  @Published var automaticallyChecksForUpdates = false {
    didSet {
      guard oldValue != automaticallyChecksForUpdates else { return }
      controller?.updater.automaticallyChecksForUpdates = automaticallyChecksForUpdates
    }
  }
  var isPlaybackActive: () -> Bool = { false }
  private var controller: SPUStandardUpdaterController?
  private var installHandler: (() -> Void)?

  init(info: [String: Any] = Bundle.main.infoDictionary ?? [:]) {
    super.init()
    guard Self.isConfigured(info) else {
      configurationMessage = tr("Updates are not configured for this build.")
      return
    }
    let controller = SPUStandardUpdaterController(
      startingUpdater: false, updaterDelegate: self, userDriverDelegate: self)
    self.controller = controller
    controller.updater.publisher(for: \.canCheckForUpdates).assign(to: &$canCheckForUpdates)
    controller.updater.publisher(for: \.automaticallyChecksForUpdates)
      .removeDuplicates().assign(to: &$automaticallyChecksForUpdates)
    controller.startUpdater()
    // Look right away so the indicator is accurate at launch, not only after the next scheduled check.
    if controller.updater.automaticallyChecksForUpdates {
      controller.updater.checkForUpdatesInBackground()
    }
  }

  static func isConfigured(_ info: [String: Any]) -> Bool {
    guard let feed = info["SUFeedURL"] as? String,
      let url = URL(string: feed), url.scheme == "https", let host = url.host, !host.isEmpty,
      url.user == nil, url.password == nil,
      let key = info["SUPublicEDKey"] as? String,
      let bytes = Data(base64Encoded: key), bytes.count == 32
    else { return false }
    return true
  }

  func checkForUpdates() { controller?.checkForUpdates(nil) }

  /// Re-check at the time installation is requested: playback may have started during download.
  func postponeInstallation(_ handler: @escaping () -> Void) -> Bool {
    guard isPlaybackActive() else { return false }
    installHandler = handler
    installationPending = true
    return true
  }

  func playbackDidChange() {
    guard !isPlaybackActive(), let handler = installHandler else { return }
    installHandler = nil
    installationPending = false
    handler()
  }

  func updater(_ updater: SPUUpdater, didFindValidUpdate item: SUAppcastItem) {
    availableVersion = item.displayVersionString
  }

  func updaterDidNotFindUpdate(_ updater: SPUUpdater) { availableVersion = nil }

  func updater(
    _ updater: SPUUpdater, userDidMake choice: SPUUserUpdateChoice, forUpdate item: SUAppcastItem,
    state: SPUUserUpdateState
  ) {
    if choice == .skip { availableVersion = nil }
  }

  // Scheduled finds are shown by `UpdateIndicator` in the main window, not as a modal over playback.
  nonisolated var supportsGentleScheduledUpdateReminders: Bool { true }

  nonisolated func standardUserDriverShouldHandleShowingScheduledUpdate(
    _ update: SUAppcastItem, andInImmediateFocus immediateFocus: Bool
  ) -> Bool { false }

  func updater(
    _ updater: SPUUpdater, shouldPostponeRelaunchForUpdate item: SUAppcastItem,
    untilInvokingBlock installHandler: @escaping () -> Void
  ) -> Bool {
    postponeInstallation(installHandler)
  }
}

struct CheckForUpdatesButton: View {
  @ObservedObject var updater: AppUpdater

  var body: some View {
    Button("Check for Updates…") { updater.checkForUpdates() }
      .buttonStyle(.secondary)
      .disabled(!updater.canCheckForUpdates)
  }
}
