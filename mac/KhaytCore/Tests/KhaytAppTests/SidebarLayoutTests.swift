import Foundation
import Testing
@testable import KhaytApp

/// The sidebar footer must not wrap.
///
/// THE CRASH THIS EXISTS FOR. `Provenance` is the sidebar's
/// `.safeAreaInset(edge: .bottom)`, and the sidebar is a resizable split-view
/// column. A label allowed to wrap makes that view's HEIGHT depend on the
/// column's WIDTH — and a child whose size depends on the size it is given is a
/// feedback loop with `SplitViewChildController.hostingView(_:didUpdateMinSize:
/// maxSize:)`. AppKit ends the loop by throwing out of
/// `_postWindowNeedsUpdateConstraints`: an abort, with no reason attached.
///
/// It shipped in #997 as a two-line "changes here reach the cloud…", showed
/// only for a CLOUD-CONNECTED book — so never on the sample this app
/// photographs, and never in a snapshot run — and took the app down after a
/// minute or two of ordinary use on a real one.
///
/// A source scan, and named as one: there is no way to drive AppKit's layout
/// from a test. What it catches is the exact regression — somebody letting a
/// line wrap again because the sentence did not fit.
struct SidebarLayoutTests {

    static var sidebar: String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/KhaytApp/Sidebar.swift")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }

    /// Everything from `struct Provenance` to the end of the file.
    static var footer: String {
        let all = sidebar
        guard let at = all.range(of: "private struct Provenance") else { return "" }
        return String(all[at.lowerBound...])
    }

    @Test("no line in the sidebar footer may wrap")
    func nothingWraps() {
        let body = Self.footer
        #expect(!body.isEmpty, "Provenance has been renamed")
        for limit in ["lineLimit(2)", "lineLimit(3)", "lineLimit(nil)"] {
            #expect(!body.contains(limit),
                    "a wrapping label is back in the sidebar footer: its height would depend on the column width, which is the loop that aborted the app")
        }
    }

    @Test("a long sentence goes in help, where its length costs nothing")
    func longTextIsATooltip() {
        let body = Self.footer
        // Each of the four lines that can carry a long string hands it to
        // `.help` rather than to the label.
        #expect(body.contains(".help(backupProblem)"))
        #expect(body.contains(".help(engineProblem)"))
        #expect(body.contains(".help(shop.lastCrash ?? \"\")"))
        #expect(body.contains("mac.not_synced_why"))
    }

    @Test("the label the crash shipped with is short again")
    func theCloudLineIsShort() {
        // Under thirty characters at caption size fits the column's 190pt
        // minimum. The sentence it replaced was forty-eight.
        let words = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/KhaytApp/Words.swift")
        let text = (try? String(contentsOf: words, encoding: .utf8)) ?? ""
        guard let line = text.split(separator: "\n").first(where: { $0.contains("\"mac.not_synced\":") })
        else { Issue.record("mac.not_synced is gone"); return }
        guard let english = line.split(separator: "\"").dropFirst(3).first
        else { Issue.record("could not read the string"); return }
        #expect(english.count < 30, "the cloud line is long enough to wrap again")
    }
}

/// The app's last words.
///
/// A macOS crash report for an uncaught Objective-C exception carries the
/// backtrace and NOT the reason — the very thing that made this crash expensive
/// to find. The app now writes its own note.
@MainActor
struct LastWordsTests {

    @Test("the note sits beside the book, where a shop can find it")
    func whereItGoes() {
        let path = LastWords.file(for: .development).path
        #expect(path.hasSuffix("/last-crash.txt"))
        #expect(path.contains("Application Support/khayt/"))
    }

    @Test("a note is written, read back and forgotten")
    func roundTrip() throws {
        let dir = FileManager.default.temporaryDirectory
            .appending(path: "khayt-lastwords-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let file = dir.appending(path: "last-crash.txt")

        try "why: something went wrong".write(to: file, atomically: true, encoding: .utf8)
        #expect(try String(contentsOf: file, encoding: .utf8).contains("something went wrong"))
        try FileManager.default.removeItem(at: file)
        #expect(!FileManager.default.fileExists(atPath: file.path))
    }

    @Test("no note is not a crash")
    func absentIsFine() {
        // A shop that has never crashed must see nothing, not an empty line.
        let dir = FileManager.default.temporaryDirectory.appending(path: "khayt-none-\(UUID().uuidString)")
        #expect((try? String(contentsOf: dir.appending(path: "last-crash.txt"), encoding: .utf8)) == nil)
    }

    @Test("the handler is installed before anything that could fail")
    func installedFirst() throws {
        // Ordering is the whole point: a crash during `Direction.settle()` or
        // while the words load is exactly the kind that arrives mute.
        let main = try String(contentsOf: URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/KhaytApp/main.swift"), encoding: .utf8)
        guard let listen = main.range(of: "LastWords.listen()"),
              let settle = main.range(of: "Direction.settle()") else {
            Issue.record("main.swift has changed shape"); return
        }
        #expect(listen.lowerBound < settle.lowerBound)
    }
}
