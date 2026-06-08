import SwiftUI

// MARK: - Appearance

enum AppAppearance: String, CaseIterable, Identifiable {
    case light
    case dark
    case system

    var id: String { rawValue }

    var label: String {
        switch self {
        case .light: return L10n.tr("settings.appearance.light")
        case .dark: return L10n.tr("settings.appearance.dark")
        case .system: return L10n.tr("settings.appearance.system")
        }
    }

    var preferredColorScheme: ColorScheme? {
        switch self {
        case .light: return .light
        case .dark: return .dark
        case .system: return nil
        }
    }
}

// MARK: - Palette (`khayt-design.jsx` LIGHT_TOKENS / DARK_TOKENS)

struct KhaytPalette {
    let bg: Color
    let bg2: Color
    let surface: Color
    let surface2: Color
    let surface3: Color
    let text: Color
    let textDim: Color
    let textMuted: Color
    let textFaint: Color
    let brand: Color
    let accentSoft: Color
    let accentText: Color
    let ok: Color
    let okSoft: Color
    let warn: Color
    let warnSoft: Color
    let danger: Color
    let dangerSoft: Color
    let orange: Color
    let orangeSoft: Color
    let info: Color
    let infoSoft: Color
    let violet: Color
    let violetSoft: Color
    let border: Color
    let hairline: Color
    let sep: Color
    let tabBg: Color
    let navBg: Color
    let sheetBg: Color
    let isDark: Bool

    static let light = KhaytPalette(
        bg: Color(hex: 0xF2F2F7),
        bg2: Color(hex: 0xE9E9EF),
        surface: Color(hex: 0xFFFFFF),
        surface2: Color(hex: 0xF2F2F7),
        surface3: Color(hex: 0xE5E5EA),
        text: Color(hex: 0x000000),
        textDim: Color(hex: 0x3C3C43, alpha: 0.60),
        textMuted: Color(hex: 0x3C3C43, alpha: 0.32),
        textFaint: Color(hex: 0x3C3C43, alpha: 0.16),
        brand: Color(hex: 0x5856D6),
        accentSoft: Color(hex: 0x5856D6, alpha: 0.10),
        accentText: Color(hex: 0x4B49C4),
        ok: Color(hex: 0x34C759),
        okSoft: Color(hex: 0x34C759, alpha: 0.12),
        warn: Color(hex: 0xFF9500),
        warnSoft: Color(hex: 0xFF9500, alpha: 0.12),
        danger: Color(hex: 0xFF3B30),
        dangerSoft: Color(hex: 0xFF3B30, alpha: 0.12),
        orange: Color(hex: 0xFF9500),
        orangeSoft: Color(hex: 0xFF9500, alpha: 0.12),
        info: Color(hex: 0x8E8E93),
        infoSoft: Color(hex: 0x8E8E93, alpha: 0.12),
        violet: Color(hex: 0xAF52DE),
        violetSoft: Color(hex: 0xAF52DE, alpha: 0.12),
        border: Color(hex: 0x3C3C43, alpha: 0.12),
        hairline: Color(hex: 0x3C3C43, alpha: 0.12),
        sep: Color(hex: 0x3C3C43, alpha: 0.12),
        tabBg: Color(hex: 0xF8F8FC, alpha: 0.94),
        navBg: Color(hex: 0xF2F2F7, alpha: 0.94),
        sheetBg: Color(hex: 0xF2F2F7),
        isDark: false
    )

    static let dark = KhaytPalette(
        bg: Color(hex: 0x0C0C0F),
        bg2: Color(hex: 0x141418),
        surface: Color(hex: 0x1C1C26),
        surface2: Color(hex: 0x25252F),
        surface3: Color(hex: 0x2E2E3B),
        text: Color(hex: 0xFFFFFF),
        textDim: Color.white.opacity(0.60),
        textMuted: Color.white.opacity(0.32),
        textFaint: Color.white.opacity(0.16),
        brand: Color(hex: 0x8183FF),
        accentSoft: Color(hex: 0x8183FF, alpha: 0.16),
        accentText: Color(hex: 0xA5A8FF),
        ok: Color(hex: 0x32D74B),
        okSoft: Color(hex: 0x32D74B, alpha: 0.16),
        warn: Color(hex: 0xFFD60A),
        warnSoft: Color(hex: 0xFFD60A, alpha: 0.16),
        danger: Color(hex: 0xFF453A),
        dangerSoft: Color(hex: 0xFF453A, alpha: 0.16),
        orange: Color(hex: 0xFF9F0A),
        orangeSoft: Color(hex: 0xFF9F0A, alpha: 0.16),
        info: Color(hex: 0x8E8E93),
        infoSoft: Color(hex: 0x8E8E93, alpha: 0.16),
        violet: Color(hex: 0xBF5AF2),
        violetSoft: Color(hex: 0xBF5AF2, alpha: 0.16),
        border: Color.white.opacity(0.08),
        hairline: Color.white.opacity(0.08),
        sep: Color.white.opacity(0.08),
        tabBg: Color(hex: 0x0A0A0E, alpha: 0.94),
        navBg: Color(hex: 0x0C0C10, alpha: 0.92),
        sheetBg: Color(hex: 0x1E1E28),
        isDark: true
    )
}

/// Design tokens — resolves from the active palette (light default).
enum KhaytDesign {
    private(set) static var current: KhaytPalette = .light

    static func apply(appearance: AppAppearance, systemColorScheme: ColorScheme) {
        switch appearance {
        case .light: current = .light
        case .dark: current = .dark
        case .system: current = systemColorScheme == .dark ? .dark : .light
        }
    }

    static var bg: Color { current.bg }
    static var bg2: Color { current.bg2 }
    static var surface: Color { current.surface }
    static var surface2: Color { current.surface2 }
    static var surface3: Color { current.surface3 }
    static var text: Color { current.text }
    static var textDim: Color { current.textDim }
    static var textMuted: Color { current.textMuted }
    static var textFaint: Color { current.textFaint }
    static var brand: Color { current.brand }
    static var accent: Color { current.brand }
    static var accentSoft: Color { current.accentSoft }
    static var brandDim: Color { current.accentSoft }
    static var accentText: Color { current.accentText }
    static var accentLine: Color { current.brand.opacity(0.45) }
    static var ok: Color { current.ok }
    static var okSoft: Color { current.okSoft }
    static var warn: Color { current.warn }
    static var warnSoft: Color { current.warnSoft }
    static var danger: Color { current.danger }
    static var dangerSoft: Color { current.dangerSoft }
    static var orange: Color { current.orange }
    static var orangeSoft: Color { current.orangeSoft }
    static var info: Color { current.info }
    static var infoSoft: Color { current.infoSoft }
    static var violet: Color { current.violet }
    static var violetSoft: Color { current.violetSoft }
    static var border: Color { current.border }
    static var hairline: Color { current.hairline }
    static var sep: Color { current.sep }
    static var tabBg: Color { current.tabBg }
    static var navBg: Color { current.navBg }
    static var sheetBg: Color { current.sheetBg }
    static var isDark: Bool { current.isDark }

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
        statusColor(for: status).opacity(current.isDark ? 0.16 : 0.12)
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

/// Applies palette when appearance or system theme changes.
struct KhaytAppearanceModifier: ViewModifier {
    @ObservedObject var settings: ConnectionSettings
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content
            .preferredColorScheme(settings.appAppearance.preferredColorScheme)
            .onAppear { KhaytDesign.apply(appearance: settings.appAppearance, systemColorScheme: colorScheme) }
            .onChange(of: settings.appAppearance) { _, _ in
                KhaytDesign.apply(appearance: settings.appAppearance, systemColorScheme: colorScheme)
            }
            .onChange(of: colorScheme) { _, scheme in
                KhaytDesign.apply(appearance: settings.appAppearance, systemColorScheme: scheme)
            }
    }
}

extension View {
    func khaytAppearance(_ settings: ConnectionSettings) -> some View {
        modifier(KhaytAppearanceModifier(settings: settings))
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
            .background(color.opacity(KhaytDesign.isDark ? 0.16 : 0.12), in: Capsule())
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
