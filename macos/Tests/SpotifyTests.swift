import Foundation
import Testing

@testable import KKaraoke

@MainActor
struct SpotifyTests {
  @Test func spotifysAnnouncementIsRead() {
    let info: [AnyHashable: Any] = [
      "Player State": "Playing", "Track ID": "spotify:track:abc", "Name": "Song", "Artist": "Someone", "Duration": 215000,
    ]
    let event = SpotifyEvent(userInfo: info)
    #expect(event?.state == .playing)
    #expect(event?.track == SpotifyTrack(id: "spotify:track:abc", name: "Song", artist: "Someone"))
  }

  @Test func aStoppedSpotifyHasNoSong() {
    let event = SpotifyEvent(userInfo: ["Player State": "Stopped"])
    #expect(event?.state == .stopped && event?.track == nil)
    #expect(SpotifyEvent(userInfo: ["Player State": "Dancing"]) == nil)
    #expect(SpotifyEvent(userInfo: nil) == nil)
  }

  @Test func followingSpotifyHasNoQueueOfItsOwn() {
    let room = RoomModel(defaults: UserDefaults(suiteName: "test.room.\(UUID().uuidString)")!)
    room.attach(player: PlayerModel(), singing: SingingModel()) { nil }
    room.apply(queue: QueueSnapshot(tracks: [Track(id: "a", name: "A", timeAdded: 1), Track(id: "b", name: "B", timeAdded: 2)], index: 0))
    #expect(room.currentTrack?.id == "a" && room.upcoming.count == 1)
    room.followSpotify(true)
    #expect(room.currentTrack == nil && room.upcoming.isEmpty)
    room.setSpotifySong(Track(id: "s", name: "From Spotify"))
    #expect(room.currentTrack?.id == "s" && room.upcoming.isEmpty)
    room.apply(queue: QueueSnapshot(tracks: [Track(id: "c", name: "C", timeAdded: 3)], index: 0)) // the room's queue changes: ignored
    #expect(room.currentTrack?.id == "s")
    room.followSpotify(false)
    #expect(room.currentTrack?.id == "c")
  }

  @Test func whenOffNothingIsTakenOver() {
    let suite = UserDefaults(suiteName: "test.spotify.\(UUID().uuidString)")!
    let takeover = SpotifyTakeover(defaults: suite)
    #expect(!takeover.isEnabled && takeover.status == .off)
    takeover.heard(SpotifyEvent(state: .playing, track: SpotifyTrack(id: "x", name: "Song", artist: "A")))
    #expect(takeover.status == .off)
  }

  @Test func theRoomAsksWhatDecidesTheNextSongWhenOneEnds() {
    let room = RoomModel(defaults: UserDefaults(suiteName: "test.room.\(UUID().uuidString)")!)
    let player = PlayerModel()
    room.attach(player: player, singing: SingingModel()) { nil }
    var asked: [Track?] = []
    room.nextOverride = { asked.append($0); return true }
    player.onEnded?()
    #expect(asked.count == 1)
  }
}

@MainActor
struct SpotifyWebTests {
  @Test func theProofKeyMatchesTheRFCExample() {
    // RFC 7636, appendix B
    #expect(SpotifyPKCE.challenge(for: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    #expect(SpotifyPKCE.verifier().count >= 43)
  }

  @Test func theSignInPageAsksForPlaybackStateWithTheProofKey() {
    let url = SpotifyWebAuth().authorizationURL(verifier: "v", state: "s")
    let query = URLComponents(url: url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
    func value(_ name: String) -> String? { query.first { $0.name == name }?.value }
    #expect(url?.host == "accounts.spotify.com")
    #expect(value("redirect_uri") == "kkaraoke://spotify" && value("code_challenge_method") == "S256" && value("state") == "s")
    #expect(value("scope")?.contains("user-read-playback-state") == true)
  }

  @Test func theQueueKeepsOnlyTracks() {
    let json = """
      {"currently_playing": {"uri": "spotify:track:now"}, "queue": [
        {"type": "track", "uri": "spotify:track:a", "name": "A", "artists": [{"name": "X"}, {"name": "Y"}]},
        {"type": "episode", "uri": "spotify:episode:e", "name": "Talk", "artists": []},
        {"type": "track", "uri": "spotify:track:b", "name": "B", "artists": [{"name": "Z"}]}]}
      """
    let queue = SpotifyWebAuth.parseQueue(Data(json.utf8))
    #expect(queue.map(\.id) == ["spotify:track:a", "spotify:track:b"])
    #expect(queue.first?.artist == "X, Y")
  }

  @Test func aLinkFromSomewhereElseIsNotTheSignIn() {
    let auth = SpotifyWebAuth()
    #expect(!auth.handle(URL(string: "https://example.com")!))
    #expect(auth.handle(URL(string: "kkaraoke://spotify?code=x&state=unknown")!)) // ours to read, but not a sign-in we started
    #expect(!auth.isConnecting && auth.message == nil) // nothing was started, so a stranger's code changes nothing
  }
}
