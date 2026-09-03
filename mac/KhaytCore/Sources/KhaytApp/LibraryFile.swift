import Foundation

/// One model in the shop's print library.
///
/// Decoded leniently, like `Order`, and for the same reason: this store is
/// written by the Electron app and a newer build will add fields. It is also
/// loose in its own right — `timesPrinted` and `lastPrinted` are absent on a
/// model that has never run, `setups` on most, `slicerProfileId` is null
/// throughout, and `createdAt` is a number on some records and a string on
/// others, which is why nothing here reads it.
struct LibraryFile: Identifiable, Decodable, Hashable, Sendable {
    let id: String
    let name: String
    let originalName: String?
    let updatedAt: String?
    let sourceFile: SourceFile?
    let parsed: Parsed?
    let colors: [Colour]?
    let swapCount: Int?
    let thumbFile: String?
    /// A `data:image/jpeg;base64,…` URI, inline in the store — not a path. A
    /// shop that has photographed a print carries the photo in `khayt-store.json`
    /// itself, which is most of why that file is large.
    let userPhoto: String?
    let testedNotes: String?
    let tags: [String]?
    /// The shop's own grouping. Called "Group" on screen since 3.7.0-beta.25 —
    /// the field kept its old name so nothing had to be re-filed.
    let folder: String?
    let material: String?
    let favorite: Bool?
    /// `triangles:volumeMm3:XxYxZ`, composed by `lib/model-identity.js`.
    let geometryKey: String?
    let timesPrinted: Int?
    let lastPrinted: String?

    struct SourceFile: Decodable, Hashable, Sendable {
        let filename: String?
        let originalName: String?
        let size: Double?
        let ext: String?
        let kind: String?
    }

    struct Parsed: Decodable, Hashable, Sendable {
        let printTimeMins: Double?
        let filamentGrams: Double?
        let filamentType: String?
        let slicer: String?
    }

    struct Colour: Decodable, Hashable, Sendable {
        let hex: String?
        let grams: Double?
        let label: String?
    }

    // MARK: - What the screen asks for

    var title: String { name.isEmpty ? (originalName ?? id) : name }
    var isFavourite: Bool { favorite == true }
    var printCount: Int { timesPrinted ?? 0 }
    var swaps: Int { swapCount ?? 0 }
    var palette: [Colour] { colors ?? [] }

    /// The group this model belongs to, or nil for ungrouped.
    ///
    /// Whitespace and control characters count as ungrouped. A NUL used as a
    /// sentinel has reached this field before and survived into the interface as
    /// a group nothing could ever match, so "empty" is judged on what is left
    /// after they are stripped rather than on the string being `""`.
    var group: String? {
        guard let folder else { return nil }
        // Strip control characters, then trim. Not `filter` over the whole
        // string: a group really called "Saudi Kings" must keep its space.
        let stripped = String(String.UnicodeScalarView(
            folder.unicodeScalars.filter { $0.properties.generalCategory != .control }))
        let cleaned = stripped.trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? nil : cleaned
    }

    /// Bytes of the model file, if the record says.
    var size: Double? { sourceFile?.size }

    /// The mesh, unpacked from `geometryKey`. Nil for a model whose geometry was
    /// never measured — an unparsed upload, or one too large to open under the
    /// mesh budget.
    var mesh: Mesh? {
        guard let key = geometryKey else { return nil }
        let parts = key.split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count == 3,
              let tris = Int(parts[0]), let volume = Double(parts[1]) else { return nil }
        let dims = parts[2].split(separator: "x").compactMap { Double($0) }
        guard dims.count == 3 else { return nil }
        return Mesh(triangles: tris, volumeMm3: volume, x: dims[0], y: dims[1], z: dims[2])
    }

    struct Mesh: Hashable, Sendable {
        let triangles: Int
        let volumeMm3: Double
        let x: Double, y: Double, z: Double
    }
}

extension LibraryFile.Colour {
    /// The swatch colour. An unparseable or absent hex shows as nothing rather
    /// than as black, which would read as a real filament choice.
    var rgb: (r: Double, g: Double, b: Double)? {
        guard var s = hex?.trimmingCharacters(in: .whitespaces), !s.isEmpty else { return nil }
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = Int(s, radix: 16) else { return nil }
        return (Double((v >> 16) & 0xFF) / 255, Double((v >> 8) & 0xFF) / 255, Double(v & 0xFF) / 255)
    }
}
