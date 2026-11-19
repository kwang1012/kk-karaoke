import Foundation

/// TEMPORARY: writes timestamped events to the app's temp folder while a file named kk-debug is there.
enum DebugLog {
    private static let handle: FileHandle? = {
        let dir = NSTemporaryDirectory()
        guard FileManager.default.fileExists(atPath: dir + "kk-debug") else { return nil }
        FileManager.default.createFile(atPath: dir + "kk-debug.log", contents: nil)
        return FileHandle(forWritingAtPath: dir + "kk-debug.log")
    }()
    static func write(_ text: @autoclosure () -> String) {
        guard let handle else { return }
        let t = String(format: "%.3f", ProcessInfo.processInfo.systemUptime)
        handle.write(Data("\(t) \(Thread.isMainThread ? "main" : "bg ") \(text())\n".utf8))
    }
}
