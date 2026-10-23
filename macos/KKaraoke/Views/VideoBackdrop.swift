import SwiftUI
import WebKit

/// The recording's own YouTube video, muted and kept in step with our audio: the song's sound is the clock, and the
/// video is moved back to it whenever it drifts apart. Some videos cannot be embedded; those show a link instead.
struct VideoBackdrop: View {
  @Environment(PlayerModel.self) private var player
  var videoId: String
  @State private var failed = false

  var body: some View {
    ZStack {
      Color.black
      if failed {
        VStack(spacing: 12) {
          LucideIcon("video-off", size: 36).foregroundStyle(.secondary)
          Text("This video can't be shown here.").foregroundStyle(.secondary)
          Link("Open on YouTube", destination: URL(string: "https://www.youtube.com/watch?v=\(videoId)")!)
            .pointerStyle(.link)
        }
      } else {
        VideoWebView(
          videoId: videoId, clock: { (player.currentTime, player.isPlaying, player.seekCount) }, onFailure: { failed = true }
        )
        .id(videoId)
        .allowsHitTesting(false)
      }
    }
    .onChange(of: videoId) { _, _ in failed = false }
  }
}

struct VideoWebView: NSViewRepresentable {
  var videoId: String
  var clock: @MainActor () -> (Double, Bool, Int)
  var onFailure: () -> Void

  func makeCoordinator() -> Coordinator { Coordinator(clock: clock, onFailure: onFailure) }

  func makeNSView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.mediaTypesRequiringUserActionForPlayback = []
    configuration.userContentController.add(context.coordinator, name: "failed")
    let web = WKWebView(frame: .zero, configuration: configuration)
    web.setValue(false, forKey: "drawsBackground")
    context.coordinator.web = web
    web.loadHTMLString(Self.page(videoId), baseURL: URL(string: "https://kkaraoke.app"))
    context.coordinator.start()
    return web
  }

  func updateNSView(_ web: WKWebView, context: Context) {}

  static func dismantleNSView(_ web: WKWebView, coordinator: Coordinator) {
    coordinator.stop()
    web.configuration.userContentController.removeScriptMessageHandler(forName: "failed")
    web.loadHTMLString("", baseURL: nil)
  }

  @MainActor
  final class Coordinator: NSObject, WKScriptMessageHandler {
    var web: WKWebView?
    private let clock: @MainActor () -> (Double, Bool, Int)
    private let onFailure: () -> Void
    private var timer: Timer?

    init(clock: @escaping @MainActor () -> (Double, Bool, Int), onFailure: @escaping () -> Void) {
      self.clock = clock
      self.onFailure = onFailure
    }

    func start() {
      timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let self, let web = self.web else { return }
          let (time, playing, seekCount) = self.clock()
          web.evaluateJavaScript("sync(\(time), \(playing), \(seekCount))", completionHandler: nil)
        }
      }
    }

    func stop() { timer?.invalidate(); timer = nil }

    nonisolated func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
      MainActor.assumeIsolated { onFailure() }
    }
  }

  static func page(_ id: String) -> String {
    """
    <!doctype html><html><head><meta name="viewport" content="width=device-width">
    <style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#p,iframe{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none}</style>
    </head><body><div id="p"></div>
    <script src="https://www.youtube.com/iframe_api"></script>
    <script>
    var player, ready = false, pending = null, lastSeek = null;
    function onYouTubeIframeAPIReady() {
      player = new YT.Player('p', {
        width: '100%', height: '100%', videoId: '\(id)',
        playerVars: { controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3, mute: 1 },
        events: {
          onReady: function () {
            ready = true;
            player.mute();
            if (pending) sync(pending[0], pending[1], pending[2]);
            player.playVideo();
          },
          onStateChange: function (e) {
            // Buffer a first frame even when the audio is paused, then hold it.
            if (e.data === 1 && pending && !pending[1]) player.pauseVideo();
          },
          onError: function () { window.webkit.messageHandlers.failed.postMessage('error'); }
        }
      });
    }
    function sync(t, playing, seekCount) {
      pending = [t, playing, seekCount];
      if (!ready) return;
      var s = player.getPlayerState();
      var explicitSeek = lastSeek !== seekCount;
      lastSeek = seekCount;
      // Seeking on every clock tick while buffering restarts the fetch before it can finish.
      // A user seek can interrupt it once; normal progress waits for the buffered frames.
      if ((s !== 3 || explicitSeek) && Math.abs(player.getCurrentTime() - t) > 0.6) player.seekTo(t, true);
      if (playing && s !== 1 && s !== 3) player.playVideo();
      if (!playing && s === 1) player.pauseVideo();
    }
    </script></body></html>
    """
  }
}
