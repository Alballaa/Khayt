import SwiftUI

/// Shared navigation chrome for inner screens.
extension View {
    func khaytScreen(title: String) -> some View {
        self
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.large)
            .scrollContentBackground(.hidden)
            .background(KhaytDesign.bg.ignoresSafeArea())
    }
}

/// Inline search field — a native-looking replacement for `.searchable`, which
/// segfaults when combined with toolbar appearance inside the app's nested
/// NavigationStack-in-TabView layout.
struct KhaytSearchField: View {
    @Binding var text: String
    var prompt: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(KhaytDesign.textMuted)
            TextField(prompt, text: $text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .foregroundStyle(KhaytDesign.text)
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(KhaytDesign.textMuted)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(KhaytDesign.surface2, in: RoundedRectangle(cornerRadius: 11))
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
