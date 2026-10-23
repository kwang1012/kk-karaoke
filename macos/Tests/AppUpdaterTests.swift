import Foundation
import Testing
@testable import KKaraoke

@MainActor
struct AppUpdaterTests {
  private var key: String { Data(repeating: 7, count: 32).base64EncodedString() }

  @Test func requiresHTTPSAndPublicKey() {
    #expect(!AppUpdater.isConfigured([:]))
    #expect(!AppUpdater.isConfigured(["SUFeedURL": "http://updates.example.com/appcast.xml", "SUPublicEDKey": key]))
    #expect(!AppUpdater.isConfigured(["SUFeedURL": "https://updates.example.com/appcast.xml", "SUPublicEDKey": "invalid"]))
    #expect(!AppUpdater.isConfigured(["SUFeedURL": "https://user:pass@updates.example.com/appcast.xml", "SUPublicEDKey": key]))
    #expect(AppUpdater.isConfigured(["SUFeedURL": "https://updates.example.com/appcast.xml", "SUPublicEDKey": key]))
  }

  @Test func developmentBuildDoesNotStartUpdater() {
    let updater = AppUpdater(info: [:])
    #expect(!updater.canCheckForUpdates)
    #expect(updater.configurationMessage != nil)
  }

  @Test func bundledInstallerConfigurationHasBooleanTypes() {
    #expect(Bundle.main.object(forInfoDictionaryKey: "SUEnableInstallerLauncherService") as? Bool == true)
    #expect(Bundle.main.object(forInfoDictionaryKey: "SUAllowsAutomaticUpdates") as? Bool == false)
  }

  @Test func checksAutomaticallyWithoutAskingTheUser() {
    #expect(Bundle.main.object(forInfoDictionaryKey: "SUEnableAutomaticChecks") as? Bool == true)
    #expect((Bundle.main.object(forInfoDictionaryKey: "SUScheduledCheckInterval") as? Int ?? 0) >= 3600)
  }

  @Test func scheduledUpdatesAreLeftToTheIndicator() {
    let updater = AppUpdater(info: [:])
    #expect(updater.supportsGentleScheduledUpdateReminders)
  }

  @Test func resumesInstallationOnceAfterPlaybackStops() {
    let updater = AppUpdater(info: [:])
    var playing = true
    var installs = 0
    updater.isPlaybackActive = { playing }
    #expect(updater.postponeInstallation { installs += 1 })
    #expect(updater.installationPending)
    updater.playbackDidChange()
    #expect(installs == 0)
    playing = false
    updater.playbackDidChange()
    updater.playbackDidChange()
    #expect(installs == 1)
    #expect(!updater.installationPending)
  }

  @Test func idlePlaybackDoesNotPostponeInstallation() {
    let updater = AppUpdater(info: [:])
    #expect(!updater.postponeInstallation {})
    #expect(!updater.installationPending)
  }
}
