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
