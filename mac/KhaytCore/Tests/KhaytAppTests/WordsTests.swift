import Foundation
import Testing
import KhaytCore
@testable import KhaytApp

/// The app's vocabulary must be complete in every language it offers.
///
/// A missing word does not crash — it renders the KEY, and `queue.printing`
/// sitting in a sidebar is the kind of thing that ships.
@MainActor
struct WordsTests {

    @Test("every Khayt key this app borrows exists in every bundled language")
    func borrowedKeysExist() async throws {
        let engine = try KhaytEngine()
        for language in Words.supported {
            let catalogue = try await engine.translations(language: language)
            #expect(!catalogue.isEmpty, "\(language) loaded no strings at all")
            for key in Words.borrowed {
                let value = catalogue[key]
                #expect(value?.isEmpty == false,
                        "\(language) has no \(key) — the Mac app would show the key itself")
            }
        }
    }

    @Test("every word this app supplies itself carries both languages")
    func ownKeysAreComplete() {
        for (key, values) in Words.own {
            for language in Words.supported {
                let value = values[language]
                #expect(value?.isEmpty == false, "\(key) has no \(language)")
            }
            // An Arabic value identical to the English one is an untranslated
            // string wearing a translation's clothes — the exact failure
            // test/locale-quality.test.js was written for on the shared
            // catalogue. Numbers and symbols are the honest exceptions.
            if let en = values["en"], let ar = values["ar"], en == ar {
                #expect(en.rangeOfCharacter(from: .letters) == nil,
                        "\(key) is the same in both languages: \(en.debugDescription)")
            }
        }
    }

    /// `counting` appends `_one` and asks for it. A key that is not there comes
    /// back AS ITS OWN NAME — the window would read "1 mac.machines_count_one"
    /// — so every base a screen counts with has to have its singular.
    @Test("every count this app makes has a word for one of them")
    func everyCountHasASingular() throws {
        let views = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appending(path: "Sources/KhaytApp")
        var asked: Set<String> = []
        for file in try FileManager.default.contentsOfDirectory(at: views, includingPropertiesForKeys: nil)
            // Not Words.swift: `counting` is DEFINED there, and its own body
            // is not a call site — the first string after it is `"\(n) "`.
            where file.pathExtension == "swift" && file.lastPathComponent != "Words.swift" {
            let text = try String(contentsOf: file, encoding: .utf8)
            var rest = text[...]
            while let at = rest.range(of: "counting(") {
                let after = rest[at.upperBound...]
                rest = after
                guard let quote = after.firstIndex(of: "\"") else { continue }
                let tail = after[after.index(after: quote)...]
                guard let end = tail.firstIndex(of: "\"") else { continue }
                asked.insert(String(tail[..<end]))
            }
        }
        #expect(asked.count >= 5, "found \(asked.count) counted words — the scan is wrong, not the app")

        let words = Words()
        for base in asked.sorted() {
            for key in [base, base + "_one"] {
                #expect(Words.own[key] != nil, "\(key) is counted with and does not exist")
                #expect(Words.own[key]?["ar"]?.isEmpty == false, "\(key) has no Arabic")
                #expect(words.callIt(key) != key, "\(key) would print as its own name")
            }
        }
    }

    @Test("a borrowed key never shadows one this app supplies")
    func noOverlap() async throws {
        // Both catalogues are consulted, Khayt's first. A key in both means this
        // app's word is dead code that reads as if it were in use.
        let engine = try KhaytEngine()
        let catalogue = try await engine.translations(language: "en")
        for key in Words.own.keys {
            #expect(catalogue[key] == nil,
                    "\(key) is in Khayt's catalogue too — this app's copy would never be used")
        }
    }

    @Test("Khayt's word wins, and the key is the last resort")
    func resolutionOrder() async throws {
        let words = Words()
        await words.load("ar", engine: try KhaytEngine())
        #expect(words.language == "ar")
        #expect(words.isRTL)
        #expect(words.layout == .rightToLeft)
        // Borrowed: Khayt's Arabic, not a Swift string.
        #expect(words.callIt("queue.printing") == "قيد الطباعة")
        // Own: this app's Arabic.
        #expect(words.callIt("mac.cancelled") == "ملغى")
        // Neither: the key, visibly.
        #expect(words.callIt("mac.no.such.key") == "mac.no.such.key")
    }

    @Test("an unsupported language falls back to English rather than to nothing")
    func fallsBack() async throws {
        let words = Words()
        await words.load("ja", engine: try KhaytEngine())
        #expect(words.language == "en")
        #expect(!words.isRTL)
        #expect(words.callIt("queue.printing") == "Printing")
    }

    @Test("every stage has a word in both languages")
    func stagesAreNamed() async throws {
        let engine = try KhaytEngine()
        for language in Words.supported {
            let words = Words()
            await words.load(language, engine: engine)
            for stage in Stage.allCases {
                let said = words.callIt(stage.key)
                #expect(said != stage.key, "\(language) has no word for \(stage.rawValue)")
                #expect(!said.isEmpty)
            }
        }
    }
}

/// Everything the menu bar says.
///
/// The menu bar is the one part of the app whose words are decided BEFORE a
/// book is open — a SwiftUI menu title is baked when the bar is built and never
/// rewritten, so `Words.upfront` reads the catalogue that `Words.preload` warms
/// in `main.swift`. A key with no value there does not fall back to English on
/// screen; it renders as the key, in the menu bar, for ever.
@MainActor
struct MenuWordsTests {

    /// Every key any menu asks `Words.upfront` for.
    static let menuKeys = [
        "mac.menu_book", "mac.menu_go", "mac.menu_job", "mac.menu_model",
        "mac.reload", "mac.open_book",
        "mac.dashboard", "mac.all_jobs", "mac.board", "mac.customers",
        "mac.library", "mac.machines", "mac.inventory",
        "mac.favourite", "mac.reveal_in_finder", "mac.open",
        "mac.sort_by", "ord.hold_btn", "pay.modal_title", "queue.delivered", "mac.edit_job", "mac.new_job", "mac.new_customer",
    ]

    @Test("every menu word exists in both languages, warm or not")
    func everyMenuWordResolves() async throws {
        let engine = try KhaytEngine()
        for language in Words.supported {
            let words = Words()
            await words.load(language, engine: engine)
            for key in Self.menuKeys + Stage.allCases.map(\.key) {
                let said = words.callIt(key)
                #expect(said != key, "\(language) has no word for \(key) — the menu would show the key")
                #expect(!said.isEmpty)
            }
        }
    }

    @Test("a cold start still says words, not keys")
    func upfrontWithoutAWarmCatalogue() {
        // Before preload runs — or when it fails, because a store could not be
        // read — `upfront` has only this app's own catalogue. Every key the menu
        // BAR itself needs must be in it, or the bar reads as broken on a Mac
        // with no book on it yet.
        let ownOnly = ["mac.menu_book", "mac.menu_go", "mac.menu_job", "mac.menu_model",
                       "mac.reload", "mac.open_book", "mac.favourite",
                       "mac.reveal_in_finder", "mac.open", "mac.dashboard",
                       "mac.all_jobs", "mac.board", "mac.customers", "mac.library",
                       "mac.machines", "mac.inventory", "mac.sort_by"]
        for key in ownOnly {
            #expect(Words.upfront(key) != key, "\(key) is not in Words.own, so a cold menu shows the key")
        }
    }
}
