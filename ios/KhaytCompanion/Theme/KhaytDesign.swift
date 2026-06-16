import SwiftUI

/// Design tokens from `design/iOS UI/khayt-design.jsx` (DARK_TOKENS).
enum KhaytDesign {
    // Backgrounds
    static let bg = Color(hex: 0x0C0C0F)
    static let bg2 = Color(hex: 0x141418)
    static let surface = Color(hex: 0x1C1C26)
    static let surface2 = Color(hex: 0x25252F)
    static let surface3 = Color(hex: 0x2E2E3B)

    // Labels
    static let text = Color(hex: 0xFFFFFF)
    static let textDim = Color.white.opacity(0.60)
    static let textMuted = Color.white.opacity(0.32)
    static let textFaint = Color.white.opacity(0.16)

    // Brand / accent (mockup default #8183FF)
    static let brand = Color(hex: 0x8183FF)
    static let accent = brand
    static let accentSoft = brand.opacity(0.16)
    static let brandDim = accentSoft
    static let accentText = Color(hex: 0xA5A8FF)
    static let accentLine = brand.opacity(0.45)

    // Semantic
    static let ok = Color(hex: 0x32D74B)
    static let okSoft = ok.opacity(0.16)
    static let warn = Color(hex: 0xFFD60A)
    static let warnSoft = warn.opacity(0.16)
    static let danger = Color(hex: 0xFF453A)
    static let dangerSoft = danger.opacity(0.16)
    static let orange = Color(hex: 0xFF9F0A)
    static let orangeSoft = orange.opacity(0.16)
    static let info = Color(hex: 0x8E8E93)
    static let infoSoft = info.opacity(0.16)
    static let violet = Color(hex: 0xBF5AF2)
    static let violetSoft = violet.opacity(0.16)

    static let border = Color.white.opacity(0.08)
    static let hairline = Color.white.opacity(0.08)
    static let sep = border

    static let tabBg = Color(hex: 0x0A0A0E).opacity(0.94)
    static let navBg = Color(hex: 0x0C0C10).opacity(0.92)
    static let sheetBg = Color(hex: 0x1E1E28)

    static let radiusSM: CGFloat = 10
    static let radiusMD: CGFloat = 12
    static let radiusLG: CGFloat = 16
    static let radiusXL: CGFloat = 22

    static let pad: CGFloat = 16

    static func statusColor(for status: String) -> Color {
        switch status.lowercased() {
        case "pending": return info
        case "printing": return brand
        case "post": return violet
        case "qc": return warn
        case "completed": return ok
        case "on_hold": return textMuted
        case "idle", "ready": return ok
        case "busy": return orange
        case "error": return danger
        default: return textDim
        }
    }

    static func statusSoft(for status: String) -> Color {
        statusColor(for: status).opacity(0.16)
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

/// Full-screen background (flat; mockup has no accent glow).
struct KhaytScreenBackground: View {
    var body: some View {
        KhaytDesign.bg.ignoresSafeArea()
    }
}

/// Card surface — `khayt-design.jsx` Card (radius 16, no border).
struct KhaytCard<Content: View>: View {
    var padding: CGFloat = KhaytDesign.pad
    var bordered: Bool = false
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(KhaytDesign.surface, in: RoundedRectangle(cornerRadius: KhaytDesign.radiusLG))
            .overlay {
                if bordered {
                    RoundedRectangle(cornerRadius: KhaytDesign.radiusLG)
                        .stroke(KhaytDesign.border, lineWidth: 1)
                }
            }
    }
}

/// Home stat tile — `khayt-home.jsx` StatBlock.
struct KhaytStatBlock: View {
    let value: String
    let label: String
    let color: Color
    var subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.system(size: 42, weight: .bold))
                .foregroundStyle(color)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(KhaytDesign.textDim)
            if let subtitle {
                Text(subtitle)
                    .font(.system(size: 10))
                    .foregroundStyle(KhaytDesign.textMuted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(KhaytDesign.surface, in: RoundedRectangle(cornerRadius: KhaytDesign.radiusLG))
    }
}

/// Section header — `SectionLabel` in mockup.
struct KhaytSectionHeader: View {
    let text: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        HStack {
            Text(L10n.usesArabicLayout ? text : text.uppercased())
                .font(.system(size: 12, weight: .semibold))
                .tracking(0.7)
                .foregroundStyle(KhaytDesign.textDim)
            Spacer()
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(KhaytDesign.brand)
            }
        }
        .padding(.horizontal, KhaytDesign.pad)
    }
}

struct KhaytEyebrow: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 10.5, weight: .bold))
            .tracking(1.3)
            .foregroundStyle(KhaytDesign.textMuted)
    }
}

struct KhaytSectionTitle: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(KhaytDesign.text)
    }
}

struct KhaytMetric: View {
    let value: String
    let unit: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(value)
                .font(.system(size: 28, weight: .medium, design: .rounded))
                .foregroundStyle(KhaytDesign.text)
            if let unit {
                Text(unit)
                    .font(.system(size: 13, weight: .medium, design: .rounded))
                    .foregroundStyle(KhaytDesign.textMuted)
            }
        }
    }
}

struct KhaytPill: View {
    let text: String
    var color: Color = KhaytDesign.brand
    var body: some View {
        Text(text)
            .font(.caption.bold())
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .foregroundStyle(color)
            .background(color.opacity(0.16), in: Capsule())
    }
}

struct KhaytPrimaryButton: View {
    let title: String
    let icon: String?
    let action: () -> Void

    init(_ title: String, icon: String? = nil, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let icon { Image(systemName: icon) }
                Text(title).fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .foregroundStyle(.white)
            .background(KhaytDesign.brand, in: RoundedRectangle(cornerRadius: KhaytDesign.radiusMD))
        }
    }
}

struct KhaytGhostButton: View {
    let title: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(KhaytDesign.textDim)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(KhaytDesign.surface2, in: RoundedRectangle(cornerRadius: KhaytDesign.radiusSM))
        }
    }
}

struct KhaytThreadDivider: View {
    var body: some View {
        Rectangle()
            .fill(KhaytDesign.sep)
            .frame(height: 0.5)
    }
}

struct KhaytLogoMark: View {
    var size: CGFloat = 32
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28)
                .fill(KhaytDesign.brandDim)
                .overlay(
                    RoundedRectangle(cornerRadius: size * 0.28)
                        .stroke(KhaytDesign.brand.opacity(0.35), lineWidth: 1)
                )
            Text("خ")
                .font(.system(size: size * 0.55, weight: .semibold))
                .foregroundStyle(KhaytDesign.brand)
        }
        .frame(width: size, height: size)
    }
}
