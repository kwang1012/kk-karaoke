import Foundation

/// `line` and `text` are there when the note was written against the lyrics: the lyric line it belongs to and what is sung on it.
struct Note: Codable, Hashable, Sendable {
    var note: Double
    var start: Double
    var end: Double
    var line: Int?
    var text: String?

    var length: Double { end - start }
}

enum MelodyState: Equatable, Sendable {
    case idle, loading
    /// The server is still finding the melody of a song processed before melodies existed.
    case waiting
    case ready
    /// The song has no notes.
    case none
    case gaveUp
}

enum Melody {
    /// 0 is smoothest (few, long notes), 1 is everything the melody finder heard.
    static let defaultDetail = 0.85

    static func detail(_ value: Double) -> Double {
        value.isFinite ? min(1, max(0, value)) : defaultDetail
    }

    /// A pause longer than this separates one phrase from the next.
    private static let phraseGap = 0.7
    /// One long note is a held note, not a stray one.
    private static let heldNote = 0.8
    /// At the smoothest end: shorter notes go, and neighbours this close in time (and within a semitone) merge.
    private static let smoothestNote = 0.2
    private static let smoothestGap = 0.2
    private static let tolerance = 1.0

    /// The melody at a level of detail between 0 and 1; `notes` are sorted by start and are not changed.
    /// Notes written against the lyrics (they have a `line`) are one per sung syllable already and are kept as they
    /// are; only the notes read straight off the pitch curve are simplified.
    static func simplify(_ notes: [Note], detail value: Double) -> [Note] {
        let level = detail(value)
        if level >= 1 { return notes }
        if notes.contains(where: { $0.line != nil }) {
            let written = notes.filter { $0.line != nil }
            let raw = simplifyPitchNotes(notes.filter { $0.line == nil }, level: level)
            return (written + raw).sorted { $0.start < $1.start }
        }
        return simplifyPitchNotes(notes, level: level)
    }

    private static func minPhrase(_ detail: Double) -> Int { detail < 1.0 / 3 ? 3 : detail < 2.0 / 3 ? 2 : 1 }

    private static func simplifyPitchNotes(_ notes: [Note], level: Double) -> [Note] {
        let minDuration = smoothestNote * (1 - level)
        let mergeGap = smoothestGap * (1 - level)
        let phrase = minPhrase(level)

        var merged: [Note] = []
        for note in notes {
            if let previous = merged.last, note.start - previous.end <= mergeGap, abs(note.note - previous.note) <= tolerance {
                merged[merged.count - 1] = Note(note: note.length > previous.length ? note.note : previous.note,
                                                start: previous.start, end: note.end)
            } else {
                merged.append(note)
            }
        }

        var kept: [Note] = []
        var cluster: [Note] = []
        func close() {
            if cluster.count >= phrase || cluster.contains(where: { $0.length >= heldNote }) { kept += cluster }
            cluster = []
        }
        for note in merged where note.length >= minDuration {
            if let last = cluster.last, note.start - last.end > phraseGap { close() }
            cluster.append(note)
        }
        close()
        return kept
    }

    /// The middle 90% of the notes, so a stray high or low one cannot squash the roll.
    static func range(of notes: [Note]) -> (low: Double, high: Double) {
        guard !notes.isEmpty else { return (60, 72) }
        let sorted = notes.map(\.note).sorted()
        return (sorted[Int(Double(sorted.count) * 0.05)], sorted[Int(ceil(Double(sorted.count) * 0.95)) - 1])
    }
}
