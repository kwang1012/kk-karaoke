import Foundation
import Testing
@testable import KKaraoke

struct LyricsNavigationTests {
    @Test func lyricsButtonTogglesAndRestoresCollectionHistory() {
        var navigation = AppNavigation()
        navigation.navigate(.library)
        let album = Collection(id: "album", name: "Album", type: "album")
        let next = Collection(id: "next", name: "Next")
        navigation.location.path = [album]
        navigation.location.forwardPath = [next]
        navigation.toggleLyrics()
        #expect(navigation.lyricsOpen)
        #expect(navigation.location.path.isEmpty && navigation.location.forwardPath.isEmpty)
        navigation.toggleLyrics()
        #expect(!navigation.lyricsOpen && navigation.location.section == .library)
        #expect(navigation.location.path == [album] && navigation.location.forwardPath == [next])
    }

    @Test func openingLyricsAgainDoesNotLoseTheReturnPage() {
        var navigation = AppNavigation()
        navigation.navigate(.search)
        navigation.navigate(.lyrics)
        navigation.navigate(.lyrics)
        navigation.toggleLyrics()
        #expect(navigation.location.section == .search && !navigation.lyricsOpen)
    }

    @Test func openingLyricsFromANewPageUpdatesTheReturnPage() {
        var navigation = AppNavigation()
        navigation.toggleLyrics()
        navigation.navigate(.settings)
        navigation.toggleLyrics()
        navigation.toggleLyrics()
        #expect(navigation.location.section == .settings && !navigation.lyricsOpen)
    }
}

struct ModelsTests {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    @Test func trackFromSearchResult() throws {
        let track = try decode(Track.self, """
        {"id":"dQw4w9WgXcQ","videoId":"dQw4w9WgXcQ","kind":"song","name":"Song",
         "artists":[{"id":"a","name":"Artist","uri":""}],
         "album":{"id":"","name":"Album","images":[{"url":"https://x/y.jpg","width":120,"height":120}]},
         "durationMs":215000}
        """)
        #expect(track.id == "dQw4w9WgXcQ")
        #expect(track.artistText == "Artist")
        #expect(track.artworkURL?.absoluteString == "https://x/y.jpg")
        #expect(track.duration == 215)
    }

    @Test func trackToleratesMissingFields() throws {
        let track = try decode(Track.self, #"{"id":"abc","name":"Bare","artists":[{"name":"Solo"}]}"#)
        #expect(track.album == nil)
        #expect(track.artists.first?.id == "")
        #expect(track.durationMs == nil)
    }

    @Test func collectionReadsOwnerAndTotals() throws {
        let playlist = try decode(Collection.self, """
        {"id":"PL1","name":"Top","type":"playlist","images":[],"owner":{"displayName":"YouTube Music"},
         "tracks":{"total":42},"totalTracks":42}
        """)
        #expect(playlist.subtitle == "YouTube Music")
        #expect(playlist.totalTracks == 42)
        #expect(!playlist.isAlbum)
    }

    @Test func albumSubtitleIsItsArtists() throws {
        let album = try decode(Collection.self, """
        {"id":"MP1","name":"LP","type":"album","artists":[{"id":"a","name":"One"},{"id":"b","name":"Two"}]}
        """)
        #expect(album.isAlbum)
        #expect(album.subtitle == "One, Two")
    }

    @Test func clientBuildsURLs() throws {
        let client = APIClient(baseURL: URL(string: "http://localhost:8080/api")!)
        #expect(try client.url("search", query: ["q": "a b"]).absoluteString == "http://localhost:8080/api/search?q=a%20b")
        #expect(try client.stemURL(.vocal, trackId: "abc").absoluteString == "http://localhost:8080/api/tracks/vocal/abc")
    }
}
