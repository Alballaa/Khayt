import Foundation
import Testing
import KhaytCore
@testable import KhaytApp

/// The shop's Telegram bot.
///
/// The MESSAGE is `lib/telegram-message.js`, tested where it lives against the
/// renderer handler it was lifted from. What is tested here is that this app
/// asks for it correctly, that the two small checks spelled out in Swift agree
/// with the module, that a completion is no longer refused for a shop with a
/// bot, and that a send which fails is SAID rather than swallowed — the whole
/// reason these moves were refused before.
@MainActor
struct TelegramTests {

    static func book(_ telegram: [String: JSONValue]) -> [String: JSONValue] {
        [
            "printLog": .array([.object([
                "id": .string("J1"), "project": .string("Bracket"), "status": .string("printing"),
                "price": .number(400), "parts": .array([]),
            ])]),
            "inventory": .array([]), "consumables": .array([]), "machines": .array([]),
            "clients": .array([]),
            "settings": .object(["currency": .string("SAR"), "telegram": .object(telegram)]),
        ]
    }

    static let configured: [String: JSONValue] = [
        "botToken": .string("123456:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"),
        "chatId": .string("-100123456"),
        "notifyOnComplete": .bool(true),
    ]

    static func move(_ root: inout [String: JSONValue], _ stage: Stage)
    async throws -> (undo: [Shop.ChangedRecord], notices: [String], telegram: TelegramMessage?) {
        let engine = try KhaytEngine()
        let words = Words()
        await words.load("en", engine: engine)
        return try await Shop.applyMove(to: &root, id: "J1", stage: stage, engine: engine, words: words)
    }

    // MARK: - The message

    @Test("a shop with a bot gets the message the shared rule writes")
    func message() async throws {
        var root = Self.book(Self.configured)
        let out = try await Self.move(&root, .completed)
        let message = try #require(out.telegram, "the move should have carried a message")
        #expect(message.message.contains("Bracket"))
        #expect(message.message.contains("400.00 SAR"), "in the shop's own currency")
        #expect(message.chatId == "-100123456")
    }

    @Test("a shop that has not asked for one gets none, and the move still happens")
    func noMessage() async throws {
        for telegram in [[:], ["botToken": JSONValue.string("123:abc")], Self.configured.filter { $0.key != "notifyOnComplete" }] {
            var root = Self.book(telegram)
            let out = try await Self.move(&root, .completed)
            #expect(out.telegram == nil, "\(telegram.keys.sorted())")
            if case .array(let rows)? = root["printLog"], case .object(let job) = rows[0] {
                #expect(Shop.plainString(job["status"]) == "completed", "and the job is finished either way")
            }
        }
    }

    @Test("a completion is no longer refused for a shop whose only integration is a bot")
    func notRefused() async throws {
        // This is what the feature is for. Before it, the move threw whole.
        var root = Self.book(Self.configured)
        _ = try await Self.move(&root, .completed)
        if case .array(let rows)? = root["printLog"], case .object(let job) = rows[0] {
            #expect(Shop.plainString(job["status"]) == "completed")
        } else {
            Issue.record("the job was not written")
        }
    }

    @Test("a move that would ALSO reach a webhook is still refused whole")
    func stillRefused() async throws {
        var telegram = Self.configured
        var root = Self.book(telegram)
        // A shop with webhooks on as well: this app cannot deliver those, and a
        // move made with a piece missing is worse than a move refused.
        root["settings"] = .object([
            "currency": .string("SAR"),
            "telegram": .object(telegram),
            "webhooks": .object(["enabled": .bool(true),
                                 "subscriptions": .array([.object(["id": .string("W1"),
                                                                   "url": .string("https://example.test/hook"),
                                                                   "events": .array([.string("*")])])])]),
        ])
        telegram["notifyOnComplete"] = .bool(true)
        await #expect(throws: Shop.MoveRefused.self) {
            _ = try await Self.move(&root, .completed)
        }
    }

    // MARK: - The two checks spelled out in Swift

    @Test("the token and chat-id checks agree with the shared rule")
    func checksAgree() async throws {
        let engine = try KhaytEngine()
        for token in ["123456:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw", "", "nope", "123456", "1:a b", "1:a-b_c"] {
            let theirs = try await engine.raw("KhaytTelegramMessage.isBotToken(\(Self.json(token)))", as: Bool.self)
            #expect(KhaytTelegram.isBotToken(token) == theirs, "\(token)")
        }
        for id in [" -100123456 ", "@khaytshop", "123; rm -rf /", "", "42"] {
            let theirs = try await engine.raw("KhaytTelegramMessage.chatId(\(Self.json(id)))", as: String.self)
            #expect(KhaytTelegram.chatId(id) == theirs, "\(id)")
        }
    }

    static func json(_ s: String) -> String {
        String(data: (try? JSONEncoder().encode(s)) ?? Data("\"\"".utf8), encoding: .utf8) ?? "\"\""
    }

    // MARK: - Sending

    @Test("a bot token that cannot be one is refused before anything is sent")
    func badToken() async throws {
        await #expect(throws: Telegram.Failure.badToken) {
            try await Telegram.send(botToken: "not-a-token", chatId: "1", message: "x")
        }
    }

    @Test("what Telegram says when it refuses is passed on")
    func refusal() {
        // A shop can act on "chat not found"; it cannot act on a bare 400.
        #expect(Shop.describe(.refused(400, "chat not found")) == "chat not found")
        #expect(Shop.describe(.refused(400, "")) == "HTTP 400")
        #expect(Shop.describe(.badToken).contains("Settings"))
    }
}
