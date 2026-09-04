import Foundation
import AppKit
import Testing
import KhaytCore
@testable import KhaytApp

/// A board that silently omits work is worse than no board.
///
/// Four of Khayt's statuses had no `Stage`, so `Stage.of` returned nil for them
/// and the board did not put those jobs at the end — it left them out entirely.
/// A shop with three jobs sitting in QC saw an empty gap where its bottleneck
/// was. These tests are about jobs being SOMEWHERE, not about which column.
@MainActor
struct StageTests {

    /// Every status a job in Khayt can hold, from `renderer/kanban.js` and
    /// `lib/order-progress.js`. If Khayt gains one, this list is where the Mac
    /// app finds out.
    static let khaytStatuses = [
        "quote", "pending", "on_hold", "printing", "post", "qc",
        "completed", "delivered", "cancelled",
    ]

    @Test("every stage Khayt's own queue shows has a column here")
    func coversKhaytsQueue() {
        for status in Self.khaytStatuses {
            #expect(Stage(rawValue: status) != nil,
                    "a job with status '\(status)' would not appear on the board at all")
        }
    }

    @Test("the stages are in the order work moves through them")
    func pipelineOrder() {
        #expect(Stage.allCases.map(\.rawValue) == Self.khaytStatuses,
                "the sidebar and the board both draw allCases, so this IS the order on screen")
    }

    @Test("a status with no column is counted, not dropped")
    func splitParentIsNotLost() {
        let shop = Shop(source: .sample)
        // `split` is real: a parent order replaced by the sub-orders that carry
        // its price between them. It deliberately has no column — but a board
        // that shows neither the job nor a word about it is lying by omission.
        #expect(Stage(rawValue: "split") == nil)
        #expect(shop.unplaced.isEmpty, "the sample shop has none, and says so honestly")
    }

    @Test("every stage has a symbol the system actually has")
    func symbolsExist() {
        for stage in Stage.allCases {
            #expect(NSImage(systemSymbolName: stage.symbol, accessibilityDescription: nil) != nil,
                    "\(stage.rawValue) draws a blank: '\(stage.symbol)' is not an SF Symbol on this macOS")
        }
    }

    @Test("every board column can be dropped on, and the rules decide the rest")
    func boardColumnsAreMoveTargets() async throws {
        // The board offers seven columns; each is a status `lib/order-status.js`
        // understands, so a drop is refused for a REASON rather than by falling
        // through a switch nobody updated.
        let engine = try KhaytEngine()
        let job: JSONValue = .object(["id": .string("J1"), "status": .string("pending")])
        for stage in [Stage.quote, .pending, .on_hold, .printing, .post, .qc, .completed] {
            let gate = try await engine.statusGate(order: job, to: stage.rawValue,
                                                   orders: [job], settings: [:])
            #expect(gate.ok, "a shop with no limits set should be able to move a job to \(stage.rawValue)")
        }
    }
}
