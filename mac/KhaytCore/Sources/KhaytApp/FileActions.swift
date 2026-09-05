import SwiftUI
import AppKit

/// What a shop wants to do with a model it has just found.
///
/// All of it read-only, and all of it handing off to the rest of the Mac rather
/// than reimplementing it: Finder shows the file, and whatever the shop has set
/// as its slicer opens it. A library you can look at but not get to the file
/// from is a catalogue, not a tool.
enum FileActions {

    static func reveal(_ url: URL) {
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }

    static func open(_ url: URL) {
        NSWorkspace.shared.open(url)
    }

    static func copy(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }
}

/// The menu on a model, in the grid and in the inspector alike.
///
/// The two entries that need the file are absent — not disabled — when it is not
/// on this Mac. A greyed-out "Reveal in Finder" invites a shop to keep clicking
/// it; the reason is said once, in the inspector, where there is room for it.
struct ModelActions: View {
    let file: LibraryFile
    let shop: Shop

    var body: some View {
        if let url = shop.modelFile(for: file) {
            Button(shop.words.callIt("mac.reveal_in_finder")) { FileActions.reveal(url) }
            Button(shop.words.callIt("mac.open")) { FileActions.open(url) }
            Divider()
        } else if let dir = shop.directory(for: file) {
            Button(shop.words.callIt("mac.reveal_folder")) { FileActions.reveal(dir) }
            Divider()
        }
        Button(shop.words.callIt("mac.copy_name")) { FileActions.copy(file.title) }
        if let original = file.sourceFile?.originalName ?? file.originalName {
            Button(shop.words.callIt("mac.copy_file_name")) { FileActions.copy(original) }
        }
    }
}
