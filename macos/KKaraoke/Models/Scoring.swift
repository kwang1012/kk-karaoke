import Foundation

enum Scoring {
    /// How far from the melody, in semitones, still counts as singing the note.
    static let tolerance = 0.7
    /// Singing is heard late (mic and speaker latency, reaction time): a note stays sung-for this long after it ends.
    static let latency = 0.2
    /// A gap this long between updates (a seek, a pause) is not time to score.
    static let maxStep = 0.25

    /// Signed distance in semitones from `target` to `sung`, ignoring octaves (people sing the tune in their own range).
    static func semitonesOff(_ sung: Double, _ target: Double) -> Double {
        let r = (sung - target).truncatingRemainder(dividingBy: 12)
        return (r + 18).truncatingRemainder(dividingBy: 12) - 6
    }

    /// The notes sounding at `time`, or within `latency` seconds before it. Notes are sorted by start.
    static func notesAt(_ notes: [Note], _ time: Double) -> [Note] {
        var found: [Note] = []
        for n in notes {
            if n.start > time { break }
            if n.end + latency >= time { found.append(n) }
        }
        return found
    }

    /// The note the singer should be on at `time` (the one under the playhead, else the one just finished).
    static func noteUnder(_ notes: [Note], _ time: Double) -> Note? {
        var found: Note?
        for n in notes {
            if n.start > time { break }
            if n.end >= time { return n }
            if n.end + latency >= time { found = n }
        }
        return found
    }
}

/// Share of the melody's sung time that the singer was on pitch, as it plays.
struct Scorer {
    private var total = 0.0
    private var hit = 0.0
    private var last: Double?

    mutating func reset() { self = Scorer() }

    /// Call every tick while the song plays. `sung` is the MIDI pitch heard from the mic (nil for silence), `shift` the
    /// key change in semitones. Returns whether the singer is on pitch right now (nil when no note is due).
    mutating func update(time: Double, sung: Double?, notes: [Note], shift: Double = 0) -> Bool? {
        let step = last.map { time - $0 } ?? 0
        last = time
        let due = Scoring.notesAt(notes, time)
        guard !due.isEmpty else { return nil }
        let on = sung.map { sung in due.contains { abs(Scoring.semitonesOff(sung, $0.note + shift)) <= Scoring.tolerance } } ?? false
        if step > 0 && step <= Scoring.maxStep {
            total += step
            if on { hit += step }
        }
        return on
    }

    /// 0...100, or nil before anything has been sung to.
    var score: Int? { total > 0.5 ? Int((100 * hit / total).rounded()) : nil }
}
