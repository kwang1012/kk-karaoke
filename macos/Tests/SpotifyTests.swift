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
