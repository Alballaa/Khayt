import Foundation
import Testing
import KhaytCore
@testable import KhaytApp

/// Colour, and the one place where "obvious" is wrong.
///
/// The arithmetic is `lib/color-mix.js` and is tested where it lives. What is
/// tested here is that this app asks it rather than guessing — because the
/// guess is easy to write, looks right in a unit test with primary colours, and
/// hands a shop the wrong spool on the colours it actually owns.
@MainActor
struct ColourStudioTests {

    static func shop() async throws -> Shop {
        let shop = Shop()
        await shop.load(.sample)
        try #require(shop.engine != nil, "the shared rules did not start")
        return shop
    }

    /// THE CASE THAT SEPARATES THE TWO METHODS.
    ///
    /// Target `#B1FC74`, a light yellow-green. Two spools:
    ///
    /// | | plain RGB distance | ΔE (CIEDE2000) |
    /// |---|---|---|
    /// | `#F9B9ED` pink  | **155.9** — nearer | 66.3 — nothing like it |
    /// | `#25EA27` green | 160.8 — further    | **10.6** — a usable match |
    ///
    /// A nearest-hex-triple search hands the shop the PINK. That is not a
    /// contrived pair; it falls out of sRGB not being perceptually uniform, and
    /// it is the whole reason this screen asks a module instead of subtracting
    /// three numbers.
    @Test("closest means how it looks, not how near the hex is")
    func perceptualNotArithmetic() async throws {
        let shop = try await Self.shop()
        let target = "#B1FC74"
        let candidates: [JSONValue] = [
            .object(["id": .string("pink"), "color": .string("#F9B9ED")]),
            .object(["id": .string("green"), "color": .string("#25EA27")]),
        ]
        let ranked = try await #require(shop.engine).nearestFilaments(to: target, among: candidates)
        #expect(ranked.first?.id == "green",
                "a nearest-hex search would have answered pink")
        #expect(try #require(ranked.first).deltaE < 12, "and it is a match a shop could use")

        // The arithmetic that would have been wrong, spelled out so the table
        // above is checkable rather than asserted — and so this test fails
        // loudly if the example ever stops being an example.
        func plain(_ a: String, _ b: String) -> Double {
            let x = Swatch.rgb(fromHex: a)!, y = Swatch.rgb(fromHex: b)!
            return (((x.r - y.r) * (x.r - y.r) + (x.g - y.g) * (x.g - y.g)
                     + (x.b - y.b) * (x.b - y.b)).squareRoot()) * 255
        }
        #expect(plain(target, "#F9B9ED") < plain(target, "#25EA27"),
                "the pink is the nearer hex; if it stops being so this case proves nothing")
    }

    @Test("a colour matches itself exactly, and the list is closest first")
    func ordering() async throws {
        let shop = try await Self.shop()
        let candidates: [JSONValue] = [
            .object(["id": .string("far"), "color": .string("#FFFFFF")]),
            .object(["id": .string("exact"), "color": .string("#C0392B")]),
            .object(["id": .string("near"), "color": .string("#B93A2C")]),
        ]
        let ranked = try await #require(shop.engine).nearestFilaments(to: "#C0392B", among: candidates)
        #expect(ranked.map(\.id) == ["exact", "near", "far"])
        #expect(ranked.first!.deltaE < 0.001, "the same colour is no distance from itself")
    }

    /// A filament with no hex is not ranked at all — `deltaE` is not finite, so
    /// the module drops it. A row in a ranked list with no distance would be a
    /// row that means nothing.
    @Test("a filament with no colour is left out rather than ranked last")
    func colourless() async throws {
        let shop = try await Self.shop()
        let candidates: [JSONValue] = [
            .object(["id": .string("named"), "color": .string("black")]),
            .object(["id": .string("none")]),
            .object(["id": .string("real"), "color": .string("#123456")]),
        ]
        let ranked = try await #require(shop.engine).nearestFilaments(to: "#123456", among: candidates)
        #expect(ranked.map(\.id) == ["real"])
    }

    /// Mixing happens in LINEAR light, so the midpoint of black and white is
    /// not `#808080`. It is around `#BC`, because sRGB is gamma-encoded and
    /// averaging the encoded values darkens the result — the classic mistake,
    /// and the one that makes a gradient look muddy in the middle.
    @Test("two colours mix in linear light, not by averaging their hex")
    func linearBlend() async throws {
        let shop = try await Self.shop()
        let mid = try await #require(shop.engine).blend("#000000", "#FFFFFF", 0.5)
        let value = try #require(Swatch.rgb(fromHex: try #require(mid)))
        #expect(value.r > 0.65, "an sRGB average would put this at 0.5")
        #expect(abs(value.r - value.g) < 0.001 && abs(value.g - value.b) < 0.001, "still grey")
    }

    @Test("a gradient keeps both ends and has the number of steps asked for")
    func gradientEnds() async throws {
        let shop = try await Self.shop()
        let ramp = try await #require(shop.engine).gradient("#FF0000", "#0000FF", steps: 5)
        #expect(ramp.count == 5)
        #expect(ramp.first?.uppercased() == "#FF0000")
        #expect(ramp.last?.uppercased() == "#0000FF")
    }

    /// Nothing rather than a guess. A gradient drawn between a colour and a
    /// word would be five swatches of something nobody chose.
    @Test("a gradient from something that is not a colour is empty")
    func gradientRefuses() async throws {
        let shop = try await Self.shop()
        #expect(try await #require(shop.engine).gradient("#FF0000", "royal blue", steps: 4).isEmpty)
    }

    /// The picker hands back a `Color` that may be in Display P3. Reading its
    /// components without converting gives values outside 0-1 for a saturated
    /// colour, and `#00FF00` for something that is not green.
    @Test("a colour from the picker is written down in sRGB")
    func hexThroughSRGB() throws {
        let hex = try #require(ColourStudio.hex(.init(red: 0.2, green: 0.4, blue: 0.6)))
        #expect(hex.hasPrefix("#") && hex.count == 7)
        let back = try #require(Swatch.rgb(fromHex: hex))
        #expect(abs(back.r - 0.2) < 0.01 && abs(back.g - 0.4) < 0.01 && abs(back.b - 0.6) < 0.01)
    }

    /// The screen is reachable and comes back after a relaunch. A shelf the
    /// sidebar offers and `Shelves` cannot name restores to the jobs table
    /// every time the app opens.
    @Test("the colour shelf survives being written down and read back")
    func shelfRoundTrips() async throws {
        let shop = try await Self.shop()
        #expect(Shelves.name(.colour) == "colour")
        #expect(Shelves.shelf("colour", in: shop) == .colour)
    }
}

/// The portfolio: every photograph on every job, in one grid.
@MainActor
struct PortfolioTests {

    static func shop() async throws -> Shop {
        let shop = Shop()
        await shop.load(.sample)
        return shop
    }

    /// The flattening is the whole of this screen's logic, so it is the whole
    /// of the test: two photos on one job and one on another are three cells,
    /// each knowing which job it came from.
    @Test("photos from every job are one list, in the book's order")
    func flattens() async throws {
        let shop = try await Self.shop()
        let book: [String: JSONValue] = ["printLog": .array([
            .object(["id": .string("ORD-1"), "project": .string("Bracket"),
                     "date": .string("2026-01-02"),
                     "printPhotos": .array([
                        .object(["thumb": .string("data:image/png;base64,AA"), "filename": .string("a.jpg")]),
                        .object(["thumb": .string("data:image/png;base64,BB"), "filename": .string("b.jpg")]),
                     ])]),
            .object(["id": .string("ORD-2"), "project": .string("Jig"),
                     "printPhotos": .array([
                        .object(["thumb": .string("data:image/png;base64,CC")]),
                     ])]),
            // A job with no photos contributes nothing rather than an empty cell.
            .object(["id": .string("ORD-3"), "project": .string("Nothing")]),
        ])]
        shop.readSnapshotsForTests(book)

        #expect(shop.snapshots.map(\.id) == ["ORD-1#0", "ORD-1#1", "ORD-2#0"])
        #expect(shop.snapshots.first?.project == "Bracket")
        #expect(shop.snapshots.first?.date == "2026-01-02")
        // No file on this Mac, so nothing to open — and the row is still there,
        // because the thumbnail lives in the book.
        #expect(shop.snapshots.allSatisfy { $0.file == nil })
        #expect(shop.snapshots.last?.thumb == "data:image/png;base64,CC")
    }

    @Test("a book with no photographs has no portfolio at all")
    func empty() async throws {
        let shop = try await Self.shop()
        shop.readSnapshotsForTests(["printLog": .array([
            .object(["id": .string("ORD-1"), "printPhotos": .array([])]),
        ])])
        #expect(shop.snapshots.isEmpty)
        // And the shelf refuses to restore, so a relaunch cannot land on it.
        #expect(Shelves.shelf("portfolio", in: shop) == nil)
    }
}
