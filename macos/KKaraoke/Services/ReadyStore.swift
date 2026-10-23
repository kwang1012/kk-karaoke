import Foundation
import Observation

/// Which songs have been processed (vocals separated), so a list can mark the ones that are ready to sing.
@MainActor
@Observable
final class ReadyStore {
  private(set) var ids: Set<String> = []

  func contains(_ id: String) -> Bool { ids.contains(id) }

  func add(_ id: String) { ids.insert(id) }

  /// Asks the library again: what is in it is exactly what is processed.
  func refresh(using client: APIClient?) async {
    guard let tracks = try? await client?.library(refresh: true) else { return }
    ids = Set(tracks.map(\.id))
  }
}
