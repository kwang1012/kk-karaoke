import Foundation
import Testing

@testable import KKaraoke

private final class AuthURLProtocol: URLProtocol, @unchecked Sendable {
  nonisolated(unsafe) static var responder: ((URLRequest) throws -> (Int, Data))?
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    do {
      let (status, data) = try Self.responder!(request)
      let response = HTTPURLResponse(
        url: request.url!, statusCode: status, httpVersion: nil,
        headerFields: ["Content-Type": "application/json"])!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch { client?.urlProtocol(self, didFailWithError: error) }
  }
  override func stopLoading() {}
}

@MainActor private final class MemoryHostSessionStore: HostSessionStore {
  var value: HostSession?
  var account: String?
  func load(account: String) throws -> HostSession? { value }
  func save(_ session: HostSession, account: String) throws {
    value = session
    self.account = account
  }
  func clear(account: String) { value = nil }
}

@MainActor @Suite(.serialized) struct HostAuthTests {
  private let configuration = HostAuthConfiguration(
    url: URL(string: "https://auth.example.test")!, publicKey: "sb_publishable_test")
  private func transport() -> URLSession {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [AuthURLProtocol.self]
    return URLSession(configuration: config)
  }
  private func response(access: String = "test-access", refresh: String = "test-refresh") -> Data {
    Data(
      """
      {"access_token":"\(access)","refresh_token":"\(refresh)","expires_in":3600,"user":{"id":"host-1","email":"host@example.test"}}
      """.utf8)
  }
  private static func body(_ request: URLRequest) throws -> [String: String] {
    if let data = request.httpBody {
      return try JSONDecoder().decode([String: String].self, from: data)
    }
    let stream = try #require(request.httpBodyStream)
    stream.open()
    defer { stream.close() }
    var data = Data()
    var buffer = [UInt8](repeating: 0, count: 1024)
    while stream.hasBytesAvailable {
      let count = stream.read(&buffer, maxLength: buffer.count)
      if count <= 0 { break }
      data.append(contentsOf: buffer.prefix(count))
    }
    return try JSONDecoder().decode([String: String].self, from: data)
  }

  @Test func signInUsesWebAuthAndAuthorizesAPIRequests() async throws {
    let transport = transport()
    defer { transport.invalidateAndCancel() }
    let store = MemoryHostSessionStore()
    let auth = HostAuth(configuration: configuration, transport: transport, store: store)
    let payload = response()
    AuthURLProtocol.responder = { request in
      if request.url?.path == "/auth/v1/token" {
        #expect(request.url?.query == "grant_type=password")
        #expect(request.value(forHTTPHeaderField: "apikey") == "sb_publishable_test")
        let body = try Self.body(request)
        #expect(body["email"] == "host@example.test")
        #expect(body["password"] == "test-password")
        return (200, payload)
      }
      #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer test-access")
      return (200, Data(#"{"api":true,"redis":true,"worker":true}"#.utf8))
    }
    await auth.signIn(email: " host@example.test ", password: "test-password")
    #expect(auth.error == nil)
    #expect(auth.session?.user.email == "host@example.test")
    #expect(store.account == configuration.url.absoluteString)
    #expect(store.value?.refreshToken == "test-refresh")
    let client = APIClient(
      baseURL: URL(string: "https://api.example.test")!, token: auth.accessToken, session: transport
    )
    #expect(try await client.health().api)
  }

  @Test func invalidCredentialsDoNotResumeHostActionOrSaveSession() async {
    let transport = transport()
    defer { transport.invalidateAndCancel() }
    let store = MemoryHostSessionStore()
    let auth = HostAuth(configuration: configuration, transport: transport, store: store)
    AuthURLProtocol.responder = { _ in
      (400, Data(#"{"error_code":"invalid_credentials","msg":"Invalid login credentials"}"#.utf8))
    }
    var resumed = false
    #expect(!auth.requireSignIn(.host, retry: { resumed = true }))
    await auth.signIn(email: "host@example.test", password: "wrong")
    #expect(!resumed && auth.showLogin)
    #expect(auth.accessToken == nil && store.value == nil)
    #expect(auth.error == tr("Wrong email or password. Ask the owner if you need an account."))
  }

  @Test func successfulSignInResumesTheRequestedActionOnce() async {
    let transport = transport()
    defer { transport.invalidateAndCancel() }
    let auth = HostAuth(
      configuration: configuration, transport: transport, store: MemoryHostSessionStore())
    let payload = response()
    AuthURLProtocol.responder = { _ in (200, payload) }
    var calls = 0
    #expect(!auth.requireSignIn(.addSong, retry: { calls += 1 }))
    await auth.signIn(email: "host@example.test", password: "test")
    #expect(calls == 1 && !auth.showLogin)
    #expect(auth.requireSignIn(.host, retry: { calls += 1 }))
    #expect(calls == 1)
  }

  @Test func restoresExpiredSessionByRotatingRefreshToken() async {
    let transport = transport()
    defer { transport.invalidateAndCancel() }
    let store = MemoryHostSessionStore()
    store.value = HostSession(
      accessToken: "expired", refreshToken: "old-refresh", expiresAt: 1,
      user: HostUser(id: "host-1", email: nil))
    let auth = HostAuth(configuration: configuration, transport: transport, store: store)
    let payload = response(access: "rotated-access", refresh: "rotated-refresh")
    AuthURLProtocol.responder = { request in
      #expect(request.url?.query == "grant_type=refresh_token")
      let body = try Self.body(request)
      #expect(body["refresh_token"] == "old-refresh")
      return (200, payload)
    }
    await auth.restore()
    #expect(auth.accessToken == "rotated-access")
    #expect(store.value?.refreshToken == "rotated-refresh")
  }

  @Test func signOutClearsCredentialsAndLocalDevelopmentNeedsNoLogin() async {
    let transport = transport()
    defer { transport.invalidateAndCancel() }
    let store = MemoryHostSessionStore()
    let auth = HostAuth(configuration: configuration, transport: transport, store: store)
    let payload = response()
    AuthURLProtocol.responder = { _ in (200, payload) }
    await auth.signIn(email: "host@example.test", password: "test")
    auth.signOut()
    #expect(auth.session == nil && auth.accessToken == nil && store.value == nil)
    let local = HostAuth(configuration: nil, transport: transport, store: store)
    #expect(!local.isEnabled)
    #expect(local.requireSignIn(.host, retry: {}))
    #expect(!local.showLogin)
  }
}
