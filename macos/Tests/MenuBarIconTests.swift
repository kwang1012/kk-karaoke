import AppKit
import SwiftUI
import Testing

@testable import KKaraoke

@MainActor struct MenuBarIconTests {
  @Test func statusImageHasMenuBarIntrinsicSize() throws {
    let image = try #require(NSImage(named: "MenuBarIcon"))
    #expect(image.size == NSSize(width: 18, height: 18))
    #expect(!image.isTemplate)
    let representations = image.representations
    #expect(representations.contains { $0.pixelsWide == 36 && $0.pixelsHigh == 36 })
    // Verify the actual label's ideal size, without a frame masking a huge source image.
    let renderer = ImageRenderer(content: Image("MenuBarIcon").renderingMode(.original))
    let rendered = try #require(renderer.cgImage)
    #expect(rendered.width == 18 && rendered.height == 18)
  }
}
