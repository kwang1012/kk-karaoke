import AppKit
import ObjectiveC
import SwiftUI

extension View {
  func thinScrollbars() -> some View {
    background(ThinScrollbarConfiguration().allowsHitTesting(false))
  }
}

/// Configure this app's native scroll views, without changing the Mac's scrollbar preference.
private struct ThinScrollbarConfiguration: NSViewRepresentable {
  func makeNSView(context: Context) -> ProbeView { ProbeView() }
  func updateNSView(_ view: ProbeView, context: Context) { view.scheduleConfiguration() }

  final class ProbeView: NSView {
    private var configurationPending = false

    private var timer: Timer?

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      timer?.invalidate()
      timer = nil
      scheduleConfiguration()
      guard window != nil else { return }
      // A screen's scroll view can appear long after this view did (a page opened later): look again now and then.
      timer = Timer.scheduledTimer(withTimeInterval: 0.7, repeats: true) { [weak self] _ in
        MainActor.assumeIsolated { self?.scheduleConfiguration() }
      }
    }

    override func layout() {
      super.layout()
      scheduleConfiguration()
    }

    func scheduleConfiguration() {
      guard !configurationPending else { return }
      configurationPending = true
      // SwiftUI can attach a screen's scroll view after attaching its background.
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        self.configurationPending = false
        guard let content = self.window?.contentView else { return }
        self.configure(content)
      }
    }

    private func configure(_ view: NSView) {
      if let scroll = view as? NSScrollView {
        // Only the legacy style lets an app draw its own thumb; the overlay style is drawn by the system.
        if scroll.scrollerStyle != .legacy { scroll.scrollerStyle = .legacy }
        scroll.autohidesScrollers = true
        if scroll.hasVerticalScroller, !(scroll.verticalScroller is ThinScroller) {
          scroll.verticalScroller = ThinScroller()
        }
        if scroll.hasHorizontalScroller, !(scroll.horizontalScroller is ThinScroller) {
          scroll.horizontalScroller = ThinScroller()
        }
        ScrollHover.attach(to: scroll)
      }
      for child in view.subviews { configure(child) }
    }
  }
}

/// A slim rounded thumb with no track, shown while the pointer is over the list or it scrolls.
final class ThinScroller: NSScroller {
  var hovering = false { didSet { needsDisplay = true } }
  private var lastScroll = Date.distantPast

  override class var isCompatibleWithOverlayScrollers: Bool { true }

  override class func scrollerWidth(for controlSize: NSControl.ControlSize, scrollerStyle: NSScroller.Style) -> CGFloat {
    8
  }

  /// Called when the list scrolls: keep the thumb up for a moment, then let it go.
  func scrolled() {
    lastScroll = Date()
    needsDisplay = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { [weak self] in self?.needsDisplay = true }
  }

  override func draw(_ dirtyRect: NSRect) { drawKnob() }
  override func drawKnobSlot(in slotRect: NSRect, highlight: Bool) {}

  override func drawKnob() {
    guard hovering || Date().timeIntervalSince(lastScroll) < 0.8 else { return }
    let vertical = bounds.height >= bounds.width
    let knob = rect(for: .knob).insetBy(dx: vertical ? 2 : 0, dy: vertical ? 0 : 2)
    guard knob.width > 0, knob.height > 0 else { return }
    let radius = min(knob.width, knob.height) / 2
    NSColor.white.withAlphaComponent(hovering ? 0.35 : 0.25).setFill()
    NSBezierPath(roundedRect: knob, xRadius: radius, yRadius: radius).fill()
  }
}

/// Tells the thin scrollers when the pointer enters the list or the list scrolls.
@MainActor
private final class ScrollHover: NSObject {
  weak var scroll: NSScrollView?

  init(_ scroll: NSScrollView) {
    self.scroll = scroll
    super.init()
    scroll.addTrackingArea(
      NSTrackingArea(
        rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self))
    _ = NotificationCenter.default.addObserver(
      forName: NSScrollView.didLiveScrollNotification, object: scroll, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated { self?.scrollers.forEach { $0.scrolled() } }
    }
  }

  private var scrollers: [ThinScroller] {
    [scroll?.verticalScroller, scroll?.horizontalScroller].compactMap { $0 as? ThinScroller }
  }

  @objc func mouseEntered(_ event: NSEvent) { scrollers.forEach { $0.hovering = true } }
  @objc func mouseExited(_ event: NSEvent) { scrollers.forEach { $0.hovering = false } }

  nonisolated(unsafe) private static var key = 0
  static func attach(to scroll: NSScrollView) {
    guard objc_getAssociatedObject(scroll, &key) == nil else { return }
    objc_setAssociatedObject(scroll, &key, ScrollHover(scroll), .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
  }
}
