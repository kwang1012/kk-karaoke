import Foundation

struct LyricWord: Codable, Hashable, Sendable {
    var start: Double
    var end: Double
    var text: String
}

struct LyricSinger: Codable, Hashable, Sendable {
    var id: String
    var name: String?
    var kind: String
    var slot: Int

    var label: String {
        if let name, !name.isEmpty {
            if name == "男聲" || name == "男声" { return "男" }
            if name == "女聲" || name == "女声" { return "女" }
            return name
        }
        if kind == "group" { return tr("Together") }
        return kind == "person" && slot > 0 ? "\(tr("Singer")) \(slot)" : tr("Unassigned")
    }
    var side: Int { kind == "person" && slot > 0 ? (slot % 2 == 1 ? -1 : 1) : 0 }
}

struct LyricLine: Codable, Hashable, Sendable, Identifiable {
    var time: Double
    var text: String
    var romanized: String?
    /// Per-word timing, when a verified one exists for this line.
    var words: [LyricWord]?
    var lineId: String?
    var end: Double?
    var singer: LyricSinger?
    var role: String?
    var id: String { lineId ?? "legacy-\(time)-\(text)" }

    private enum CodingKeys: String, CodingKey {
        case time, text, romanized, words, end, singer, role
        case lineId = "id"
    }
}

/// What `GET lyrics/{id}` answers. `lyrics` is empty when the song only has unsynced words (`plain`).
struct LyricsResponse: Codable, Sendable {
    var lyrics: [LyricLine] = []
    var plain: String?
    /// Seconds added to every line time. The server stores one per track, shared by everyone.
    var delay: Double?
    var confidence: String?
    var videoId: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        lyrics = try c.decodeIfPresent([LyricLine].self, forKey: .lyrics) ?? []
        plain = try c.decodeIfPresent(String.self, forKey: .plain)
        delay = try c.decodeIfPresent(Double.self, forKey: .delay)
        confidence = try c.decodeIfPresent(String.self, forKey: .confidence)
        videoId = try c.decodeIfPresent(String.self, forKey: .videoId)
    }

    private enum CodingKeys: String, CodingKey { case lyrics, plain, delay, confidence, videoId }
}

enum LyricsState: Equatable, Sendable {
    case none
    case loading
    case synced([LyricLine])
    /// Words without timing: nothing to highlight or seek to.
    case plain(String)
    case missing
    /// The server could not be reached, even after trying again.
    case failed
}

/// The same tenth-second steps, limits and display used by the web sync control.
enum LyricsSync {
    static func clampedAhead(_ seconds: Double) -> Double {
        (min(30, max(-30, seconds)) * 10).rounded() / 10
    }

    static func label(_ seconds: Double) -> String {
        let value = clampedAhead(seconds)
        let normalized: Double = value == 0 ? 0.0 : value
        return (value > 0 ? "+" : "") + String(format: "%.1fs", normalized)
    }
}

enum LyricsTiming {
    /// Shortest fill, so a word with a zero-length timing still lights up.
    static let minFill = 0.05

    /// How much of a word is sung (0...1) at `progress`. A word never keeps filling after the next one has
    /// started, so two words are not lit at once when the data runs one into the other.
    static func wordFill(_ word: LyricWord, next: LyricWord?, delay: Double, progress: Double) -> Double {
        let start = word.start + delay
        var end = max(word.end + delay, start + minFill)
        if let next { end = max(min(end, next.start + delay), start + 0.01) }
        if progress <= start { return 0 }
        if progress >= end { return 1 }
        return (progress - start) / (end - start)
    }

    static func startsVocalPart(_ line: LyricLine, previous: LyricLine?) -> Bool {
        guard let previous else { return true }
        return line.singer?.id != previous.singer?.id || (line.role ?? "lead") != (previous.role ?? "lead")
    }

    static func hasDuetParts(_ lines: [LyricLine]) -> Bool {
        Set(lines.compactMap { $0.singer != nil && $0.singer?.kind != "other" ? $0.singer?.id : nil }).count > 1
    }

    static func activeIndices(in lines: [LyricLine], at time: Double, delay: Double) -> Set<Int> {
        let now = time - delay
        let current = lineIndex(in: lines, at: time, delay: delay)
        return Set(lines.indices.filter { index in
            let line = lines[index]
            guard line.time <= now else { return false }
            if let end = line.end { return now < end }
            if line.singer != nil {
                let next = lines.first { $0.time > line.time }?.time ?? .infinity
                return now < next
            }
            return index == current
        })
    }

    /// The line being sung at `time`, or nil before the first one. `delay` shifts every line.
    static func lineIndex(in lines: [LyricLine], at time: Double, delay: Double) -> Int? {
        var low = 0, high = lines.count
        while low < high {
            let mid = (low + high) / 2
            if lines[mid].time + delay <= time { low = mid + 1 } else { high = mid }
        }
        return low == 0 ? nil : low - 1
    }
}

/// A silent stretch between two lines, long enough to get a countdown for its last seconds.
struct LyricGap: Equatable, Sendable {
    /// A wait at least this long (seconds) is marked.
    static let minimum = 5.0
    /// Only the last seconds of the wait are counted out.
    static let countdownSeconds = 3.0
    /// Aligned word ends run early (the last word is often held): the wait starts this long after it.
    static let wordEndGrace = 1.8

    var start: Double
    var end: Double

    /// The wait after line `index` (-1 for the intro before the first line), or nil when it is short.
    /// An instrumental (empty) line is its own marker, so no wait is counted out into or after one.
    static func after(_ lines: [LyricLine], index: Int, delay: Double) -> LyricGap? {
        guard index >= -1, index + 1 < lines.count else { return nil }
        guard !lines[index + 1].text.isEmpty else { return nil }
        let next = lines[index + 1].time + delay
        var start = 0.0
        if index >= 0 {
            let line = lines[index]
            guard !line.text.isEmpty else { return nil }
            var sung: Double
            if let last = line.words?.last {
                sung = last.end + delay + wordEndGrace
            } else {
                // No word timing: a rough guess at how long the line takes to sing. Generous on purpose (it matches the
                // web app's): a countdown that starts while the line is still sung is worse than one that starts late.
                sung = line.time + delay + max(3, Double(line.text.count) * 0.5)
            }
            // The line's own end, when the server has one, says the singing lasts at least that long, whatever the words
            // say (a long line often has words that stop before it does).
            if let end = line.end { sung = max(sung, end + delay + wordEndGrace) }
            start = min(sung, next)
        }
        return next - start >= minimum ? LyricGap(start: start, end: next) : nil
    }

    /// Seconds left until the next line once the wait is down to its last `countdownSeconds`, else nil.
    func countdown(at time: Double) -> Double? {
        let left = end - time
        return time >= start && left > 0 && left <= Self.countdownSeconds ? left : nil
    }
}
