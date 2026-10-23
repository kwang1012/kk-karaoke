import AppKit
import SwiftUI

/// AppKit's native traffic-light buttons, hosted directly in the app header.
struct WindowControls: NSViewRepresentable {
  func makeNSView(context: Context) -> TrafficLightHost { TrafficLightHost() }
  func updateNSView(_ view: TrafficLightHost, context: Context) { view.needsLayout = true }

  final class TrafficLightHost: NSView {
    private var buttons: [NSButton] = []

    override init(frame frameRect: NSRect) {
      super.init(frame: frameRect)
      let kinds: [NSWindow.ButtonType] = [.closeButton, .miniaturizeButton, .zoomButton]
      let actions = [
        #selector(closeWindow(_:)), #selector(minimizeWindow(_:)), #selector(zoomWindow(_:)),
      ]
      for (kind, action) in zip(kinds, actions) {
        guard
          let button = NSWindow.standardWindowButton(
            kind, for: [.titled, .closable, .miniaturizable, .resizable])
        else { continue }
        button.target = self
        button.action = action
        addSubview(button)
        buttons.append(button)
      }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      guard let window else { return }
      window.titleVisibility = .hidden
      window.titlebarAppearsTransparent = true
      window.styleMask.insert(.fullSizeContentView)
      // NSWindow owns and can reposition its title-bar buttons during layout. Use the
      // public factory for the header's native controls so they remain in this host.
      for kind in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
        window.standardWindowButton(kind)?.isHidden = true
      }
      needsLayout = true
    }

    override func layout() {
      super.layout()
      for (index, button) in buttons.enumerated() {
        button.setFrameOrigin(
          NSPoint(x: 4 + CGFloat(index) * 20, y: (bounds.height - button.frame.height) / 2))
      }
    }

    @objc private func closeWindow(_ sender: NSButton) { window?.performClose(sender) }
    @objc private func minimizeWindow(_ sender: NSButton) { window?.performMiniaturize(sender) }
    @objc private func zoomWindow(_ sender: NSButton) {
      if NSApp.currentEvent?.modifierFlags.contains(.option) == true {
        window?.performZoom(sender)
      } else {
        window?.toggleFullScreen(sender)
      }
    }
  }
}

/// Empty header space drags the window; native controls keep their own mouse handling.
struct HeaderDragRegion: NSViewRepresentable {
  func makeNSView(context: Context) -> DragView { DragView() }
  func updateNSView(_ view: DragView, context: Context) {}
  final class DragView: NSView {
    override func mouseDown(with event: NSEvent) { window?.performDrag(with: event) }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  }
}
