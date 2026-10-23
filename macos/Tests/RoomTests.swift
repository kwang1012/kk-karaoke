import Foundation
import JavaScriptCore
import Testing
@testable import KKaraoke

@MainActor
struct VideoSynchronizationTests {
    private func context() throws -> JSContext {
        let context = try #require(JSContext())
        context.evaluateScript("""
        var seeks = [], plays = 0, pauses = 0;
        var window = { webkit: { messageHandlers: { failed: { postMessage: function() {} } } } };
        var YT = { Player: function(id, options) {
          this.events = options.events;
          this.state = -1;
          this.time = 0;
          this.mute = function() {};
          this.getPlayerState = function() { return this.state; };
          this.getCurrentTime = function() { return this.time; };
          // Seeking buffers asynchronously; the old position remains until frames arrive.
          this.seekTo = function(t) { seeks.push(t); this.state = 3; };
          this.playVideo = function() { plays++; this.state = 3; };
          this.pauseVideo = function() { pauses++; this.state = 2; };
        } };
        """)
        let html = VideoWebView.page("fixture")
        let script = try #require(html.components(separatedBy: "<script>").last?.components(separatedBy: "</script>").first)
        context.evaluateScript(script)
        #expect(context.exception == nil)
        return context
    }

    @Test func bufferingIsNotRestartedOnEveryAudioTick() throws {
        let js = try context()
        js.evaluateScript("sync(10, true, 0); onYouTubeIframeAPIReady(); player.events.onReady();")
        #expect(js.evaluateScript("seeks.length")?.toInt32() == 1)
        js.evaluateScript("sync(10.5, true, 0); sync(11, true, 0); sync(11.5, true, 0);")
        #expect(js.evaluateScript("seeks.length")?.toInt32() == 1)
        // An explicit user seek may interrupt the existing buffer once.
        js.evaluateScript("sync(40, true, 1); sync(40.5, true, 1);")
        #expect(js.evaluateScript("seeks.length")?.toInt32() == 2)
        #expect(js.evaluateScript("seeks[1]")?.toDouble() == 40)
        js.evaluateScript("player.time = 40.5; player.state = 1; sync(40.5, true, 1);")
        #expect(js.evaluateScript("seeks.length")?.toInt32() == 2)
        #expect(js.exception == nil)
    }

    @Test func pausedAudioAllowsOneMutedBufferThenHoldsTheFrame() throws {
        let js = try context()
        js.evaluateScript("sync(0, false, 0); onYouTubeIframeAPIReady(); player.events.onReady();")
        #expect(js.evaluateScript("plays")?.toInt32() == 1)
        #expect(js.evaluateScript("pauses")?.toInt32() == 0)
        js.evaluateScript("player.state = 1; player.events.onStateChange({data: 1});")
        #expect(js.evaluateScript("pauses")?.toInt32() == 1)
        #expect(js.exception == nil)
    }
}

struct SocketMessageTests {
    private func object(_ message: SocketMessage) throws -> [String: Any] {
        try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(message)) as? [String: Any])
    }

    @Test func joinCarriesTheUserAsTheServerReadsIt() throws {
        let json = try object(.join(room: "r1", user: User(id: "u", name: "Kai", avatar: "/avatars/cat.svg")))
        #expect(json["type"] as? String == "join")
        #expect(json["roomId"] as? String == "r1")
        let data = try #require(json["data"] as? [String: Any])
        #expect(data["id"] as? String == "u" && data["name"] as? String == "Kai" && data["avatar"] as? String == "/avatars/cat.svg")
        #expect(json["action"] == nil) // unset fields stay out of the message
    }

    @Test func controlsUseTheWebAppsNames() throws {
        let json = try object(.control("seek", room: "r1", data: .object(["seekTime": .number(42)])))
        #expect(json["type"] as? String == "jam" && json["action"] as? String == "control" && json["op"] as? String == "seek")
        #expect((json["data"] as? [String: Any])?["seekTime"] as? Double == 42)
    }

    @Test func updatesCanBeForced() throws {
        let json = try object(.update(room: "r1", force: true, ["currentTime": .number(1.5), "playing": .bool(true)]))
        #expect(json["force"] as? Bool == true)
        #expect(try object(.update(room: "r1", ["playing": .bool(false)]))["force"] == nil)
    }

    @Test func decodesWhatTheServerSends() throws {
        let text = #"{"type":"jam","action":"update","roomId":"r","data":{"currentTime":12.5,"playing":true,"queueIdx":2,"x":null,"list":[1,"a"]}}"#
        let message = try JSONDecoder().decode(SocketMessage.self, from: Data(text.utf8))
        #expect(message.action == "update" && message.roomId == "r")
        #expect(message.data?["currentTime"]?.double == 12.5)
        #expect(message.data?["playing"]?.bool == true)
        #expect(message.data?["queueIdx"]?.int == 2)
        #expect(message.data?["x"] == .null)
        #expect(message.data?["list"]?.array?.count == 2)
    }

    @Test func jsonDecodesToModels() throws {
        let text = #"{"participant":{"id":"u","name":"Kai","avatar":"a"}}"#
        let json = try JSONDecoder().decode(JSON.self, from: Data(text.utf8))
        #expect(json["participant"]?.decoded(User.self) == User(id: "u", name: "Kai", avatar: "a"))
    }

    @Test func backoffDoublesAndIsCapped() {
        #expect(RoomSocket.backoff(attempt: 0, jitter: 0) == 1)
        #expect(RoomSocket.backoff(attempt: 3, jitter: 0) == 8)
        #expect(RoomSocket.backoff(attempt: 10, jitter: 0) == 30)
        #expect(RoomSocket.backoff(attempt: 10, jitter: 0.5) == 30.5)
    }

    @Test func socketURLFollowsTheAPIAddress() {
        #expect(APIClient(baseURL: URL(string: "http://localhost:8000")!).socketURL?.absoluteString == "ws://localhost:8000/ws")
        #expect(APIClient(baseURL: URL(string: "https://kkaraoke.example/api")!).socketURL?.absoluteString == "wss://kkaraoke.example/api/ws")
    }
}

@MainActor
struct RoomModelTests {
    private func makeRoom() -> (RoomModel, PlayerModel) {
        let suite = "test.room.\(UUID().uuidString)"
        let room = RoomModel(defaults: UserDefaults(suiteName: suite)!)
        let player = PlayerModel(), singing = SingingModel()
        room.attach(player: player, singing: singing) { nil } // no server: only what the messages alone decide
        return (room, player)
    }

    private func queue(_ count: Int) -> QueueSnapshot {
        QueueSnapshot(tracks: (0..<count).map { Track(id: "t\($0)", name: "Song \($0)", timeAdded: $0 + 1) }, index: 0)
    }

    @Test func identityIsKept() {
        let suite = "test.room.id.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let first = RoomModel(defaults: defaults)
        first.name = "Kai"
        let second = RoomModel(defaults: defaults)
        #expect(second.userId == first.userId && second.name == "Kai")
        #expect(second.activeRoomId == second.userId && !second.isGuest)
    }

    @Test func theQueueSplitsIntoCurrentAndUpcoming() {
        let (room, _) = makeRoom()
        room.apply(queue: queue(4))
        #expect(room.currentTrack?.id == "t0")
        #expect(room.upcoming.map(\.id) == ["t1", "t2", "t3"])
        room.apply(queue: QueueSnapshot(tracks: queue(4).tracks, index: 3))
        #expect(room.currentTrack?.id == "t3" && room.upcoming.isEmpty)
        room.apply(queue: QueueSnapshot(tracks: [], index: -1))
        #expect(room.currentTrack == nil)
    }

    @Test func aBadIndexIsKeptInRange() {
        let (room, _) = makeRoom()
        room.apply(queue: QueueSnapshot(tracks: queue(2).tracks, index: 9))
        #expect(room.queueIdx == 1)
    }

    @Test func notifyMessagesShowProgressInTheQueue() {
        let (room, _) = makeRoom()
        room.apply(queue: queue(2))
        let notify = SocketMessage(type: "notify", data: .object([
            "track": .object(["id": .string("t1")]), "status": .string("separating"), "value": .number(30), "total": .number(60),
        ]))
        room.receive(notify)
        #expect(room.queue[1].status == "separating")
        #expect(room.queue[1].progress == 0.5)
        #expect(room.queue[0].status == nil)
        #expect(SongStage(status: room.queue[1].status, progress: room.queue[1].progress) == .working("separating", 0.5))
        #expect(SongStage(status: "ready", progress: nil) == .ready)
    }

    @Test func aPhonesPitchIsGoodOnlyForAMoment() {
        let (room, _) = makeRoom()
        #expect(room.remotePitchHz() == nil && !room.remoteSingingActive())
        room.receive(SocketMessage(type: "jam", action: "pitch", roomId: room.userId, data: .object(["hz": .number(220)])))
        #expect(room.remotePitchHz() == 220)
        #expect(room.remoteSingingActive())
        let later = ProcessInfo.processInfo.systemUptime
        #expect(room.remotePitchHz(now: later + 0.5) == nil) // a note ago: silence
        #expect(room.remoteSingingActive(now: later + 1)) // but somebody is still singing
        #expect(!room.remoteSingingActive(now: later + 3))
    }

    @Test func messagesForAnotherRoomAreIgnored() {
        let (room, _) = makeRoom()
        room.receive(SocketMessage(type: "jam", action: "pitch", roomId: "someone-else", data: .object(["hz": .number(300)])))
        #expect(room.remotePitchHz() == nil)
    }
}

@MainActor
struct PlayerControlTests {
    @Test func aFollowerPassesControlsOnInsteadOfDoingThem() {
        let player = PlayerModel()
        var sent: [PlayerModel.Control] = []
        player.onControl = { sent.append($0) }
        player.setFollower(true)
        player.perform(.seek(30))
        player.perform(.next)
        #expect(sent == [.seek(30), .next])
        #expect(player.isFollower && !player.isPlaying)
    }

    @Test func aFollowerShowsTheOwnersClock() {
        let player = PlayerModel()
        player.setFollower(true)
        player.applyRemote(time: 10, playing: false, duration: 200)
        #expect(player.currentTime == 10 && player.duration == 200)
        player.applyRemote(time: 190, playing: true)
        #expect(player.isPlaying)
        #expect(player.currentTime >= 190 && player.currentTime <= 200)
        player.applyRemote(volume: 0.4, vocalOn: true, guideLevel: 0.7)
        #expect(player.masterVolume == 0.4 && player.vocalOn && player.vocalVolume == 0.7)
    }

    @Test func controlsFromTheRoomAreNotSentBack() {
        let player = PlayerModel()
        var sent: [PlayerModel.Control] = []
        player.onControl = { sent.append($0) }
        player.perform(.volume(0.5), fromRemote: true)
        #expect(player.masterVolume == 0.5)
        #expect(sent.isEmpty)
        player.perform(.volume(0.6)) // done here: the room hears about it
        #expect(sent.contains(.volume(0.6)))
    }

    @Test func remoteLevelsDoNotOverwriteThisMacsSavedMix() {
        // the tests run inside the app's own container: put back whatever mix the person had saved
        let key = "vocalVolume"
        let saved = UserDefaults.standard.object(forKey: key)
        defer { UserDefaults.standard.set(saved, forKey: key) }
        UserDefaults.standard.set(0.25, forKey: key)
        let player = PlayerModel()
        player.setFollower(true)
        player.applyRemote(guideLevel: 0.9)
        #expect(UserDefaults.standard.double(forKey: key) == 0.25)
    }
}
