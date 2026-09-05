import Foundation
import CryptoKit
import Compression

/// Reading what Khayt Cloud holds.
///
/// The envelope is `lib/sync-crypto.js`'s and nothing here decides any of it:
/// AES-256-GCM with a 12-byte nonce and a 16-byte tag, over gzipped JSON, with
/// every field base64 — `{ v, z?, iv, ct, tag }`. The `z` marker is plaintext
/// metadata on the OUTSIDE of the encryption, so a reader knows how to treat
/// the payload before it has one.
///
/// **This half reads. It does not write.** Encrypting is the direction that can
/// destroy a shop: `cloud-backend.js` §7 spells out what a blob the server
/// accepts does to every other device. Reading can be wrong and merely fail.
///
/// The key comes from `Scrypt`, which macOS does not provide and which is
/// pinned against RFC 7914 and Node — see `ScryptTests`, and read the note
/// there about what a KEK one byte out looks like to a shop.
public enum SyncCrypto {

    public enum Failure: Error, CustomStringConvertible {
        case malformed(String)
        case wrongKey
        case notGzip
        case corruptGzip(String)
        case notJSON

        public var description: String {
            switch self {
            case .malformed(let what): return "the encrypted blob is missing or malformed: \(what)"
            case .wrongKey:
                return "the data would not open with this key — a wrong passphrase, or the blob was altered"
            case .notGzip: return "the payload is marked gzip and does not begin like it"
            case .corruptGzip(let why): return "the payload would not decompress: \(why)"
            case .notJSON: return "the payload decrypted but is not JSON"
            }
        }
    }

    /// One encrypted blob, as the wire and the keyset both carry it.
    public struct Blob: Decodable, Sendable {
        public let v: Int?
        public let z: String?
        public let iv: String
        public let ct: String
        public let tag: String
        /// Present on a passphrase-wrapped key and absent on a key-wrapped one.
        public let salt: String?
    }

    public static let storeBlobVersion = 1
    public static let compression = "gzip"

    // MARK: - AES-256-GCM

    /// Open one blob with a 32-byte key.
    public static func open(_ blob: Blob, key: Data) throws -> Data {
        guard key.count == 32 else { throw Failure.malformed("the key is \(key.count) bytes, not 32") }
        guard let iv = Data(base64Encoded: blob.iv), iv.count == 12 else {
            throw Failure.malformed("iv")
        }
        guard let ct = Data(base64Encoded: blob.ct) else { throw Failure.malformed("ct") }
        guard let tag = Data(base64Encoded: blob.tag), tag.count == 16 else {
            throw Failure.malformed("tag")
        }
        do {
            let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: iv), ciphertext: ct, tag: tag)
            return try AES.GCM.open(box, using: SymmetricKey(data: key))
        } catch {
            // CryptoKit says only "authenticationFailure", and it means the same
            // thing for a wrong key and for tampering. Saying both is honest.
            throw Failure.wrongKey
        }
    }

    // MARK: - The shop's keys

    /// Unwrap the data key from a passphrase-wrapped keyset entry.
    ///
    /// `settings.cloud.keyset.wrappedByPassphrase` — the shape this shop's own
    /// book carries. A key-wrapped entry (an organisation's) has no salt and is
    /// refused by name rather than by deriving a KEK from nothing, which is a
    /// GCM error that tells a shop the wrong thing.
    public static func unwrapDek(secret: String, wrapped: Blob,
                                 n: Int = 32768, r: Int = 8, p: Int = 1) throws -> Data {
        guard let salt64 = wrapped.salt, let salt = Data(base64Encoded: salt64) else {
            throw Failure.malformed("this entry is key-wrapped and needs the organisation's key, not a passphrase")
        }
        let kek = try Scrypt.key(password: Data(secret.utf8), salt: salt, n: n, r: r, p: p, length: 32)
        return try open(wrapped, key: kek)
    }

    // MARK: - The store

    /// A store blob, decrypted and decompressed, as JSON bytes.
    public static func openStore(_ blob: Blob, dek: Data) throws -> Data {
        let plain = try open(blob, key: dek)
        guard blob.z == compression else { return plain }
        return try gunzip(plain)
    }

    /// The same, decoded.
    public static func store(_ blob: Blob, dek: Data) throws -> [String: JSONValue] {
        let json = try openStore(blob, dek: dek)
        guard let out = try? JSONDecoder().decode([String: JSONValue].self, from: json) else {
            throw Failure.notJSON
        }
        return out
    }

    // MARK: - gzip

    /// `zlib.gunzipSync`, from the pieces macOS gives.
    ///
    /// `Compression` does raw DEFLATE and nothing else, so the container is
    /// this function's job: the ten-byte header (and whatever optional fields
    /// its flags announce), then the stream, then a CRC-32 and the length —
    /// both of which are CHECKED. A decompressor that ignores its own trailer
    /// will hand back a truncated store as though it were whole.
    public static func gunzip(_ data: Data) throws -> Data {
        guard data.count > 18 else { throw Failure.corruptGzip("only \(data.count) bytes") }
        let bytes = [UInt8](data)
        guard bytes[0] == 0x1f, bytes[1] == 0x8b else { throw Failure.notGzip }
        guard bytes[2] == 8 else { throw Failure.corruptGzip("compression method \(bytes[2]), not deflate") }

        let flags = bytes[3]
        var at = 10
        func need(_ n: Int) throws {
            guard at + n <= bytes.count else { throw Failure.corruptGzip("header runs past the end") }
        }
        if flags & 0x04 != 0 {                       // FEXTRA
            try need(2)
            let extra = Int(bytes[at]) | (Int(bytes[at + 1]) << 8)
            at += 2
            try need(extra)
            at += extra
        }
        for flag in [UInt8(0x08), UInt8(0x10)] where flags & flag != 0 {   // FNAME, FCOMMENT
            while at < bytes.count, bytes[at] != 0 { at += 1 }
            guard at < bytes.count else { throw Failure.corruptGzip("an unterminated header string") }
            at += 1
        }
        if flags & 0x02 != 0 { try need(2); at += 2 }                      // FHCRC

        let trailer = bytes.count - 8
        guard at < trailer else { throw Failure.corruptGzip("nothing between the header and the trailer") }
        let deflated = Data(bytes[at..<trailer])

        let expectedCRC = UInt32(bytes[trailer]) | UInt32(bytes[trailer + 1]) << 8
            | UInt32(bytes[trailer + 2]) << 16 | UInt32(bytes[trailer + 3]) << 24
        let expectedSize = UInt32(bytes[trailer + 4]) | UInt32(bytes[trailer + 5]) << 8
            | UInt32(bytes[trailer + 6]) << 16 | UInt32(bytes[trailer + 7]) << 24

        let out = try inflate(deflated, hint: Int(expectedSize))
        guard out.count == Int(expectedSize) else {
            throw Failure.corruptGzip("\(out.count) bytes where the trailer says \(expectedSize)")
        }
        guard crc32(out) == expectedCRC else { throw Failure.corruptGzip("the checksum does not match") }
        return out
    }

    /// Raw DEFLATE, grown until it fits.
    ///
    /// `compression_decode_buffer` gives no way to ask how much it needs and
    /// returns 0 both for "empty" and for "your buffer was too small", so the
    /// trailer's size is the hint and the loop is the insurance when it lies.
    private static func inflate(_ deflated: Data, hint: Int) throws -> Data {
        var capacity = max(hint, deflated.count * 4, 1024)
        for _ in 0..<8 {
            var out = Data(count: capacity)
            let written = out.withUnsafeMutableBytes { dst -> Int in
                deflated.withUnsafeBytes { src -> Int in
                    compression_decode_buffer(
                        dst.baseAddress!.assumingMemoryBound(to: UInt8.self), capacity,
                        src.baseAddress!.assumingMemoryBound(to: UInt8.self), deflated.count,
                        nil, COMPRESSION_ZLIB)
                }
            }
            if written > 0 && written < capacity { return out.prefix(written) }
            if written > 0 && written == capacity && written == hint { return out }
            capacity *= 4
        }
        throw Failure.corruptGzip("the payload did not decompress into any reasonable size")
    }

    /// CRC-32 as gzip writes it. Table built once.
    static let crcTable: [UInt32] = (0..<256).map { i -> UInt32 in
        var c = UInt32(i)
        for _ in 0..<8 { c = (c & 1) == 1 ? 0xEDB8_8320 ^ (c >> 1) : c >> 1 }
        return c
    }

    public static func crc32(_ data: Data) -> UInt32 {
        var c: UInt32 = 0xFFFF_FFFF
        for byte in data { c = crcTable[Int((c ^ UInt32(byte)) & 0xFF)] ^ (c >> 8) }
        return c ^ 0xFFFF_FFFF
    }
}
