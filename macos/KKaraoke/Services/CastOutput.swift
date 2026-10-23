import Foundation
import Network
import Observation

/// Plays to a Google Cast TV or speaker. It speaks the Cast protocol directly: a TLS connection to the device,
/// messages made of a length and a small protobuf, and JSON inside them. The device plays a URL by itself, so
/// what it needs from us is the song as one file (the server's `tracks/mix`) and the play, pause and seek commands.
@MainActor
@Observable
final class CastOutput {
  enum State: Equatable {
    case off
    case connecting
    case connected
    case failed(String)
  }

  private(set) var state: State = .off
  private(set) var device: CastDevice?
  var isActive: Bool { state == .connected }

  /// The device has the player app open and can be given a song.
  @ObservationIgnored var onReady: (() -> Void)?
  /// What the device is doing with the song: "PLAYING", "BUFFERING", "PAUSED" or "IDLE", and where it is in seconds.
  @ObservationIgnored var onPlayerState: ((String, Double, String?) -> Void)?
  @ObservationIgnored var onClosed: (() -> Void)?

  @ObservationIgnored private var connection: NWConnection?
  @ObservationIgnored private var buffer = Data()
  @ObservationIgnored private var requestID = 0
  @ObservationIgnored private var transportID: String?
  @ObservationIgnored private var sessionID: String?
  @ObservationIgnored private var mediaSessionID: Int?
  @ObservationIgnored private var heartbeat: Task<Void, Never>?
  @ObservationIgnored private var pendingLoad: [String: Any]?

  private static let defaultReceiver = "CC1AD845"  // the built-in player that plays a URL
  private static let sender = "sender-0"
  private enum Namespace {
    static let connection = "urn:x-cast:com.google.cast.tp.connection"
    static let heartbeat = "urn:x-cast:com.google.cast.tp.heartbeat"
    static let receiver = "urn:x-cast:com.google.cast.receiver"
    static let media = "urn:x-cast:com.google.cast.media"
  }

  // MARK: Connecting

  func connect(to device: CastDevice) {
    disconnect()
    self.device = device
    state = .connecting
    let tls = NWProtocolTLS.Options()
    // Cast devices present their own self-signed certificate; the address came from the local network.
    sec_protocol_options_set_verify_block(tls.securityProtocolOptions, { _, _, complete in complete(true) }, .main)
    let connection = NWConnection(to: device.endpoint, using: NWParameters(tls: tls, tcp: NWProtocolTCP.Options()))
    self.connection = connection
    connection.stateUpdateHandler = { [weak self] new in
      MainActor.assumeIsolated { self?.connectionChanged(new, connection) }
    }
    connection.start(queue: .main)
  }

  func disconnect() {
    heartbeat?.cancel()
    heartbeat = nil
    if let sessionID, connection != nil {
      send(Namespace.receiver, to: "receiver-0", ["type": "STOP", "sessionId": sessionID])
    }
    connection?.cancel()
    connection = nil
    buffer = Data()
    transportID = nil
    sessionID = nil
    mediaSessionID = nil
    pendingLoad = nil
    device = nil
    state = .off
  }

  private func connectionChanged(_ new: NWConnection.State, _ source: NWConnection) {
    guard source === connection else { return }
    switch new {
    case .ready:
      send(Namespace.connection, to: "receiver-0", ["type": "CONNECT"])
      send(Namespace.receiver, to: "receiver-0", ["type": "LAUNCH", "appId": Self.defaultReceiver, "requestId": nextID()])
      heartbeat = Task { [weak self] in
        while !Task.isCancelled {
          self?.send(Namespace.heartbeat, to: "receiver-0", ["type": "PING"])
          try? await Task.sleep(for: .seconds(5))
        }
      }
      receive(on: source)
    case .failed(let error):
      fail(error.localizedDescription)
    case .waiting(let error):
      fail(error.localizedDescription)
    case .cancelled:
      break
    default:
      break
    }
  }

  private func fail(_ message: String) {
    let hadConnection = connection != nil
    connection?.cancel()
    connection = nil
    heartbeat?.cancel()
    transportID = nil
    state = .failed(message)
    if hadConnection { onClosed?() }
  }

  // MARK: Commands

  /// Plays `url` from `start` seconds. If the player app is not open yet, it starts as soon as it is.
  func load(url: URL, title: String, artist: String, artwork: URL?, start: Double, autoplay: Bool) {
    var metadata: [String: Any] = ["metadataType": 3, "title": title, "artist": artist]
    if let artwork { metadata["images"] = [["url": artwork.absoluteString]] }
    let message: [String: Any] = [
      "type": "LOAD", "autoplay": autoplay, "currentTime": start,
      "media": ["contentId": url.absoluteString, "contentType": "audio/mpeg", "streamType": "BUFFERED", "metadata": metadata],
    ]
    mediaSessionID = nil
    if transportID != nil { sendMedia(message) } else { pendingLoad = message }
  }

  func play() { sendMedia(["type": "PLAY"], needsSession: true) }
  func pause() { sendMedia(["type": "PAUSE"], needsSession: true) }
  func seek(to time: Double) { sendMedia(["type": "SEEK", "currentTime": time], needsSession: true) }

  func setVolume(_ level: Double) {
    guard isActive else { return }
    send(Namespace.receiver, to: "receiver-0", ["type": "SET_VOLUME", "volume": ["level": min(1, max(0, level))], "requestId": nextID()])
  }

  private func sendMedia(_ message: [String: Any], needsSession: Bool = false) {
    guard let transportID else { return }
    var body = message
    if needsSession {
      guard let mediaSessionID else { return }
      body["mediaSessionId"] = mediaSessionID
    }
    body["requestId"] = nextID()
    send(Namespace.media, to: transportID, body)
  }

  private func nextID() -> Int { requestID += 1; return requestID }

  // MARK: Wire

  private func send(_ namespace: String, to destination: String, _ json: [String: Any]) {
    guard let connection,
      let data = try? JSONSerialization.data(withJSONObject: json),
      let text = String(data: data, encoding: .utf8)
    else { return }
    connection.send(
      content: Self.frame(source: Self.sender, destination: destination, namespace: namespace, payload: text),
      completion: .contentProcessed { _ in })
  }

  private func receive(on source: NWConnection) {
    source.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, complete, error in
      MainActor.assumeIsolated {
        guard let self, source === self.connection else { return }
        if let data { self.buffer.append(data); self.drain() }
        if error != nil || complete { self.fail(error?.localizedDescription ?? "The device closed the connection."); return }
        self.receive(on: source)
      }
    }
  }

  private func drain() {
    while buffer.count >= 4 {
      let length = buffer.prefix(4).reduce(0) { ($0 << 8) | Int($1) }
      guard buffer.count >= 4 + length else { return }
      let body = buffer.subdata(in: 4..<(4 + length))
      buffer = buffer.subdata(in: (4 + length)..<buffer.count)
      if let message = Self.parse(body) { handle(message) }
    }
  }

  private func handle(_ message: (source: String, namespace: String, payload: String)) {
    guard let json = (try? JSONSerialization.jsonObject(with: Data(message.payload.utf8))) as? [String: Any],
      let type = json["type"] as? String
    else { return }
    switch (message.namespace, type) {
    case (Namespace.heartbeat, "PING"):
      send(Namespace.heartbeat, to: message.source, ["type": "PONG"])
    case (Namespace.connection, "CLOSE"):
      fail("The device closed the connection.")
    case (Namespace.receiver, "RECEIVER_STATUS"):
      let status = json["status"] as? [String: Any]
      let apps = status?["applications"] as? [[String: Any]] ?? []
      if let app = apps.first(where: { $0["appId"] as? String == Self.defaultReceiver }),
        let transport = app["transportId"] as? String, transport != transportID
      {
        transportID = transport
        sessionID = app["sessionId"] as? String
        send(Namespace.connection, to: transport, ["type": "CONNECT"])
        state = .connected
        if let pendingLoad { sendMedia(pendingLoad); self.pendingLoad = nil }
        onReady?()
      }
    case (Namespace.media, "MEDIA_STATUS"):
      guard let status = (json["status"] as? [[String: Any]])?.first else { return }
      mediaSessionID = status["mediaSessionId"] as? Int ?? mediaSessionID
      onPlayerState?(
        status["playerState"] as? String ?? "", (status["currentTime"] as? Double) ?? 0, status["idleReason"] as? String)
    case (Namespace.media, "LOAD_FAILED"), (Namespace.media, "INVALID_REQUEST"):
      state = .failed("The device could not play this song.")
    default:
      break
    }
  }

  // MARK: Protobuf

  /// A `CastMessage`: protocol version 0, source, destination, namespace, a string payload.
  nonisolated static func frame(source: String, destination: String, namespace: String, payload: String) -> Data {
    var body = Data()
    body.append(contentsOf: [0x08, 0x00])
    for (field, text) in [(2, source), (3, destination), (4, namespace)] { body.append(string(field, text)) }
    body.append(contentsOf: [0x28, 0x00])
    body.append(string(6, payload))
    var framed = Data()
    let length = UInt32(body.count)
    framed.append(contentsOf: [UInt8(length >> 24 & 255), UInt8(length >> 16 & 255), UInt8(length >> 8 & 255), UInt8(length & 255)])
    framed.append(body)
    return framed
  }

  private nonisolated static func string(_ field: Int, _ text: String) -> Data {
    let bytes = Array(text.utf8)
    var out = Data([UInt8(field << 3 | 2)])
    var length = bytes.count
    while length >= 0x80 { out.append(UInt8(length & 0x7f | 0x80)); length >>= 7 }
    out.append(UInt8(length))
    out.append(contentsOf: bytes)
    return out
  }

  nonisolated static func parse(_ data: Data) -> (source: String, namespace: String, payload: String)? {
    var fields: [Int: String] = [:]
    var index = data.startIndex
    func varint() -> Int? {
      var value = 0, shift = 0
      while index < data.endIndex {
        let byte = Int(data[index]); index += 1
        value |= (byte & 0x7f) << shift
        if byte & 0x80 == 0 { return value }
        shift += 7
      }
      return nil
    }
    while index < data.endIndex {
      guard let key = varint() else { return nil }
      switch key & 7 {
      case 0: guard varint() != nil else { return nil }
      case 2:
        guard let length = varint(), index + length <= data.endIndex else { return nil }
        fields[key >> 3] = String(data: data[index..<(index + length)], encoding: .utf8)
        index += length
      default: return nil
      }
    }
    guard let source = fields[2], let namespace = fields[4], let payload = fields[6] else { return nil }
    return (source, namespace, payload)
  }
}
