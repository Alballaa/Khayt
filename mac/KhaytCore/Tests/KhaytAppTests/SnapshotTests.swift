import Testing
import SwiftUI
import AppKit
@testable import KhaytApp

/// Renders the interface to PNGs so it can be looked at.
///
/// Not assertions about pixels — a screenshot test that fails on a one-pixel
/// shift is a chore, not a guard. This exists because judging a design by
/// reading its source is guessing, and `screencapture` needs a screen-recording
/// grant this process does not have.
///
/// Writes to KHAYT_SNAPSHOT_DIR when set, and does nothing otherwise, so it
/// costs nothing on a normal run.
///
/// WITH the directory set, the process crashes on the way out — "no current
/// update to enqueue action to", from inside SwiftUI, after every test has
/// passed and every picture is written. It predates the sheet renders below
/// and CI never sets the variable. Read the PNGs, not the exit code.
@Suite @MainActor struct SnapshotTests {

    static var outputDir: URL? {
        ProcessInfo.processInfo.environment["KHAYT_SNAPSHOT_DIR"].map { URL(fileURLWithPath: $0) }
    }

    func render(_ view: some View, _ name: String, size: CGSize) throws {
        guard let dir = Self.outputDir else { return }
        let renderer = ImageRenderer(content:
            view.frame(width: size.width, height: size.height)
                .environment(\.colorScheme, .light)
        )
        renderer.scale = 2
        guard let image = renderer.nsImage,
              let tiff = image.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff),
              let png = rep.representation(using: .png, properties: [:]) else {
            Issue.record("could not render \(name)")
            return
        }
        try png.write(to: dir.appending(path: name + ".png"))
    }

    @Test("the sample shop loads and renders")
    func shopWindow() async throws {
        let shop = Shop()
        await shop.load(.sample)
        #expect(shop.orders.count == 42, "the sample shop did not load")
        #expect(shop.problem == nil)
        #expect(shop.owed > 0, "a sample with nothing owed cannot show the design working")
        #expect(shop.taxSummary != nil, "the tax line comes from lib/tax.js and is the proof the core is live")

        try render(ShopWindow(shop: shop), "01-shop", size: CGSize(width: 1180, height: 720))

        shop.selection = shop.shown.first { !$0.isSettled }?.id
        try render(ShopWindow(shop: shop), "02-selected", size: CGSize(width: 1180, height: 720))

        shop.shelf = .jobs(.printing)
        try render(ShopWindow(shop: shop), "03-stage", size: CGSize(width: 1180, height: 720))

        #expect(!shop.files.isEmpty, "the sample shop has no models, so the library cannot be judged")
        #expect(shop.groups.contains("Saudi Kings"), "the grouped-models case must be in the sample")
        #expect(shop.ungroupedCount > 0, "so must the ungrouped one")
        shop.shelf = .library(nil)
        #expect(shop.shownFiles.count == shop.files.count)
    }

    /// The sheets, with their words in them.
    ///
    /// `ImageRenderer` renders SwiftUI properly; the running app's own capture
    /// cannot (see `Snapshot.captureSheet`), so every sheet photographed from
    /// the app is missing every label on it. What `ImageRenderer` CANNOT do is
    /// host a WKWebView, so the invoice's paper comes out blank here and is
    /// photographed from the app instead. Between the two there is a picture of
    /// the whole of each sheet.
    @Test("the sheets render, with their words")
    func sheets() async throws {
        let shop = Shop()
        await shop.load(.sample)
        let job = try #require(shop.orders.first { !$0.parts.isEmpty } ?? shop.orders.first)
        let subject = Shop.PendingHold(id: job.id, project: job.project)

        try render(PaymentSheet(shop: shop, subject: subject),
                   "20-payment-words", size: CGSize(width: 380, height: 281))
        try render(EditJobSheet(shop: shop, subject: subject),
                   "21-edit-job-words", size: CGSize(width: 360, height: 276))
        try render(QcFailSheet(shop: shop, subject: subject),
                   "22-qc-fail-words", size: CGSize(width: 380, height: 228))
        try render(NewJobSheet(shop: shop),
                   "23-new-job-words", size: CGSize(width: 560, height: 478))
        try render(CustomerSheet(shop: shop, existing: Shop.newCustomer()),
                   "24-new-customer-words", size: CGSize(width: 420, height: 350))
    }
}
