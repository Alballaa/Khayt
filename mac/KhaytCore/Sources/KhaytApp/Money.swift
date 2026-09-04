import SwiftUI

/// Money on screen.
///
/// Two rules, and both of them are why a spreadsheet reads better than most
/// apps: figures are right-aligned so the units line up, and they are set in
/// monospaced digits so they do not shuffle sideways as the numbers change. The
/// Electron app sets money in the proportional UI face inside a flex row, and
/// the columns wander by a character or two down the page.
enum Money {
    static func text(_ amount: Double, _ currency: String) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        let n = f.string(from: amount as NSNumber) ?? "\(amount)"
        return "\(n) \(currency)"
    }

    /// Just the figure, for columns where the currency is stated once at the top
    /// rather than repeated on all forty rows.
    static func figure(_ amount: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        return f.string(from: amount as NSNumber) ?? "\(amount)"
    }

    /// Money with the small change rubbed off, for a dashboard tile.
    ///
    /// A tile is read at a glance; "52,691.57 SAR" at 24pt either wraps or
    /// shrinks to unreadable, and the last two digits are not what anyone is
    /// looking at from across a workshop. The exact figure is a column away on
    /// the jobs shelf.
    static func short(_ amount: Double, _ currency: String) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = amount >= 10_000 ? 0 : 2
        f.minimumFractionDigits = 0
        let n = f.string(from: amount as NSNumber) ?? "\(amount)"
        return "\(n) \(currency)"
    }
}

extension View {
    /// Right-aligned, monospaced-digit money.
    func moneyStyle() -> some View {
        self.monospacedDigit()
            .frame(maxWidth: .infinity, alignment: .trailing)
    }
}
