import SwiftUI
import AppKit

/// The shop's models.
///
/// A grid rather than a table, and that is the whole argument for the screen: a
/// print shop recognises a model by looking at it. The list view in the Electron
/// app puts a 40px thumbnail at the head of a text row, which is a filename with
/// a decoration — you read it rather than see it.
struct LibraryGrid: View {
    @Bindable var shop: Shop

    private let columns = [GridItem(.adaptive(minimum: 168, maximum: 240), spacing: 16)]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 16) {
                ForEach(shop.shownFiles) { file in
                    cell(for: file)
                }
            }
            .padding(16)
        }
        .background(.background)
        .overlay { if shop.shownFiles.isEmpty { EmptyShelf(shop: shop) } }
    }

    /// Broken out of the grid body: the type-checker gave up on the whole
    /// expression once the modifiers went on.
    @ViewBuilder private func cell(for file: LibraryFile) -> some View {
        Cell(file: file,
             thumbnail: shop.thumbnail(for: file),
             selected: shop.fileSelection.contains(file.id))
            .onTapGesture {
                // SwiftUI's tap gesture does not report modifiers, so they are
                // read from the event that is arriving. Without this, ⌘-click
                // does not extend a selection — and a Mac app where it does not
                // reads as a web page however carefully it is drawn.
                let flags = NSEvent.modifierFlags
                let how: Shop.SelectionModifier =
                    flags.contains(.command) ? .toggle : (flags.contains(.shift) ? .extend : .replace)
                shop.select(file, modifiers: how)
            }
            .contextMenu {
                ModelActions(file: file, shop: shop)
            } preview: {
                // Right-click gives the picture at a size worth looking at. It
                // is the fastest way to tell two versions of a model apart.
                Thumbnail(source: shop.thumbnail(for: file))
                    .frame(width: 320, height: 320)
            }
    }
}

private struct Cell: View {
    let file: LibraryFile
    let thumbnail: ThumbnailSource?
    let selected: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Thumbnail(source: thumbnail)
                .aspectRatio(1, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(alignment: .topTrailing) {
                    if file.isFavourite {
                        Image(systemName: "star.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(.yellow)
                            .shadow(radius: 2)
                            .padding(6)
                            .help("Marked a favourite")
                    }
                }
                // The palette, on the image where the eye already is. Four
                // filaments and three swaps is the difference between a print
                // that runs unattended and one someone has to stand over.
                .overlay(alignment: .bottomLeading) { Palette(file: file) }

            VStack(alignment: .leading, spacing: 2) {
                Text(file.title)
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(2, reservesSpace: true)
                    .multilineTextAlignment(.leading)
                Text(subtitle)
                    .font(.caption2)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .padding(.top, 6)
            .padding(.horizontal, 2)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(6)
        .background(selected ? AnyShapeStyle(.selection) : AnyShapeStyle(.clear),
                    in: RoundedRectangle(cornerRadius: 8))
        .contentShape(RoundedRectangle(cornerRadius: 8))
    }

    private var subtitle: String {
        var bits: [String] = []
        if let size = file.size { bits.append(Format.bytes(size)) }
        if file.printCount > 0 { bits.append("printed \(file.printCount)×") }
        return bits.joined(separator: " · ")
    }
}

/// The filament colours, and how many swaps the print needs.
private struct Palette: View {
    let file: LibraryFile

    var body: some View {
        let swatches = file.palette.prefix(6)
        if !swatches.isEmpty {
            HStack(spacing: 3) {
                ForEach(Array(swatches.enumerated()), id: \.offset) { _, colour in
                    if let rgb = colour.rgb {
                        Circle()
                            .fill(Color(red: rgb.r, green: rgb.g, blue: rgb.b))
                            .frame(width: 9, height: 9)
                            .overlay(Circle().strokeBorder(.white.opacity(0.55), lineWidth: 0.5))
                    }
                }
                if file.swaps > 0 {
                    Text("\(file.swaps)")
                        .font(.system(size: 9, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .help("\(file.swaps) filament swaps")
                }
            }
            .padding(.horizontal, 5)
            .padding(.vertical, 3)
            .background(.black.opacity(0.42), in: Capsule())
            .padding(6)
        }
    }
}

private struct EmptyShelf: View {
    let shop: Shop

    var body: some View {
        if let problem = shop.problem {
            ContentUnavailableView {
                Label("This library will not open", systemImage: "exclamationmark.octagon")
            } description: { Text(problem) }
        } else if !shop.search.isEmpty {
            ContentUnavailableView.search(text: shop.search)
        } else {
            ContentUnavailableView("No models yet", systemImage: "cube",
                                   description: Text("Print files added in Khayt appear here."))
        }
    }
}

enum Format {
    /// Sizes a shop reads. Models here run to 80 MB and libraries to hundreds of
    /// gigabytes, so this is base-1000 like the Finder's, not base-1024.
    static func bytes(_ n: Double) -> String {
        let f = ByteCountFormatter()
        f.countStyle = .file
        f.allowedUnits = [.useKB, .useMB, .useGB]
        return f.string(fromByteCount: Int64(n))
    }

    /// Millimetres with no more precision than a shop can hold a caliper to.
    static func mm(_ v: Double) -> String { String(format: "%.0f", v) }

    static func count(_ n: Int) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        return f.string(from: n as NSNumber) ?? "\(n)"
    }
}
