import SwiftUI

/// Filing models into a group.
///
/// A group is a set that belongs together — the seven Saudi Kings, findable and
/// offerable as one collection. The names offered are the ones the shop already
/// uses, because the failure this design is avoiding is two chips called "Saudi
/// Kings" and "saudi kings" each holding part of one set. Typing a new name is
/// possible and deliberately second.
struct GroupMenu: View {
    @Bindable var shop: Shop
    @State private var naming = false
    @State private var typed = ""

    private var count: Int { shop.fileSelection.count }

    var body: some View {
        Menu {
            if count == 0 {
                Text("Select a model first")
            } else {
                ForEach(shop.groups, id: \.self) { group in
                    Button {
                        Task { await shop.fileSelection(under: group) }
                    } label: {
                        // A tick against the group they are already all in, so
                        // the menu says where they are as well as offering to
                        // move them.
                        if allAlreadyIn(group) { Label(group, systemImage: "checkmark") }
                        else { Text(group) }
                    }
                }
                if !shop.groups.isEmpty { Divider() }
                Button("New Group…") { typed = ""; naming = true }
                if shop.selectedFiles.contains(where: { $0.groupName != nil }) {
                    Button("Remove from Group") {
                        Task { await shop.fileSelection(under: "") }
                    }
                }
            }
        } label: {
            Label(count > 1 ? "Group \(count) Models" : "Group", systemImage: "square.stack")
        }
        .disabled(!shop.canWrite || count == 0)
        .help(shop.canWrite
              ? "File the selected models under one name"
              : "Another app has this book open, so nothing here can be changed")
        .popover(isPresented: $naming, arrowEdge: .bottom) {
            NameAGroup(typed: $typed) { name in
                naming = false
                let wanted = name.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !wanted.isEmpty else { return }
                Task { await shop.fileSelection(under: wanted) }
            }
        }
    }

    private func allAlreadyIn(_ group: String) -> Bool {
        let chosen = shop.selectedFiles
        return !chosen.isEmpty && chosen.allSatisfy { $0.groupName == group }
    }
}

private struct NameAGroup: View {
    @Binding var typed: String
    let done: (String) -> Void
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Name this group")
                .font(.system(size: 10, weight: .semibold))
                .textCase(.uppercase)
                .tracking(0.6)
                .foregroundStyle(.tertiary)
            TextField("Saudi Kings", text: $typed)
                .textFieldStyle(.roundedBorder)
                .frame(width: 220)
                .focused($focused)
                .onSubmit { done(typed) }
            Text("A name already in use keeps its spelling.")
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button("File") { done(typed) }
                    .keyboardShortcut(.defaultAction)
                    .disabled(typed.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(14)
        .onAppear { focused = true }
    }
}

/// What several selected models have in common, and what can be done to them.
struct ManyModels: View {
    let shop: Shop

    var body: some View {
        let chosen = shop.selectedFiles
        VStack(alignment: .leading, spacing: 16) {
            Text("\(chosen.count) models")
                .font(.title3.weight(.semibold))
            DetailSection("Together") {
                DetailLine("On disk", Format.bytes(chosen.compactMap(\.size).reduce(0, +)))
                DetailLine("Printed", "\(chosen.reduce(0) { $0 + $1.printCount })×", dim: true)
                let groups = Set(chosen.compactMap(\.groupName))
                DetailLine("Group",
                           groups.isEmpty ? "none"
                           : groups.count == 1 ? groups.first!
                           : "\(groups.count) different",
                           dim: groups.isEmpty)
                let missing = chosen.filter { !shop.fileIsPresent($0) }.count
                if missing > 0 { DetailLine("Not on this Mac", "\(missing)", warn: true) }
            }
            Text("Use the Group button in the toolbar to file them together.")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
    }
}
