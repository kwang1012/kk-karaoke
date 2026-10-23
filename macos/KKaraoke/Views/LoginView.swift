import SwiftUI

struct LoginView: View {
  @Environment(AppModel.self) private var app
  @State private var email = ""
  @State private var password = ""
  @FocusState private var emailFocused: Bool
  var onClose: () -> Void

  var body: some View {
    VStack(spacing: 20) {
      HStack {
        Spacer()
        Button(action: onClose) { LucideIcon("x", size: 16) }
          .buttonStyle(WebIconButtonStyle()).keyboardShortcut(.cancelAction).accessibilityLabel(
            "Close")
      }.padding(.bottom, -20)
      VStack(spacing: 12) {
        Image("AppLogo").resizable().frame(width: 56, height: 56)
        Text("Sign in").font(.system(size: 20, weight: .semibold))
        Text(
          app.auth.reason == .addSong
            ? "This song hasn't been processed yet. Sign in to add it, or join a room to add songs there."
            : "Sign in to start a room and add new songs. Joining a room only needs its code."
        )
        .font(.system(size: 13)).foregroundStyle(.secondary).multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
      }
      if let session = app.auth.session, app.auth.accessToken != nil {
        Text("Signed in as \(session.user.email ?? "host")").font(.callout)
        Button(action: onClose) { Text("Done").frame(maxWidth: .infinity) }.buttonStyle(
          WebButtonStyle(height: 44))
        Button("Sign out") { app.auth.signOut() }.buttonStyle(.plain).stableCursor(.link).foregroundStyle(.secondary)
      } else {
        VStack(spacing: 12) {
          TextField("Email", text: $email).textContentType(.emailAddress).focused($emailFocused)
            .webInput()
          SecureField("Password", text: $password).textContentType(.password)
            .webInput().onSubmit(signIn)
          Button(action: signIn) {
            HStack {
              Spacer()
              if app.auth.sending { ProgressView().controlSize(.mini) }
              Text("Sign in")
              Spacer()
            }
          }
          .buttonStyle(WebButtonStyle(height: 44)).disabled(
            email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.isEmpty
              || app.auth.sending)
          if let message = app.auth.error {
            Text(message).font(.caption).foregroundStyle(.red).multilineTextAlignment(.center)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
      }
    }
    .padding(32).frame(width: 448).background(AppTheme.card).preferredColorScheme(.dark).tint(
      AppTheme.accent
    )
    .onAppear { emailFocused = true }
    .onDisappear {
      password = ""
      if app.auth.showLogin { app.auth.cancelLogin() }
    }
  }

  private func signIn() {
    guard !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !password.isEmpty,
      !app.auth.sending
    else { return }
    let enteredEmail = email
    let enteredPassword = password
    password = ""
    Task { await app.auth.signIn(email: enteredEmail, password: enteredPassword) }
  }
}
