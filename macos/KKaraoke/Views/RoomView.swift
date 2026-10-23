import SwiftUI

struct UserAvatar: View {
  var avatar: String
  var name: String
  var size: CGFloat = 28
  var body: some View {
    Group {
      if avatar.hasPrefix("/avatars/"), let filename = avatar.split(separator: "/").last {
        Image("avatar-" + filename.replacingOccurrences(of: ".svg", with: "")).resizable()
          .scaledToFill()
      } else if let url = URL(string: avatar), ["https", "http"].contains(url.scheme ?? "") {
        AsyncImage(url: url) { image in
          image.resizable().scaledToFill()
        } placeholder: {
          initial
        }
      } else {
        initial
      }
    }
    .frame(width: size, height: size).background(AppTheme.accent.opacity(0.12)).clipShape(Circle())
    .accessibilityLabel(name)
  }
  private var initial: some View {
    Text(String(name.prefix(1)).uppercased()).font(.caption.weight(.semibold))
  }
}

struct SheetHeading: View {
  var title: LocalizedStringKey
  var subtitle: LocalizedStringKey
  var onClose: () -> Void
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text(title).font(.system(size: 18, weight: .semibold))
        Spacer()
        Button(action: onClose) { LucideIcon("x", size: 16) }
          .buttonStyle(WebIconButtonStyle()).keyboardShortcut(.cancelAction).help("Close")
          .accessibilityLabel("Close")
      }
      Text(subtitle).font(.system(size: 13)).foregroundStyle(.secondary).fixedSize(
        horizontal: false, vertical: true)
    }
  }
}

struct InviteView: View {
  @Environment(RoomModel.self) private var room
  @State private var copied = false
  @State private var starting = false
  var onJoin: () -> Void
  var onClose: () -> Void

  var body: some View {
    VStack(spacing: 24) {
      SheetHeading(
        title: "Invite friends",
        subtitle: room.isInJam
          ? "Scan the QR code or share the link to sing together."
          : "Open a room first, then share its QR code or link.", onClose: onClose)
      if room.isInJam {
        if let url = room.joinURL {
          QRCodeView(text: url.absoluteString, size: 176).padding(16)
            .background(.white, in: RoundedRectangle(cornerRadius: 16))
        } else {
          ProgressView("Getting your invite…").controlSize(.small)
        }
        if let code = room.code {
          VStack(spacing: 4) {
            Text("ROOM CODE").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
            Text(code).font(.system(size: 36, weight: .bold, design: .monospaced)).tracking(8)
              .padding(.leading, 8).textSelection(.enabled).accessibilityLabel(
                code.map(String.init).joined(separator: " "))
          }
        }
        if let url = room.joinURL {
          HStack(spacing: 8) {
            Text(url.absoluteString).font(.system(size: 13)).lineLimit(1).truncationMode(.middle)
              .textSelection(.enabled)
              .padding(10).frame(maxWidth: .infinity, alignment: .leading)
              .background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 8))
              .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(.primary.opacity(0.12)) }
            Button {
              NSPasteboard.general.clearContents()
              NSPasteboard.general.setString(url.absoluteString, forType: .string)
              copied = true
            } label: {
              Label(copied ? "Copied" : "Copy link", lucide: copied ? "check" : "copy")
            }
            .buttonStyle(.secondary)
          }
        }
        VStack(alignment: .leading, spacing: 10) {
          Text("IN THE ROOM (\(room.participants.count))").font(.system(size: 11, weight: .medium))
            .foregroundStyle(.secondary)
          if room.participants.isEmpty {
            Text("Just you so far.").font(.callout).foregroundStyle(.secondary)
          } else {
            FlowLayout(spacing: 10) {
              ForEach(room.participants) { person in
                HStack(spacing: 8) {
                  UserAvatar(avatar: person.avatar, name: person.name)
                  Text(person.name).font(.system(size: 13))
                }
                .padding(.leading, 4).padding(.trailing, 12).padding(.vertical, 4)
                .background(.primary.opacity(0.06), in: Capsule())
              }
            }
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      } else {
        Button {
          starting = true
          Task {
            await room.openRoom()
            starting = false
          }
        } label: {
          HStack {
            Spacer()
            if starting { ProgressView().controlSize(.mini) }
            Label("Start a room", lucide: "users-round")
            Spacer()
          }
        }
        .buttonStyle(WebButtonStyle(height: 44)).disabled(starting)
        Button("Have a room code? Join one", action: onJoin).buttonStyle(.plain).stableCursor(.link).foregroundStyle(
          .secondary
        ).font(.callout)
      }
      if let message = room.message {
        Text(message).font(.caption).foregroundStyle(.red).fixedSize(
          horizontal: false, vertical: true)
      }
    }
    .padding(24).frame(width: 448).background(AppTheme.card).preferredColorScheme(.dark).tint(
      AppTheme.accent
    )
    .task { if room.isInJam { await room.refreshInfo() } }
    .task(id: copied) {
      guard copied else { return }
      do {
        try await Task.sleep(for: .milliseconds(1500))
        copied = false
      } catch {}
    }
  }
}

struct JoinRoomView: View {
  @Environment(RoomModel.self) private var room
  @Environment(AppModel.self) private var app
  @State private var nickname = ""
  @State private var avatar = ""
  @State private var code = ""
  @State private var joining = false
  var onClose: () -> Void
  var onLogin: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      HStack {
        Spacer()
        Button(action: onClose) { LucideIcon("x", size: 16) }.buttonStyle(WebIconButtonStyle())
          .keyboardShortcut(.cancelAction).accessibilityLabel("Close")
      }
      .padding(.bottom, -22)
      VStack(spacing: 8) {
        Image("AppLogo").resizable().frame(width: 80, height: 80)
        Text("Welcome to KKaraoke").font(.system(size: 28, weight: .bold)).tracking(-0.5)
        Text("Synced lyrics, vocal removal, and friends on the mic.").font(.system(size: 13))
          .foregroundStyle(.secondary)
      }.frame(maxWidth: .infinity)
      VStack(alignment: .leading, spacing: 8) {
        Text("Nickname").font(.callout.weight(.medium))
        TextField("What should we call you?", text: $nickname).webInput(height: 44)
          .onChange(of: nickname) { _, value in nickname = String(value.prefix(24)) }
      }
      VStack(alignment: .leading, spacing: 12) {
        Text("Avatar").font(.callout.weight(.medium))
        LazyVGrid(
          columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 6), spacing: 10
        ) {
          ForEach(RoomModel.avatars, id: \.self) { value in
            Button {
              avatar = value
            } label: {
              UserAvatar(
                avatar: value,
                name: value.split(separator: "/").last?.replacingOccurrences(of: ".svg", with: "")
                  ?? "Avatar", size: 48
              )
              .overlay {
                Circle().strokeBorder(avatar == value ? AppTheme.accent : .clear, lineWidth: 2)
              }
            }
            .buttonStyle(.plain).stableCursor(.link).accessibilityAddTraits(avatar == value ? .isSelected : [])
          }
        }
      }
      VStack(alignment: .leading, spacing: 8) {
        Text("Room code").font(.callout.weight(.medium))
        TextField("", text: $code).webInput(height: 44).font(
          .system(.body, design: .monospaced)
        )
        .onChange(of: code) { _, value in
          code = String(value.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(8))
        }
        .onSubmit(join)
        Text(room.message ?? tr("Optional. Enter the code shown on the TV to join that room."))
          .font(.caption).foregroundStyle(room.message == nil ? Color.secondary : .red)
      }
      Button(action: join) {
        HStack {
          Spacer()
          if joining { ProgressView().controlSize(.mini) }
          Text("Start singing")
          Spacer()
        }
      }
      .buttonStyle(WebButtonStyle(height: 44)).disabled(
        nickname.trimmingCharacters(in: .whitespaces).isEmpty || avatar.isEmpty || joining)
      if app.auth.isEnabled {
        Button("Have an account? Sign in", action: onLogin).buttonStyle(.plain).stableCursor(.link).font(.callout)
          .foregroundStyle(.secondary).frame(maxWidth: .infinity)
      }
    }
    .padding(32).frame(width: 448).background(AppTheme.card).preferredColorScheme(.dark).tint(
      AppTheme.accent
    )
    .onAppear {
      nickname = room.name
      avatar = room.avatar
    }
  }

  private func join() {
    let name = nickname.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty, !avatar.isEmpty, !joining else { return }
    room.name = name
    room.avatar = avatar
    if code.isEmpty {
      onClose()
      return
    }
    joining = true
    Task {
      if await room.join(code: code) { onClose() }
      joining = false
    }
  }
}

/// A strip above the player while this Mac is only a remote.
struct RoomBanner: View {
  @Environment(RoomModel.self) private var room

  var body: some View {
    if room.isGuest {
      HStack(spacing: 10) {
        LucideIcon("antenna.radiowaves.left.and.right")
        Text("You are in a jam session").font(.callout)
        Spacer()
        Text("\(room.participants.count) in the room").font(.caption).foregroundStyle(
          .white.opacity(0.8))
        Button("Leave") { room.leave() }.buttonStyle(.borderless).foregroundStyle(.white).bold()
      }
      .padding(.horizontal, 24).padding(.vertical, 8)
      .foregroundStyle(.white).background(AppTheme.accent)
    } else if room.socketState == .disconnected {
      HStack(spacing: 10) {
        LucideIcon("wifi.exclamationmark")
        Text("Reconnecting to the room…").font(.callout)
        Spacer()
      }
      .padding(.horizontal, 24).padding(.vertical, 6).background(.orange.opacity(0.9))
      .foregroundStyle(.white)
    }
  }
}
