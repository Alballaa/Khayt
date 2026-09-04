import Foundation
import Observation
import SwiftUI
import KhaytCore

/// What the app calls things.
///
/// Two catalogues, in this order, and the order is the point.
///
/// **Khayt's own translations first.** `renderer/locales/*.js` is bundled and
/// run, so a stage this app calls "قيد الطباعة" is called that because the
/// Electron app calls it that. An app that invents its own word for "Owed" has
/// given one shop two vocabularies, and the person reading the second one has to
/// work out that it means the first.
///
/// **This app's own catalogue second**, for the handful of things Khayt has
/// never needed a word for — "Opened read-only", "On this Mac". They are kept
/// here rather than added to the shared locale files because that catalogue is
/// nine languages wide and guarded for completeness: adding a key there means
/// adding it in nine, and an English value sitting in `ar.js` is precisely the
/// failure `test/locale-quality.test.js` exists to catch.
@MainActor @Observable
final class Words {
    private(set) var language = "en"
    private var khayt: [String: String] = [:]

    /// Arabic reads right to left. This is a LAYOUT property, not a translation:
    /// it moves the sidebar, flips every leading/trailing edge, and reverses the
    /// table's column order.
    var isRTL: Bool { language == "ar" }

    /// Mirroring is NOT done from here — see `Direction`.
    ///
    /// `.environment(\\.layoutDirection, .rightToLeft)` on the window loops
    /// SwiftUI's `NavigationSplitView` until AppKit aborts, so the writing
    /// direction is set the way AppKit has always done it, before the app
    /// starts. This value is kept for views that need to ask, and for the tests.
    var layout: LayoutDirection { isRTL ? .rightToLeft : .leftToRight }

    /// Which languages this app has words for. English is the fallback and Arabic
    /// is the one that changes the layout; the other seven are a matter of
    /// bundling more files, not of new machinery.
    static let supported = ["en", "ar"]

    func load(_ wanted: String?, engine: KhaytEngine?) async {
        let lang = Self.supported.contains(wanted ?? "") ? wanted! : "en"
        language = lang
        khayt = (try? await engine?.translations(language: lang)) ?? [:]
    }

    /// Khayt's word, then this app's, then the key — which is visible enough on
    /// screen to be reported rather than quietly reading as a label.
    func callIt(_ key: String) -> String {
        if let theirs = khayt[key], !theirs.isEmpty { return theirs }
        if let mine = Self.own[key]?[language] ?? Self.own[key]?["en"] { return mine }
        return key
    }

    /// The words this app needed and Khayt did not have.
    ///
    /// Every entry carries both languages. A key with only English is worse than
    /// no key at all: it reads as a translation that happens to look English, and
    /// nothing tells anyone it is missing.
    static let own: [String: [String: String]] = [
        // Shelves
        "mac.all_jobs":      ["en": "All jobs",      "ar": "كل الأعمال"],
        "mac.pipeline":      ["en": "Pipeline",      "ar": "المسار"],
        "mac.library":       ["en": "Library",       "ar": "المكتبة"],
        "mac.all_models":    ["en": "All models",    "ar": "كل المجسمات"],
        "mac.people":        ["en": "People",        "ar": "الأشخاص"],
        "mac.customers":     ["en": "Customers",     "ar": "العملاء"],
        // Stage — the one status Khayt has no word for
        "mac.cancelled":     ["en": "Cancelled",     "ar": "ملغى"],
        // Columns
        "mac.job":           ["en": "Job",           "ar": "العمل"],
        "mac.stage":         ["en": "Stage",         "ar": "المرحلة"],
        "mac.settled":       ["en": "settled",       "ar": "مسدّد"],
        "mac.jobs_count":    ["en": "Jobs",          "ar": "الأعمال"],
        "mac.open_count":    ["en": "Open",          "ar": "المفتوحة"],
        "mac.last_job":      ["en": "Last job",      "ar": "آخر عمل"],
        "mac.billed":        ["en": "Billed",        "ar": "المفوتر"],
        // Provenance
        "mac.read_only":     ["en": "Opened read-only",          "ar": "مفتوح للقراءة فقط"],
        "mac.writable":      ["en": "This book is yours to change", "ar": "هذا الدفتر تحت تصرفك"],
        "mac.sample":        ["en": "Sample data",   "ar": "بيانات تجريبية"],
        "mac.not_real_shop": ["en": "sample data — not a real shop",
                              "ar": "بيانات تجريبية — ليست محلاً حقيقياً"],
        "mac.yours":         ["en": "yours to change", "ar": "تحت تصرفك"],
        // Library
        "mac.on_this_mac":   ["en": "On this Mac",   "ar": "على هذا الجهاز"],
        "mac.not_found":     ["en": "not found",     "ar": "غير موجود"],
        "mac.printed":       ["en": "Printed",       "ar": "طُبع"],
        "mac.never":         ["en": "never",         "ar": "لم يُطبع"],
        "mac.last_run":      ["en": "Last run",      "ar": "آخر تشغيل"],
        "mac.mesh":          ["en": "Mesh",          "ar": "المجسم"],
        "mac.triangles":     ["en": "Triangles",     "ar": "المثلثات"],
        "mac.swaps":         ["en": "Swaps",         "ar": "التبديلات"],
        "mac.filament":      ["en": "Filament",      "ar": "الخيط"],
        "mac.file":          ["en": "File",          "ar": "الملف"],
        "mac.money":         ["en": "Money",         "ar": "المال"],
        "mac.parts":         ["en": "Parts",         "ar": "الأجزاء"],
        "mac.machine_time":  ["en": "Machine time",  "ar": "زمن التشغيل"],
        "mac.shop_keeps":    ["en": "Shop keeps",    "ar": "يبقى للمحل"],
        "mac.reveal":        ["en": "Reveal",        "ar": "إظهار"],
        "mac.open":          ["en": "Open",          "ar": "فتح"],
        "mac.name":          ["en": "Name",          "ar": "الاسم"],
        "mac.late":          ["en": "late",          "ar": "متأخرة"],
        "mac.owed_caps":     ["en": "OWED",          "ar": "المستحق"],
        "mac.sort_default":  ["en": "Favourites first", "ar": "المفضّلة أولاً"],
        "mac.sort_by":       ["en": "Sort Library By",  "ar": "ترتيب المكتبة حسب"],
        "mac.dashboard":     ["en": "Dashboard",       "ar": "اللوحة"],
        "mac.late_tile":     ["en": "Late",            "ar": "متأخرة"],
        "mac.needs_attention": ["en": "Needs attention", "ar": "يحتاج انتباهك"],
        "mac.the_floor":     ["en": "The floor",       "ar": "الورشة"],
        "mac.machines":      ["en": "Machines",        "ar": "الطابعات"],
        "mac.revenue":       ["en": "Revenue",         "ar": "الإيراد"],
        "mac.margin":        ["en": "Margin",          "ar": "هامش الربح"],
        "mac.avg_order":     ["en": "Average job",     "ar": "متوسط العمل"],
        "mac.days_late":     ["en": "{n} days late",   "ar": "متأخر {n} يوماً"],
        "mac.no_figures":    ["en": "No figures yet",  "ar": "لا أرقام بعد"],
        "mac.no_figures_hint": ["en": "They appear once the shop's book has loaded.",
                                "ar": "تظهر بعد تحميل دفتر المحل."],
        "mac.search_jobs": ["en": "Job, customer or number", "ar": "عمل أو عميل أو رقم"],
        "mac.search_models": ["en": "Model, material or tag", "ar": "مجسم أو خامة أو وسم"],
        "mac.search_people": ["en": "Customer or job", "ar": "عميل أو عمل"],
        "mac.no_job": ["en": "No job selected", "ar": "لم يُختر عمل"],
        "mac.no_job_hint": ["en": "Pick a row to see its parts and its money.", "ar": "اختر صفاً لعرض أجزائه وحسابه."],
        "mac.no_model": ["en": "No model selected", "ar": "لم يُختر مجسم"],
        "mac.no_model_hint": ["en": "Pick a model to see its file and its filament.", "ar": "اختر مجسماً لعرض ملفه وخيطه."],
        "mac.no_customer": ["en": "No customer selected", "ar": "لم يُختر عميل"],
        "mac.no_customer_hint": ["en": "Pick a row to see their jobs and their balance.", "ar": "اختر صفاً لعرض أعماله ورصيده."],
        "mac.models_count": ["en": "models", "ar": "مجسمات"],
        "mac.customers_count": ["en": "customers", "ar": "عملاء"],
    ]

    /// The Khayt keys this app leans on. Listed so a test can prove every one of
    /// them still exists in every bundled language — a key that disappears from
    /// the shared catalogue would otherwise surface as a raw `queue.printing`
    /// sitting in the sidebar.
    static let borrowed = [
        "queue.quote", "queue.pending", "queue.printing", "queue.completed",
        "queue.delivered", "doc.client", "doc.due", "doc.notes", "common.total",
        "flow.owed", "flow.paid", "plib.group", "plib.unfiled", "plib.favorite",
        "plib.material", "plib.tags_short", "plib.group_ph", "set.store_size",
        "tab.clients",
    ]
}
