import SwiftUI

/// The selected model, in detail.
///
/// What a shop asks before putting a file back on a printer: how big is it, how
/// many colours, how many swaps, when did it last run, and where is the file.
struct LibraryInspector: View {
    let shop: Shop

    var body: some View {
        if shop.fileSelection.count > 1 {
            ManyModels(shop: shop)
        } else if let file = shop.selectedFile {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header(file)
                    Divider()
                    theFile(file)
                    if !file.palette.isEmpty {
                        Divider()
                        filament(file)
                    }
                    if let mesh = file.mesh {
                        Divider()
                        geometry(mesh)
                    }
                    actions(file)
            if let notes = file.testedNotes, !notes.isEmpty {
                        Divider()
                        DetailSection(shop.words.callIt("doc.notes")) { Text(notes).textSelection(.enabled) }
                    }
                }
                .padding(16)
            }
        } else {
            ContentUnavailableView(shop.words.callIt("mac.no_model"), systemImage: "cube",
                                   description: Text(shop.words.callIt("mac.no_model_hint")))
        }
    }

    /// The file, reachable. Buttons rather than only a context menu: a menu you
    /// have to know is there is a feature for the person who wrote it.
    @ViewBuilder private func actions(_ file: LibraryFile) -> some View {
        if let url = shop.modelFile(for: file) {
            HStack(spacing: 8) {
                Button { FileActions.reveal(url) } label: {
                    Label(shop.words.callIt("mac.reveal"), systemImage: "folder")
                }
                Button { FileActions.open(url) } label: {
                    Label(shop.words.callIt("mac.open"), systemImage: "arrow.up.forward.app")
                }
            }
            .controlSize(.small)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func header(_ file: LibraryFile) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            // A fixed height, not an aspect ratio. `Thumbnail` is a ZStack over
            // a Rectangle and has no size of its own, and asking for a 1:1 fit
            // inside a vertical ScrollView leaves the height unresolved — the
            // whole inspector drew as an empty column.
            Thumbnail(source: shop.thumbnail(for: file))
                .frame(maxWidth: .infinity)
                .frame(height: 210)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            HStack(spacing: 6) {
                // A control only when it would do something. While the Electron
                // app has the book this is a star that reports, not a button
                // that lies — a disabled toggle invites people to keep pressing.
                if shop.canWrite {
                    Button {
                        shop.toggleFavourite(file)
                    } label: {
                        Image(systemName: file.isFavourite ? "star.fill" : "star")
                            .foregroundStyle(file.isFavourite ? AnyShapeStyle(.yellow)
                                                             : AnyShapeStyle(.tertiary))
                    }
                    .buttonStyle(.plain)
                    .help(shop.words.callIt(file.isFavourite ? "mac.unmake_favourite" : "mac.make_favourite"))
                } else if file.isFavourite {
                    Image(systemName: "star.fill").foregroundStyle(.yellow)
                }
                Text(file.title)
                    .font(.title3.weight(.semibold))
                    .textSelection(.enabled)
            }
            if let problem = shop.writeProblem {
                Label(problem, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .textSelection(.enabled)
            }
            if let group = file.groupName {
                Label(group, systemImage: "square.stack")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            if let tags = file.tags, !tags.isEmpty {
                Text(tags.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
    }

    private func theFile(_ file: LibraryFile) -> some View {
        DetailSection(shop.words.callIt("mac.file")) {
            if let original = file.sourceFile?.originalName ?? file.originalName {
                DetailLine(shop.words.callIt("mac.name"), original)
            }
            if let size = file.size { DetailLine(shop.words.callIt("set.store_size"), Format.bytes(size)) }
            if let material = file.material, !material.isEmpty {
                DetailLine(shop.words.callIt("plib.material"), material)
            }
            DetailLine(shop.words.callIt("mac.printed"), file.printCount == 0 ? shop.words.callIt("mac.never") : "\(file.printCount)×",
                       dim: file.printCount == 0)
            if let last = file.lastPrinted, let day = Order.day(last) {
                DetailLine(shop.words.callIt("mac.last_run"), day.formatted(date: .abbreviated, time: .omitted))
            }
            // Where the bytes are is worth stating plainly. "On this Mac" and
            // "in the records but not here" look identical in a grid, and only
            // one of them can be put on a printer this afternoon.
            if shop.fileIsPresent(file) {
                DetailLine(shop.words.callIt("mac.on_this_mac"), "✓", dim: true)
            } else {
                DetailLine(shop.words.callIt("mac.on_this_mac"), shop.words.callIt("mac.not_found"), warn: true)
            }
        }
    }

    private func filament(_ file: LibraryFile) -> some View {
        DetailSection(shop.words.callIt("mac.filament")) {
            ForEach(Array(file.palette.enumerated()), id: \.offset) { i, colour in
                HStack(spacing: 8) {
                    Swatch(rgb: colour.rgb)
                    Text(colour.label ?? shop.words.callIt("mac.filament_n", ["n": .number(Double(i + 1))]))
                        .font(.callout)
                    Spacer(minLength: 8)
                    if let g = colour.grams {
                        Text("\(Format.mm(g)) g")
                            .font(.callout)
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                }
            }
            if file.swaps > 0 {
                DetailLine(shop.words.callIt("mac.swaps"), "\(file.swaps)", dim: true)
            }
        }
    }

    private func geometry(_ mesh: LibraryFile.Mesh) -> some View {
        DetailSection(shop.words.callIt("mac.mesh")) {
            DetailLine(shop.words.callIt("set.store_size"), "\(Format.mm(mesh.x)) × \(Format.mm(mesh.y)) × \(Format.mm(mesh.z)) mm")
            DetailLine(shop.words.callIt("mac.triangles"), Format.count(mesh.triangles), dim: true)
        }
    }
}
