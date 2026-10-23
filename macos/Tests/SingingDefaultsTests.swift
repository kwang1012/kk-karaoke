import Foundation
import Testing

@testable import KKaraoke

@MainActor struct SingingDefaultsTests {
  @Test func melodyAndMicrophoneStartOff() throws {
    let name = "singing-defaults-\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: name))
    defer { defaults.removePersistentDomain(forName: name) }
    let singing = SingingModel(defaults: defaults)
    #expect(!singing.showMelody)
    #expect(!singing.micOn)
  }

  @Test func explicitlyEnablingMelodyIsRemembered() throws {
    let name = "singing-opt-in-\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: name))
    defer { defaults.removePersistentDomain(forName: name) }
    let singing = SingingModel(defaults: defaults)
    singing.showMelody = true
    #expect(SingingModel(defaults: defaults).showMelody)
    #expect(!SingingModel(defaults: defaults).micOn)
  }
}
