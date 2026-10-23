import CoreGraphics
import SwiftUI
import Testing

@testable import KKaraoke

@MainActor struct LyricGlyphTests {
  @Test func highlightingPreservesGlyphCoverage() throws {
    // Compare alpha, not brightness: highlighting may change color, but it must
    // not add ink to the glyph's antialiased outline or change its layout.
    let line = LyricLine(
      time: 0, text: "猜不透 office café",
      words: [
        LyricWord(start: 0, end: 0.3, text: "猜不透 "),
        LyricWord(start: 0.3, end: 0.6, text: "office "),
        LyricWord(start: 0.6, end: 1, text: "café"),
      ])
    func raster(at time: Double) throws -> (Int, Int, [UInt8]) {
      let renderer = ImageRenderer(
        content:
          KaraokeText(line: line, time: time, delay: 0, dim: Color(white: 0.55), active: true)
          .font(.system(size: 36, weight: .bold)).fixedSize().padding(8))
      renderer.scale = 2
      let image = try #require(renderer.cgImage)
      var pixels = [UInt8](repeating: 0, count: image.width * image.height * 4)
      try pixels.withUnsafeMutableBytes { bytes in
        let context = try #require(
          CGContext(
            data: bytes.baseAddress, width: image.width,
            height: image.height, bitsPerComponent: 8, bytesPerRow: image.width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
      }
      return (
        image.width, image.height, stride(from: 3, to: pixels.count, by: 4).map { pixels[$0] }
      )
    }
    let dim = try raster(at: 0)
    let highlighted = try raster(at: 2)
    #expect(dim.0 == highlighted.0 && dim.1 == highlighted.1)
    #expect(dim.2 == highlighted.2)
    #expect(dim.2.contains { $0 > 0 && $0 < 255 })
  }
}
