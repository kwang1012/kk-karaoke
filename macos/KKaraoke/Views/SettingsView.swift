import SwiftUI

/// Settings as a page in the main window, laid out like the other screens.
struct SettingsView: View {
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        PageHeading(title: "Settings", subtitle: "Audio, singing, downloads and updates.")
        VStack(alignment: .leading, spacing: 28) {
          GeneralSettings()
          AudioSettings()
          SingingSettings()
          DownloadSettings()
          UpdateSettings()
        }
        .padding(.horizontal, 32).padding(.bottom, 40)
      }
      .frame(maxWidth: 760, alignment: .leading)
      .frame(maxWidth: .infinity)
    }
    .thinScrollbars()
  }
}

private struct SettingsSection<Content: View>: View {
  var title: LocalizedStringKey
  @ViewBuilder var content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(title).font(.system(size: 18, weight: .semibold))
      VStack(alignment: .leading, spacing: 0) { content }
        .padding(.horizontal, 16)
        .background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(.primary.opacity(0.08)) }
    }
  }
}

private struct SettingsRow<Control: View>: View {
  var title: LocalizedStringKey
  var detail: LocalizedStringKey?
  @ViewBuilder var control: Control

  var body: some View {
    HStack(spacing: 16) {
      VStack(alignment: .leading, spacing: 3) {
        Text(title).font(.system(size: 14))
        if let detail {
          Text(detail).font(.system(size: 12)).foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      Spacer(minLength: 12)
      control
    }
    .padding(.vertical, 12).frame(minHeight: 52)
    .overlay(alignment: .bottom) { Divider().opacity(0.6) }
  }
}

private struct SwitchRow: View {
  var title: LocalizedStringKey
  var detail: LocalizedStringKey?
  @Binding var isOn: Bool

  var body: some View {
    SettingsRow(title: title, detail: detail) {
      Toggle(isOn: $isOn) { EmptyView() }.toggleStyle(AppSwitchStyle()).accessibilityLabel(title)
    }
  }
}

private struct GeneralSettings: View {
  @AppStorage("showMenuBar") private var showMenuBar = true
  var body: some View {
    SettingsSection(title: "General") {
      SettingsRow(title: "Server", detail: LocalizedStringKey(AppModel.webApp.host() ?? "kkaraoke.app")) {
        ConnectionBadge().fixedSize()
      }
      SwitchRow(title: "Show KKaraoke in the menu bar", detail: nil, isOn: $showMenuBar)
      LanguageRow()
    }
  }
}

private struct AudioSettings: View {
  @Environment(SingingModel.self) private var singing

  var body: some View {
    @Bindable var singing = singing
    SettingsSection(title: "Audio devices") {
      SettingsRow(title: "Microphone", detail: nil) {
        DeviceSelect(
          label: "Microphone", devices: singing.inputs, uid: $singing.inputUID, width: 240)
      }
      SettingsRow(title: "Speakers", detail: nil) {
        DeviceSelect(
          label: "Speakers", devices: singing.outputs, uid: $singing.outputUID, width: 240)
      }
      SettingsRow(title: "Devices", detail: "Plugged something in and it is missing?") {
        HStack(spacing: 8) {
          if singing.refreshingDevices { ProgressView().controlSize(.small) }
          Button("Refresh") { singing.refreshDevices() }
            .buttonStyle(.secondary).disabled(singing.refreshingDevices)
        }
      }
    }
  }
}

private struct SingingSettings: View {
  @Environment(SingingModel.self) private var singing
  @AppStorage("floatingLyricsOnMinimize") private var floatLyrics = true
  @AppStorage("showNotchLyrics") private var notchLyrics = false

  var body: some View {
    @Bindable var singing = singing
    SettingsSection(title: "Singing") {
      SwitchRow(title: "Show melody", detail: nil, isOn: $singing.showMelody)
      SwitchRow(
        title: "Float the lyrics when the window is minimized", detail: nil, isOn: $floatLyrics)
      SwitchRow(title: "Show lyrics in the notch", detail: nil, isOn: $notchLyrics)
    }
  }
}

private struct DownloadSettings: View {
  @Environment(OfflineLibrary.self) private var offline

  var body: some View {
    SettingsSection(title: "Downloads") {
      SettingsRow(
        title: "Downloaded songs",
        detail:
          "They keep working with no server. Other songs you play are kept for a while, up to \(StemCache.defaultLimit) of them."
      ) {
        Text("\(offline.songs.count)").foregroundStyle(.secondary)
      }
      SettingsRow(title: "Space used", detail: nil) {
        Text(ByteCountFormatter.string(fromByteCount: offline.storageBytes, countStyle: .file))
          .foregroundStyle(.secondary)
      }
      SettingsRow(title: "Clear played songs", detail: "Downloads stay.") {
        Button("Clear") { Task { await offline.clearCache() } }.buttonStyle(.secondary)
      }
      SettingsRow(title: "Remove all downloads", detail: nil) {
        Button("Remove") { Task { await offline.removeEverything() } }
          .buttonStyle(.danger).disabled(offline.songs.isEmpty)
      }
    }
  }
}

private struct UpdateSettings: View {
  @EnvironmentObject private var updater: AppUpdater

  private var checkDetail: LocalizedStringKey? {
    if updater.installationPending { return "The update will install when playback stops." }
    guard let version = updater.availableVersion else { return nil }
    return "Version \(version) is available."
  }

  var body: some View {
    SettingsSection(title: "Updates") {
      if let message = updater.configurationMessage {
        SettingsRow(title: "Software updates", detail: LocalizedStringKey(message)) { EmptyView() }
      } else {
        SwitchRow(
          title: "Automatically check for updates", detail: checkDetail,
          isOn: $updater.automaticallyChecksForUpdates)
      }
    }
  }
}

/// The app's language. macOS reads it at launch, so a change takes effect after a restart.
private struct LanguageRow: View {
  private static let key = "AppleLanguages"
  private static func current() -> String {
    guard let first = UserDefaults.standard.stringArray(forKey: key)?.first else { return "" }
    if first.hasPrefix("zh-Hant") || first.hasPrefix("zh-TW") || first.hasPrefix("zh-HK") { return "zh-Hant" }
    if first.hasPrefix("zh") { return "zh-Hans" }
    return first.hasPrefix("en") ? "en" : ""
  }

  @State private var choice = LanguageRow.current()
  /// What the app started with: the running language only changes on a relaunch.
  private let launched = LanguageRow.current()

  var body: some View {
    SettingsRow(
      title: "Language", detail: choice == launched ? nil : "Restart KKaraoke to change the language."
    ) {
      HStack(spacing: 10) {
        if choice != launched {
          Button("Restart") { Self.relaunch() }.buttonStyle(.secondary)
        }
        AppSelect(
          label: "Language",
          selection: Binding(get: { choice }, set: { apply($0) }),
          options: [
            SelectOption(value: "", title: "System Default"),
            SelectOption(value: "en", title: "language.english"),
            SelectOption(value: "zh-Hant", title: "language.zhHant"),
            SelectOption(value: "zh-Hans", title: "language.zhHans"),
          ], width: 180)
      }
    }
  }

  private func apply(_ code: String) {
    choice = code
    if code.isEmpty {
      UserDefaults.standard.removeObject(forKey: Self.key)
    } else {
      UserDefaults.standard.set([code], forKey: Self.key)
    }
  }

  private static func relaunch() {
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.createsNewApplicationInstance = true
    NSWorkspace.shared.openApplication(at: Bundle.main.bundleURL, configuration: configuration) { _, _ in
      DispatchQueue.main.async { NSApp.terminate(nil) }
    }
  }
}
