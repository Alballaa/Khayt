import Foundation
import Testing
@testable import KhaytApp

/// The menu bar, checked against the app rather than against itself.
///
/// "Use the menu bar to give people easy access to all the commands they need
/// to do things in your app" — and three screens the sidebar had always shown
/// were not in it at all, so the only way to reach Expenses, Waste or Reports
/// was to click a row. A screen with no menu route has no keyboard route
/// either, and nothing failed: the sidebar worked, so nobody looked.
///
/// Read as source, because a `Commands` builder cannot be instantiated and
/// asked what is in it.
@MainActor
struct MenuCoverageTests {

    static var menus: String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appending(path: "Sources/KhaytApp/Menus.swift")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }

    /// Every destination the sidebar offers, as the enum spells it.
    static let shelves = ["dashboard", "board", "machines", "inventory",
                          "catalogue", "expenses", "waste", "reports", "customers"]

    @Test("every screen in the sidebar can be reached from the menu bar")
    func everyShelfIsInTheGoMenu() {
        let text = Self.menus
        #expect(!text.isEmpty, "Menus.swift moved")
        for shelf in Self.shelves {
            #expect(text.contains("shop.shelf = .\(shelf)"),
                    "the Go menu has no way to reach .\(shelf)")
        }
        // The two that take an argument.
        #expect(text.contains("shop.shelf = .jobs(nil)"))
        #expect(text.contains("shop.shelf = .library(nil)"))
    }

    /// Two commands on one key is not a conflict anybody is told about: one of
    /// them silently stops working, and which one is undefined.
    @Test("no two commands claim the same key")
    func shortcutsAreUnique() {
        var seen: [String: Int] = [:]
        let text = Self.menus
        for line in text.split(separator: "\n") {
            guard let at = line.range(of: ".keyboardShortcut(") else { continue }
            let call = String(line[at.upperBound...])
            guard let quote = call.firstIndex(of: "\"") else {
                // `.cancelAction` / `.defaultAction` — the system's, not ours.
                continue
            }
            let rest = call[call.index(after: quote)...]
            guard let end = rest.firstIndex(of: "\"") else { continue }
            let key = String(rest[..<end])
            let mods = call.contains("modifiers:")
                ? String(call[call.range(of: "modifiers:")!.upperBound...].prefix(30))
                : "command"
            let normalised = mods
                .replacingOccurrences(of: " ", with: "")
                .replacingOccurrences(of: "[", with: "").replacingOccurrences(of: "]", with: "")
                .split(separator: ")").first.map(String.init) ?? mods
            seen["\(key)+\(normalised)", default: 0] += 1
        }
        let clashes = seen.filter { $0.value > 1 }.keys.sorted()
        #expect(clashes.isEmpty, "two menu items share: \(clashes.joined(separator: ", "))")
        #expect(seen.count > 12, "only \(seen.count) shortcuts found — the parse is wrong")
    }

    /// The two Finder gestures a file library is expected to answer.
    @Test("a print file can be looked at without opening a slicer")
    func quickLookIsReachable() {
        #expect(Self.menus.contains("quickLookSelection"), "no Quick Look in the Model menu")
        let grid = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appending(path: "Sources/KhaytApp/LibraryGrid.swift")
        let text = (try? String(contentsOf: grid, encoding: .utf8)) ?? ""
        #expect(text.contains(".onKeyPress(.space)"), "Space does nothing in the library")
    }

    /// A toolbar search field that only the mouse can reach is a search field
    /// in the wrong app.
    @Test("the search field can be reached from the keyboard")
    func findIsWired() {
        #expect(Self.menus.contains("searchWanted"))
        let window = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appending(path: "Sources/KhaytApp/ShopWindow.swift")
        let text = (try? String(contentsOf: window, encoding: .utf8)) ?? ""
        #expect(text.contains("focusedSceneValue(\\.searchWanted"),
                "the window publishes nothing for ⌘F to act on")
        #expect(text.contains("focusSearchWhenAsked"))
    }
}
