import Foundation

/// In-progress spool before POST to desktop inventory.
struct SpoolDraft: Sendable {
    var material: String = ""
    var weightGrams: Int = 1000
    var brand: String = ""
    var colorHex: String = "#888888"
    var sku: String = ""
    var lot: String = ""
    var printTemp: String = ""
    var bedTemp: String = ""
    var sourceNote: String = ""

    static func from(parsed: ParsedFilamentLabel) -> SpoolDraft {
        var d = SpoolDraft()
        d.material = parsed.suggestedMaterial
        d.brand = parsed.brand ?? ""
        if let w = parsed.weightGrams { d.weightGrams = w }
        if let p = parsed.printTemp { d.printTemp = String(p) }
        if let b = parsed.bedTemp { d.bedTemp = String(b) }
        d.sku = parsed.sku ?? ""
        d.lot = parsed.lot ?? ""
        d.sourceNote = "Scanned label"
        return d
    }

    static func from(tag: NFCFilamentTag) -> SpoolDraft {
        var d = SpoolDraft()
        d.material = tag.materialLabel.isEmpty ? (tag.material ?? "Filament") : tag.materialLabel
        d.brand = tag.manufacturer ?? ""
        if let w = tag.weight { d.weightGrams = w }
        if let hex = tag.hex { d.colorHex = hex }
        if let p = tag.printTemp { d.printTemp = String(p) }
        if let b = tag.bedTemp { d.bedTemp = String(b) }
        d.sku = tag.sku ?? ""
        d.lot = tag.lot ?? ""
        d.sourceNote = tag.standard
        return d
    }
}
