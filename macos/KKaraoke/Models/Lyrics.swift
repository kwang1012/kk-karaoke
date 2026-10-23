import Foundation

struct LyricWord: Codable, Hashable, Sendable {
    var start: Double
    var end: Double
    var text: String
}

struct LyricLine: Codable, Hashable, Sendable, Identifiable {
    var time: Double
    var text: String
    var romanized: String?
    /// Per-word timing, when a verified one exists for this line.
    var words: [LyricWord]?
    var id: Double { time }
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

/// A silent stretch between two lines, long enough to get a music icon and a countdown.
struct LyricGap: Equatable, Sendable {
    /// A wait at least this long (seconds) is marked.
    static let minimum = 5.0

    var start: Double
    var end: Double

    /// The wait after line `index` (-1 for the intro before the first line), or nil when it is short.
    static func after(_ lines: [LyricLine], index: Int, delay: Double) -> LyricGap? {
        guard index >= -1, index + 1 < lines.count else { return nil }
        let next = lines[index + 1].time + delay
        var start = 0.0
        if index >= 0 {
            let line = lines[index]
            let sung: Double
            if let last = line.words?.last {
                sung = last.end + delay
            } else {
                // No word timing: a rough guess at how long the line takes to sing.
                sung = line.time + delay + (line.text.isEmpty ? 0 : max(2, Double(line.text.count) * 0.3))
            }
            start = min(sung, next)
        }
        return next - start >= minimum ? LyricGap(start: start, end: next) : nil
    }

    /// Whole seconds left until the next line while the wait is under way, never below 1.
    func countdown(at time: Double) -> Int? {
        time >= start && time < end ? max(1, Int((end - time).rounded(.up))) : nil
    }
}
