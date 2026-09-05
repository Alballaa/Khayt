import Foundation
import Testing
@testable import KhaytApp

/// Nothing on a screen may be written in English in the source.
///
/// THIS IS THE GUARD, and it exists because the last two of these were found in
/// a photograph. A shop running Khayt in Arabic saw its customers' names in
/// English on one screen (#994) and, until this file, read "No jobs yet",
/// "Reveal in Finder", "Marked urgent" and forty more the same way — every one
/// of them under a right-to-left toolbar.
///
/// A string literal handed to a view is not a compile error, not a lint error,
/// and looks perfectly correct in the language it happens to be written in. The
/// only thing that catches it is a rule, so this is the rule: **if it reaches a
/// view, it comes from `Words`.**
@MainActor
struct WordsAreTranslatedTests {

    /// Constructors whose first argument lands on screen.
    static let shows = ["Text", "Label", "Button", "Toggle", "TextField", "SecureField",
                        "ContentUnavailableView", "DetailSection", "DetailLine",
                        "Picker", "LabeledContent"]
    /// Modifiers whose argument lands on screen — or in VoiceOver, which counts.
    static let modifiers = [".help", ".accessibilityLabel", ".navigationTitle"]

    /// Files that legitimately hold English, with the reason.
    ///
    /// Kept short on purpose. Each line here is a place a shop could still be
    /// shown a word it does not read.
    static let exempt: [String: String] = [
        // The dictionary itself: English is one of the two columns.
        "Words.swift": "the catalogue — English sits beside Arabic by design",
        // Low-level writers with no interface language in scope. What they carry
        // is a fallback for a lock whose holder did not name itself, and
        // threading `Words` into a file writer to say it would be worse than the
        // gap. KNOWN GAP: these four sentences are English in every language.
        "StoreWriter.swift": "a nonisolated writer, below the interface",
        "StoreLock.swift": "a nonisolated lock, below the interface",
        "Restore.swift": "shares the writer's refusals",
    ]

    /// Words that are the same in every language, or are not words.
    static func isNotAWord(_ text: String) -> Bool {
        // Take the interpolations out first. What is left is what a shop
        // actually has to read: `"×\(part.qty)"` is a multiplication sign and a
        // number, and neither of those is English.
        let literal = text.replacingOccurrences(of: #"\\\([^)]*\)"#, with: "",
                                                options: .regularExpression)
        if literal.rangeOfCharacter(from: .letters) == nil { return true }
        if literal.trimmingCharacters(in: .whitespaces).count < 3 { return true }
        if text.count < 3 { return true }                      // "—", "×", "mm"
        if text.hasPrefix("\\(") { return true }                // pure interpolation
        if !text.contains(" ") && text.first?.isLowercase == true { return true }  // a key or an id
        // A locale key, which is the whole point.
        if text.range(of: #"^[a-z][a-z0-9]*\.[a-z0-9_.]+$"#, options: .regularExpression) != nil {
            return true
        }
        // Names and marks that do not translate.
        return ["Khayt", "SAR", "PLA", "PETG", "VAT No.", "+966 5x xxx xxxx"].contains(text)
    }

    @Test("no screen in this app spells anything out in English")
    func everyVisibleStringComesFromWords() throws {
        let views = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appending(path: "Sources/KhaytApp")
        let files = try FileManager.default.contentsOfDirectory(at: views, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }
        #expect(files.count > 30, "the source moved — this test is reading the wrong directory")

        let calls = (Self.shows.map { "\($0)(" } + Self.modifiers.map { "\($0)(" })
        var found: [String] = []

        for file in files.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
            let name = file.lastPathComponent
            if Self.exempt[name] != nil { continue }
            let text = try String(contentsOf: file, encoding: .utf8)
            for (n, line) in text.split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                if trimmed.hasPrefix("//") { continue }
                for call in calls {
                    var search = trimmed[...]
                    while let at = search.range(of: call) {
                        let after = search[at.upperBound...]
                        search = after
                        guard let quote = after.first, quote == "\"" else { continue }
                        let rest = after.dropFirst()
                        guard let end = rest.firstIndex(of: "\"") else { continue }
                        let literal = String(rest[..<end])
                        if Self.isNotAWord(literal) { continue }
                        found.append("\(name):\(n + 1)  \(call)\"\(literal)\"")
                    }
                }
            }
        }

        #expect(found.isEmpty, """
            \(found.count) string(s) reach a screen without going through Words:

            \(found.joined(separator: "\n"))

            Add a key to `Words.own` with its Arabic and call `words.callIt(_:)`.
            """)
    }

    /// Every exemption names a file that exists, so the list cannot quietly
    /// grow to cover files that were renamed away.
    @Test("nothing is exempt that is not there")
    func exemptionsAreReal() throws {
        let views = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appending(path: "Sources/KhaytApp")
        for (name, why) in Self.exempt {
            #expect(FileManager.default.fileExists(atPath: views.appending(path: name).path),
                    "\(name) is exempt (\(why)) and does not exist")
        }
    }
}
