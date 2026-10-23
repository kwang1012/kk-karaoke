import Foundation
import Testing

@testable import KKaraoke

private actor Counter {
  var value = 0
  func next() -> Int { value += 1; return value }
}

struct QueryCacheTests {
  @Test func freshAnswerIsReusedAndStaleOneIsAskedAgain() async throws {
    let cache = QueryCache()
    let counter = Counter()
    let first = try await cache.fetch("k", staleTime: 60) { await counter.next() }
    let second = try await cache.fetch("k", staleTime: 60) { await counter.next() }
    #expect(first == 1 && second == 1)
    let stale = try await cache.fetch("k", staleTime: 0) { await counter.next() }
    #expect(stale == 2)
    let forced = try await cache.fetch("k", staleTime: 60, refresh: true) { await counter.next() }
    #expect(forced == 3)
  }

  @Test func askingTogetherSharesOneRequest() async throws {
    let cache = QueryCache()
    let counter = Counter()
    async let a = cache.fetch("k", staleTime: 60) { try await Task.sleep(for: .milliseconds(100)); return await counter.next() }
    async let b = cache.fetch("k", staleTime: 60) { try await Task.sleep(for: .milliseconds(100)); return await counter.next() }
    let (x, y) = try await (a, b)
    #expect(x == y)
    #expect(await counter.value == 1)
  }

  @Test func failuresAreNotRemembered() async throws {
    let cache = QueryCache()
    struct Boom: Error {}
    await #expect(throws: Boom.self) { try await cache.fetch("k", staleTime: 60) { throw Boom() } as Int }
    let value = try await cache.fetch("k", staleTime: 60) { 7 }
    #expect(value == 7)
  }

  @Test func invalidatingForgetsMatchingKeys() async throws {
    let cache = QueryCache()
    let counter = Counter()
    _ = try await cache.fetch("a|library", staleTime: 60) { await counter.next() }
    _ = try await cache.fetch("a|search", staleTime: 60) { await counter.next() }
    await cache.invalidate(containing: "|library")
    #expect(try await cache.fetch("a|library", staleTime: 60) { await counter.next() } == 3)
    #expect(try await cache.fetch("a|search", staleTime: 60) { await counter.next() } == 2)
  }
}
