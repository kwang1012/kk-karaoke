import AppKit
import SwiftUI

/// The pointer over a view, set with an AppKit cursor rect rather than SwiftUI's own pointer style: the
/// app redraws many views every frame while the song plays, and SwiftUI's version kept falling back to the
/// arrow (or back to the hand) as it did. A cursor rect is set once and stays until the view moves.
///
/// Used in place of `.pointerStyle` everywhere in the app.
extension View {
  func stableCursor(_ kind: StableCursor.Kind?) -> some View {
    background(StableCursor(cursor: kind?.cursor))
  }
}

struct StableCursor: NSViewRepresentable {
  var cursor: NSCursor?

  enum Kind {
    case link, columnResize
    var cursor: NSCursor { self == .link ? .pointingHand : .resizeLeftRight }
  }

  func makeNSView(context: Context) -> CursorView {
    let view = CursorView()
    view.cursor = cursor
    return view
  }

  func updateNSView(_ view: CursorView, context: Context) {
    guard view.cursor != cursor else { return }
    view.cursor = cursor
    view.window?.invalidateCursorRects(for: view)
  }

  final class CursorView: NSView {
    var cursor: NSCursor?
    private var scrolling: NSObjectProtocol?

    /// Takes no clicks: it only says which cursor belongs to this spot.
    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    override func resetCursorRects() {
      if let cursor { addCursorRect(visibleRect, cursor: cursor) }
    }

    override func viewWillMove(toWindow newWindow: NSWindow?) {
      super.viewWillMove(toWindow: newWindow)
      if let scrolling { NotificationCenter.default.removeObserver(scrolling) }
      scrolling = nil
    }

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      guard let clip = enclosingScrollView?.contentView else { return }
      clip.postsBoundsChangedNotifications = true
      // Scrolling changes which part of this view shows, and so where the cursor is wanted.
      scrolling = NotificationCenter.default.addObserver(
        forName: NSView.boundsDidChangeNotification, object: clip, queue: .main
      ) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let self else { return }
          self.window?.invalidateCursorRects(for: self)
        }
      }
    }

    override func layout() {
      super.layout()
      window?.invalidateCursorRects(for: self)
    }
  }
}
