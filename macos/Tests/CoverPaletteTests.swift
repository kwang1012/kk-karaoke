import CoreImage
import Foundation
import Testing

@testable import KKaraoke

struct CoverPaletteTests {
  @Test func invalidArtworkFallsBackOnTheWorker() async {
    let palette = await Task.detached { CoverPalette.decode(Data("invalid image".utf8)) }.value
    #expect(palette == .fallback)
  }

  @Test func inviteCodeIsRasterizedOffTheUIThreadAndStillScans() async throws {
    let text = "https://kkaraoke.app/join?room=fixture"
    let image = try #require(await Task.detached(priority: .utility) { QRCode.image(for: text) }.value)
    let context = CIContext(options: [.useSoftwareRenderer: true])
    let detector = try #require(CIDetector(ofType: CIDetectorTypeQRCode, context: context,
                                         options: [CIDetectorAccuracy: CIDetectorAccuracyHigh]))
    let code = try #require(detector.features(in: CIImage(cgImage: image)).first as? CIQRCodeFeature)
    #expect(code.messageString == text)
  }
  @Test func dominantColorFollowsCoverPopulationRatherThanSmallBrightLogo() {
    let background: [UInt8] = [48, 80, 96, 255]
    let logo: [UInt8] = [255, 0, 100, 255]
    let pixels = Array(repeating: background, count: 100).flatMap { $0 } + logo
    let palette = CoverPalette.dominant(pixels: pixels)
    #expect(palette.hue > 0.5 && palette.hue < 0.6)
    #expect(abs(palette.lightness - 72.0 / 255) < 0.001)
  }

  @Test func neutralCoversStayNeutral() {
    let palette = CoverPalette.dominant(pixels: [210, 210, 210, 255])
    #expect(palette.saturation == 0)
    #expect(palette.lightness > 0.8)
  }

  @Test func TransparentPixelsDoNotOverrideVisibleArtwork() {
    let palette = CoverPalette.dominant(pixels: [255, 0, 0, 0, 0, 0, 255, 255])
    #expect(abs(palette.hue - 2.0 / 3) < 0.001)
    #expect(palette.saturation == 1)
    #expect(CoverPalette.dominant(pixels: []) == .fallback)
    #expect(CoverPalette.dominant(pixels: [0, 0, 0, 0]) == .fallback)
  }
}
