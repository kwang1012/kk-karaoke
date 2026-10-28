import Foundation
import Testing
@testable import KKaraoke

struct DuetTests {
    @Test func aSamplePutsTheServerTimeAtTheMiddleOfTheRoundTrip() {
        // sent at 1000, answered at 1100 by a server whose clock reads 5050 at that moment (50 ms in): offset 4000
        #expect(ClockSync.sample(sentAt: 1000, serverTime: 5050, receivedAt: 1100) == .init(offset: 4000, rtt: 100))
    }

    @Test func theSampleWithTheShortestRoundTripWins() {
        var clock = ClockSync()
        clock.add(.init(offset: 4100, rtt: 300))
        clock.add(.init(offset: 4002, rtt: 20))
        clock.add(.init(offset: 3900, rtt: 150))
        #expect(clock.offset == 4002)
        #expect(clock.rtt == 20)
    }

    @Test func oldSamplesAgeOutSoADriftingClockIsFollowed() {
        var clock = ClockSync(keep: 2)
        clock.add(.init(offset: 100, rtt: 5))
        clock.add(.init(offset: 200, rtt: 10))
        clock.add(.init(offset: 210, rtt: 12))
        #expect(clock.offset == 200)
    }

    @Test func convertsBetweenLocalAndServerTimeAndIgnoresBadSamples() {
        var clock = ClockSync()
        clock.add(.init(offset: .nan, rtt: 10))
        clock.add(.init(offset: 5, rtt: -1))
        #expect(!clock.isSynced)
        clock.add(.init(offset: 4000, rtt: 20))
        #expect(clock.serverMs(forLocal: 1000) == 5000)
        #expect(clock.localMs(forServer: 5000) == 1000)
    }

    @Test func aDuetIsReadFromAMessageAndNotFromAnEmptyOrMalformedOne() {
        let message = JSON.object(["trackId": .string("t"), "from": .number(30), "startAt": .number(9000)])
        #expect(DuetStart(message: message) == DuetStart(trackId: "t", from: 30, startAt: 9000))
        #expect(DuetStart(message: .object(["trackId": .string("t"), "startAt": .number(9)]))?.from == 0)
        #expect(DuetStart(message: nil) == nil)
        #expect(DuetStart(message: .object([:])) == nil) // a stop
        #expect(DuetStart(trackId: "", from: 0, startAt: 9) == nil)
        #expect(DuetStart(trackId: "t", from: -1, startAt: 9) == nil)
        #expect(DuetStart(trackId: "t", from: 0, startAt: 0) == nil) // a snapshot with no duet
    }

    @Test func theSongWaitsAtItsStartPositionUntilTheSharedStartThenRunsWithTheClock() throws {
        let duet = try #require(DuetStart(trackId: "t", from: 10, startAt: 5000))
        #expect(duet.position(atServerMs: 3000) == 10)
        #expect(duet.position(atServerMs: 5000) == 10)
        #expect(duet.position(atServerMs: 7500) == 12.5)
    }

    @Test func aStartInTheFutureIsScheduledAheadWithOutputLatencyAndTheListenersOffsetTakenOff() throws {
        var clock = ClockSync()
        clock.add(.init(offset: 1000, rtt: 2)) // the server is 1 s ahead of this Mac
        let duet = try #require(DuetStart(trackId: "t", from: 5, startAt: 12_000)) // 11 s on this Mac's clock
        let start = DuetPlan.plan(duet, clock: clock, nowUptime: 10, outputLatency: 0)
        #expect(start == .init(position: 5, lead: 1))
        #expect(abs(DuetPlan.plan(duet, clock: clock, nowUptime: 10, outputLatency: 0.1).lead - 0.9) < 1e-9)
        #expect(abs(DuetPlan.plan(duet, clock: clock, nowUptime: 10, outputLatency: 0, earlyMs: 300).lead - 0.7) < 1e-9)
        #expect(abs(DuetPlan.plan(duet, clock: clock, nowUptime: 10, outputLatency: 0, earlyMs: -300).lead - 1.3) < 1e-9)
    }

    @Test func aStartThatHasPassedJoinsTheSongWhereItWillBeByThen() throws {
        var clock = ClockSync()
        clock.add(.init(offset: 0, rtt: 2))
        let duet = try #require(DuetStart(trackId: "t", from: 30, startAt: 8000)) // 8 s on this Mac's clock
        let start = DuetPlan.plan(duet, clock: clock, nowUptime: 10, outputLatency: 0) // two seconds late
        #expect(abs(start.lead - 0.1) < 1e-9)
        #expect(abs(start.position - 32.1) < 1e-9) // 2 s late, plus the 0.1 s before the audio can start
    }

    @Test func aStartTooSoonToScheduleStillWaitsTheMinimum() throws {
        var clock = ClockSync()
        clock.add(.init(offset: 0, rtt: 2))
        let duet = try #require(DuetStart(trackId: "t", from: 0, startAt: 10_050)) // 50 ms ahead
        let start = DuetPlan.plan(duet, clock: clock, nowUptime: 10, outputLatency: 0)
        #expect(abs(start.lead - 0.1) < 1e-9)
        #expect(abs(start.position - 0.05) < 1e-9)
    }
}

@MainActor
struct DuetRoomTests {
    private func makeRoom() -> (RoomModel, PlayerModel) {
        let room = RoomModel(defaults: UserDefaults(suiteName: "test.duet.\(UUID().uuidString)")!)
        let player = PlayerModel(), singing = SingingModel()
        room.attach(player: player, singing: singing) { nil } // no server: only what the messages alone decide
        return (room, player)
    }

    private func object(_ message: SocketMessage) throws -> [String: Any] {
        try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(message)) as? [String: Any])
    }

    @Test func aDuetMessageStartsADuetHereAndAStopEndsIt() {
        let (room, _) = makeRoom()
        room.receive(SocketMessage(type: "jam", action: "duet", op: "start",
                                   data: .object(["trackId": .string("t1"), "from": .number(12), "startAt": .number(9000)])))
        #expect(room.duet == DuetStart(trackId: "t1", from: 12, startAt: 9000))
        room.receive(SocketMessage(type: "jam", action: "duet", op: "stop"))
        #expect(room.duet == nil)
    }

    @Test func aMalformedDuetStartIsIgnored() {
        let (room, _) = makeRoom()
        room.receive(SocketMessage(type: "jam", action: "duet", op: "start", data: .object(["from": .number(12)])))
        #expect(room.duet == nil)
    }

    @Test func inADuetTheRoomsOwnUpdatesAreIgnoredSoTheSharedClockRules() {
        let (room, player) = makeRoom()
        room.receive(SocketMessage(type: "jam", action: "player", data: .object(["deviceId": .string("another-device")])))
        room.receive(SocketMessage(type: "jam", action: "duet", op: "start",
                                   data: .object(["trackId": .string("t1"), "from": .number(0), "startAt": .number(9000)])))
        room.receive(SocketMessage(type: "jam", action: "update", data: .object(["currentTime": .number(42), "playing": .bool(true)])))
        #expect(!player.isPlaying) // outside a duet, the same update starts a follower's clock
    }

    @Test func aClockAnswerNoPingWasSentForIsIgnored() {
        let (room, _) = makeRoom()
        room.receive(SocketMessage(type: "clock", id: "9", serverTime: 1_793_170_964_588.8))
        #expect(!room.clock.isSynced)
    }

    @Test func theClockAndDuetMessagesUseTheServersNames() throws {
        let ping = try object(.clockPing(id: "3"))
        #expect(ping["type"] as? String == "clock" && ping["id"] as? String == "3" && ping["action"] == nil)
        let start = try object(.duetStart(room: "r1", trackId: "t1", from: 30))
        #expect(start["action"] as? String == "duet" && start["op"] as? String == "start" && start["roomId"] as? String == "r1")
        #expect((start["data"] as? [String: Any])?["trackId"] as? String == "t1")
        #expect((start["data"] as? [String: Any])?["from"] as? Double == 30)
        #expect(try object(.duetStop(room: "r1"))["op"] as? String == "stop")
    }

    @Test func decodesTheServersClockAnswer() throws {
        let text = #"{"type":"clock","id":"7","serverTime":1793170964588.829}"#
        let message = try JSONDecoder().decode(SocketMessage.self, from: Data(text.utf8))
        #expect(message.type == "clock" && message.id == "7" && message.serverTime == 1_793_170_964_588.829)
    }

    @Test func aRoomSnapshotCarriesTheDuetItRemembers() throws {
        func info(_ json: String) throws -> RoomInfo { try JSONDecoder().decode(RoomInfo.self, from: Data(json.utf8)) }
        let running = try info(#"{"duetTrack":"t1","duetFrom":30,"duetAt":1793170964588.8}"#)
        #expect(running.duet == DuetStart(trackId: "t1", from: 30, startAt: 1_793_170_964_588.8))
        #expect(try info(#"{"duetTrack":null,"duetFrom":0,"duetAt":0}"#).duet == nil) // stopped
        #expect(try info(#"{"playing":true}"#).duet == nil) // an older server
    }
}
