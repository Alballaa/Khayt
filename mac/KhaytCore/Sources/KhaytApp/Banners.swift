import SwiftUI

/// What the window says across the top of every screen.
///
/// These lived in `Kanban.swift` because a drag is where a refusal is most
/// often earned. They belong to the WINDOW: ⇧⌘H, the Job menu and the jobs
/// table's context menu all move a job without a board in sight, and there a
/// refusal appeared nowhere at all.
/// Not a sheet: a modal would have to be dismissed before the next card could
/// be dragged, which turns "move four jobs" into eight gestures. This is read
/// where it is noticed and ignored where it is not, and the next move replaces
/// it.
struct MoveBanners: View {
    let shop: Shop

    var body: some View {
        if let problem = shop.moveProblem {
            Banner(text: problem, symbol: "exclamationmark.triangle", tint: .orange)
        }
        // By position, not by text: two spools running low can produce the same
        // sentence, and a ForEach with two identical ids draws one.
        ForEach(Array(shop.moveNotices.enumerated()), id: \.offset) { _, notice in
            Banner(text: notice, symbol: "info.circle", tint: .secondary)
        }
    }
}

struct Banner: View {
    let text: String
    let symbol: String
    let tint: Color

    var body: some View {
        Label(text, systemImage: symbol)
            .font(.callout)
            .foregroundStyle(tint)
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 7)
            .background(.quinary)
    }
}


/// The one that means nothing else on screen can be trusted.
///
/// If the shared rules did not load there is no engine, so every figure this
/// app shows is absent or zero — an empty dashboard, a blank P&L, no attention
/// list — and each of those looks exactly like a quiet shop. It was said in one
/// caption at the FOOT OF THE SIDEBAR, which is the one place the HIG says not
/// to put critical information: "people often relocate a window in a way that
/// hides its bottom edge".
///
/// So it is said here as well, where the figures are. The sidebar keeps its
/// line — that one is the persistent record, and this is the alarm.
struct EngineBanner: View {
    let shop: Shop

    var body: some View {
        if let problem = shop.engineProblem {
            Banner(text: shop.words.callIt("mac.engine_failed") + " \u{2014} " + problem,
                   symbol: "exclamationmark.octagon", tint: .orange)
        }
    }
}
