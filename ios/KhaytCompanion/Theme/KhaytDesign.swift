import SwiftUI

/// Khayt Studio design tokens — aligned with `design/khayt/ds.css`.
enum KhaytDesign {
    // Backgrounds
    static let bg = Color(hex: 0x0B0D12)
    static let bg2 = Color(hex: 0x0F1218)
    static let surface = Color(hex: 0x14181F)
    static let surface2 = Color(hex: 0x1A1F28)
    static let surface3 = Color(hex: 0x20262F)

    // Text
    static let text = Color(hex: 0xEEF1F6)
    static let textDim = Color(hex: 0xA4ADBB)
    static let textMuted = Color(hex: 0x6C7689)
    static let textFaint = Color(hex: 0x4A5366)

    // Accent — hsl(187 76% 53%)
    static let accent = Color(hue: 187 / 360, saturation: 0.76, brightness: 0.58)
    static let accentSoft = accent.opacity(0.14)
    static let accentLine = accent.opacity(0.45)

    // Semantic
    static let ok = Color(hex: 0x3FB87F)
    static let okSoft = ok.opacity(0.14)
    static let warn = Color(hex: 0xE0A93C)
    static let warnSoft = warn.opacity(0.14)
    static let danger = Color(hex: 0xE5544B)
    static let dangerSoft = danger.opacity(0.14)
    static let info = Color(hex: 0x5B9CF0)
    static let infoSoft = info.opacity(0.14)
    static let violet = Color(hex: 0x9A86F5)
    static let violetSoft = violet.opacity(0.14)

    static let border = Color.white.opacity(0.07)
    static let hairline = Color.white.opacity(0.05)

    static let radiusSM: CGFloat = 7
    static let radiusMD: CGFloat = 10
    static let radiusLG: CGFloat = 14
    static let radiusXL: CGFloat = 20

    static let pad: CGFloat = 16

    static func statusColor(for status: String) -> Color {
        switch status.lowercased() {
        case "pending": return info
        case "printing": return ok
        case "post": return violet
        case "qc": return accent
        case "completed": return ok.opacity(0.85)
        case "on_hold": return textMuted
        case "idle", "ready": return ok
        case "busy": return warn
        case "error": return danger
        default: return textDim
        }
    }

    static func statusSoft(for status: String) -> Color {
        statusColor(for: status).opacity(0.14)
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

/// Full-screen Khayt background with subtle accent glow.
struct KhaytScreenBackground: View {
    var body: some View {
        ZStack {
            KhaytDesign.bg.ignoresSafeArea()
            RadialGradient(
                colors: [KhaytDesign.accent.opacity(0.12), .clear],
                center: .topLeading,
                startRadius: 20,
                endRadius: 420
            )
            .ignoresSafeArea()
        }
    }
}

/// Studio card surface.
struct KhaytCard<Content: View>: View {
    var padding: CGFloat = KhaytDesign.pad
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(KhaytDesign.surface, in: RoundedRectangle(cornerRadius: KhaytDesign.radiusLG))
            .overlay(
                RoundedRectangle(cornerRadius: KhaytDesign.radiusLG)
                    .stroke(KhaytDesign.border, lineWidth: 1)
            )
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
    var color: Color = KhaytDesign.accent
    var body: some View {
        Text(text)
            .font(.caption.bold())
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .foregroundStyle(color)
            .background(color.opacity(0.14), in: Capsule())
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
            .foregroundStyle(Color(hex: 0x04181C))
            .background(KhaytDesign.accent, in: RoundedRectangle(cornerRadius: KhaytDesign.radiusMD))
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
                .overlay(
                    RoundedRectangle(cornerRadius: KhaytDesign.radiusSM)
                        .stroke(KhaytDesign.border, lineWidth: 1)
                )
        }
    }
}

struct KhaytThreadDivider: View {
    var body: some View {
        Rectangle()
            .fill(
                LinearGradient(
                    colors: [.clear, KhaytDesign.accentLine, .clear],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .frame(height: 1)
            .opacity(0.6)
    }
}

struct KhaytLogoMark: View {
    var size: CGFloat = 32
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28)
                .fill(
                    RadialGradient(
                        colors: [KhaytDesign.accent.opacity(0.45), Color(hex: 0x0A1216)],
                        center: .bottom,
                        startRadius: 0,
                        endRadius: size
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: size * 0.28)
                        .stroke(KhaytDesign.accent.opacity(0.4), lineWidth: 1)
                )
            Text("خ")
                .font(.system(size: size * 0.55, weight: .semibold))
                .foregroundStyle(KhaytDesign.accent)
        }
        .frame(width: size, height: size)
    }
}
