import Foundation

extension QueueOrder {
    var isOverdue: Bool {
        DueDateParser.isOverdue(dueDate)
    }

    var formattedDueDate: String? {
        guard let dueDate, !dueDate.isEmpty else { return nil }
        return dueDate
    }
}

extension OrderLogEntry {
    var isOverdue: Bool {
        DueDateParser.isOverdue(dueDate)
    }
}

enum DueDateParser {
    private static let formats = ["yyyy-MM-dd", "yyyy/MM/dd", "dd/MM/yyyy", "MM/dd/yyyy"]

    static func isOverdue(_ raw: String?) -> Bool {
        guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty,
              let due = parse(raw) else { return false }
        return due < Calendar.current.startOfDay(for: Date())
    }

    static func parse(_ raw: String) -> Date? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.count >= 10 {
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let d = iso.date(from: trimmed) { return d }
            iso.formatOptions = [.withInternetDateTime]
            if let d = iso.date(from: trimmed) { return d }
            let prefix = String(trimmed.prefix(10))
            for f in formats {
                let df = DateFormatter()
                df.locale = Locale(identifier: "en_US_POSIX")
                df.dateFormat = f
                if let d = df.date(from: prefix) { return d }
            }
        }
        for f in formats {
            let df = DateFormatter()
            df.locale = Locale(identifier: "en_US_POSIX")
            df.dateFormat = f
            if let d = df.date(from: trimmed) { return d }
        }
        return nil
    }
}

extension OrderStatus {
    var localizedLabel: String {
        switch self {
        case .pending: return L10n.tr("status.pending")
        case .printing: return L10n.tr("status.printing")
        case .post: return L10n.tr("status.post")
        case .qc: return L10n.tr("status.qc")
        case .completed: return L10n.tr("status.completed")
        case .on_hold: return L10n.tr("status.on_hold")
        }
    }
}
