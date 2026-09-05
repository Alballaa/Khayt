import Foundation
import Testing
import KhaytCore
@testable import KhaytApp

/// What the shop is still owed.
///
/// THE DEFECT THIS EXISTS FOR: `Order.owed` was `max(0, price - paidAmount)`,
/// and the comment above it said money was not a Swift opinion while being
/// exactly that. It is short by a credit note and by a gift card — both of
/// which pay an order down in `lib/order-money.js` — and that number is in the
/// title bar, the customers table, the jobs table and on the kanban card.
///
/// Neither book on this machine carries either field, which is why nothing
/// showed. A shop that issues one credit note would have been chasing money it
/// had already given back, with the Receivables page (which does ask the
/// engine) quietly disagreeing on the next screen.
@MainActor
struct OwedTests {

    static func job(_ id: String, price: Double, paid: Double,
                    credit: Double? = nil, giftCard: Double? = nil) -> JSONValue {
        var row: [String: JSONValue] = [
            "id": .string(id), "price": .number(price), "paidAmount": .number(paid),
            "status": .string("completed"),
            // `date` and `project` are required by the decoder — a row without
            // them is a job the app would not show at all.
            "date": .string("2026-09-01"), "project": .string("Lid"),
            "paymentStatus": .string("unpaid"), "printTime": .number(1),
            "priority": .bool(false), "notes": .string(""), "client": .string("A shop"),
        ]
        if let credit { row["creditNotes"] = .array([.object(["amount": .number(credit)])]) }
        if let giftCard { row["giftCardDiscount"] = .number(giftCard) }
        return .object(row)
    }

    static func owed(_ rows: [JSONValue]) async throws -> [String: Double] {
        try await KhaytEngine().owedByOrder(rows, settings: ["currency": .string("SAR")],
                                            clients: [], currencies: [:])
    }

    @Test("a credit note pays the job down")
    func creditNote() async throws {
        let out = try await Self.owed([Self.job("O-1", price: 1000, paid: 0, credit: 300)])
        #expect(out["O-1"] == 700, "the Mac was chasing the whole 1,000")
    }

    @Test("a gift card pays the job down")
    func giftCard() async throws {
        let out = try await Self.owed([Self.job("O-2", price: 1000, paid: 0, giftCard: 400)])
        #expect(out["O-2"] == 600)
    }

    @Test("an ordinary half-paid job is unchanged")
    func ordinary() async throws {
        // The case that was always right, and the reason the bug was invisible.
        let out = try await Self.owed([Self.job("O-3", price: 1000, paid: 400)])
        #expect(out["O-3"] == 600)
    }

    @Test("a job cannot owe a negative amount")
    func overpaid() async throws {
        let out = try await Self.owed([Self.job("O-4", price: 100, paid: 250)])
        #expect(out["O-4"] == 0)
    }

    @Test("the row carries the shared answer, and sorts on it")
    func theRowUsesIt() throws {
        var job = try JSONDecoder().decode(
            Order.self, from: JSONEncoder().encode(Self.job("O-5", price: 1000, paid: 0, credit: 300)))
        #expect(job.owed == 1000, "unresolved, this is the subtraction — and it is wrong")
        job.owedResolved = 700
        #expect(job.owed == 700)
        #expect(!job.isSettled)
        job.owedResolved = 0
        #expect(job.isSettled, "settled follows the shared answer, not the subtraction")
    }

    @Test("a dead engine leaves a number on the screen, not a blank")
    func fallsBack() throws {
        // The money column going empty because the runtime failed would be a
        // worse screen than one that is short by a credit note.
        let job = try JSONDecoder().decode(
            Order.self, from: JSONEncoder().encode(Self.job("O-6", price: 900, paid: 100)))
        #expect(job.owedResolved == nil)
        #expect(job.owed == 800)
    }

    @Test("the book resolves it on load")
    func theBookIsWired() throws {
        // A source guard: `load` is one long async function and there is no
        // seam. It catches the regression that matters — dropping the call and
        // going back to a subtraction on every screen.
        let shop = try String(contentsOf: URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/KhaytApp/Shop.swift"), encoding: .utf8)
        #expect(shop.contains("await resolveOwed(root)"))
        #expect(shop.contains("engine.owedByOrder("))
        // …and after the settings tables, because the rule resolves an order's
        // currency against them.
        guard let tables = shop.range(of: "await readSettingsTables(root)"),
              let resolve = shop.range(of: "await resolveOwed(root)") else {
            Issue.record("the load sequence has changed"); return
        }
        #expect(tables.lowerBound < resolve.lowerBound)
    }
}
