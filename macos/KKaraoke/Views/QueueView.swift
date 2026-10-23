import SwiftUI

struct QueueView: View {
  @Environment(RoomModel.self) private var room
  @Environment(AppModel.self) private var app
  @State private var suggestionError: String?
  /// Reordering by dragging a row: it follows the pointer while the rows it passes make way.
  @State private var dragging: String?
  @State private var dragStart = 0
  @State private var dragTarget = 0
  @State private var dragDY: CGFloat = 0
  @State private var heights: [String: CGFloat] = [:]
  var onClose: () -> Void = {}
  var onInvite: () -> Void = {}
  var onSearch: () -> Void = {}

  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Text("Queue").font(.system(size: 18, weight: .semibold))
        Spacer()
        if !room.upcoming.isEmpty {
          Button("Clear") { room.clear() }.buttonStyle(.plain).stableCursor(.link).foregroundStyle(.secondary)
        }
        Button(action: onClose) { LucideIcon("x", size: 16) }
          .buttonStyle(WebIconButtonStyle()).help("Hide queue").accessibilityLabel("Hide queue")
      }
      .padding(.leading, 20).padding(.trailing, 12).padding(.top, 12).padding(.bottom, 4)
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          Text("NOW PLAYING").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
            .padding(.horizontal, 8).padding(.bottom, 4)
          Group {
            if let current = room.currentTrack {
              QueueRow(track: current, current: true)
            } else {
              HStack(spacing: 12) {
                LucideIcon("music").foregroundStyle(.secondary)
                  .frame(width: 40, height: 40).background(
                    .primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 8))
                Text("Nothing playing").font(.system(size: 14, weight: .medium))
                Spacer()
              }
              .padding(8)
            }
          }
          .background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))

          VStack(alignment: .leading, spacing: 14) {
            Text(
              room.isInJam
                ? "Your room is open. Share the QR code or link so friends can join."
                : "Invite your friends to join your room. Sing together, or just hang out."
            )
            .font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
            Button(action: onInvite) {
              Label(
                room.isInJam ? "Invite" : "Start a room",
                lucide: room.isInJam ? "user-plus" : "users-round")
            }
            .buttonStyle(WebButtonStyle(capsule: true))
          }
          .padding(16).frame(maxWidth: .infinity, alignment: .leading)
          .background(AppTheme.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
          .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(AppTheme.accent.opacity(0.2)) }
          .padding(.top, 16)

          HStack {
            Text("NEXT UP").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
            Spacer()
            if room.upcoming.count > 1 {
              Button {
                room.arrange(.shuffle)
              } label: {
                LucideIcon("shuffle", size: 16)
              }
              .buttonStyle(WebIconButtonStyle()).help("Shuffle queue").accessibilityLabel(
                "Shuffle queue")
              Button {
                room.arrange(.orderers)
              } label: {
                LucideIcon("users", size: 16)
              }
              .buttonStyle(WebIconButtonStyle()).help("Take turns").accessibilityLabel("Take turns")
            }
          }
          .padding(.horizontal, 8).padding(.top, 24).padding(.bottom, 4)

          if room.upcoming.isEmpty {
            VStack(spacing: 12) {
              Text("Nothing queued yet.").font(.system(size: 13)).foregroundStyle(.secondary)
              Button {
                surprise()
              } label: {
                Label("Surprise me", lucide: "shuffle")
              }
              .buttonStyle(WebButtonStyle())
              Button("Find a song", action: onSearch).buttonStyle(.plain).stableCursor(.link).font(.caption)
                .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 28)
            .overlay {
              RoundedRectangle(cornerRadius: 12).strokeBorder(
                .primary.opacity(0.12), style: StrokeStyle(lineWidth: 1, dash: [4]))
            }
          }
          ForEach(Array(room.upcoming.enumerated()), id: \.element.queueID) { offset, track in
            QueueRow(track: track, current: false, offset: offset)
              .background(dragging == track.queueID ? AppTheme.popover : .clear, in: RoundedRectangle(cornerRadius: 12))
              .shadow(color: .black.opacity(dragging == track.queueID ? 0.35 : 0), radius: 10, y: 4)
              .offset(y: rowOffset(offset, id: track.queueID))
              .zIndex(dragging == track.queueID ? 1 : 0)
              .animation(
                dragging == track.queueID ? nil : .snappy(duration: 0.2), value: dragTarget
              )
              .contentShape(Rectangle())
              .onGeometryChange(for: CGFloat.self) { $0.size.height } action: {
                heights[track.queueID] = $0
              }
              .simultaneousGesture(reorder(offset, id: track.queueID))
          }
          if let message = room.message ?? suggestionError {
            Text(message).font(.caption).foregroundStyle(.red).padding(8)
          }
        }
        .padding(.horizontal, 12).padding(.bottom, 8)
      }
    }
    .background(AppTheme.card)
    .thinScrollbars()
  }

  private func rowOffset(_ index: Int, id: String) -> CGFloat {
    guard let dragging else { return 0 }
    if id == dragging { return dragDY }
    let height = heights[dragging] ?? 56
    if dragStart < index, index <= dragTarget { return -height }
    if dragTarget <= index, index < dragStart { return height }
    return 0
  }

  private func reorder(_ index: Int, id: String) -> some Gesture {
    DragGesture(minimumDistance: 6, coordinateSpace: .global)
      .onChanged { drag in
        if dragging != id {
          dragging = id
          dragStart = index
          dragTarget = index
        }
        dragDY = drag.translation.height
        let steps = Int((dragDY / max(heights[id] ?? 56, 1)).rounded())
        let target = min(max(index + steps, 0), room.upcoming.count - 1)
        if target != dragTarget { dragTarget = target }
      }
      .onEnded { _ in
        guard dragging == id else { return }
        let height = heights[id] ?? 56
        let settled = CGFloat(dragTarget - dragStart) * height
        let from = dragStart, to = dragTarget
        // the list reorders now, so measure the leftover from the row's new place and ease it out
        var instant = Transaction()
        instant.disablesAnimations = true
        withTransaction(instant) {
          dragDY -= settled
          dragTarget = from
          dragStart = from
          if to != from { room.move(from: from, to: to) }
        }
        withAnimation(.snappy(duration: 0.2)) { dragDY = 0 }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) { dragging = nil }
      }
  }

  private func surprise() {
    Task {
      do {
        if let track = try await app.client?.library().randomElement() {
          room.addToQueue(track)
        } else {
          suggestionError = tr("No ready songs yet. Search for a song to get started.")
        }
      } catch { suggestionError = error.localizedDescription }
    }
  }
}

extension Track {
  var queueID: String { "\(id)-\(timeAdded ?? 0)" }
}

struct QueueRow: View {
  @Environment(RoomModel.self) private var room
  var track: Track
  var current: Bool
  var offset: Int = 0
  @State private var hovered = false

  var body: some View {
    HStack(spacing: 12) {
      Artwork(url: track.artworkURL, size: 40, radius: 8)
      VStack(alignment: .leading, spacing: 3) {
        Text(track.name).font(.system(size: 14, weight: .medium)).lineLimit(1)
        Text(track.artistText).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
        StageBadge(stage: SongStage(status: track.status, progress: track.progress))
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if let by = track.orderedBy {
        UserAvatar(avatar: by.avatar, name: by.name, size: 24).help("Added by \(by.name)")
      }
      if !current {
        AppMenu(label: "Song actions") {
          AppMenuItem(title: "Play Now", icon: "play") { room.skip(to: offset) }
          AppMenuItem(title: "Move Up", icon: "arrow-up") { room.move(from: offset, to: offset - 1) }
            .disabled(offset == 0)
          AppMenuItem(title: "Move Down", icon: "arrow-down") {
            room.move(from: offset, to: offset + 1)
          }
          .disabled(offset + 1 >= room.upcoming.count)
          AppMenuDivider()
          AppMenuItem(title: "Remove", icon: "trash-2", destructive: true) { room.remove(track) }
        }
      }
    }
    .padding(.horizontal, 8).padding(.vertical, 8)
    .background(
      hovered && !current ? Color.primary.opacity(0.04) : .clear,
      in: RoundedRectangle(cornerRadius: 12)
    )
    .onHover { hovered = $0 }
  }
}

/// Where a song that is not ready yet stands.
struct StageBadge: View {
  var stage: SongStage

  var body: some View {
    if case .working(let status, let progress) = stage {
      HStack(spacing: 6) {
        if let progress {
          ProgressView(value: progress).frame(width: 56)
        } else {
          ProgressView().controlSize(.small)
        }
        Text(Self.label(status)).font(.caption).foregroundStyle(.secondary)
      }
    }
  }

  /// The server's stage names, as words.
  static func label(_ status: String) -> String {
    switch status {
    case "submitted": tr("Waiting")
    case "downloading": tr("Downloading")
    case "separating", "processing": tr("Removing vocals")
    case "transcribing": tr("Finding lyrics")
    case "failed", "error": tr("Failed")
    default: status.capitalized
    }
  }
}
