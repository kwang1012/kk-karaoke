import Foundation
import Observation

/// App-wide state: where the server is, and the lists every screen shares.
@MainActor
@Observable
final class AppModel {
  /// The app always talks to the production backend: there is no setting for it. (This is the API root the web app uses too:
  /// its `VITE_API_ADDR` of `api.kkaraoke.app`, plus `/api`.)
  static let productionAPI = URL(string: "https://api.kkaraoke.app/api")!
  /// Where people open the web app: what a room's invite link and QR code point at.
  static let webApp = URL(string: "https://kkaraoke.app")!

  /// The server's address, as text. Constant, and kept so screens can reload when it would change.
  let serverText = AppModel.productionAPI.absoluteString

  let auth = HostAuth()

  var client: APIClient? { APIClient(baseURL: Self.productionAPI, token: auth.accessToken) }

  enum Connection: Equatable {
    case unknown, checking, online
    case offline(String)
  }
  var connection: Connection = .unknown
  /// A screen another window asked the main one to show, e.g. Settings from the menu bar.
  var requestedSection: AppSection?

  init() {
    // earlier builds let people type an address: forget whatever they saved
    UserDefaults.standard.removeObject(forKey: "serverURL")
  }

  func checkConnection() async {
    guard let client else {
      connection = .offline(tr("The server address is not valid."))
      return
    }
    connection = .checking
    do {
      _ = try await client.health()
      connection = .online
    } catch {
      connection = .offline(error.localizedDescription)
    }
  }
}
