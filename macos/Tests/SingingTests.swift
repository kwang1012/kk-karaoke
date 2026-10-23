import Foundation
import Testing
@testable import KKaraoke

struct PitchTests {
    private func sine(_ hz: Double, rate: Double = 44100, count: Int = 2048, amplitude: Float = 0.3) -> [Float] {
        (0..<count).map { amplitude * Float(sin(2 * .pi * hz * Double($0) / rate)) }
    }

    @Test func findsAKnownTone() throws {
        for hz in [110.0, 220.0, 440.0, 880.0] {
            let pitch = try #require(PitchDetector.detect(sine(hz), sampleRate: 44100))
            #expect(abs(pitch.hz - hz) / hz < 0.01, "\(hz) Hz came out as \(pitch.hz)")
        }
    }

    @Test func worksAtOtherSampleRates() throws {
        let pitch = try #require(PitchDetector.detect(sine(330, rate: 48000), sampleRate: 48000))
        #expect(abs(pitch.hz - 330) < 3)
    }

    @Test func silenceAndNoiseHaveNoPitch() {
        #expect(PitchDetector.detect([Float](repeating: 0, count: 2048), sampleRate: 44100) == nil)
        #expect(PitchDetector.detect(sine(440, amplitude: 0.001), sampleRate: 44100) == nil) // below the room-noise floor
        var generator = SystemRandomNumberGenerator()
        let noise = (0..<2048).map { _ in Float.random(in: -0.3...0.3, using: &generator) }
        #expect(PitchDetector.detect(noise, sampleRate: 44100) == nil)
    }

    @Test func convertsToMidi() {
        #expect(abs(PitchDetector.midi(fromHz: 440) - 69) < 1e-9)
        #expect(abs(PitchDetector.midi(fromHz: 261.6256) - 60) < 1e-3)
        #expect(abs(PitchDetector.midi(fromHz: 880) - 81) < 1e-9)
    }

    @Test func pitchBoxForgetsStaleReadings() {
        let box = PitchBox()
        box.store(Pitch(hz: 220, clarity: 0.9))
        #expect(box.fresh()?.hz == 220)
        #expect(box.fresh(now: ProcessInfo.processInfo.systemUptime + 1) == nil)
        box.store(nil)
        #expect(box.fresh() == nil)
    }
}

struct ScoringTests {
    private let notes = [
        Note(note: 60, start: 0, end: 1), Note(note: 64, start: 1, end: 2), Note(note: 67, start: 5, end: 6),
    ]

    @Test func ignoresOctaves() {
        #expect(abs(Scoring.semitonesOff(72, 60)) < 1e-9)
        #expect(abs(Scoring.semitonesOff(48, 60)) < 1e-9)
        #expect(abs(Scoring.semitonesOff(61, 60) - 1) < 1e-9)
        #expect(abs(Scoring.semitonesOff(59, 60) + 1) < 1e-9)
        #expect(abs(Scoring.semitonesOff(66, 60)) == 6)
    }

    @Test func findsNotesUnderThePlayhead() {
        #expect(Scoring.noteUnder(notes, 0.5)?.note == 60)
        #expect(Scoring.noteUnder(notes, 3) == nil)
        // just after a note ends it is still the one to be on (sung late)
        #expect(Scoring.noteUnder(notes, 2.1)?.note == 64)
        #expect(Scoring.noteUnder(notes, 2.3) == nil)
        #expect(Scoring.notesAt(notes, 1.1).map(\.note) == [60, 64])
    }

    @Test func scoresTheShareOnPitch() {
        var scorer = Scorer()
        var t = 0.0
        // sing the right note for the first note and a wrong one for the second, in 50 ms steps
        while t < 2 {
            let sung: Double = t < 1 ? 60.2 : 70
            _ = scorer.update(time: t, sung: sung, notes: notes)
            t += 0.05
        }
        let score = try! #require(scorer.score)
        #expect(score >= 40 && score <= 60, "score was \(score)")
    }

    @Test func silenceScoresZeroAndNoNoteScoresNothing() {
        var scorer = Scorer()
        var t = 0.0
        while t < 2 { _ = scorer.update(time: t, sung: nil, notes: notes); t += 0.05 }
        #expect(scorer.score == 0)
        var idle = Scorer()
        #expect(idle.update(time: 3, sung: 60, notes: notes) == nil)
        #expect(idle.score == nil)
    }

    @Test func aSeekIsNotTimeToScore() {
        var scorer = Scorer()
        _ = scorer.update(time: 0.1, sung: nil, notes: notes)
        _ = scorer.update(time: 5.5, sung: nil, notes: notes) // a jump of 5 s
        #expect(scorer.score == nil)
    }
}

struct MelodyTests {
    @Test func fullDetailKeepsEverything() {
        let notes = [Note(note: 60, start: 0, end: 0.05), Note(note: 62, start: 3, end: 3.5)]
        #expect(Melody.simplify(notes, detail: 1) == notes)
    }

    @Test func lowDetailDropsStrayNotesAndMergesNeighbours() {
        let phrase = (0..<5).map { Note(note: 60, start: Double($0) * 0.5, end: Double($0) * 0.5 + 0.45) }
        let stray = Note(note: 70, start: 10, end: 10.1)
        let simplified = Melody.simplify(phrase + [stray], detail: 0)
        #expect(!simplified.contains(stray))
        #expect(simplified.count < phrase.count) // the near neighbours merged
        #expect(simplified.first?.note == 60)
    }

    @Test func notesWrittenAgainstLyricsAreKept() {
        let written = Note(note: 65, start: 1, end: 1.05, line: 2, text: "la")
        #expect(Melody.simplify([written], detail: 0).contains(written))
    }

    @Test func detailIsClamped() {
        #expect(Melody.detail(5) == 1)
        #expect(Melody.detail(-1) == 0)
        #expect(Melody.detail(.nan) == Melody.defaultDetail)
    }

    @Test func rangeIgnoresOutliers() {
        var notes = (0..<100).map { Note(note: 60 + Double($0 % 8), start: Double($0), end: Double($0) + 0.5) }
        notes.append(Note(note: 100, start: 200, end: 201))
        let range = Melody.range(of: notes)
        #expect(range.high < 100)
        #expect(range.low >= 60)
        #expect(Melody.range(of: []).low == 60)
    }

    @Test func rollFitsTheNotesInView() {
        let notes = [Note(note: 60, start: 0, end: 1), Note(note: 72, start: 1, end: 2)]
        let view = RollView.fitting(notes, from: 0, to: 2, shift: 0, song: (60, 72))
        #expect(view.lo == 57.5 && view.hi == 74.5)
        let narrow = RollView.fitting([Note(note: 60, start: 0, end: 1)], from: 0, to: 1, shift: 0, song: (60, 60))
        #expect(narrow.hi - narrow.lo == RollView.minRows)
        let eased = view.eased(toward: RollView(lo: 0, hi: 10), 0.5)
        #expect(eased == RollView(lo: 28.75, hi: 42.25))
    }

    @Test func rollLabelsAndKeys() {
        #expect(RollView.octaveLabel(60) == "C4")
        #expect(RollView.octaveLabel(0) == "C-1")
        #expect(RollView.isBlackKey(61) && !RollView.isBlackKey(60))
    }

    @Test func decodesTheMelodyResponse() throws {
        let json = #"{"noteEvents":[{"note":60.5,"start":1.0,"end":1.5},{"note":62,"start":2,"end":2.4,"line":3,"text":"la"}],"minNote":60,"maxNote":62}"#
        struct Response: Decodable { var noteEvents: [Note] }
        let notes = try JSONDecoder().decode(Response.self, from: Data(json.utf8)).noteEvents
        #expect(notes.count == 2)
        #expect(notes[1].line == 3 && notes[1].text == "la")
    }
}

struct PitchAccumulatorTests {
    @Test func readsAToneDeliveredInSmallBuffers() throws {
        var accumulator = PitchAccumulator()
        accumulator.interval = 0
        var found: Pitch?
        var phase = 0
        for chunk in 0..<10 {
            let samples = (0..<512).map { Float(0.3 * sin(2 * .pi * 220 * Double(phase + $0) / 44100)) }
            phase += 512
            let reading = samples.withUnsafeBufferPointer { buffer -> Pitch?? in
                accumulator.append(buffer)
                return accumulator.read(now: Double(chunk), sampleRate: 44100)
            }
            if chunk < 3 { #expect(reading == nil, "a full window has not arrived yet") }
            if let reading, let pitch = reading { found = pitch }
        }
        let pitch = try #require(found)
        #expect(abs(pitch.hz - 220) < 3)
    }

    @Test func readsAtMostEveryInterval() {
        var accumulator = PitchAccumulator()
        let samples = [Float](repeating: 0.2, count: 2048)
        samples.withUnsafeBufferPointer { accumulator.append($0) }
        #expect(accumulator.read(now: 10, sampleRate: 44100) != nil)
        #expect(accumulator.read(now: 10.01, sampleRate: 44100) == nil)
        #expect(accumulator.read(now: 10.03, sampleRate: 44100) != nil)
    }

    @Test func silenceIsAReadingOfNoPitch() {
        var accumulator = PitchAccumulator()
        [Float](repeating: 0, count: 2048).withUnsafeBufferPointer { accumulator.append($0) }
        let reading = accumulator.read(now: 1, sampleRate: 44100)
        #expect(reading != nil) // it was read...
        #expect(reading! == nil) // ...and there was no pitch in it
    }
}
