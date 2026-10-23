import Observation
import SwiftUI

// The app's own menus, selects, switches and status pills. They share the web app's look
// (a flat dark panel, a soft hover wash, the accent for the current choice) instead of the
// system's pop-up buttons, popovers and form controls, which do not take that styling.

// MARK: Dropdown host

private struct DismissMenuKey: EnvironmentKey {
  static var defaultValue: () -> Void { {} }
}

extension EnvironmentValues {
  /// Closes the dropdown a menu item sits in.
  var dismissMenu: () -> Void {
    get { self[DismissMenuKey.self] }
    set { self[DismissMenuKey.self] = newValue }
  }
}

/// The one dropdown a window shows at a time. `dropdown(isPresented:)` hands it a panel and
/// where the trigger sits; `menuHost()` draws it above everything else in the window.
@MainActor
@Observable
final class MenuCenter {
  enum Edge { case leading, trailing }

  struct Presented {
    var owner: UUID
    var anchor: CGRect
    var edge: Edge
    var width: CGFloat
    var content: AnyView
    var onClose: () -> Void
  }

  var current: Presented?

  func show(_ presented: Presented) {
    let previous = current
    current = presented
    if let previous, previous.owner != presented.owner { previous.onClose() }
  }

  func close() {
    guard let closing = current else { return }
    current = nil
    closing.onClose()
  }
}

private let hostSpace = "menuHost"

extension View {
  /// Give this window a layer for `dropdown`s. Apply it once, near the root.
  func menuHost() -> some View { modifier(MenuHost()) }

  /// Shows `panel` under this view while `isPresented`, in place of a system popover.
  func dropdown<Panel: View>(
    isPresented: Binding<Bool>, edge: MenuCenter.Edge = .trailing, width: CGFloat? = nil,
    @ViewBuilder panel: @escaping () -> Panel
  ) -> some View {
    modifier(DropdownTrigger(isPresented: isPresented, edge: edge, width: width, panel: panel))
  }
}

private struct MenuHost: ViewModifier {
  @State private var center = MenuCenter()

  func body(content: Content) -> some View {
    content
      .coordinateSpace(name: hostSpace)
      .environment(center)
      .overlay {
        GeometryReader { geo in
          if let shown = center.current {
            let opensUp = shown.anchor.maxY > geo.size.height * 0.6
            let x = min(
              max(8, shown.edge == .trailing ? shown.anchor.maxX - shown.width : shown.anchor.minX),
              max(8, geo.size.width - shown.width - 8))
            ZStack(alignment: opensUp ? .bottomLeading : .topLeading) {
              Color.black.opacity(0.001).contentShape(Rectangle())
                .onTapGesture { center.close() }
              shown.content
                .environment(\.dismissMenu, { center.close() })
                .frame(width: shown.width)
                .background(AppTheme.popover, in: RoundedRectangle(cornerRadius: 12))
                .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(.primary.opacity(0.1)) }
                .shadow(color: .black.opacity(0.4), radius: 12, y: 6)
                .padding(.leading, x)
                .padding(
                  opensUp ? .bottom : .top,
                  opensUp ? geo.size.height - shown.anchor.minY + 6 : shown.anchor.maxY + 6
                )
            }
            .frame(width: geo.size.width, height: geo.size.height)
          }
        }
      }
  }
}

private struct DropdownTrigger<Panel: View>: ViewModifier {
  @Environment(MenuCenter.self) private var center: MenuCenter?
  @Binding var isPresented: Bool
  var edge: MenuCenter.Edge
  var width: CGFloat?
  var panel: () -> Panel
  @State private var owner = UUID()
  @State private var frame = CGRect.zero

  func body(content: Content) -> some View {
    content
      .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(hostSpace)) } action: {
        frame = $0
      }
      .onChange(of: isPresented) { _, open in
        guard let center else { isPresented = false; return }
        if open {
          center.show(
            .init(
              owner: owner, anchor: frame, edge: edge, width: width ?? max(frame.width, 200),
              content: AnyView(panel()), onClose: { isPresented = false }))
        } else if center.current?.owner == owner {
          center.current = nil
        }
      }
  }
}

// MARK: Menu

/// A row in a dropdown list.
struct MenuRowStyle: ButtonStyle {
  var destructive = false
  @Environment(\.isEnabled) private var enabled

  func makeBody(configuration: Configuration) -> some View {
    Row(configuration: configuration, destructive: destructive, enabled: enabled)
  }

  private struct Row: View {
    let configuration: Configuration
    let destructive: Bool
    let enabled: Bool
    @State private var hovered = false

    var body: some View {
      configuration.label
        .font(.system(size: 13))
        .foregroundStyle(destructive ? Color.red : Color.primary)
        .padding(.horizontal, 10).frame(minHeight: 32)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
          Color.primary.opacity(configuration.isPressed ? 0.14 : hovered && enabled ? 0.08 : 0),
          in: RoundedRectangle(cornerRadius: 6)
        )
        .contentShape(RoundedRectangle(cornerRadius: 6))
        .opacity(enabled ? 1 : 0.4)
        .onHover { hovered = $0 }
        .pointerStyle(enabled ? .link : nil)
    }
  }
}

/// The label of a menu row; `selected` reserves a trailing check so titles line up.
struct MenuRowLabel: View {
  var title: LocalizedStringKey
  var icon: String?
  var selected: Bool?

  var body: some View {
    HStack(spacing: 10) {
      if let icon { LucideIcon(icon, size: 16).foregroundStyle(.secondary) }
      Text(title).lineLimit(1)
      Spacer(minLength: 0)
      if let selected, selected { LucideIcon("check", size: 14).foregroundStyle(AppTheme.accent) }
    }
  }
}

/// A choice in an `AppMenu`. Selecting it closes the menu.
struct AppMenuItem: View {
  @Environment(\.dismissMenu) private var dismiss
  var title: LocalizedStringKey
  var icon: String?
  var destructive = false
  var action: () -> Void

  var body: some View {
    Button {
      dismiss()
      action()
    } label: {
      MenuRowLabel(title: title, icon: icon)
    }
    .buttonStyle(MenuRowStyle(destructive: destructive))
  }
}

struct AppMenuDivider: View {
  var body: some View { Divider().padding(.vertical, 4).padding(.horizontal, 4) }
}

/// A round "more" button that opens a menu of `AppMenuItem`s.
struct AppMenu<Items: View>: View {
  var label: LocalizedStringKey = "More options"
  var icon = "ellipsis"
  var width: CGFloat = 210
  @ViewBuilder var items: () -> Items
  @State private var open = false

  var body: some View {
    Button {
      open.toggle()
    } label: {
      LucideIcon(icon, size: 18).foregroundStyle(open ? Color.primary : .secondary)
    }
    .buttonStyle(WebIconButtonStyle()).help(label).accessibilityLabel(label)
    .dropdown(isPresented: $open, edge: .trailing, width: width) {
      VStack(alignment: .leading, spacing: 1) { items() }.padding(6)
    }
  }
}

// MARK: Select

struct SelectOption<Value: Hashable>: Identifiable {
  var value: Value
  var title: LocalizedStringKey
  var id: Value { value }
}

/// A dropdown for a short list: shaped like the app's text inputs, with the list below it.
struct AppSelect<Value: Hashable>: View {
  var label: LocalizedStringKey
  @Binding var selection: Value
  var options: [SelectOption<Value>]
  var width: CGFloat?
  @State private var open = false

  var body: some View {
    Button {
      open.toggle()
    } label: {
      HStack(spacing: 6) {
        Text(options.first { $0.value == selection }?.title ?? "").lineLimit(1)
        Spacer(minLength: 0)
        LucideIcon("chevron-down", size: 14).foregroundStyle(.secondary)
          .rotationEffect(.degrees(open ? 180 : 0))
      }
      .font(.system(size: 13))
      .padding(.horizontal, 12).frame(height: 34).frame(width: width)
      .background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 8))
      .overlay {
        RoundedRectangle(cornerRadius: 8)
          .strokeBorder(open ? AppTheme.accent.opacity(0.6) : Color.primary.opacity(0.14))
      }
      .contentShape(RoundedRectangle(cornerRadius: 8))
    }
    .buttonStyle(.plain).pointerStyle(.link).accessibilityLabel(label).help(label)
    .dropdown(isPresented: $open, edge: .leading, width: max(width ?? 0, 220)) {
      if options.count > 8 {
        ScrollView { list }.frame(maxHeight: 280)
      } else {
        list
      }
    }
  }

  private var list: some View {
    VStack(alignment: .leading, spacing: 1) {
      ForEach(options) { option in
        Button {
          selection = option.value
          open = false
        } label: {
          MenuRowLabel(title: option.title, icon: nil, selected: option.value == selection)
        }
        .buttonStyle(MenuRowStyle())
      }
    }
    .padding(6)
  }
}

/// Picks a microphone or speakers by their stable uid; "" is the system default.
struct DeviceSelect: View {
  var label: LocalizedStringKey
  var devices: [AudioDevice]
  @Binding var uid: String
  var width: CGFloat?

  var body: some View {
    AppSelect(label: label, selection: $uid, options: options, width: width)
  }

  private var options: [SelectOption<String>] {
    var list = [SelectOption<String>(value: "", title: "System Default")]
    list += devices.map { SelectOption(value: $0.uid, title: LocalizedStringKey($0.name)) }
    if !uid.isEmpty, !devices.contains(where: { $0.uid == uid }) {
      list.append(SelectOption(value: uid, title: "Selected device (unavailable)"))
    }
    return list
  }
}

// MARK: Switch and chip

/// The web app's switch: a pill that slides, accent when on.
struct AppSwitchStyle: ToggleStyle {
  func makeBody(configuration: Configuration) -> some View {
    Button {
      withAnimation(.easeOut(duration: 0.12)) { configuration.isOn.toggle() }
    } label: {
      HStack(spacing: 12) {
        configuration.label
        Spacer(minLength: 0)
        ZStack(alignment: configuration.isOn ? .trailing : .leading) {
          Capsule().fill(configuration.isOn ? AppTheme.accent : Color.primary.opacity(0.2))
          Circle().fill(.white).padding(2)
        }
        .frame(width: 38, height: 22)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain).pointerStyle(.link)
    .accessibilityValue(configuration.isOn ? "On" : "Off")
  }
}

/// A toggle shown as a pill, like a filter chip.
struct AppChipToggleStyle: ToggleStyle {
  func makeBody(configuration: Configuration) -> some View {
    Button {
      configuration.isOn.toggle()
    } label: {
      configuration.label
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(configuration.isOn ? Color.white : .primary)
        .padding(.horizontal, 14).frame(height: 34)
        .background(configuration.isOn ? AppTheme.accent : Color.primary.opacity(0.08), in: Capsule())
        .contentShape(Capsule())
    }
    .buttonStyle(.plain).pointerStyle(.link)
    .accessibilityValue(configuration.isOn ? "On" : "Off")
  }
}

extension ButtonStyle where Self == WebButtonStyle {
  /// The quiet button: a soft fill with the normal text color.
  static var secondary: WebButtonStyle {
    WebButtonStyle(background: Color.primary.opacity(0.1), foreground: .primary, height: 32)
  }
  static var danger: WebButtonStyle {
    WebButtonStyle(background: Color.red.opacity(0.14), foreground: .red, height: 32)
  }
  static var chip: WebButtonStyle {
    WebButtonStyle(
      background: Color.primary.opacity(0.08), foreground: .primary, capsule: true, height: 34)
  }
}

// MARK: Update indicator

/// Shows that a newer version is waiting, or is installing once playback stops. Hidden otherwise.
struct UpdateIndicator: View {
  @EnvironmentObject private var updater: AppUpdater
  @State private var hovered = false

  var body: some View {
    if updater.installationPending {
      pill(icon: "refresh-cw", text: tr("Updating after playback"))
    } else if let version = updater.availableVersion {
      Button {
        updater.checkForUpdates()
      } label: {
        pill(icon: "circle-arrow-down", text: tr("Update available"))
      }
      .buttonStyle(.plain).onHover { hovered = $0 }
      .help("KKaraoke \(version) is ready to install").accessibilityLabel("Update to version \(version)")
    }
  }

  private func pill(icon: String, text: String) -> some View {
    HStack(spacing: 6) {
      LucideIcon(icon, size: 14)
      Text(text).font(.system(size: 12, weight: .medium))
    }
    .foregroundStyle(AppTheme.accent)
    .padding(.horizontal, 10).frame(height: 28)
    .background(AppTheme.accent.opacity(hovered ? 0.18 : 0.1), in: Capsule())
    .overlay { Capsule().strokeBorder(AppTheme.accent.opacity(0.25)) }
  }
}
