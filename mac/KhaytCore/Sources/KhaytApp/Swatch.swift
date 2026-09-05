import SwiftUI

/// A filament colour, drawn so it can be seen.
///
/// A white swatch on a white panel is nothing at all. The library inspector
/// outlined every colour in `.separator` — which is visible around a black
/// filament and INVISIBLE around a white one, because a hairline designed to
/// sit on the window background disappears when the fill is the window
/// background. This shop prints white; three of the four filaments on its Hulk
/// helmet showed a swatch and the fourth showed a gap.
///
/// The outline is therefore chosen from the FILL, never from the surroundings:
/// a dark line around a pale colour and a pale line around a dark one. That is
/// the only version that survives both light mode and dark, and a swatch drawn
/// over a photograph as well as over a panel.
struct Swatch: View {
    let rgb: (r: Double, g: Double, b: Double)?
    var size: CGFloat = 14
    var corner: CGFloat = 3
    /// A circle for the small dots on a thumbnail, a rounded square in a list.
    var round = false

    /// Perceived brightness — the ITU-R BT.709 coefficients, which weight green
    /// far above blue because an eye does. A flat average calls #0000FF light.
    static func isPale(_ c: (r: Double, g: Double, b: Double)) -> Bool {
        (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) > 0.6
    }

    var body: some View {
        Group {
            if let rgb {
                shape
                    .fill(Color(red: rgb.r, green: rgb.g, blue: rgb.b))
                    .overlay(shape.stroke(Self.outline(rgb), lineWidth: size < 12 ? 0.5 : 1))
            } else {
                // No colour recorded. Dashed, so it reads as "not known" rather
                // than as a colour that happens to match the paper.
                shape.stroke(.separator, style: StrokeStyle(lineWidth: 1, dash: [2, 2]))
            }
        }
        .frame(width: size, height: size)
    }

    /// `InsettableShape` is what `strokeBorder` needs and `AnyShape` is not one,
    /// so the stroke is drawn on the path and the frame keeps it inside.
    private var shape: AnyShape {
        round ? AnyShape(Circle()) : AnyShape(RoundedRectangle(cornerRadius: corner))
    }

    private static func outline(_ rgb: (r: Double, g: Double, b: Double)) -> Color {
        isPale(rgb) ? .black.opacity(0.28) : .white.opacity(0.45)
    }
}
