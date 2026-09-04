import SwiftUI
import KhaytCore

/// The machines.
///
/// A card each rather than a table: a shop has a handful of printers, not four
/// hundred, and what you want from a machine — its bed, its nozzle, how many
/// colours — does not line up into columns worth scanning.
struct Machines: View {
    let shop: Shop

    private let columns = [GridItem(.adaptive(minimum: 280, maximum: 420), spacing: 16)]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 16) {
                ForEach(shop.machines) { machine in
                    Card(machine: machine, wear: shop.wear[machine.id], shop: shop)
                }
            }
            .padding(16)
        }
        .background(.background)
        .overlay {
            if shop.machines.isEmpty {
                ContentUnavailableView(shop.words.callIt("mac.no_machines"),
                                       systemImage: "printer",
                                       description: Text(shop.words.callIt("mac.no_machines_hint")))
            }
        }
        .toolbar {
            ToolbarItem {
                Button(shop.words.callIt("mach.add"), systemImage: "plus") { shop.addingMachine = true }
                    .disabled(!shop.canMoveJobs)
            }
        }
    }
}

private struct Card: View {
    let machine: Machine
    let wear: NozzleWear?
    let shop: Shop

    var body: some View {
        card
            .contextMenu {
                if shop.canMoveJobs {
                    Button(shop.words.callIt("mach.edit")) { shop.editingMachine = machine }
                }
            }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                // The colour the shop gave this machine, which is how it is
                // recognised on every other screen in Khayt.
                RoundedRectangle(cornerRadius: 3)
                    .fill(swatch)
                    .frame(width: 4, height: 30)
                VStack(alignment: .leading, spacing: 1) {
                    Text(machine.name).font(.title3.weight(.semibold)).lineLimit(1)
                        // The name is the handle: clicking it opens the printer,
                        // the way clicking a job's name opens the job.
                        .onTapGesture(count: 2) {
                            if shop.canMoveJobs { shop.editingMachine = machine }
                        }
                    if !machine.model.isEmpty {
                        Text(machine.model).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }

            // Only when there is something under it. A section header with
            // nothing beneath it reads as a screen that failed to load.
            if hasSpecs {
            DetailSection(shop.words.callIt("mac.the_machine")) {
                if let bed = machine.bedSize { DetailLine(shop.words.callIt("mac.bed"), bed) }
                if let d = machine.nozzleDiameter {
                    DetailLine(shop.words.callIt("mac.nozzle"), "\(Money.figure(d)) mm")
                }
                if let n = machine.maxColors { DetailLine(shop.words.callIt("mac.colours"), "\(n)") }
                if let e = machine.extruderType { DetailLine(shop.words.callIt("mac.extruder"), e) }
                if let w = machine.powerDraw { DetailLine(shop.words.callIt("mac.power"), "\(Int(w)) W") }
                if let address = machine.address {
                    // The address, never the key. The store keeps that encrypted
                    // and this screen has no business opening it to say where a
                    // printer lives.
                    DetailLine(shop.words.callIt("mac.address"), address, dim: true)
                }
            }
            }

            if let wear, let nozzle = machine.nozzle {
                DetailSection(shop.words.callIt("mac.nozzle_wear")) {
                    // The bar is the figure. `lib/nozzle-wear.js` weights an
                    // abrasive kilo differently from a plain one, and this shows
                    // its answer rather than grams over threshold.
                    ProgressView(value: min(1, wear.pct / 100)) {
                        HStack {
                            Text("\(Int(wear.wear)) / \(Int(wear.threshold)) g")
                                .monospacedDigit()
                            Spacer()
                            if wear.over {
                                Text(shop.words.callIt("mac.nozzle_due")).foregroundStyle(.orange)
                            } else {
                                Text("\(Int(wear.pct))%").monospacedDigit().foregroundStyle(.secondary)
                            }
                        }
                        .font(.caption)
                    }
                    .tint(wear.over ? .orange : .accentColor)
                    if let installed = nozzle.installedAt, let day = Order.day(installed) {
                        DetailLine(shop.words.callIt("mac.installed"),
                                   day.formatted(date: .abbreviated, time: .omitted), dim: true)
                    }
                    if let material = nozzle.material {
                        DetailLine(shop.words.callIt("plib.material"), material, dim: true)
                    }
                }
            }

            if let materials = machine.compatMaterials, !materials.isEmpty {
                DetailSection(shop.words.callIt("mac.takes")) {
                    Text(materials.joined(separator: " · "))
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quinary, in: RoundedRectangle(cornerRadius: 10))
    }

    private var hasSpecs: Bool {
        machine.bedSize != nil || machine.nozzleDiameter != nil || machine.maxColors != nil
            || machine.extruderType != nil || machine.powerDraw != nil || machine.address != nil
    }

    private var swatch: Color {
        guard var hex = machine.color?.trimmingCharacters(in: .whitespaces), !hex.isEmpty else {
            return .secondary
        }
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard hex.count == 6, let v = Int(hex, radix: 16) else { return .secondary }
        return Color(red: Double((v >> 16) & 0xFF) / 255,
                     green: Double((v >> 8) & 0xFF) / 255,
                     blue: Double(v & 0xFF) / 255)
    }
}

/// The filament on the shelf.
struct Inventory: View {
    @Bindable var shop: Shop
    @SceneStorage("inventory.columns") private var columns: TableColumnCustomization<Spool>
    @State private var selection: Spool.ID?

    var body: some View {
        Table(shop.spools, selection: $selection, columnCustomization: $columns) {
            TableColumn(shop.words.callIt("plib.material")) { spool in
                Text(spool.material.isEmpty ? "—" : spool.material).lineLimit(1)
            }
            .width(min: 140, ideal: 200, max: 320)

            TableColumn(shop.words.callIt("mac.weight")) { spool in
                Text(spool.weight.map { "\(Int($0)) g" } ?? "—").moneyStyle()
            }
            .width(min: 74, ideal: 92, max: 120)
            .alignment(.trailing)

            TableColumn(shop.words.callIt("mac.cost")) { spool in
                Text(spool.cost.map { Money.figure($0) } ?? "—").moneyStyle()
            }
            .width(min: 74, ideal: 92, max: 130)
            .alignment(.trailing)

            TableColumn(shop.words.callIt("mac.per_kilo")) { spool in
                // The number that compares two suppliers. A spool priced per
                // roll tells you nothing until you know what is on the roll.
                Text(spool.costPerKilo.map { Money.figure($0) } ?? "—")
                    .foregroundStyle(.secondary)
                    .moneyStyle()
            }
            .width(min: 84, ideal: 104, max: 150)
            .alignment(.trailing)
        }
        .tableStyle(.inset(alternatesRowBackgrounds: true))
        // Double-click opens it, the way a Mac table opens anything.
        .contextMenu(forSelectionType: Spool.ID.self) { ids in
            if let id = ids.first, let spool = shop.spools.first(where: { $0.id == id }), shop.canMoveJobs {
                Button(shop.words.callIt("mac.edit_spool")) { shop.editingSpool = spool }
                Button(shop.words.callIt("common.delete"), role: .destructive) {
                    Task { await shop.deleteSpool(id) }
                }
            }
        } primaryAction: { ids in
            guard shop.canMoveJobs, let id = ids.first else { return }
            shop.editingSpool = shop.spools.first { $0.id == id }
        }
        .overlay {
            if shop.spools.isEmpty {
                ContentUnavailableView(shop.words.callIt("mac.no_stock"),
                                       systemImage: "shippingbox",
                                       description: Text(shop.words.callIt("mac.no_stock_hint")))
            }
        }
        .toolbar {
            ToolbarItem {
                Button(shop.words.callIt("mac.new_spool"), systemImage: "plus") {
                    shop.addingSpool = true
                }
                .disabled(!shop.canMoveJobs)
            }
        }
    }
}
