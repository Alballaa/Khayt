import SwiftUI

/// Shared navigation chrome for inner screens.
extension View {
    func khaytScreen(title: String) -> some View {
        self
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(KhaytDesign.bg2, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .scrollContentBackground(.hidden)
            .background(Color.clear)
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
