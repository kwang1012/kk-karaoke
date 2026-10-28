import Foundation

/// How far this Mac's clock is from the server's, so every device in a room can start a song at the same moment.
/// NTP-style: a ping's round trip is split in half, and the sample with the shortest round trip (the least queueing
/// delay) is the most trustworthy. Times are milliseconds on the system-uptime clock, which never jumps.
struct ClockSync: Sendable, Equatable {
    struct Sample: Sendable, Equatable {
        var offset: Double
        var rtt: Double
    }

    private(set) var samples: [Sample] = []
    private let keep: Int

    init(keep: Int = 8) { self.keep = keep }

    /// `sentAt` and `receivedAt` are local ms; `serverTime` is the server's ms when it answered.
    static func sample(sentAt: Double, serverTime: Double, receivedAt: Double) -> Sample {
        let rtt = receivedAt - sentAt
        return Sample(offset: serverTime - (sentAt + rtt / 2), rtt: rtt)
    }

    mutating func add(_ sample: Sample) {
        guard sample.offset.isFinite, sample.rtt.isFinite, sample.rtt >= 0 else { return }
        samples = Array((samples + [sample]).suffix(keep))
    }

    var isSynced: Bool { !samples.isEmpty }

    private var best: Sample? { samples.min { $0.rtt < $1.rtt } }

    /// Server time minus local time, in ms (0 until a sample arrives).
    var offset: Double { best?.offset ?? 0 }

    /// The round trip of the best sample, in ms; the error of `offset` is at most half of it.
    var rtt: Double { best?.rtt ?? .infinity }

    func serverMs(forLocal ms: Double) -> Double { ms + offset }
    func localMs(forServer ms: Double) -> Double { ms - offset }

    /// Now, in the milliseconds the samples use.
    static var nowMs: Double { ProcessInfo.processInfo.systemUptime * 1000 }
}

/// A duet is anchored on the server's clock: the song is `from` seconds in at server time `startAt` (ms). Every device
/// derives its own position from that, so one that hears about it late, or joins halfway, still lands in step.
struct DuetStart: Sendable, Equatable {
    var trackId: String
    var from: Double
    var startAt: Double

    /// Nil unless there is a song and a start: what a stopped duet, a snapshot without one, or a bad message looks like.
    init?(trackId: String?, from: Double?, startAt: Double?) {
        guard let trackId, !trackId.isEmpty, let startAt, startAt > 0 else { return nil }
        let from = from ?? 0
        guard from >= 0, from.isFinite, startAt.isFinite else { return nil }
        self.trackId = trackId
        self.from = from
        self.startAt = startAt
    }

    /// The data of a `duet` message.
    init?(message data: JSON?) {
        self.init(trackId: data?["trackId"]?.string, from: data?["from"]?.double, startAt: data?["startAt"]?.double)
    }

    /// Seconds into the song at server time `serverMs`; before the start it waits at `from`.
    func position(atServerMs serverMs: Double) -> Double {
        from + max(0, serverMs - startAt) / 1000
    }
}

/// When to start the audio so the sound leaves the speakers at the shared moment.
enum DuetPlan {
    struct Start: Equatable {
        /// Seconds into the song to start from.
        var position: TimeInterval
        /// Seconds from now to start at.
        var lead: TimeInterval
    }

    /// The device's output latency and the listener's own `earlyMs` come off the start, so devices with different
    /// hardware still start together. Late, it starts as soon as it can (`minLead`) and joins the song where it will
    /// be by then.
    static func plan(_ duet: DuetStart, clock: ClockSync, nowUptime: TimeInterval, outputLatency: TimeInterval,
                     earlyMs: Double = 0, minLead: TimeInterval = 0.1) -> Start {
        let target = clock.localMs(forServer: duet.startAt) / 1000 - earlyMs / 1000 - outputLatency
        let lead = target - nowUptime
        if lead >= minLead { return Start(position: duet.from, lead: lead) }
        return Start(position: duet.from + (minLead - lead), lead: minLead)
    }
}
