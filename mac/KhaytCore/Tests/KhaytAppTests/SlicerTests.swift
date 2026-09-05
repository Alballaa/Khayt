import Foundation
import Testing
import KhaytCore
@testable import KhaytApp

/// Opening a model in the shop's own slicer.
@MainActor
struct SlicerTests {

    /// This shop's four, as the book actually holds them — vendor forks and a
    /// space in a bundle name included, because those are the shapes that break.
    static let settings: [String: JSONValue] = [
        "defaultSlicerId": .string("SL-mtep9y1hTW6"),
        "slicers": .array([
            .object(["id": .string("SL-mtep9y1hPAL"), "name": .string("PrusaSlicer"),
                     "path": .string("/Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer"),
                     "args": .string("")]),
            .object(["id": .string("SL-mtep9y1hLXF"), "name": .string("OrcaSlicer"),
                     "path": .string("/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer"),
                     "args": .string("")]),
            .object(["id": .string("SL-mtep9y1hTW6"), "name": .string("Snapmaker Orca"),
                     "path": .string("/Applications/Snapmaker Orca.app/Contents/MacOS/Snapmaker_Orca"),
                     "args": .string("")]),
            .object(["id": .string("SL-mtep9y1hYCX"), "name": .string("Creality Print"),
                     "path": .string("/Applications/Creality Print.app/Contents/MacOS/CrealityPrint"),
                     "args": .string("")]),
        ]),
    ]

    @Test("the shop's slicers are read the way Khayt reads them")
    func readsTheList() async throws {
        let engine = try KhaytEngine()
        let list = try await engine.slicers(settings: Self.settings)
        #expect(list.count == 4)
        #expect(list.map(\.name) == ["PrusaSlicer", "OrcaSlicer", "Snapmaker Orca", "Creality Print"])

        // The default is the one the shop chose, not the first in the array —
        // and on this book those are different, which is the whole point of the
        // field.
        let first = try await engine.defaultSlicer(settings: Self.settings)
        #expect(first?.name == "Snapmaker Orca")
        #expect(first?.id != list.first?.id)
    }

    /// A book written before the list existed carries one slicer under
    /// `settings.slicer`. It still has to work — this is most of Khayt's
    /// installed base by age.
    @Test("a shop with only the legacy single slicer still gets one")
    func legacyShape() async throws {
        let engine = try KhaytEngine()
        let old: [String: JSONValue] = ["slicer": .object([
            "path": .string("/Applications/PrusaSlicer.app"), "args": .string(""),
        ])]
        let list = try await engine.slicers(settings: old)
        #expect(list.count == 1)
        // The name is guessed from the path, because the legacy shape has none.
        #expect(list.first?.name == "PrusaSlicer")
        #expect(try await engine.defaultSlicer(settings: old)?.path == "/Applications/PrusaSlicer.app")
    }

    @Test("a shop with no slicer configured is offered nothing")
    func noSlicers() async throws {
        let engine = try KhaytEngine()
        #expect(try await engine.slicers(settings: [:]).isEmpty)
        #expect(try await engine.defaultSlicer(settings: [:]) == nil)
    }

    // MARK: - What may be launched

    /// THE GUARD IS ASKED, not assumed from the entry existing.
    ///
    /// `settings.slicers[]` arrives in a restored backup and through cloud
    /// sync, so the program named there was chosen by whoever wrote that book,
    /// and the `args` beside it too. The Electron app carried this exact rule
    /// for months and called it nowhere — every one of the paths below was
    /// accepted as a slicer.
    @Test("a program that does not look like a slicer is refused")
    func theAllowlistIsAsked() async throws {
        let engine = try KhaytEngine()
        for path in ["/Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer",
                     "/Applications/Snapmaker Orca.app/Contents/MacOS/Snapmaker_Orca",
                     "/Applications/Creality Print.app/Contents/MacOS/CrealityPrint",
                     "C:/Program Files/OrcaSlicer/orca-slicer.exe"] {
            #expect(try await engine.mayLaunchAsSlicer(path: path), "should allow \(path)")
        }
        // None of these is a shell, and each runs an arbitrary command from its
        // own arguments. A denylist of interpreters lets them all through.
        for path in ["/usr/bin/awk", "/usr/bin/find", "/usr/bin/xargs", "/usr/bin/gdb",
                     "/usr/bin/make", "/bin/busybox", "/usr/bin/git", "/usr/bin/expect",
                     "/bin/bash", "/usr/bin/python3", "", "/usr/local/bin/totally-legit"] {
            #expect(try await engine.mayLaunchAsSlicer(path: path) == false, "should refuse \(path)")
        }
    }

    /// And the launcher actually calls it. Equality with the rule proves the
    /// rule is right; this proves it is reached — the failure that put this
    /// whole area on the list in the first place.
    @Test("the launcher refuses before it opens anything")
    func theLauncherAsks() {
        var asked: [String] = []
        let refusal = FileActions.openInSlicer(URL(fileURLWithPath: "/tmp/model.3mf"),
                                               slicerPath: "/usr/bin/awk") { path in
            asked.append(path)
            return false
        }
        #expect(asked == ["/usr/bin/awk"])
        #expect(refusal == "notAllowed")
    }

    /// A path that passes the allowlist but is not on this Mac is a different
    /// answer, and the shop gets a different sentence.
    @Test("a slicer that is not installed says so rather than failing silently")
    func missingSlicer() {
        let refusal = FileActions.openInSlicer(
            URL(fileURLWithPath: "/tmp/model.3mf"),
            slicerPath: "/Applications/NotInstalledSlicer.app/Contents/MacOS/NotInstalledSlicer"
        ) { _ in true }
        #expect(refusal == "missing")
    }

    // MARK: - Finding the .app

    /// The stored path points at the executable inside the bundle, because that
    /// is what a slicer wants on a command line. Running it directly on macOS
    /// gives a second, dockless copy of an app the shop may already have open,
    /// so the bundle is what gets opened.
    @Test("the executable's bundle is what gets launched")
    func bundleFromExecutable() {
        let cases = [
            ("/Applications/Snapmaker Orca.app/Contents/MacOS/Snapmaker_Orca",
             "/Applications/Snapmaker Orca.app"),
            ("/Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer",
             "/Applications/PrusaSlicer.app"),
            // Already a bundle.
            ("/Applications/OrcaSlicer.app", "/Applications/OrcaSlicer.app"),
            // Not in a bundle at all — a Homebrew or Linux-style install
            // somebody copied over. Handed back unchanged rather than guessed
            // at; NSWorkspace refuses it, which is the honest outcome.
            ("/usr/local/bin/PrusaSlicer", "/usr/local/bin/PrusaSlicer"),
        ]
        for (input, expected) in cases {
            let out = FileActions.appBundle(containing: URL(fileURLWithPath: input))
            #expect(out.path == expected, "\(input) → \(out.path)")
        }
    }

    /// The outer `.app` wins, not an inner one. A helper bundled inside a
    /// slicer would otherwise be launched instead of the slicer.
    @Test("a nested bundle resolves to the outermost one")
    func nestedBundles() {
        let out = FileActions.appBundle(containing: URL(fileURLWithPath:
            "/Applications/OrcaSlicer.app/Contents/Helpers/Updater.app/Contents/MacOS/Updater"))
        #expect(out.path == "/Applications/OrcaSlicer.app")
    }
}
