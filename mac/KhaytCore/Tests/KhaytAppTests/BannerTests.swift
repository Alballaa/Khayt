import Foundation
import Testing
@testable import KhaytApp

/// What the window says when something is wrong.
///
/// Every one of these is a source check, because a SwiftUI view's body cannot
/// be asked what it drew. That is a weak kind of test and it is the right kind
/// here: the defect being guarded is not "the banner renders wrongly", it is
/// "the banner is not on this screen at all" — which is what happened to the
/// engine failure for as long as it was a caption at the foot of the sidebar.
@MainActor
struct BannerTests {

    static func source(_ name: String) -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appending(path: "Sources/KhaytApp/\(name)")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }

    /// The three the window has to carry, above whatever screen is showing.
    @Test("every window-level banner is on the window, not on one screen")
    func bannersAreOnTheWindow() {
        let window = Self.source("ShopWindow.swift")
        #expect(!window.isEmpty, "ShopWindow moved")
        for banner in ["EngineBanner(shop: shop)", "MoveBanners(shop: shop)", "SpendBanner(shop: shop)"] {
            #expect(window.contains(banner), "\(banner) is not shown by the window")
        }
    }

    /// If the shared rules did not load, every figure in the app is absent or
    /// zero — and an empty dashboard looks exactly like a quiet shop. It must
    /// be said where the figures are, not only where the provenance is.
    @Test("a shop whose rules did not load is told twice, and one of them is not the sidebar")
    func engineFailureIsSaidWhereTheFiguresAre() {
        #expect(Self.source("Banners.swift").contains("shop.engineProblem"),
                "the banner does not read the engine's problem")
        #expect(Self.source("Sidebar.swift").contains("shop.engineProblem"),
                "the sidebar dropped its record of it")
    }

    /// The HIG's reason for the banner existing, kept where somebody deleting
    /// it would read it.
    @Test("the window has a floor")
    func theWindowCannotBeShrunkIntoNonsense() {
        let app = Self.source("KhaytApp.swift")
        #expect(app.contains("minWidth: 900"), "no minimum width — the columns can be crushed")
        #expect(app.contains("minHeight:"))
    }

    /// `Banner` was private to the board. It is three screens' worth of
    /// messages now, and a fourth caller having to reach into `Kanban.swift`
    /// for it is how it would end up copied instead.
    @Test("the banner belongs to the window, not to the board")
    func bannerIsShared() {
        // Matched loosely on purpose: it grew a generic accessory for the Stop
        // button on a running import, and what this guards is where it lives.
        #expect(Self.source("Banners.swift").contains("struct Banner"))
        #expect(!Self.source("Kanban.swift").contains("struct Banner"),
                "there are two Banners again")
    }
}

/// A photographed run says which appearance it is, BOTH ways.
///
/// The light run used to set none at all, so it followed whatever the Mac was
/// set to — and a Mac that switches itself at dusk then writes dark pictures
/// under light names. There is no cheap way to assert a colour without running
/// the app, so this asserts the line that decides it instead.
@MainActor
struct SnapshotAppearanceTests {
    @Test("the runner chooses an appearance either way, and only once")
    func choosesBothWays() {
        let source = BannerTests.source("KhaytApp.swift")
        #expect(source.contains("dark ? .darkAqua : .aqua"),
                "the light run no longer forces an appearance, so it follows the system")
        // Once. Changing it part way through a run is the abort this runner was
        // fixed to stop doing, and the fix holds only while nothing switches.
        #expect(source.components(separatedBy: "NSApp.appearance =").count - 1 == 1,
                "the appearance is set more than once — one of them is a switch")
    }
}
