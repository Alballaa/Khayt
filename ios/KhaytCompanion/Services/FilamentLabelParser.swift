import Foundation

/// Parsed fields from a spool QR/barcode or label text — parity with `parseFilamentFromText` in inventory.js.
struct ParsedFilamentLabel: Sendable {
    var rawText: String
    var materialType: String?
    var brand: String?
    var colorName: String?

    var materialLine: String {
        [brand, materialType, colorName].compactMap { $0 }.joined(separator: " · ")
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
            if matches(pattern, in: t) {
                result.materialType = type
                break
            }
        }
        for (brand, pattern) in brandPatterns {
            if matches(pattern, in: t) {
                result.brand = brand
                break
            }
        }
        for (color, pattern) in colorPatterns {
            if matches(pattern, in: t) {
                result.colorName = color
                break
            }
        }
        return result
    }

    private static let materialPatterns: [(String, String)] = [
        ("PLA-CF", #"pla[\s\-]?cf"#),
        ("PETG-CF", #"petg[\s\-]?cf"#),
        ("PA-CF", #"pa[\s\-]?cf|nylon[\s\-]?cf"#),
        ("PETG", #"\bpetg\b"#),
        ("TPU", #"\btpu\b|\btpe\b"#),
        ("ASA", #"\basa\b"#),
        ("ABS", #"\babs\b"#),
        ("Nylon", #"\bnylon\b|\bpa\s*\d"#),
        ("HIPS", #"\bhips\b"#),
        ("PVA", #"\bpva\b"#),
        ("PLA", #"\bpla\b"#),
    ]

    private static let brandPatterns: [(String, String)] = [
        ("Bambu Lab", #"bambu"#),
        ("eSun", #"esun"#),
        ("Polymaker", #"polymaker"#),
        ("Creality", #"creality"#),
        ("SUNLU", #"sunlu"#),
        ("Prusament", #"prusament|prusa"#),
        ("Hatchbox", #"hatchbox"#),
        ("Overture", #"overture"#),
    ]

    private static let colorPatterns: [(String, String)] = [
        ("White", #"\bwhite\b"#),
        ("Black", #"\bblack\b"#),
        ("Red", #"\bred\b"#),
        ("Orange", #"\borange\b"#),
        ("Yellow", #"\byellow\b"#),
        ("Green", #"\bgreen\b"#),
        ("Blue", #"\bblue\b"#),
        ("Purple", #"\bpurple\b|\bviolet\b"#),
        ("Pink", #"\bpink\b"#),
        ("Gray", #"\bgray\b|\bgrey\b"#),
        ("Brown", #"\bbrown\b"#),
        ("Gold", #"\bgold\b"#),
        ("Silver", #"\bsilver\b"#),
        ("Clear", #"\bclear\b|\btransparent\b"#),
        ("Natural", #"\bnatural\b"#),
    ]

    private static func matches(_ pattern: String, in text: String) -> Bool {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return false }
        let range = NSRange(text.startIndex..., in: text)
        return regex.firstMatch(in: text, options: [], range: range) != nil
    }
}
