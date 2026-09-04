import Foundation
import KhaytCore

/// The shop's Telegram bot.
///
/// The MESSAGE is `lib/telegram-message.js`, so this app says exactly what
/// Khayt says. Only the sending is native, because sending is a platform's
/// job — Electron has its main process, this has URLSession.
///
/// This exists to remove a real blocker rather than to add a feature: a move
/// that would reach outside the shop is refused whole, so a shop whose only
/// integration is a Telegram bot could not finish a job on the Mac at all.
enum Telegram {

    /// What went wrong, in terms a shop can act on.
    enum Failure: Error, Equatable {
        /// The bot token in Settings cannot be a Telegram token.
        case badToken
        /// The chat id in Settings is not one Telegram can deliver to.
        case badChatId
        /// Telegram answered, and said no.
        case refused(Int, String)
        /// It could not be reached at all.
        case unreachable(String)
    }

    /// Send one message, and wait for Telegram to say it took it.
    ///
    /// AWAITED, not fired and forgotten. The whole reason the Mac refused
    /// these moves is that a piece of the move could not be done; a send whose
    /// result nobody looks at would put the app back where it started, with a
    /// job marked complete and a customer never told.
    static func send(botToken: String, chatId: String, message: String,
                     session: URLSession = .shared) async throws {
        guard KhaytTelegram.isBotToken(botToken) else { throw Failure.badToken }
        // Refused before anything is sent, and named: a mangled chat id sends
        // to nowhere and reports a bare 400.
        guard let chat = KhaytTelegram.chatId(chatId) else { throw Failure.badChatId }
        // Percent-encoded into the path, as the Electron handler does: a token
        // is not a path component a URL should be trusted to parse.
        let escaped = botToken.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? botToken
        guard let url = URL(string: "https://api.telegram.org/bot\(escaped)/sendMessage") else {
            throw Failure.badToken
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // Ten seconds, the same as Electron's. A shop finishing a job should
        // not wait on a network that is not answering.
        request.timeoutInterval = 10
        request.httpBody = try JSONEncoder().encode([
            "chat_id": chat,
            "text": String(message.prefix(KhaytTelegram.maxMessage)),
        ])

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw Failure.unreachable(error.localizedDescription)
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            // Telegram says why in `description`, and it is worth passing on:
            // "chat not found" is a settings mistake a shop can fix, and a
            // bare 400 is not.
            var why = ""
            if let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                why = body["description"] as? String ?? ""
            }
            throw Failure.refused(status, why)
        }
    }
}

/// The message rule, as this app reaches it.
///
/// A thin Swift face on `lib/telegram-message.js` so the call sites read like
/// the rest of the app; every decision is still the module's.
enum KhaytTelegram {
    static let maxMessage = 4096

    static func isBotToken(_ token: String) -> Bool {
        // The same shape the module checks and the Electron main process
        // checks. Spelled here because it is asked on the way into a network
        // call, where a bridge crossing to answer "is this string shaped like
        // a token" would be absurd — and pinned to the module by a test.
        token.range(of: "^[0-9]+:[A-Za-z0-9_-]+$", options: .regularExpression) != nil
    }

    /// A chat id Telegram will accept, or nil.
    ///
    /// Either a numeric id (negative for a group or channel) or a public
    /// `@username` of 5–32 letters, digits and underscores. Khayt used to strip
    /// with `[^0-9@-]`, which keeps the @ and throws the name away — a shop
    /// that typed `@khaytshop` was sending to `@` and getting nothing.
    ///
    /// Spelled here because it is asked on the way into a network call, and
    /// pinned to `lib/telegram-message.js` by a test that runs both.
    static func chatId(_ value: String) -> String? {
        let raw = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return nil }
        if raw.range(of: "^-?[0-9]+$", options: .regularExpression) != nil { return raw }
        let name = raw.hasPrefix("@") ? String(raw.dropFirst()) : raw
        guard name.range(of: "^[A-Za-z0-9_]{5,32}$", options: .regularExpression) != nil,
              name.contains(where: { $0.isLetter || $0 == "_" }) else { return nil }
        return "@" + name
    }
}
