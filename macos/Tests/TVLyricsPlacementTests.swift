import Testing

@testable import KKaraoke

struct TVLyricsPlacementTests {
  @Test func centersActiveLineAndSpacesWrappedNeighborsByScaledHeight() {
    let placement = TVLyricsPlacement(
      current: 1, visible: [0, 1, 2],
      heights: [0: 100, 1: 200, 2: 300], availableHeight: 1000,
      fallbackHeight: 80, gap: 16)
    #expect(placement.offset(for: 1) == 0)
    #expect(abs(placement.offset(for: 0) - (-143.5)) < 0.001)
    #expect(abs(placement.offset(for: 2) - 213.5) < 0.001)
  }

  @Test func longLinesFitWithoutChangingTheirUnscaledTextLayout() {
    let placement = TVLyricsPlacement(
      current: 1, visible: [0, 1, 2],
      heights: [0: 100, 1: 1000, 2: 1000], availableHeight: 400,
      fallbackHeight: 80, gap: 16)
    #expect(abs(placement.scale(for: 1) - 0.168) < 0.001)
    #expect(abs(placement.scale(for: 2) - 0.168) < 0.001)
    #expect(abs(placement.offset(for: 2) - 184) < 0.001)
  }

  @Test func advancingChangesTransformsWhileRetainingMeasuredHeights() {
    let old = TVLyricsPlacement(
      current: 1, visible: [0, 1, 2, 3],
      heights: [0: 100, 1: 200, 2: 300, 3: 100], availableHeight: 1000,
      fallbackHeight: 80, gap: 16)
    var next = old
    next.current = 2
    #expect(old.heights == next.heights)
    #expect(old.scale(for: 2) == 0.65)
    #expect(next.scale(for: 2) == 1)
    #expect(next.offset(for: 2) == 0)
    #expect(next.offset(for: 1) < 0)
  }
}
