import Foundation
import Testing
@testable import KKaraoke

@MainActor
struct ProductionBackendTests {
    @Test func theAppAlwaysTalksToProduction() {
        let model = AppModel()
        #expect(model.client?.baseURL.absoluteString == "https://api.kkaraoke.app/api")
        #expect(model.serverText == "https://api.kkaraoke.app/api")
        #expect(model.client?.socketURL?.absoluteString == "wss://api.kkaraoke.app/api/ws")
    }

    @Test func anAddressSavedByAnEarlierBuildIsForgotten() {
        let saved = UserDefaults.standard.object(forKey: "serverURL")
        defer { UserDefaults.standard.set(saved, forKey: "serverURL") }
        UserDefaults.standard.set("http://localhost:8000", forKey: "serverURL")
        let model = AppModel()
        #expect(UserDefaults.standard.string(forKey: "serverURL") == nil)
        #expect(model.client?.baseURL == AppModel.productionAPI)
    }

    @Test func invitesPointAtTheWebApp() {
        let room = RoomModel(defaults: UserDefaults(suiteName: "test.prod.\(UUID().uuidString)")!)
        #expect(room.joinLink(room: "abc-123")?.absoluteString == "https://kkaraoke.app/join?room=abc-123")
    }
}
