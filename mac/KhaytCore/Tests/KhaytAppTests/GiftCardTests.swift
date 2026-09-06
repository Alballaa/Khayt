import Foundation
import Testing
import KhaytCore
@testable import KhaytApp

/// Gift cards on the Mac.
///
/// The arithmetic is `lib/gift-card.js` and is tested where it lives. What is
/// tested here is that this app ASKS it — the status shown beside a card is the
/// obvious thing to write in Swift as two date comparisons, and the two would
/// then disagree the first time either changed.
@MainActor
struct GiftCardTests {

    static func shop() async throws -> Shop {
        let shop = Shop()
        await shop.load(.sample)
        try #require(shop.engine != nil, "the shared rules did not start")
        return shop
    }

    static func card(_ id: String, balance: Double, expires: String? = nil) -> JSONValue {
        var o: [String: JSONValue] = [
            "id": .string(id), "code": .string(id.uppercased()),
            "balance": .number(balance), "initialBalance": .number(500),
        ]
        if let expires { o["expiresAt"] = .string(expires) }
        return .object(o)
    }

    /// THE ORDER THAT MATTERS. An expired card with nothing left on it reads
    /// EXPIRED, not "used": one says why it cannot be spent, the other suggests
    /// the customer got the benefit of it. Two Swift date comparisons written
    /// in the obvious order give the opposite answer.
    @Test("expiry beats an empty balance, and the rule decides which")
    func statusOrder() async throws {
        let shop = try await Self.shop()
        let states = try await #require(shop.engine).giftCardStatuses([
            Self.card("a", balance: 200),
            Self.card("b", balance: 0),
            Self.card("c", balance: 0, expires: "2020-01-01"),
            Self.card("d", balance: 200, expires: "2020-01-01"),
            Self.card("e", balance: 200, expires: "2099-01-01"),
        ], today: "2026-09-06")

        #expect(states["a"] == "active")
        #expect(states["b"] == "used")
        #expect(states["c"] == "expired", "an expired empty card must say why")
        #expect(states["d"] == "expired")
        #expect(states["e"] == "active")
    }

    @Test("a card expiring today is still good today")
    func expiresToday() async throws {
        let shop = try await Self.shop()
        let states = try await #require(shop.engine).giftCardStatuses(
            [Self.card("a", balance: 50, expires: "2026-09-06")], today: "2026-09-06")
        #expect(states["a"] == "active")
    }

    /// The refusals come back as KEYS, so the window says them in the shop's
    /// language. A rule that answered in English would be one the Arabic app
    /// could not use, and this is the assertion that notices if it starts to.
    @Test("a refused card is refused by key, and builds nothing")
    func refusals() async throws {
        let shop = try await Self.shop()
        let engine = try #require(shop.engine)
        let existing = [Self.card("gc1", balance: 10)]

        for (input, expected) in [
            (["code": JSONValue.string(""), "initialBalance": .number(50)], "giftCardCodeRequired"),
            (["code": .string("A-B"), "initialBalance": .number(50)], "giftCardCodeInvalid"),
            (["code": .string("GC1"), "initialBalance": .number(50)], "giftCardCodeDuplicate"),
            (["code": .string("NEW123"), "initialBalance": .number(0)], "giftCardBalanceRequired"),
        ] {
            let made = try await engine.newGiftCard(input, id: "GC-x", now: "2026-09-06T00:00:00Z",
                                                    existing: existing)
            #expect(!made.ok)
            #expect(made.error == expected, "got \(made.error ?? "nil")")
            #expect(made.card == nil, "a refused card was built anyway")
            // The words exist in both languages, or the window shows a key.
            #expect(shop.words.callIt(expected) != expected, "\(expected) has no translation")
        }
    }

    @Test("an issued card starts full and shouted")
    func issued() async throws {
        let shop = try await Self.shop()
        let made = try await #require(shop.engine).newGiftCard(
            ["code": .string("sum24"), "initialBalance": .number(250)],
            id: "GC-1", now: "2026-09-06T00:00:00Z", existing: [])
        #expect(made.ok)
        let card = try #require(made.card)
        guard case .object(let o) = card else { Issue.record("not an object"); return }
        #expect(o["code"] == .string("SUM24"))
        #expect(o["balance"] == .number(250))
        #expect(o["initialBalance"] == .number(250))
    }

    /// The suggestion only. It must not offer characters that are misheard,
    /// because the whole point of a code is being read down a telephone.
    @Test("the suggested code has no letters that sound like numbers")
    func suggestedCode() {
        for _ in 0..<200 {
            let code = Shop.giftCardCode()
            #expect(code.count == 8)
            for bad in ["I", "O", "0", "1", "5", "S", "B"] {
                #expect(!code.contains(bad), "\(code) contains \(bad)")
            }
        }
    }

    /// A shelf the sidebar offers and `Shelves` cannot name restores to the
    /// jobs table on every launch.
    @Test("the gift-cards shelf survives being written down and read back")
    func shelfRoundTrips() async throws {
        let shop = try await Self.shop()
        #expect(Shelves.name(.giftCards) == "gift-cards")
        #expect(Shelves.shelf("gift-cards", in: shop) == .giftCards)
    }
}
