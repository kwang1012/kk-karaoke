import SwiftUI

/// Vector assets copied from the same Lucide package used by the web app.
struct LucideIcon: View {
  var name: String
  var size: CGFloat = 20

  init(_ name: String, size: CGFloat = 20) {
    self.name = name
    self.size = size
  }

  var body: some View {
    Image("lucide-\(Self.aliases[name] ?? name)")
      .renderingMode(.template).resizable().scaledToFit().frame(width: size, height: size)
      .accessibilityHidden(true)
  }

  private static let aliases = [
    "music.note": "music", "music.mic": "mic-vocal", "mic.fill": "mic",
    "magnifyingglass": "search", "books.vertical": "library-big",
    "music.note.list": "list-music", "list.bullet": "list-music",
    "chevron.left": "chevron-left", "chevron.right": "chevron-right",
    "xmark": "x", "xmark.circle.fill": "circle-x", "gearshape": "settings",
    "person.2": "users", "doc.on.doc": "copy", "arrow.clockwise": "refresh-cw",
    "antenna.radiowaves.left.and.right": "radio", "wifi.exclamationmark": "wifi-off",
    "wifi.slash": "wifi-off", "arrow.up.arrow.down": "arrow-down-up", "trash": "trash-2",
    "backward.fill": "skip-back", "forward.fill": "skip-forward",
    "play.fill": "play", "pause.fill": "pause", "play.circle.fill": "circle-play",
    "pause.circle.fill": "circle-pause", "slider.horizontal.3": "sliders-horizontal",
    "text.quote": "mic-vocal", "text.badge.plus": "plus", "text.badge.xmark": "file-x",
    "arrow.down.circle": "download", "arrow.down.circle.fill": "circle-check",
    "square.grid.2x2": "layout-grid",
  ]
}

extension Label where Title == Text, Icon == LucideIcon {
  @MainActor init(_ title: LocalizedStringKey, lucide: String) {
    self.init {
      Text(title)
    } icon: {
      LucideIcon(lucide, size: 16)
    }
  }
}

struct AppEmptyState: View {
  var title: LocalizedStringKey
  var icon: String
  var description: Text?
  init(_ title: LocalizedStringKey, lucide: String, description: Text? = nil) {
    self.title = title
    icon = lucide
    self.description = description
  }
  var body: some View {
    VStack(spacing: 12) {
      LucideIcon(icon, size: 40).foregroundStyle(.secondary)
      Text(title).font(.title3.weight(.semibold))
      description.font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center)
    }
    .padding(32).frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

struct WebIconButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    IconBody(configuration: configuration)
  }
  private struct IconBody: View {
    let configuration: Configuration
    @State private var hovered = false
    @Environment(\.isEnabled) private var enabled
    var body: some View {
      configuration.label.frame(width: 34, height: 34)
        .background(
          .primary.opacity(configuration.isPressed ? 0.12 : hovered ? 0.06 : 0), in: Circle()
        )
        .opacity(enabled ? 1 : 0.3)
        .onHover { hovered = $0 }
        .pointerStyle(enabled ? .link : nil)
    }
  }
}

/// A native Button with the same geometry and colors as the web button.
struct WebButtonStyle: ButtonStyle {
  var background: Color = AppTheme.accent
  var foreground: Color = .white
  var capsule = false
  var height: CGFloat = 34
  @Environment(\.isEnabled) private var enabled
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.font(.system(size: 13, weight: .medium))
      .padding(.horizontal, 14).frame(height: height)
      .foregroundStyle(foreground)
      .background(
        background.opacity(configuration.isPressed ? 0.8 : 1),
        in: RoundedRectangle(cornerRadius: capsule ? 17 : 8)
      )
      .contentShape(RoundedRectangle(cornerRadius: capsule ? 17 : 8))
      .opacity(enabled ? 1 : 0.45)
      .pointerStyle(enabled ? .link : nil)
  }
}

extension View {
  func webInput(height: CGFloat = 40) -> some View {
    textFieldStyle(.plain)
      .padding(.horizontal, 12).frame(height: height)
      .background(.primary.opacity(0.03), in: RoundedRectangle(cornerRadius: 8))
      .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(.primary.opacity(0.14)) }
  }
}
