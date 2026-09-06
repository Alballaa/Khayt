import Foundation
import CryptoKit
import Testing
import KhaytCore
@testable import KhaytApp

/// Adding a model to the library.
///
/// The naming and the hashing are tested directly. The whole write is not
/// simulated: it needs a real book, a real lock and a real library folder, and a
/// test that builds all three is testing its own scaffolding. What it does
/// instead is check the pieces that decide whether the record is right.
@MainActor
struct LibraryImportTests {

    static func tempDir() throws -> URL {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appending(path: "khayt-import-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    // MARK: - The name inside the vault

    /// Readable in the Finder, and unique without depending on the clock.
    ///
    /// The scheme it replaced was `model-<base36 timestamp>`, which collides
    /// when two files land in the same millisecond — and a print made of
    /// several parts puts them all in ONE folder, which is exactly that case.
    /// A collision there is one part silently overwriting another.
    @Test("the stored name comes from the file's own name")
    func naming() throws {
        let dir = try Self.tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        #expect(LibraryImport.vaultFilename(in: dir, originalName: "head.stl", ext: "stl")
                == "head.stl")
        #expect(LibraryImport.vaultFilename(in: dir, originalName: "Hulk Helmet COLOR.3mf",
                                            ext: "3mf") == "Hulk Helmet COLOR.3mf")
    }

    /// Arabic survives. This shop names files in two languages and a stem
    /// stripped to nothing would put every Arabic model in the vault as
    /// `model.3mf`, colliding with the next one.
    @Test("an Arabic name is kept")
    func arabicName() throws {
        let dir = try Self.tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let out = LibraryImport.vaultFilename(in: dir, originalName: "خوذة الهيكل.3mf", ext: "3mf")
        #expect(out.contains("خوذة"), "got \(out)")
        #expect(out.hasSuffix(".3mf"))
    }

    /// Separators and control characters are dropped, so nothing written here
    /// can climb out of the record's own folder.
    @Test("a name that tries to leave the folder cannot")
    func noEscaping() throws {
        let dir = try Self.tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        for nasty in ["../../etc/passwd.stl", "a/b/c.stl", "..\\..\\x.stl", "/absolute.stl"] {
            let out = LibraryImport.vaultFilename(in: dir, originalName: nasty, ext: "stl")
            #expect(!out.contains("/"), "\(nasty) → \(out)")
            #expect(!out.contains("\\"), "\(nasty) → \(out)")
            #expect(!out.hasPrefix("."), "\(nasty) → \(out)")
        }
    }

    @Test("a second file of the same name does not overwrite the first")
    func collision() throws {
        let dir = try Self.tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let first = LibraryImport.vaultFilename(in: dir, originalName: "part.stl", ext: "stl")
        try Data("x".utf8).write(to: dir.appending(path: first))
        let second = LibraryImport.vaultFilename(in: dir, originalName: "part.stl", ext: "stl")
        #expect(first == "part.stl")
        #expect(second == "part-2.stl")
        try Data("y".utf8).write(to: dir.appending(path: second))
        #expect(LibraryImport.vaultFilename(in: dir, originalName: "part.stl", ext: "stl")
                == "part-3.stl")
    }

    @Test("a name with nothing usable in it still gets one")
    func unusableName() throws {
        let dir = try Self.tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        #expect(LibraryImport.vaultFilename(in: dir, originalName: "///.stl", ext: "stl")
                == "model.stl")
        #expect(LibraryImport.vaultFilename(in: dir, originalName: "", ext: "3mf")
                == "model.3mf")
    }

    // MARK: - Identity

    /// The hash is over the whole file and matches what any other tool would
    /// say, which is the point of using SHA-256 at all.
    @Test("the content hash is the file's SHA-256")
    func hashing() throws {
        let dir = try Self.tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let url = dir.appending(path: "a.bin")
        try Data("abc".utf8).write(to: url)
        // The published SHA-256 of "abc".
        #expect(try LibraryImport.contentHash(of: url)
                == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    /// Read in pieces, so a file larger than one read still hashes correctly.
    @Test("a file bigger than one read hashes the same as one write")
    func hashingLargeFile() throws {
        let dir = try Self.tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let url = dir.appending(path: "big.bin")
        // Past the 4 MB read used inside, with a pattern rather than zeros so a
        // dropped chunk changes the answer.
        let data = Data((0..<(9 << 20)).map { UInt8($0 % 253) })
        try data.write(to: url)

        let streamed = try LibraryImport.contentHash(of: url)
        let atOnce = SHA256Digest.hex(of: data)
        #expect(streamed == atOnce)
    }

    /// An empty file is not a model. Hashing it would give every empty file one
    /// identity, and the second one would "already exist".
    @Test("an empty file has no identity")
    func emptyHasNoHash() throws {
        let dir = try Self.tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let url = dir.appending(path: "empty.bin")
        try Data().write(to: url)
        #expect(try LibraryImport.contentHash(of: url) == nil)
    }

    // MARK: - The record

    /// THE ONE THAT CATCHES A MISSPELLED FIELD.
    ///
    /// A record with `colours` instead of `colors`, or `thumb` instead of
    /// `thumbFile`, loads in both apps and shows a model with no colours and no
    /// picture — which reads as a bad file rather than as a bad record, and is
    /// the sort of thing that survives a demo. Building the record and decoding
    /// it back through the type the grid actually uses is what says it is right.
    @Test("the record written is the record the app reads back")
    func recordRoundTrip() throws {
        let colours: [JSONValue] = [
            .object(["hex": .string("#6B7A3B"), "grams": .null, "label": .string("Filament 1")]),
            .object(["hex": .string("#C2A24E"), "grams": .number(12.5), "label": .string("Filament 2")]),
        ]
        let record = LibraryImport.record(
            id: "PF-test1", name: "Hulk Helmet", originalName: "Hulk Helmet.3mf",
            filename: "Hulk Helmet.3mf", ext: "3mf", size: 83_818_899,
            hash: "abc123", key: "4295525:3487958.9:1141.57x757.09x207.37",
            colours: colours, swapCount: 3, thumbFile: "thumb.png", now: 1_788_000_000_000)

        let data = try JSONEncoder().encode(JSONValue.object(record))
        let file = try JSONDecoder().decode(LibraryFile.self, from: data)

        #expect(file.id == "PF-test1")
        #expect(file.title == "Hulk Helmet")
        #expect(file.originalName == "Hulk Helmet.3mf")
        #expect(file.contentHash == "abc123")
        #expect(file.geometryKey == "4295525:3487958.9:1141.57x757.09x207.37")
        #expect(file.thumbFile == "thumb.png")
        #expect(file.swapCount == 3)
        #expect(file.colors?.count == 2)
        #expect(file.colors?.first?.hex == "#6B7A3B")
        #expect(file.sourceFile?.filename == "Hulk Helmet.3mf")
        #expect(file.sourceFile?.ext == "3mf")
        #expect(file.sourceFile?.kind == "model")
        #expect(file.sourceFile?.size == 83_818_899)
        #expect(file.favorite == false)
        #expect(file.isFavourite == false)
        // The two timestamp shapes the book actually holds: epoch milliseconds
        // for one and an ISO string for the other. Written as numbers for both,
        // `updatedAt` decoded as nothing and the model showed no date.
        #expect(file.updatedAt == "2026-09-27T00:00:00.000Z" || file.updatedAt?.hasSuffix("Z") == true,
                "updatedAt should be an ISO string, got \(file.updatedAt ?? "nil")")
    }

    /// A gcode has no mesh and no preview, and that is a record too — not a
    /// half-written one. Every field that has no answer says so with null
    /// rather than with a zero another empty record would share.
    @Test("a record with nothing measured is still a whole record")
    func unmeasuredRecord() throws {
        let record = LibraryImport.record(
            id: "PF-test2", name: "plate", originalName: "plate.gcode",
            filename: "plate.gcode", ext: "gcode", size: 12_345,
            hash: "def456", key: nil, colours: [], swapCount: 0, thumbFile: nil,
            now: 1_788_000_000_000)

        let file = try JSONDecoder().decode(
            LibraryFile.self, from: try JSONEncoder().encode(JSONValue.object(record)))
        #expect(file.geometryKey == nil, "no mesh means no key, not an empty one")
        #expect(file.thumbFile == nil)
        #expect(file.contentHash == "def456", "the hash stands even with no geometry")
        #expect(file.sourceFile?.kind == "gcode")
        #expect(file.colors?.isEmpty == true)
    }

    /// Khayt names these fields in American spelling and the app is written in
    /// British. A record that reads well and stores wrong is the failure this
    /// pins.
    @Test("the stored field names are Khayt's, not this app's prose")
    func fieldNames() {
        let record = LibraryImport.record(
            id: "x", name: "n", originalName: "n.3mf", filename: "n.3mf", ext: "3mf",
            size: 1, hash: nil, key: nil, colours: [], swapCount: 0, thumbFile: nil)
        for name in ["colors", "favorite", "thumbFile", "thumbSource", "contentHash",
                     "geometryKey", "sourceFile", "originalName", "swapCount", "parsed"] {
            #expect(record[name] != nil, "the record has no \(name)")
        }
        for wrong in ["colours", "favourite", "thumb", "hash", "geometry"] {
            #expect(record[wrong] == nil, "the record should not carry \(wrong)")
        }
    }

    // MARK: - What it will take

    @Test("only the kinds Khayt reads are accepted")
    func kinds() {
        for good in ["stl", "3mf", "obj", "gcode", "gco"] {
            #expect(LibraryImport.kinds.contains(good))
        }
        // An archive is several records and a dialog, not a file copy.
        #expect(!LibraryImport.kinds.contains("zip"))
        #expect(!LibraryImport.kinds.contains("step"))
    }
}

/// A one-shot hash, for comparing against the streamed one.
private enum SHA256Digest {
    static func hex(of data: Data) -> String {
        var h = CryptoKitShim()
        h.update(data)
        return h.hex()
    }
}

private struct CryptoKitShim {
    private var digest = SHA256()
    mutating func update(_ data: Data) { digest.update(data: data) }
    func hex() -> String { digest.finalize().map { String(format: "%02x", $0) }.joined() }
}

/// The whole import, against a throwaway library and a throwaway book.
///
/// A real file copied, really measured, and a real record written into a real
/// store — the difference from the tests above being that this one goes all the
/// way through and then reads the book back. An import whose only trial run was
/// on a shop's live library has not been tested, it has been risked.
@MainActor
struct LibraryImportEndToEndTests {

    struct Bench {
        let dir: URL
        let store: URL
        let library: URL
    }

    static func bench() throws -> Bench {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appending(path: "khayt-e2e-\(UUID().uuidString)")
        let library = dir.appending(path: "print-files-vault")
        try FileManager.default.createDirectory(at: library, withIntermediateDirectories: true)
        let store = dir.appending(path: "khayt-store.json")
        try Data(#"{"printFiles":[],"settings":{}}"#.utf8).write(to: store)
        return Bench(dir: dir, store: store, library: library)
    }

    static func run(_ source: URL, _ bench: Bench,
                    knownHashes: Set<String> = []) async throws -> LibraryImport.Added {
        try await LibraryImport.add(source, storeURL: bench.store, libraryRoot: bench.library,
                                    knownHashes: knownHashes,
                                    nameOfExisting: { _ in "the one you already have" },
                                    engine: try KhaytEngine(),
                                    owns: { true }, whoHasIt: { nil })
    }

    static func printFiles(in bench: Bench) throws -> [JSONValue] {
        let root = try JSONDecoder().decode([String: JSONValue].self,
                                            from: try Data(contentsOf: bench.store))
        guard case .array(let rows)? = root["printFiles"] else { return [] }
        return rows
    }

    @Test("an STL is copied, measured and written as a record the app reads back")
    func stlEndToEnd() async throws {
        let bench = try Self.bench()
        defer { try? FileManager.default.removeItem(at: bench.dir) }

        let source = bench.dir.appending(path: "My Cube.stl")
        try MeshTests.binarySTL(MeshTests.boxFacets(10, 10, 10)).write(to: source)

        let added = try await Self.run(source, bench)
        #expect(added.triangleCount == 12)
        #expect(added.name == "My Cube")

        let rows = try Self.printFiles(in: bench)
        #expect(rows.count == 1)
        let file = try JSONDecoder().decode(LibraryFile.self,
                                            from: try JSONEncoder().encode(rows[0]))
        #expect(file.id == added.id)
        #expect(file.title == "My Cube")
        #expect(file.sourceFile?.filename == "My Cube.stl")
        #expect(file.sourceFile?.kind == "model")
        #expect(file.geometryKey == "12:1000:10x10x10", "got \(file.geometryKey ?? "nil")")
        #expect(file.contentHash?.count == 64)

        // And the file is where the record says it is.
        let copied = bench.library.appending(path: added.id).appending(path: "My Cube.stl")
        #expect(FileManager.default.fileExists(atPath: copied.path))
        #expect(try Data(contentsOf: copied) == (try Data(contentsOf: source)))
    }

    /// A 3MF carries a preview and the colours a slicer chose, and both have to
    /// come out — they are most of what a library entry looks like.
    @Test("a 3MF brings its preview and its filament colours with it")
    func threeMFEndToEnd() async throws {
        let bench = try Self.bench()
        defer { try? FileManager.default.removeItem(at: bench.dir) }

        // A 3MF with a mesh, a preview and a slice_info naming two filaments.
        let staging = bench.dir.appending(path: "staging")
        try FileManager.default.createDirectory(
            at: staging.appending(path: "Metadata"), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(
            at: staging.appending(path: "3D"), withIntermediateDirectories: true)
        var xml = "<model><resources><object id=\"1\"><mesh><vertices>"
        let v: [(Double, Double, Double)] = [
            (0,0,0),(20,0,0),(20,10,0),(0,10,0),(0,0,5),(20,0,5),(20,10,5),(0,10,5)]
        for p in v { xml += "<vertex x=\"\(p.0)\" y=\"\(p.1)\" z=\"\(p.2)\"/>" }
        xml += "</vertices><triangles>"
        for f in [(0,3,2),(0,2,1),(4,5,6),(4,6,7),(0,1,5),(0,5,4),
                  (1,2,6),(1,6,5),(2,3,7),(2,7,6),(3,0,4),(3,4,7)] {
            xml += "<triangle v1=\"\(f.0)\" v2=\"\(f.1)\" v3=\"\(f.2)\"/>"
        }
        xml += "</triangles></mesh></object></resources></model>"
        try Data(xml.utf8).write(to: staging.appending(path: "3D/3dmodel.model"))
        // A real PNG header, so the bytes that come out can be checked as one.
        var png = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        png.append(Data((0..<3000).map { UInt8($0 % 251) }))
        try png.write(to: staging.appending(path: "Metadata/plate_1.png"))
        // `##"…"##`, because a hex colour contains `"#` — which is precisely
        // what closes a `#"…"#` raw string, three characters into the value.
        try Data(##"<filament id="1" color="#6B7A3B" used_g="120.5"/><filament id="2" color="#C2A24E"/>"##.utf8)
            .write(to: staging.appending(path: "Metadata/slice_info.config"))

        let source = bench.dir.appending(path: "Helmet.3mf")
        let zip = Process()
        zip.executableURL = URL(fileURLWithPath: "/usr/bin/zip")
        zip.arguments = ["-q", "-r", source.path, "."]
        zip.currentDirectoryURL = staging
        zip.standardOutput = Pipe(); zip.standardError = Pipe()
        try zip.run(); zip.waitUntilExit()

        let added = try await Self.run(source, bench)
        #expect(added.triangleCount == 12)
        #expect(added.colours == 2)

        let file = try JSONDecoder().decode(
            LibraryFile.self, from: try JSONEncoder().encode(try Self.printFiles(in: bench)[0]))
        #expect(file.geometryKey == "12:1000:20x10x5", "got \(file.geometryKey ?? "nil")")
        #expect(file.colors?.map(\.hex) == ["#6B7A3B", "#C2A24E"])
        #expect(file.swapCount == 1, "two colours is one swap")
        #expect(file.thumbFile == "thumb.png")

        // The preview reached the disk, unaltered.
        let thumb = bench.library.appending(path: added.id).appending(path: "thumb.png")
        #expect(try Data(contentsOf: thumb) == png)
    }

    /// A file already in the library is refused BY NAME, and leaves nothing
    /// behind — no half-record, and no orphan copy in the vault.
    @Test("a duplicate is refused and leaves no trace")
    func duplicateLeavesNothing() async throws {
        let bench = try Self.bench()
        defer { try? FileManager.default.removeItem(at: bench.dir) }
        let source = bench.dir.appending(path: "Cube.stl")
        try MeshTests.binarySTL(MeshTests.boxFacets(10, 10, 10)).write(to: source)

        let first = try await Self.run(source, bench)
        let hash = try #require(try LibraryImport.contentHash(of: source))

        await #expect(throws: LibraryImport.Failure.alreadyHere("the one you already have")) {
            _ = try await Self.run(source, bench, knownHashes: [hash])
        }
        // One record, and one folder — the refused import cleaned up after
        // itself rather than leaving a copy nobody has a record for.
        #expect(try Self.printFiles(in: bench).count == 1)
        let folders = try FileManager.default.contentsOfDirectory(atPath: bench.library.path)
        #expect(folders == [first.id], "left \(folders)")
    }

    /// A book that will not accept the write must not leave the copy behind
    /// either. This is the shape of the failure where a shop's vault fills with
    /// files no record points at.
    @Test("a refused write leaves no orphan in the vault")
    func refusedWriteLeavesNothing() async throws {
        let bench = try Self.bench()
        defer { try? FileManager.default.removeItem(at: bench.dir) }
        let source = bench.dir.appending(path: "Cube.stl")
        try MeshTests.binarySTL(MeshTests.boxFacets(10, 10, 10)).write(to: source)

        await #expect(throws: (any Error).self) {
            _ = try await LibraryImport.add(
                source, storeURL: bench.store, libraryRoot: bench.library,
                knownHashes: [], nameOfExisting: { _ in nil },
                engine: try KhaytEngine(),
                // Somebody else has the book.
                owns: { false }, whoHasIt: { "Khayt has it" })
        }
        #expect(try Self.printFiles(in: bench).isEmpty)
        #expect(try FileManager.default.contentsOfDirectory(atPath: bench.library.path).isEmpty,
                "a file with no record is worse than no file")
    }

    @Test("newest first, as the other app writes them")
    func newestFirst() async throws {
        let bench = try Self.bench()
        defer { try? FileManager.default.removeItem(at: bench.dir) }
        let a = bench.dir.appending(path: "First.stl")
        let b = bench.dir.appending(path: "Second.stl")
        try MeshTests.binarySTL(MeshTests.boxFacets(10, 10, 10)).write(to: a)
        try MeshTests.binarySTL(MeshTests.boxFacets(20, 20, 20)).write(to: b)

        _ = try await Self.run(a, bench)
        let second = try await Self.run(b, bench)
        let rows = try Self.printFiles(in: bench)
        #expect(rows.count == 2)
        let top = try JSONDecoder().decode(LibraryFile.self,
                                           from: try JSONEncoder().encode(rows[0]))
        #expect(top.id == second.id, "the one just added belongs at the top")
    }
}
