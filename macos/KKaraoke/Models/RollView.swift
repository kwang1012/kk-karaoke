import Foundation

/// The pitch rows the roll shows, as MIDI numbers (fractional while it eases from one view to the next).
struct RollView: Equatable {
    var lo: Double
    var hi: Double

    /// Never show fewer rows than an octave, so a few notes do not turn into enormous bars.
    static let minRows = 12.0
    /// Rows kept free above and below the notes.
    private static let padding = 2.5

    /// The rows that the notes between `from` and `to` need (`notes` are sorted by start), so each semitone gets as much
    /// height as possible. Notes beyond the song's usual range (`song`, before the key shift) are stray; they sit on the
    /// edge of the view instead of stretching it.
    static func fitting(_ notes: [Note], from: Double, to: Double, shift: Double, song: (low: Double, high: Double)) -> RollView {
        var lo = Double.infinity, hi = -Double.infinity
        for n in notes {
            if n.end < from { continue }
            if n.start > to { break }
            if n.note < song.low || n.note > song.high { continue }
            lo = min(lo, n.note)
            hi = max(hi, n.note)
        }
        if lo > hi { lo = song.low; hi = song.high }
        lo += shift - padding
        hi += shift + padding
        if hi - lo < minRows {
            let middle = (lo + hi) / 2
            lo = middle - minRows / 2
            hi = middle + minRows / 2
        }
        return RollView(lo: lo, hi: hi)
    }

    /// A step toward `target`: `k` is the share of the distance covered (1 jumps there).
    func eased(toward target: RollView, _ k: Double) -> RollView {
        RollView(lo: lo + (target.lo - lo) * k, hi: hi + (target.hi - hi) * k)
    }

    static func isBlackKey(_ midi: Int) -> Bool { [1, 3, 6, 8, 10].contains(((midi % 12) + 12) % 12) }

    /// Scientific pitch name of a C (the label on the roll's octave lines): 60 is C4.
    static func octaveLabel(_ midi: Int) -> String { "C\(Int((Double(midi) / 12).rounded(.down)) - 1)" }
}
