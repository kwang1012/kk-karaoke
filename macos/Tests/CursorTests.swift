import AppKit
import Testing
@testable import KKaraoke

struct CursorTests {
    @Test func theKindsMapToCursors() {
        #expect(StableCursor.Kind.link.cursor == .pointingHand)
        #expect(StableCursor.Kind.columnResize.cursor == .resizeLeftRight)
    }
}
