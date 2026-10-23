import AVFoundation
import Foundation
import Testing
@testable import KKaraoke

@MainActor
struct StemPlayerTests {
    /// A sine tone file of `seconds`, in the folder the test owns.
    private func tone(_ name: String, seconds: Double, in folder: URL) throws -> URL {
        let url = folder.appendingPathComponent(name)
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2)!
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        let frames = AVAudioFrameCount(seconds * 44100)
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
        buffer.frameLength = frames
        for channel in 0..<2 {
            for i in 0..<Int(frames) { buffer.floatChannelData![channel][i] = 0.1 * sin(Float(i) * 0.05) }
        }
        try file.write(from: buffer)
        return url
    }

    @Test func playsSeeksAndFinishes() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let player = StemPlayer()
        try player.load(vocal: tone("v.caf", seconds: 2, in: folder), instrumental: tone("i.caf", seconds: 2, in: folder))
        #expect(abs(player.duration - 2) < 0.01)

        var finished = false
        player.onFinish = { finished = true }
        try player.play()
        try await Task.sleep(for: .milliseconds(700))
        let time = player.currentTime
        #expect(player.isPlaying)
        #expect(time > 0.3 && time < 0.8, "time was \(time)")

        player.pause()
        let paused = player.currentTime
        try await Task.sleep(for: .milliseconds(200))
        #expect(!player.isPlaying)
        #expect(player.currentTime == paused)

        try player.seek(to: 1.5)
        #expect(player.currentTime == 1.5)
        try player.play()
        try await Task.sleep(for: .milliseconds(1000))
        #expect(finished)
        #expect(!player.isPlaying)
    }
}
