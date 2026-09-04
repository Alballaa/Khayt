import SwiftUI
import KhaytCore

/// Writing a customer down.
///
/// Both names, because a Saudi shop keeps both and an invoice may need either —
/// and either one alone is enough, which is Khayt's own rule. The registration
/// numbers are here because they go on an invoice and there is nowhere else in
/// this app to put them.
///
/// The fields this app does not offer — the price list, the recurring schedule,
/// the communications log — are the shop's and are carried through untouched by
/// `saveCustomer`. A screen that shows six fields must not delete the other ten.
struct CustomerSheet: View {
    let shop: Shop
    let existing: Client

    @State private var draft: Client
    @State private var started = false
    @FocusState private var focused: Bool

    init(shop: Shop, existing: Client) {
        self.shop = shop
        self.existing = existing
        _draft = State(initialValue: existing)
    }

    private var isNew: Bool { shop.clients.allSatisfy { $0.id != existing.id } }

    private var canSave: Bool {
        !draft.nameEn.trimmingCharacters(in: .whitespaces).isEmpty
            || !draft.nameAr.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(shop.words.callIt(isNew ? "mac.new_customer" : "mac.edit_customer"))
                .font(.headline)

            Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 10) {
                GridRow {
                    Text(shop.words.callIt("ce.name_en")).gridColumnAlignment(.trailing)
                        .foregroundStyle(.secondary)
                    TextField("", text: binding(\.nameEn)).textFieldStyle(.roundedBorder)
                        .focused($focused)
                }
                GridRow {
                    Text(shop.words.callIt("ce.name_ar")).gridColumnAlignment(.trailing)
                        .foregroundStyle(.secondary)
                    // Right to left whatever the app is set to: the field holds
                    // Arabic by definition, and typing into a left-aligned box
                    // puts the cursor in the wrong place.
                    TextField("", text: binding(\.nameAr)).textFieldStyle(.roundedBorder)
                        .environment(\.layoutDirection, .rightToLeft)
                }
                GridRow {
                    Text(shop.words.callIt("ce.phone")).gridColumnAlignment(.trailing)
                        .foregroundStyle(.secondary)
                    TextField("+966 5x xxx xxxx", text: binding(\.phone))
                        .textFieldStyle(.roundedBorder)
                }
                GridRow {
                    Text(shop.words.callIt("ce.email")).gridColumnAlignment(.trailing)
                        .foregroundStyle(.secondary)
                    TextField("", text: binding(\.email)).textFieldStyle(.roundedBorder)
                }
                GridRow {
                    Text(shop.words.callIt("ce.cr")).gridColumnAlignment(.trailing)
                        .foregroundStyle(.secondary)
                    TextField("", text: binding(\.cr)).textFieldStyle(.roundedBorder)
                }
                GridRow {
                    Text(shop.words.callIt("ce.vat")).gridColumnAlignment(.trailing)
                        .foregroundStyle(.secondary)
                    TextField("", text: binding(\.vat)).textFieldStyle(.roundedBorder)
                }
                GridRow {
                    Text(shop.words.callIt("ce.notes")).gridColumnAlignment(.trailing)
                        .foregroundStyle(.secondary)
                    TextField("", text: binding(\.notes), axis: .vertical)
                        .textFieldStyle(.roundedBorder).lineLimit(2...4)
                }
            }

            HStack {
                if !canSave {
                    Text(shop.words.callIt("ce.need_name"))
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Button(shop.words.callIt("common.cancel")) { shop.editingCustomer = nil }
                    .keyboardShortcut(.cancelAction)
                Button(shop.words.callIt("common.save")) {
                    let saving = draft
                    Task { await shop.saveCustomer(saving) }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(!canSave)
            }
        }
        .padding(18)
        .frame(width: 420)
        .onAppear {
            guard !started else { return }
            started = true
            focused = true
        }
    }

    /// A text binding onto one field of the draft.
    ///
    /// `Client` is a value with `let` fields — it is a record, not a form — so
    /// editing rebuilds it. That keeps the record's shape in one place rather
    /// than growing a second mutable copy of it.
    private func binding(_ key: KeyPath<Client, String>) -> Binding<String> {
        Binding(
            get: { draft[keyPath: key] },
            set: { draft = draft.with(key, $0) }
        )
    }
}
