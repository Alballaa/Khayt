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
