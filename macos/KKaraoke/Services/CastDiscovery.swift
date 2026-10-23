import Foundation
import Network
import Observation

/// A Google Cast TV or speaker found on the local network.
struct CastDevice: Identifiable, Hashable, Sendable {
  /// Stable per device: the id the device announces, else its network name.
  var id: String
  var name: String
  /// What kind of device it announced itself as, e.g. "Chromecast" or "Google Home Mini".
  var model: String
  var endpoint: NWEndpoint
}

/// Keeps a list of Cast devices up to date by watching for their Bonjour announcements.
@MainActor
@Observable
final class CastDiscovery {
  private(set) var devices: [CastDevice] = []
  @ObservationIgnored private var browser: NWBrowser?

  /// Starts watching. Safe to call again; the first call wins.
  func start() {
    guard browser == nil else { return }
    let browser = NWBrowser(
      for: .bonjourWithTXTRecord(type: "_googlecast._tcp", domain: nil), using: .tcp)
    browser.browseResultsChangedHandler = { [weak self] results, _ in
      let found = results.compactMap(Self.device)
      Task { @MainActor in self?.devices = found.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending } }
    }
    browser.start(queue: .main)
    self.browser = browser
  }

  func stop() {
    browser?.cancel()
    browser = nil
    devices = []
  }

  nonisolated static func device(_ result: NWBrowser.Result) -> CastDevice? {
    guard case let .service(name, _, _, _) = result.endpoint else { return nil }
    var fields: [String: String] = [:]
    if case let .bonjour(txt) = result.metadata { fields = txt.dictionary }
    // "fn" is the name people gave the device; the service name is a machine-made fallback
    let friendly = fields["fn"].flatMap { $0.isEmpty ? nil : $0 } ?? name
    return CastDevice(id: fields["id"] ?? name, name: friendly, model: fields["md"] ?? "", endpoint: result.endpoint)
  }
}
