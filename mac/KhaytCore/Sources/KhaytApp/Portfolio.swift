import SwiftUI
import AppKit
import KhaytCore

/// Photographs of work the shop has finished.
///
/// Every photo on every job, flattened into one grid — which is what makes it a
/// portfolio rather than a folder. A shop showing somebody what it can do does
/// not want to open nineteen orders.
///
/// ── WHERE THE PICTURES ARE ────────────────────────────────────────────────
///
/// Two places, and the split is Khayt's rather than this app's. A thumbnail is
/// a data URL stored INSIDE the job record, so the grid draws with no file
/// access at all — that is what makes this screen work on a book opened
/// read-only. The full-size photo is a file in `order-photos/` beside the
/// store, written when the photo was added, and is only touched when somebody
/// asks to open one.
struct Portfolio: View {
    @Bindable var shop: Shop
    @State private var search = ""

    private let columns = [GridItem(.adaptive(minimum: 180, maximum: 260), spacing: 12)]

    private var shown: [Shop.Snapshot] {
        let term = search.trimmingCharacters(in: .whitespaces).lowercased()
        guard !term.isEmpty else { return shop.snapshots }
        return shop.snapshots.filter {
            $0.project.lowercased().contains(term) || $0.orderId.lowercased().contains(term)
        }
    }

    var body: some View {
        Group {
            if shop.snapshots.isEmpty {
                ContentUnavailableView(shop.words.callIt("pf.empty"), systemImage: "photo.on.rectangle")
            } else if shown.isEmpty {
                ContentUnavailableView.search(text: search)
            } else {
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(shown) { snap in cell(snap) }
                    }
                    .padding(16)
                }
                .background(.background)
            }
        }
        .searchable(text: $search, prompt: shop.words.callIt("pf.search_ph"))
        .navigationTitle(shop.words.callIt("pf.title"))
        .toolbar {
            if shop.photoFolder != nil {
                ToolbarItem {
                    Button(shop.words.callIt("pf.reveal_folder"), systemImage: "folder") {
                        shop.revealPhotoFolder()
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func cell(_ snap: Shop.Snapshot) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // The library's own thumbnail view: loaded off the main thread and
            // cached, which a grid of a shop's whole history needs as much as
            // the model grid does.
            Thumbnail(source: snap.thumb.map(ThumbnailSource.inlineData))
                .frame(height: 150)
                .clipped()
            VStack(alignment: .leading, spacing: 1) {
                Text(snap.project.isEmpty ? snap.orderId : snap.project)
                    .font(.callout).lineLimit(1)
                Text(snap.orderId + (snap.date.isEmpty ? "" : " · " + snap.date))
                    .font(.caption2).monospacedDigit().foregroundStyle(.tertiary).lineLimit(1)
            }
            .padding(.horizontal, 8).padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(.quinary, in: RoundedRectangle(cornerRadius: 8))
        .contentShape(RoundedRectangle(cornerRadius: 8))
        .help(snap.project)
        .onTapGesture(count: 2) { shop.openPhoto(snap) }
        .contextMenu {
            Button(shop.words.callIt("mac.open")) { shop.openPhoto(snap) }
                .disabled(snap.file == nil)
            Button(shop.words.callIt("mac.reveal")) { shop.revealPhoto(snap) }
                .disabled(snap.file == nil)
        }
    }
}
