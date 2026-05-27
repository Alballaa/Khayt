import SwiftUI

struct AddSpoolView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    var onSaved: () async -> Void

    @State private var material = "PLA"
    @State private var color = ""
    @State private var brand = ""
    @State private var weightTotal: Double = 1000
    @State private var weightRemaining: Double = 1000
    @State private var costPerKg: Double = 80
    @State private var isSaving = false
    @State private var error: String?

    private let materials = ["PLA", "PETG", "ABS", "ASA", "TPU", "Nylon", "PC", "Resin"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Material") {
                    Picker("Material", selection: $material) {
                        ForEach(materials, id: \.self) { Text($0).tag($0) }
                    }
                    TextField("Color", text: $color)
                    TextField("Brand", text: $brand)
                }

                Section("Weight (grams)") {
                    LabeledStepper(title: "Total", value: $weightTotal, range: 100...10000, step: 50)
                    LabeledStepper(title: "Remaining", value: $weightRemaining, range: 0...weightTotal, step: 50)
                }

                Section("Cost") {
                    HStack {
                        Text("Per kg")
                        Spacer()
                        TextField("SAR", value: $costPerKg, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 100)
                    }
                }

                if let error {
                    Section { Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red) }
                }
            }
            .navigationTitle("New Spool")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving { ProgressView() } else { Text("Save") }
                    }
                    .disabled(isSaving)
                }
            }
        }
    }

    private func save() async {
        guard let api = appState.api else { return }
        isSaving = true
        defer { isSaving = false }
        let payload = NewSpool(
            material: material,
            color: color,
            brand: brand,
            weightTotal: weightTotal,
            weightRemaining: weightRemaining,
            costPerKg: costPerKg
        )
        do {
            _ = try await api.addSpool(payload)
            await onSaved()
            dismiss()
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

struct LabeledStepper: View {
    let title: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    let step: Double

    var body: some View {
        VStack(alignment: .leading) {
            HStack {
                Text(title)
                Spacer()
                Text("\(Int(value)) g").monospacedDigit().foregroundStyle(.secondary)
            }
            Slider(value: $value, in: range, step: step)
        }
    }
}
