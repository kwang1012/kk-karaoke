import Foundation

struct Pitch: Sendable, Equatable {
    var hz: Double
    var clarity: Double
}

/// Fundamental frequency of one buffer of mono samples, by the YIN algorithm: the same one the server runs on
/// the vocal stem (backend/services/pitcher.py), so singer and song are comparable.
enum PitchDetector {
    /// Lowest and highest voice pitch to look for, in Hz.
    static let fmin = 70.0
    static let fmax = 1100.0
    /// A dip in the normalised difference below this counts as a pitch (YIN's threshold).
    static let threshold: Float = 0.2
    /// Quieter than this (RMS of a -1...1 signal) is room noise, not singing.
    static let minRMS: Float = 0.01

    /// nil for silence or anything without a clear pitch.
    static func detect(_ samples: UnsafeBufferPointer<Float>, sampleRate: Double) -> Pitch? {
        let window = samples.count >> 1
        let tauMax = min(Int(sampleRate / fmin), samples.count - window - 1)
        let tauMin = max(2, Int(sampleRate / fmax))
        guard tauMax > tauMin + 2 else { return nil }

        var energy: Float = 0
        for i in 0..<window { energy += samples[i] * samples[i] }
        guard (energy / Float(window)).squareRoot() >= minRMS else { return nil }

        // difference function, then its cumulative mean normalisation
        var cmnd = [Float](repeating: 1, count: tauMax + 1)
        var running: Float = 0
        for tau in 1...tauMax {
            var sum: Float = 0
            for i in 0..<window {
                let delta = samples[i] - samples[i + tau]
                sum += delta * delta
            }
            running += sum
            cmnd[tau] = running > 0 ? (sum * Float(tau)) / running : 1
        }

        var tau = tauMin
        while tau < tauMax && cmnd[tau] >= threshold { tau += 1 }
        guard tau < tauMax else { return nil }
        while tau + 1 < tauMax && cmnd[tau + 1] < cmnd[tau] { tau += 1 } // down to the bottom of the dip

        // parabolic interpolation between neighbouring lags, for accuracy finer than one sample
        let a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1]
        let denominator = a - 2 * b + c
        let shift = denominator == 0 ? 0 : max(-1, min(1, 0.5 * (a - c) / denominator))
        return Pitch(hz: sampleRate / (Double(tau) + Double(shift)), clarity: Double(1 - b))
    }

    static func detect(_ samples: [Float], sampleRate: Double) -> Pitch? {
        samples.withUnsafeBufferPointer { detect($0, sampleRate: sampleRate) }
    }

    /// MIDI note number (fractional) of a frequency; 69 is A4 = 440 Hz.
    static func midi(fromHz hz: Double) -> Double { 69 + 12 * log2(hz / 440) }
}
