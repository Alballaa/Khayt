import Foundation
import Testing
import KhaytCore
@testable import KhaytApp

/// Saying that this app does not sync.
///
/// It writes to the book on this Mac and stamps every record, so the Electron
/// app's next sync picks the change up. That is the whole mechanism, and it
/// only runs when that app runs — so a shop keeping its book on two machines
/// and no longer opening Khayt would have the two drift apart with nothing
/// said. That is the one failure worth putting on screen BEFORE the feature
/// exists, because it is silent and it costs the most.
///
/// This shop's own book is connected: `enabled`, `verified`, a `shopId` and
/// `lastServerRev: 12`.
@MainActor
struct CloudNoticeTests {

    static func shop(_ cloud: [String: JSONValue]?) -> Bool {
        Shop.cloudConnected(cloud.map { ["cloud": .object($0)] } ?? [:])
    }

    @Test("a connected book is told")
    func connected() {
        #expect(Self.shop([
            "enabled": .bool(true), "verified": .bool(true), "shopId": .string("shop_282eb"),
        ]))
    }

    @Test("a book that never connected is not nagged")
    func neverConnected() {
        // A line saying "this does not sync" to a shop with nothing to sync to
        // is a line people stop reading, and then they stop reading the one
        // that matters.
        #expect(!Self.shop(nil))
        #expect(!Self.shop([:]))
    }

    @Test("a book that switched the cloud off is not nagged either")
    func switchedOff() {
        #expect(!Self.shop([
            "enabled": .bool(false), "verified": .bool(true), "shopId": .string("shop_282eb"),
        ]))
    }

    @Test("a half-finished connection is not a stranded one")
    func notYetVerified() {
        // Started connecting and never finished: there is no other device
        // waiting, so telling it its changes are stranded is a false alarm.
        #expect(!Self.shop([
            "enabled": .bool(true), "verified": .bool(false), "shopId": .string("shop_282eb"),
        ]))
        #expect(!Self.shop([
            "enabled": .bool(true), "shopId": .string("shop_282eb"),
        ]), "no answer about verification is not a yes")
    }

    @Test("a connection with no shop is not a connection")
    func noShopId() {
        #expect(!Self.shop([
            "enabled": .bool(true), "verified": .bool(true), "shopId": .string(""),
        ]))
    }

    @Test("the sidebar carries it, and only when connected")
    func theSidebarSaysIt() throws {
        let sidebar = try String(contentsOf: URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/KhaytApp/Sidebar.swift"), encoding: .utf8)
        #expect(sidebar.contains("if shop.cloudConnected {"))
        // It says what sync is DOING now rather than one standing sentence, so
        // what the sidebar has to carry is the status, not a fixed key.
        #expect(sidebar.contains("Self.syncLine(shop)"))
        #expect(sidebar.contains("shop.syncStatus"))
    }
}
