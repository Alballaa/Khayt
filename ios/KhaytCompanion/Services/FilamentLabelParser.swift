import Foundation

/// Parsed fields from a spool QR/barcode or label text.
struct ParsedFilamentLabel: Sendable {
    var rawText: String
    var materialType: String?
    var brand: String?
    var colorName: String?
    var sku: String?
    var lot: String?
    var weightGrams: Int?
    var printTemp: Int?
    var bedTemp: Int?

    var materialLine: String {
        [brand, materialType, colorName].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    var suggestedMaterial: String {
        let line = materialLine
        return line.isEmpty ? rawText.trimmingCharacters(in: .whitespacesAndNewlines) : line
    }
}

enum FilamentLabelParser {
    static func parse(text: String) -> ParsedFilamentLabel {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        var result = ParsedFilamentLabel(rawText: t)

        for (type, pattern) in materialPatterns {
            if matches(pattern, in: t) { result.materialType = type; break }
        }
        for (brand, pattern) in brandPatterns {
            if matches(pattern, in: t) { result.brand = brand; break }
        }
        for (color, pattern) in colorPatterns {
            if matches(pattern, in: t) { result.colorName = color; break }
        }

        result.sku = extractSKU(from: t)
        result.lot = extractLot(from: t)
        result.weightGrams = extractWeightGrams(from: t)
        let temps = extractTemperatures(from: t)
        result.printTemp = temps.print
        result.bedTemp = temps.bed

        return result
    }

    // MARK: - Extraction

    private static func extractSKU(from text: String) -> String? {
        let patterns = [
            #"(?i)(?:sku|ref(?:erence)?|art(?:icle)?|item|eancode|gtin)[\s.#:*-]*([A-Z0-9][A-Z0-9._\-/]{2,})"#,
            #"(?i)\b([A-Z]{2,4}-[A-Z0-9]{3,})\b"#
        ]
        for p in patterns {
            if let v = firstCapture(p, in: text) { return v }
        }
        return nil
    }

    private static func extractLot(from text: String) -> String? {
        let patterns = [
            #"(?i)(?:lot|batch|bn|charge|los|partie|batch\s*no)[\s.#:*-]*([A-Za-z0-9][A-Za-z0-9._\-/]{1,})"#,
            #"(?i)(?:دفعة|تشغيلة)\s*[:#]?\s*([A-Za-z0-9\-]+)"#
        ]
        for p in patterns {
            if let v = firstCapture(p, in: text) { return v }
        }
        return nil
    }

    private static func extractWeightGrams(from text: String) -> Int? {
        if let g = firstCapture(#"(?i)(\d{3,4})\s*(?:g|gram|grams|غرام|جرام)\b"#, in: text), let n = Int(g) { return n }
        if let kg = firstCapture(#"(?i)([\d.]+)\s*kg\b"#, in: text), let d = Double(kg) { return Int(d * 1000) }
        return nil
    }

    private static func extractTemperatures(from text: String) -> (print: Int?, bed: Int?) {
        // Combined 215/60, 215-60, or 215°C / 60°C
        if let m = regexFirst(#"(?i)(\d{2,3})\s*[/\-]\s*(\d{2,3})"#, in: text), m.count >= 2,
           let p = Int(m[0]), let b = Int(m[1]), p >= 150, b <= 120 { return (p, b) }
        if let m = regexFirst(#"(?i)(\d{2,3})\s*[/\-]\s*(\d{2,3})\s*°"#, in: text), m.count >= 2,
           let p = Int(m[0]), let b = Int(m[1]) { return (p, b) }

        var printT: Int?
        var bedT: Int?
        let printPatterns = [
            #"(?i)(?:print|nozzle|extruder|druck|hotend|طباعة|رأس)\s*[:=]?\s*(\d{2,3})\s*°?"#,
            #"(?i)(\d{2,3})\s*°?\s*c\s*(?:print|nozzle)"#
        ]
        let bedPatterns = [
            #"(?i)(?:bed|plate|heated|bett|lit|سرير|سطح)\s*[:=]?\s*(\d{2,3})\s*°?"#,
            #"(?i)bed\s*(\d{2,3})"#
        ]
        for p in printPatterns { if let v = firstCapture(p, in: text), let n = Int(v) { printT = n; break } }
        for p in bedPatterns { if let v = firstCapture(p, in: text), let n = Int(v) { bedT = n; break } }
        return (printT, bedT)
    }

    // MARK: - Patterns (EN + DE + FR + ES + AR transliterations on labels)

    private static let materialPatterns: [(String, String)] = [
        ("PLA-CF", #"(?i)pla[\s\-+]?cf"#),
        ("PETG-CF", #"(?i)petg[\s\-+]?cf"#),
        ("PA-CF", #"(?i)pa[\s\-+]?cf|nylon[\s\-+]?cf"#),
        ("PETG", #"(?i)\bpetg\b"#),
        ("TPU", #"(?i)\btpu\b|\btpe\b"#),
        ("ASA", #"(?i)\basa\b"#),
        ("ABS", #"(?i)\babs\b"#),
        ("Nylon", #"(?i)\bnylon\b|\bpa\s*6\b|\bpa6\b|\bpa12\b"#),
        ("HIPS", #"(?i)\bhips\b"#),
        ("PVA", #"(?i)\bpva\b"#),
        ("PLA", #"(?i)\bpla\b"#),
    ]

    private static let brandPatterns: [(String, String)] = [
        ("Bambu Lab", #"(?i)bambu|bambulab"#),
        ("eSun", #"(?i)esun|e-sun"#),
        ("Polymaker", #"(?i)polymaker|poly maker"#),
        ("Creality", #"(?i)creality"#),
        ("SUNLU", #"(?i)sunlu"#),
        ("Prusament", #"(?i)prusament|prusa"#),
        ("Hatchbox", #"(?i)hatchbox"#),
        ("Overture", #"(?i)overture"#),
        ("Fillamentum", #"(?i)fillamentum"#),
        ("ColorFabb", #"(?i)colorfabb|color fabb"#),
    ]

    private static let colorPatterns: [(String, String)] = [
        ("White", #"(?i)\bwhite\b|\bwei[sß]\b|\bblanc\b|\bblanco\b|\bbianco\b|\bأبيض\b|\bابيض\b"#),
        ("Black", #"(?i)\bblack\b|\bschwarz\b|\bnoir\b|\bnegro\b|\bnero\b|\bأسود\b|\bاسود\b"#),
        ("Red", #"(?i)\bred\b|\brot\b|\brouge\b|\brojo\b|\brosso\b|\bأحمر\b|\bاحمر\b"#),
        ("Orange", #"(?i)\borange\b|\bnaranja\b|\barancione\b|\bبرتقالي\b"#),
        ("Yellow", #"(?i)\byellow\b|\bgelb\b|\bjaune\b|\bamarillo\b|\bgiallo\b|\bأصفر\b|\bاصفر\b"#),
        ("Green", #"(?i)\bgreen\b|\bgr[uü]n\b|\bvert\b|\bverde\b|\bأخضر\b|\bاخضر\b"#),
        ("Blue", #"(?i)\bblue\b|\bblau\b|\bbleu\b|\bazul\b|\bblu\b|\bأزرق\b|\bازرق\b"#),
        ("Purple", #"(?i)\bpurple\b|\bviolet\b|\blila\b|\bviola\b|\bبنفسجي\b|\bموف\b"#),
        ("Pink", #"(?i)\bpink\b|\brosa\b|\brose\b|\bوردي\b|\bزهري\b"#),
        ("Gray", #"(?i)\bgr[ae]y\b|\bgrau\b|\bgris\b|\bرمادي\b|\bرصاصي\b"#),
        ("Brown", #"(?i)\bbrown\b|\bbraun\b|\bmarron\b|\bmarr[oó]n\b|\bبني\b"#),
        ("Gold", #"(?i)\bgold\b|\bdorado\b|\bذهبي\b"#),
        ("Silver", #"(?i)\bsilver\b|\bsilber\b|\bargent\b|\bفضي\b"#),
        ("Clear", #"(?i)\bclear\b|\btransparent\b|\bklar\b|\bشفاف\b"#),
        ("Natural", #"(?i)\bnatural\b|\bnatur\b|\bطبيعي\b"#),
    ]

    private static func matches(_ pattern: String, in text: String) -> Bool {
        regexFirst(pattern, in: text) != nil
    }

    private static func firstCapture(_ pattern: String, in text: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else { return nil }
        let range = NSRange(text.startIndex..., in: text)
        guard let m = regex.firstMatch(in: text, options: [], range: range), m.numberOfRanges > 1,
              let r = Range(m.range(at: 1), in: text) else { return nil }
        return String(text[r]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func regexFirst(_ pattern: String, in text: String) -> [String]? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return nil }
        let range = NSRange(text.startIndex..., in: text)
        guard let m = regex.firstMatch(in: text, options: [], range: range) else { return nil }
        return (0..<m.numberOfRanges).compactMap { i -> String? in
            guard let r = Range(m.range(at: i), in: text), i > 0 else { return nil }
            return String(text[r])
        }
    }
}
