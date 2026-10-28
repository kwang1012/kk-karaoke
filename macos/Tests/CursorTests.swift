import AppKit
import Testing
@testable import KKaraoke

struct CursorTests {
    @Test func theKindsMapToCursors() {
        #expect(StableCursor.Kind.link.cursor == .pointingHand)
        #expect(StableCursor.Kind.columnResize.cursor == .resizeLeftRight)
    }
}

@MainActor @Suite(.serialized) struct FloatingLyricsWindowTests {
    private func window(_ id: String) -> NSWindow {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 580, height: 200),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable],
                              backing: .buffered, defer: false)
        window.identifier = NSUserInterfaceItemIdentifier(id)
        window.isReleasedWhenClosed = false
        return window
    }

    @Test func floatingLyricsCannotEnterFullscreen() throws {
        let mini = window(MiniLyrics.windowID)
        defer { mini.close() }
        mini.collectionBehavior.insert(.fullScreenPrimary)
        MiniLyrics.configure(mini)
        #expect(mini.collectionBehavior.contains(.fullScreenNone))
        #expect(!mini.collectionBehavior.contains(.fullScreenPrimary))
        let zoom = try #require(mini.standardWindowButton(.zoomButton))
        #expect(zoom.isHidden && !zoom.isEnabled)
        #expect(mini.standardWindowButton(.closeButton)?.isEnabled == true)
        #expect(mini.styleMask.contains(.resizable))
    }

    @Test func closingTheFloatingWindowRestoresMain() {
        let main = window("main")
        let mini = window(MiniLyrics.windowID)
        defer { main.close(); mini.close() }
        mini.orderFront(nil)
        WindowFocus.showMain(windows: [main, mini])
        #expect(!main.isVisible, "Main stays hidden while floating lyrics are visible")
        mini.close()
        WindowFocus.showMain(windows: [main, mini])
        #expect(main.isVisible)
    }

    @Test func minimizedMainIsRestored() async throws {
        // Do not trigger the app's automatic floating-window observer for this fixture.
        let main = window("fixture-regular")
        defer { main.close() }
        main.makeKeyAndOrderFront(nil)
        main.miniaturize(nil)
        for _ in 0..<100 where !main.isMiniaturized { try await Task.sleep(for: .milliseconds(10)) }
        #expect(main.isMiniaturized)
        main.identifier = NSUserInterfaceItemIdentifier("main")
        WindowFocus.showMain(windows: [main])
        for _ in 0..<100 where main.isMiniaturized { try await Task.sleep(for: .milliseconds(10)) }
        #expect(!main.isMiniaturized)
        #expect(main.isVisible)
    }

    @Test func missingMainIsReopenedUnlessAnotherSecondaryIsVisible() {
        var opened = 0
        WindowFocus.showMain(windows: []) { opened += 1 }
        #expect(opened == 1)
        let tv = window("tv")
        defer { tv.close() }
        tv.orderFront(nil)
        WindowFocus.showMain(windows: [tv]) { opened += 1 }
        #expect(opened == 1)
    }
}
