import Foundation
import AppKit
import KhaytCore

/// `Khayt --import <path>…` — the library import without the window.
///
/// ── WHY A COMMAND AND NOT JUST THE MENU ───────────────────────────────────
///
/// A shop's models arrive as a downloads folder with three thousand files in
/// it. The File menu can take that folder now, but a run that long wants to be
/// startable from a script, repeatable, and above all REHEARSABLE — `--dry-run`
/// says exactly what would move before anything does, which is the difference
/// between an import a shop can check and one it has to trust.
///
/// It shares `LibraryImport.addMany` with the menu, so the two cannot drift on
/// what counts as a model, what counts as a duplicate, or when an original is
/// removed. What lives here is only the shape of a terminal: arguments in,
/// lines out, an exit code at the end.
///
/// ── IT TAKES THE BOOK ─────────────────────────────────────────────────────
///
/// The same lock the window takes, for the same reason: two processes writing
/// the store is how a shop loses a day's work. If Khayt is open, this refuses
/// and says which app has it rather than waiting or forcing.
@MainActor
enum ImportCommand {

    /// What was asked for. Parsed away from everything else so the argument
    /// handling can be tested without a book, a lock, or a library folder.
    struct Options: Equatable {
        var paths: [String] = []
        var keepOriginals = false
        var dryRun = false
    }

    enum Parsed: Equatable {
        case run(Options)
        /// `--import` was not asked for; this is an ordinary launch.
        case notAsked
        case usage(String)
    }

    static let usage = """
        Khayt --import <path>… [--keep-originals] [--dry-run]

          <path>             a model, or a folder to walk for models
          --keep-originals   copy them in; the default is to MOVE
          --dry-run          say what would happen and change nothing
        """

    static func parse(_ arguments: [String]) -> Parsed {
        var rest = Array(arguments.dropFirst())
        guard let flag = rest.firstIndex(of: "--import") else { return .notAsked }
        rest.remove(at: flag)

        var options = Options()
        for argument in rest {
            switch argument {
            case "--keep-originals": options.keepOriginals = true
            case "--dry-run": options.dryRun = true
            // AppKit puts its own arguments on a launched bundle — `-NSDocument…`,
            // and `-psn_…` when Finder opens it. Passing those to the walker
            // would report each as a path that is not there.
            case let other where other.hasPrefix("-"):
                if other.hasPrefix("-psn_") || other.hasPrefix("-NS") { continue }
                return .usage("Khayt does not know the option \(other).\n\n\(usage)")
            case let path: options.paths.append(path)
            }
        }
        guard !options.paths.isEmpty else {
            return .usage("--import needs at least one file or folder.\n\n\(usage)")
        }
        return .run(options)
    }

    // MARK: - Running it

    private static func say(_ line: String) {
        FileHandle.standardOutput.write(Data((line + "\n").utf8))
    }

    private static func complain(_ line: String) {
        FileHandle.standardError.write(Data((line + "\n").utf8))
    }

    /// Returns the process's exit code: 0 when everything asked for arrived.
    static func run(_ options: Options) async -> Int32 {
        guard let source = Shop.available.first(where: \.isReal),
              let build = source.build else {
            complain("There is no Khayt book on this Mac to import into.")
            return 2
        }

        // Read-only until the last moment. A dry run never takes the lock,
        // so it can be done while the app is open.
        let shop = Shop()
        await shop.load(source)
        guard let engine = shop.engine else {
            complain("The shared rules did not load; nothing was imported.")
            return 2
        }
        guard let roots = shop.libraryRoots else {
            complain(LibraryImport.Failure.noLibrary.description)
            return 2
        }

        let chosen = options.paths.map { URL(fileURLWithPath: ($0 as NSString).expandingTildeInPath) }
        let missing = chosen.filter { !FileManager.default.fileExists(atPath: $0.path) }
        guard missing.isEmpty else {
            complain("Not there: " + missing.map(\.path).joined(separator: ", "))
            return 2
        }

        let files = Shop.modelsUnder(chosen, skipping: roots.primary)
        guard !files.isEmpty else {
            complain("Nothing there Khayt can read.")
            return 1
        }

        let bytes = files.reduce(0) { total, file in
            total + ((try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? Int) ?? 0)
        }
        say("book:    \(build.storeURL.path)")
        say("library: \(roots.primary)")
        say("found:   \(files.count) models, \(Self.size(bytes))")
        say(options.keepOriginals ? "mode:    copy, leaving the originals"
                                  : "mode:    MOVE, taking the originals in")

        if options.dryRun {
            // The whole point of a rehearsal is seeing the list, so it is
            // printed rather than counted. A shop about to move three thousand
            // files is entitled to read them first.
            say("")
            for file in files { say("  would import  \(file.path)") }
            say("")
            say("dry run: nothing was moved, copied or written.")
            return 0
        }

        guard let claim = StoreLock.take(for: build) else {
            let who = StoreLock.held(StoreLock.verdict(for: build))
            complain("\(who?.app ?? "Another app") has this book open. Close it and try again.")
            return 3
        }
        defer { StoreLock.release(claim, for: build) }

        let titles = Dictionary(shop.files.compactMap { f in
            f.contentHash.map { ($0, f.title) }
        }, uniquingKeysWith: { a, _ in a })

        say("")
        let started = Date()
        let report = await LibraryImport.addMany(
            files,
            storeURL: build.storeURL,
            libraryRoot: URL(fileURLWithPath: roots.primary),
            knownHashes: Set(shop.files.compactMap(\.contentHash)),
            nameOfExisting: { titles[$0] },
            engine: engine,
            keepOriginal: options.keepOriginals,
            owns: { StoreLock.weOwnIt(build) },
            whoHasIt: { StoreLock.describe(StoreLock.verdict(for: build)) },
            progress: { done, total, file in
                // Numbered, so a run that stops halfway says where it got to.
                say("[\(done + 1)/\(total)] \(file.lastPathComponent)")
            })

        say("")
        say("moved in:   \(report.moved)")
        say("already in: \(report.duplicates)")
        say("failed:     \(report.failures.count)")
        for failure in report.failures { complain("  \(failure)") }
        say(String(format: "took %.0f s", Date().timeIntervalSince(started)))
        return report.failures.isEmpty ? 0 : 1
    }

    private static func size(_ bytes: Int) -> String {
        let units = ["B", "kB", "MB", "GB", "TB"]
        var value = Double(bytes), i = 0
        while value >= 1000, i < units.count - 1 { value /= 1000; i += 1 }
        return String(format: i == 0 ? "%.0f %@" : "%.1f %@", value, units[i])
    }
}
