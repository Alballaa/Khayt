import Foundation

/// Measuring a mesh: how many triangles, what volume, what box.
///
/// ── WHY THIS IS OURS AND NOT A SLICER'S ──────────────────────────────────
///
/// Every slicer computes exactly this on load and will print it with `--info`,
/// and `ModelInfo.swift` uses that. But PrusaSlicer, OrcaSlicer, Snapmaker Orca
/// and Bambu Studio all descend from Slic3r and are **AGPL-3.0**: linking any
/// of their code in would put Khayt under the same licence, network clause and
/// all. Spawning one is arm's length and fine; carrying one is not.
///
/// So this is written here. It is worth being clear that the arithmetic was
/// never the hard part — it is one cross product per triangle — and that what
/// made the mesh unreachable was the CONTAINER: `lib/mf-convert.js` reads it
/// with Node's `Buffer`, which JavaScriptCore does not have.
///
/// ── THE VOLUME ───────────────────────────────────────────────────────────
///
/// Signed tetrahedron sum: every triangle makes a tetrahedron with the origin,
/// `a · (b × c) / 6` is its signed volume, and on a closed consistently-wound
/// mesh the outside faces cancel and what is left is what the mesh encloses.
/// The origin need not be inside; that is the point of the sign.
///
/// It is `abs`'d at the end because a mesh wound inside-out — which happens, and
/// which a slicer will still print — gives the right magnitude with the wrong
/// sign, and a negative volume in a library record is worse than a mesh nobody
/// noticed was inverted.
///
/// Checked against PrusaSlicer, which does the same thing: a 10 mm cube is
/// 1000.000061 mm³ to it and 1000.0 here, the difference being that it
/// accumulates in Float and this in Double.
enum Mesh {

    /// What a measurement adds up to. The same three things `geometryKey` wants.
    struct Measurement: Equatable, Sendable {
        var triangleCount = 0
        /// Signed while accumulating; made positive by `finished`.
        var volumeMm3 = 0.0
        var minX = Double.infinity, minY = Double.infinity, minZ = Double.infinity
        var maxX = -Double.infinity, maxY = -Double.infinity, maxZ = -Double.infinity

        var x: Double { minX.isFinite && maxX.isFinite ? max(0, maxX - minX) : 0 }
        var y: Double { minY.isFinite && maxY.isFinite ? max(0, maxY - minY) : 0 }
        var z: Double { minZ.isFinite && maxZ.isFinite ? max(0, maxZ - minZ) : 0 }

        /// One triangle.
        ///
        /// Inlined and taking scalars rather than a vector type: this runs six
        /// million times for one of this shop's files, and the cost of it is
        /// the cost of the whole measurement.
        @inline(__always)
        mutating func add(_ ax: Double, _ ay: Double, _ az: Double,
                          _ bx: Double, _ by: Double, _ bz: Double,
                          _ cx: Double, _ cy: Double, _ cz: Double) {
            triangleCount += 1
            volumeMm3 += (ax * (by * cz - bz * cy)
                        + ay * (bz * cx - bx * cz)
                        + az * (bx * cy - by * cx)) / 6
            minX = min(minX, ax, bx, cx); maxX = max(maxX, ax, bx, cx)
            minY = min(minY, ay, by, cy); maxY = max(maxY, ay, by, cy)
            minZ = min(minZ, az, bz, cz); maxZ = max(maxZ, az, bz, cz)
        }

        /// The measurement as a caller should read it, or nil when nothing was
        /// measured — an empty file, or one this could not understand. Nil
        /// rather than zeros, so an unmeasured model never gets an identity
        /// another unmeasured one would share.
        func finished() -> Measurement? {
            guard triangleCount > 0 else { return nil }
            var out = self
            out.volumeMm3 = abs(volumeMm3)
            return out
        }
    }

    enum Failure: Error, CustomStringConvertible, Equatable {
        case unreadable(String)
        case notAMesh(String)
        case tooManyTriangles(Int)

        var description: String {
            switch self {
            case .unreadable(let why): return "Could not read the model: \(why)"
            case .notAMesh(let what): return "That does not look like a mesh: \(what)"
            case .tooManyTriangles(let n):
                return "The model claims \(n) triangles, more than this reads."
            }
        }
    }

    /// A ceiling on what will be counted.
    ///
    /// Not a memory bound — nothing here holds the mesh — but a bound on a
    /// header that claims something absurd. This shop's largest real model is
    /// 6.3 million triangles; two hundred million is far past any real part and
    /// still finishes.
    static let mostTriangles = 200_000_000

    // MARK: - STL

    /// Measure an STL, binary or ASCII, without loading it.
    ///
    /// Read in chunks. A binary STL of six million facets is 300 MB and there is
    /// no reason for any of it to be resident: each facet is fifty bytes, read,
    /// added, and forgotten.
    static func measureSTL(_ url: URL) throws -> Measurement? {
        let handle: FileHandle
        do { handle = try FileHandle(forReadingFrom: url) }
        catch { throw Failure.unreadable(error.localizedDescription) }
        defer { try? handle.close() }

        let size = Int(try handle.seekToEnd())
        guard size >= 84 else { return try measureAsciiSTL(url) }
        try handle.seek(toOffset: 80)
        guard let header = try handle.read(upToCount: 4), header.count == 4 else { return nil }
        let claimed = Int(UInt32(header[header.startIndex])
                        | UInt32(header[header.startIndex + 1]) << 8
                        | UInt32(header[header.startIndex + 2]) << 16
                        | UInt32(header[header.startIndex + 3]) << 24)

        // A binary STL that says it holds nothing, and is exactly the size of
        // saying so. Empty is a real answer and not a failure — nil, because
        // `finished()` would give nil anyway and an exception here would make
        // an empty export look like a broken one.
        if claimed == 0, size == 84 { return nil }

        // THE FORMATS ARE TOLD APART BY ARITHMETIC, not by the word "solid".
        // An ASCII STL starts with "solid" and so do plenty of binary ones,
        // because the exporter wrote a name into the 80-byte header. The length
        // is the honest test: a binary file is exactly 84 + 50n bytes.
        guard claimed > 0, claimed <= mostTriangles, size == 84 + claimed * 50 else {
            return try measureAsciiSTL(url)
        }

        var m = Measurement()
        // A multiple of 50 so a facet is never split across two reads.
        let chunkFacets = 20_000
        var offset = 84
        while offset < size {
            let want = min(chunkFacets * 50, size - offset)
            try handle.seek(toOffset: UInt64(offset))
            guard let chunk = try handle.read(upToCount: want), !chunk.isEmpty else { break }
            chunk.withUnsafeBytes { raw in
                let base = raw.baseAddress!
                var at = 0
                while at + 50 <= chunk.count {
                    // Little-endian Float32, and `loadUnaligned` because a facet
                    // starts every 50 bytes and 50 is not a multiple of 4.
                    func f(_ o: Int) -> Double {
                        Double(Float(bitPattern: UInt32(littleEndian:
                            base.loadUnaligned(fromByteOffset: at + o, as: UInt32.self))))
                    }
                    // Bytes 0–11 are the normal, which is ignored: it is
                    // derivable, frequently zero, and frequently wrong.
                    m.add(f(12), f(16), f(20), f(24), f(28), f(32), f(36), f(40), f(44))
                    at += 50
                }
            }
            offset += (chunk.count / 50) * 50
            if chunk.count < 50 { break }
        }
        return m.finished()
    }

    /// The text form. Rare from a slicer, common out of a CAD package.
    static func measureAsciiSTL(_ url: URL) throws -> Measurement? {
        let text: String
        do { text = try String(contentsOf: url, encoding: .utf8) }
        catch { throw Failure.notAMesh("it is neither binary STL nor UTF-8 text") }
        guard text.contains("facet") || text.contains("solid") else {
            throw Failure.notAMesh("no facets in it")
        }

        var m = Measurement()
        var corner: [Double] = []
        for line in text.split(separator: "\n", omittingEmptySubsequences: true) {
            let t = line.trimmingCharacters(in: .whitespaces)
            guard t.hasPrefix("vertex") else { continue }
            let parts = t.dropFirst(6).split(separator: " ", omittingEmptySubsequences: true)
            guard parts.count >= 3,
                  let x = Double(parts[0]), let y = Double(parts[1]), let z = Double(parts[2])
            else { continue }
            corner.append(contentsOf: [x, y, z])
            if corner.count == 9 {
                m.add(corner[0], corner[1], corner[2], corner[3], corner[4],
                      corner[5], corner[6], corner[7], corner[8])
                corner.removeAll(keepingCapacity: true)
            }
        }
        return m.finished()
    }
}
