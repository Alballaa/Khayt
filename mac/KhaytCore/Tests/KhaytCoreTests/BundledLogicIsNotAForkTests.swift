import Foundation
import Testing
@testable import KhaytCore

/// The bundled JavaScript must be `lib/` byte for byte.
///
/// KhaytCore ships copies of Khayt's pure business modules so the Mac app can
/// load them as bundle resources. A copy is a fork waiting to happen: `lib/`
/// gets a fix, the copy does not, and the Mac app quietly computes last month's
/// VAT. Nothing about that would be visible — both would run, both would return
/// a number.
///
/// So the copies are compared to their originals here, and `mac/sync-js.sh`
/// re-copies them. If this fails, run that; do not edit the copy.
struct BundledLogicIsNotAForkTests {

    /// The repository root, from this file's location.
    static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)          // …/mac/KhaytCore/Tests/KhaytCoreTests/x.swift
            .deletingLastPathComponent()          // KhaytCoreTests
            .deletingLastPathComponent()          // Tests
            .deletingLastPathComponent()          // KhaytCore
            .deletingLastPathComponent()          // mac
            .deletingLastPathComponent()          // repo root
    }

    @Test("every bundled module is identical to lib/")
    func bundledMatchesLib() throws {
        for module in KhaytEngine.modules {
            let original = Self.repoRoot.appending(path: "lib/\(module).js")
            let copy = Self.repoRoot.appending(path: "mac/KhaytCore/Sources/KhaytCore/JS/\(module).js")

            let originalBytes = try Data(contentsOf: original)
            let copyBytes = try Data(contentsOf: copy)

            #expect(originalBytes == copyBytes, """
                mac/KhaytCore/Sources/KhaytCore/JS/\(module).js has drifted from lib/\(module).js.
                The Mac app would compute different numbers from the Electron app.
                Run mac/sync-js.sh — do not edit the copy.
                """)
        }
    }

    @Test("a bundled module cannot need Node")
    func bundledModulesArePure() throws {
        // These run in JavaScriptCore, which has no `require`, no `fs`, no
        // `Buffer`. A module that grew a Node dependency in lib/ would load
        // here and then throw at its first call — from inside a screen.
        for module in KhaytEngine.modules {
            let source = try String(contentsOf: Self.repoRoot.appending(path: "lib/\(module).js"), encoding: .utf8)
            let stripped = source
                .replacing(#/\/\*[\s\S]*?\*\//#, with: "")
                .replacing(#/(^|[^:])\/\/.*$/#.ignoresCase(), with: "")
            #expect(!stripped.contains("require('fs')"), "\(module).js now requires fs")
            #expect(!stripped.contains("require('path')"), "\(module).js now requires path")
            #expect(!stripped.contains("require('crypto')"), "\(module).js now requires crypto")
            #expect(!stripped.contains("process."), "\(module).js now reads `process`, which does not exist here")
        }
    }

    @Test("the module list and the bundled folder agree")
    func noStragglers() throws {
        let dir = Self.repoRoot.appending(path: "mac/KhaytCore/Sources/KhaytCore/JS")
        let onDisk = try FileManager.default.contentsOfDirectory(atPath: dir.path)
            .filter { $0.hasSuffix(".js") }
            .map { String($0.dropLast(3)) }
            .sorted()
        #expect(onDisk == KhaytEngine.modules.sorted(), """
            The bundled folder and KhaytEngine.modules disagree. A file nobody loads is
            dead weight; a module in the list with no file fails at startup.
            """)
    }
}
