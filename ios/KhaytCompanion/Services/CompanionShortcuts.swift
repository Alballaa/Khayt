import AppIntents

struct OpenOrdersShortcut: AppIntent {
    static var title: LocalizedStringResource = "Open production queue"
    static var description = IntentDescription("Opens Khayt Companion orders tab.")
    static var openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        UserDefaults.standard.set("orders", forKey: "khayt.pending.tab")
        return .result()
    }
}

struct OpenInventoryShortcut: AppIntent {
    static var title: LocalizedStringResource = "Open filament inventory"
    static var description = IntentDescription("Opens Khayt Companion inventory.")
    static var openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        UserDefaults.standard.set("inventory", forKey: "khayt.pending.tab")
        return .result()
    }
}

struct KhaytCompanionShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenOrdersShortcut(),
            phrases: ["Open \(.applicationName) queue", "Show \(.applicationName) orders"],
            shortTitle: "Queue",
            systemImageName: "rectangle.stack"
        )
        AppShortcut(
            intent: OpenInventoryShortcut(),
            phrases: ["Open \(.applicationName) inventory", "Show \(.applicationName) spools"],
            shortTitle: "Inventory",
            systemImageName: "cylinder.split.1x2"
        )
    }
}
