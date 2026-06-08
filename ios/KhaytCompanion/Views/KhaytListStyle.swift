import SwiftUI

/// Shared navigation chrome for inner screens.
extension View {
    func khaytScreen(title: String) -> some View {
        self
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(KhaytDesign.navBg, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(KhaytDesign.isDark ? .dark : .light, for: .navigationBar)
            .scrollContentBackground(.hidden)
            .background(Color.clear)
    }

    func khaytInlineScreen(title: String) -> some View {
        self
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(KhaytDesign.navBg, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(KhaytDesign.isDark ? .dark : .light, for: .navigationBar)
    }

    func khaytForm() -> some View {
        self
            .scrollContentBackground(.hidden)
            .background(KhaytDesign.bg)
    }

    func khaytSheet() -> some View {
        self
            .scrollContentBackground(.hidden)
            .background(KhaytDesign.sheetBg)
    }

    func khaytPlainList() -> some View {
        self
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .environment(\.defaultMinListRowHeight, 56)
    }

    func khaytGroupedList() -> some View {
        self
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
    }

    func khaytSheetList() -> some View {
        self
            .khaytPlainList()
            .background(KhaytDesign.sheetBg)
    }

    func khaytListRows() -> some View {
        self
            .listRowBackground(KhaytDesign.surface)
            .listRowSeparatorTint(KhaytDesign.hairline)
    }
}

struct KhaytListRow<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var body: some View {
        content()
            .padding(.vertical, 10)
            .listRowBackground(KhaytDesign.surface)
            .listRowSeparatorTint(KhaytDesign.hairline)
    }
}

/// Hero icon used on scan/NFC/pairing steps.
struct KhaytHeroIcon: View {
    let systemName: String
    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: 52))
            .foregroundStyle(KhaytDesign.brand)
            .symbolRenderingMode(.hierarchical)
    }
}

/// Tappable method row (add spool, pairing checklist item).
struct KhaytMethodRow: View {
    let title: String
    let subtitle: String
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundStyle(KhaytDesign.brand)
                    .frame(width: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(KhaytDesign.text)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(KhaytDesign.textDim)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundStyle(KhaytDesign.textMuted)
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }
}

/// Status / feedback panel (pairing test result, offline note).
struct KhaytFeedbackPanel: View {
    enum Tone {
        case neutral, success, error, warning

        var color: Color {
            switch self {
            case .neutral: return KhaytDesign.textDim
            case .success: return KhaytDesign.ok
            case .error: return KhaytDesign.danger
            case .warning: return KhaytDesign.warn
            }
        }

        var icon: String {
            switch self {
            case .neutral: return "info.circle"
            case .success: return "checkmark.circle.fill"
            case .error: return "xmark.circle.fill"
            case .warning: return "exclamationmark.triangle.fill"
            }
        }
    }

    let tone: Tone
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: tone.icon)
                .foregroundStyle(tone.color)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(KhaytDesign.text)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(tone.color.opacity(KhaytDesign.isDark ? 0.12 : 0.08), in: RoundedRectangle(cornerRadius: KhaytDesign.radiusMD))
        .overlay(
            RoundedRectangle(cornerRadius: KhaytDesign.radiusMD)
                .stroke(tone.color.opacity(0.2), lineWidth: 1)
        )
    }
}
