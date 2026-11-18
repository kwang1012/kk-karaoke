import AppKit
import CryptoKit
import Foundation
import Observation
import Security

/// The proof-key pair of the sign-in (RFC 7636): no client secret is involved, so the app can hold nothing secret.
enum SpotifyPKCE {
  static func verifier() -> String {
    var bytes = [UInt8](repeating: 0, count: 48)
    _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    return base64url(Data(bytes))
  }

  static func challenge(for verifier: String) -> String {
    base64url(Data(SHA256.hash(data: Data(verifier.utf8))))
  }

  static func base64url(_ data: Data) -> String {
    data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}

struct SpotifyTokens: Codable, Equatable {
  var access: String
  var refresh: String
  var expires: Date
}

enum SpotifyWebError: LocalizedError {
  case notConnected, refused(Int), failed(String)
  var errorDescription: String? {
    switch self {
    case .notConnected: tr("Spotify is not connected.")
    case .refused(let code) where code == 403: tr("Spotify did not allow that. Reading the queue needs a Premium account.")
    case .refused(let code): tr("Spotify refused the request (\(code)).")
    case .failed(let message): message
    }
  }
}

/// Where the sign-in is kept: the Keychain, read only once something was saved there (as `KeychainHostSessionStore`).
struct SpotifyTokenStore {
  private let service = (Bundle.main.bundleIdentifier ?? "app.kkaraoke") + ".spotify"
  private let savedKey = "spotifyTokensSaved"
  private var query: [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "tokens"]
  }

  func load() -> SpotifyTokens? {
    guard UserDefaults.standard.bool(forKey: savedKey) else { return nil }
    var request = query
    request[kSecReturnData as String] = true
    request[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
    return try? JSONDecoder().decode(SpotifyTokens.self, from: data)
  }

  func save(_ tokens: SpotifyTokens) {
    guard let data = try? JSONEncoder().encode(tokens) else { return }
    if SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary) == errSecItemNotFound {
      var item = query
      item[kSecValueData as String] = data
      item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      SecItemAdd(item as CFDictionary, nil)
    }
    UserDefaults.standard.set(true, forKey: savedKey)
  }

  func clear() {
    SecItemDelete(query as CFDictionary)
    UserDefaults.standard.removeObject(forKey: savedKey)
  }
}

/// Signs in to Spotify's Web API (authorization code with PKCE, the same public app the web app uses) and reads what
/// is queued after the song playing. The browser sends the person back with a `kkaraoke://spotify` link.
@MainActor
@Observable
final class SpotifyWebAuth {
  static let clientID = "dfce0d5218bd4af4afe37c13802e4a91"
  static let redirectURI = "kkaraoke://spotify"
  static let scopes = "user-read-playback-state user-read-currently-playing"

  private(set) var isConnected: Bool
  private(set) var message: String?
  private(set) var isConnecting = false

  @ObservationIgnored private var tokens: SpotifyTokens?
  @ObservationIgnored private let store = SpotifyTokenStore()
  @ObservationIgnored private let session: URLSession
  @ObservationIgnored private var pending: (verifier: String, state: String)?

  init(session: URLSession = .shared) {
    self.session = session
    tokens = store.load()
    isConnected = tokens != nil
  }

  // MARK: Signing in

  /// The page the browser opens: Spotify asks the person to allow it, then sends them back to `redirectURI`.
  func authorizationURL(verifier: String, state: String) -> URL? {
    var components = URLComponents(string: "https://accounts.spotify.com/authorize")
    components?.queryItems = [
      URLQueryItem(name: "client_id", value: Self.clientID), URLQueryItem(name: "response_type", value: "code"),
      URLQueryItem(name: "redirect_uri", value: Self.redirectURI), URLQueryItem(name: "scope", value: Self.scopes),
      URLQueryItem(name: "code_challenge_method", value: "S256"),
      URLQueryItem(name: "code_challenge", value: SpotifyPKCE.challenge(for: verifier)), URLQueryItem(name: "state", value: state),
    ]
    return components?.url
  }

  func connect() {
    let verifier = SpotifyPKCE.verifier(), state = SpotifyPKCE.verifier()
    guard let url = authorizationURL(verifier: verifier, state: state) else { return }
    pending = (verifier, state)
    message = nil
    isConnecting = true
    NSWorkspace.shared.open(url)
  }

  /// The link Spotify sent the browser back to. True when it was for this.
  @discardableResult
  func handle(_ url: URL) -> Bool {
    guard url.scheme == "kkaraoke", url.host == "spotify" else { return false }
    let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    func value(_ name: String) -> String? { items.first { $0.name == name }?.value }
    guard let pending, value("state") == pending.state else { return true } // not the sign-in this app started
    self.pending = nil
    guard let code = value("code") else {
      isConnecting = false
      message = value("error") == "access_denied" ? tr("Spotify was not allowed.") : tr("Spotify sign-in did not finish.")
      return true
    }
    Task {
      do {
        tokens = try await tokenRequest(["grant_type": "authorization_code", "code": code, "redirect_uri": Self.redirectURI,
                                         "code_verifier": pending.verifier])
        store.save(tokens!)
        isConnected = true
        message = nil
      } catch { message = error.localizedDescription }
      isConnecting = false
    }
    return true
  }

  func disconnect() {
    tokens = nil
    store.clear()
    isConnected = false
    message = nil
  }

  // MARK: Tokens

  private func tokenRequest(_ body: [String: String]) async throws -> SpotifyTokens {
    struct Response: Decodable { var access_token: String; var refresh_token: String?; var expires_in: Double }
    var request = URLRequest(url: URL(string: "https://accounts.spotify.com/api/token")!, timeoutInterval: 20)
    request.httpMethod = "POST"
    request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    var form = URLComponents()
    form.queryItems = (["client_id": Self.clientID].merging(body) { $1 }).map { URLQueryItem(name: $0.key, value: $0.value) }
    request.httpBody = form.percentEncodedQuery?.data(using: .utf8)
    let (data, response) = try await session.data(for: request)
    guard (response as? HTTPURLResponse)?.statusCode == 200, let parsed = try? JSONDecoder().decode(Response.self, from: data) else {
      throw SpotifyWebError.failed(tr("Spotify sign-in failed."))
    }
    // a refresh does not always send a new refresh token: keep the one there is
    return SpotifyTokens(access: parsed.access_token, refresh: parsed.refresh_token ?? tokens?.refresh ?? "",
                         expires: Date().addingTimeInterval(parsed.expires_in))
  }

  private func accessToken(forceRefresh: Bool = false) async throws -> String {
    guard let current = tokens else { throw SpotifyWebError.notConnected }
    if !forceRefresh, current.expires.timeIntervalSinceNow > 60 { return current.access }
    do {
      let fresh = try await tokenRequest(["grant_type": "refresh_token", "refresh_token": current.refresh])
      tokens = fresh
      store.save(fresh)
      return fresh.access
    } catch {
      disconnect() // the permission was taken back, or the sign-in expired: ask again
      message = tr("Spotify needs to be connected again.")
      throw SpotifyWebError.notConnected
    }
  }

  // MARK: Reading

  /// The songs Spotify will play after the current one, in order.
  func upcoming() async throws -> [SpotifyQueued] {
    func fetch(_ token: String) async throws -> (Data, Int) {
      var request = URLRequest(url: URL(string: "https://api.spotify.com/v1/me/player/queue")!, timeoutInterval: 15)
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      let (data, response) = try await session.data(for: request)
      return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    }
    var (data, status) = try await fetch(try await accessToken())
    if status == 401 { (data, status) = try await fetch(try await accessToken(forceRefresh: true)) }
    guard status == 200 else { throw SpotifyWebError.refused(status) }
    return Self.parseQueue(data)
  }

  nonisolated static func parseQueue(_ data: Data) -> [SpotifyQueued] {
    struct Artist: Decodable { var name: String }
    struct Image: Decodable { var url: String; var width: Int? }
    struct Album: Decodable { var name: String?; var images: [Image]? }
    struct Item: Decodable { var uri: String?; var name: String?; var duration_ms: Double?; var track_number: Int?; var type: String?; var artists: [Artist]?; var album: Album? }
    struct Queue: Decodable { var queue: [Item] }
    guard let parsed = try? JSONDecoder().decode(Queue.self, from: data) else { return [] }
    return parsed.queue.compactMap { item in
      guard item.type == nil || item.type == "track", // podcasts have no karaoke version
        let track = SpotifyTrack(id: item.uri, name: item.name, artist: item.artists?.map(\.name).joined(separator: ", "),
                                  duration: item.duration_ms.map { $0 / 1000 }, album: item.album?.name, trackNumber: item.track_number)
      else { return nil }
      // a small cover is plenty for a list row
      let images = item.album?.images ?? []
      let cover = images.first { ($0.width ?? 0) <= 300 } ?? images.first
      return SpotifyQueued(track: track, artwork: cover.flatMap { URL(string: $0.url) })
    }
  }
}

/// A song in Spotify's queue, with its cover.
struct SpotifyQueued: Equatable, Sendable {
  var track: SpotifyTrack
  var artwork: URL?
}
