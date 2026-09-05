import Foundation
import Testing
import KhaytCore
@testable import KhaytApp

/// What the shop sells, and what it costs.
///
/// Not the print library — that is the files. This is the catalogue, and on
/// this book it feeds the storefront, which is why the price shown has to be
/// the one `lib/product-price.js` computes rather than whatever number is
/// nearest to hand.
///
/// The first fixture is this shop's own product record: the King Abdulaziz
/// portrait, `basePrice: 46.69` with `priceRound: {step: 5, mode: "up"}`.
@MainActor
struct CatalogueTests {

    static func product(_ fields: [String: JSONValue]) -> JSONValue {
        var row = fields
        row["id"] = row["id"] ?? .string("PROD-1")
        return .object(row)
    }

    // MARK: - The price, and why

    @Test("the real product rounds up to its step")
    func realProduct() async throws {
        let price = try await KhaytEngine().productPrice(
            Self.product(["basePrice": .number(46.69),
                          "priceRound": .object(["step": .number(5), "mode": .string("up")])]),
            basePrice: 46.69)
        #expect(price.base == 46.69)
        #expect(price.final == 50)
        #expect(price.source == "rounded")
    }

    @Test("a typed price of ZERO is a price, not an absent one")
    func zeroOverride() async throws {
        // A giveaway, a sample, a part priced inside a bundle. Treating 0 as
        // absent would silently re-price free items at cost plus margin — the
        // module says so, and it is the kind of thing a Swift `?? ` would undo.
        let price = try await KhaytEngine().productPrice(
            Self.product(["priceOverride": .number(0),
                          "priceRound": .object(["step": .number(5), "mode": .string("up")])]),
            basePrice: 100)
        #expect(price.final == 0)
        #expect(price.source == "override", "an override beats rounding")
    }

    @Test("no rounding set leaves the calculated figure alone")
    func noRounding() async throws {
        let price = try await KhaytEngine().productPrice(Self.product([:]), basePrice: 46.69)
        #expect(price.final == 46.69)
        #expect(price.source == "base")
    }

    @Test("a rounded price that did not move reads as calculated, not rounded")
    func roundedButUnmoved() {
        // `describe` in the module makes exactly this distinction, and saying
        // "rounded" of a figure that is identical is noise on a screen.
        let unmoved = KhaytEngine.CatalogueRow(
            id: "P", name: "N", description: "", base: 50, final: 50, source: "rounded",
            margin: nil, printHours: nil, weightGrams: nil, material: "", parts: 0)
        #expect(Catalogue.reason(unmoved) == "pe.price_is_base")

        let moved = KhaytEngine.CatalogueRow(
            id: "P", name: "N", description: "", base: 46.69, final: 50, source: "rounded",
            margin: nil, printHours: nil, weightGrams: nil, material: "", parts: 0)
        #expect(Catalogue.reason(moved) == "pe.price_is_rounded")
        #expect(Catalogue.reason(KhaytEngine.CatalogueRow(
            id: "P", name: "N", description: "", base: 1, final: 2, source: "override",
            margin: nil, printHours: nil, weightGrams: nil, material: "", parts: 0))
            == "pe.price_is_override")
    }

    // MARK: - What its parts add up to

    @Test("hours, grams and the materials come from the parts")
    func specs() async throws {
        let specs = try await KhaytEngine().productSpecs(Self.product(["parts": .array([
            .object(["printWeight": .number(120), "supportWeight": .number(5),
                     "printTime": .number(2.5), "qty": .number(2), "material": .string("PLA")]),
            .object(["printWeight": .number(10), "qty": .number(1), "material": .string("PETG")]),
        ])]))
        #expect(specs.weightGrams == 260)
        #expect(specs.printHours == 5)
        // Distinct, in the order the shop listed them: "PLA, PETG" is what
        // somebody packing it needs to read.
        #expect(specs.material == "PLA, PETG")
    }

    @Test("a product with no parts has no specs rather than zeroes")
    func noParts() async throws {
        let specs = try await KhaytEngine().productSpecs(Self.product([:]))
        #expect(specs.weightGrams == nil)
        #expect(specs.printHours == nil)
        #expect(specs.material == "")
    }

    // MARK: - The row

    @Test("the name is read in the shop's language, like everywhere else")
    func nameIsLocalised() async throws {
        // Same rule as the customers table, and for the same reason — one book
        // must not be shown two answers about what something is called.
        let rows = try await KhaytEngine().catalogue([
            Self.product(["nameEn": .string("Portrait of King Abdulaziz"),
                          "nameAr": .string("صورة الملك عبدالعزيز")]),
        ], language: "ar", settings: ["contentLangs": .array([.string("ar"), .string("en")])])
        #expect(rows.first?.name == "صورة الملك عبدالعزيز")
    }

    @Test("one crossing gives the name, the price and the specs together")
    func oneCrossing() async throws {
        let rows = try await KhaytEngine().catalogue([
            Self.product(["nameEn": .string("Kings"), "basePrice": .number(46.69),
                          "defaultMargin": .number(30),
                          "priceRound": .object(["step": .number(5), "mode": .string("up")]),
                          "parts": .array([.object(["printWeight": .number(100),
                                                    "qty": .number(1),
                                                    "material": .string("PLA+")])])]),
        ], language: "en", settings: [:])
        guard let row = rows.first else { Issue.record("no row"); return }
        #expect(row.name == "Kings")
        #expect(row.final == 50)
        #expect(row.margin == 30)
        #expect(row.weightGrams == 100)
        #expect(row.material == "PLA+")
        #expect(row.parts == 1)
    }

    @Test("a missing margin sorts as absent, not as zero")
    func missingMarginSorts() {
        // A product with no margin set is not the cheapest.
        let none = KhaytEngine.CatalogueRow(
            id: "A", name: "A", description: "", base: 0, final: 0, source: "base",
            margin: nil, printHours: nil, weightGrams: nil, material: "", parts: 0)
        let zero = KhaytEngine.CatalogueRow(
            id: "B", name: "B", description: "", base: 0, final: 0, source: "base",
            margin: 0, printHours: nil, weightGrams: 0, material: "", parts: 0)
        #expect(none.marginSort < zero.marginSort)
        #expect(none.weightSort < zero.weightSort)
    }
}
