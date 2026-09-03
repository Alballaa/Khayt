import Foundation
import Observation
import KhaytCore

/// Everything on screen comes from here: one store, opened once, read only.
@MainActor @Observable
final class Shop {

    /// Where the book being shown comes from. Named on screen at all times —
    /// looking at the sample and thinking it is the shop's real position is the
    /// one mistake this app must not let anyone make.
    enum Source: Hashable, Identifiable {
        case sample
        case store(StoreReader.Build)

        var id: String {
            switch self {
            case .sample: "sample"
            case .store(let b): b.rawValue
            }
        }
        var title: String {
            switch self {
            case .sample: "Sample shop"
            case .store(.development): "This Mac — development"
            case .store(.shipped): "This Mac — Khayt"
            }
        }
        var symbol: String {
            switch self {
            case .sample: "theatermasks"
            case .store: "internaldrive"
            }
        }
        var isReal: Bool { if case .store = self { true } else { false } }
        var build: StoreReader.Build? { if case .store(let b) = self { b } else { nil } }
    }

    private(set) var source: Source
    private(set) var orders: [Order] = []
    private(set) var files: [LibraryFile] = []
    /// Where this shop's models live. Resolved once per book, because it reads
    /// settings and probes the disk, and every cell asks about it.
    private(set) var libraryRoots: LibraryLocation.Roots?
    private(set) var shopName = "Khayt"
    private(set) var currency = "SAR"
    private(set) var skipped: [String] = []
    private(set) var problem: String?
    private(set) var taxSummary: String?
    private(set) var settingsValue: JSONValue = .object([:])

    var selection: Order.ID?
    var fileSelection: LibraryFile.ID?
    var shelf: Shelf = .jobs(nil)
    var search = ""

    /// Which shelf of the book is open. One selection rather than two, because
    /// "a stage is chosen" and "the library is showing" are not independent —
    /// holding them separately is how a screen ends up filtering jobs by a stage
    /// nobody can see.
    enum Shelf: Hashable {
        /// nil is every job.
        case jobs(Stage?)
        /// nil is every model; a string is one group.
        case library(String?)
    }

    var stage: Stage? { if case .jobs(let s) = shelf { s } else { nil } }
    var showingLibrary: Bool { if case .library = shelf { true } else { false } }

    /// The sources that can actually be opened on this Mac. A menu offering a
    /// store that is not there is a dead end dressed up as a choice.
    static var available: [Source] {
        [.sample] + StoreReader.Build.allCases.filter(\.exists).map(Source.store)
    }

    /// The shared business logic, started once. Building a JSContext and
    /// loading eight modules takes a few milliseconds — trivial once, wasteful
    /// per row, and this is the object rows ask about money.
    private var engine: KhaytEngine?

    init(source: Source = .sample) {
        self.source = source
    }

    func load(_ next: Source) async {
        source = next
        problem = nil
        skipped = []
        do {
            let root: [String: JSONValue]
            switch next {
            case .sample:
                guard let url = Bundle.module.url(forResource: "sample-shop", withExtension: "json"),
                      let data = try? Data(contentsOf: url) else {
                    throw Failure.missingSample
                }
                root = try JSONDecoder().decode([String: JSONValue].self, from: data)
            case .store(let build):
                root = try StoreReader(build: build).raw
            }
            let decoded = try Self.decodeOrders(root)
            orders = decoded.items
            skipped = decoded.skipped
            let library = Self.decodeFiles(root)
            files = library.items
            skipped += library.skipped
            libraryRoots = next.build.map { build in
                LibraryLocation.resolveRoots(settings: Self.librarySettings(root),
                                             defaultRoot: LibraryLocation.defaultRoot(for: build))
            }
            fileSelection = nil
            if case .object(let settings)? = root["settings"] {
                if case .string(let n)? = settings["shopName"], !n.isEmpty { shopName = n }
                else { shopName = next.title }
                if case .string(let c)? = settings["currency"] { currency = c }
            }
            if engine == nil { engine = try? KhaytEngine() }
            settingsValue = root["settings"] ?? .object([:])
            taxSummary = await describeTax(root["settings"])
        } catch {
            orders = []
            files = []
            libraryRoots = nil
            problem = String(describing: error)
        }
    }

    enum Failure: Error { case missingSample }

    private static func decodeOrders(_ root: [String: JSONValue]) throws -> (items: [Order], skipped: [String]) {
        guard case .array(let rows)? = root["printLog"] else { return ([], []) }
        let encoder = JSONEncoder(), decoder = JSONDecoder()
        var items: [Order] = [], skipped: [String] = []
        for row in rows {
            do { items.append(try decoder.decode(Order.self, from: try encoder.encode(row))) }
            catch {
                var id = "(no id)"
                if case .object(let o) = row, case .string(let s)? = o["id"] { id = s }
                skipped.append(id)
            }
        }
        return (items, skipped)
    }

    private static func decodeFiles(_ root: [String: JSONValue]) -> (items: [LibraryFile], skipped: [String]) {
        guard case .array(let rows)? = root["printFiles"] else { return ([], []) }
        let encoder = JSONEncoder(), decoder = JSONDecoder()
        var items: [LibraryFile] = [], skipped: [String] = []
        for row in rows {
            do { items.append(try decoder.decode(LibraryFile.self, from: try encoder.encode(row))) }
            catch {
                var id = "(no id)"
                if case .object(let o) = row, case .string(let s)? = o["id"] { id = s }
                skipped.append(id)
            }
        }
        return (items, skipped)
    }

    private static func librarySettings(_ root: [String: JSONValue]) -> JSONValue? {
        guard case .object(let settings)? = root["settings"] else { return nil }
        return settings["printLibrary"]
    }

    /// Read the shop's tax setup through the shared engine rather than the
    /// settings dictionary. `lib/tax.js` is what decides whether a shop is
    /// registered, at what rate, and whether its prices include the tax — and
    /// the answer differs by country, which is exactly the sort of thing a
    /// second implementation gets subtly wrong.
    private func describeTax(_ settings: JSONValue?) async -> String? {
        guard case .object(let dict)? = settings, let engine else { return nil }
        guard let profile = try? await engine.taxProfile(settings: dict), profile.isRegistered else { return nil }
        let mode = profile.mode == .inclusive ? "included in the price" : "added on top"
        return "\(profile.name) \(Money.figure(profile.totalPercent))% \(mode)"
    }

    /// A price split into what the shop keeps and what it is only holding for
    /// the tax authority. Computed by `lib/tax.js`, not here.
    func taxSplit(_ amount: Double) async -> TaxSplit? {
        guard let engine, case .object(let dict) = settingsValue else { return nil }
        guard let profile = try? await engine.taxProfile(settings: dict), profile.isRegistered else { return nil }
        return try? await engine.computeTax(amount, profile: profile)
    }

    // MARK: - What the table shows

    var shown: [Order] {
        var rows = orders
        if let stage { rows = rows.filter { Stage.of($0) == stage } }
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        if !q.isEmpty {
            rows = rows.filter {
                $0.project.lowercased().contains(q) || $0.client.lowercased().contains(q)
                    || $0.id.lowercased().contains(q)
            }
        }
        return rows
    }

    func count(_ stage: Stage) -> Int { orders.count { Stage.of($0) == stage } }

    // MARK: - What the library shows

    /// The groups a shop has actually made, in the order it reads them.
    var groups: [String] {
        var seen = Set<String>(), out: [String] = []
        for g in files.compactMap(\.group) where !seen.contains(g) {
            seen.insert(g); out.append(g)
        }
        return out.sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    }

    var ungroupedCount: Int { files.count { $0.group == nil } }

    var shownFiles: [LibraryFile] {
        var rows = files
        if case .library(let group) = shelf, let group {
            rows = rows.filter { $0.group == group }
        }
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        if !q.isEmpty {
            rows = rows.filter {
                $0.title.lowercased().contains(q)
                    || ($0.material ?? "").lowercased().contains(q)
                    || ($0.tags ?? []).contains { $0.lowercased().contains(q) }
            }
        }
        return rows.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
    }

    var selectedFile: LibraryFile? { files.first { $0.id == fileSelection } }

    func count(group: String) -> Int { files.count { $0.group == group } }

    /// The record's folder on this Mac, if it is on this Mac at all.
    func directory(for file: LibraryFile) -> URL? {
        guard let roots = libraryRoots else { return nil }
        return LibraryLocation.directory(for: file.id, roots: roots.roots)
    }

    func fileIsPresent(_ file: LibraryFile) -> Bool { directory(for: file) != nil }

    /// A photograph the shop took beats a generated thumbnail: it is the print
    /// as it came off the bed, which is what someone is trying to recognise.
    func thumbnail(for file: LibraryFile) -> ThumbnailSource? {
        if let photo = file.userPhoto, photo.hasPrefix("data:") { return .inlineData(photo) }
        guard let dir = directory(for: file) else { return nil }
        let name = file.thumbFile ?? "thumb.jpg"
        let url = dir.appending(path: name)
        return FileManager.default.fileExists(atPath: url.path) ? .file(url) : nil
    }

    /// What the shop is owed across everything still open. The one number an
    /// owner looks for, so it is on screen without being asked for.
    var owed: Double { orders.filter { !$0.isSettled }.reduce(0) { $0 + $1.owed } }
    var overdueCount: Int { orders.count { $0.isOverdue() } }

    var selected: Order? { orders.first { $0.id == selection } }
}
