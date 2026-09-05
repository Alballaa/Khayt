import Foundation
import KhaytCore

/// Opening a credential, at the moment it is used and nowhere else.
///
/// The store's secret fields are `__enc__` + Chromium OSCrypt, and this app has
/// never opened one. That was right while nothing needed the plaintext, and it
/// became a bug the moment something did: `Telegram.send` was handed
/// `__enc__AAAA…` as a bot token, `isBotToken` refused it, and every shop with
/// Telegram configured was told its message did not go out — every time, since
/// the day it shipped. `SafeStorage.open` existed, was tested, and nothing in
/// the app called it.
///
/// **The rule that survives is narrower than "never decrypts", and it is the
/// one that mattered.** `StoreWriter` never decrypts: an edit to some other
/// field carries the `__enc__` string through untouched, so a bad round trip
/// can never overwrite a working credential with bytes Electron cannot read.
/// That is unchanged. What is allowed now is reading one, in order to USE it —
/// which is what a credential is for, and what the Electron app does on every
/// load.
///
/// So: opened at the point of use, never held on a model, never written back.
@MainActor
enum Secrets {

    /// The Keychain is asked once per book per session.
    ///
    /// Not per message: the item is Electron's, macOS puts a prompt in front of
    /// it the first time, and a shop finishing six jobs should not answer six
    /// of them.
    private static var keys: [StoreReader.Build: Data?] = [:]

    /// Where a book's key comes from.
    ///
    /// A seam, and not a decorative one: **a test that reads the login Keychain
    /// hangs.** macOS puts a SecurityAgent dialog on screen and the process
    /// waits on it for ever — which is exactly what the first version of
    /// `SecretsTests` did, with no output and no timeout until it was killed by
    /// hand. Nothing under test may reach the real Keychain.
    static var keySource: (StoreReader.Build) -> Data? = { build in
        StoreReader.keychainPassword(for: build).map(SafeStorage.key(fromPassword:))
    }

    /// Why a credential could not be opened, in a sentence a shop can act on.
    enum Failure: Error, CustomStringConvertible {
        case noKeychain
        case unreadable(String)

        var description: String {
            switch self {
            case .noKeychain:
                return "The saved credential is locked. Khayt keeps it in your login Keychain, "
                     + "and this app was not given access to it."
            case .unreadable(let why):
                return "The saved credential could not be read: \(why)"
            }
        }
    }

    /// A stored field as it is meant to be used.
    ///
    /// A value with no `__enc__` marker is returned untouched — that is not an
    /// error, it is a store written before encryption was available, and
    /// `decryptStoreField` in `lib/store-io.js` does exactly the same. Empty
    /// stays empty, so "the shop has not set this up" is not reported as a
    /// Keychain fault.
    static func open(_ value: String, for build: StoreReader.Build) throws -> String {
        guard !value.isEmpty else { return value }
        guard value.hasPrefix(SafeStorage.marker) else { return value }
        guard let key = key(for: build) else { throw Failure.noKeychain }
        do { return try SafeStorage.open(value, key: key) }
        catch { throw Failure.unreadable(String(describing: error)) }
    }

    /// The same, for a book this app is only reading (the sample has none).
    static func open(_ value: String, for source: Shop.Source) throws -> String {
        guard let build = source.build else { return value }
        return try open(value, for: build)
    }

    private static func key(for build: StoreReader.Build) -> Data? {
        if let cached = keys[build] { return cached }
        let key = keySource(build)
        keys[build] = key
        return key
    }

    /// Forget the session's key — for a test, and for a book being closed.
    static func forget() { keys = [:] }

    /// Which books the Keychain has already been asked about this session.
    static func cachedBuilds() -> [StoreReader.Build] { Array(keys.keys) }
}
