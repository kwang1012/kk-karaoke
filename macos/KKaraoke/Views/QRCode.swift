import AppKit
import CoreImage.CIFilterBuiltins
import SwiftUI

enum QRCode {
  /// A QR code for `text`, drawn sharp at any size.
  static func image(for text: String) -> CGImage? {
    let filter = CIFilter.qrCodeGenerator()
    filter.message = Data(text.utf8)
    filter.correctionLevel = "M"
    guard let output = filter.outputImage else { return nil }
    let scaled = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
    // Rasterize here rather than handing SwiftUI a lazy Core Image representation that
    // compiles its renderer on the first sheet draw. QR codes do not need the GPU.
    let context = CIContext(options: [.useSoftwareRenderer: true])
    return context.createCGImage(scaled, from: scaled.extent)
  }
}

struct QRCodeView: View {
  var text: String
  var size: CGFloat = 160
  @State private var image: CGImage?

  var body: some View {
    Group {
      if let image {
        Image(decorative: image, scale: 1).interpolation(.none).resizable()
      } else {
        Color.white
      }
    }
    .frame(width: size, height: size)
    .padding(10).background(.white, in: RoundedRectangle(cornerRadius: 12))
    .accessibilityLabel("QR code to join the room")
    .task(id: text) {
      image = nil
      let value = text
      let result = await Task.detached(priority: .utility) { QRCode.image(for: value) }.value
      guard !Task.isCancelled else { return }
      image = result
    }
  }
}
