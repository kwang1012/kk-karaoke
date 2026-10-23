import Foundation
import Observation
import Security

struct HostAuthConfiguration: Sendable {
  var url: URL
  var publicKey: String

  static func bundled() -> Self? {
    guard let file = Bundle.main.url(forResource: "HostAuth", withExtension: "plist"),
      let data = try? Data(contentsOf: file),
      let values = try? PropertyListSerialization.propertyList(from: data, format: nil)
        as? [String: String],
      let address = values["url"], let url = URL(string: address),
      let key = values["publicKey"], !key.isEmpty,
      url.scheme == "https"
        || (url.scheme == "http" && ["localhost", "127.0.0.1"].contains(url.host ?? ""))
    else { return nil }
    // A native client, like a browser, may carry a publishable/anon key only.
    let pieces = key.split(separator: ".")
    let legacyAnon: Bool
    if pieces.count == 3 {
      var base64 = String(pieces[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(
        of: "_", with: "/")
      base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
      let payload = Data(base64Encoded: base64).flatMap {
        try? JSONSerialization.jsonObject(with: $0) as? [String: Any]
      }
      legacyAnon = payload?["role"] as? String == "anon"
    } else {
      legacyAnon = false
    }
    guard key.hasPrefix("sb_publishable_") || legacyAnon else { return nil }
    return Self(url: url, publicKey: key)
  }
}

struct HostSession: Codable, Sendable {
  var accessToken: String
  var refreshToken: String
  var expiresAt: TimeInterval
  var user: HostUser
}

struct HostUser: Codable, Sendable {
  var id: String
  var email: String?
}

@MainActor protocol HostSessionStore {
  func load(account: String) throws -> HostSession?
  func save(_ session: HostSession, account: String) throws
  func clear(account: String)
}

/// Reading the Keychain can raise a password prompt (an item left by a differently signed build), so it is only
/// read once this app has saved a sign-in: most people never sign in as a host and never touch it.
struct KeychainHostSessionStore: HostSessionStore {
  private let service = (Bundle.main.bundleIdentifier ?? "app.kkaraoke") + ".host-auth"
  private let defaults = UserDefaults.standard
  private func savedKey(_ account: String) -> String { service + ".saved." + account }
  private func query(_ account: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }
  func load(account: String) throws -> HostSession? {
    guard defaults.bool(forKey: savedKey(account)) else { return nil }
    var request = query(account)
    request[kSecReturnData as String] = true
    request[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(request as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data else {
      throw HostAuthError.secureStorage
    }
    return try JSONDecoder().decode(HostSession.self, from: data)
  }
  func save(_ session: HostSession, account: String) throws {
    let data = try JSONEncoder().encode(session)
    let request = query(account)
    let status = SecItemUpdate(
      request as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if status == errSecItemNotFound {
      var item = request
      item[kSecValueData as String] = data
      item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else {
        throw HostAuthError.secureStorage
      }
    } else if status != errSecSuccess {
      throw HostAuthError.secureStorage
    }
    defaults.set(true, forKey: savedKey(account))
  }
  func clear(account: String) {
    SecItemDelete(query(account) as CFDictionary)
    defaults.removeObject(forKey: savedKey(account))
  }
}

enum HostAuthError: LocalizedError {
  case notConfigured, invalidLogin, secureStorage
  case server(String)
  var errorDescription: String? {
    switch self {
    case .notConfigured: tr("Sign-in is not configured for this build.")
    case .invalidLogin: tr("Wrong email or password. Ask the owner if you need an account.")
    case .secureStorage: tr("Couldn't save sign-in securely in Keychain. Try again.")
    case .server(let message): message
    }
  }
}

@MainActor @Observable final class HostAuth {
  enum Reason { case account, host, addSong }
  private(set) var session: HostSession?
  private(set) var sending = false
  private(set) var error: String?
  var showLogin = false
  private(set) var reason: Reason = .account
  var isEnabled: Bool { configuration != nil }
  var accessToken: String? {
    guard let session, session.expiresAt > Date().timeIntervalSince1970 else { return nil }
    return session.accessToken
  }
  @ObservationIgnored private let configuration: HostAuthConfiguration?
  @ObservationIgnored private let transport: URLSession
  @ObservationIgnored private let store: any HostSessionStore
  @ObservationIgnored private var refreshTask: Task<Void, Never>?
  @ObservationIgnored private var pendingAction: (() -> Void)?
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var restored = false

  init(
    configuration: HostAuthConfiguration? = .bundled(), transport: URLSession = .shared,
    store: any HostSessionStore = KeychainHostSessionStore()
  ) {
    self.configuration = configuration
    self.transport = transport
    self.store = store
  }

  func restore() async {
    guard !restored, session == nil, let configuration else { return }
    restored = true
    session = try? store.load(account: configuration.url.absoluteString)
    guard let session else { return }
    if session.expiresAt < Date().timeIntervalSince1970 + 60 {
      await refresh()
    } else {
      scheduleRefresh()
    }
  }

  func openAccount() {
    reason = .account
    pendingAction = nil
    error = nil
    showLogin = true
  }

  @discardableResult func requireSignIn(_ reason: Reason, retry: @escaping () -> Void) -> Bool {
    guard isEnabled, accessToken == nil else { return true }
    self.reason = reason
    pendingAction = retry
    error = nil
    showLogin = true
    return false
  }

  func signIn(email: String, password: String) async {
    guard !sending else { return }
    sending = true
    error = nil
    generation += 1
    let current = generation
    defer { sending = false }
    do {
      let result = try await token(
        grant: "password",
        body: [
          "email": email.trimmingCharacters(in: .whitespacesAndNewlines), "password": password,
        ])
      guard generation == current, let configuration else { return }
      try store.save(result, account: configuration.url.absoluteString)
      session = result
      scheduleRefresh()
      let action = pendingAction
      pendingAction = nil
      showLogin = false
      action?()
    } catch { if generation == current { self.error = error.localizedDescription } }
  }

  func cancelLogin() {
    if sending { generation += 1 }
    showLogin = false
    pendingAction = nil
    error = nil
  }

  func signOut() {
    generation += 1
    let token = session?.accessToken
    refreshTask?.cancel()
    refreshTask = nil
    session = nil
    pendingAction = nil
    error = nil
    guard let configuration else { return }
    store.clear(account: configuration.url.absoluteString)
    if let token {
      var request = URLRequest(url: configuration.url.appendingPathComponent("auth/v1/logout"))
      request.httpMethod = "POST"
      request.setValue(configuration.publicKey, forHTTPHeaderField: "apikey")
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      // Create the request before returning; local sign-out is immediate even offline.
      transport.dataTask(with: request).resume()
    }
  }

  private struct TokenResponse: Decodable {
    var access_token: String
    var refresh_token: String
    var expires_in: Double
    var expires_at: Double?
    var user: HostUser
  }

  private func token(grant: String, body: [String: String]) async throws -> HostSession {
    guard let configuration else { throw HostAuthError.notConfigured }
    var components = URLComponents(
      url: configuration.url.appendingPathComponent("auth/v1/token"), resolvingAgainstBaseURL: false
    )!
    components.queryItems = [URLQueryItem(name: "grant_type", value: grant)]
    var request = URLRequest(url: components.url!, timeoutInterval: 25)
    request.httpMethod = "POST"
    request.setValue(configuration.publicKey, forHTTPHeaderField: "apikey")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(body)
    let (data, response) = try await transport.data(for: request)
    guard let response = response as? HTTPURLResponse else {
      throw HostAuthError.server(tr("Sign-in couldn't reach the server. Try again."))
    }
    guard (200..<300).contains(response.statusCode) else {
      let fields = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
      let code = fields?["error_code"] as? String
      if code == "invalid_credentials" || response.statusCode == 401 {
        throw HostAuthError.invalidLogin
      }
      if grant == "refresh_token", [400, 403].contains(response.statusCode) {
        throw HostAuthError.invalidLogin
      }
      // Don't display or log arbitrary auth response bodies, which may carry credentials.
      throw HostAuthError.server(
        response.statusCode == 429
          ? tr("Too many attempts. Try again in a moment.")
          : tr("Couldn't sign in. Try again, or ask the owner for help."))
    }
    let value = try JSONDecoder().decode(TokenResponse.self, from: data)
    return HostSession(
      accessToken: value.access_token, refreshToken: value.refresh_token,
      expiresAt: value.expires_at ?? Date().timeIntervalSince1970 + value.expires_in,
      user: value.user)
  }

  private func refresh() async {
    guard let previous = session else { return }
    let current = generation
    do {
      let result = try await token(
        grant: "refresh_token", body: ["refresh_token": previous.refreshToken])
      guard current == generation, let configuration else { return }
      try store.save(result, account: configuration.url.absoluteString)
      session = result
      scheduleRefresh()
    } catch HostAuthError.invalidLogin { signOut() } catch {
      if current == generation { scheduleRefresh(retryAfter: 30) }
    }
  }

  private func scheduleRefresh(retryAfter: Double? = nil) {
    refreshTask?.cancel()
    guard let session else { return }
    let delay = retryAfter ?? max(1, session.expiresAt - Date().timeIntervalSince1970 - 60)
    refreshTask = Task { [weak self] in
      do { try await Task.sleep(for: .seconds(delay)) } catch { return }
      guard !Task.isCancelled else { return }
      await self?.refresh()
    }
  }
}
