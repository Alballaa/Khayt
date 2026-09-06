import Foundation
import CryptoKit
import KhaytCore

/// Adding a model to the shop's library.
///
/// The last piece: `Zip` opens the container, `Mesh` measures what is in it,
/// `geometry-key` and `thumbnail-extract` turn that into the fields a record
/// carries. This puts the file where Khayt puts it and writes the record Khayt
/// would have written.
///
/// ── IT WRITES WHAT THE OTHER APP READS ────────────────────────────────────
///
/// The folder is `<root>/<PF-id>/`, the same `itemDirName` sanitising, and the
/// record carries the same fields `renderer/printfiles.js` builds on import. A
/// record made here opens in Khayt with its thumbnail, its colours and its
/// identity — the `geometryKey` is proven byte-identical to Khayt's own in
/// `Mesh3MFTests`, so a model added on the Mac is recognised as the same model
/// by the app next to it.
///
/// ── IT MOVES THE FILE IN ───────────────────────────────────────────────────
///
/// The original is taken in, not duplicated: a shop importing what it has
/// downloaded does not want two copies of thirty gigabytes, and the vault is
/// meant to become the one place a model lives. Pass `keepOriginal` for a
/// source that is not the shop's to consume.
///
/// The removal is the LAST thing that happens, after the bytes are at the
/// destination, have been read back and compared, and the book holds a record
/// pointing at them. Nothing above it deletes anything, so every refusal —
/// a duplicate, an unreadable file, a book that will not take the write —
/// returns with the original exactly as it was. That ordering is the whole
/// safety argument, and `theOriginalSurvivesEveryFailure` is what holds it.
@MainActor
enum LibraryImport {

    enum Failure: Error, CustomStringConvertible, Equatable {
        case notOurs
        case noLibrary
        case unknownKind(String)
        case alreadyHere(String)
        case failed(String)

        var description: String {
            switch self {
            case .notOurs: return "Another app has this book open."
            case .noLibrary: return "This Mac has no print library folder."
            case .unknownKind(let ext): return "Khayt does not read .\(ext) files."
            case .alreadyHere(let name): return "\(name) is already in the library."
            case .failed(let why): return "Could not add the file: \(why)"
            }
        }
    }

    /// What was added, for the sentence afterwards.
    struct Added: Equatable, Sendable {
        let id: String
        let name: String
        let triangleCount: Int?
        let colours: Int
        /// What the bytes hash to. Carried out so a batch can measure the next
        /// file against this one without reading it a second time.
        let contentHash: String?
        /// True when the original was taken in rather than copied. False for
        /// `keepOriginal`, and false when the removal did not work — a file on
        /// a read-only volume is still imported, it just also stays put.
        let movedIn: Bool
        /// True when the model was measured. A gcode has no mesh and is not a
        /// failure — it simply has no geometry to key on.
        var measured: Bool { triangleCount != nil }
    }

    /// What a print library holds. `zip` is deliberately absent: Khayt unpacks
    /// an archive into several records and that is a decision with a dialog
    /// attached, not a file copy.
    static let kinds: Set<String> = ["stl", "3mf", "obj", "gcode", "gco", "g"]

    /// A name for the file inside the record's folder.
    ///
    /// Derived from the file's own name, as `main.js` does it — unique by
    /// construction rather than by timing, and readable when somebody opens the
    /// vault in the Finder: `head.stl` beside `left-arm.stl` rather than two
    /// base36 stamps. Arabic is kept; separators and control characters are not.
    static func vaultFilename(in dir: URL, originalName: String, ext: String) -> String {
        var stem = originalName
        if let dot = stem.lastIndex(of: "."), dot != stem.startIndex {
            stem = String(stem[stem.startIndex..<dot])
        }
        stem = String(String.UnicodeScalarView(stem.unicodeScalars.filter {
            CharacterSet.alphanumerics.contains($0) || $0 == "_" || $0 == " "
                || $0 == "." || $0 == "-" || (0x0600...0x06FF).contains(Int($0.value))
        }))
        stem = stem.split(separator: " ", omittingEmptySubsequences: true).joined(separator: " ")
        stem = String(stem.prefix(60))
            .trimmingCharacters(in: CharacterSet(charactersIn: ". "))
        let base = stem.isEmpty ? "model" : stem

        var name = "\(base).\(ext)"
        var n = 2
        while FileManager.default.fileExists(atPath: dir.appending(path: name).path) {
            name = "\(base)-\(n).\(ext)"
            n += 1
        }
        return name
    }

    /// SHA-256 of a file, read in pieces.
    ///
    /// `lib/model-identity.js` calls this the certain claim — "the bytes are
    /// identical. Same file." — so it has to be over the whole file, and the
    /// whole file is up to a gigabyte. Nothing is held.
    static func contentHash(of url: URL) throws -> String? {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? handle.close() }
        var digest = SHA256()
        var any = false
        while let chunk = try handle.read(upToCount: 4 << 20), !chunk.isEmpty {
            digest.update(data: chunk)
            any = true
        }
        // An empty file is not a model, and hashing it would give every empty
        // file the same identity — which would then "already exist" for the
        // next one. The shared module refuses it the same way.
        guard any else { return nil }
        return digest.finalize().map { String(format: "%02x", $0) }.joined()
    }

    // MARK: - Adding

    static func add(_ source: URL, shop: Shop, keepOriginal: Bool = false) async throws -> Added {
        guard let build = shop.source.build, StoreLock.weOwnIt(build) else { throw Failure.notOurs }
        guard let roots = shop.libraryRoots else { throw Failure.noLibrary }
        guard let engine = shop.engine else { throw Failure.failed("the engine is not loaded") }

        let added = try await add(source,
                                  storeURL: build.storeURL,
                                  libraryRoot: URL(fileURLWithPath: roots.primary),
                                  knownHashes: Set(shop.files.compactMap(\.contentHash)),
                                  nameOfExisting: { hash in
                                      shop.files.first { $0.contentHash == hash }?.title
                                  },
                                  engine: engine,
                                  keepOriginal: keepOriginal,
                                  owns: { StoreLock.weOwnIt(build) },
                                  whoHasIt: { StoreLock.describe(StoreLock.verdict(for: build)) })
        await shop.load(shop.source)
        return added
    }

    /// The import itself, addressed by path.
    ///
    /// NOT a convenience: it is the seam the test needs. Everything below —
    /// moving a real file, measuring it, writing a real record into a real
    /// store — runs against a throwaway directory in the tests, because an
    /// import whose only trial run was on a shop's live library has not been
    /// tested, it has been risked. `StoreWriter` splits itself the same way and
    /// says the same thing.
    static func add(_ source: URL, storeURL: URL, libraryRoot: URL,
                    knownHashes: Set<String>,
                    nameOfExisting: (String) -> String?,
                    engine: KhaytEngine,
                    keepOriginal: Bool = false,
                    owns: @escaping () -> Bool,
                    whoHasIt: @escaping () -> String?) async throws -> Added {
        let ext = source.pathExtension.lowercased()
        guard kinds.contains(ext) else { throw Failure.unknownKind(ext) }

        let originalName = source.lastPathComponent

        // THE SOURCE IS HASHED FIRST, and that is the whole shape of this.
        //
        // It used to copy, then hash the copy, then delete the copy again if the
        // hash turned out to be one the library already had. That is a lot of
        // disk for a question that can be answered before touching anything —
        // and once the import MOVES rather than copies, "delete it again" stops
        // being a tidy-up and starts being the shop's only copy.
        //
        // So: know the bytes, refuse duplicates while the file is still sitting
        // untouched where its owner put it, and only then begin.
        guard let hash = try? contentHash(of: source) else {
            throw Failure.failed("could not read \(originalName)")
        }
        if knownHashes.contains(hash) {
            throw Failure.alreadyHere(nameOfExisting(hash) ?? originalName)
        }

        // `uid` supplies the dash itself, as every other caller relies on —
        // `Shop.uid("SL")` is `SL-…`. Passing "PF-" and an empty prefix made
        // `PF--mtppyk14XFK`, beside Khayt's own `PF-mtjwvj1w05A`. Nothing reads
        // the shape, so it broke nothing; it just did not match the book it was
        // writing into, and every folder in the vault wore the extra dash.
        let id = Shop.uid("PF")
        let dir = libraryRoot.appending(path: LibraryLocation.itemDirName(id))
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        } catch { throw Failure.failed(error.localizedDescription) }

        let filename = vaultFilename(in: dir, originalName: originalName, ext: ext)
        let destination = dir.appending(path: filename)
        do { try FileManager.default.copyItem(at: source, to: destination) }
        catch {
            try? FileManager.default.removeItem(at: dir)
            throw Failure.failed(error.localizedDescription)
        }

        // COPY, READ BACK, COMPARE — never on the strength of the copy call
        // returning. `lib/print-library-migrate.js` states the rule this
        // follows: "a duplicate is recoverable, a deletion is not", and a short
        // write to a share that dropped mid-transfer returns without throwing
        // exactly like a good one does.
        guard (try? contentHash(of: destination)) == hash else {
            try? FileManager.default.removeItem(at: dir)
            throw Failure.failed("\(originalName) did not arrive intact")
        }

        let size = (try? FileManager.default.attributesOfItem(atPath: destination.path)[.size]
                    as? Int) ?? 0

        var geometry: Mesh.Measurement?
        switch ext {
        case "3mf": geometry = try? Mesh.measure3MF(destination)
        case "stl": geometry = try? Mesh.measureSTL(destination)
        default: geometry = nil          // obj and gcode carry no mesh this reads
        }

        var key: String?
        if let g = geometry {
            key = try? await engine.geometryKey(triangleCount: g.triangleCount,
                                                volumeMm3: g.volumeMm3,
                                                x: g.x, y: g.y, z: g.z)
        }

        var colours: [JSONValue] = []
        var swapCount = 0
        var thumbFile: String?
        if ext == "3mf" {
            let found = try? await readPreviewAndColours(destination, dir: dir, engine: engine)
            colours = found?.colours ?? []
            swapCount = found?.swapCount ?? 0
            thumbFile = found?.thumbFile
        }

        let name = originalName.replacingOccurrences(
            of: "\\.[^.]+$", with: "", options: .regularExpression)
        let record = self.record(id: id, name: name, originalName: originalName,
                                 filename: filename, ext: ext, size: size,
                                 hash: hash, key: key, colours: colours,
                                 swapCount: swapCount, thumbFile: thumbFile)
        do {
            try StoreWriter.update(storeURL: storeURL, owns: owns, whoHasIt: whoHasIt) { root in
                var rows: [JSONValue] = []
                if case .array(let existing)? = root["printFiles"] { rows = existing }
                // Newest first, as the other app does — a shop that has just
                // added something looks for it at the top.
                rows.insert(.object(record), at: 0)
                root["printFiles"] = .array(rows)
            }
        } catch {
            // The book refused it, so the copy has no record to belong to.
            try? FileManager.default.removeItem(at: dir)
            throw Failure.failed(String(describing: error))
        }

        // THE LAST THING, AFTER EVERYTHING ELSE HAS SUCCEEDED.
        //
        // The original is removed here and nowhere else, and only once all
        // three things are true: the bytes are at the destination, they have
        // been read back and match, and the book has a record pointing at them.
        // Every failure above returns with the source exactly as it was, which
        // is why none of them needs a way to put it back.
        //
        // `keepOriginal` is for a source that is not the shop's to consume — a
        // USB stick, a customer's share, a read-only volume. A failure to
        // remove is NOT a failed import: the file is in the library and in the
        // book, and the worst case is one duplicate left in a downloads folder,
        // which is the recoverable half of the rule above.
        var movedIn = false
        if !keepOriginal {
            do { try FileManager.default.removeItem(at: source); movedIn = true }
            catch { movedIn = false }
        }

        return Added(id: id, name: name, triangleCount: geometry?.triangleCount,
                     colours: colours.count, contentHash: hash, movedIn: movedIn)
    }

    /// The record itself.
    ///
    /// Separated from the copying so it can be checked without a book, a lock
    /// and a library folder — the three things a full import needs and a test
    /// should not have to build to find out whether a field is misspelled.
    ///
    /// The field names are `renderer/printfiles.js`'s, exactly: `colors` and not
    /// `colours`, `thumbFile` and not `thumb`, `favorite` and not `favourite`. A
    /// record with one of them wrong loads in both apps and shows a model with
    /// no colours and no picture, which reads as a bad file rather than as a bad
    /// record.
    static func record(id: String, name: String, originalName: String,
                       filename: String, ext: String, size: Int,
                       hash: String?, key: String?, colours: [JSONValue],
                       swapCount: Int, thumbFile: String?,
                       now: Double = Date().timeIntervalSince1970 * 1000)
        -> [String: JSONValue] {
        [
            "id": .string(id),
            "name": .string(name.isEmpty ? "Untitled" : name),
            "originalName": .string(originalName),
            // TWO DIFFERENT SHAPES, and that is what the book holds rather
            // than an oversight to tidy: `createdAt` is epoch milliseconds and
            // `updatedAt` is an ISO string, because the second one is written
            // by the store's stamping and the first by whoever made the record.
            // `LibraryFile.updatedAt` is a `String?`, so a number there decodes
            // as nothing and the model shows no date at all.
            "createdAt": .number(now),
            "updatedAt": .string(iso(now)),
            "sourceFile": .object([
                "filename": .string(filename), "originalName": .string(originalName),
                "size": .number(Double(size)), "ext": .string(ext),
                // `model` or `gcode`, the same two words the other app writes.
                "kind": .string(["stl", "3mf", "obj"].contains(ext) ? "model" : "gcode"),
            ]),
            "parsed": .object([:]),
            "colors": .array(colours),
            "swapCount": .number(Double(swapCount)),
            "thumbFile": thumbFile.map(JSONValue.string) ?? .null,
            "thumbSource": thumbFile == nil ? .null : .string("embedded"),
            "userPhoto": .null,
            "slicerProfileId": .null, "testedNotes": .string(""),
            "tags": .array([]), "folder": .string(""), "material": .string(""),
            "favorite": .bool(false),
            "contentHash": hash.map(JSONValue.string) ?? .null,
            "geometryKey": key.map(JSONValue.string) ?? .null,
        ]
    }

    /// Epoch milliseconds as the store writes a timestamp: ISO-8601 in UTC, to
    /// the millisecond, exactly as `2026-09-05T15:34:26.189Z`.
    static func iso(_ millis: Double) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: Date(timeIntervalSince1970: millis / 1000))
    }

    /// The embedded preview and the filament colours, from a 3MF.
    ///
    /// Both decisions are the shared module's: which preview wins — the biggest
    /// `Metadata/*.png` — and what the colours are. This reads the members and
    /// hands over the bytes.
    private static func readPreviewAndColours(_ file: URL, dir: URL, engine: KhaytEngine)
        async throws -> (thumbFile: String?, colours: [JSONValue], swapCount: Int) {
        let entries = try Zip.entries(of: file)
        func text(_ name: String) -> String {
            guard let entry = entries.first(where: { $0.name.lowercased() == name.lowercased() }),
                  let data = try? Zip.data(of: entry, in: file) else { return "" }
            return String(decoding: data, as: UTF8.self)
        }

        var thumbFile: String?
        let previews = entries.filter {
            $0.name.lowercased().hasPrefix("metadata/") && $0.name.lowercased().hasSuffix(".png")
        }
        if let biggest = previews.max(by: { $0.size < $1.size }),
           let png = try? Zip.data(of: biggest, in: file) {
            // `thumb.png`, not `thumb.jpg`. The record names the file, both apps
            // read the name, and re-encoding a PNG the slicer already made into
            // a JPEG would cost quality for a filename.
            let named = "thumb.png"
            try? png.write(to: dir.appending(path: named))
            thumbFile = named
        }

        let found = (try? await engine.coloursFromConfigs(
            sliceInfo: text("Metadata/slice_info.config"),
            projectSettings: text("Metadata/project_settings.config"),
            modelSettings: text("Metadata/model_settings.config"),
            prusa: text("Metadata/Slic3r_PE.config").isEmpty
                ? text("Metadata/Prusa_Slicer.config") : text("Metadata/Slic3r_PE.config")))
        return (thumbFile, found?.colors ?? [], found?.swapCount ?? 0)
    }
}
