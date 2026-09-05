import Foundation
import Testing
import KhaytCore
@testable import KhaytApp

/// Opening a credential at the moment it is used.
///
/// THE DEFECT THIS EXISTS FOR: the store keeps `settings.telegram.botToken` as
/// `__enc__` + OSCrypt, this app read the store raw, and `tell` handed that
/// string to `Telegram.send` as a bot token. `isBotToken` refused it, so every
/// shop with Telegram configured was told its message did not go out — every
/// time, since the day it shipped. `SafeStorage.open` existed and was tested;
/// nothing called it.
///
/// This shop's own book has an empty `botToken`, which is why the path never
/// failed here and the bug survived a release.
///
/// **NOTHING HERE MAY TOUCH THE LOGIN KEYCHAIN.** The first version of this
/// file did, and macOS put a SecurityAgent dialog on screen and the test
/// process waited on it for ever — no output, no timeout, killed by hand.
/// `Secrets.keySource` is the seam that keeps the suite off it.
/// SERIALIZED: `Secrets` keeps the session's key in static storage, and Swift
/// Testing runs a suite's tests in parallel — so the "locked Keychain" case
/// substituted a nil key source out from under the round-trip case, which then
/// failed for a reason that had nothing to do with it.
@MainActor
@Suite(.serialized)
struct SecretsTests {

    /// A key of our own, so a sealed value can be opened without the Keychain.
    static let key = SafeStorage.key(fromPassword: "a test password, not a shop's")

    init() {
        Secrets.forget()
        Secrets.keySource = { _ in Self.key }
    }

    @Test("a token stored in the clear is a token, not a Keychain question")
    func plaintextPassesThrough() throws {
        // Older stores, and any machine where safeStorage was unavailable when
        // the value was written. `decryptStoreField` in lib/store-io.js does
        // the same: no marker, no decryption.
        let plain = "123456789:AAH-abcdefghijklmnopqrstuvwxyz012345678"
        #expect(try Secrets.open(plain, for: .development) == plain)
    }

    @Test("an empty field is not a locked one")
    func emptyIsNotAFault() throws {
        // "The shop has not set Telegram up" must not be reported as a Keychain
        // refusal — and a Keychain prompt for a field nobody filled in would be
        // inexcusable.
        Secrets.keySource = { _ in Issue.record("the Keychain was asked for an empty field"); return nil }
        #expect(try Secrets.open("", for: .development) == "")
    }

    @Test("a sealed token comes back as the token Telegram accepts")
    func sealedRoundTrip() throws {
        // Both halves of the bug, on the real functions.
        let real = "123456789:AAH-abcdefghijklmnopqrstuvwxyz012345678"
        let sealed = try SafeStorage.seal(real, key: Self.key)
        #expect(sealed.hasPrefix(SafeStorage.marker))
        #expect(!KhaytTelegram.isBotToken(sealed), "an encrypted token was never going to be accepted")

        let opened = try Secrets.open(sealed, for: .development)
        #expect(opened == real)
        #expect(KhaytTelegram.isBotToken(opened))
    }

    @Test("a locked Keychain is said out loud, never returned as the value")
    func lockedIsRefused() throws {
        // The one outcome that must never occur is the `__enc__` string coming
        // back as though it were the credential.
        Secrets.forget()
        Secrets.keySource = { _ in nil }
        let sealed = try SafeStorage.seal("secret", key: Self.key)
        #expect(throws: Secrets.Failure.self) {
            try Secrets.open(sealed, for: .development)
        }
    }

    @Test("the wrong key is a refusal, not a garbled credential")
    func wrongKeyIsRefused() throws {
        let sealed = try SafeStorage.seal("secret", key: Self.key)
        Secrets.forget()
        Secrets.keySource = { _ in SafeStorage.key(fromPassword: "another machine's password") }
        #expect(throws: Secrets.Failure.self) {
            try Secrets.open(sealed, for: .development)
        }
    }

    @Test("the Keychain is asked once, not once per message")
    func theKeyIsCached() throws {
        // Electron owns the Keychain item and macOS puts a prompt in front of
        // it. A shop finishing six jobs should not answer six prompts.
        Secrets.forget()
        var asked = 0
        Secrets.keySource = { _ in asked += 1; return Self.key }
        let sealed = try SafeStorage.seal("secret", key: Self.key)
        for _ in 0..<5 { _ = try Secrets.open(sealed, for: .development) }
        #expect(asked == 1)
    }

    @Test("the sample shop is never asked for a credential")
    func sampleHasNoBook() throws {
        // It has no build, so there is no Keychain item and nothing to open.
        Secrets.keySource = { _ in Issue.record("the sample shop reached for a Keychain"); return nil }
        #expect(try Secrets.open("__enc__whatever", for: Shop.Source.sample) == "__enc__whatever")
    }

    @Test("the send path opens the token before it sends it")
    func theSendPathIsWired() throws {
        // A source guard, and named as one — `tell` is private, takes no
        // injectable session and awaits a real request. What it is worth is
        // catching the exact regression: somebody passing `message.botToken`
        // straight to `send` again, which is what the code did until now.
        let shop = try String(contentsOf: URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/KhaytApp/Shop.swift"), encoding: .utf8)
        guard let at = shop.range(of: "private func tell(_ message: TelegramMessage)") else {
            Issue.record("tell has been renamed"); return
        }
        let body = String(shop[at.lowerBound...].prefix(1400))
        #expect(body.contains("Secrets.open(message.botToken"),
                "the bot token must be opened before it is sent")
        #expect(!body.contains("botToken: message.botToken"),
                "the encrypted string is being sent as the token again")
    }
}
