import AVFoundation
import CoreMedia
import Foundation
import Testing
@testable import KKaraoke

/// The microphone cannot be used in a test (it asks for permission), so these push synthetic audio down the same path.
@MainActor
struct MicPathTests {
    /// A sample buffer of a sine tone, shaped as AVCaptureAudioDataOutput delivers it.
    private func sampleBuffer(hz: Double, frames: Int, start: Int, rate: Double = 44100) throws -> CMSampleBuffer {
        let format = MicFormat.target
        let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames))!
        pcm.frameLength = AVAudioFrameCount(frames)
        for i in 0..<frames { pcm.floatChannelData![0][i] = 0.3 * Float(sin(2 * .pi * hz * Double(start + i) / rate)) }
        var description: CMAudioFormatDescription?
        CMAudioFormatDescriptionCreate(allocator: nil, asbd: format.streamDescription, layoutSize: 0, layout: nil,
                                       magicCookieSize: 0, magicCookie: nil, extensions: nil, formatDescriptionOut: &description)
        var timing = CMSampleTimingInfo(duration: CMTime(value: 1, timescale: Int32(rate)),
                                        presentationTimeStamp: CMTime(value: CMTimeValue(start), timescale: Int32(rate)),
                                        decodeTimeStamp: .invalid)
        var buffer: CMSampleBuffer?
        let status = CMSampleBufferCreate(allocator: nil, dataBuffer: nil, dataReady: false, makeDataReadyCallback: nil,
                                          refcon: nil, formatDescription: description, sampleCount: frames, sampleTimingEntryCount: 1,
                                          sampleTimingArray: &timing, sampleSizeEntryCount: 0, sampleSizeArray: nil, sampleBufferOut: &buffer)
        try #require(status == noErr)
        let attach = CMSampleBufferSetDataBufferFromAudioBufferList(buffer!, blockBufferAllocator: kCFAllocatorDefault,
                                                                     blockBufferMemoryAllocator: kCFAllocatorDefault, flags: 0,
                                                                     bufferList: pcm.audioBufferList)
        try #require(attach == noErr)
        return buffer!
    }

    @Test func capturedAudioBecomesAPitch() throws {
        let sink = CaptureSink()
        var start = 0
        for _ in 0..<12 { // 12 buffers of 512 frames, about 140 ms
            sink.process(try sampleBuffer(hz: 262, frames: 512, start: start))
            start += 512
        }
        let pitch = try #require(sink.box.fresh())
        #expect(abs(pitch.hz - 262) < 3, "heard \(pitch.hz) Hz")
    }

    @Test func monitorEngineStartsStopsAndTakesAudio() async throws {
        let mic = MicEngine()
        #expect(!mic.monitorIsRunning)
        mic.setLevels(volume: 0.8, reverb: 0.3, monitor: true)
        #expect(mic.monitorIsRunning)
        mic.setLevels(volume: 0.8, reverb: 0.5, monitor: true) // levels change while it plays
        mic.setLevels(volume: 0.8, reverb: 0.5, monitor: false)
        #expect(!mic.monitorIsRunning)
        mic.setLevels(volume: 0.8, reverb: 0.5, monitor: true)
        try await Task.sleep(for: .milliseconds(200))
        mic.setOutputDevice(nil) // restarts it on the default output
        #expect(mic.monitorIsRunning)
        mic.setLevels(volume: 0, reverb: 0, monitor: false)
    }

    @Test func tryingToSingWithoutPermissionFailsCleanly() async {
        // Never prompts: only runs where the permission was already refused.
        guard AVCaptureDevice.authorizationStatus(for: .audio) == .denied else { return }
        await #expect(throws: MicEngine.Failure.self) { try await MicEngine().start(device: nil) }
    }
}
