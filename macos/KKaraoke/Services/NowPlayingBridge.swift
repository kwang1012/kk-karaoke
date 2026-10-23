import AppKit
import MediaPlayer

/// The system's media controls: the play, next and previous keys on the keyboard and headphones, and the Now Playing
/// widget in Control Center, which shows the song and lets you scrub it.
@MainActor
final class NowPlayingBridge {
    private weak var player: PlayerModel?
    private var timer: Task<Void, Never>?
    private var shown: (id: String?, playing: Bool, duration: Double)?
    private var lastSet: (at: Double, elapsed: Double)?
    private var artwork: (id: String, image: NSImage)?
    private var artworkTask: Task<Void, Never>?

    /// The widget's dictionary for a song. `elapsed` and `playing` let the system keep the time itself between updates.
    nonisolated static func info(title: String, artist: String, album: String?, duration: Double, elapsed: Double,
                                 playing: Bool) -> [String: Any] {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: artist,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: max(0, elapsed),
            MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: 1.0,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
        ]
        if let album, !album.isEmpty { info[MPMediaItemPropertyAlbumTitle] = album }
        if duration > 0 { info[MPMediaItemPropertyPlaybackDuration] = duration }
        return info
    }

    func start(player: PlayerModel) {
        self.player = player
        registerCommands()
        timer = Task { [weak self] in
            while !Task.isCancelled {
                self?.refresh()
                try? await Task.sleep(for: .milliseconds(500))
            }
        }
    }

    private func registerCommands() {
        let center = MPRemoteCommandCenter.shared()
        // Each handler only hops to the main actor: the system calls it on a queue of its own.
        func hop(_ action: @escaping @MainActor (PlayerModel) -> Void) -> @Sendable () -> Void {
            { [weak self] in Task { @MainActor in if let player = self?.player { action(player) } } }
        }
        Self.register(center.playCommand, hop { $0.perform(.play) })
        Self.register(center.pauseCommand, hop { $0.perform(.pause) })
        Self.register(center.togglePlayPauseCommand, hop { $0.toggle() })
        Self.register(center.nextTrackCommand, hop { $0.perform(.next) })
        Self.register(center.previousTrackCommand, hop { $0.perform(.previous) })
        Self.registerSeek(center.changePlaybackPositionCommand) { [weak self] position in
            Task { @MainActor in self?.player?.seek(to: position) }
        }
    }

    // These are not main-actor isolated on purpose: a closure written inside an isolated method would trap when MediaPlayer
    // calls it from its own queue (a dispatch assertion) instead of running.
    nonisolated private static func register(_ command: MPRemoteCommand, _ action: @escaping @Sendable () -> Void) {
        command.isEnabled = true
        command.addTarget { _ in action(); return .success }
    }

    nonisolated private static func registerSeek(_ command: MPChangePlaybackPositionCommand, _ action: @escaping @Sendable (Double) -> Void) {
        command.isEnabled = true
        command.addTarget { event in
            guard let position = (event as? MPChangePlaybackPositionCommandEvent)?.positionTime else { return .commandFailed }
            action(position)
            return .success
        }
    }

    /// Updates the widget when the song or state changed, or the time drifted from what the system extrapolates.
    private func refresh() {
        guard let player else { return }
        let center = MPNowPlayingInfoCenter.default()
        guard let track = player.track, case .ready = player.status else {
            if shown != nil { center.nowPlayingInfo = nil; center.playbackState = .stopped; shown = nil }
            return
        }
        let state = (id: Optional(track.queueID), playing: player.isPlaying, duration: player.duration)
        let now = ProcessInfo.processInfo.systemUptime
        if let shown, let lastSet, shown.id == state.id, shown.playing == state.playing, shown.duration == state.duration,
           Self.drift(elapsedWhenSet: lastSet.elapsed, setAt: lastSet.at, now: now, playing: state.playing, actual: player.currentTime) < 1 {
            return
        }
        var info = Self.info(title: track.name, artist: track.artistText, album: track.album?.name, duration: player.duration,
                             elapsed: player.currentTime, playing: player.isPlaying)
        if let artwork, artwork.id == track.id { info[MPMediaItemPropertyArtwork] = Self.artwork(artwork.image) }
        center.nowPlayingInfo = info
        center.playbackState = player.isPlaying ? .playing : .paused
        if shown?.id != state.id { loadArtwork(for: track) }
        shown = state
        lastSet = (now, player.currentTime)
    }

    /// How far the time the system would show (it advances the elapsed time by itself while playing) is from the real one, in seconds.
    nonisolated static func drift(elapsedWhenSet: Double, setAt: Double, now: Double, playing: Bool, actual: Double) -> Double {
        abs(actual - (elapsedWhenSet + (playing ? now - setAt : 0)))
    }

    private func loadArtwork(for track: Track) {
        artworkTask?.cancel()
        guard let url = track.artworkURL else { return }
        artworkTask = Task {
            guard let (data, _) = try? await URLSession.shared.data(from: url), !Task.isCancelled, let image = NSImage(data: data) else { return }
            artwork = (track.id, image)
            guard player?.track?.id == track.id else { return }
            var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
            info[MPMediaItemPropertyArtwork] = Self.artwork(image)
            MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        }
    }

    /// Not main-actor isolated on purpose: MediaPlayer calls the handler on its own queue, and a closure written inside an
    /// isolated function would trap there (a dispatch assertion) instead of running.
    nonisolated static func artwork(_ image: NSImage) -> MPMediaItemArtwork {
        nonisolated(unsafe) let image = image
        return MPMediaItemArtwork(boundsSize: image.size) { _ in image }
    }
}
